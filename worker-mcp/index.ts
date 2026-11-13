/**
 * mncoleman-site-mcp — the MCP server for mncoleman.com. Two endpoints:
 *
 *   /mcp        public and unauthenticated: read-only tools over published content.
 *   /mcp/admin  the same tools plus admin ones (artifacts, AI library, post
 *               drafts). Always requires an OAuth bearer token; without one it
 *               answers 401 and points the client at the sign-in flow.
 *
 * Two URLs rather than optional auth on one, because a client only starts the
 * OAuth flow when the endpoint refuses it: an endpoint that also works signed
 * out never would.
 *
 * This Worker still holds NO secrets and decides nothing about access. The
 * authorization server is the admin Worker (`worker/mcp-oauth.ts`). For
 * /mcp/admin this Worker forwards the caller's bearer token to the admin
 * Worker over a service binding, which verifies it, re-checks the person and
 * enforces what they may do; the tools here only shape requests and replies.
 * Cookies are never read, and nothing authenticated goes through the cache.
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
 *   - https://artifacts.mncoleman.com/api/library/list — the AI library.
 *
 * Protocol: stateless-first per MCP 2026-07-28 (SEP-2575), with the legacy
 * `initialize` handshake still implemented so today's clients work. See
 * PROTOCOL_VERSIONS below.
 */

import { BRIEF_CONFIG_KEY, BRIEF_INDEX_KEY, briefKey, isBriefDate, type BriefConfig, type BriefEdition, type BriefLink, type BriefSummary } from '../lib/brief';

export interface Env {
    /** Daily brief editions, written by the admin Worker. Read-only here. Absent until the namespace is bound. */
    BRIEFS?: { get(key: string, type: 'json'): Promise<unknown> };
    SITE_URL: string;
    ARTIFACTS_SERVICE_URL: string;
    /** The admin Worker's public origin: the OAuth authorization server clients are sent to. */
    AUTH_SERVER_URL: string;
    /** Service binding to the admin Worker. Absent in a bare local run, which then fetches AUTH_SERVER_URL. */
    ADMIN?: { fetch(request: Request): Promise<Response> };
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
    'get_brief returns the daily brief (a morning news digest), list_briefs its archive. ' +
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
    'Access-Control-Expose-Headers': 'Mcp-Session-Id, MCP-Protocol-Version, WWW-Authenticate',
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

// The daily brief is read straight from KV (the admin Worker writes it), not through
// the edge cache, so hiding or removing an edition takes effect within KV's own lag (about a minute).

const briefConfig = async (env: Env) => (env.BRIEFS ? ((await env.BRIEFS.get(BRIEF_CONFIG_KEY, 'json')) as BriefConfig | null) : null);

/** The public archive, newest first. Empty when the section is private or the namespace is not bound. */
async function briefIndex(env: Env): Promise<BriefSummary[]> {
    if (!env.BRIEFS) return [];
    if ((await briefConfig(env))?.visibility === 'private') return [];
    return (((await env.BRIEFS.get(BRIEF_INDEX_KEY, 'json')) as BriefSummary[] | null) || []).filter(r => !r.hidden);
}

/** One public edition by date, or the newest for 'latest'. Null when there is none the public may see. */
async function briefEdition(env: Env, which: string): Promise<BriefEdition | null> {
    const index = await briefIndex(env);
    const row = which === 'latest' ? index[0] : index.find(r => r.date === which);
    if (!row || !env.BRIEFS) return null;
    return (await env.BRIEFS.get(briefKey(row.date), 'json')) as BriefEdition | null;
}

// Characters XML 1.0 forbids are dropped as well as the five escaped: one of them makes a reader reject the whole feed.
const xml = (s: unknown) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));

