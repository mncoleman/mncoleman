/**
 * Self-test for worker/mcp-oauth.ts. No framework: `npx tsx worker/mcp-oauth.selftest.ts`.
 * Runs the whole flow (register, consent, code, token, refresh, revoke) against an
 * in-memory KV, then the things that must be refused.
 */
import {
    handleOAuth, isOAuthReturn, listGrants, mcpRouteAllowed, mcpSigningKey, oauthReturnPath, readMcpToken, redirectMatches, revokeGrant, validRedirectUri,
    type KvLike, type OAuthDeps,
} from './mcp-oauth';

let failed = 0;
function check(name: string, ok: unknown) {
    if (!ok) { failed++; console.error(`FAIL  ${name}`); } else console.log(`ok    ${name}`);
}

function memoryKv(): KvLike & { store: Map<string, string> } {
    const store = new Map<string, string>();
    return {
        store,
        get: async (k) => store.get(k) ?? null,
        put: async (k, v) => { store.set(k, v); },
        delete: async (k) => { store.delete(k); },
        list: async ({ prefix }) => ({ keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
    };
}

const ORIGIN = 'https://auth.test';
const RESOURCE = 'https://mncoleman.com/mcp/admin';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha = async (s: string) => b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));

async function main() {
    const kv = memoryKv();
    let signedIn = true;
    const deps: OAuthDeps = {
        kv,
        secret: await mcpSigningKey('jwt-secret-for-tests'),
        resource: RESOURCE,
        rateLimit: () => true,
        currentSession: async () => (signedIn ? { userId: 'owner', role: 'super_admin', identity: { id: '42', name: 'Zoë Tester' } } : null),
    };
    const call = (path: string, init?: RequestInit) => handleOAuth(new Request(ORIGIN + path, init), new URL(ORIGIN + path), deps) as Promise<Response>;
    const form = (o: Record<string, string>): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });

    // --- pure helpers ---
    check('claude callback is a valid redirect', validRedirectUri(CALLBACK));
    check('loopback http is a valid redirect', validRedirectUri('http://localhost:53112/callback'));
    check('any other https host is refused', !validRedirectUri('https://evil.example/callback'));
    check('javascript: is refused', !validRedirectUri('javascript:alert(1)'));
    check('loopback matches on another port', redirectMatches(['http://localhost:1/callback'], 'http://localhost:9999/callback'));
    check('loopback does not match another path', !redirectMatches(['http://localhost:1/callback'], 'http://localhost:1/other'));
    check('hosted callback is exact', !redirectMatches([CALLBACK], CALLBACK + '/x'));
    check('other paths fall through', (await handleOAuth(new Request(ORIGIN + '/api/users'), new URL(ORIGIN + '/api/users'), deps)) === null);
    check('whoami falls through', (await handleOAuth(new Request(ORIGIN + '/oauth/whoami'), new URL(ORIGIN + '/oauth/whoami'), deps)) === null);

    // --- metadata ---
    const meta = await (await call('/.well-known/oauth-authorization-server')).json() as any;
    check('metadata names the endpoints', meta.issuer === ORIGIN && meta.token_endpoint === `${ORIGIN}/oauth/token` && meta.registration_endpoint === `${ORIGIN}/oauth/register`);
    check('metadata requires S256', meta.code_challenge_methods_supported.join() === 'S256');

    // --- register ---
    const bad = await call('/oauth/register', { method: 'POST', body: JSON.stringify({ redirect_uris: ['https://evil.example/cb'] }) });
    check('registering a foreign redirect is refused', bad.status === 400);
    const reg = await call('/oauth/register', { method: 'POST', body: JSON.stringify({ client_name: '<b>Claude</b>', redirect_uris: [CALLBACK] }) });
    const client = await reg.json() as any;
    check('register returns a client', reg.status === 201 && typeof client.client_id === 'string');
    check('register stores nothing', kv.store.size === 0);
    check('a made-up client_id is not a client', (await call(`/oauth/authorize?${new URLSearchParams({ client_id: 'abcdefghijklmnop', redirect_uri: CALLBACK })}`)).status === 400);

    // --- authorize ---
    const verifier = 'v'.repeat(64);
    const q = new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: CALLBACK, state: 'st8', code_challenge: await sha(verifier), code_challenge_method: 'S256', resource: RESOURCE });

    signedIn = false;
    const signIn = await call(`/oauth/authorize?${q}`);
    const signInHtml = await signIn.text();
    check('signed out: a sign-in page, with the return cookie', signIn.status === 200 && signInHtml.includes('/auth/login?return=oauth') && (signIn.headers.get('Set-Cookie') || '').startsWith('mcp_oauth='));
    const cookieValue = (signIn.headers.get('Set-Cookie') || '').split(';')[0];
    const returnPath = oauthReturnPath(new Request(ORIGIN, { headers: { Cookie: cookieValue } }));
    check('the return path is the same authorize request', returnPath === `/oauth/authorize?${q}` && isOAuthReturn(returnPath));
    check('a foreign return path is not honoured', !isOAuthReturn('https://evil.example/') && !isOAuthReturn('/admin'));
    signedIn = true;

    const consent = await call(`/oauth/authorize?${q}`);
    const html = await consent.text();
    check('signed in: a consent page', consent.status === 200 && html.includes('name="mac"'));
    check('client name is escaped', html.includes('&lt;b&gt;Claude&lt;/b&gt;') && !html.includes('<b>Claude</b>?'));
    check('consent page warns about links from others', html.includes('just added this connector yourself'));
    check('consent page cannot be framed', consent.headers.get('X-Frame-Options') === 'DENY');
    const hidden = (name: string) => (html.match(new RegExp(`name="${name}" value="([^"]*)"`)) || [])[1].replace(/&amp;/g, '&');
    const approval = { q: hidden('q'), exp: hidden('exp'), mac: hidden('mac'), decision: 'approve' };

    check('no PKCE: sent back with an error', ((await call(`/oauth/authorize?${new URLSearchParams({ response_type: 'code', client_id: client.client_id, redirect_uri: CALLBACK })}`)).headers.get('Location') || '').includes('error=invalid_request'));
    check('unregistered redirect: an error page, no redirect', (await call(`/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(q), redirect_uri: 'https://claude.ai/elsewhere' })}`)).status === 400);
    check('wrong resource: invalid_target', ((await call(`/oauth/authorize?${new URLSearchParams({ ...Object.fromEntries(q), resource: 'https://other.example/mcp' })}`)).headers.get('Location') || '').includes('invalid_target'));

    check('approval with a forged mac is refused', (await call('/oauth/authorize', form({ ...approval, mac: 'x'.repeat(43) }))).status === 403);
    check('approval for a tampered request is refused', (await call('/oauth/authorize', form({ ...approval, q: approval.q.replace('st8', 'st9') }))).status === 403);
    check('approval from another origin is refused', (await call('/oauth/authorize', { ...form(approval), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example' } })).status === 403);
    signedIn = false;
    check('approval without a session is refused', (await call('/oauth/authorize', form(approval))).status === 401);
    signedIn = true;

    const denied = await call('/oauth/authorize', form({ ...approval, decision: 'deny' }));
    check('deny goes back with access_denied', (denied.headers.get('Location') || '').includes('error=access_denied'));

    const approved = await call('/oauth/authorize', form(approval));
    const back = new URL(approved.headers.get('Location') || 'https://none');
    const code = back.searchParams.get('code') || '';
    check('approve goes back with a code, state and iss', approved.status === 302 && back.origin + back.pathname === CALLBACK && !!code && back.searchParams.get('state') === 'st8' && back.searchParams.get('iss') === ORIGIN);

    // --- token ---
    const exchange = { grant_type: 'authorization_code', code, client_id: client.client_id, redirect_uri: CALLBACK, code_verifier: verifier };
    check('wrong verifier is refused', (await call('/oauth/token', form({ ...exchange, code_verifier: 'w'.repeat(64) }))).status === 400);
    check('wrong client is refused', (await call('/oauth/token', form({ ...exchange, client_id: 'someone-else-entirely' }))).status === 400);
    const tokRes = await call('/oauth/token', form(exchange));
    const tok = await tokRes.json() as any;
    check('code exchanges for tokens', tokRes.status === 200 && tok.token_type === 'Bearer' && tok.expires_in === 3600 && !!tok.refresh_token);
    check('token response is not cacheable', tokRes.headers.get('Cache-Control') === 'no-store');
    check('the code cannot be used twice', (await call('/oauth/token', form(exchange))).status === 400);

    const read = await readMcpToken(tok.access_token, deps);
    check('access token reads back with its grant', read?.claims.id === '42' && read?.claims.name === 'Zoë Tester' && read?.grant.userId === 'owner');
    check('a code is not an access token', (await readMcpToken(code, deps)) === null);
    check('an access token is not a code', (await call('/oauth/token', form({ ...exchange, code: tok.access_token }))).status === 400);
    check('a token signed with JWT_SECRET itself is refused', (await readMcpToken(tok.access_token, { ...deps, secret: 'jwt-secret-for-tests' })) === null);
    check('a token for another resource is refused', (await readMcpToken(tok.access_token, { ...deps, resource: 'https://other.example/mcp' })) === null);
    const [h, p] = tok.access_token.split('.');
    check('a tampered token is refused', (await readMcpToken(`${h}.${p}.AAAA`, deps)) === null);
    check('garbage is refused without throwing', (await readMcpToken('not.a.jwt', deps)) === null && (await readMcpToken('', deps)) === null);

    // --- refresh ---
    const refreshed = await call('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: client.client_id }));
    const tok2 = await refreshed.json() as any;
    check('refresh returns a rotated token', refreshed.status === 200 && tok2.refresh_token !== tok.refresh_token);
    check('the previous refresh token still works once (KV lag)', (await call('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id: client.client_id }))).status === 200);
    check('a made-up refresh token is refused', (await call('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: `${read!.grant.id}.nope`, client_id: client.client_id }))).status === 400);
    check('refresh for another client is refused', (await call('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: tok2.refresh_token, client_id: 'someone-else-entirely' }))).status === 400);

    // --- a superseded refresh token long after rotation ends the connection ---
    {
        const a1 = (await call('/oauth/authorize', form(approval))).headers.get('Location')!;
        const t1 = await (await call('/oauth/token', form({ ...exchange, code: new URL(a1).searchParams.get('code')! }))).json() as any;
        const t2 = await (await call('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: client.client_id }))).json() as any;
        const gid = t1.refresh_token.split('.')[0];
        const g = JSON.parse(kv.store.get(`mcp:grant:${gid}`)!);
        kv.store.set(`mcp:grant:${gid}`, JSON.stringify({ ...g, rotatedAt: Date.now() - 10 * 60 * 1000 }));
        check('an old refresh token after the grace window is refused', (await call('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: t1.refresh_token, client_id: client.client_id }))).status === 400);
        check('...and that ends the connection for both holders', (await readMcpToken(t2.access_token, deps)) === null);
        check('a huge grant id does not reach KV', (await call('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: 'x'.repeat(2000) + '.y', client_id: client.client_id }))).status === 400);
    }

    // --- connections ---
    const grants = await listGrants(kv);
    check('one connection is listed', grants.length === 1 && grants[0].app === '<b>Claude</b>' && grants[0].who === 'Zoë Tester');
    check('nobody else can see it', (await listGrants(kv, 'someone')).length === 0);
    check('nobody else can revoke it', !(await revokeGrant(kv, grants[0].id, 'someone')));
    check('its owner can revoke it', await revokeGrant(kv, grants[0].id, 'owner'));
    check('a revoked connection: access token dead', (await readMcpToken(tok2.access_token, deps)) === null);
    check('a revoked connection: refresh token dead', (await call('/oauth/token', form({ grant_type: 'refresh_token', refresh_token: tok2.refresh_token, client_id: client.client_id }))).status === 400);

    // --- the route fence ---
    const mp = 'multipart/form-data; boundary=x';
    const allowed: [string, string, string?][] = [
        ['GET', '/oauth/whoami'], ['GET', '/api/artifacts/instant/list'], ['POST', '/api/artifacts', mp],
        ['PATCH', '/api/artifacts/instant/my-slug'], ['DELETE', '/api/artifacts/instant/my-slug'],
        ['POST', '/api/library'], ['PATCH', '/api/library/my-skill'],
        ['GET', '/api/posts'], ['GET', '/api/posts/my-post'], ['PUT', '/api/posts/my-post/draft'],
    ];
    for (const [m, path, ct] of allowed) check(`allowed  ${m} ${path}`, mcpRouteAllowed(m, path, ct || 'application/json'));
    const refused: [string, string, string?][] = [
        ['POST', '/api/artifacts'], ['GET', '/api/artifacts'], ['DELETE', '/api/library/my-skill'],
        ['POST', '/api/posts/my-post/publish'], ['POST', '/api/posts/my-post/unpublish'], ['DELETE', '/api/posts/my-post'], ['DELETE', '/api/posts/my-post/draft'],
        ['GET', '/api/users'], ['POST', '/api/users'], ['POST', '/api/trigger'], ['GET', '/api/analytics/summary'],
        ['PUT', '/api/collections/projects'], ['POST', '/api/collections/images'], ['GET', '/api/mcp/grants'], ['DELETE', '/api/mcp/grants/abcdefghijkl'],
        ['GET', '/auth/me'], ['PATCH', '/api/artifacts/instant/a/b'], ['GET', '/api/artifacts/instant/my-slug/preview-token'], ['GET', '/api/posts/my-post/draft'],
    ];
    for (const [m, path, ct] of refused) check(`refused  ${m} ${path}`, !mcpRouteAllowed(m, path, ct || 'application/json'));

    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
