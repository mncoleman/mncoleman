
export interface Env {
    BOT_TOKEN: string; // Secret
    JWT_SECRET: string; // Secret
    ALLOWED_USER_ID: string; // Your Telegram ID
    GITHUB_TOKEN: string; // Secret
    GITHUB_REPO_OWNER: string;
    GITHUB_REPO_NAME: string;
    N8N_WEBHOOK_URL: string; // Optional
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const allowedOrigins = ['https://mncoleman.com', 'https://www.mncoleman.com', 'http://localhost:3000'];
        const origin = request.headers.get('Origin');
        const activeOrigin = allowedOrigins.includes(origin || '') ? origin! : allowedOrigins[0];

        const corsHeaders = {
            'Access-Control-Allow-Origin': activeOrigin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
            'Access-Control-Allow-Credentials': 'true',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
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

        // Login endpoint
        if (url.pathname === '/auth/login' && request.method === 'POST') {
            try {
                const body = await request.json() as any;
                const isValid = await verifyTelegramAuth(body, env.BOT_TOKEN);

                if (!isValid) {
                    return new Response('Invalid authentication', { status: 401, headers: corsHeaders });
                }

                // Handle string vs number comparison safely
                if (String(body.id) !== String(env.ALLOWED_USER_ID)) {
                    return new Response(`Unauthorized user ID: ${body.id}`, { status: 403, headers: corsHeaders });
                }

                // Issue JWT
                const token = await signJwt({ id: body.id, name: body.first_name }, env.JWT_SECRET);

                // Set Secure, httpOnly Cookie
                const cookie = `admin_token=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${60 * 60 * 24 * 7}`;

                return new Response(JSON.stringify({ user: { name: body.first_name, id: body.id } }), {
                    headers: {
                        ...corsHeaders,
                        'Content-Type': 'application/json',
                        'Set-Cookie': cookie
                    }
                });
            } catch (e) {
                return new Response('Server Error: ' + (e as Error).message, { status: 500, headers: corsHeaders });
            }
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
            const cookie = `admin_token=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
            return new Response(JSON.stringify({ success: true }), {
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                    'Set-Cookie': cookie
                }
            });
        }

        // Authenticated Endpoints
        const token = getAuthToken(request);
        if (!token) {
            if (url.pathname.startsWith('/api/')) {
                return new Response('Missing token', { status: 401, headers: corsHeaders });
            }
        } else {
            const payload = await verifyJwt(token, env.JWT_SECRET);
            if (!payload) {
                if (url.pathname.startsWith('/api/')) {
                    return new Response('Invalid token', { status: 401, headers: corsHeaders });
                }
            }
        }

        // Trigger Action endpoint
        if (url.pathname === '/api/trigger' && request.method === 'POST') {
            const body = await request.json() as { action: string, data?: any };

            // Handle actions
            if (body.action === 'github_dispatch') {
                const resp = await triggerGitHubDispatch(env, body.data?.event_type || 'admin_trigger');
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

        // Content Management Endpoints
        if (url.pathname === '/api/content') {
            if (request.method === 'GET') {
                const path = 'data/about.json'; // Hardcoded for now, could be query param
                const localUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/${path}`;

                const resp = await fetch(localUrl, {
                    headers: {
                        'Authorization': `token ${env.GITHUB_TOKEN}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Cloudflare-Worker'
                    }
                });

                if (!resp.ok) return new Response('Failed to fetch content', { status: resp.status, headers: corsHeaders });
                const data = await resp.json() as any;
                const content = atob(data.content); // Decode Base64
                return new Response(JSON.stringify({ content, sha: data.sha }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }

            if (request.method === 'POST') {
                const body = await request.json() as { content: string, sha: string, message?: string };
                const path = 'data/about.json';
                const localUrl = `https://api.github.com/repos/${env.GITHUB_REPO_OWNER}/${env.GITHUB_REPO_NAME}/contents/${path}`;

                const updateBody = {
                    message: body.message || 'Update content via Admin Dashboard',
                    content: btoa(body.content), // Encode Base64
                    sha: body.sha
                };

                const resp = await fetch(localUrl, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${env.GITHUB_TOKEN}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Cloudflare-Worker'
                    },
                    body: JSON.stringify(updateBody)
                });

                if (!resp.ok) {
                    const errText = await resp.text();
                    return new Response(`Failed to update content: ${errText}`, { status: resp.status, headers: corsHeaders });
                }

                return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
        }

        return new Response('Not Found', { status: 404, headers: corsHeaders });
    },
};

// --- Helpers ---

// Extract token from Authorization header or Cookie
function getAuthToken(request: Request): string | null {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        return authHeader.split(' ')[1];
    }

    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc: any, cookie) => {
            const [key, value] = cookie.trim().split('=');
            acc[key] = value;
            return acc;
        }, {});
        return cookies.admin_token || null;
    }

    return null;
}

// Verify Telegram Auth Data
// See: https://core.telegram.org/widgets/login#checking-authorization
async function verifyTelegramAuth(data: any, botToken: string): Promise<boolean> {
    const { hash, ...userData } = data;
    if (!hash || !userData) return false;

    // Check if auth is stale (e.g. older than 24h)
    const authDate = userData.auth_date;
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) return false;

    // Create check string
    const checkString = Object.keys(userData)
        .sort()
        .map((key) => `${key}=${userData[key]}`)
        .join('\n');

    // Compute secret key: SHA256(botToken)
    const encoder = new TextEncoder();
    const secretKey = await crypto.subtle.digest('SHA-256', encoder.encode(botToken));

    // Compute HMAC-SHA256 signature
    const key = await crypto.subtle.importKey(
        'raw',
        secretKey,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );

    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(checkString)
    );

    // Convert to hex
    const signatureHex = [...new Uint8Array(signature)]
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

    return signatureHex === hash;
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

    if (signature !== computedSignature) return null;

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
