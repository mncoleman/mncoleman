/**
 * OAuth 2.1 authorization server for the authenticated MCP endpoint
 * (https://mncoleman.com/mcp/admin, served by `worker-mcp/`).
 *
 * It lives in the admin Worker because this is where sign-in, the user records
 * and JWT_SECRET already are; `worker-mcp/` stays secret-free and only forwards
 * the caller's bearer token back here.
 *
 * Flow (MCP authorization spec: RFC 9728 -> RFC 8414 -> RFC 7591 -> PKCE):
 *   1. the client registers itself            POST /oauth/register
 *   2. the browser lands on                   GET  /oauth/authorize
 *      - not signed in: the normal Telegram / Google sign-in, then back here
 *      - signed in: a consent page, ALWAYS (a registered client is anonymous,
 *        so an existing session must never approve one silently)
 *   3. the approval mints a 60-second code    POST /oauth/authorize
 *   4. the client redeems it                  POST /oauth/token
 *
 * What a token is:
 *   - access token: a 1-hour HS256 JWT, `purpose: 'mcp'`, `aud` = the MCP
 *     endpoint, naming a grant. It is signed with a key DERIVED from JWT_SECRET
 *     (`mcpSigningKey`), never JWT_SECRET itself, so it cannot verify as an
 *     admin-panel session and a session cannot verify as one of these. The
 *     Worker's gate accepts it only on the routes in `mcpRouteAllowed`, only
 *     while the grant still exists, and still re-reads the person's KV record
 *     on every request.
 *   - refresh token: opaque, stored only as a hash on the grant, rotated on use.
 *   - grant: one "connected app" for one person. Deleting it is the kill switch.
 *
 * Everything here is reachable without the Origin / X-Requested-With gate the
 * rest of the Worker sits behind, because MCP clients cannot send that header.
 * So nothing in this file may act on a cookie alone: the consent POST carries
 * an HMAC bound to the session and the exact request it approves.
 *
 * `npx tsx worker/mcp-oauth.selftest.ts` exercises it against an in-memory KV.
 */

export const MCP_PURPOSE = 'mcp';
export const MCP_CODE_PURPOSE = 'mcp-code';

const ACCESS_TTL = 60 * 60;
const CODE_TTL = 60;
const CONSENT_TTL = 10 * 60;
const GRANT_TTL = 60 * 60 * 24 * 90;
/** A registration is a signed token, not a stored record, so it needs an end date of its own. */
const CLIENT_TTL = 60 * 60 * 24 * 365;
const CLIENT_PURPOSE = 'mcp-client';
/** How long the refresh token before the latest one is still honoured (a KV read can lag a write by a minute). */
const REFRESH_GRACE_MS = 5 * 60 * 1000;
/** Connections one person may hold. The oldest is dropped past this, so nobody can pile up records. */
const MAX_GRANTS_PER_USER = 10;
const ID_RE = /^[A-Za-z0-9_-]{10,64}$/;
const RETURN_COOKIE = 'mcp_oauth';
const MAX_QUERY = 3500;

/** The session-JWT fields the Worker's gate reads. Carried on the grant and on every access token. */
export interface McpIdentity {
    id: string;
    name: string;
    username?: string;
    email?: string;
    provider?: string;
}

/**
 * A registered client. Registration is open to the internet, so it stores
 * NOTHING: the client_id is itself a signed token carrying these fields, and
 * the first KV write happens only when a signed-in admin approves a connection.
 */
export interface McpClient {
    client_id: string;
    client_name: string;
    redirect_uris: string[];
}

export interface McpGrant {
    id: string;
    /** KV user id ('owner' for the owner): who to list this connection under. */
    userId: string;
    identity: McpIdentity;
    /** SHA-256 of the client_id (which is a long signed token). */
    clientId: string;
    clientName: string;
    refreshHash: string;
    /** The hash before the last rotation, honoured for REFRESH_GRACE_MS after `rotatedAt`. */
    prevRefreshHash?: string;
    rotatedAt?: number;
    createdAt: string;
    lastUsedAt: string;
}

