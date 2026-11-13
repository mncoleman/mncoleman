import { lookupPage } from '../lib/citation-lookup';
import { classifyDraft } from '../lib/post-staging';
import {
    AVATAR_TYPES, MAX_AVATAR_BYTES, avatarMetaKey, captureLoginPhotos, isAvatarPin, isOpaqueTelegramUrl, isReservedUserId, isTelegramProxyUrl, parseMeta,
    pictureFromClaims, resolveAvatar, sanitizeTelegramUrl, uploadPhotoUrl, validateAvatarUpload,
    type AvatarMeta, type AvatarState,
} from '../lib/avatar';
import { coercePostDoc, parsePost, samePost, serializePost, isValidSlug, PostFormatError, type PostDoc } from '../lib/post-format';
import {
    RETURN_PARAM, handleOAuth, isOAuthPath, isOAuthReturn, listGrants, mcpRouteAllowed, mcpSigningKey, oauthReturnPath, readMcpToken, revokeGrant, revokeGrantsFor,
    type KvLike, type OAuthDeps,
} from './mcp-oauth';
import {
    BRIEF_CONFIG_KEY, BRIEF_INDEX_KEY, DEFAULT_BRIEF_CONFIG, briefHeadline, briefKey, cleanBriefLinks, isBriefDate, validateBrief,
    type BriefConfig, type BriefSummary,
} from '../lib/brief';

// Rate limiting store — persists within a Cloudflare Worker isolate
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(key);
    if (!entry || entry.resetAt <= now) {
        rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }
    if (entry.count >= maxAttempts) return false;
    entry.count++;
    return true;
}

export interface Env {
    TELEGRAM_BOT_ID: string;
    TELEGRAM_CLIENT_SECRET: string;
    JWT_SECRET: string;
    OWNER_SUB: string;              // Owner's OIDC sub — always allowed as super_admin
    BOT_TOKEN: string;              // Bot API token for user lookups
    FRONTEND_URL: string;
    GITHUB_TOKEN: string;
    GITHUB_REPO_OWNER: string;
    GITHUB_REPO_NAME: string;
    PAGES_DEPLOY_HOOK: string;      // Cloudflare Pages deploy hook URL — rebuilds mncoleman.com
    N8N_WEBHOOK_URL: string;
    ADMIN_USERS: KVNamespace;       // KV store for multi-user access
    ARTIFACTS_SERVICE_URL: string;  // e.g. https://artifacts.mncoleman.com
    ARTIFACTS_JWT_SECRET: string;   // Shared HS256 secret with the Oracle artifact service
    GA_PROPERTY_ID: string;         // GA4 numeric property id (not the G- measurement id)
    BUILD_TOKEN: string;            // Shared secret the Pages build sends to claim a deployment number
    GA_SA_CLIENT_EMAIL: string;     // Google service-account email, granted Viewer on the property
    GA_SA_PRIVATE_KEY: string;      // Service-account PKCS#8 private key (PEM)
    GOOGLE_CLIENT_ID: string;       // Same OAuth client app.mncoleman.com uses
    GOOGLE_CLIENT_SECRET: string;
    OWNER_EMAIL?: string;           // Owner's Google address — super_admin via Google sign-in
    POST_DRAFTS?: KVNamespace;      // Blog post autosave drafts (never committed). Optional: routes degrade to drafts_unavailable
    BRIEFS?: KVNamespace;           // Daily brief editions (content only; the pages are in the repo). Optional: routes answer briefs_unavailable
    MCP_RESOURCE_URL?: string;      // The authenticated MCP endpoint OAuth tokens are issued for (their `aud`)
}

/**
 * What a person can do in the admin panel.
 *
 *   super_admin  the owner (OWNER_SUB / OWNER_EMAIL), never stored in KV.
 *   site_admin   every feature, every artifact, and may set artifact
 *                visibility and passwords. Records written before roles
 *                existed say 'admin' and mean this.
 *   editor       only the `features` ticked for them, plus edit mode and
 *                Claude linking on the instant artifacts in `artifactGrants`.
 *                Never changes an artifact's visibility or password.
 */
type StoredRole = 'admin' | 'site_admin' | 'editor';
type SessionRole = 'super_admin' | 'site_admin' | 'editor';

/** The owner's byline on posts. The owner has no KV record to take a name from. */
const OWNER_DISPLAY_NAME = 'Matthew Coleman';
const FEATURES = ['artifacts', 'content', 'library', 'analytics', 'rebuild'] as const;
type Feature = typeof FEATURES[number];

/** Stored features minus any since retired (e.g. 'visitors'), so an old KV record still validates on save. */
function knownFeatures(features: string[] | undefined): Feature[] {
    return (features || []).filter((f): f is Feature => (FEATURES as readonly string[]).includes(f));
}

interface AdminUser {
    /**
     * The KV key (`user:<id>`). A Telegram username for Telegram invites —
     * which is also what every record written before email invites used, so
     * those have no `id` field and `username` stands in — or the lowercased
     * email address for people added by email.
     */
    id?: string;
    username: string;
    method?: 'telegram' | 'email';
    /** Lets this person sign in with Google. Required for email invites, optional for Telegram ones. */
    email?: string | null;
    sub: string | null;             // Telegram OIDC sub, once claimed
    googleSub?: string | null;      // Google OIDC sub, once claimed
    firstName: string | null;
    status: 'invited' | 'active';
    role: StoredRole;
    features?: Feature[];
    artifactGrants?: string[];
    invitedAt: string;
    claimedAt: string | null;
}

interface Session {
    valid: boolean;
    role: SessionRole;
    userId: string;                 // KV record id, or 'owner'
    features: Feature[];
    artifactGrants: string[];
}

/** Committed post files already read, by `slug@blobSha`. A blob sha is a content hash, so an entry can never be stale. Per isolate. */
const pendingFileCache = new Map<string, { sha: string; doc: PostDoc } | { sha: string; invalid: string }>();