/** RSS 2.0 for the brief: one entry per edition, the newest 20, each listing that day's stories with their source links. */
async function briefRss(env: Env): Promise<Response> {
    const rows = (await briefIndex(env)).slice(0, 20);
    const editions = (await Promise.all(rows.map(r => env.BRIEFS!.get(briefKey(r.date), 'json') as Promise<BriefEdition | null>))).filter((e): e is BriefEdition => !!e);
    const site = env.SITE_URL;
    const entry = (e: BriefEdition) => {
        const link = `${site}/brief/${e.date}`;
        const body = [
            e.summary ? `<p>${xml(e.summary)}</p>` : '',
            ...e.sectors.map(s => `<h3>${xml(s.title)}</h3><ul>${s.items.map(i =>
                `<li><a href="${xml(`${link}#${i.id}`)}">${xml(i.title)}</a>: ${xml(i.brief)} (${i.sources.map(x => `<a href="${xml(x.url)}">${xml(x.outlet)}</a>`).join(', ')})</li>`).join('')}</ul>`),
        ].join('');
        const when = new Date(e.compiled_at);
        return `<item><title>${xml(`Daily Brief ${String(e.edition_number).padStart(3, '0')}: ${e.top_signals[0]?.headline || e.date}`)}</title><link>${xml(link)}</link><guid isPermaLink="true">${xml(link)}</guid>` +
            `<pubDate>${(Number.isNaN(when.getTime()) ? new Date(`${e.date}T12:00:00Z`) : when).toUTCString()}</pubDate><description>${xml(body)}</description></item>`;
    };
    const feed = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>` +
        `<title>The MNColeman Daily Brief</title><link>${site}/brief</link><description>A morning digest: weather, a verse, and the day in tech, local, national and world news, each story linked to its source.</description>` +
        `<language>en-us</language><atom:link href="${site}/api/brief/rss" rel="self" type="application/rss+xml"/>${editions.map(entry).join('')}</channel></rss>`;
    return new Response(feed, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
}

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
        title: 'List the AI library',
        description: 'List the public AI library: reusable AI prompts and Claude skills, each with its full text.',
        inputSchema: {
            type: 'object',
            properties: {
                kind: { type: 'string', enum: ['prompt', 'skill'], description: 'Optional: only prompts, or only skills.' },
            },
        },
    },
    {
        name: 'list_briefs',
        title: 'List daily briefs',
        description: 'The archive of the mncoleman.com daily brief, newest first: each edition\'s date, number, top headline and URL. The brief is a morning news digest (weather, a verse and devotional, tech, local, national and world news, and a list of dated events to watch).',
        inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Maximum editions (default 14, max 400).' } } },
    },
    {
        name: 'get_brief',
        title: 'Get a daily brief',
        description: 'One edition of the mncoleman.com daily brief in full, as structured JSON: every story with its confidence label, detail and source links. Pass a date, or leave it out for the latest edition.',
        inputSchema: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD, or "latest" (the default).' } } },
    },
    {
        name: 'get_ai_library_item',
        title: 'Get an AI library item',
        description: 'Fetch one prompt or skill from the AI library in full, by slug.',
        inputSchema: {
            type: 'object',
            properties: { slug: { type: 'string', description: 'The item slug (see list_ai_library).' } },
            required: ['slug'],
        },
    },
];

// ── Admin tools (/mcp/admin only) ───────────────────────────────────────────
// Each one is a thin wrapper over a route the admin panel already uses. The
// admin Worker allows an MCP token on exactly these routes and nothing else.

type Feature = 'artifacts' | 'content' | 'library';

/** Who is calling /mcp/admin, as the admin Worker reported it for this request's token. */
interface AdminCtx {
    token: string;
    name: string;
    can: string[];
}

/** The token stopped being valid mid-request: answered as HTTP 401 so the client re-authenticates. */
class AuthRequired extends Error {}

const MAX_CONTENT_CHARS = 2_000_000;

const fileProps = {
    filename: { type: 'string', description: 'File name with its extension, e.g. "report.html". The extension decides how it is served.' },
    content: { type: 'string', description: 'The file contents. Text as-is (the usual case for HTML), or base64 when encoding is "base64".' },
    encoding: { type: 'string', enum: ['text', 'base64'], description: 'How content is encoded. Default "text". Use "base64" for binary files such as PDFs and images.' },
};

const ADMIN_TOOLS: Array<{ feature: Feature; name: string; title: string; description: string; inputSchema: Record<string, unknown> }> = [
    {
        feature: 'artifacts',
        name: 'admin_list_artifacts',
        title: 'List all instant artifacts',
        description: 'Every instant artifact on artifacts.mncoleman.com, including private ones, with slug, name, description, visibility, size and URL. Passwords are never included.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        feature: 'artifacts',
        name: 'upload_artifact',
        title: 'Upload an instant artifact',
        description:
            'Publish a file as a new instant artifact at https://artifacts.mncoleman.com/a/<slug>. It is live immediately. Fails if the slug is taken: use update_artifact to replace an existing one. Public by default; pass visibility "private" with a password to gate it.',
        inputSchema: {
            type: 'object',
            properties: {
                ...fileProps,
                name: { type: 'string', description: 'Display name (max 200 chars). Defaults to the filename.' },
                description: { type: 'string', description: 'One or two sentences shown on the artifact card and its share image (max 500 chars).' },
                slug: { type: 'string', description: 'URL slug: 3-60 chars of a-z, 0-9 and hyphens. Defaults to one made from the filename.' },
                visibility: { type: 'string', enum: ['public', 'private'], description: 'Default "public".' },
                password: { type: 'string', description: 'Required when visibility is "private" (4-200 chars).' },
            },
            required: ['filename', 'content'],
        },
    },
    {
        feature: 'artifacts',
        name: 'update_artifact',
        title: 'Update an instant artifact',
        description: 'Change an existing instant artifact: its name, its description, and/or replace its file (pass filename and content together). Visibility and passwords cannot be changed here; use the admin panel.',
        inputSchema: {
            type: 'object',
            properties: {
                slug: { type: 'string', description: 'The artifact to change (see admin_list_artifacts).' },
                name: { type: 'string' },
                description: { type: 'string' },
                ...fileProps,
            },
            required: ['slug'],
        },
    },
    {
        feature: 'artifacts',
        name: 'delete_artifact',
        title: 'Delete an instant artifact',
        description: 'Permanently delete an instant artifact and its file. This cannot be undone and its link stops working for everyone. Only call it when the user has explicitly asked for that artifact to be deleted.',
        inputSchema: {
            type: 'object',
            properties: {
                slug: { type: 'string', description: 'The artifact to delete.' },
                confirm: { type: 'boolean', description: 'Must be true.' },
            },
            required: ['slug', 'confirm'],
        },
    },
    {
        feature: 'library',
        name: 'create_library_item',
        title: 'Add a prompt or skill to the AI library',
        description: 'Create a new AI library item. It is public at once on mncoleman.com/ai. A prompt needs prompt_text; a skill needs description and skill_body (the SKILL.md body, Markdown).',
        inputSchema: {
            type: 'object',
            properties: {
                kind: { type: 'string', enum: ['prompt', 'skill'] },
                name: { type: 'string', description: 'Display name (max 200 chars).' },
                slug: { type: 'string', description: 'URL slug: 3-60 chars of a-z, 0-9 and hyphens. Defaults to one made from the name.' },
                description: { type: 'string', description: 'Skills only: what the skill does and when to use it (max 1024 chars).' },
                prompt_text: { type: 'string', description: 'Prompts only: the prompt, verbatim.' },
                skill_body: { type: 'string', description: 'Skills only: the Markdown body.' },
            },
            required: ['kind', 'name'],
        },
    },
    {
        feature: 'library',
        name: 'update_library_item',
        title: 'Update an AI library item',
        description: 'Change an existing prompt or skill. Only the fields you pass are changed. A skill\'s extra resource files are left as they are.',
        inputSchema: {
            type: 'object',
            properties: {
                slug: { type: 'string', description: 'The item to change (see list_ai_library).' },
                name: { type: 'string' },
                description: { type: 'string', description: 'Skills only.' },
                prompt_text: { type: 'string', description: 'Prompts only.' },
                skill_body: { type: 'string', description: 'Skills only.' },
            },
            required: ['slug'],
        },
    },
    {
        feature: 'content',
        name: 'admin_list_posts',
        title: 'List blog posts and drafts',
        description: 'Every blog post, published or not, plus drafts that have never been published. 40 per page. Each row says whether it has an unpublished draft.',
        inputSchema: { type: 'object', properties: { offset: { type: 'number', description: 'Row to start from (default 0). Use nextOffset from the previous page.' } } },
    },
    {
        feature: 'content',
        name: 'admin_get_post',
        title: 'Get a blog post and its draft',
        description: 'One post by slug: the published version (if any) and the current draft (if any), each in full.',
        inputSchema: { type: 'object', properties: { slug: { type: 'string' } }, required: ['slug'] },
    },
    {
        feature: 'content',
        name: 'save_post_draft',
        title: 'Create or update a blog post draft',
        description:
            'Save a draft of a blog post. Nothing is published: a draft is only visible in the admin panel, and going live takes a person pressing Publish there. For an existing post, pass its slug and only the fields to change; the rest are kept. For a new post, pass at least title and content. The body is Markdown.',
        inputSchema: {
            type: 'object',
            properties: {
                slug: { type: 'string', description: 'Existing post to edit, or the slug for a new one (lowercase letters, numbers, hyphens). Defaults to one made from the title.' },
                title: { type: 'string' },
                content: { type: 'string', description: 'The post body, Markdown.' },
                excerpt: { type: 'string', description: 'One or two sentences for the post card.' },
                tags: { type: 'array', items: { type: 'string' } },
                date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today for a new post.' },
                author: { type: 'string' },
                featured: { type: 'boolean' },
            },
        },
    },
];

ADMIN_TOOLS.push(
    {
        feature: 'content',
        name: 'publish_brief',
        title: 'Publish a daily brief edition',
        description:
            'Publish one edition of the daily brief to https://mncoleman.com/brief/<date>. It is live at once and replaces any edition already stored for that date (safe to retry). Send DATA ONLY, as plain text: the site renders it with its own template, and HTML or Markdown is stripped. ' +
            'If validation fails the reply lists every problem as {path, reason}: fix those fields and call again. Warnings do not block publishing. Do not use en dashes or em dashes in text.\n\n' +
            'edition = {\n' +
            '  date: "YYYY-MM-DD" (required), location: "Berthoud, CO" (required), compiled_at: ISO 8601 timestamp (required),\n' +
            '  edition_number: omit it; the server assigns the next number and keeps it on a republish,\n' +
            '  summary: one sentence for the opening page (optional, max 300),\n' +
            '  weather: { summary, high_f (number), tonight, wind, tomorrow, source, source_url } (optional),\n' +
            '  verse: { text, reference, translation, url } (optional),\n' +
            '  devotional: { title, scripture: { reference, text }, body: the full reading, paragraphs separated by a blank line (max 6000), attribution, url } (optional),\n' +
            '  sectors: 1 to 5 of { key: "signal" | "local" | "nation" | "world" | "field_notes" (each once), title (max 60), summary: one sentence (max 300),\n' +
            '    items: 3 to 8 of { id: short unique id like "s1", confidence: "confirmed" | "developing" | "contested" | "note", title (max 110), brief: one or two sentences (max 260), detail: the FULL write-up shown when the card is opened, complete and not shortened, paragraphs separated by a blank line (max 8000),\n' +
            '      sources: 1 to 6 of { outlet, url } } },\n' +
            '  top_signals: up to 5 of { headline (max 200), sector: that item\'s sector key, item_id: an item id above },\n' +
            '  watchlist: up to 15 of { when: "YYYY-MM-DD" (for sorting), label: what is shown, e.g. "TUE 17 NOV", what (max 220), sources: 1 to 6 of { outlet, url } },\n' +
            '  notices: up to 8 strings (copyright and attribution lines)\n' +
            '}\n' +
            'Every source needs the URL of the page it came from: a source without a url is rejected. Leave out a whole optional section rather than sending it empty.',
        inputSchema: {
            type: 'object',
            properties: { edition: { type: 'object', description: 'The edition, in the shape given in this tool\'s description.' } },
            required: ['edition'],
        },
    },
    {
        feature: 'content',
        name: 'delete_brief',
        title: 'Delete a daily brief edition',
        description: 'Permanently remove one edition of the daily brief. Its page and archive entry disappear at once. Only call it when the user has explicitly asked for that edition to be deleted; to take one down temporarily, hide it in the admin panel instead.',
        inputSchema: {
            type: 'object',
            properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, confirm: { type: 'boolean', description: 'Must be true.' } },
            required: ['date', 'confirm'],
        },
    },
);

const ADMIN_TOOL_NAMES = new Set(ADMIN_TOOLS.map(t => t.name));

const visibleAdminTools = (admin: AdminCtx) =>
    ADMIN_TOOLS.filter(t => admin.can.includes(t.feature)).map(({ feature: _feature, ...tool }) => tool);

/** A call to the admin Worker as the signed-in person. Never cached. */
function adminFetch(env: Env, token: string, path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    // The admin Worker's CSRF check. A server-side caller sends no Origin, so this is all it needs.
    headers.set('X-Requested-With', 'mncoleman-admin');
    const request = new Request(`${env.AUTH_SERVER_URL.replace(/\/$/, '')}${path}`, { ...init, headers });
    return env.ADMIN ? env.ADMIN.fetch(request) : fetch(request);
}

/** Calls an admin route and returns its JSON, turning a failure into a message the model can act on. */
async function adminJson(env: Env, admin: AdminCtx, path: string, init: RequestInit = {}): Promise<any> {
    const res = await adminFetch(env, admin.token, path, init);
    const raw = await res.text();
    if (res.status === 401) throw new AuthRequired();
    let body: any = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { /* plain-text error below */ }
    if (!res.ok) {
        const upstream = body?.detail ? (() => { try { return JSON.parse(body.detail); } catch { return null; } })() : null;
        const message = upstream?.error || body?.message || body?.error || raw.slice(0, 300) || `request failed`;
        throw new Error(`${message} (${res.status})`);
    }
    return body;
}

const MIME: Record<string, string> = {
    html: 'text/html', htm: 'text/html', md: 'text/markdown', txt: 'text/plain', json: 'application/json', csv: 'text/csv',
    svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    pdf: 'application/pdf', css: 'text/css', js: 'text/javascript', xml: 'application/xml',
};

/** Builds the upload from tool arguments. Text goes through TextEncoder, never btoa (CLAUDE.md gotcha 12). */
function fileFromArgs(args: Record<string, unknown>): File {
    const filename = typeof args.filename === 'string' ? args.filename.trim() : '';
    const content = typeof args.content === 'string' ? args.content : '';
    if (!filename) throw new Error('filename is required');
    if (!content) throw new Error('content is required');
    if (content.length > MAX_CONTENT_CHARS) throw new Error(`content is too large for this tool (max ${MAX_CONTENT_CHARS} characters). Upload it from the admin panel instead.`);
    let bytes: Uint8Array;
    if (args.encoding === 'base64') {
        let bin: string;
        try { bin = atob(content.replace(/\s+/g, '')); } catch { throw new Error('content is not valid base64'); }
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
        bytes = new TextEncoder().encode(content);
    }
    const ext = (filename.split('.').pop() || '').toLowerCase();
    return new File([bytes as unknown as BlobPart], filename, { type: MIME[ext] || 'application/octet-stream' });
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

/** A slug from tool arguments, safe to put in a path. The admin Worker checks again; this keeps `..` out of the URL at all. */
function slugArg(v: unknown, what = 'slug'): string {
    if (typeof v !== 'string' || !v) throw new Error(`${what} is required`);
    if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(v)) throw new Error(`${what} must be lowercase letters, numbers and hyphens`);
    return v;
}

const slugFrom = (title: string) =>
    title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

async function callAdminTool(name: string, args: Record<string, unknown>, env: Env, admin: AdminCtx): Promise<unknown> {
    const tool = ADMIN_TOOLS.find(t => t.name === name)!;
    if (!admin.can.includes(tool.feature)) throw new Error(`Your account does not have access to ${tool.feature} in the admin panel.`);

    switch (name) {
        case 'admin_list_artifacts':
            return adminJson(env, admin, '/api/artifacts/instant/list');

        case 'upload_artifact': {
            const form = new FormData();
            form.append('file', fileFromArgs(args));
            for (const key of ['name', 'description', 'slug', 'visibility', 'password'] as const) {
                const v = str(args[key]);
                if (v) form.append(key, v);
            }
            const out = await adminJson(env, admin, '/api/artifacts', { method: 'POST', body: form });
            return out?.artifact ?? out;
        }

        case 'update_artifact': {
            const slug = str(args.slug);
            if (!slug) throw new Error('slug is required');
            slugArg(slug);
            const form = new FormData();
            if (str(args.name) !== undefined) form.append('name', str(args.name)!);
            if (str(args.description) !== undefined) form.append('description', str(args.description)!);
            if (args.content !== undefined || args.filename !== undefined) form.append('file', fileFromArgs(args));
            if ([...form.keys()].length === 0) throw new Error('Nothing to change: pass name, description, or filename with content.');
            return adminJson(env, admin, `/api/artifacts/instant/${encodeURIComponent(slug)}`, { method: 'PATCH', body: form });
        }

        case 'delete_artifact': {
            const slug = str(args.slug);
            if (!slug) throw new Error('slug is required');
            slugArg(slug);
            if (args.confirm !== true) throw new Error('Deleting is permanent. Call again with confirm: true only if the user asked for this artifact to be deleted.');
            await adminJson(env, admin, `/api/artifacts/instant/${encodeURIComponent(slug)}`, { method: 'DELETE' });
            return { deleted: slug };
        }

        case 'create_library_item':
        case 'update_library_item': {
            const body: Record<string, unknown> = {};
            for (const [arg, field] of [['kind', 'kind'], ['name', 'name'], ['description', 'description'], ['prompt_text', 'promptText'], ['skill_body', 'skillBodyMd']] as const) {
                if (str(args[arg]) !== undefined) body[field] = args[arg];
            }
            const slug = str(args.slug);
            const init = { headers: { 'Content-Type': 'application/json' } };
            if (name === 'create_library_item') {
                if (slug) body.slug = slug;
                const out = await adminJson(env, admin, '/api/library', { ...init, method: 'POST', body: JSON.stringify(body) });
                return out?.item ?? out;
            }
            if (!slug) throw new Error('slug is required');
            slugArg(slug);
            delete body.kind;
            if (Object.keys(body).length === 0) throw new Error('Nothing to change.');
            const out = await adminJson(env, admin, `/api/library/${encodeURIComponent(slug)}`, { ...init, method: 'PATCH', body: JSON.stringify(body) });
            return out?.item ?? out;
        }

        case 'admin_list_posts':
            return adminJson(env, admin, `/api/posts?offset=${typeof args.offset === 'number' && args.offset > 0 ? Math.floor(args.offset) : 0}`);

        case 'admin_get_post': {
            const slug = str(args.slug);
            if (!slug) throw new Error('slug is required');
            slugArg(slug);
            return adminJson(env, admin, `/api/posts/${encodeURIComponent(slug)}`);
        }

        case 'save_post_draft': {
            const slug = str(args.slug) || slugFrom(str(args.title) || '');
            if (!slug) throw new Error('Pass a slug, or a title to make one from.');
            slugArg(slug);
            const current = await adminJson(env, admin, `/api/posts/${encodeURIComponent(slug)}`);
            const base = current?.draft?.post ?? current?.post ?? null;
            if (!base && (!str(args.title) || !str(args.content))) throw new Error(`There is no post "${slug}" yet. A new post needs at least title and content.`);
            const post: Record<string, unknown> = { ...(base || {}), slug };
            for (const key of ['title', 'content', 'excerpt', 'date', 'author'] as const) if (str(args[key]) !== undefined) post[key] = args[key];
            if (Array.isArray(args.tags)) post.tags = args.tags;
            if (typeof args.featured === 'boolean') post.featured = args.featured;
            const saved = await adminJson(env, admin, `/api/posts/${encodeURIComponent(slug)}/draft`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ post, baseVersion: current?.draft?.version ?? 0, baseSha: current?.sha ?? null, isNew: !base }),
            });
            return {
                slug, saved: true, version: saved?.version,
                note: 'Saved as a draft. It is not live: someone has to press Publish in the admin panel.',
                edit: `${env.SITE_URL}/admin/posts/edit?slug=${encodeURIComponent(slug)}`,
            };
        }

        case 'publish_brief': {
            const edition = args.edition as { date?: unknown } | undefined;
            if (!edition || typeof edition !== 'object') throw new Error('edition is required: an object in the shape given in this tool\'s description');
            if (!isBriefDate(edition.date)) throw new Error('edition.date is required, a real calendar date as YYYY-MM-DD');
            const res = await adminFetch(env, admin.token, `/api/briefs/${edition.date}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edition }),
            });
            if (res.status === 401) throw new AuthRequired();
            const body = await res.json().catch(() => null) as any;
            // Validation problems go back whole, as data: the caller fixes the named fields and retries.
            if (res.status === 422) throw new Error(`The edition was not published. Fix these fields and call publish_brief again:\n${JSON.stringify({ errors: body?.errors, warnings: body?.warnings }, null, 2)}`);
            if (!res.ok) throw new Error(`${body?.message || body?.error || 'publish failed'} (${res.status})`);
            return { url: body.url, date: body.date, edition_number: body.edition_number, replaced: body.replaced, warnings: body.warnings };
        }

        case 'delete_brief': {
            if (!isBriefDate(args.date)) throw new Error('date is required, as YYYY-MM-DD');
            if (args.confirm !== true) throw new Error('Deleting is permanent. Call again with confirm: true only if the user asked for this edition to be deleted.');
            return adminJson(env, admin, `/api/briefs/${args.date}`, { method: 'DELETE' });
        }

        default:
            throw new Error(`Unknown tool: ${name}`);
    }
}