export interface KvLike {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list(opts: { prefix: string; cursor?: string; limit?: number }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

export interface OAuthDeps {
    kv: KvLike;
    /** `mcpSigningKey(JWT_SECRET)`. Never JWT_SECRET itself. */
    secret: string;
    /** The signed-in admin behind this request's `admin_token` cookie, re-checked against KV, or null. */
    currentSession(request: Request): Promise<{ identity: McpIdentity; userId: string; role: string } | null>;
    rateLimit(key: string, max: number, windowMs: number): boolean;
    /** The MCP endpoint these tokens are for (RFC 8707). It becomes their `aud`. */
    resource: string;
}

/* ------------------------------ primitives ------------------------------ */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64url(bytes: Uint8Array): string {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(str: string): Uint8Array {
    let s = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function hmac(data: string, secret: string): Promise<string> {
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}

async function sha256(data: string): Promise<string> {
    return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(data))));
}

function randomToken(bytes: number): string {
    const a = new Uint8Array(bytes);
    crypto.getRandomValues(a);
    return b64url(a);
}

const now = () => Math.floor(Date.now() / 1000);

/**
 * The key every token and code in this file is signed with. Derived, so there
 * is no second secret to rotate, and distinct, so nothing signed here can pass
 * a check made with JWT_SECRET (and the reverse).
 */
export const mcpSigningKey = (jwtSecret: string) => hmac('mncoleman-mcp-oauth-v1', jwtSecret);

async function signToken(claims: Record<string, unknown>, ttl: number, secret: string): Promise<string> {
    const iat = now();
    const h = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
    const p = b64url(enc.encode(JSON.stringify({ ...claims, iat, exp: iat + ttl })));
    return `${h}.${p}.${await hmac(`${h}.${p}`, secret)}`;
}

/** Signature, expiry, `purpose` and `aud` all have to match. Returns the claims or null; never throws. */
async function verifyToken(token: string, purpose: string, audience: string, secret: string): Promise<Record<string, any> | null> {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    if (!timingSafeEqual(parts[2], await hmac(`${parts[0]}.${parts[1]}`, secret))) return null;
    let claims: Record<string, any>;
    try {
        if (JSON.parse(dec.decode(unb64url(parts[0]))).alg !== 'HS256') return null;
        claims = JSON.parse(dec.decode(unb64url(parts[1])));
    } catch { return null; }
    if (!claims || typeof claims !== 'object' || typeof claims.exp !== 'number' || claims.exp < now()) return null;
    if (claims.purpose !== purpose || claims.aud !== audience) return null;
    return claims;
}

const grantKey = (id: string) => `mcp:grant:${id}`;
const usedKey = (jti: string) => `mcp:used:${jti}`;

async function readJson<T>(kv: KvLike, key: string): Promise<T | null> {
    const raw = await kv.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
}

/* ------------------------------- validation ------------------------------ */

/**
 * Registration is open to anyone and a client's name is whatever it says, so
 * the return address is what is pinned: Claude's hosted callback, this site's
 * own inspector page, or plain http on the loopback interface (Claude Code and
 * other local clients). To let another client in, add its exact callback here. A link that
 * talks someone into approving "Claude" can then only ever hand the code to
 * Claude itself or to a program already running on their own machine.
 */
const HOSTED_CALLBACKS = [
    'https://claude.ai/api/mcp/auth_callback',
    'https://claude.com/api/mcp/auth_callback',
    // The site's own MCP Wire Inspector artifact, which signs in from the browser to test this
    // server. It is our origin and our page, so a code sent there never leaves the site. Pages
    // serves it without the extension; the .html form is listed for a copy opened that way.
    'https://mncoleman.com/artifacts/mcp-wire-inspector',
    'https://mncoleman.com/artifacts/mcp-wire-inspector.html',
];
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

function loopback(raw: string): URL | null {
    let u: URL;
    try { u = new URL(raw); } catch { return null; }
    return u.protocol === 'http:' && LOOPBACK_HOSTS.includes(u.hostname) && !u.hash && !u.username && !u.password ? u : null;
}

export function validRedirectUri(raw: unknown): raw is string {
    // 200, not more: five of them have to fit inside a client_id that is itself under 1500 characters.
    if (typeof raw !== 'string' || raw.length > 200) return false;
    return HOSTED_CALLBACKS.includes(raw) || !!loopback(raw);
}

/** Exact match, except that a loopback callback may come back on any port (RFC 8252 7.3). */
export function redirectMatches(registered: string[], requested: string): boolean {
    if (registered.includes(requested)) return true;
    const want = loopback(requested);
    if (!want) return false;
    return registered.some((r) => {
        const have = loopback(r);
        return !!have && have.hostname === want.hostname && have.pathname === want.pathname && have.search === want.search;
    });
}

const sameResource = (a: string, b: string) => a.replace(/\/+$/, '') === b.replace(/\/+$/, '');

interface AuthorizeParams {
    client: McpClient;
    redirectUri: string;
    state: string;
    challenge: string;
}

/**
 * Checks an authorize request. `page` errors are shown to the person and never
 * redirected (the redirect target itself is what failed); `redirect` errors go
 * back to the client, whose redirect URI is by then known to be its own.
 */
async function readClient(clientId: string, resource: string, secret: string): Promise<McpClient | null> {
    const claims = clientId.length <= 1500 ? await verifyToken(clientId, CLIENT_PURPOSE, resource, secret) : null;
    if (!claims || !Array.isArray(claims.uris) || !claims.uris.every(validRedirectUri)) return null;
    return { client_id: clientId, client_name: String(claims.name || 'Unnamed app'), redirect_uris: claims.uris };
}

async function parseAuthorize(q: URLSearchParams, resource: string, secret: string): Promise<
    { ok: true; params: AuthorizeParams } | { ok: false; page: string } | { ok: false; redirect: string }
> {
    const client = await readClient(q.get('client_id') || '', resource, secret);
    if (!client) return { ok: false, page: 'This app is not registered here, or its registration expired. Remove the connection in your client and add it again.' };
    const redirectUri = q.get('redirect_uri') || '';
    if (!validRedirectUri(redirectUri) || !redirectMatches(client.redirect_uris, redirectUri)) {
        return { ok: false, page: 'The return address in this request is not one the app registered.' };
    }

    const state = q.get('state') || '';
    const back = (error: string, description: string) => {
        const u = new URL(redirectUri);
        u.searchParams.set('error', error);
        u.searchParams.set('error_description', description);
        if (state) u.searchParams.set('state', state);
        return { ok: false as const, redirect: u.toString() };
    };
    if (q.get('response_type') !== 'code') return back('unsupported_response_type', 'response_type must be code');
    const challenge = q.get('code_challenge') || '';
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge) || q.get('code_challenge_method') !== 'S256') {
        return back('invalid_request', 'PKCE with code_challenge_method=S256 is required');
    }
    const wanted = q.get('resource');
    if (wanted && !sameResource(wanted, resource)) return back('invalid_target', `These tokens are only issued for ${resource}`);
    return { ok: true, params: { client, redirectUri, state, challenge } };
}

