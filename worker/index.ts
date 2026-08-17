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
}

interface AdminUser {
    username: string;
    sub: string | null;
    firstName: string | null;
    status: 'invited' | 'active';
    role: 'admin';
    invitedAt: string;
    claimedAt: string | null;
}

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

    async fetch(request: Request, env: Env): Promise<Response> {
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

                const oauthData = JSON.stringify({ codeVerifier, state });
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

                // Issue session JWT with role
                const name = idPayload.first_name || tgUsername || 'Admin';
                const sessionToken = await signJwt({
                    id: idPayload.sub, name, role: authResult.role, username: tgUsername
                }, env.JWT_SECRET);


                // Pass token via both cookie (desktop) and URL fragment (mobile fallback)
                const headers = new Headers();
                headers.append('Location', `${frontendAdmin}#session_token=${sessionToken}`);
                headers.append('Set-Cookie', 'oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
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

                return new Response(JSON.stringify({ user: {
                    name: payload.name, id: payload.id, role: session.role, username: payload.username
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
            const authPayload = token ? await verifyJwt(token, env.JWT_SECRET) : null;

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
                const jwt = await signArtifactsJwt(
                    { sub: authPayload.id || authPayload.username || 'admin', role: authPayload.role, purpose: 'artifact-list' },
                    env.ARTIFACTS_JWT_SECRET
                );
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
                const jwt = await signArtifactsJwt(
                    { sub: authPayload.id || authPayload.username || 'admin', role: authPayload.role, purpose: 'artifact-edit' },
                    env.ARTIFACTS_JWT_SECRET
                );
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
                const jwt = await signArtifactsJwt(
                    { sub: authPayload.id || authPayload.username || 'admin', role: authPayload.role, purpose: 'artifact-delete' },
                    env.ARTIFACTS_JWT_SECRET
                );
                const upstream = await fetch(`${env.ARTIFACTS_SERVICE_URL.replace(/\/$/, '')}/api/${encodeURIComponent(slug)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${jwt}` },
                });
                const text = await upstream.text();
                return new Response(text, {
                    status: upstream.status,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            // "A"I library item create: JSON body forwarded directly — no multipart/duplex
            // streaming needed here, these are small text payloads, not files.
            if (url.pathname === '/api/library' && request.method === 'POST') {
                if (!env.ARTIFACTS_SERVICE_URL || !env.ARTIFACTS_JWT_SECRET) {
                    return new Response(
                        JSON.stringify({ error: 'Library service not configured' }),
                        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                    );
                }
                const jwt = await signArtifactsJwt(
                    { sub: authPayload.id || authPayload.username || 'admin', role: authPayload.role, purpose: 'library-create' },
                    env.ARTIFACTS_JWT_SECRET
                );
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

            // "A"I library item edit: JSON body forwarded directly.
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
                const jwt = await signArtifactsJwt(
                    { sub: authPayload.id || authPayload.username || 'admin', role: authPayload.role, purpose: 'library-edit' },
                    env.ARTIFACTS_JWT_SECRET
                );
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

            // "A"I library item delete.
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
                const jwt = await signArtifactsJwt(
                    { sub: authPayload.id || authPayload.username || 'admin', role: authPayload.role, purpose: 'library-delete' },
                    env.ARTIFACTS_JWT_SECRET
                );
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

            // Visitor globe: list all pins (incl. hidden) for the admin panel.
            if (url.pathname === '/api/admin/visitors' && request.method === 'GET') {
                if (!env.ARTIFACTS_SERVICE_URL || !env.ARTIFACTS_JWT_SECRET) {
                    return new Response(JSON.stringify({ error: 'Visitor service not configured' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
                const jwt = await signArtifactsJwt(
                    { sub: authPayload.id || authPayload.username || 'admin', role: authPayload.role, purpose: 'visitors-list' },
                    env.ARTIFACTS_JWT_SECRET
                );
                const upstream = await fetch(`${env.ARTIFACTS_SERVICE_URL.replace(/\/$/, '')}/api/admin/visitors`, {
                    headers: { 'Authorization': `Bearer ${jwt}` },
                });
                const text = await upstream.text();
                return new Response(text, { status: upstream.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            // Visitor globe: delete a pin.
            if (url.pathname.startsWith('/api/admin/visitors/') && request.method === 'DELETE') {
                if (!env.ARTIFACTS_SERVICE_URL || !env.ARTIFACTS_JWT_SECRET) {
                    return new Response(JSON.stringify({ error: 'Visitor service not configured' }), { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
                const id = decodeURIComponent(url.pathname.split('/').pop() || '');
                if (!/^[a-f0-9-]{8,64}$/i.test(id)) {
                    return new Response(JSON.stringify({ error: 'invalid id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
                }
                const jwt = await signArtifactsJwt(
                    { sub: authPayload.id || authPayload.username || 'admin', role: authPayload.role, purpose: 'visitors-delete' },
                    env.ARTIFACTS_JWT_SECRET
                );
                const upstream = await fetch(`${env.ARTIFACTS_SERVICE_URL.replace(/\/$/, '')}/api/admin/visitors/${encodeURIComponent(id)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${jwt}` },
                });
                const text = await upstream.text();
                return new Response(text, { status: upstream.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
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
                        const jwt = await signArtifactsJwt(
                            { sub: authPayload.id || authPayload.username || 'admin', role: authPayload.role, purpose: 'artifact-upload' },
                            env.ARTIFACTS_JWT_SECRET
                        );
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

                        const jwt = await signArtifactsJwt(
                            { sub: authPayload.id || authPayload.username || 'admin', role: authPayload.role, purpose: 'artifact-upload' },
                            env.ARTIFACTS_JWT_SECRET
                        );

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

            // User management endpoints (super_admin only)
            if (url.pathname === '/api/users') {
                if (authPayload.role !== 'super_admin') {
                    return new Response('Forbidden', { status: 403, headers: corsHeaders });
                }

                if (request.method === 'GET') {
                    const userList = await getUserList(env.ADMIN_USERS);
                    const users: any[] = [];

                    // Owner — enrich with cached profile
                    const ownerUsername = authPayload.username || '';
                    const ownerProfile = ownerUsername
                        ? await getCachedProfile(env, ownerUsername, url.origin)
                        : null;
                    users.push({
                        username: ownerUsername,
                        sub: authPayload.id,
                        firstName: ownerProfile?.firstName || authPayload.name,
                        status: 'active',
                        role: 'super_admin',
                        invitedAt: '',
                        claimedAt: '',
                        photoUrl: ownerProfile?.photoUrl || null,
                    });

                    for (const uname of userList) {
                        const user = await getUser(env.ADMIN_USERS, uname);
                        if (user) {
                            const profile = await getCachedProfile(env, uname, url.origin);
                            users.push({ ...user, photoUrl: profile?.photoUrl || null });
                        }
                    }

                    return new Response(JSON.stringify({ users }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                if (request.method === 'POST') {
                    const body = await request.json() as { username: string };
                    let username = (body.username || '').toLowerCase().replace(/^@/, '');
                    if (!/^[a-z0-9_]{1,32}$/.test(username)) {
                        return new Response('Invalid username', { status: 400, headers: corsHeaders });
                    }

                    const existing = await getUser(env.ADMIN_USERS, username);
                    if (existing) {
                        return new Response('User already exists', { status: 409, headers: corsHeaders });
                    }

                    const user = await inviteUser(env.ADMIN_USERS, username);
                    return new Response(JSON.stringify({ user }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                if (request.method === 'DELETE') {
                    const username = url.searchParams.get('username')?.toLowerCase().replace(/^@/, '');
                    if (!username) {
                        return new Response('Missing username', { status: 400, headers: corsHeaders });
                    }

                    await removeUser(env.ADMIN_USERS, username);
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
                if (!username || !/^[a-z0-9_]{1,32}$/.test(username)) {
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
async function signArtifactsJwt(payload: Record<string, unknown>, secret: string): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const claims = { ...payload, iat: now, exp: now + 60, aud: 'artifacts-service' };
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

    const res = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${env.GA_PROPERTY_ID}:batchRunReports`,
        {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }
    );

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`GA4 Data API error (${res.status}): ${text.slice(0, 300)}`);
    }

    const data = await res.json() as { reports?: { rows?: GaRow[] }[] };
    const reports = data.reports || [];

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

    const decodedPayload = JSON.parse(atobUrl(payload));
    if (decodedPayload.exp < Math.floor(Date.now() / 1000)) return null;

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

async function checkUserAuthorization(
    env: Env, sub: string, username?: string, firstName?: string
): Promise<{ authorized: boolean; role: string }> {
    // Owner is always authorized
    if (sub === env.OWNER_SUB) {
        return { authorized: true, role: 'super_admin' };
    }

    // Check by sub (fast path for active users)
    const usernameFromSub = await env.ADMIN_USERS.get(`sub:${sub}`);
    if (usernameFromSub) {
        const user = await getUser(env.ADMIN_USERS, usernameFromSub);
        if (user && user.status === 'active') {
            return { authorized: true, role: user.role };
        }
    }

    // Check by username for unclaimed invitations
    if (username) {
        const normalizedUsername = username.toLowerCase();
        const user = await getUser(env.ADMIN_USERS, normalizedUsername);
        if (user && user.status === 'invited') {
            await claimInvitation(env.ADMIN_USERS, normalizedUsername, sub, firstName || null);
            return { authorized: true, role: user.role };
        }
    }

    return { authorized: false, role: '' };
}

/**
 * Re-check an already-verified session JWT against KV, in one read.
 *
 * Keyed on `sub:` rather than `user:<username>` deliberately: `sub:` is written by
 * claimInvitation and deleted by removeUser, so its presence means "still an active
 * admin", and an admin who changed their Telegram username after claiming the invite
 * is not locked out. Only the owner is ever super_admin, and that comes from
 * OWNER_SUB, never KV — so the owner short-circuits with zero reads.
 */
async function revalidateSession(env: Env, payload: any): Promise<{ valid: boolean; role: string }> {
    if (String(payload.id) === env.OWNER_SUB) {
        return { valid: true, role: 'super_admin' };
    }
    const username = await env.ADMIN_USERS.get(`sub:${payload.id}`);
    if (!username) return { valid: false, role: '' };
    return { valid: true, role: 'admin' };
}

async function getUserList(kv: KVNamespace): Promise<string[]> {
    const raw = await kv.get('user_list');
    return raw ? JSON.parse(raw) : [];
}

async function getUser(kv: KVNamespace, username: string): Promise<AdminUser | null> {
    const raw = await kv.get(`user:${username}`);
    return raw ? JSON.parse(raw) : null;
}

async function inviteUser(kv: KVNamespace, username: string): Promise<AdminUser> {
    const user: AdminUser = {
        username,
        sub: null,
        firstName: null,
        status: 'invited',
        role: 'admin',
        invitedAt: new Date().toISOString(),
        claimedAt: null,
    };
    await kv.put(`user:${username}`, JSON.stringify(user));
    const list = await getUserList(kv);
    if (!list.includes(username)) {
        list.push(username);
        await kv.put('user_list', JSON.stringify(list));
    }
    return user;
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

async function removeUser(kv: KVNamespace, username: string): Promise<void> {
    const user = await getUser(kv, username);
    if (user?.sub) {
        await kv.delete(`sub:${user.sub}`);
    }
    await kv.delete(`user:${username}`);
    await kv.delete(`profile:${username}`);
    await kv.delete(`avatar:${username}`);
    const list = await getUserList(kv);
    const filtered = list.filter(u => u !== username);
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
