/**
 * mncoleman-site-mcp — the public, unauthenticated MCP server for mncoleman.com.
 *
 * Deliberately a SEPARATE Worker from `worker/` (mncoleman-admin-auth):
 *   - it holds no secrets at all (the admin Worker holds JWT_SECRET, GITHUB_TOKEN
 *     and the GA service-account key),
 *   - the admin Worker gates every non-GET request behind an Origin allowlist and
 *     an X-Requested-With CSRF header, which arbitrary MCP clients cannot send,
 *   - it owns the `mncoleman.com/mcp*` route on the Cloudflare-proxied apex, so
 *     the admin Worker's workers.dev binding stays untouched.
 *
 * Data sources, all already public:
 *   - https://mncoleman.com/data/site-content.json — built by
 *     scripts/generate-search-index.ts at site build time (Notion content).
 *   - https://artifacts.mncoleman.com/api/list — instant artifacts (the service
 *     filters `visibility: private` out of this endpoint itself).
 *   - https://artifacts.mncoleman.com/api/library/list — the "A"I library.
 *
 * Protocol: stateless-first per MCP 2026-07-28 (SEP-2575), with the legacy
 * `initialize` handshake still implemented so today's clients work. See
 * PROTOCOL_VERSIONS below.
 */

export interface Env {
    SITE_URL: string;
    ARTIFACTS_SERVICE_URL: string;
}

/**
 * Newest first. 2026-07-28 is the stateless core; the two older entries still
 * accept the `initialize` handshake, which is what every shipping client speaks
 * as of this writing.
 */
const PROTOCOL_VERSIONS = ['2026-07-28', '2025-06-18', '2025-03-26'] as const;

const STATELESS_VERSION = '2026-07-28';

const SERVER_INFO = {
    name: 'mncoleman-site',
    title: 'mncoleman.com',
    version: '1.0.0',
};

const INSTRUCTIONS =
    'Read-only access to the public content of mncoleman.com — Matthew Coleman\'s personal site. ' +
    'Use search_site for open-ended questions, then the specific getters for full text. ' +
    'Blog posts, projects, resources and the resume come from Notion and are rebuilt daily, so ' +
    'content can lag the live site by up to a day. Everything here is already published publicly.';

// JSON-RPC error codes. The last two are new in 2026-07-28 (SEP-2575).
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
const UNSUPPORTED_PROTOCOL_VERSION = -32022;

const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): boolean {
    const now = Date.now();
    const entry = rateLimitMap.get(key);
    if (!entry || entry.resetAt <= now) {
        rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        return true;
    }
    if (entry.count >= RATE_LIMIT_MAX) return false;
    entry.count++;
    return true;
}

/**
 * Wide-open CORS: this endpoint is public and unauthenticated by design, and
 * browser-based clients (the MCP Inspector, connector setup UIs) preflight with
 * headers the admin Worker's allowlist does not include. No credentials are ever
 * accepted, so `*` carries no risk here.
 */
const CORS_HEADERS: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
        'Content-Type, Accept, Authorization, MCP-Protocol-Version, Mcp-Session-Id, Mcp-Method, Mcp-Name, Last-Event-ID',
    'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version',
    'Access-Control-Max-Age': '86400',
    'X-Content-Type-Options': 'nosniff',
};

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS, ...extra },
    });

const rpcResult = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id: unknown, code: number, message: string, data?: unknown) => ({
    jsonrpc: '2.0',
    id: id ?? null,
    error: { code, message, ...(data === undefined ? {} : { data }) },
});

// ── Content access ──────────────────────────────────────────────────────────
// Every upstream read goes through Cloudflare's edge cache, so a burst of tool
// calls collapses onto one origin fetch. This Worker keeps no state of its own.

interface SiteFeed {
    generatedAt: string;
    site: { name: string; url: string; description: string };
    about: Record<string, string>;
    blog: Array<{
        slug: string; title: string; date: string; excerpt: string; author: string;
        tags: string[]; featured: boolean; readingTime?: number; wordCount?: number;
        url: string; content: string;
    }>;
    projects: Array<{ slug: string; name: string; description: string; tech: string[]; date: string; externalUrl: string; url: string }>;
    resources: Array<{ slug: string; name: string; description: string; categories: string[]; externalUrl: string; url: string }>;
    resume: { title: string; lastUpdated: string; url: string; content: string } | null;
    artifacts: Array<{ id: string; name: string; description: string; type: string; size: number; uploadedAt: string; url: string }>;
}