export default {
    // Daily site rebuild so new Notion content goes live without a push.
    // Cron lives in wrangler.toml (06:00 UTC) — it replaced the GitHub Actions
    // `schedule:` trigger that shipped with the old GitHub Pages deploy.
    async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        ctx.waitUntil(
            triggerRebuild(env, 'cron').then((r) => {
                if (!r.ok) console.error('Scheduled rebuild failed:', JSON.stringify(r));
                else console.log('Scheduled rebuild triggered', event.cron);
            })
        );
    },

    async fetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
        // OAuth for the authenticated MCP endpoint (see mcp-oauth.ts). Dispatched ABOVE the
        // Origin allowlist and the X-Requested-With check below, preflight included: an MCP
        // client is not a page on mncoleman.com and cannot send that header. Nothing in there
        // acts on a cookie alone, and it returns null for every path that is not its own.
        try {
            const oauthUrl = new URL(request.url);
            const oauth = isOAuthPath(oauthUrl.pathname) ? await handleOAuth(request, oauthUrl, await mcpDeps(env)) : null;
            if (oauth) return oauth;
        } catch (e) {
            console.error('OAuth error:', e);
            return new Response(JSON.stringify({ error: 'server_error' }), { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
        }

        const allowedOrigins = ['https://mncoleman.com', 'https://www.mncoleman.com', 'http://localhost:3000'];
        const origin = request.headers.get('Origin');

        // Handle CORS preflight and standard headers
        const isAllowedOrigin = allowedOrigins.includes(origin || '');
        const activeOrigin = isAllowedOrigin ? origin! : '';

        const corsHeaders: Record<string, string> = {
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Build-Token',
            'Vary': 'Origin',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
        };

        // Only echo origin and credentials when the origin is explicitly allowed.
        if (activeOrigin) {
            corsHeaders['Access-Control-Allow-Origin'] = activeOrigin;
            corsHeaders['Access-Control-Allow-Credentials'] = 'true';
        }

        // Handle preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    ...corsHeaders,
                    'Access-Control-Max-Age': '86400',
                }
            });
        }

        try {
            // Block disallowed origins early for non-GET requests if origin exists
            if (origin && !isAllowedOrigin && request.method !== 'GET') {
                return new Response('CORS Origin Not Allowed', {
                    status: 403,
                    headers: corsHeaders
                });
            }

            // CSRF Protection: Check for custom header on all state-changing requests
            if (request.method !== 'GET' && request.method !== 'OPTIONS') {
                const csrfHeader = request.headers.get('X-Requested-With');
                if (csrfHeader !== 'mncoleman-admin') {
                    return new Response('Security Error: Potential CSRF attempt blocked', { status: 403, headers: corsHeaders });
                }
            }

            const url = new URL(request.url);

            // Health check
            if (url.pathname === '/') {
                return new Response('Admin Auth Worker Running', { status: 200, headers: corsHeaders });
            }

            // Login: redirect to Telegram OIDC with PKCE
            if (url.pathname === '/auth/login' && request.method === 'GET') {
                const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
                if (!checkRateLimit(`login:${ip}`, 10, 60_000)) {
                    return new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '60' } });
                }

                const codeVerifier = generateCodeVerifier();
                const codeChallenge = await generateCodeChallenge(codeVerifier);
                const state = crypto.randomUUID();

                // A sign-in started from the MCP "Sign in to connect" page goes back to that
                // authorize request afterwards, carried inside this signed cookie.
                const returnTo = url.searchParams.get('return') === RETURN_PARAM ? oauthReturnPath(request) : null;
                const oauthData = JSON.stringify({ codeVerifier, state, ...(returnTo ? { returnTo } : {}) });
                const signedCookie = await signOauthData(oauthData, env.JWT_SECRET);

                const redirectUri = `${url.origin}/auth/callback`;
                const params = new URLSearchParams({
                    client_id: env.TELEGRAM_BOT_ID,
                    scope: 'openid profile',
                    response_type: 'code',
                    redirect_uri: redirectUri,
                    state,
                    code_challenge: codeChallenge,
                    code_challenge_method: 'S256',
                });

                return new Response(null, {
                    status: 302,
                    headers: {
                        'Location': `https://oauth.telegram.org/auth?${params}`,
                        'Set-Cookie': `oauth_state=${signedCookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
                    },
                });
            }

            // OIDC callback: exchange code for tokens, verify, set session
            if (url.pathname === '/auth/callback' && request.method === 'GET') {
                const frontendAdmin = `${env.FRONTEND_URL || 'https://mncoleman.com'}/admin`;
                const code = url.searchParams.get('code');
                const state = url.searchParams.get('state');


                if (!code || !state) {
                    return Response.redirect(`${frontendAdmin}?auth_error=missing_params`, 302);
                }

                const oauthCookie = getCookieValue(request, 'oauth_state');

                if (!oauthCookie) {
                    return Response.redirect(`${frontendAdmin}?auth_error=expired_session`, 302);
                }

                const oauthData = await verifyOauthData(oauthCookie, env.JWT_SECRET);

                if (!oauthData || oauthData.state !== state) {
                    return Response.redirect(`${frontendAdmin}?auth_error=invalid_state`, 302);
                }

                // Exchange authorization code for tokens
                const redirectUri = `${url.origin}/auth/callback`;
                const tokenResponse = await fetch('https://oauth.telegram.org/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'authorization_code',
                        code,
                        redirect_uri: redirectUri,
                        client_id: env.TELEGRAM_BOT_ID,
                        client_secret: env.TELEGRAM_CLIENT_SECRET,
                        code_verifier: oauthData.codeVerifier,
                    }),
                });


                if (!tokenResponse.ok) {
                    const errText = await tokenResponse.text();
                    console.error('[callback] token exchange failed:', errText);
                    return Response.redirect(`${frontendAdmin}?auth_error=token_exchange_failed`, 302);
                }

                const tokens = await tokenResponse.json() as { id_token: string };


                // Verify ID token using Telegram's JWKS
                const idPayload = await verifyTelegramIdToken(tokens.id_token, env.TELEGRAM_BOT_ID);

                if (!idPayload) {
                    return Response.redirect(`${frontendAdmin}?auth_error=invalid_token`, 302);
                }

                // Resolve username from OIDC (Telegram may use either field)
                const tgUsername = idPayload.username || idPayload.preferred_username || '';

                // Check user authorization (owner, active user, or invited user claiming)
                const authResult = await checkUserAuthorization(
                    env, String(idPayload.sub), tgUsername, idPayload.first_name
                );
                if (!authResult.authorized) {
                    return Response.redirect(`${frontendAdmin}?auth_error=unauthorized`, 302);
                }

                // Remember the photo this sign-in revealed under the person's one avatar record.
                // Login never waits on an outside fetch: only the OIDC `picture` claim and a KV
                // read are used here, and a cold profile cache is filled after the redirect.
                try {
                    const avatarId = String(idPayload.sub) === env.OWNER_SUB ? 'owner' : await env.ADMIN_USERS.get(`sub:${idPayload.sub}`);
                    if (avatarId) {
                        const tgName = tgUsername.toLowerCase();
                        const kvl = kvLike(env.ADMIN_USERS);
                        const tgPhoto = pictureFromClaims('telegram', idPayload) || (tgName ? await cachedTelegramPhoto(env, tgName, undefined) : null);
                        await captureLoginPhotos(kvl, avatarId, { telegram: tgPhoto, telegramName: tgName });
                        if (!tgPhoto && tgName && ctx) {
                            ctx.waitUntil(
                                getCachedProfile(env, tgName, url.origin)
                                    .then((prof) => captureLoginPhotos(kvl, avatarId, { telegram: sanitizeTelegramUrl(prof?.photoUrl) }))
                                    .catch((e) => console.error('[callback] background photo lookup failed:', e)),
                            );
                        }
                    }
                } catch (e) { console.error('[callback] avatar capture failed:', e); }

                // Issue session JWT with role
                const name = idPayload.first_name || tgUsername || 'Admin';
                const sessionToken = await signJwt({
                    id: idPayload.sub, name, role: authResult.role, username: tgUsername
                }, env.JWT_SECRET);


                // Pass token via both cookie (desktop) and URL fragment (mobile fallback).
                // Back to an MCP authorize request instead, the token stays out of the URL.
                const headers = new Headers();
                headers.append('Location', isOAuthReturn(oauthData.returnTo) ? `${url.origin}${oauthData.returnTo}` : `${frontendAdmin}#session_token=${sessionToken}`);
                headers.append('Set-Cookie', 'oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
                headers.append('Set-Cookie', `admin_token=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${60 * 60 * 24 * 7}`);

                return new Response(null, { status: 302, headers });
            }

            // Google sign-in: the same OAuth client app.mncoleman.com uses. Invite-only:
            // the verified email must already be on a user record (or be OWNER_EMAIL).
            if (url.pathname === '/auth/google/login' && request.method === 'GET') {
                const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
                if (!checkRateLimit(`login:${ip}`, 10, 60_000)) {
                    return new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '60' } });
                }
                if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
                    return Response.redirect(`${env.FRONTEND_URL || 'https://mncoleman.com'}/admin?auth_error=google_not_configured`, 302);
                }
                const codeVerifier = generateCodeVerifier();
                const codeChallenge = await generateCodeChallenge(codeVerifier);
                const state = crypto.randomUUID();
                const nonce = crypto.randomUUID();
                const returnTo = url.searchParams.get('return') === RETURN_PARAM ? oauthReturnPath(request) : null;
                const signedCookie = await signOauthData(JSON.stringify({ codeVerifier, state, nonce, ...(returnTo ? { returnTo } : {}) }), env.JWT_SECRET);
                const params = new URLSearchParams({
                    client_id: env.GOOGLE_CLIENT_ID,
                    redirect_uri: `${url.origin}/auth/google/callback`,
                    response_type: 'code',
                    scope: 'openid email profile',
                    state,
                    nonce,
                    code_challenge: codeChallenge,
                    code_challenge_method: 'S256',
                    prompt: 'select_account',
                });
                return new Response(null, {
                    status: 302,
                    headers: {
                        'Location': `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
                        'Set-Cookie': `google_oauth_state=${signedCookie}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`,
                    },
                });
            }

            if (url.pathname === '/auth/google/callback' && request.method === 'GET') {
                const frontendAdmin = `${env.FRONTEND_URL || 'https://mncoleman.com'}/admin`;
                const code = url.searchParams.get('code');
                const state = url.searchParams.get('state');
                if (!code || !state) return Response.redirect(`${frontendAdmin}?auth_error=missing_params`, 302);

                const cookie = getCookieValue(request, 'google_oauth_state');
                if (!cookie) return Response.redirect(`${frontendAdmin}?auth_error=expired_session`, 302);
                const oauthData = await verifyOauthData(cookie, env.JWT_SECRET);
                if (!oauthData || oauthData.state !== state) {
                    return Response.redirect(`${frontendAdmin}?auth_error=invalid_state`, 302);
                }

                const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({
                        grant_type: 'authorization_code',
                        code,
                        redirect_uri: `${url.origin}/auth/google/callback`,
                        client_id: env.GOOGLE_CLIENT_ID,
                        client_secret: env.GOOGLE_CLIENT_SECRET,
                        code_verifier: oauthData.codeVerifier,
                    }),
                });
                if (!tokenResponse.ok) {
                    console.error('[google callback] token exchange failed:', await tokenResponse.text());
                    return Response.redirect(`${frontendAdmin}?auth_error=token_exchange_failed`, 302);
                }
                const tokens = await tokenResponse.json() as { id_token?: string };
                const idPayload = tokens.id_token
                    ? await verifyGoogleIdToken(tokens.id_token, env.GOOGLE_CLIENT_ID)
                    : null;
                // email_verified gates everything: an unverified address proves nothing
                // about who is signing in, and the email is the invite.
                if (!idPayload || idPayload.nonce !== oauthData.nonce || idPayload.email_verified !== true || !idPayload.email) {
                    return Response.redirect(`${frontendAdmin}?auth_error=invalid_token`, 302);
                }

                const email = String(idPayload.email).toLowerCase();
                const googleSub = String(idPayload.sub);
                const authResult = await checkGoogleAuthorization(env, googleSub, email, idPayload.given_name || null);
                if (!authResult.authorized) {
                    return Response.redirect(`${frontendAdmin}?auth_error=unauthorized`, 302);
                }

                // Remember the Google picture under the person's one avatar record ('owner' for
                // the owner, who is the same person whichever way they sign in).
                await captureLoginPhotos(kvLike(env.ADMIN_USERS), authResult.userId, { google: pictureFromClaims('google', idPayload) });

                const name = idPayload.given_name || idPayload.name || email;
                const sessionToken = await signJwt({
                    id: `g:${googleSub}`, name, role: authResult.role, username: authResult.userId, email, provider: 'google',
                }, env.JWT_SECRET);

                const headers = new Headers();
                headers.append('Location', isOAuthReturn(oauthData.returnTo) ? `${url.origin}${oauthData.returnTo}` : `${frontendAdmin}#session_token=${sessionToken}`);
                headers.append('Set-Cookie', 'google_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
                headers.append('Set-Cookie', `admin_token=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${60 * 60 * 24 * 7}`);
                return new Response(null, { status: 302, headers });
            }

            // Session check endpoint
            if (url.pathname === '/auth/me' && request.method === 'GET') {
                const token = getAuthToken(request);
                if (!token) return new Response('Not authenticated', { status: 401, headers: corsHeaders });

                const payload = await verifyJwt(token, env.JWT_SECRET);
                if (!payload) return new Response('Invalid session', { status: 401, headers: corsHeaders });

                // Same KV re-check as the authenticated block below — without it a removed
                // admin gets a 200 here and the panel renders while every action 401s.
                const session = await revalidateSession(env, payload);
                if (!session.valid) return new Response('Invalid session', { status: 401, headers: corsHeaders });

                // A KV hiccup must not 500 the admin panel over a profile photo.
                let avatar: AvatarState | null = null;
                try { avatar = await avatarStateFor(env, session.userId, sessionTelegramName(session.userId, payload), url.origin); } catch (e) { console.error('[auth/me] avatar lookup failed:', e); }
                return new Response(JSON.stringify({ user: {
                    name: payload.name, id: payload.id, role: session.role, username: payload.username,
                    email: payload.email || null, provider: payload.provider || 'telegram',
                    features: session.features, artifactGrants: session.artifactGrants,
                    photoUrl: avatar?.photoUrl ?? null, ...(avatar ? { avatar } : {}),
                } }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Logout endpoint
            if (url.pathname === '/auth/logout' && request.method === 'POST') {
                const cookie = `admin_token=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
                return new Response(JSON.stringify({ success: true }), {
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Set-Cookie': cookie
                    }
                });
            }

            // Telegram avatar proxy. The Bot API's file URL embeds BOT_TOKEN, so it must
            // never reach the browser inside an <img src>. Unauthenticated on purpose:
            // an <img> cannot send a bearer token and cross-site cookies are unreliable,
            // and these bytes are already public on t.me. It serves ONLY file_ids a
            // super_admin lookup already cached, so it cannot be used to probe arbitrary
            // usernames or drain the bot's API quota.
            if (url.pathname.startsWith('/api/avatar/') && request.method === 'GET') {
                const uname = decodeURIComponent(url.pathname.split('/').pop() || '').toLowerCase();
                if (!/^[a-z0-9_]{1,32}$/.test(uname)) {
                    return new Response('Not Found', { status: 404, headers: corsHeaders });
                }
                const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
                if (!checkRateLimit(`avatar:${ip}`, 60, 60_000)) {
                    return new Response('Too Many Requests', { status: 429, headers: { ...corsHeaders, 'Retry-After': '60' } });
                }

                const fileId = await env.ADMIN_USERS.get(`avatar:${uname}`);
                if (!fileId || !env.BOT_TOKEN) {
                    return new Response('Not Found', { status: 404, headers: corsHeaders });
                }

                // getFile paths expire after roughly an hour, so resolve one per request
                // instead of caching the resolved URL.
                const fileResp = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
                if (!fileResp.ok) {
                    return new Response('Not Found', { status: 404, headers: corsHeaders });
                }
                const fileData = await fileResp.json() as any;
                if (!fileData.ok || !fileData.result?.file_path) {
                    return new Response('Not Found', { status: 404, headers: corsHeaders });
                }

                const imgResp = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${fileData.result.file_path}`);
                if (!imgResp.ok) {
                    return new Response('Not Found', { status: 404, headers: corsHeaders });
                }
                return new Response(imgResp.body, {
                    status: 200,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': imgResp.headers.get('Content-Type') || 'image/jpeg',
                        'Cache-Control': 'private, max-age=3600',
                    },
                });
            }

            // Uploaded profile photos. Public on purpose, like the Telegram proxy above: an
            // <img> cannot send a bearer token. The path carries a random 128-bit token (not
            // an id, username or email), so a photo is reachable only by someone who was
            // shown its URL. Bytes were validated as PNG/JPEG/WebP on the way in and are
            // served with nosniff, a locked-down CSP and a content type taken from the
            // sniffed bytes, never from the request, so they cannot run as anything.
            if (url.pathname.startsWith('/api/avatar-upload/') && request.method === 'GET') {
                const token = url.pathname.slice('/api/avatar-upload/'.length);
                if (!/^[a-f0-9]{32}$/.test(token)) return new Response('Not Found', { status: 404, headers: corsHeaders });
                const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
                if (!checkRateLimit(`avatar-up-get:${ip}`, 120, 60_000)) {
                    return new Response('Too Many Requests', { status: 429, headers: { ...corsHeaders, 'Retry-After': '60' } });
                }
                const stored = await env.ADMIN_USERS.getWithMetadata<{ ct?: string }>(`avatar-upload:${token}`, 'arrayBuffer');
                const ct = stored.metadata?.ct;
                if (!stored.value || !ct || !(AVATAR_TYPES as readonly string[]).includes(ct)) {
                    return new Response('Not Found', { status: 404, headers: corsHeaders });
                }
                return new Response(stored.value, {
                    status: 200,
                    headers: {
                        ...corsHeaders,
                        'Content-Type': ct,
                        'Content-Length': String(stored.value.byteLength),
                        'X-Content-Type-Options': 'nosniff',
                        'Content-Security-Policy': "default-src 'none'; sandbox",
                        'Cross-Origin-Resource-Policy': 'cross-origin',
                        // 'immutable' is safe because a token's bytes are never rewritten: a new upload gets a
                        // new token. The flip side is that a browser may keep showing a deleted photo from
                        // its own cache for up to a year; the Worker stops serving it at once.
                        'Cache-Control': 'public, max-age=31536000, immutable',
                    },
                });
            }

            // ── Public: the site's own version and metrics ──────────────────────
            //
            // Both sit above the auth wall on purpose. Neither reads or writes
            // anything about a person: one hands out an ordinal, the other returns
            // averages the site already prints in its own footer.

            /**
             * Claims the next deployment number for a given day.
             *
             * The CalVer version is `YYYY.MM.DD.N`, and the build cannot work out N
             * for itself — a cron rebuild ships the same commit as the deploy before
             * it, so nothing in the repository distinguishes them. This is the only
             * piece of state that does.
             *
             * Guarded by a shared secret rather than left open: the cost of abuse is
             * only a silly version number, but a counter anyone can advance is not a
             * counter. KV has no compare-and-swap, so two builds inside the same
             * read-modify-write would collide — Pages serialises builds per project,
             * and a duplicate ordinal is cosmetic, so a lock would cost more than it
             * saves.
             */
            if (url.pathname === '/api/build/number' && request.method === 'POST') {
                if (!env.BUILD_TOKEN || request.headers.get('X-Build-Token') !== env.BUILD_TOKEN) {
                    return new Response(JSON.stringify({ error: 'unauthorized' }), {
                        status: 401,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                const body = (await request.json().catch(() => ({}))) as { date?: string };
                // Trust the build's own date only if it looks like one.
                const day = /^\d{4}-\d{2}-\d{2}$/.test(body.date || '')
                    ? body.date!
                    : new Date().toISOString().slice(0, 10);
                const key = `build:n:${day}`;
                const current = parseInt((await env.ADMIN_USERS.get(key)) || '0', 10) || 0;
                const next = current + 1;
                // Four days: long enough to survive clock skew or a late retry, short
                // enough that the namespace does not keep a key per day forever.
                await env.ADMIN_USERS.put(key, String(next), { expirationTtl: 345600 });
                return new Response(JSON.stringify({ date: day, n: next }), {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            /**
             * Coarse visitor averages for the site's own metrics dialog.
             *
             * Deliberately a separate endpoint rather than an unauthenticated mode of
             * `/api/analytics/summary`: that one returns top pages, traffic sources and
             * per-country breakdowns, none of which belong on a public URL. This
             * returns three averages and the window they came from.
             *
             * Cached for an hour — the GA4 Data API has a per-property quota, and a
             * 90-day average does not move within one.
             */
            if (url.pathname === '/api/stats/visitors' && request.method === 'GET') {
                if (!env.GA_PROPERTY_ID || !env.GA_SA_CLIENT_EMAIL || !env.GA_SA_PRIVATE_KEY) {
                    return new Response(JSON.stringify({ error: 'not_configured' }), {
                        status: 503,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                const cacheKey = 'public:visitors:90';
                const cached = await env.ADMIN_USERS.get(cacheKey);
                if (cached) {
                    return new Response(cached, {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800', 'X-Cache': 'HIT' },
                    });
                }
                try {
                    const days = 90;
                    const summary = await fetchGaSummary(env, days);
                    const users = summary.totals.activeUsers || 0;
                    const perDay = users / days;
                    const payload = JSON.stringify({
                        windowDays: days,
                        totalVisitors: users,
                        perDay: Math.round(perDay * 10) / 10,
                        perWeek: Math.round(perDay * 7 * 10) / 10,
                        perMonth: Math.round(perDay * 30.44 * 10) / 10,
                        pageViews: summary.totals.pageViews || 0,
                        updatedAt: summary.updatedAt,
                    });
                    await env.ADMIN_USERS.put(cacheKey, payload, { expirationTtl: 3600 });
                    return new Response(payload, {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=1800', 'X-Cache': 'MISS' },
                    });
                } catch {
                    // A GA outage should cost the dialog three numbers, not the page.
                    return new Response(JSON.stringify({ error: 'unavailable' }), {
                        status: 502,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
            }

            // Authenticated Endpoints — fail-closed: reject if no valid token
            const token = getAuthToken(request);
            let authPayload = token ? await verifyJwt(token, env.JWT_SECRET) : null;

            // An MCP access token (mcp-oauth.ts) is signed with a different key, so it never
            // passes the check above. It is taken from the Authorization header only, never a
            // cookie, must name a connection that still exists, and reaches nothing but the
            // routes the MCP tools use. The KV re-check and feature gates below still apply.
            let viaMcp = false;
            if (!authPayload && token && (request.headers.get('Authorization') || '').startsWith('Bearer ')) {
                const mcp = await readMcpToken(token, await mcpDeps(env));
                if (mcp) {
                    if (!mcpRouteAllowed(request.method, url.pathname, request.headers.get('Content-Type') || '')) {
                        return new Response(JSON.stringify({ error: 'This connection cannot do that.' }), {
                            status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        });
                    }
                    authPayload = mcp.claims;
                    viaMcp = true;
                }
            }

            if (!authPayload) {
                return new Response('Unauthorized', { status: 401, headers: corsHeaders });
            }

            // Signature + expiry alone would keep a removed admin working for the full
            // 7-day token lifetime. One KV read re-checks the user still exists and
            // re-derives the role, so nothing below trusts a week-old role claim.
            const session = await revalidateSession(env, authPayload);
            if (!session.valid) {
                return new Response('Unauthorized', { status: 401, headers: corsHeaders });
            }
            authPayload.role = session.role;

            const forbidden = () => new Response(JSON.stringify({ error: 'You do not have access to this part of the admin panel.' }), {
                status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
            const can = (feature: Feature) => hasFeature(session, feature);

            // Every token to the artifact service carries what this person may touch.
            // The service enforces it (and fails closed when it is absent), so the
            // Worker does not have to parse the multipart bodies it streams through.
            const serviceJwt = (purpose: string) => signArtifactsJwt({
                sub: session.userId,
                name: authPayload.name || authPayload.username || 'Admin',
                // Over MCP nobody is the owner and nobody manages secrets: the service then never
                // discloses an artifact's password and refuses a visibility or password change.
                role: viaMcp && session.role === 'super_admin' ? 'site_admin' : session.role,
                purpose,
                artifacts: can('artifacts') ? '*' : session.artifactGrants,
                manageSecrets: !viaMcp && (session.role === 'super_admin' || session.role === 'site_admin'),
                ...(viaMcp ? { via: 'mcp' } : {}),
            }, env.ARTIFACTS_JWT_SECRET);

            // GET /oauth/whoami — what an MCP connection is allowed to do, for worker-mcp to
            // decide which tools to list. Answers a session too; it says nothing /auth/me does not.
            if (url.pathname === '/oauth/whoami' && request.method === 'GET') {
                return new Response(JSON.stringify({
                    name: authPayload.name || authPayload.username || 'Admin', role: session.role,
                    can: FEATURES.filter(can), via: viaMcp ? 'mcp' : 'session',
                }), { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
            }

            // Connected apps: the MCP connections a person has approved. GET lists them, DELETE
            // /:id removes one (its tokens stop working at once). The owner sees everyone's;
            // everyone else their own. Never reachable with an MCP token (not on its allowlist).
            const grantMatch = url.pathname.match(/^\/api\/mcp\/grants(?:\/([A-Za-z0-9_-]{10,64}))?$/);
            if (grantMatch) {
                const all = session.role === 'super_admin';
                const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
                    status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                });
                const kv = env.ADMIN_USERS as unknown as KvLike;
                if (!grantMatch[1] && request.method === 'GET') {
                    const connections = await listGrants(kv, all ? undefined : session.userId);
                    return out({ connections: connections.map((c) => ({ ...c, mine: c.userId === session.userId })) });
                }
                if (grantMatch[1] && request.method === 'DELETE') {
                    const removed = await revokeGrant(kv, grantMatch[1], all ? undefined : session.userId);
                    return removed ? out({ ok: true }) : out({ error: 'not_found' }, 404);
                }
                return out({ error: 'method_not_allowed' }, 405);
            }

            // Feature gates, by path. Users, avatars and the instant-artifact routes
            // are handled where they are defined.
            const p = url.pathname;
            if (p === '/api/trigger' && !can('rebuild')) return forbidden();
            if (p.startsWith('/api/library') && !can('library')) return forbidden();
            if (p.startsWith('/api/analytics') && !can('analytics')) return forbidden();
            if (p.startsWith('/api/collections') && !can('content')) return forbidden();
            if (p.startsWith('/api/posts') && !can('content')) return forbidden();
            if (p.startsWith('/api/briefs') && !can('content')) return forbidden();
            if (p === '/api/artifacts' && !can('artifacts')) return forbidden();

            // Daily brief editions. The pages and their template live in the repo; the content
            // lives in the BRIEFS KV namespace so an edition can be hidden or removed at once,
            // with no rebuild. worker-mcp reads the same namespace for the public side.
            //   GET    /api/briefs            every edition (hidden ones too) and the config
            //   PUT    /api/briefs/:date      {edition} validate and store; replaces that date
            //   PATCH  /api/briefs/:date      {hidden} show or hide one edition
            //   DELETE /api/briefs/:date
            //   PUT    /api/briefs/config     {visibility?: 'public' | 'private', links?: [{label, url}]}
            //                                 the whole section on or off, and its "External sources" page
            const briefMatch = p.match(/^\/api\/briefs(?:\/(\d{4}-\d{2}-\d{2}|config))?$/);
            if (briefMatch) {
                const out = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
                    status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                });
                const kv = env.BRIEFS;
                if (!kv) return out({ error: 'briefs_unavailable', message: 'The Worker has no BRIEFS KV binding. Create the namespace, put its id in worker/wrangler.toml and worker-mcp/wrangler.toml, and redeploy both.' }, 503);
                const readIndex = async () => ((await kv.get<BriefSummary[]>(BRIEF_INDEX_KEY, 'json')) || []);
                const writeIndex = (rows: BriefSummary[]) => kv.put(BRIEF_INDEX_KEY, JSON.stringify(rows.sort((a, b) => b.date.localeCompare(a.date))));
                const target = briefMatch[1];
                const readBody = async (limit: number): Promise<any | null> => {
                    const raw = await request.text();
                    if (raw.length > limit) return null;
                    try { return JSON.parse(raw); } catch { return null; }
                };

                if (!target && request.method === 'GET') {
                    return out({ briefs: await readIndex(), config: (await kv.get<BriefConfig>(BRIEF_CONFIG_KEY, 'json')) || DEFAULT_BRIEF_CONFIG });
                }
                if (target === 'config' && request.method === 'PUT') {
                    // Either field may be sent alone; the other keeps its stored value.
                    const body = await readBody(60_000);
                    const config: BriefConfig = { ...DEFAULT_BRIEF_CONFIG, ...((await kv.get<BriefConfig>(BRIEF_CONFIG_KEY, 'json')) || {}) };
                    if (body?.visibility !== undefined) {
                        if (body.visibility !== 'public' && body.visibility !== 'private') return out({ error: 'visibility must be "public" or "private"' }, 400);
                        config.visibility = body.visibility;
                    }
                    if (body?.links !== undefined) {
                        const links = cleanBriefLinks(body.links);
                        if (typeof links === 'string') return out({ error: links }, 400);
                        config.links = links;
                    }
                    await kv.put(BRIEF_CONFIG_KEY, JSON.stringify(config));
                    return out({ ok: true, config });
                }
                if (!target || target === 'config' || !isBriefDate(target)) return out({ error: 'A real date (YYYY-MM-DD) is required' }, 400);

                if (request.method === 'PUT') {
                    const body = await readBody(400_000);
                    if (!body || typeof body !== 'object') return out({ error: 'invalid_json', message: 'Send {"edition": {...}} as JSON, at most 400 KB.' }, 400);
                    const checked = validateBrief(body.edition);
                    if (checked.ok && checked.edition.date !== target) {
                        return out({ error: 'validation_failed', errors: [{ path: 'date', reason: `is ${checked.edition.date} but this request is for ${target}` }], warnings: checked.warnings }, 422);
                    }
                    if (!checked.ok) return out({ error: 'validation_failed', errors: checked.errors, warnings: checked.warnings }, 422);
                    const index = await readIndex();
                    const existing = index.find((r) => r.date === target);
                    const edition = checked.edition;
                    // A date keeps its number across republishes; a new date takes the next one.
                    const number = existing?.edition_number || edition.edition_number || index.reduce((m, r) => Math.max(m, r.edition_number), 0) + 1;
                    const warnings = [...checked.warnings];
                    if (edition.edition_number && edition.edition_number !== number) warnings.push({ path: 'edition_number', reason: `ignored: ${target} is already edition ${number}` });
                    edition.edition_number = number;
                    await kv.put(briefKey(target), JSON.stringify(edition));
                    await writeIndex([...index.filter((r) => r.date !== target), { date: target, edition_number: number, headline: briefHeadline(edition), ...(existing?.hidden ? { hidden: true } : {}) }]);
                    return out({ ok: true, url: `${env.FRONTEND_URL || 'https://mncoleman.com'}/brief/${target}`, date: target, edition_number: number, replaced: !!existing, warnings });
                }
                if (request.method === 'PATCH') {
                    const body = await readBody(1000);
                    if (typeof body?.hidden !== 'boolean') return out({ error: 'hidden must be true or false' }, 400);
                    const index = await readIndex();
                    const row = index.find((r) => r.date === target);
                    if (!row) return out({ error: 'not_found' }, 404);
                    if (body.hidden) row.hidden = true; else delete row.hidden;
                    await writeIndex(index);
                    return out({ ok: true, date: target, hidden: body.hidden });
                }
                if (request.method === 'DELETE') {
                    const index = await readIndex();
                    if (!index.some((r) => r.date === target)) return out({ error: 'not_found' }, 404);
                    await kv.delete(briefKey(target));
                    await writeIndex(index.filter((r) => r.date !== target));
                    return out({ ok: true, deleted: target });
                }
                return out({ error: 'method_not_allowed' }, 405);
            }

            // POST /api/citations/lookup {url} — reads a page's title/author/site/date for a citation.
            // Same Origin/CSRF checks as every other POST (above) and the `content` feature. SSRF
            // hardening lives in lib/citation-lookup.ts; the response never contains the page body.
            if (p === '/api/citations/lookup') {
                if (!can('content')) return forbidden();
                const jsonOut = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
                    status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                });
                if (request.method !== 'POST') return jsonOut({ error: 'method_not_allowed' }, 405);
                if (!checkRateLimit(`cite-lookup:${session.userId}`, 20, 60_000)) return jsonOut({ error: 'rate_limited' }, 429);
                const bodyText = await request.text();
                let target = '';
                try {
                    const parsed = bodyText.length <= 4096 ? JSON.parse(bodyText) : null;
                    if (parsed && typeof parsed.url === 'string') target = parsed.url.trim().slice(0, 2048);
                } catch { /* falls through to invalid_url */ }
                const outcome = await lookupPage(target);
                if (!outcome.ok) return jsonOut({ error: outcome.error }, outcome.error === 'invalid_url' ? 400 : 422);
                return jsonOut(outcome.result);
            }

            // GET /api/artifacts/instant/:slug/preview-token — lets the admin panel's preview and
            // edit frames open a PRIVATE artifact without its password. Mints a 90-second token for
            // that one slug under its OWN audience, 'artifacts-preview', so requireAuth
            // (aud 'artifacts-service') refuses it on every API route; /a/:slug is the only place it is honoured. Allowed for exactly
            // the people who may see the artifact: the `artifacts` feature (owner, site admins) or a
            // grant for this slug. Nothing is returned that the caller could not already open.
            const previewMatch = p.match(/^\/api\/artifacts\/instant\/([a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?)\/preview-token$/);
            if (previewMatch && request.method === 'GET') {
                if (!env.ARTIFACTS_JWT_SECRET) {
                    return new Response(JSON.stringify({ error: 'Instant artifacts not configured' }), {
                        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                const slug = previewMatch[1];
                if (!can('artifacts') && !session.artifactGrants.includes(slug)) return forbidden();
                const previewToken = await signArtifactsJwt({
                    sub: session.userId,
                    purpose: 'artifact-preview',
                    preview: slug,
                }, env.ARTIFACTS_JWT_SECRET, 90, 'artifacts-preview');
                return new Response(JSON.stringify({ token: previewToken, expiresIn: 90 }), {
                    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                });
            }

            // Edit mode and Claude linking for one instant artifact. Proxied as-is:
            // the service checks the slug against the token's `artifacts` claim.
            const collabMatch = p.match(/^\/api\/artifacts\/instant\/([a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?)\/(state|notes|notes\/[a-f0-9-]{36}(?:\/(?:resolve|reopen|redeliver))?|edit-text|link)$/);
            if (collabMatch) {
                if (!env.ARTIFACTS_SERVICE_URL || !env.ARTIFACTS_JWT_SECRET) {
                    return new Response(JSON.stringify({ error: 'Instant artifacts not configured' }), {
                        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                const [, slug, rest] = collabMatch;
                // Never `artifact-link`: that purpose is reserved for Claude link tokens and requireAuth refuses it.
                const jwt = await serviceJwt(`admin-${rest.split('/')[0]}`);
                const hasBody = request.method === 'POST' || request.method === 'PUT';
                const upstream = await fetch(
                    `${env.ARTIFACTS_SERVICE_URL.replace(/\/$/, '')}/api/admin/artifacts/${slug}/${rest}${url.search}`,
                    {
                        method: request.method,
                        headers: {
                            'Authorization': `Bearer ${jwt}`,
                            ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
                        },
                        body: hasBody ? await request.text() : undefined,
                    },
                );
                return new Response(await upstream.text(), {
                    status: upstream.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                });
            }

            // Trigger Action endpoint
            if (url.pathname === '/api/trigger' && request.method === 'POST') {
                const body = await request.json() as { action: string, data?: any };

                // Handle actions
                // 'github_dispatch' is kept as an alias: the deployed admin UI still
                // sends it, and a stale browser tab must not start failing mid-migration.
                if (body.action === 'rebuild' || body.action === 'github_dispatch') {
                    const allowedEventTypes = ['admin_trigger', 'rebuild_site', 'sync_notion', 'content_update'];
                    const reason = allowedEventTypes.includes(body.data?.event_type) ? body.data.event_type : 'admin_trigger';
                    const resp = await triggerRebuild(env, reason);
                    if (!resp.ok) {
                        return new Response(JSON.stringify(resp), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                    }
                    return new Response(JSON.stringify(resp), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }

                if (body.action === 'n8n_webhook') {
                    // Example n8n call
                    if (!env.N8N_WEBHOOK_URL) return new Response('N8N URL not configured', { status: 500, headers: corsHeaders });
                    const resp = await fetch(env.N8N_WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body.data)
                    });
                    const result = await resp.text();
                    return new Response(JSON.stringify({ success: resp.ok, result }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }

                return new Response('Unknown action', { status: 400, headers: corsHeaders });
            }

            // Instant artifact admin list: includes private artifacts (admin-only on Oracle).
            if (url.pathname === '/api/artifacts/instant/list' && request.method === 'GET') {
                if (!env.ARTIFACTS_SERVICE_URL || !env.ARTIFACTS_JWT_SECRET) {
                    return new Response(JSON.stringify({ artifacts: [] }), {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                const jwt = await serviceJwt('artifact-list');
                const upstream = await fetch(`${env.ARTIFACTS_SERVICE_URL.replace(/\/$/, '')}/api/admin/list`, {
                    headers: { 'Authorization': `Bearer ${jwt}` },
                });
                const text = await upstream.text();
                return new Response(text, {
                    status: upstream.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            // Instant artifact edit: streams multipart PATCH to Oracle.
            if (url.pathname.startsWith('/api/artifacts/instant/') && request.method === 'PATCH') {
                if (!env.ARTIFACTS_SERVICE_URL || !env.ARTIFACTS_JWT_SECRET) {
                    return new Response(
                        JSON.stringify({ error: 'Instant artifacts not configured' }),
                        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }
                const slug = decodeURIComponent(url.pathname.split('/').pop() || '');
                if (!/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(slug)) {
                    return new Response(JSON.stringify({ error: 'invalid slug' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
                const jwt = await serviceJwt('artifact-edit');
                const upstreamHeaders: Record<string, string> = {
                    'Authorization': `Bearer ${jwt}`,
                };
                const ct = request.headers.get('Content-Type');
                if (ct) upstreamHeaders['Content-Type'] = ct;
                const cl = request.headers.get('Content-Length');
                if (cl) upstreamHeaders['Content-Length'] = cl;
                const upstream = await fetch(`${env.ARTIFACTS_SERVICE_URL.replace(/\/$/, '')}/api/${encodeURIComponent(slug)}`, {
                    method: 'PATCH',
                    headers: upstreamHeaders,
                    body: request.body,
                    // @ts-expect-error — Cloudflare Workers accept duplex for streaming requests
                    duplex: 'half',
                });
                const text = await upstream.text();
                return new Response(text, {
                    status: upstream.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            // Instant artifact delete: forwards to the Oracle service.
            if (url.pathname.startsWith('/api/artifacts/instant/') && request.method === 'DELETE') {
                if (!env.ARTIFACTS_SERVICE_URL || !env.ARTIFACTS_JWT_SECRET) {
                    return new Response(
                        JSON.stringify({ error: 'Instant artifacts not configured' }),
                        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }
                const slug = decodeURIComponent(url.pathname.split('/').pop() || '');
                if (!/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(slug)) {
                    return new Response(JSON.stringify({ error: 'invalid slug' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
                const jwt = await serviceJwt('artifact-delete');
                const upstream = await fetch(`${env.ARTIFACTS_SERVICE_URL.replace(/\/$/, '')}/api/${encodeURIComponent(slug)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${jwt}` },
                });
                // A later artifact reusing this slug must not inherit the old grants.
                if (upstream.ok) await dropGrant(env.ADMIN_USERS, slug);
                const text = await upstream.text();
                return new Response(text, {
                    status: upstream.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            // AI library item create: JSON body forwarded directly — no multipart/duplex
            // streaming needed here, these are small text payloads, not files.
            if (url.pathname === '/api/library' && request.method === 'POST') {
                if (!env.ARTIFACTS_SERVICE_URL || !env.ARTIFACTS_JWT_SECRET) {
                    return new Response(
                        JSON.stringify({ error: 'Library service not configured' }),
                        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }
                const jwt = await serviceJwt('library-create');
                const bodyText = await request.text();
                const upstream = await fetch(`${env.ARTIFACTS_SERVICE_URL.replace(/\/$/, '')}/api/library`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                    body: bodyText,
                });
                const text = await upstream.text();
                return new Response(text, {
                    status: upstream.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            // AI library item edit: JSON body forwarded directly.
            if (url.pathname.startsWith('/api/library/') && request.method === 'PATCH') {
                if (!env.ARTIFACTS_SERVICE_URL || !env.ARTIFACTS_JWT_SECRET) {
                    return new Response(
                        JSON.stringify({ error: 'Library service not configured' }),
                        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }
                const slug = decodeURIComponent(url.pathname.split('/').pop() || '');
                if (!/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(slug)) {
                    return new Response(JSON.stringify({ error: 'invalid slug' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
                const jwt = await serviceJwt('library-edit');
                const bodyText = await request.text();
                const upstream = await fetch(`${env.ARTIFACTS_SERVICE_URL.replace(/\/$/, '')}/api/library/${encodeURIComponent(slug)}`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
                    body: bodyText,
                });
                const text = await upstream.text();
                return new Response(text, {
                    status: upstream.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            // AI library item delete.
            if (url.pathname.startsWith('/api/library/') && request.method === 'DELETE') {
                if (!env.ARTIFACTS_SERVICE_URL || !env.ARTIFACTS_JWT_SECRET) {
                    return new Response(
                        JSON.stringify({ error: 'Library service not configured' }),
                        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }
                const slug = decodeURIComponent(url.pathname.split('/').pop() || '');
                if (!/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(slug)) {
                    return new Response(JSON.stringify({ error: 'invalid slug' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
                const jwt = await serviceJwt('library-delete');
                const upstream = await fetch(`${env.ARTIFACTS_SERVICE_URL.replace(/\/$/, '')}/api/library/${encodeURIComponent(slug)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${jwt}` },
                });
                const text = await upstream.text();
                return new Response(text, {
                    status: upstream.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            // GA4 traffic summary for the admin analytics page.
            // Cached in KV for 10 minutes: the Data API has a per-property quota and
            // the numbers only move hourly anyway.
            if (url.pathname === '/api/analytics/summary' && request.method === 'GET') {
                if (!env.GA_PROPERTY_ID || !env.GA_SA_CLIENT_EMAIL || !env.GA_SA_PRIVATE_KEY) {
                    return new Response(JSON.stringify({
                        error: 'not_configured',
                        message: 'GA4 service-account credentials are not set on the Worker.',
                    }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }

                const requested = parseInt(url.searchParams.get('days') || '28', 10);
                const days = [7, 28, 90].includes(requested) ? requested : 28;
                const cacheKey = `ga:summary:${days}`;

                const cached = await env.ADMIN_USERS.get(cacheKey);
                if (cached) {
                    return new Response(cached, {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
                    });
                }

                try {
                    const summary = await fetchGaSummary(env, days);
                    const payload = JSON.stringify(summary);
                    await env.ADMIN_USERS.put(cacheKey, payload, { expirationTtl: 600 });
                    return new Response(payload, {
                        status: 200,
                        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Cache': 'MISS' },
                    });
                } catch (e: any) {
                    return new Response(JSON.stringify({
                        error: 'ga_request_failed',
                        message: e?.message || 'Unknown error talking to the GA4 Data API',
                    }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
            }

            // Site collections (data/resources.json, data/projects.json). These replaced
            // the Resources and Projects Notion databases: a save here is a commit to
            // the repo, which the Pages Git integration builds like any other push —
            // no deploy hook needed, and no Notion round trips at build time.
            //
            // The whole file is read and written each time. The client sends back the
            // sha it read, so a stale write (another admin, or a build committing in
            // between) is refused by GitHub with a 409 rather than silently clobbered.
            // Images for the collection write-ups. Each one is committed to
            // public/collections/ under a unique name (so no read-before-write and no
            // sha race), and the editor inserts the returned path as markdown. That
            // commit builds the site on its own; the JSON save afterwards builds again.
            if (url.pathname === '/api/collections/images' && request.method === 'POST') {
                let body: { filename?: string; content?: string; type?: string };
                try {
                    body = await request.json();
                } catch {
                    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
                        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                const type = (body.type || '').toLowerCase();
                const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' } as Record<string, string>)[type];
                if (!ext || typeof body.content !== 'string' || !body.content) {
                    return new Response(JSON.stringify({ error: 'Send an image (png, jpg, gif, webp, svg, avif) as base64 `content` with its `type`' }), {
                        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                // 6MB of base64 ≈ 4.5MB of image. Larger than that belongs in the artifact service.
                if (body.content.length > 6 * 1024 * 1024) {
                    return new Response(JSON.stringify({ error: 'Image too large (limit ~4.5MB)' }), {
                        status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                const base = (body.filename || 'image')
                    .replace(/\.[^.]+$/, '')
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '')
                    .slice(0, 40) || 'image';
                const name = `${base}-${Date.now().toString(36)}.${ext}`;
                const fileUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/public/collections/${name}`;
                const resp = await fetch(fileUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${env.GITHUB_TOKEN}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Cloudflare-Worker',
                    },
                    body: JSON.stringify({ message: `Add collection image ${name}`, content: body.content }),
                });
                if (!resp.ok) {
                    const text = await resp.text();
                    return new Response(JSON.stringify({ error: `GitHub write failed (${resp.status})`, detail: text.slice(0, 300) }), {
                        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
                return new Response(JSON.stringify({ ok: true, path: `/collections/${name}` }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            const collectionMatch = url.pathname.match(/^\/api\/collections\/(resources|projects)$/);
            if (collectionMatch) {
                const name = collectionMatch[1];
                const fileUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/data/${name}.json`;
                const ghHeaders = {
                    'Authorization': `token ${env.GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Cloudflare-Worker',
                };

                if (request.method === 'GET') {
                    const resp = await fetch(fileUrl, { headers: ghHeaders });
                    if (!resp.ok) {
                        return new Response(JSON.stringify({ error: `Could not read data/${name}.json (${resp.status})` }), {
                            status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        });
                    }
                    const data = await resp.json() as any;
                    let items: unknown = [];
                    try {
                        items = JSON.parse(decodeBase64ToUtf8(data.content));
                    } catch {
                        return new Response(JSON.stringify({ error: `data/${name}.json is not valid JSON` }), {
                            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        });
                    }
                    return new Response(JSON.stringify({ items, sha: data.sha }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                if (request.method === 'PUT') {
                    let body: { items?: unknown; sha?: string; message?: string };
                    try {
                        body = await request.json();
                    } catch {
                        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
                            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        });
                    }
                    if (!Array.isArray(body.items) || !body.sha) {
                        return new Response(JSON.stringify({ error: '`items` (array) and `sha` are required' }), {
                            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        });
                    }
                    const resp = await fetch(fileUrl, {
                        method: 'PUT',
                        headers: ghHeaders,
                        body: JSON.stringify({
                            message: body.message || `Update ${name} via admin panel`,
                            content: encodeUtf8ToBase64(JSON.stringify(body.items, null, 2) + '\n'),
                            sha: body.sha,
                        }),
                    });
                    if (resp.status === 409) {
                        return new Response(JSON.stringify({
                            error: 'stale',
                            message: `data/${name}.json changed since you loaded it. Reload and apply your edit again.`,
                        }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                    }
                    if (!resp.ok) {
                        const text = await resp.text();
                        return new Response(JSON.stringify({ error: `GitHub write failed (${resp.status})`, detail: text.slice(0, 300) }), {
                            status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        });
                    }
                    const result = await resp.json() as any;
                    // The commit itself triggers the Pages build; do not also fire the hook.
                    return new Response(JSON.stringify({ ok: true, sha: result.content?.sha, commit: result.commit?.sha }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                return new Response('Method not allowed', { status: 405, headers: corsHeaders });
            }

            // Blog posts: ONE FILE PER POST at data/posts/<slug>.md (front matter + Markdown).
            //
            //   drafts   autosave to KV (POST_DRAFTS), keyed by slug and versioned. They
            //            NEVER commit: one commit per keystroke would be one Pages build per
            //            keystroke. A write carries the version it was based on; a mismatch is
            //            a 409 'conflict' and the client chooses (keep mine / load theirs).
            //   publish  the only thing that commits. Sha-locked like the collections: a
            //            stale or already-existing file is a 409 'stale'. The commit itself
            //            triggers the Pages build; the deploy hook is NOT also fired.
            //   KV has no compare-and-swap, so two tabs racing within the same few ms could
            //   both pass the version check. For one editor that is acceptable; the publish
            //   sha lock is the real guarantee.
            const postsMatch = url.pathname.match(/^\/api\/posts(?:\/([a-z0-9-]{1,100}))?(?:\/(draft|publish|unpublish))?$/);
            if (postsMatch) {
                const [, postSlug, action] = postsMatch;
                const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
                    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
                const ghHeaders = {
                    'Authorization': `token ${env.GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Cloudflare-Worker',
                };
                const dirUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/data/posts`;
                const fileUrlFor = (slug: string) => `${dirUrl}/${slug}.md`;
                const draftKey = (slug: string) => `post-draft:${slug}`;
                const drafts = env.POST_DRAFTS;
                const draftsUnavailable = () => json({
                    error: 'drafts_unavailable',
                    message: 'Draft storage is not set up: the Worker has no POST_DRAFTS KV binding. Run `wrangler kv namespace create POST_DRAFTS`, put the id in worker/wrangler.toml, and redeploy.',
                }, 503);
                type StoredDraft = { post: PostDoc; version: number; updatedAt: string; baseSha: string | null };
                const readDraft = async (slug: string): Promise<StoredDraft | null> => {
                    if (!drafts) return null;
                    return await drafts.get<StoredDraft>(draftKey(slug), 'json');
                };
                // A committed file the parser rejects is reported, never loaded as an "Untitled" or unpublished post.
                const readFile = async (slug: string): Promise<{ doc: PostDoc; sha: string } | null | 'error' | { invalid: string; sha: string }> => {
                    const resp = await fetch(fileUrlFor(slug), { headers: ghHeaders });
                    if (resp.status === 404) return null;
                    if (!resp.ok) return 'error';
                    const data = await resp.json() as any;
                    try {
                        return { doc: { ...parsePost(decodeBase64ToUtf8(data.content), slug, `data/posts/${slug}.md`), slug }, sha: data.sha };
                    } catch (e) {
                        if (e instanceof PostFormatError) return { invalid: e.message, sha: data.sha };
                        throw e;
                    }
                };
                const invalidFile = (f: { invalid: string }) => json({ error: 'invalid_post_file', message: f.invalid }, 422);
                const ghFailed = async (resp: Response, what: string) => {
                    const text = await resp.text();
                    return json({ error: `GitHub ${what} failed (${resp.status})`, detail: text.slice(0, 300) }, 502);
                };
                const stale = (slug: string) => json({
                    error: 'stale',
                    message: `data/posts/${slug}.md changed since you loaded it. Load the current version, then apply your edit again.`,
                }, 409);
                const readBody = async (): Promise<any | null> => {
                    const text = await request.text();
                    if (text.length > 1_500_000) return 'too_large';
                    try { return JSON.parse(text); } catch { return null; }
                };

                // GET /api/posts?offset=&limit= — post files plus draft-only posts, paged so nothing is
                // silently dropped. The directory listing and the draft key listing are cheap (one call
                // each); only the rows in the requested page cost a fetch per row.
                if (!postSlug && request.method === 'GET') {
                    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10) || 0);
                    const limit = Math.min(40, Math.max(1, parseInt(url.searchParams.get('limit') || '40', 10) || 40));
                    // ?pending=1 — only the posts whose autosaved draft differs from the committed file (or has no
                    // file): what the admin's top bar counts as unpublished. Subrequest budget per page (Free plan
                    // limit is 50): 1 directory listing + 1+ KV list + up to 20 draft reads + up to 20 file reads.
                    // The listing carries every file's blob sha, so a draft whose recorded base sha differs is
                    // known stale without reading the file, and a file already read at that sha (blob shas are
                    // content hashes, so the cache never goes stale) costs nothing.
                    if (url.searchParams.get('pending') === '1') {
                        if (!drafts) return json({ posts: [], total: 0, nextOffset: null, draftsAvailable: false });
                        const pendLimit = Math.min(20, limit);
                        const listing = await fetch(dirUrl, { headers: ghHeaders });
                        const shaBySlug = new Map<string, string>();
                        if (listing.ok) {
                            for (const f of (await listing.json()) as any[]) {
                                if (f.type === 'file' && /\.md$/.test(f.name)) shaBySlug.set((f.name as string).replace(/\.md$/, ''), f.sha as string);
                            }
                        } else if (listing.status !== 404) {
                            return ghFailed(listing, 'list');
                        }
                        const draftSlugs: string[] = [];
                        let cursor: string | undefined;
                        do {
                            const listed: any = await drafts.list({ prefix: 'post-draft:', limit: 1000, cursor });
                            for (const k of listed.keys) draftSlugs.push((k.name as string).slice('post-draft:'.length));
                            cursor = listed.list_complete ? undefined : listed.cursor;
                        } while (cursor);
                        draftSlugs.sort();
                        const pageSlugs = draftSlugs.slice(offset, offset + pendLimit);
                        const classified = await Promise.all(pageSlugs.map(async (sl) => {
                            const draft = await readDraft(sl);
                            if (!draft) return null;
                            const sha = shaBySlug.get(sl);
                            if (!sha) return classifyDraft(sl, draft, null);
                            // Stale (the file moved after this draft was saved): no need to read it.
                            if (draft.baseSha !== undefined && (draft.baseSha ?? null) !== sha) return classifyDraft(sl, draft, { sha, invalid: 'changed since the draft was saved' });
                            const hit = pendingFileCache.get(`${sl}@${sha}`);
                            if (hit) return classifyDraft(sl, draft, hit);
                            const file = await readFile(sl);
                            if (file === 'error') return { error: sl };
                            if (file && file.sha === sha) {
                                if (pendingFileCache.size > 300) pendingFileCache.clear();
                                pendingFileCache.set(`${sl}@${sha}`, file);
                            }
                            return classifyDraft(sl, draft, file);
                        }));
                        const failed = classified.filter((r): r is { error: string } => !!r && 'error' in r).map((r) => r.error);
                        const next = offset + pendLimit < draftSlugs.length ? offset + pendLimit : null;
                        return json({
                            posts: classified.filter((r) => !!r && !('error' in r)),
                            // Slugs whose committed file could not be read right now; the admin retries rather than guessing.
                            unreadable: failed,
                            total: draftSlugs.length, nextOffset: next, draftsAvailable: true,
                        });
                    }
                    const listResp = await fetch(dirUrl, { headers: ghHeaders });
                    let files: { slug: string; sha: string }[] = [];
                    if (listResp.ok) {
                        files = ((await listResp.json()) as any[])
                            .filter((f) => f.type === 'file' && /\.md$/.test(f.name))
                            .map((f) => ({ slug: (f.name as string).replace(/\.md$/, ''), sha: f.sha as string }))
                            .sort((a, b) => a.slug.localeCompare(b.slug));
                    } else if (listResp.status !== 404) {
                        return ghFailed(listResp, 'list');
                    }
                    const draftSlugs = new Set<string>();
                    if (drafts) {
                        let cursor: string | undefined;
                        do {
                            const listed: any = await drafts.list({ prefix: 'post-draft:', limit: 1000, cursor });
                            for (const k of listed.keys) draftSlugs.add((k.name as string).slice('post-draft:'.length));
                            cursor = listed.list_complete ? undefined : listed.cursor;
                        } while (cursor);
                    }
                    const fileSlugs = new Set(files.map((f) => f.slug));
                    const sequence: { slug: string; sha: string }[] = [
                        ...files,
                        ...[...draftSlugs].filter((sl) => !fileSlugs.has(sl)).sort().map((sl) => ({ slug: sl, sha: '' })),
                    ];
                    const page = sequence.slice(offset, offset + limit);
                    const rows = await Promise.all(page.map(async (f) => {
                        const draft = draftSlugs.has(f.slug) ? await readDraft(f.slug) : null;
                        const info = draft ? { version: draft.version, updatedAt: draft.updatedAt, differs: true } : null;
                        if (!f.sha) {
                            if (!draft) return null;
                            return {
                                slug: f.slug, title: draft.post.title, date: draft.post.date, tags: draft.post.tags, published: false,
                                featured: draft.post.featured, excerpt: draft.post.excerpt, sha: '', draft: info,
                            };
                        }
                        const r = await fetch(fileUrlFor(f.slug), { headers: { ...ghHeaders, 'Accept': 'application/vnd.github.raw+json' } });
                        if (!r.ok) return null;
                        try {
                            const d = parsePost(await r.text(), f.slug, `data/posts/${f.slug}.md`);
                            if (info && draft && samePost(draft.post, d)) info.differs = false;
                            return { slug: f.slug, title: d.title, date: d.date, tags: d.tags, published: d.published, featured: d.featured, excerpt: d.excerpt, sha: f.sha, draft: info };
                        } catch (e) {
                            if (!(e instanceof PostFormatError)) throw e;
                            // Shown in the list with the reason, never hidden.
                            return { slug: f.slug, title: f.slug, date: '', tags: [] as string[], published: false, featured: false, excerpt: '', sha: f.sha, draft: info, error: e.message };
                        }
                    }));
                    const next = offset + limit < sequence.length ? offset + limit : null;
                    return json({ posts: rows.filter((r) => !!r), total: sequence.length, nextOffset: next, draftsAvailable: !!drafts });
                }

                if (!postSlug || !isValidSlug(postSlug)) return json({ error: 'A valid post slug is required' }, 400);

                // GET /api/posts/:slug — the committed file (if any) and the draft (if any).
                if (!action && request.method === 'GET') {
                    const file = await readFile(postSlug);
                    if (file === 'error') return json({ error: `Could not read data/posts/${postSlug}.md` }, 502);
                    if (file && 'invalid' in file) return invalidFile(file);
                    const draft = await readDraft(postSlug);
                    return json({ post: file?.doc ?? null, sha: file?.sha ?? null, draft, draftsAvailable: !!drafts });
                }

                // PUT /api/posts/:slug/draft — autosave. Never commits.
                if (action === 'draft' && request.method === 'PUT') {
                    if (!drafts) return draftsUnavailable();
                    const body = await readBody();
                    if (body === 'too_large') return json({ error: 'Post is too large to autosave' }, 413);
                    if (!body) return json({ error: 'Invalid JSON body' }, 400);
                    const coerced = coercePostDoc(body.post, { allowEmptyTitle: true });
                    if (!coerced.ok) return json({ error: coerced.error }, 400);
                    if (coerced.doc.slug !== postSlug) return json({ error: 'post.slug must match the URL' }, 400);
                    // An MCP connection writes drafts and nothing else. It may not overwrite a draft
                    // that changed under it, and it never chooses a post's Status: the global Publish
                    // commits any pending draft marked Published, so a draft it marked that way
                    // would go live on the next click. Status follows the committed file, or Draft.
                    if (viaMcp) {
                        if (body.force === true) return json({ error: 'forbidden', message: 'A connected app cannot overwrite a draft that changed elsewhere.' }, 403);
                        const committed = await readFile(postSlug);
                        if (committed === 'error') return json({ error: `Could not check data/posts/${postSlug}.md` }, 502);
                        if (committed && 'invalid' in committed) return invalidFile(committed);
                        coerced.doc.published = committed ? committed.doc.published : false;
                    }
                    const baseVersion = Number.isInteger(body.baseVersion) ? body.baseVersion as number : 0;
                    const current = await readDraft(postSlug);
                    // The first save of a NEW post may not land on a slug that already has a file or somebody's
                    // draft. `force` never bypasses this, so "Keep mine" cannot overwrite a different post.
                    if (body.isNew === true) {
                        if (current && samePost(current.post, coerced.doc)) {
                            // Our own earlier save landed and only its response was lost.
                            return json({ ok: true, version: current.version, updatedAt: current.updatedAt });
                        }
                        const existing = await readFile(postSlug);
                        if (existing === 'error') return json({ error: `Could not check data/posts/${postSlug}.md` }, 502);
                        if (existing || current) {
                            return json({ error: 'slug_taken', message: `The slug "${postSlug}" is already used by another ${existing ? 'post' : 'draft'}.` }, 409);
                        }
                    }
                    // A draft that vanished (published or deleted in another tab) has version 0
                    // here but the client expects more: also a conflict, with nothing to load.
                    const mismatch = current ? current.version !== baseVersion : baseVersion !== 0;
                    if (mismatch && body.force !== true) {
                        return json({ error: 'conflict', message: 'This draft changed somewhere else.', draft: current }, 409);
                    }
                    const next: StoredDraft = {
                        post: coerced.doc,
                        version: (current?.version ?? baseVersion) + 1,
                        updatedAt: new Date().toISOString(),
                        baseSha: typeof body.baseSha === 'string' ? body.baseSha : null,
                    };
                    try {
                        await drafts.put(draftKey(postSlug), JSON.stringify(next));
                    } catch (e: any) {
                        // KV limits writes to ~1/s per key; the client backs off and retries.
                        return json({ error: 'draft_write_failed', message: e?.message || 'KV write failed' }, 503);
                    }
                    return json({ ok: true, version: next.version, updatedAt: next.updatedAt });
                }

                if (action === 'draft' && request.method === 'DELETE') {
                    if (!drafts) return draftsUnavailable();
                    await drafts.delete(draftKey(postSlug));
                    return json({ ok: true });
                }

                // POST /api/posts/:slug/publish — create or update the file. The only commit path.
                if (action === 'publish' && request.method === 'POST') {
                    const body = await readBody();
                    if (body === 'too_large') return json({ error: 'Post is too large' }, 413);
                    if (!body) return json({ error: 'Invalid JSON body' }, 400);
                    const coerced = coercePostDoc(body.post);
                    if (!coerced.ok) return json({ error: coerced.error }, 400);
                    if (coerced.doc.slug !== postSlug) return json({ error: 'post.slug must match the URL' }, 400);
                    const sha = typeof body.sha === 'string' && body.sha ? body.sha : undefined;
                    const resp = await fetch(fileUrlFor(postSlug), {
                        method: 'PUT',
                        headers: ghHeaders,
                        body: JSON.stringify({
                            message: typeof body.message === 'string' && body.message ? body.message.slice(0, 200)
                                : `${coerced.doc.published ? 'Publish' : 'Save'} post: ${coerced.doc.title}`,
                            content: encodeUtf8ToBase64(serializePost(coerced.doc)),
                            ...(sha ? { sha } : {}),
                        }),
                    });
                    // Creating (no sha) over an existing file is a slug collision, not a stale edit.
                    if (!sha && (resp.status === 409 || resp.status === 422)) {
                        return json({ error: 'slug_taken', message: `The slug "${postSlug}" is already used by another post.` }, 409);
                    }
                    // With a sha, 409/422 means the file moved since it was loaded.
                    if (resp.status === 409 || resp.status === 422) return stale(postSlug);
                    if (!resp.ok) return ghFailed(resp, 'write');
                    const result = await resp.json() as any;
                    // Only delete the draft this publish was made from. One saved since (another tab,
                    // another device) is newer than what was just committed: keep it and say so.
                    let keptDraft: StoredDraft | null = null;
                    if (drafts) {
                        try {
                            const draft = await readDraft(postSlug);
                            const seen = Number.isInteger(body.draftVersion) ? body.draftVersion as number : -1;
                            if (draft && (seen < 0 || draft.version > seen)) keptDraft = draft;
                            else if (draft) await drafts.delete(draftKey(postSlug));
                        } catch { /* the commit already landed; a leftover draft is merely stale */ }
                    }
                    // The commit itself triggers the Pages build; do not also fire the hook.
                    return json({ ok: true, sha: result.content?.sha, commit: result.commit?.sha, ...(keptDraft ? { draftKept: true, draft: keptDraft } : {}) });
                }

                // POST /api/posts/:slug/unpublish — flip published:false on the committed file.
                if (action === 'unpublish' && request.method === 'POST') {
                    const body = await readBody();
                    if (!body || body === 'too_large' || typeof body.sha !== 'string' || !body.sha) {
                        return json({ error: '`sha` is required' }, 400);
                    }
                    const file = await readFile(postSlug);
                    if (file === 'error') return json({ error: `Could not read data/posts/${postSlug}.md` }, 502);
                    if (!file) return json({ error: 'Post is not committed' }, 404);
                    if ('invalid' in file) return invalidFile(file);
                    if (file.sha !== body.sha) return stale(postSlug);
                    const resp = await fetch(fileUrlFor(postSlug), {
                        method: 'PUT',
                        headers: ghHeaders,
                        body: JSON.stringify({
                            message: `Unpublish post: ${file.doc.title}`,
                            content: encodeUtf8ToBase64(serializePost({ ...file.doc, published: false })),
                            sha: file.sha,
                        }),
                    });
                    if (resp.status === 409 || resp.status === 422) return stale(postSlug);
                    if (!resp.ok) return ghFailed(resp, 'write');
                    const result = await resp.json() as any;
                    return json({ ok: true, sha: result.content?.sha, commit: result.commit?.sha });
                }

                // DELETE /api/posts/:slug?sha=…&confirm=<slug> — remove the file. Irreversible from the UI.
                if (!action && request.method === 'DELETE') {
                    const sha = url.searchParams.get('sha') || '';
                    if (url.searchParams.get('confirm') !== postSlug) {
                        return json({ error: 'Deleting needs ?confirm=<slug> matching the post' }, 400);
                    }
                    if (!sha) return json({ error: '`sha` query parameter is required' }, 400);
                    const resp = await fetch(fileUrlFor(postSlug), {
                        method: 'DELETE',
                        headers: ghHeaders,
                        body: JSON.stringify({ message: `Delete post: ${postSlug}`, sha }),
                    });
                    if (resp.status === 409 || resp.status === 422) return stale(postSlug);
                    if (!resp.ok) return ghFailed(resp, 'delete');
                    const result = await resp.json() as any;
                    if (drafts) await drafts.delete(draftKey(postSlug)).catch(() => undefined); // the commit already landed; a leftover draft is merely stale
                    return json({ ok: true, commit: result.commit?.sha });
                }

                return new Response('Method not allowed', { status: 405, headers: corsHeaders });
            }

            // Artifacts Management Endpoints
            if (url.pathname === '/api/artifacts') {
                if (request.method === 'GET') {
                    // Fetch the artifacts manifest
                    const manifestUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/data/artifacts.json`;
                    const resp = await fetch(manifestUrl, {
                        headers: {
                            'Authorization': `token ${env.GITHUB_TOKEN}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Cloudflare-Worker',
                        },
                    });
                    if (!resp.ok) {
                        return new Response(JSON.stringify({ artifacts: [] }), {
                            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                        });
                    }
                    const data = await resp.json() as any;
                    const content = decodeBase64ToUtf8(data.content);
                    return new Response(JSON.stringify({ artifacts: JSON.parse(content) }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                if (request.method === 'POST') {
                    // Multipart path: stream-forward to the Oracle artifact service
                    // without buffering the file in the Worker.
                    const ctype = request.headers.get('Content-Type') || '';
                    if (ctype.toLowerCase().startsWith('multipart/form-data')) {
                        if (!env.ARTIFACTS_SERVICE_URL || !env.ARTIFACTS_JWT_SECRET) {
                            return new Response(
                                JSON.stringify({ error: 'Instant artifacts not configured on this worker' }),
                                { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                            );
                        }
                        const jwt = await serviceJwt('artifact-upload');
                        const upstreamHeaders: Record<string, string> = {
                            'Authorization': `Bearer ${jwt}`,
                            'Content-Type': ctype,
                        };
                        const cl = request.headers.get('Content-Length');
                        if (cl) upstreamHeaders['Content-Length'] = cl;
                        const upstream = await fetch(`${env.ARTIFACTS_SERVICE_URL.replace(/\/$/, '')}/api/upload`, {
                            method: 'POST',
                            headers: upstreamHeaders,
                            body: request.body,
                            // @ts-expect-error — Cloudflare Workers accept duplex for streaming requests
                            duplex: 'half',
                        });
                        const upstreamText = await upstream.text();
                        if (!upstream.ok) {
                            return new Response(
                                JSON.stringify({ error: 'Instant upload failed', detail: upstreamText }),
                                { status: upstream.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                            );
                        }
                        const upstreamJson = JSON.parse(upstreamText) as { ok: boolean; artifact: any };
                        return new Response(
                            JSON.stringify({ success: true, artifact: upstreamJson.artifact }),
                            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                        );
                    }

                    const body = await request.json() as {
                        filename: string;
                        name?: string;
                        content: string; // base64-encoded file content
                        type: string;
                        size: number;
                        description?: string;
                        destination?: 'github' | 'instant';
                        slug?: string;
                    };

                    if (!body.filename || !body.content) {
                        return new Response('Missing filename or content', { status: 400, headers: corsHeaders });
                    }

                    // Sanitize filename: only allow alphanumeric, hyphens, underscores, dots
                    const safeFilename = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_');

                    // Legacy JSON+base64 path for instant uploads (kept for backwards compat).
                    if (body.destination === 'instant') {
                        if (!env.ARTIFACTS_SERVICE_URL || !env.ARTIFACTS_JWT_SECRET) {
                            return new Response(
                                JSON.stringify({ error: 'Instant artifacts not configured on this worker' }),
                                { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                            );
                        }

                        const jwt = await serviceJwt('artifact-upload');

                        const bytes = decodeBase64ToBytes(body.content);
                        const blob = new Blob([bytes], { type: body.type || 'application/octet-stream' });
                        const form = new FormData();
                        form.append('file', blob, safeFilename);
                        if (body.name) form.append('name', body.name);
                        if (body.description) form.append('description', body.description);
                        if (body.slug) form.append('slug', body.slug);

                        const upstream = await fetch(`${env.ARTIFACTS_SERVICE_URL.replace(/\/$/, '')}/api/upload`, {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${jwt}` },
                            body: form,
                        });

                        const upstreamText = await upstream.text();
                        if (!upstream.ok) {
                            return new Response(
                                JSON.stringify({ error: 'Instant upload failed', detail: upstreamText }),
                                { status: upstream.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                            );
                        }

                        const upstreamJson = JSON.parse(upstreamText) as { ok: boolean; artifact: any };
                        return new Response(
                            JSON.stringify({ success: true, artifact: upstreamJson.artifact }),
                            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                        );
                    }

                    // 1. Upload the file to public/artifacts/
                    const filePath = `public/artifacts/${safeFilename}`;
                    const fileUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/${filePath}`;

                    // Check if file already exists (to get SHA for overwrite)
                    let existingFileSha: string | undefined;
                    const checkResp = await fetch(fileUrl, {
                        headers: {
                            'Authorization': `token ${env.GITHUB_TOKEN}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Cloudflare-Worker',
                        },
                    });
                    if (checkResp.ok) {
                        const existing = await checkResp.json() as any;
                        existingFileSha = existing.sha;
                    }

                    const uploadBody: any = {
                        message: `Upload artifact: ${safeFilename}`,
                        content: body.content,
                    };
                    if (existingFileSha) uploadBody.sha = existingFileSha;

                    const uploadResp = await fetch(fileUrl, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `token ${env.GITHUB_TOKEN}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Cloudflare-Worker',
                        },
                        body: JSON.stringify(uploadBody),
                    });

                    if (!uploadResp.ok) {
                        const errText = await uploadResp.text();
                        return new Response(`Failed to upload file: ${errText}`, { status: 500, headers: corsHeaders });
                    }

                    // 2. Update the manifest
                    const manifestUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/data/artifacts.json`;
                    const manifestResp = await fetch(manifestUrl, {
                        headers: {
                            'Authorization': `token ${env.GITHUB_TOKEN}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Cloudflare-Worker',
                        },
                    });

                    let artifacts: any[] = [];
                    let manifestSha: string | undefined;
                    if (manifestResp.ok) {
                        const manifestData = await manifestResp.json() as any;
                        manifestSha = manifestData.sha;
                        artifacts = JSON.parse(decodeBase64ToUtf8(manifestData.content));
                    }

                    // Remove existing entry with same filename if overwriting
                    artifacts = artifacts.filter((a: any) => a.filename !== safeFilename);

                    // Use the authoritative decoded byte length, not the client-supplied body.size.
                    const decodedBytes = decodeBase64ToBytes(body.content).byteLength;
                    const newArtifact = {
                        id: crypto.randomUUID(),
                        name: body.name || safeFilename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
                        filename: safeFilename,
                        description: body.description || '',
                        type: body.type || 'application/octet-stream',
                        size: decodedBytes,
                        uploadedAt: new Date().toISOString(),
                    };
                    artifacts.push(newArtifact);

                    const manifestUpdateBody: any = {
                        message: `Update artifacts manifest: add ${safeFilename}`,
                        content: encodeUtf8ToBase64(JSON.stringify(artifacts, null, 2)),
                    };
                    if (manifestSha) manifestUpdateBody.sha = manifestSha;

                    const manifestUpdateResp = await fetch(manifestUrl, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `token ${env.GITHUB_TOKEN}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Cloudflare-Worker',
                        },
                        body: JSON.stringify(manifestUpdateBody),
                    });

                    if (!manifestUpdateResp.ok) {
                        const errText = await manifestUpdateResp.text();
                        // 409 = the manifest moved between our read and this write (another
                        // admin, or a build committing to main). The sha we hold is stale, so
                        // the only fix is to re-read it — say so instead of leaking GitHub's text.
                        if (manifestUpdateResp.status === 409) {
                            return new Response(
                                `The artifacts manifest changed while this upload was in flight. The file "${safeFilename}" was committed — retry the upload to add its manifest entry.`,
                                { status: 409, headers: corsHeaders }
                            );
                        }
                        return new Response(`File uploaded but manifest update failed: ${errText}`, { status: 500, headers: corsHeaders });
                    }

                    // No explicit dispatch needed — the commits above trigger the deploy workflow via push-to-main

                    return new Response(JSON.stringify({ success: true, artifact: newArtifact }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                if (request.method === 'PATCH') {
                    const body = await request.json() as {
                        filename: string;
                        name?: string;
                        description?: string;
                        content?: string; // optional: base64-encoded replacement file
                        type?: string;
                        size?: number;
                    };

                    if (!body.filename) {
                        return new Response('Missing filename', { status: 400, headers: corsHeaders });
                    }

                    const safeFilename = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_');

                    // 1. If new file content provided, replace the file
                    if (body.content) {
                        const filePath = `public/artifacts/${safeFilename}`;
                        const fileUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/${filePath}`;

                        let existingFileSha: string | undefined;
                        const checkResp = await fetch(fileUrl, {
                            headers: {
                                'Authorization': `token ${env.GITHUB_TOKEN}`,
                                'Accept': 'application/vnd.github.v3+json',
                                'User-Agent': 'Cloudflare-Worker',
                            },
                        });
                        if (checkResp.ok) {
                            const existing = await checkResp.json() as any;
                            existingFileSha = existing.sha;
                        }

                        const uploadBody: any = {
                            message: `Update artifact file: ${safeFilename}`,
                            content: body.content,
                        };
                        if (existingFileSha) uploadBody.sha = existingFileSha;

                        const uploadResp = await fetch(fileUrl, {
                            method: 'PUT',
                            headers: {
                                'Authorization': `token ${env.GITHUB_TOKEN}`,
                                'Accept': 'application/vnd.github.v3+json',
                                'User-Agent': 'Cloudflare-Worker',
                            },
                            body: JSON.stringify(uploadBody),
                        });

                        if (!uploadResp.ok) {
                            const errText = await uploadResp.text();
                            return new Response(`Failed to update file: ${errText}`, { status: 500, headers: corsHeaders });
                        }
                    }

                    // 2. Update manifest metadata
                    const manifestUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/data/artifacts.json`;
                    const manifestResp = await fetch(manifestUrl, {
                        headers: {
                            'Authorization': `token ${env.GITHUB_TOKEN}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Cloudflare-Worker',
                        },
                    });

                    if (!manifestResp.ok) {
                        return new Response('Failed to read manifest', { status: 500, headers: corsHeaders });
                    }

                    const manifestData = await manifestResp.json() as any;
                    const artifacts = JSON.parse(decodeBase64ToUtf8(manifestData.content));
                    const idx = artifacts.findIndex((a: any) => a.filename === safeFilename);

                    if (idx === -1) {
                        return new Response('Artifact not found', { status: 404, headers: corsHeaders });
                    }

                    if (body.name !== undefined) artifacts[idx].name = body.name;
                    if (body.description !== undefined) artifacts[idx].description = body.description;
                    if (body.content) {
                        artifacts[idx].type = body.type || artifacts[idx].type;
                        artifacts[idx].size = decodeBase64ToBytes(body.content).byteLength;
                        artifacts[idx].uploadedAt = new Date().toISOString();
                    }

                    const manifestUpdateResp = await fetch(manifestUrl, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `token ${env.GITHUB_TOKEN}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Cloudflare-Worker',
                        },
                        body: JSON.stringify({
                            message: `Update artifact metadata: ${safeFilename}`,
                            content: encodeUtf8ToBase64(JSON.stringify(artifacts, null, 2)),
                            sha: manifestData.sha,
                        }),
                    });

                    if (!manifestUpdateResp.ok) {
                        const errText = await manifestUpdateResp.text();
                        if (manifestUpdateResp.status === 409) {
                            return new Response(
                                `The artifacts manifest changed while this edit was in flight. The metadata was not saved — reload the artifact list and try again.`,
                                { status: 409, headers: corsHeaders }
                            );
                        }
                        return new Response(`Manifest update failed: ${errText}`, { status: 500, headers: corsHeaders });
                    }

                    return new Response(JSON.stringify({ success: true, artifact: artifacts[idx] }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                if (request.method === 'DELETE') {
                    const filename = url.searchParams.get('file');
                    if (!filename) {
                        return new Response('Missing file parameter', { status: 400, headers: corsHeaders });
                    }

                    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

                    // 1. Delete the file from public/artifacts/
                    const filePath = `public/artifacts/${safeFilename}`;
                    const fileUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/${filePath}`;

                    const fileResp = await fetch(fileUrl, {
                        headers: {
                            'Authorization': `token ${env.GITHUB_TOKEN}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Cloudflare-Worker',
                        },
                    });

                    // A 404 here means the file is already gone — that is a no-op, not a
                    // failure. Anything else that fails has to surface: this used to
                    // fire-and-forget both calls and report success regardless.
                    if (fileResp.ok) {
                        const fileData = await fileResp.json() as any;
                        const fileDeleteResp = await fetch(fileUrl, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `token ${env.GITHUB_TOKEN}`,
                                'Accept': 'application/vnd.github.v3+json',
                                'User-Agent': 'Cloudflare-Worker',
                            },
                            body: JSON.stringify({
                                message: `Delete artifact: ${safeFilename}`,
                                sha: fileData.sha,
                            }),
                        });
                        if (!fileDeleteResp.ok) {
                            const errText = await fileDeleteResp.text();
                            if (fileDeleteResp.status === 409) {
                                return new Response(
                                    `"${safeFilename}" changed while this delete was in flight. Nothing was deleted — reload the artifact list and try again.`,
                                    { status: 409, headers: corsHeaders }
                                );
                            }
                            return new Response(`Failed to delete file: ${errText}`, { status: 502, headers: corsHeaders });
                        }
                    } else if (fileResp.status !== 404) {
                        const errText = await fileResp.text();
                        return new Response(`Failed to read file before delete: ${errText}`, { status: 502, headers: corsHeaders });
                    }

                    // 2. Update manifest
                    const manifestUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/data/artifacts.json`;
                    const manifestResp = await fetch(manifestUrl, {
                        headers: {
                            'Authorization': `token ${env.GITHUB_TOKEN}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Cloudflare-Worker',
                        },
                    });

                    if (!manifestResp.ok) {
                        return new Response('File deleted but the manifest could not be read', { status: 502, headers: corsHeaders });
                    }

                    const manifestData = await manifestResp.json() as any;
                    const artifacts = JSON.parse(decodeBase64ToUtf8(manifestData.content));
                    const filtered = artifacts.filter((a: any) => a.filename !== safeFilename);

                    const manifestUpdateResp = await fetch(manifestUrl, {
                        method: 'PUT',
                        headers: {
                            'Authorization': `token ${env.GITHUB_TOKEN}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'User-Agent': 'Cloudflare-Worker',
                        },
                        body: JSON.stringify({
                            message: `Update artifacts manifest: remove ${safeFilename}`,
                            content: encodeUtf8ToBase64(JSON.stringify(filtered, null, 2)),
                            sha: manifestData.sha,
                        }),
                    });

                    if (!manifestUpdateResp.ok) {
                        const errText = await manifestUpdateResp.text();
                        if (manifestUpdateResp.status === 409) {
                            return new Response(
                                `The artifacts manifest changed while this delete was in flight. The file was removed — retry the delete to drop its manifest entry.`,
                                { status: 409, headers: corsHeaders }
                            );
                        }
                        return new Response(`File deleted but manifest update failed: ${errText}`, { status: 502, headers: corsHeaders });
                    }

                    return new Response(JSON.stringify({ success: true }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
            }

            // Your own profile photo. Any signed-in admin, their own only: the target is
            // always the revalidated session's record, never a body or query parameter.
            if (p === '/api/me/avatar' || p === '/api/me/avatar-source') {
                const jsonOut = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
                    status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
                });
                const tgName = sessionTelegramName(session.userId, authPayload);
                if (p === '/api/me/avatar' && request.method === 'POST') {
                    if (!checkRateLimit(`avatar-upload-set:${session.userId}`, 10, 60_000)) return jsonOut({ error: 'Too many tries. Wait a minute and try again.' }, 429);
                    const declaredLength = Number(request.headers.get('Content-Length') || '0');
                    if (declaredLength > MAX_AVATAR_BYTES) return jsonOut({ error: 'That photo is too large. Pick a smaller one.' }, 413);
                    const bytes = await readCapped(request, MAX_AVATAR_BYTES + 1);
                    const check = validateAvatarUpload(bytes, request.headers.get('Content-Type'));
                    if (!check.ok) return jsonOut({ error: check.error }, check.status);

                    const token = randomHex(16);
                    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
                    const v = [...digest.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
                    const meta = parseMeta(await env.ADMIN_USERS.get(avatarMetaKey(session.userId)));
                    await env.ADMIN_USERS.put(`avatar-upload:${token}`, bytes, { metadata: { ct: check.type } });
                    const oldToken = meta.upload?.token;
                    meta.upload = { token, v, at: Date.now() };
                    meta.pin = 'upload'; // uploading is choosing it
                    await env.ADMIN_USERS.put(avatarMetaKey(session.userId), JSON.stringify(meta));
                    if (oldToken) await env.ADMIN_USERS.delete(`avatar-upload:${oldToken}`);
                    // KV has no compare-and-set, so two uploads at once can each think they won and
                    // leave one blob behind. Read back: if the record no longer points at our blob, a
                    // concurrent upload replaced it, so ours is the orphan and goes. (Cheap, not airtight:
                    // blobs are tiny and are also removed on replace, delete and user removal.)
                    const after = parseMeta(await env.ADMIN_USERS.get(avatarMetaKey(session.userId)));
                    if (after.upload?.token !== token) await env.ADMIN_USERS.delete(`avatar-upload:${token}`);
                    return jsonOut({ avatar: await avatarStateFor(env, session.userId, tgName, url.origin) });
                }

                if (p === '/api/me/avatar' && request.method === 'DELETE') {
                    const meta = parseMeta(await env.ADMIN_USERS.get(avatarMetaKey(session.userId)));
                    if (meta.upload) await env.ADMIN_USERS.delete(`avatar-upload:${meta.upload.token}`);
                    delete meta.upload;
                    meta.pin = 'auto';
                    await env.ADMIN_USERS.put(avatarMetaKey(session.userId), JSON.stringify(meta));
                    return jsonOut({ avatar: await avatarStateFor(env, session.userId, tgName, url.origin) });
                }

                if (p === '/api/me/avatar-source' && (request.method === 'PUT' || request.method === 'POST')) {
                    if (!checkRateLimit(`avatar-source:${session.userId}`, 30, 60_000)) return jsonOut({ error: 'Too many tries. Wait a minute and try again.' }, 429);
                    const text = await request.text();
                    let source: unknown;
                    try { source = text.length <= 1024 ? JSON.parse(text)?.source : undefined; } catch { /* invalid below */ }
                    if (!isAvatarPin(source)) return jsonOut({ error: 'Pick Automatic, Google, Telegram or Uploaded.' }, 400);
                    const current = await avatarStateFor(env, session.userId, tgName, url.origin);
                    if (source !== 'auto' && !current.sources[source]) return jsonOut({ error: 'That photo is not available yet.' }, 400);
                    const meta = parseMeta(await env.ADMIN_USERS.get(avatarMetaKey(session.userId)));
                    meta.pin = source;
                    await env.ADMIN_USERS.put(avatarMetaKey(session.userId), JSON.stringify(meta));
                    return jsonOut({ avatar: await avatarStateFor(env, session.userId, tgName, url.origin) });
                }

                return jsonOut({ error: 'method_not_allowed' }, 405);
            }

            // Display names of the people who can write posts, for the editor's Author dropdown.
            // Open to anyone with the `content` feature (the full /api/users list is owner-only),
            // so it returns only a display name and role: no emails, usernames or ids.
            if (url.pathname === '/api/users/names' && request.method === 'GET') {
                if (!can('content')) return forbidden();
                const names: { name: string; role: string; photoUrl: string | null }[] = [];
                const seen = new Set<string>();
                const add = (name: string, role: string, photoUrl: string | null) => {
                    const clean = name.trim();
                    if (!clean || seen.has(clean.toLowerCase())) return;
                    seen.add(clean.toLowerCase());
                    names.push({ name: clean, role, photoUrl });
                };
                // Photos here are shown to every editor, so only forms that name nobody are handed
                // out: Google, uploaded, and Telegram CDN photos. A t.me userpic or this Worker's
                // Telegram proxy path contains a handle and is dropped (initials show instead).
                // Same resolver as everywhere else, the owner included.
                const photoOf = async (id: string, telegramName: string) =>
                    (await avatarStateFor(env, id, telegramName, url.origin, null, { publicSafe: true })).photoUrl;
                // The owner is never in KV, and the Telegram first name on their session is not the byline posts use.
                add(OWNER_DISPLAY_NAME, 'super_admin', await photoOf('owner', ''));
                for (const id of await getUserList(env.ADMIN_USERS)) {
                    const user = await getUser(env.ADMIN_USERS, id);
                    if (!user || user.status !== 'active') continue;
                    const person = hasFeature({ role: effectiveRole(user.role), features: knownFeatures(user.features) }, 'content');
                    if (!person) continue;
                    // Never fall back to a Telegram handle or an email: only a first name the person gave is exposed.
                    add(user.firstName || 'Editor', effectiveRole(user.role), await photoOf(id, user.method === 'email' ? '' : id));
                }
                return new Response(JSON.stringify({ users: names }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            // User management endpoints (super_admin only)
            if (url.pathname === '/api/users') {
                if (authPayload.role !== 'super_admin') {
                    return new Response('Forbidden', { status: 403, headers: corsHeaders });
                }

                if (request.method === 'GET') {
                    const userList = await getUserList(env.ADMIN_USERS);
                    const users: any[] = [];

                    // Owner — enrich with cached profile (Telegram sessions only;
                    // a Google session's `username` is not a Telegram handle).
                    const ownerUsername = authPayload.provider === 'google' ? '' : (authPayload.username || '');
                    const ownerProfile = ownerUsername
                        ? await getCachedProfile(env, ownerUsername, url.origin)
                        : null;
                    users.push({
                        id: 'owner',
                        username: ownerUsername,
                        method: 'telegram',
                        email: env.OWNER_EMAIL || null,
                        sub: authPayload.id,
                        firstName: ownerProfile?.firstName || authPayload.name,
                        status: 'active',
                        role: 'super_admin',
                        features: [...FEATURES],
                        artifactGrants: [],
                        invitedAt: '',
                        claimedAt: '',
                        photoUrl: (await avatarStateFor(env, 'owner', ownerUsername, url.origin, sanitizeTelegramUrl(ownerProfile?.photoUrl, url.origin), { publicSafe: true, allowProxy: true })).photoUrl,
                    });

                    for (const id of userList) {
                        const user = await getUser(env.ADMIN_USERS, id);
                        if (user) {
                            const view = userView(user);
                            const profile = view.method === 'telegram' ? await getCachedProfile(env, view.username, url.origin) : null;
                            const photoUrl = (await avatarStateFor(env, id, view.method === 'telegram' ? view.username : '', url.origin, sanitizeTelegramUrl(profile?.photoUrl, url.origin), { publicSafe: true, allowProxy: true })).photoUrl;
                            users.push({ ...view, photoUrl });
                        }
                    }

                    return new Response(JSON.stringify({ users, features: FEATURES }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                // Add someone: by Telegram username, or by email (Google sign-in).
                if (request.method === 'POST') {
                    const body = await request.json() as Partial<UserInput> & { username?: string; email?: string; method?: string };
                    const access = parseAccess(body);
                    if (typeof access === 'string') return jsonError(access, 400, corsHeaders);

                    const email = normalizeEmail(body.email);
                    if (body.email && !email) return jsonError('That is not a valid email address.', 400, corsHeaders);

                    let id: string;
                    let method: 'telegram' | 'email';
                    if (body.method === 'email') {
                        if (!email) return jsonError('An email address is required.', 400, corsHeaders);
                        id = email;
                        method = 'email';
                    } else {
                        id = (body.username || '').toLowerCase().replace(/^@/, '');
                        if (!/^[a-z0-9_]{1,32}$/.test(id)) return jsonError('Invalid username', 400, corsHeaders);
                        if (isReservedUserId(id)) return jsonError('That name is reserved. Use the person\'s real Telegram username.', 400, corsHeaders);
                        method = 'telegram';
                    }

                    if (await getUser(env.ADMIN_USERS, id)) return jsonError('User already exists', 409, corsHeaders);
                    if (email && await env.ADMIN_USERS.get(`email:${email}`)) {
                        return jsonError('Someone already has that email.', 409, corsHeaders);
                    }

                    const user = await inviteUser(env.ADMIN_USERS, { id, method, email, ...access });
                    return new Response(JSON.stringify({ user: userView(user) }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                // Change someone's role, features, artifact grants or Google email.
                if (request.method === 'PATCH') {
                    const body = await request.json() as Partial<UserInput> & { id?: string; email?: string | null };
                    const id = String(body.id || '').toLowerCase();
                    const user = id ? await getUser(env.ADMIN_USERS, id) : null;
                    if (!user) return jsonError('User not found', 404, corsHeaders);
                    const access = parseAccess({ ...accessOf(user), ...body });
                    if (typeof access === 'string') return jsonError(access, 400, corsHeaders);

                    if (body.email !== undefined) {
                        const email = body.email ? normalizeEmail(body.email) : null;
                        if (body.email && !email) return jsonError('That is not a valid email address.', 400, corsHeaders);
                        if (userId(user) === user.email && email !== user.email) {
                            return jsonError('This person was added by email; remove them and add the new address instead.', 400, corsHeaders);
                        }
                        if (email && email !== user.email) {
                            const holder = await env.ADMIN_USERS.get(`email:${email}`);
                            if (holder && holder !== userId(user)) return jsonError('Someone already has that email.', 409, corsHeaders);
                        }
                        await setUserEmail(env.ADMIN_USERS, user, email);
                    }

                    user.role = access.role;
                    user.features = access.features;
                    user.artifactGrants = access.artifactGrants;
                    await env.ADMIN_USERS.put(`user:${userId(user)}`, JSON.stringify(user));
                    // A live Claude link outlives the KV change otherwise: the service
                    // cannot see KV, and the link token is good for two hours.
                    await revokeLinks(env, userId(user),
                        access.role === 'site_admin' || access.features.includes('artifacts') ? '*' : access.artifactGrants);
                    return new Response(JSON.stringify({ user: userView(user) }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                if (request.method === 'DELETE') {
                    const id = (url.searchParams.get('id') || url.searchParams.get('username') || '').toLowerCase().replace(/^@/, '');
                    if (!id) {
                        return new Response('Missing id', { status: 400, headers: corsHeaders });
                    }

                    await removeUser(env.ADMIN_USERS, id);
                    await revokeLinks(env, id, []);
                    return new Response(JSON.stringify({ success: true }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
            }

            // Telegram user lookup (super_admin only)
            if (url.pathname === '/api/users/lookup' && request.method === 'GET') {
                if (authPayload.role !== 'super_admin') {
                    return new Response('Forbidden', { status: 403, headers: corsHeaders });
                }

                const username = url.searchParams.get('username')?.toLowerCase().replace(/^@/, '');
                if (!username || !/^[a-z0-9_]{1,32}$/.test(username) || isReservedUserId(username)) {
                    return new Response('Invalid username', { status: 400, headers: corsHeaders });
                }

                // Check if already invited
                const existing = await getUser(env.ADMIN_USERS, username);
                if (existing) {
                    return new Response(JSON.stringify({ error: 'User already invited' }), {
                        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                const profile = await resolveTelegramProfile(env, username, url.origin);

                // Pre-warm the profile cache so the user list renders the same
                // avatar instantly once this user is invited.
                if (profile.found || profile.photoUrl) {
                    await env.ADMIN_USERS.put(
                        `profile:${username}`,
                        JSON.stringify({ firstName: profile.firstName || username, photoUrl: profile.photoUrl }),
                        { expirationTtl: 60 * 60 * 24 * 7 }
                    );
                }

                return new Response(JSON.stringify({
                    found: profile.found,
                    username: profile.username || username,
                    firstName: profile.firstName,
                    lastName: profile.lastName,
                    photoUrl: profile.photoUrl,
                }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            return new Response('Not Found', { status: 404, headers: corsHeaders });
        } catch (e) {
            console.error('Worker error:', e);
            return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }
    },
};

// --- Helpers ---

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i++) {
        mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return mismatch === 0;
}

// Extract token from Authorization header or Cookie
function getAuthToken(request: Request): string | null {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }

    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc: Record<string, string>, cookie) => {
            const trimmed = cookie.trim();
            const eqIndex = trimmed.indexOf('=');
            if (eqIndex > 0) {
                acc[trimmed.slice(0, eqIndex)] = trimmed.slice(eqIndex + 1);
            }
            return acc;
        }, {});
        return cookies.admin_token || null;
    }

    return null;
}

// --- OIDC / PKCE Helpers ---

function generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoaUrl(String.fromCharCode(...array));
}

async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const digest = await crypto.subtle.digest('SHA-256', encoder.encode(verifier));
    return btoaUrl(String.fromCharCode(...new Uint8Array(digest)));
}

function getCookieValue(request: Request, name: string): string | null {
    const cookieHeader = request.headers.get('Cookie');
    if (!cookieHeader) return null;
    for (const cookie of cookieHeader.split(';')) {
        const trimmed = cookie.trim();
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0 && trimmed.slice(0, eqIndex) === name) {
            return trimmed.slice(eqIndex + 1);
        }
    }
    return null;
}

async function signOauthData(data: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return btoaUrl(data) + '.' + btoaUrl(String.fromCharCode(...new Uint8Array(sig)));
}

async function verifyOauthData(signed: string, secret: string): Promise<any | null> {
    const dotIndex = signed.lastIndexOf('.');
    if (dotIndex === -1) return null;
    const dataB64 = signed.slice(0, dotIndex);
    const sigB64 = signed.slice(dotIndex + 1);
    const data = atobUrl(dataB64);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    const computedSig = btoaUrl(String.fromCharCode(...new Uint8Array(sig)));
    if (!timingSafeEqual(sigB64, computedSig)) return null;
    return JSON.parse(data);
}

// Cache JWKS in worker isolate memory (refreshed hourly)
let cachedJwks: any = null;
let jwksCachedAt = 0;

async function fetchTelegramJwks(): Promise<any> {
    const now = Date.now();
    if (cachedJwks && now - jwksCachedAt < 3600_000) return cachedJwks;
    const resp = await fetch('https://oauth.telegram.org/.well-known/jwks.json');
    if (!resp.ok) throw new Error('Failed to fetch Telegram JWKS');
    cachedJwks = await resp.json();
    jwksCachedAt = now;
    return cachedJwks;
}

async function verifyTelegramIdToken(idToken: string, botId: string): Promise<any | null> {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(atobUrl(headerB64));
    const payload = JSON.parse(atobUrl(payloadB64));

    // Validate standard OIDC claims
    if (payload.iss !== 'https://oauth.telegram.org') return null;
    if (String(payload.aud) !== String(botId)) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    // Fetch JWKS and find the signing key
    const jwks = await fetchTelegramJwks();
    const jwk = jwks.keys?.find((k: any) => k.kid === header.kid);
    if (!jwk) return null;

    // Determine algorithm from JWK (default RS256)
    const alg = jwk.alg || header.alg || 'RS256';
    let algorithm: RsaHashedImportParams | EcKeyImportParams;
    if (alg === 'RS256') {
        algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    } else if (alg === 'ES256') {
        algorithm = { name: 'ECDSA', namedCurve: 'P-256' };
    } else {
        return null; // Unsupported algorithm
    }

    const cryptoKey = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);

    // Decode signature
    const sigStr = atobUrl(signatureB64);
    const sigBytes = new Uint8Array(sigStr.length);
    for (let i = 0; i < sigStr.length; i++) sigBytes[i] = sigStr.charCodeAt(i);

    const encoder = new TextEncoder();
    const data = encoder.encode(`${headerB64}.${payloadB64}`);

    const verifyParams = alg === 'ES256'
        ? { name: 'ECDSA', hash: 'SHA-256' }
        : 'RSASSA-PKCS1-v1_5';

    const valid = await crypto.subtle.verify(verifyParams, cryptoKey, sigBytes, data);
    return valid ? payload : null;
}

// Google's signing keys, cached per isolate like Telegram's.
let cachedGoogleJwks: any = null;
let googleJwksCachedAt = 0;

async function verifyGoogleIdToken(idToken: string, clientId: string): Promise<any | null> {
    const parts = idToken.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    let header: any, payload: any;
    try {
        header = JSON.parse(atobUrl(headerB64));
        payload = JSON.parse(atobUrl(payloadB64));
    } catch {
        return null;
    }
    if (header.alg !== 'RS256') return null;
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') return null;
    if (payload.aud !== clientId) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;

    if (!cachedGoogleJwks || Date.now() - googleJwksCachedAt > 3600_000) {
        const resp = await fetch('https://www.googleapis.com/oauth2/v3/certs');
        if (!resp.ok) return null;
        cachedGoogleJwks = await resp.json();
        googleJwksCachedAt = Date.now();
    }
    const jwk = cachedGoogleJwks.keys?.find((k: any) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const sigStr = atobUrl(signatureB64);
    const sig = new Uint8Array(sigStr.length);
    for (let i = 0; i < sigStr.length; i++) sig[i] = sigStr.charCodeAt(i);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, new TextEncoder().encode(`${headerB64}.${payloadB64}`));
    return ok ? payload : null;
}

// Simple JWT implementation using HmacSHA256
async function signJwt(payload: any, secret: string): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const exp = now + (60 * 60 * 24 * 7); // 7 days

    const encodedHeader = btoaUrl(JSON.stringify(header));
    const encodedPayload = btoaUrl(JSON.stringify({ ...payload, exp }));

    const signature = await createSignature(encodedHeader + '.' + encodedPayload, secret);

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Mints a short-lived (60s) HS256 JWT for the Oracle artifact service.
// Callers pass `role` (the freshly re-derived session role, not the token's own
// claim): the service only discloses decrypted artifact passwords when it reads
// role === 'super_admin', and treats an absent claim as not-super_admin.
async function signArtifactsJwt(payload: Record<string, unknown>, secret: string, ttlSeconds = 60, audience = 'artifacts-service'): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claims = { ...payload, iat: now, exp: now + ttlSeconds, aud: audience };
    const h = btoaUrl(JSON.stringify(header));
    const p = btoaUrl(JSON.stringify(claims));
    const sig = await createSignature(`${h}.${p}`, secret);
    return `${h}.${p}.${sig}`;
}

// ---------------------------------------------------------------------------
// GA4 Data API (service-account auth)
// ---------------------------------------------------------------------------

// `wrangler secret put` preserves real newlines, but a key pasted straight out of
// the service-account JSON arrives with literal `\n` — handle both.
async function importServiceAccountKey(pem: string): Promise<CryptoKey> {
    const body = pem
        .replace(/\\n/g, '\n')
        .replace(/-----BEGIN PRIVATE KEY-----/, '')
        .replace(/-----END PRIVATE KEY-----/, '')
        .replace(/\s+/g, '');
    return crypto.subtle.importKey(
        'pkcs8',
        decodeBase64ToBytes(body),
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
    );
}

// Google's two-legged OAuth: self-sign an RS256 assertion, trade it for a bearer token.
async function getGoogleAccessToken(env: Env): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
        iss: env.GA_SA_CLIENT_EMAIL,
        scope: 'https://www.googleapis.com/auth/analytics.readonly',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    };

    const unsigned = `${btoaUrl(JSON.stringify(header))}.${btoaUrl(JSON.stringify(claims))}`;
    const key = await importServiceAccountKey(env.GA_SA_PRIVATE_KEY);
    const sigBytes = new Uint8Array(
        await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned))
    );
    const assertion = `${unsigned}.${btoaUrl(String.fromCharCode(...sigBytes))}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }),
    });

    if (!res.ok) {
        throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
    }
    const json = await res.json() as { access_token?: string };
    if (!json.access_token) throw new Error('Google token exchange returned no access_token');
    return json.access_token;
}

interface GaRow {
    dimensionValues?: { value: string }[];
    metricValues?: { value: string }[];
}

const num = (row: GaRow | undefined, i: number): number =>
    parseFloat(row?.metricValues?.[i]?.value || '0') || 0;

async function fetchGaSummary(env: Env, days: number) {
    const token = await getGoogleAccessToken(env);

    // Both bounds are inclusive, so `7daysAgo..today` spans days + 1 days. The previous
    // window has to span the same count or every delta is biased — it ends the day before
    // the current one starts (no overlap) and reaches back an equal days + 1 days.
    const current = { startDate: `${days}daysAgo`, endDate: 'today', name: 'current' };
    const previous = { startDate: `${days * 2 + 1}daysAgo`, endDate: `${days + 1}daysAgo`, name: 'previous' };
    const window = [{ startDate: current.startDate, endDate: current.endDate }];

    const body = {
        requests: [
            // 0 — headline totals, this period vs the one before it
            {
                dateRanges: [current, previous],
                metrics: [
                    { name: 'activeUsers' },
                    { name: 'sessions' },
                    { name: 'screenPageViews' },
                    { name: 'averageSessionDuration' },
                    { name: 'bounceRate' },
                ],
            },
            // 1 — daily trend
            {
                dateRanges: window,
                dimensions: [{ name: 'date' }],
                metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
                orderBys: [{ dimension: { dimensionName: 'date' } }],
                limit: 100,
            },
            // 2 — top pages
            {
                dateRanges: window,
                dimensions: [{ name: 'pagePath' }],
                metrics: [{ name: 'screenPageViews' }],
                orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
                limit: 10,
            },
            // 3 — where sessions came from
            {
                dateRanges: window,
                dimensions: [{ name: 'sessionDefaultChannelGroup' }, { name: 'sessionSource' }],
                metrics: [{ name: 'sessions' }],
                orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
                limit: 10,
            },
            // 4 — countries
            {
                dateRanges: window,
                dimensions: [{ name: 'country' }],
                metrics: [{ name: 'activeUsers' }],
                orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
                limit: 10,
            },
        ],
    };

    // batchRunReports takes at most five requests, and the five above fill it. The
    // city breakdown goes in its own runReport, fired in parallel.
    const citiesBody = {
        dateRanges: window,
        dimensions: [{ name: 'city' }, { name: 'region' }, { name: 'country' }],
        metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
        orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
        limit: 15,
    };

    const gaHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const base = `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA_PROPERTY_ID}`;
    const [res, citiesRes] = await Promise.all([
        fetch(`${base}:batchRunReports`, { method: 'POST', headers: gaHeaders, body: JSON.stringify(body) }),
        fetch(`${base}:runReport`, { method: 'POST', headers: gaHeaders, body: JSON.stringify(citiesBody) }),
    ]);

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`GA4 Data API error (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json() as { reports?: { rows?: GaRow[] }[] };
    const reports = data.reports || [];
    // Cities are a nice-to-have: if that one report fails, the rest still loads.
    const cityRows: GaRow[] = citiesRes.ok ? ((await citiesRes.json() as { rows?: GaRow[] }).rows || []) : [];

    // Report 0 gains a synthetic `dateRange` dimension because we passed two named
    // ranges — match on the name rather than trusting row order. That dimension is
    // appended LAST, so it only sits at index 0 while request 0 asks for no dimensions
    // of its own. Add one there and this lookup silently returns zeros.
    const totalRows = reports[0]?.rows || [];
    const pick = (name: string) => totalRows.find((r) => r.dimensionValues?.[0]?.value === name);
    const shapeTotals = (row: GaRow | undefined) => ({
        activeUsers: num(row, 0),
        sessions: num(row, 1),
        pageViews: num(row, 2),
        avgSessionDuration: num(row, 3),
        bounceRate: num(row, 4),
    });

    return {
        days,
        propertyId: env.GA_PROPERTY_ID,
        updatedAt: new Date().toISOString(),
        totals: shapeTotals(pick('current')),
        previous: shapeTotals(pick('previous')),
        trend: (reports[1]?.rows || []).map((r) => ({
            date: r.dimensionValues?.[0]?.value || '',
            activeUsers: num(r, 0),
            sessions: num(r, 1),
        })),
        topPages: (reports[2]?.rows || []).map((r) => ({
            path: r.dimensionValues?.[0]?.value || '(not set)',
            views: num(r, 0),
        })),
        sources: (reports[3]?.rows || []).map((r) => ({
            channel: r.dimensionValues?.[0]?.value || '(not set)',
            source: r.dimensionValues?.[1]?.value || '(direct)',
            sessions: num(r, 0),
        })),
        countries: (reports[4]?.rows || []).map((r) => ({
            country: r.dimensionValues?.[0]?.value || '(not set)',
            users: num(r, 0),
        })),
        cities: cityRows.map((r) => ({
            city: r.dimensionValues?.[0]?.value || '(not set)',
            region: r.dimensionValues?.[1]?.value || '',
            country: r.dimensionValues?.[2]?.value || '',
            users: num(r, 0),
            sessions: num(r, 1),
        })),
    };
}

function decodeBase64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

// GitHub's contents API speaks base64 of the raw UTF-8 bytes, but btoa/atob are
// Latin-1: btoa() throws on anything above U+00FF (an em-dash in a description
// would 500 the request *after* the file commit already landed) and atob() decodes
// UTF-8 bytes as Latin-1, turning '—' into 'â€"'. Round-trip through
// TextEncoder/TextDecoder instead.
function encodeUtf8ToBase64(str: string): string {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
}

function decodeBase64ToUtf8(b64: string): string {
    return new TextDecoder().decode(decodeBase64ToBytes(b64));
}

async function verifyJwt(token: string, secret: string): Promise<any | null> {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;
    const computedSignature = await createSignature(header + '.' + payload, secret);

    if (!timingSafeEqual(signature, computedSignature)) return null;

    let decodedPayload: any;
    try { decodedPayload = JSON.parse(atobUrl(payload)); } catch { return null; }
    // No expiry is not "never expires": `undefined < now` is false, so it has to be checked.
    if (!decodedPayload || typeof decodedPayload.exp !== 'number' || decodedPayload.exp < Math.floor(Date.now() / 1000)) return null;

    return decodedPayload;
}

async function createSignature(data: string, secret: string): Promise<string> {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
    return btoaUrl(String.fromCharCode(...new Uint8Array(signature)));
}

function btoaUrl(str: string): string {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function atobUrl(str: string): string {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return atob(str);
}

// Rebuilds the site by firing the Cloudflare Pages deploy hook.
//
// This replaced a GitHub `repository_dispatch` when the site moved off GitHub
// Pages. Note that the site ALSO rebuilds on its own whenever this Worker
// commits `data/artifacts.json` — the Pages Git integration sees that push. So
// only call this for content-only rebuilds (Notion sync, the daily cron, a
// manual admin rebuild); calling it after a manifest commit double-builds.
//
// `reason` is for logging only. The hook always builds `main`; unlike
// repository_dispatch there is no event type to branch on.
async function triggerRebuild(env: Env, reason: string) {
    if (!env.PAGES_DEPLOY_HOOK) {
        return { error: 'PAGES_DEPLOY_HOOK not configured', ok: false };
    }

    const response = await fetch(env.PAGES_DEPLOY_HOOK, { method: 'POST' });

    if (!response.ok) {
        const text = await response.text();
        return { ok: false, status: response.status, error: text, reason };
    }

    return { status: response.status, ok: true, reason };
}

// --- Multi-User KV Helpers ---
//
// KV layout:
//   user:<id>        the AdminUser record (id = Telegram username, or email)
//   user_list        JSON array of ids
//   sub:<tgSub>      -> id, written when a Telegram invite is claimed
//   gsub:<googleSub> -> id, written on first Google sign-in
//   email:<address>  -> id, for every record that has an email

function userId(user: AdminUser): string {
    return user.id || user.username;
}

function effectiveRole(stored: StoredRole | undefined): 'site_admin' | 'editor' {
    return stored === 'editor' ? 'editor' : 'site_admin';
}

function hasFeature(session: Pick<Session, 'role' | 'features'>, feature: Feature): boolean {
    return session.role === 'super_admin' || session.role === 'site_admin' || session.features.includes(feature);
}

interface UserInput {
    role: 'site_admin' | 'editor';
    features: Feature[];
    artifactGrants: string[];
}

function accessOf(user: AdminUser): UserInput {
    return {
        role: effectiveRole(user.role),
        features: knownFeatures(user.features),
        artifactGrants: user.artifactGrants || [],
    };
}

/** Validates role/features/grants from a request body. A string is the error. */
function parseAccess(body: Partial<UserInput>): UserInput | string {
    // Omitted means the least access, never a full admin.
    const role = body.role === 'site_admin' ? 'site_admin' : body.role === 'editor' || body.role === undefined ? 'editor' : null;
    if (!role) return 'role must be site_admin or editor';
    const features = Array.isArray(body.features) ? body.features : [];
    if (features.some((f) => !(FEATURES as readonly string[]).includes(f))) return 'Unknown feature';
    const grants = Array.isArray(body.artifactGrants) ? body.artifactGrants : [];
    if (grants.length > 500 || grants.some((g) => typeof g !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(g))) {
        return 'Invalid artifact grant';
    }
    // A site admin has everything; storing features for one would only mislead.
    return role === 'site_admin'
        ? { role, features: [], artifactGrants: [] }
        : { role, features: [...new Set(features)] as Feature[], artifactGrants: [...new Set(grants)] };
}

function normalizeEmail(raw: unknown): string | null {
    const e = String(raw || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : null;
}

function userView(user: AdminUser) {
    const id = userId(user);
    return {
        id,
        username: user.method === 'email' ? '' : user.username,
        method: user.method || 'telegram',
        email: user.email || null,
        sub: user.sub,
        firstName: user.firstName,
        status: user.status,
        role: effectiveRole(user.role),
        features: knownFeatures(user.features),
        artifactGrants: user.artifactGrants || [],
        invitedAt: user.invitedAt,
        claimedAt: user.claimedAt,
        googleLinked: !!user.googleSub,
    };
}

function jsonError(message: string, status: number, headers: Record<string, string>): Response {
    return new Response(JSON.stringify({ error: message }), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

async function checkUserAuthorization(
    env: Env, sub: string, username?: string, firstName?: string
): Promise<{ authorized: boolean; role: string }> {
    // Owner is always authorized
    if (sub === env.OWNER_SUB) {
        return { authorized: true, role: 'super_admin' };
    }

    // Check by sub (fast path for active users)
    const idFromSub = await env.ADMIN_USERS.get(`sub:${sub}`);
    if (idFromSub) {
        const user = await getUser(env.ADMIN_USERS, idFromSub);
        if (user && user.status === 'active') {
            return { authorized: true, role: effectiveRole(user.role) };
        }
    }

    // Check by username for unclaimed Telegram invitations. An email invite
    // that has not been claimed yet is not claimable from Telegram.
    if (username) {
        const normalizedUsername = username.toLowerCase();
        const user = await getUser(env.ADMIN_USERS, normalizedUsername);
        if (user && user.method !== 'email' && !user.sub && user.status === 'invited') {
            await claimInvitation(env.ADMIN_USERS, normalizedUsername, sub, firstName || null);
            return { authorized: true, role: effectiveRole(user.role) };
        }
    }

    return { authorized: false, role: '' };
}

/**
 * Google sign-in is invite-only, by verified email. The first sign-in links the
 * Google account (gsub:) so a later change of address on the Google side does
 * not lock the person out; after that the email index is only a fallback.
 */
async function checkGoogleAuthorization(
    env: Env, googleSub: string, email: string, firstName: string | null,
): Promise<{ authorized: boolean; role: string; userId: string }> {
    if (env.OWNER_EMAIL && email === env.OWNER_EMAIL.toLowerCase()) {
        return { authorized: true, role: 'super_admin', userId: 'owner' };
    }
    const kv = env.ADMIN_USERS;
    let id = await kv.get(`gsub:${googleSub}`);
    let user = id ? await getUser(kv, id) : null;
    if (!user) {
        id = await kv.get(`email:${email}`);
        user = id ? await getUser(kv, id) : null;
        // Already linked to a different Google account: that address alone is not enough.
        if (user && user.googleSub && user.googleSub !== googleSub) user = null;
    }
    if (!user || !id) return { authorized: false, role: '', userId: '' };

    if (user.googleSub !== googleSub || user.status !== 'active') {
        user.googleSub = googleSub;
        if (user.status !== 'active') {
            user.status = 'active';
            user.claimedAt = new Date().toISOString();
        }
        if (!user.firstName) user.firstName = firstName;
        await kv.put(`user:${id}`, JSON.stringify(user));
        await kv.put(`gsub:${googleSub}`, id);
    }
    return { authorized: true, role: effectiveRole(user.role), userId: id };
}

/**
 * Re-check an already-verified session JWT against KV on every request, and
 * re-derive role, features and grants from the record, so nothing below
 * trusts a week-old claim and a removed or demoted person loses access at
 * once. Telegram sessions resolve through `sub:`, Google ones (id `g:<sub>`)
 * through `gsub:`; both indexes are deleted by removeUser. The owner never
 * touches KV.
 */
async function revalidateSession(env: Env, payload: any): Promise<Session> {
    const none: Session = { valid: false, role: 'editor', userId: '', features: [], artifactGrants: [] };
    const owner: Session = { valid: true, role: 'super_admin', userId: 'owner', features: [...FEATURES], artifactGrants: [] };
    const sessionId = String(payload.id || '');
    if (sessionId === env.OWNER_SUB) return owner;
    if (payload.provider === 'google' && env.OWNER_EMAIL && payload.email === env.OWNER_EMAIL.toLowerCase()) return owner;

    const id = sessionId.startsWith('g:')
        ? await env.ADMIN_USERS.get(`gsub:${sessionId.slice(2)}`)
        : await env.ADMIN_USERS.get(`sub:${sessionId}`);
    if (!id) return none;
    const user = await getUser(env.ADMIN_USERS, id);
    if (!user || user.status !== 'active') return none;
    return {
        valid: true,
        role: effectiveRole(user.role),
        userId: id,
        features: knownFeatures(user.features),
        artifactGrants: user.artifactGrants || [],
    };
}

/** What mcp-oauth.ts needs from this Worker. `secret` is a key derived from JWT_SECRET, never JWT_SECRET. */
async function mcpDeps(env: Env): Promise<OAuthDeps> {
    return {
        kv: env.ADMIN_USERS as unknown as KvLike,
        secret: await mcpSigningKey(env.JWT_SECRET),
        resource: env.MCP_RESOURCE_URL || 'https://mncoleman.com/mcp/admin',
        rateLimit: checkRateLimit,
        // The admin-panel session behind the browser's cookie. Cookie only: an Authorization
        // header on an authorize request proves nothing about who is looking at the page.
        currentSession: async (request) => {
            const cookie = getCookieValue(request, 'admin_token');
            const payload = cookie ? await verifyJwt(cookie, env.JWT_SECRET) : null;
            if (!payload) return null;
            const session = await revalidateSession(env, payload);
            if (!session.valid) return null;
            return {
                userId: session.userId,
                role: session.role,
                identity: {
                    id: String(payload.id),
                    name: String(payload.name || payload.username || 'Admin'),
                    ...(payload.username ? { username: String(payload.username) } : {}),
                    ...(payload.email ? { email: String(payload.email) } : {}),
                    ...(payload.provider ? { provider: String(payload.provider) } : {}),
                },
            };
        },
    };
}

// --- Profile photos (see lib/avatar.ts for the rules) ---

function kvLike(kv: KVNamespace) {
    return { get: (k: string) => kv.get(k), put: (k: string, v: string) => kv.put(k, v) };
}

function randomHex(bytes: number): string {
    return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Reads a request body, giving up (and returning too many bytes to pass validation) past `limit`. */
async function readCapped(request: Request, limit: number) {
    if (!request.body) return new Uint8Array(0);
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        chunks.push(value);
        if (total >= limit) { await reader.cancel(); break; }
    }
    const out = new Uint8Array(Math.min(total, limit));
    let at = 0;
    for (const c of chunks) {
        const room = out.length - at;
        if (room <= 0) break;
        out.set(c.subarray(0, room), at);
        at += Math.min(c.byteLength, room);
    }
    return out;
}

/** The Telegram handle behind a session, if it has one. Email people and Google-signed-in owners have none. */
function sessionTelegramName(userId: string, payload: any): string {
    if (userId === 'owner') return payload.provider === 'google' ? '' : String(payload.username || '').toLowerCase();
    return /^[a-z0-9_]{1,32}$/.test(userId) ? userId : '';
}

/** The Telegram photo already in the profile cache. A KV read only: never a network lookup. */
async function cachedTelegramPhoto(env: Env, username: string, proxyOrigin: string | undefined): Promise<string | null> {
    const raw = await env.ADMIN_USERS.get(`profile:${username}`);
    if (!raw) return null;
    try { return sanitizeTelegramUrl(JSON.parse(raw)?.photoUrl, proxyOrigin); } catch { return null; }
}

interface AvatarViewOptions {
    /** Drop a Telegram photo whose URL names someone (t.me userpic, the Worker's own proxy path). */
    publicSafe?: boolean;
    /** With publicSafe: still allow the Worker's proxy path (owner-only lists, where handles are shown anyway). */
    allowProxy?: boolean;
}

function avatarStateOf(meta: AvatarMeta, origin: string, telegramFallback: string | null, opts: AvatarViewOptions = {}): AvatarState {
    let tg = meta.telegram?.url || telegramFallback;
    if (opts.publicSafe && tg && !isOpaqueTelegramUrl(tg) && !(opts.allowProxy && isTelegramProxyUrl(tg))) tg = null;
    return resolveAvatar({
        pin: meta.pin,
        upload: meta.upload ? uploadPhotoUrl(origin, meta.upload) : null,
        google: meta.google?.url,
        telegram: tg,
    });
}

/**
 * One person's photo state, the one resolver every surface uses. `telegramName` (or the handle
 * remembered at their last Telegram sign-in) finds the cached Telegram profile when no photo was
 * captured; `telegramFallback` supplies one directly.
 */
async function avatarStateFor(
    env: Env, id: string, telegramName: string, origin: string, telegramFallback: string | null = null, opts: AvatarViewOptions = {},
): Promise<AvatarState> {
    const meta = parseMeta(await env.ADMIN_USERS.get(avatarMetaKey(id)));
    const name = telegramName || meta.tgName || '';
    const tg = telegramFallback || (name && !meta.telegram ? await cachedTelegramPhoto(env, name, opts.publicSafe && !opts.allowProxy ? undefined : origin) : null);
    return avatarStateOf(meta, origin, tg, opts);
}

async function getUserList(kv: KVNamespace): Promise<string[]> {
    const raw = await kv.get('user_list');
    return raw ? JSON.parse(raw) : [];
}

async function getUser(kv: KVNamespace, id: string): Promise<AdminUser | null> {
    const raw = await kv.get(`user:${id}`);
    return raw ? JSON.parse(raw) : null;
}

async function inviteUser(
    kv: KVNamespace,
    input: { id: string; method: 'telegram' | 'email'; email: string | null } & UserInput,
): Promise<AdminUser> {
    const user: AdminUser = {
        id: input.id,
        username: input.method === 'telegram' ? input.id : '',
        method: input.method,
        email: input.email,
        sub: null,
        googleSub: null,
        firstName: null,
        status: 'invited',
        role: input.role,
        features: input.features,
        artifactGrants: input.artifactGrants,
        invitedAt: new Date().toISOString(),
        claimedAt: null,
    };
    await kv.put(`user:${input.id}`, JSON.stringify(user));
    if (input.email) await kv.put(`email:${input.email}`, input.id);
    const list = await getUserList(kv);
    if (!list.includes(input.id)) {
        list.push(input.id);
        await kv.put('user_list', JSON.stringify(list));
    }
    return user;
}

/** Moves the email index with the record. The caller writes the record itself. */
async function setUserEmail(kv: KVNamespace, user: AdminUser, email: string | null): Promise<void> {
    if (user.email && user.email !== email) await kv.delete(`email:${user.email}`);
    if (email) await kv.put(`email:${email}`, userId(user));
    user.email = email;
}

async function claimInvitation(kv: KVNamespace, username: string, sub: string, firstName: string | null): Promise<void> {
    const user = await getUser(kv, username);
    if (!user) return;
    user.sub = sub;
    user.firstName = firstName;
    user.status = 'active';
    user.claimedAt = new Date().toISOString();
    await kv.put(`user:${username}`, JSON.stringify(user));
    await kv.put(`sub:${sub}`, username);
}

/** Ends any Claude link `userId` holds on an artifact outside `keep`. Best effort. */
async function revokeLinks(env: Env, userId: string, keep: '*' | string[]): Promise<void> {
    if (keep === '*' || !env.ARTIFACTS_SERVICE_URL || !env.ARTIFACTS_JWT_SECRET) return;
    try {
        const jwt = await signArtifactsJwt(
            { sub: 'owner', role: 'super_admin', purpose: 'revoke-links', artifacts: '*', manageSecrets: true },
            env.ARTIFACTS_JWT_SECRET,
        );
        await fetch(`${env.ARTIFACTS_SERVICE_URL.replace(/\/$/, '')}/api/admin/links/revoke`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${jwt}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, keep }),
        });
    } catch (e) {
        console.error('revokeLinks failed:', e);
    }
}

async function dropGrant(kv: KVNamespace, slug: string): Promise<void> {
    for (const id of await getUserList(kv)) {
        const user = await getUser(kv, id);
        if (user?.artifactGrants?.includes(slug)) {
            user.artifactGrants = user.artifactGrants.filter((s) => s !== slug);
            await kv.put(`user:${id}`, JSON.stringify(user));
        }
    }
}

async function removeUser(kv: KVNamespace, id: string): Promise<void> {
    const user = await getUser(kv, id);
    if (user?.sub) await kv.delete(`sub:${user.sub}`);
    if (user?.googleSub) await kv.delete(`gsub:${user.googleSub}`);
    if (user?.email) await kv.delete(`email:${user.email}`);
    await kv.delete(`user:${id}`);
    await kv.delete(`profile:${id}`);
    await kv.delete(`avatar:${id}`);
    // Their MCP connections die with the account (an access token would already fail the KV re-check).
    try { await revokeGrantsFor(kv as unknown as KvLike, id); } catch (e) { console.error('[removeUser] revoking MCP connections failed:', e); }
    // The uploaded photo's bytes live under a random token that only the meta record knows.
    const photoMeta = parseMeta(await kv.get(avatarMetaKey(id)));
    if (photoMeta.upload) await kv.delete(`avatar-upload:${photoMeta.upload.token}`);
    await kv.delete(avatarMetaKey(id));
    const list = await getUserList(kv);
    const filtered = list.filter(u => u !== id);
    await kv.put('user_list', JSON.stringify(filtered));
}

async function getCachedProfile(env: Env, username: string, origin: string): Promise<{ firstName: string; photoUrl: string | null } | null> {
    const kv = env.ADMIN_USERS;
    const cached = await kv.get(`profile:${username}`);
    if (cached) {
        const parsed = JSON.parse(cached) as { firstName: string; photoUrl: string | null };
        // Entries written before the avatar proxy existed embed the bot token in the
        // photo URL and live for 7 days — treat those as a miss and re-resolve.
        if (!parsed.photoUrl?.startsWith('https://api.telegram.org/')) return parsed;
    }

    const profile = await resolveTelegramProfile(env, username, origin);
    if (!profile.found && !profile.photoUrl) return null;

    const result = { firstName: profile.firstName || username, photoUrl: profile.photoUrl };
    // Cache for 7 days
    await kv.put(`profile:${username}`, JSON.stringify(result), { expirationTtl: 60 * 60 * 24 * 7 });
    return result;
}

/**
 * Resolve a Telegram user's public profile (existence, name, avatar).
 *
 * Strategy:
 *  1. Bot API getChat — authoritative existence check + structured name.
 *  2. t.me Open Graph tags — token-free CDN avatar URL (preferred for display)
 *     plus a name fallback when the bot cannot see the user.
 *  3. Bot API photo — last-resort avatar only, served back through this Worker's
 *     /api/avatar proxy because the Bot API's own file URL embeds the bot token.
 *
 * `origin` is this Worker's own origin, used to build that proxy URL.
 */
async function resolveTelegramProfile(
    env: Env,
    username: string,
    origin: string,
): Promise<{ found: boolean; username: string; firstName: string | null; lastName: string | null; photoUrl: string | null }> {
    let found = false;
    let canonicalUsername = username;
    let firstName: string | null = null;
    let lastName: string | null = null;
    let photoUrl: string | null = null;
    let botPhotoFileId: string | null = null;

    // 1) Bot API — authoritative existence + structured name
    if (env.BOT_TOKEN) {
        try {
            const tgResp = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/getChat?chat_id=@${username}`);
            if (tgResp.ok) {
                const tgData = await tgResp.json() as any;
                if (tgData.ok && tgData.result) {
                    const chat = tgData.result;
                    found = true;
                    canonicalUsername = chat.username || username;
                    firstName = chat.first_name || null;
                    lastName = chat.last_name || null;
                    botPhotoFileId = chat.photo?.small_file_id || null;
                }
            }
        } catch (e) {
            console.error('Telegram getChat failed:', e);
        }
    }

    // 2) t.me Open Graph — token-free avatar + name fallback
    try {
        const profileResp = await fetch(`https://t.me/${username}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; mncoleman-admin)' },
        });
        if (profileResp.ok) {
            const html = await profileResp.text();
            const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/)?.[1];
            const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/)?.[1];

            if (ogImage) photoUrl = decodeHtmlEntities(ogImage);
            if (ogTitle && ogTitle !== 'Telegram') {
                found = true;
                if (!firstName) {
                    const parts = decodeHtmlEntities(ogTitle).split(' ');
                    firstName = parts[0] || null;
                    lastName = parts.slice(1).join(' ') || null;
                }
            }
        }
    } catch (e) {
        console.error('t.me profile lookup failed:', e);
    }

    // 3) Bot API avatar — last resort. Cache the (token-free, stable) file_id and hand
    //    out the Worker proxy URL; the resolved Bot API file URL carries the bot token
    //    and must never end up in an <img src>. file_ids are cached only here, and the
    //    proxy serves nothing else, so it can only ever return already-looked-up users.
    if (!photoUrl && botPhotoFileId && env.BOT_TOKEN) {
        try {
            const key = username.toLowerCase();
            // 8 days, one longer than the profile cache that points at it — same-instant
            // TTLs would let this key lapse first and 404 the avatar for the last hours
            // of an otherwise valid profile entry.
            await env.ADMIN_USERS.put(`avatar:${key}`, botPhotoFileId, { expirationTtl: 60 * 60 * 24 * 8 });
            photoUrl = `${origin}/api/avatar/${encodeURIComponent(key)}`;
        } catch (e) {
            console.error('Avatar file_id cache failed:', e);
        }
    }

    return { found, username: canonicalUsername, firstName, lastName, photoUrl };
}

function decodeHtmlEntities(s: string): string {
    return s
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}