const ADMIN_INSTRUCTIONS =
    'Signed-in access to mncoleman.com — Matthew Coleman\'s personal site. Besides the read-only tools over published content, ' +
    'this connection can act as the signed-in admin: upload, update and delete instant artifacts, add and edit AI library prompts and skills, ' +
    'save blog post drafts, and publish the daily brief (publish_brief). Artifacts, library items and brief editions go live immediately; blog drafts never do (a person publishes them from the admin panel). ' +
    'Deleting is permanent, so only delete what the user explicitly asked to delete.';

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

        case 'list_briefs': {
            const rows = (await briefIndex(env)).slice(0, clamp(args.limit, 14, 400));
            return { count: rows.length, briefs: rows.map(r => ({ ...r, url: `${env.SITE_URL}/brief/${r.date}` })) };
        }

        case 'get_brief': {
            const which = typeof args.date === 'string' && args.date ? args.date : 'latest';
            if (which !== 'latest' && !isBriefDate(which)) throw new Error('date must be YYYY-MM-DD or "latest"');
            const edition = await briefEdition(env, which);
            if (!edition) throw new Error(which === 'latest' ? 'No brief has been published yet.' : `There is no brief for ${which}. Use list_briefs to see the dates that exist.`);
            return { url: `${env.SITE_URL}/brief/${edition.date}`, ...edition };
        }

        case 'get_ai_library_item': {
            const slug = typeof args.slug === 'string' ? args.slug : '';
            if (!slug) throw new Error('slug is required');
            const items = await getLibrary(env);
            const item = items.find(i => i.slug === slug);
            if (!item) throw new Error(`No AI library item with slug "${slug}". Use list_ai_library to see available slugs.`);
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

async function handleMessage(message: any, request: Request, env: Env, admin: AdminCtx | null = null): Promise<unknown | null> {
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
                instructions: admin ? ADMIN_INSTRUCTIONS : INSTRUCTIONS,
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
                instructions: admin ? ADMIN_INSTRUCTIONS : INSTRUCTIONS,
            });
        }

        case 'ping':
            return rpcResult(id, {});

        case 'tools/list':
            return rpcResult(id, { tools: admin ? [...TOOLS, ...visibleAdminTools(admin)] : TOOLS });

        case 'tools/call': {
            const name = params?.name;
            if (typeof name !== 'string') return rpcError(id, INVALID_PARAMS, 'Missing tool name');
            try {
                const args = (params?.arguments ?? {}) as Record<string, unknown>;
                const result = admin && ADMIN_TOOL_NAMES.has(name) ? await callAdminTool(name, args, env, admin) : await callTool(name, args, env);
                return rpcResult(id, text(result));
            } catch (err) {
                if (err instanceof AuthRequired) throw err;
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

const ADMIN_PATH = '/mcp/admin';
const PRM_PATH = '/.well-known/oauth-protected-resource';

/** RFC 9728: tells a client which authorization server issues tokens for /mcp/admin. */
function protectedResource(env: Env) {
    return {
        resource: `${env.SITE_URL}${ADMIN_PATH}`,
        authorization_servers: [env.AUTH_SERVER_URL.replace(/\/$/, '')],
        bearer_methods_supported: ['header'],
        scopes_supported: ['admin'],
        resource_name: 'mncoleman.com admin',
    };
}

/** 401 with the pointer that starts the OAuth flow. */
function unauthorized(env: Env, description?: string) {
    const params = [`resource_metadata="${env.SITE_URL}${PRM_PATH}${ADMIN_PATH}"`];
    if (description) params.unshift('error="invalid_token"', `error_description="${description}"`);
    return json(rpcError(null, INVALID_REQUEST, description || 'Authentication required'), 401, {
        'WWW-Authenticate': `Bearer ${params.join(', ')}`,
        'Cache-Control': 'no-store',
    });
}

/** Asks the admin Worker who this bearer token is. Null when it is missing, expired, revoked, or not one of ours. */
async function identify(request: Request, env: Env): Promise<AdminCtx | null> {
    const header = request.headers.get('Authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return null;
    const res = await adminFetch(env, token, '/oauth/whoami');
    // Only a refusal means "sign in again". An outage must not push every client into re-auth.
    if (res.status >= 500) throw new Error(`sign-in service answered ${res.status}`);
    if (!res.ok) return null;
    const who = await res.json() as { name?: string; can?: string[]; via?: string };
    // Only an MCP token: an admin-panel session token is not a credential for this endpoint.
    if (who.via !== 'mcp') return null;
    return { token, name: who.name || 'Admin', can: Array.isArray(who.can) ? who.can : [] };
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
        remotes: [
            { type: 'streamable-http', url: `${env.SITE_URL}/mcp` },
            // The signed-in endpoint: same tools plus admin ones, OAuth 2.1 (see /.well-known/oauth-protected-resource).
            { type: 'streamable-http', url: `${env.SITE_URL}${ADMIN_PATH}`, authentication: { type: 'oauth2' } },
        ],
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

        // The daily brief's public read API, for the /brief pages (same origin, so no CORS dance):
        //   /api/brief/index   the archive      /api/brief/latest   /api/brief/YYYY-MM-DD
        //   /api/brief/rss     the feed
        // Never stored by a browser or a cache in between. KV itself can serve a value for up to
        // a minute after it changes, so hiding or removing an edition takes effect within about that.
        if (url.pathname.startsWith('/api/brief/')) {
            if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
            // The site builds links with a trailing slash; accept both forms.
            const what = url.pathname.slice('/api/brief/'.length).replace(/\/$/, '');
            const fresh = { 'Cache-Control': 'no-store' };
            if (what === 'index') return json({ briefs: await briefIndex(env) }, 200, fresh);
            if (what === 'rss') return briefRss(env);
            if (what !== 'latest' && !isBriefDate(what)) return json({ error: 'not_found' }, 404);
            const index = await briefIndex(env);
            const edition = await briefEdition(env, what);
            if (!edition) return json({ error: 'not_found' }, 404, { 'Cache-Control': 'no-store' });
            // Neighbours ride along so the page can link to the next and previous edition without a second request.
            const at = index.findIndex(r => r.date === edition.date);
            const links: BriefLink[] = (await briefConfig(env))?.links || [];
            return json({ edition, newer: index[at - 1]?.date ?? null, older: index[at + 1]?.date ?? null, links }, 200, fresh);
        }

        if (url.pathname === PRM_PATH || url.pathname === `${PRM_PATH}${ADMIN_PATH}`) {
            return json(protectedResource(env), 200, { 'Cache-Control': 'public, max-age=3600' });
        }

        const isAdmin = url.pathname === ADMIN_PATH || url.pathname === `${ADMIN_PATH}/`;
        if (!isAdmin && url.pathname !== '/mcp' && url.pathname !== '/mcp/') {
            return json({ error: 'Not found' }, 404);
        }

        // /mcp/admin never answers without a valid token, whatever the method: the 401 is
        // what tells a client to sign in.
        let admin: AdminCtx | null = null;
        if (isAdmin) {
            const hasToken = (request.headers.get('Authorization') || '').startsWith('Bearer ');
            try {
                admin = await identify(request, env);
            } catch {
                return json(rpcError(null, INTERNAL_ERROR, 'Could not reach the sign-in service'), 502, { 'Cache-Control': 'no-store' });
            }
            if (!admin) return unauthorized(env, hasToken ? 'The access token is invalid, expired, or the connection was removed' : undefined);
        }

        // A GET on the MCP endpoint used to open the legacy SSE downstream channel;
        // 2026-07-28 removes it outright, and this server has nothing to push. Serve
        // the card instead so pasting the URL into a browser explains itself.
        if (request.method === 'GET') {
            return json(
                { ...serverCard(env), note: 'POST JSON-RPC to this URL to use the MCP server.' },
                200,
                { 'Cache-Control': isAdmin ? 'no-store' : 'public, max-age=600' },
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

        // Nothing said to a signed-in caller may be stored by anything in between.
        const noStore: Record<string, string> = isAdmin ? { 'Cache-Control': 'no-store' } : {};
        try {
            // JSON-RPC batches were dropped in 2025-06-18 but cost nothing to honour.
            if (Array.isArray(payload)) {
                const responses = (await Promise.all(payload.map(m => handleMessage(m, request, env, admin)))).filter(Boolean);
                if (responses.length === 0) return new Response(null, { status: 202, headers: CORS_HEADERS });
                return json(responses, 200, noStore);
            }

            const response = await handleMessage(payload, request, env, admin);
            // Notifications (no id) MUST get 202 with an empty body, not a result.
            if (response === null) return new Response(null, { status: 202, headers: CORS_HEADERS });
            return json(response, httpStatusFor(response), noStore);
        } catch (err) {
            if (err instanceof AuthRequired) return unauthorized(env, 'The access token is invalid, expired, or the connection was removed');
            return json(rpcError(payload?.id ?? null, INTERNAL_ERROR, (err as Error).message), 500);
        }
    },
};