async function cachedJson<T>(url: string, ttlSeconds: number): Promise<T> {
    const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        cf: { cacheTtl: ttlSeconds, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) throw new Error(`upstream ${url} returned ${res.status}`);
    return (await res.json()) as T;
}

const getFeed = (env: Env) => cachedJson<SiteFeed>(`${env.SITE_URL}/data/site-content.json`, 300);

const getInstantArtifacts = (env: Env) =>
    cachedJson<{ artifacts: Array<Record<string, unknown>> }>(`${env.ARTIFACTS_SERVICE_URL}/api/list`, 60)
        .then(r => r.artifacts || [])
        .catch(() => []);

const getLibrary = (env: Env) =>
    cachedJson<{ items: Array<Record<string, unknown>> }>(`${env.ARTIFACTS_SERVICE_URL}/api/library/list`, 60)
        .then(r => r.items || [])
        .catch(() => []);

// ── Tools ───────────────────────────────────────────────────────────────────

const TOOLS = [
    {
        name: 'search_site',
        title: 'Search mncoleman.com',
        description:
            'Full-text search across every kind of published content on mncoleman.com: blog posts, projects, resources, the resume, and hosted artifacts. Start here for open-ended questions, then fetch full text with get_blog_post / get_resume.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search terms. Matched against titles, descriptions, tags and body text.' },
                type: {
                    type: 'string',
                    enum: ['blog', 'project', 'resource', 'resume', 'artifact'],
                    description: 'Optional: restrict results to one content type.',
                },
                limit: { type: 'number', description: 'Maximum results (default 10, max 50).' },
            },
            required: ['query'],
        },
    },
    {
        name: 'list_blog_posts',
        title: 'List blog posts',
        description: 'List published blog posts, newest first (featured posts first). Returns metadata and excerpts, not full bodies — use get_blog_post for the text.',
        inputSchema: {
            type: 'object',
            properties: {
                tag: { type: 'string', description: 'Optional: only posts carrying this tag (case-insensitive).' },
                limit: { type: 'number', description: 'Maximum posts (default 20, max 100).' },
            },
        },
    },
    {
        name: 'get_blog_post',
        title: 'Get a blog post',
        description: 'Fetch one blog post in full, as Markdown, by its slug (see list_blog_posts or search_site).',
        inputSchema: {
            type: 'object',
            properties: { slug: { type: 'string', description: 'The post slug, e.g. "my-first-post".' } },
            required: ['slug'],
        },
    },
    {
        name: 'list_projects',
        title: 'List projects',
        description: 'List Matthew\'s published projects with their descriptions, tech stack and links.',
        inputSchema: {
            type: 'object',
            properties: { tech: { type: 'string', description: 'Optional: only projects using this technology (case-insensitive).' } },
        },
    },
    {
        name: 'list_resources',
        title: 'List resources',
        description: 'List the curated resource library — useful websites and tools, with categories and links.',
        inputSchema: {
            type: 'object',
            properties: { category: { type: 'string', description: 'Optional: only resources in this category (case-insensitive).' } },
        },
    },
    {
        name: 'get_resume',
        title: 'Get resume',
        description: 'Matthew Coleman\'s full resume as Markdown: experience, skills and qualifications.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'get_profile',
        title: 'Get profile',
        description: 'Short "about me" profile for Matthew Coleman and a summary of how this site is built.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'list_artifacts',
        title: 'List artifacts',
        description: 'List the publicly hosted artifacts — standalone HTML guides, research libraries, PDFs and images — with direct URLs. Private artifacts are never included.',
        inputSchema: {
            type: 'object',
            properties: { query: { type: 'string', description: 'Optional: filter by name or description.' } },
        },
    },
    {
        name: 'list_ai_library',
        title: 'List the "A"I library',
        description: 'List the public "A"I library: reusable AI prompts and Claude skills, each with its full text.',
        inputSchema: {
            type: 'object',
            properties: {
                kind: { type: 'string', enum: ['prompt', 'skill'], description: 'Optional: only prompts, or only skills.' },
            },
        },
    },
    {
        name: 'get_ai_library_item',
        title: 'Get an "A"I library item',
        description: 'Fetch one prompt or skill from the "A"I library in full, by slug.',
        inputSchema: {
            type: 'object',
            properties: { slug: { type: 'string', description: 'The item slug (see list_ai_library).' } },
            required: ['slug'],
        },
    },
];