/* --------------------------------- pages -------------------------------- */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const PAGE_HEADERS: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    // No form-action: Chrome applies it to the redirect that follows the consent
    // POST, which would block the hop back to the client.
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'",
};

function page(title: string, body: string, status = 200, extra: [string, string][] = []): Response {
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)} · mncoleman.com</title><style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;background:#0a0a0a;color:#fafafa;font:15px/1.55 Roboto,system-ui,-apple-system,"Segoe UI",sans-serif}
main{width:100%;max-width:420px;border:1px solid #262626;border-radius:14px;background:#111;padding:28px}
h1{margin:0 0 6px;font-size:19px;font-weight:600;letter-spacing:-.01em}
p{margin:0 0 14px;color:#a3a3a3}b{color:#fafafa;font-weight:500}
ul{margin:0 0 18px;padding:12px 14px 12px 30px;border:1px solid #262626;border-radius:10px;color:#d4d4d4}li{margin:3px 0}
code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;color:#d4d4d4;word-break:break-all}
.row{display:flex;gap:10px;margin-top:20px}
a.btn,button{flex:1;display:block;text-align:center;height:42px;line-height:40px;padding:0 16px;border-radius:9px;border:1px solid #262626;background:transparent;color:#fafafa;font:inherit;font-weight:500;text-decoration:none;cursor:pointer}
a.btn:hover,button:hover{background:#1a1a1a}
.primary{background:#fafafa;color:#0a0a0a;border-color:#fafafa}.primary:hover{background:#e5e5e5}
.small{margin:16px 0 0;font-size:13px;color:#737373}
</style></head><body><main>${body}</main></body></html>`;
    const headers = new Headers(PAGE_HEADERS);
    for (const [k, v] of extra) headers.append(k, v);
    return new Response(html, { status, headers });
}

const errorPage = (message: string, status = 400) => page('Cannot connect', `<h1>Cannot connect</h1><p>${esc(message)}</p>`, status);

function cookie(request: Request, name: string): string | null {
    for (const part of (request.headers.get('Cookie') || '').split(';')) {
        const t = part.trim();
        const eq = t.indexOf('=');
        if (eq > 0 && t.slice(0, eq) === name) return t.slice(eq + 1);
    }
    return null;
}

const clearReturnCookie = `${RETURN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/** Marks a sign-in that was started from the "Sign in to connect" page: `/auth/login?return=oauth`. */
export const RETURN_PARAM = 'oauth';

/**
 * The authorize request a sign-in should come back to, as a path on THIS origin
 * (never a URL taken from the cookie), or null. The login handlers call this
 * only for a sign-in started with `?return=oauth` and carry the result inside
 * their own signed, state-bound cookie, so an ordinary admin-panel sign-in is
 * never diverted by a connection somebody abandoned a minute earlier.
 */
export function oauthReturnPath(request: Request): string | null {
    const raw = cookie(request, RETURN_COOKIE);
    if (!raw) return null;
    try {
        const query = dec.decode(unb64url(raw));
        if (!query || query.length > MAX_QUERY || !new URLSearchParams(query).get('client_id')) return null;
        return `/oauth/authorize?${query}`;
    } catch {
        return null;
    }
}

/** A signed login cookie's `returnTo` is honoured only if it is one of ours. */
export const isOAuthReturn = (path: unknown): path is string => typeof path === 'string' && path.startsWith('/oauth/authorize?') && path.length < MAX_QUERY + 32;

/* -------------------------------- handlers ------------------------------- */

const JSON_CORS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
};

const jsonOut = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Pragma: 'no-cache', ...JSON_CORS, ...extra },
    });

const oauthError = (error: string, description: string, status = 400) => jsonOut({ error, error_description: description }, status);

export function authorizationServerMetadata(origin: string) {
    return {
        issuer: origin,
        authorization_endpoint: `${origin}/oauth/authorize`,
        token_endpoint: `${origin}/oauth/token`,
        registration_endpoint: `${origin}/oauth/register`,
        response_types_supported: ['code'],
        response_modes_supported: ['query'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none'],
        scopes_supported: ['admin'],
        authorization_response_iss_parameter_supported: true,
    };
}

async function register(request: Request, deps: OAuthDeps): Promise<Response> {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!deps.rateLimit(`mcp-register:${ip}`, 10, 60_000)) return oauthError('rate_limited', 'Too many registrations. Try again in a minute.', 429);
    const text = await request.text();
    let body: any = null;
    try { body = text.length <= 8192 ? JSON.parse(text) : null; } catch { /* invalid below */ }
    if (!body || typeof body !== 'object') return oauthError('invalid_client_metadata', 'Body must be a JSON object');
    const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
    if (uris.length < 1 || uris.length > 5 || !uris.every(validRedirectUri)) {
        return oauthError('invalid_redirect_uri', "redirect_uris must be 1-5 of: Claude's hosted callback, the mncoleman.com MCP Wire Inspector, or http on localhost");
    }
    const name = (typeof body.client_name === 'string' ? body.client_name : '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'Unnamed app';
    const client: McpClient = {
        client_id: await signToken({ purpose: CLIENT_PURPOSE, aud: deps.resource, name, uris }, CLIENT_TTL, deps.secret),
        client_name: name,
        redirect_uris: uris as string[],
    };
    return jsonOut({
        client_id: client.client_id,
        client_id_issued_at: now(),
        client_name: client.client_name,
        redirect_uris: client.redirect_uris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
    }, 201);
}

const consentMac = (sessionId: string, query: string, exp: number, secret: string) => hmac(`mcp-consent|${sessionId}|${exp}|${query}`, secret);

async function authorizeGet(request: Request, url: URL, deps: OAuthDeps): Promise<Response> {
    const query = url.searchParams.toString();
    if (query.length > MAX_QUERY) return errorPage('This request is too long to be a sign-in request.');
    const parsed = await parseAuthorize(url.searchParams, deps.resource, deps.secret);
    if (!parsed.ok) return 'page' in parsed ? errorPage(parsed.page) : Response.redirect(parsed.redirect, 302);
    const { client, redirectUri } = parsed.params;

    const session = await deps.currentSession(request);
    if (!session) {
        // Remember the request across the sign-in. Only the query string is kept; the
        // callback rebuilds the URL on this origin and this handler validates it again.
        const keep = `${RETURN_COOKIE}=${b64url(enc.encode(query))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${CONSENT_TTL}`;
        return page('Sign in', `
<h1>Sign in to connect</h1>
<p><b>${esc(client.client_name)}</b> wants to use your mncoleman.com admin access. Sign in the way you do for the admin panel.</p>
<div class="row"><a class="btn primary" href="/auth/login?return=${RETURN_PARAM}">Telegram</a><a class="btn" href="/auth/google/login?return=${RETURN_PARAM}">Google</a></div>
<p class="small">Only people already invited to the admin panel can connect.</p>`, 200, [['Set-Cookie', keep]]);
    }

    const exp = now() + CONSENT_TTL;
    const mac = await consentMac(session.identity.id, query, exp, deps.secret);
    const who = session.identity.name || session.identity.username || 'Admin';
    return page('Connect an app', `
<h1>Connect ${esc(client.client_name)}?</h1>
<p>Signed in as <b>${esc(who)}</b>. This app will be able to act as you on mncoleman.com:</p>
<ul><li>upload, list, edit and delete instant artifacts</li><li>create and edit AI library prompts and skills</li><li>create and edit blog post drafts (it cannot publish)</li></ul>
<p>Limited to what your account may do. It will return to<br><code>${esc(new URL(redirectUri).origin)}</code></p>
<p><b>Only connect if you just added this connector yourself.</b> If someone sent you this link, cancel: approving would give their Claude your access.</p>
<form method="post" action="/oauth/authorize">
<input type="hidden" name="q" value="${esc(query)}"><input type="hidden" name="exp" value="${exp}"><input type="hidden" name="mac" value="${esc(mac)}">
<div class="row"><button name="decision" value="deny">Cancel</button><button class="primary" name="decision" value="approve">Connect</button></div>
</form>
<p class="small">You can disconnect it any time from the admin panel, under Connected apps.</p>`, 200, [['Set-Cookie', clearReturnCookie]]);
}

async function authorizePost(request: Request, url: URL, deps: OAuthDeps): Promise<Response> {
    // Refuse a post that names another site as its source. `Origin: null` is NOT that: the consent
    // page is served with `Referrer-Policy: no-referrer`, and browsers then send a null Origin on
    // its own form post. The HMAC below (bound to the session and the exact request) is what
    // actually proves the approval came from our page; these headers are an early extra check.
    const origin = request.headers.get('Origin');
    const site = request.headers.get('Sec-Fetch-Site');
    if ((origin && origin !== 'null' && origin !== url.origin) || site === 'cross-site') return errorPage('This approval did not come from the consent page.', 403);
    const text = await request.text();
    if (text.length > MAX_QUERY * 2) return errorPage('This approval is malformed.');
    const form = new URLSearchParams(text);
    const query = form.get('q') || '';
    const exp = parseInt(form.get('exp') || '0', 10);
    const mac = form.get('mac') || '';

    const session = await deps.currentSession(request);
    if (!session) return errorPage('Your session ended. Start the connection again from your client.', 401);
    if (!exp || exp < now() || !timingSafeEqual(mac, await consentMac(session.identity.id, query, exp, deps.secret))) {
        return errorPage('This approval expired. Start the connection again from your client.', 403);
    }
    const parsed = await parseAuthorize(new URLSearchParams(query), deps.resource, deps.secret);
    if (!parsed.ok) return 'page' in parsed ? errorPage(parsed.page) : Response.redirect(parsed.redirect, 302);
    const { client, redirectUri, state, challenge } = parsed.params;

    const back = new URL(redirectUri);
    if (state) back.searchParams.set('state', state);
    back.searchParams.set('iss', url.origin);
    if (form.get('decision') !== 'approve') {
        back.searchParams.set('error', 'access_denied');
    } else {
        back.searchParams.set('code', await signToken({
            purpose: MCP_CODE_PURPOSE, aud: deps.resource, jti: randomToken(12),
            cid: await sha256(client.client_id), cname: client.client_name, ru: redirectUri, cc: challenge,
            uid: session.userId, identity: session.identity,
        }, CODE_TTL, deps.secret));
    }
    return new Response(null, { status: 302, headers: { Location: back.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
}

async function issueTokens(grant: McpGrant, deps: OAuthDeps): Promise<Response> {
    const refreshSecret = randomToken(32);
    const next: McpGrant = {
        ...grant,
        prevRefreshHash: grant.refreshHash || undefined,
        rotatedAt: Date.now(),
        refreshHash: await sha256(refreshSecret),
        lastUsedAt: new Date().toISOString(),
    };
    await deps.kv.put(grantKey(grant.id), JSON.stringify(next), { expirationTtl: GRANT_TTL });
    const access = await signToken({ ...grant.identity, purpose: MCP_PURPOSE, aud: deps.resource, gid: grant.id }, ACCESS_TTL, deps.secret);
    return jsonOut({
        access_token: access,
        token_type: 'Bearer',
        expires_in: ACCESS_TTL,
        refresh_token: `${grant.id}.${refreshSecret}`,
        scope: 'admin',
    });
}

async function token(request: Request, deps: OAuthDeps): Promise<Response> {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!deps.rateLimit(`mcp-token:${ip}`, 60, 60_000)) return oauthError('rate_limited', 'Too many token requests. Try again in a minute.', 429);
    const text = await request.text();
    if (text.length > 16_384) return oauthError('invalid_request', 'Request too large');
    let form: URLSearchParams;
    if ((request.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
        let obj: any = null;
        try { obj = JSON.parse(text); } catch { /* invalid below */ }
        if (!obj || typeof obj !== 'object') return oauthError('invalid_request', 'Invalid JSON');
        form = new URLSearchParams(Object.entries(obj).filter(([, v]) => typeof v === 'string') as [string, string][]);
    } else {
        form = new URLSearchParams(text);
    }
    const clientId = await sha256(form.get('client_id') || '');
    const grantType = form.get('grant_type');
    const wanted = form.get('resource');
    if (wanted && !sameResource(wanted, deps.resource)) return oauthError('invalid_target', `These tokens are only issued for ${deps.resource}`);

    if (grantType === 'authorization_code') {
        const claims = await verifyToken(form.get('code') || '', MCP_CODE_PURPOSE, deps.resource, deps.secret);
        if (!claims || claims.cid !== clientId || claims.ru !== (form.get('redirect_uri') || '')) {
            return oauthError('invalid_grant', 'The authorization code is invalid, expired, or was issued to another client');
        }
        const verifier = form.get('code_verifier') || '';
        if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !timingSafeEqual(await sha256(verifier), claims.cc)) {
            return oauthError('invalid_grant', 'PKCE verification failed');
        }
        // Single use. PKCE is what actually stops a stolen code; this stops an honest replay.
        if (await deps.kv.get(usedKey(claims.jti))) return oauthError('invalid_grant', 'The authorization code was already used');
        await deps.kv.put(usedKey(claims.jti), '1', { expirationTtl: 120 });

        // One person holds a bounded number of connections: past the cap the stalest goes.
        const mine = await listGrants(deps.kv, String(claims.uid));
        for (const old of mine.slice(MAX_GRANTS_PER_USER - 1)) await deps.kv.delete(grantKey(old.id));
        const stamp = new Date().toISOString();
        return issueTokens({
            id: randomToken(16), userId: String(claims.uid), identity: claims.identity as McpIdentity,
            clientId, clientName: String(claims.cname || 'Unnamed app'), refreshHash: '', createdAt: stamp, lastUsedAt: stamp,
        }, deps);
    }

    if (grantType === 'refresh_token') {
        const raw = form.get('refresh_token') || '';
        const dot = raw.indexOf('.');
        const gone = () => oauthError('invalid_grant', 'The refresh token is invalid or the connection was removed');
        const grantId = dot > 0 ? raw.slice(0, dot) : '';
        const grant = ID_RE.test(grantId) ? await readJson<McpGrant>(deps.kv, grantKey(grantId)) : null;
        if (!grant || grant.clientId !== clientId) return gone();
        const hash = await sha256(raw.slice(dot + 1));
        if (timingSafeEqual(hash, grant.refreshHash)) return issueTokens(grant, deps);
        if (grant.prevRefreshHash && timingSafeEqual(hash, grant.prevRefreshHash)) {
            if (Date.now() - (grant.rotatedAt || 0) <= REFRESH_GRACE_MS) return issueTokens(grant, deps);
            // A superseded refresh token, long after it was replaced: two parties hold this
            // connection's tokens and one of them should not. End it; the owner reconnects.
            await deps.kv.delete(grantKey(grant.id));
        }
        return gone();
    }

    return oauthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
}

const META_PATHS = ['/.well-known/oauth-authorization-server', '/.well-known/openid-configuration'];

/** The paths `handleOAuth` owns. `/oauth/whoami` is not one: it is an ordinary authenticated route. */
export const isOAuthPath = (path: string) =>
    path === '/oauth/authorize' || path === '/oauth/token' || path === '/oauth/register' || META_PATHS.includes(path);

/**
 * Serves the OAuth endpoints. Returns null for any other path, so the caller
 * falls through to the rest of the Worker.
 */
export async function handleOAuth(request: Request, url: URL, deps: OAuthDeps): Promise<Response | null> {
    const path = url.pathname;
    if (!isOAuthPath(path)) return null;
    const isMeta = META_PATHS.includes(path);

    if (path === '/oauth/authorize') {
        if (request.method === 'GET') return authorizeGet(request, url, deps);
        if (request.method === 'POST') return authorizePost(request, url, deps);
        return errorPage('Method not allowed', 405);
    }

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: JSON_CORS });
    if (isMeta) {
        if (request.method !== 'GET') return oauthError('invalid_request', 'Method not allowed', 405);
        return new Response(JSON.stringify(authorizationServerMetadata(url.origin)), {
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...JSON_CORS },
        });
    }
    if (path === '/oauth/register' && request.method === 'POST') return register(request, deps);
    if (path === '/oauth/token' && request.method === 'POST') return token(request, deps);
    return oauthError('invalid_request', 'Method not allowed', 405);
}

/* --------------------------- the resource side --------------------------- */

/**
 * Reads an MCP access token: signature, expiry, purpose, audience, and that its
 * grant still exists for the same person. The caller still has to re-check the
 * person against KV; this only answers "is this connection still live".
 */
export async function readMcpToken(tokenStr: string, deps: Pick<OAuthDeps, 'kv' | 'secret' | 'resource'>): Promise<{ claims: Record<string, any>; grant: McpGrant } | null> {
    const { kv } = deps;
    const claims = await verifyToken(tokenStr, MCP_PURPOSE, deps.resource, deps.secret);
    if (!claims || typeof claims.gid !== 'string') return null;
    const grant = await readJson<McpGrant>(kv, grantKey(claims.gid));
    if (!grant || grant.identity.id !== claims.id) return null;
    return { claims, grant };
}

/**
 * The only routes an MCP token may reach. Everything the MCP tools do goes
 * through one of these; anything else (users, publish, rebuild, analytics,
 * static artifacts that commit to git) answers 403 for an MCP token whatever
 * the person's role is.
 */
export function mcpRouteAllowed(method: string, path: string, contentType: string): boolean {
    const slug = '[a-z0-9-]{1,100}';
    const is = (re: string) => new RegExp(`^${re}$`).test(path);
    if (method === 'GET') {
        return path === '/oauth/whoami' || path === '/api/artifacts/instant/list' || path === '/api/posts' || is(`/api/posts/${slug}`);
    }
    // Multipart is the instant-artifact path. The JSON form of this route can commit a file to the repo.
    if (method === 'POST' && path === '/api/artifacts') return contentType.toLowerCase().startsWith('multipart/form-data');
    if (method === 'PATCH' || method === 'DELETE') {
        if (is(`/api/artifacts/instant/${slug}`)) return true;
    }
    if (method === 'POST' && path === '/api/library') return true;
    if (method === 'PATCH' && is(`/api/library/${slug}`)) return true;
    if (method === 'PUT' && is(`/api/posts/${slug}/draft`)) return true;
    // The daily brief: publish (replace) or delete one edition. Hiding and the section's visibility stay in the admin panel.
    if ((method === 'PUT' || method === 'DELETE') && is('/api/briefs/\\d{4}-\\d{2}-\\d{2}')) return true;
    return false;
}

/* ------------------------------ connections ------------------------------ */

export interface McpConnection {
    id: string;
    userId: string;
    who: string;
    app: string;
    createdAt: string;
    lastUsedAt: string;
}

/** Every live connection, or only one person's. */
export async function listGrants(kv: KvLike, onlyUserId?: string): Promise<McpConnection[]> {
    const out: McpConnection[] = [];
    let cursor: string | undefined;
    do {
        const listed = await kv.list({ prefix: 'mcp:grant:', cursor, limit: 1000 });
        for (const k of listed.keys) {
            const g = await readJson<McpGrant>(kv, k.name);
            if (!g || (onlyUserId && g.userId !== onlyUserId)) continue;
            out.push({ id: g.id, userId: g.userId, who: g.identity.name || g.identity.username || g.userId, app: g.clientName, createdAt: g.createdAt, lastUsedAt: g.lastUsedAt });
        }
        cursor = listed.list_complete ? undefined : listed.cursor;
    } while (cursor && out.length < 200);
    return out.sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt));
}

/** Removes a connection. With `onlyUserId`, only if it belongs to that person. Returns whether one was removed. */
export async function revokeGrant(kv: KvLike, id: string, onlyUserId?: string): Promise<boolean> {
    if (!ID_RE.test(id)) return false;
    const g = await readJson<McpGrant>(kv, grantKey(id));
    if (!g || (onlyUserId && g.userId !== onlyUserId)) return false;
    await kv.delete(grantKey(id));
    return true;
}

/** Drops every connection a person has: called when they are removed from the admin panel. */
export async function revokeGrantsFor(kv: KvLike, userId: string): Promise<void> {
    for (const g of await listGrants(kv, userId)) await kv.delete(grantKey(g.id));
}
