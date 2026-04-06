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
    TELEGRAM_BOT_ID: string;        // Bot's numeric ID — OIDC client_id
    TELEGRAM_CLIENT_SECRET: string;  // From BotFather — OIDC client_secret
    JWT_SECRET: string;              // Signs session JWTs
    ALLOWED_USER_ID: string;         // Your Telegram user ID
    FRONTEND_URL: string;            // e.g. https://mncoleman.com
    GITHUB_TOKEN: string;
    GITHUB_REPO_OWNER: string;
    GITHUB_REPO_NAME: string;
    N8N_WEBHOOK_URL: string;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const allowedOrigins = ['https://mncoleman.com', 'https://www.mncoleman.com', 'http://localhost:3000'];
        const origin = request.headers.get('Origin');

        // Handle CORS preflight and standard headers
        const isAllowedOrigin = allowedOrigins.includes(origin || '');
        const activeOrigin = isAllowedOrigin ? origin! : '';

        const corsHeaders: Record<string, string> = {
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
            'Access-Control-Allow-Credentials': 'true',
            'Vary': 'Origin',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'Referrer-Policy': 'strict-origin-when-cross-origin',
        };

        if (activeOrigin) {
            corsHeaders['Access-Control-Allow-Origin'] = activeOrigin;
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

                // Check user ID against allowlist

                if (String(idPayload.sub) !== String(env.ALLOWED_USER_ID)) {
                    return Response.redirect(`${frontendAdmin}?auth_error=unauthorized`, 302);
                }

                // Issue session JWT
                const name = idPayload.first_name || idPayload.username || 'Admin';
                const sessionToken = await signJwt({ id: idPayload.sub, name }, env.JWT_SECRET);


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

                return new Response(JSON.stringify({ user: { name: payload.name, id: payload.id } }), {
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

            // Authenticated Endpoints — fail-closed: reject if no valid token
            const token = getAuthToken(request);
            const authPayload = token ? await verifyJwt(token, env.JWT_SECRET) : null;

            if (!authPayload) {
                return new Response('Unauthorized', { status: 401, headers: corsHeaders });
            }

            // Trigger Action endpoint
            if (url.pathname === '/api/trigger' && request.method === 'POST') {
                const body = await request.json() as { action: string, data?: any };

                // Handle actions
                if (body.action === 'github_dispatch') {
                    const allowedEventTypes = ['admin_trigger', 'rebuild_site', 'sync_notion', 'content_update'];
                    const eventType = allowedEventTypes.includes(body.data?.event_type) ? body.data.event_type : 'admin_trigger';
                    const resp = await triggerGitHubDispatch(env, eventType);
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
                    const content = atob(data.content);
                    return new Response(JSON.stringify({ artifacts: JSON.parse(content) }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }

                if (request.method === 'POST') {
                    const body = await request.json() as {
                        filename: string;
                        name?: string;
                        content: string; // base64-encoded file content
                        type: string;
                        size: number;
                        description?: string;
                    };

                    if (!body.filename || !body.content) {
                        return new Response('Missing filename or content', { status: 400, headers: corsHeaders });
                    }

                    // Sanitize filename: only allow alphanumeric, hyphens, underscores, dots
                    const safeFilename = body.filename.replace(/[^a-zA-Z0-9._-]/g, '_');

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
                        artifacts = JSON.parse(atob(manifestData.content));
                    }

                    // Remove existing entry with same filename if overwriting
                    artifacts = artifacts.filter((a: any) => a.filename !== safeFilename);

                    const newArtifact = {
                        id: crypto.randomUUID(),
                        name: body.name || safeFilename.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '),
                        filename: safeFilename,
                        description: body.description || '',
                        type: body.type || 'application/octet-stream',
                        size: body.size || 0,
                        uploadedAt: new Date().toISOString(),
                    };
                    artifacts.push(newArtifact);

                    const manifestUpdateBody: any = {
                        message: `Update artifacts manifest: add ${safeFilename}`,
                        content: btoa(JSON.stringify(artifacts, null, 2)),
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
                    const artifacts = JSON.parse(atob(manifestData.content));
                    const idx = artifacts.findIndex((a: any) => a.filename === safeFilename);

                    if (idx === -1) {
                        return new Response('Artifact not found', { status: 404, headers: corsHeaders });
                    }

                    if (body.name !== undefined) artifacts[idx].name = body.name;
                    if (body.description !== undefined) artifacts[idx].description = body.description;
                    if (body.content) {
                        artifacts[idx].type = body.type || artifacts[idx].type;
                        artifacts[idx].size = body.size || artifacts[idx].size;
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
                            content: btoa(JSON.stringify(artifacts, null, 2)),
                            sha: manifestData.sha,
                        }),
                    });

                    if (!manifestUpdateResp.ok) {
                        const errText = await manifestUpdateResp.text();
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

                    if (fileResp.ok) {
                        const fileData = await fileResp.json() as any;
                        await fetch(fileUrl, {
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

                    if (manifestResp.ok) {
                        const manifestData = await manifestResp.json() as any;
                        const artifacts = JSON.parse(atob(manifestData.content));
                        const filtered = artifacts.filter((a: any) => a.filename !== safeFilename);

                        await fetch(manifestUrl, {
                            method: 'PUT',
                            headers: {
                                'Authorization': `token ${env.GITHUB_TOKEN}`,
                                'Accept': 'application/vnd.github.v3+json',
                                'User-Agent': 'Cloudflare-Worker',
                            },
                            body: JSON.stringify({
                                message: `Update artifacts manifest: remove ${safeFilename}`,
                                content: btoa(JSON.stringify(filtered, null, 2)),
                                sha: manifestData.sha,
                            }),
                        });
                    }

                    return new Response(JSON.stringify({ success: true }), {
                        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    });
                }
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

async function triggerGitHubDispatch(env: Env, eventType: string) {
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPO_OWNER || !env.GITHUB_REPO_NAME) {
        return { error: 'GitHub vars missing', ok: false };
    }

    const url = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/dispatches`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `token ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Cloudflare-Worker'
        },
        body: JSON.stringify({ event_type: eventType })
    });

    if (!response.ok) {
        const text = await response.text();
        return { ok: false, status: response.status, error: text };
    }

    return { status: response.status, ok: response.ok };
}