const text = (value: unknown) => ({
    content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }],
});

const clamp = (n: unknown, fallback: number, max: number) => {
    const v = typeof n === 'number' && Number.isFinite(n) ? Math.floor(n) : fallback;
    return Math.max(1, Math.min(v, max));
};

const lower = (s: unknown) => (typeof s === 'string' ? s.toLowerCase() : '');

async function callTool(name: string, args: Record<string, unknown>, env: Env): Promise<unknown> {
    switch (name) {
        case 'search_site': {
            const q = lower(args.query).trim();
            if (!q) throw new Error('query is required');
            const terms = q.split(/\s+/);
            const feed = await getFeed(env);
            const limit = clamp(args.limit, 10, 50);

            type Hit = { type: string; title: string; description: string; url: string; extra?: unknown; haystack: string };
            const candidates: Hit[] = [
                ...feed.blog.map(p => ({
                    type: 'blog', title: p.title, description: p.excerpt, url: p.url,
                    extra: { slug: p.slug, date: p.date, tags: p.tags },
                    haystack: `${p.title} ${p.excerpt} ${p.tags.join(' ')} ${p.content}`.toLowerCase(),
                })),
                ...feed.projects.map(p => ({
                    type: 'project', title: p.name, description: p.description, url: p.url,
                    extra: { tech: p.tech, externalUrl: p.externalUrl },
                    haystack: `${p.name} ${p.description} ${p.tech.join(' ')}`.toLowerCase(),
                })),
                ...feed.resources.map(r => ({
                    type: 'resource', title: r.name, description: r.description, url: r.url,
                    extra: { categories: r.categories, externalUrl: r.externalUrl },
                    haystack: `${r.name} ${r.description} ${r.categories.join(' ')}`.toLowerCase(),
                })),
                ...feed.artifacts.map(a => ({
                    type: 'artifact', title: a.name, description: a.description || a.type, url: a.url,
                    haystack: `${a.name} ${a.description} ${a.type}`.toLowerCase(),
                })),
                ...(feed.resume
                    ? [{
                        type: 'resume', title: feed.resume.title, description: 'Matthew Coleman\'s resume',
                        url: feed.resume.url, haystack: feed.resume.content.toLowerCase(),
                    }]
                    : []),
            ];

            const wanted = typeof args.type === 'string' ? args.type : null;
            const scored = candidates
                .filter(c => !wanted || c.type === wanted)
                .map(c => {
                    // Title matches outrank body matches; every term must appear somewhere.
                    let score = 0;
                    for (const t of terms) {
                        if (!c.haystack.includes(t)) return { c, score: 0 };
                        score += c.title.toLowerCase().includes(t) ? 3 : 1;
                    }
                    return { c, score };
                })
                .filter(s => s.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, limit)
                .map(({ c }) => ({ type: c.type, title: c.title, description: c.description, url: c.url, ...(c.extra as object || {}) }));

            return { query: args.query, count: scored.length, results: scored };
        }

        case 'list_blog_posts': {
            const feed = await getFeed(env);
            const tag = lower(args.tag);
            const posts = feed.blog
                .filter(p => !tag || p.tags.some(t => t.toLowerCase() === tag))
                .slice(0, clamp(args.limit, 20, 100))
                .map(({ content, ...meta }) => meta);
            return { count: posts.length, posts };
        }

        case 'get_blog_post': {
            const slug = typeof args.slug === 'string' ? args.slug : '';
            if (!slug) throw new Error('slug is required');
            const feed = await getFeed(env);
            const post = feed.blog.find(p => p.slug === slug);
            if (!post) {
                throw new Error(`No blog post with slug "${slug}". Use list_blog_posts to see available slugs.`);
            }
            return post;
        }

        case 'list_projects': {
            const feed = await getFeed(env);
            const tech = lower(args.tech);
            const projects = feed.projects.filter(p => !tech || p.tech.some(t => t.toLowerCase().includes(tech)));
            return { count: projects.length, projects };
        }

        case 'list_resources': {
            const feed = await getFeed(env);
            const category = lower(args.category);
            const resources = feed.resources.filter(r => !category || r.categories.some(c => c.toLowerCase().includes(category)));
            return { count: resources.length, resources };
        }

        case 'get_resume': {
            const feed = await getFeed(env);
            if (!feed.resume) throw new Error('The resume is not currently available.');
            return feed.resume;
        }

        case 'get_profile': {
            const feed = await getFeed(env);
            return { site: feed.site, about: feed.about, contentLastBuilt: feed.generatedAt };
        }

        case 'list_artifacts': {
            const [feed, instant] = await Promise.all([getFeed(env), getInstantArtifacts(env)]);
            const all = [
                ...feed.artifacts.map(a => ({ ...a, source: 'static' })),
                ...instant.map(a => ({
                    id: a.slug ?? a.id,
                    name: a.name,
                    description: a.description ?? '',
                    type: a.type ?? '',
                    size: a.size ?? 0,
                    uploadedAt: a.uploadedAt ?? '',
                    url: a.url ?? `${env.ARTIFACTS_SERVICE_URL}/a/${a.slug}`,
                    source: 'instant',
                })),
            ];
            const q = lower(args.query);
            const artifacts = q
                ? all.filter(a => `${a.name} ${a.description}`.toLowerCase().includes(q))
                : all;
            return { count: artifacts.length, artifacts };
        }

        case 'list_ai_library': {
            const items = await getLibrary(env);
            const kind = typeof args.kind === 'string' ? args.kind : null;
            const filtered = items
                .filter(i => !kind || i.kind === kind)
                .map(i => ({ slug: i.slug, kind: i.kind, name: i.name, description: i.description, url: i.url, updatedAt: i.updatedAt }));
            return { count: filtered.length, items: filtered };
        }

        case 'get_ai_library_item': {
            const slug = typeof args.slug === 'string' ? args.slug : '';
            if (!slug) throw new Error('slug is required');
            const items = await getLibrary(env);
            const item = items.find(i => i.slug === slug);
            if (!item) throw new Error(`No "A"I library item with slug "${slug}". Use list_ai_library to see available slugs.`);
            return item;
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

// ── JSON-RPC dispatch ───────────────────────────────────────────────────────

function capabilities() {
    // No subscriptions, no resources, no prompts — this server is tools-only, so
    // it never needs a long-lived stream in either protocol version.
    return { tools: { listChanged: false } };
}

/**
 * Resolve the protocol version for a request. Under 2026-07-28 the version rides
 * on every request; under the legacy versions it was fixed at `initialize` time
 * and we simply accept whatever the client claims.
 */
function requestedVersion(request: Request, message: any): string | null {
    const header = request.headers.get('MCP-Protocol-Version');
    const meta = message?.params?._meta?.['io.modelcontextprotocol/protocolVersion'];
    return meta || header || null;
}

async function handleMessage(message: any, request: Request, env: Env): Promise<unknown | null> {
    const { id, method, params } = message ?? {};
    const isNotification = id === undefined || id === null;

    if (typeof method !== 'string') {
        return isNotification ? null : rpcError(id, INVALID_REQUEST, 'Missing "method"');
    }

    // Notifications get no response body at all (the caller answers 202).
    if (isNotification) return null;

    const version = requestedVersion(request, message);
    if (version && !(PROTOCOL_VERSIONS as readonly string[]).includes(version)) {
        return rpcError(id, UNSUPPORTED_PROTOCOL_VERSION, `Unsupported protocol version: ${version}`, {
            supported: PROTOCOL_VERSIONS,
            requested: version,
        });
    }

    switch (method) {
        // 2026-07-28 stateless discovery. Servers MUST implement it; clients MAY skip it.
        case 'server/discover':
            return rpcResult(id, {
                supportedVersions: PROTOCOL_VERSIONS,
                capabilities: capabilities(),
                serverInfo: SERVER_INFO,
                instructions: INSTRUCTIONS,
            });

        // Legacy handshake. Removed in 2026-07-28, but every shipping client still
        // opens with it, so it stays until the ecosystem catches up.
        case 'initialize': {
            const asked = params?.protocolVersion;
            // Echo the client's version when we speak it; otherwise offer our newest
            // pre-stateless version rather than failing the connection outright.
            const negotiated = (PROTOCOL_VERSIONS as readonly string[]).includes(asked) && asked !== STATELESS_VERSION
                ? asked
                : '2025-06-18';
            return rpcResult(id, {
                protocolVersion: negotiated,
                capabilities: capabilities(),
                serverInfo: SERVER_INFO,
                instructions: INSTRUCTIONS,
            });
        }

        case 'ping':
            return rpcResult(id, {});

        case 'tools/list':
            return rpcResult(id, { tools: TOOLS });

        case 'tools/call': {
            const name = params?.name;
            if (typeof name !== 'string') return rpcError(id, INVALID_PARAMS, 'Missing tool name');
            try {
                const result = await callTool(name, (params?.arguments ?? {}) as Record<string, unknown>, env);
                return rpcResult(id, text(result));
            } catch (err) {
                // Tool failures are reported in-band with isError so the model can
                // recover, per the MCP tool-error convention.
                return rpcResult(id, { ...text(`Error: ${(err as Error).message}`), isError: true });
            }
        }

        // Advertised as unsupported rather than erroring oddly.
        case 'resources/list':
            return rpcResult(id, { resources: [] });
        case 'prompts/list':
            return rpcResult(id, { prompts: [] });

        default:
            return rpcError(id, METHOD_NOT_FOUND, `Method not found: ${method}`);
    }
}

// ── HTTP entry point ────────────────────────────────────────────────────────

/**
 * 2026-07-28 pins specific HTTP statuses to protocol errors so gateways can act
 * on them without parsing the body: 400 for a bad/unsupported request, 404 for
 * an unimplemented method. Tool failures are NOT errors at this layer — they come
 * back as a normal result with `isError`, and stay 200.
 */
function httpStatusFor(response: any): number {
    const code = response?.error?.code;
    if (code === METHOD_NOT_FOUND) return 404;
    if (code === UNSUPPORTED_PROTOCOL_VERSION || code === INVALID_PARAMS || code === INVALID_REQUEST || code === PARSE_ERROR) {
        return 400;
    }
    if (code === INTERNAL_ERROR) return 500;
    return 200;
}

function serverCard(env: Env) {
    // SEP-2127 Server Card: cacheable, auth-free, indexable discovery document.
    return {
        name: SERVER_INFO.name,
        title: SERVER_INFO.title,
        description: INSTRUCTIONS,
        version: SERVER_INFO.version,
        websiteUrl: env.SITE_URL,
        supportedVersions: PROTOCOL_VERSIONS,
        capabilities: capabilities(),
        remotes: [{ type: 'streamable-http', url: `${env.SITE_URL}/mcp` }],
        authentication: { type: 'none' },
    };
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        if (url.pathname === '/.well-known/mcp.json') {
            return json(serverCard(env), 200, { 'Cache-Control': 'public, max-age=3600' });
        }

        if (url.pathname !== '/mcp' && url.pathname !== '/mcp/') {
            return json({ error: 'Not found' }, 404);
        }

        // A GET on the MCP endpoint used to open the legacy SSE downstream channel;
        // 2026-07-28 removes it outright, and this server has nothing to push. Serve
        // the card instead so pasting the URL into a browser explains itself.
        if (request.method === 'GET') {
            return json(
                { ...serverCard(env), note: 'POST JSON-RPC to this URL to use the MCP server.' },
                200,
                { 'Cache-Control': 'public, max-age=600' },
            );
        }

        if (request.method !== 'POST') {
            return json(rpcError(null, INVALID_REQUEST, 'Method not allowed'), 405, { Allow: 'GET, POST, OPTIONS' });
        }

        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (!checkRateLimit(ip)) {
            return json(rpcError(null, INTERNAL_ERROR, 'Rate limit exceeded'), 429, { 'Retry-After': '60' });
        }

        let payload: any;
        try {
            payload = await request.json();
        } catch {
            return json(rpcError(null, PARSE_ERROR, 'Invalid JSON'), 400);
        }

        try {
            // JSON-RPC batches were dropped in 2025-06-18 but cost nothing to honour.
            if (Array.isArray(payload)) {
                const responses = (await Promise.all(payload.map(m => handleMessage(m, request, env)))).filter(Boolean);
                if (responses.length === 0) return new Response(null, { status: 202, headers: CORS_HEADERS });
                return json(responses);
            }

            const response = await handleMessage(payload, request, env);
            // Notifications (no id) MUST get 202 with an empty body, not a result.
            if (response === null) return new Response(null, { status: 202, headers: CORS_HEADERS });
            return json(response, httpStatusFor(response));
        } catch (err) {
            return json(rpcError(payload?.id ?? null, INTERNAL_ERROR, (err as Error).message), 500);
        }
    },
};
