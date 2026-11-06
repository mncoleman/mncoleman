/**
 * The on-disk format of a blog post: `data/posts/<slug>.md`, YAML front matter
 * then a Markdown body. Pure functions only (no fs, no DOM), because four places
 * share it: the site's build-time reader (lib/posts.ts), the admin editor, the
 * Worker that commits posts, and the Notion import script. Keeping one parser
 * is what stops "what the editor saved" and "what the build read" drifting.
 *
 * The writer emits JSON-style scalars and arrays (which are valid YAML), so a
 * round trip is exact. The reader is a little more forgiving, so a file edited
 * by hand in git still loads: bare scalars, single quotes, and `- item` lists.
 */

export interface PostFields {
    title: string;
    slug: string;
    /** ISO date or datetime, as the Notion Date property gave it. */
    date: string;
    tags: string[];
    published: boolean;
    featured: boolean;
    excerpt: string;
    author: string;
    ogImage?: string;
}

export interface PostDoc extends PostFields {
    /** Markdown body. */
    content: string;
}

export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/;

export function isValidSlug(slug: unknown): slug is string {
    return typeof slug === 'string' && SLUG_RE.test(slug);
}

/** Title to slug; the same rule the site uses elsewhere (lib/utils slugify), kept dependency-free here. */
export function slugFromTitle(title: string): string {
    return title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80)
        .replace(/-+$/g, '');
}

/** `my-post` -> `my-post-2` -> `my-post-3`: the suggestion offered when a slug is taken. */
export function nextSlug(slug: string): string {
    const m = slug.match(/^(.*?)-(\d+)$/);
    return m ? `${m[1]}-${Number(m[2]) + 1}` : `${slug || 'post'}-2`;
}

export function emptyPost(): PostDoc {
    return {
        title: '', slug: '', date: new Date().toISOString().slice(0, 10), tags: [],
        published: false, featured: false, excerpt: '', author: 'Matthew Coleman', content: '',
    };
}

/* ------------------------------ parsing -------------------------------- */

/** Thrown for a post file that cannot be trusted. The message names the file so a failed build says which one. */
export class PostFormatError extends Error {
    constructor(message: string, source = '') {
        super(source ? `${source}: ${message}` : message);
        this.name = 'PostFormatError';
    }
}

function parseScalar(raw: string): unknown {
    const v = raw.trim();
    if (v === '') return '';
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null' || v === '~') return null;
    if (v.startsWith('"')) {
        try {
            const out = JSON.parse(v);
            if (typeof out === 'string') return out;
        } catch { /* reported below */ }
        throw new Error(`unclosed or invalid quoted value: ${v.slice(0, 60)}`);
    }
    if (v.startsWith("'")) {
        if (v.length < 2 || !v.endsWith("'")) throw new Error(`unclosed quote: ${v.slice(0, 60)}`);
        return v.slice(1, -1).replace(/''/g, "'");
    }
    if (v.startsWith('[')) {
        try { return JSON.parse(v); } catch { /* try the loose form */ }
        if (!v.endsWith(']')) throw new Error(`unclosed list: ${v.slice(0, 60)}`);
        return v.slice(1, -1).split(',').map((s) => String(parseScalar(s))).filter(Boolean);
    }
    return v;
}

/**
 * Splits `---\nfront matter\n---\nbody`. A file that does not open with `---` has no front
 * matter (empty meta, all body); one that opens it and never closes it is an error, because
 * the alternative is publishing the metadata as the post body.
 */
export function splitFrontMatter(raw: string, source = ''): { meta: Record<string, unknown>; body: string } {
    const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    if (!/^---[ \t]*\n/.test(text)) return { meta: {}, body: text };
    const m = text.match(/^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)([\s\S]*)$/);
    if (!m) throw new PostFormatError('front matter is never closed (no closing --- line)', source);
    const meta: Record<string, unknown> = {};
    let listKey: string | null = null;
    for (const line of m[1].split('\n')) {
        if (!line.trim() || line.trimStart().startsWith('#')) continue;
        try {
            const item = line.match(/^\s+-\s*(.*)$/);
            if (item && listKey) {
                (meta[listKey] as unknown[]).push(parseScalar(item[1]));
                continue;
            }
            const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
            if (!kv) continue;
            if (kv[2] === '') {
                // `tags:` followed by `- a` lines (or genuinely empty).
                meta[kv[1]] = [];
                listKey = kv[1];
            } else {
                meta[kv[1]] = parseScalar(kv[2]);
                listKey = null;
            }
        } catch (e) {
            throw new PostFormatError(`${e instanceof Error ? e.message : 'bad front matter'} (line "${line.slice(0, 60)}")`, source);
        }
    }
    return { meta, body: m[2] };
}

const str = (v: unknown, d = ''): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : d);

/** `published` / `featured` must be literally true or false; `yes`, `True`, `1` are errors, not "false". */
function readBool(meta: Record<string, unknown>, key: string, source: string): boolean {
    if (!(key in meta)) return false;
    const v = meta[key];
    if (v === true || v === false) return v;
    throw new PostFormatError(`\`${key}\` must be exactly true or false (got ${JSON.stringify(v)})`, source);
}

/**
 * Reads a file's text into a PostDoc. `fallbackSlug` is the filename stem when the front matter
 * has no slug. Throws PostFormatError (naming `source`) rather than guessing: a post that would
 * quietly become "Untitled" or unpublished is worse than a failed build.
 */
export function parsePost(raw: string, fallbackSlug = '', source = ''): PostDoc {
    const { meta, body } = splitFrontMatter(raw, source);
    const title = str(meta.title).trim();
    if (!title) throw new PostFormatError('missing `title` in front matter', source);
    const slug = str(meta.slug) || fallbackSlug;
    if (slug && !isValidSlug(slug)) throw new PostFormatError(`invalid slug "${slug}"`, source);
    // YAML parses an unquoted date as a Date elsewhere; here it stays text, which is what the pages want.
    const tags = Array.isArray(meta.tags) ? meta.tags.map(String).map((t) => t.trim()).filter(Boolean) : [];
    const doc: PostDoc = {
        title,
        slug,
        date: str(meta.date) || new Date(0).toISOString().slice(0, 10),
        tags,
        published: readBool(meta, 'published', source),
        featured: readBool(meta, 'featured', source),
        excerpt: str(meta.excerpt),
        author: str(meta.author, 'Anonymous') || 'Anonymous',
        content: body.replace(/^\n+/, '').replace(/\s+$/, ''),
    };
    const og = str(meta.ogImage);
    if (og) doc.ogImage = og;
    return doc;
}

/** Same content, field by field (ignores object identity). */
export function samePost(a: PostDoc, b: PostDoc): boolean {
    const k = (d: PostDoc) => JSON.stringify([d.title, d.slug, d.date, d.tags, d.published, d.featured, d.excerpt, d.author, d.ogImage || '', d.content]);
    return k(a) === k(b);
}

/* ----------------------------- serializing ------------------------------ */

/** Line breaks (LF, CR, U+2028/2029, NEL) in a one-line YAML scalar would break the block, so they fold to spaces. */
const q = (s: string) => JSON.stringify(s.replace(/\s*[\r\n\u2028\u2029\u0085]+\s*/g, ' '));

export function serializePost(doc: PostDoc): string {
    const lines = [
        '---',
        `title: ${q(doc.title)}`,
        `slug: ${doc.slug}`,
        `date: ${q(doc.date)}`,
        `tags: ${JSON.stringify(doc.tags)}`,
        `published: ${doc.published ? 'true' : 'false'}`,
        `featured: ${doc.featured ? 'true' : 'false'}`,
        `excerpt: ${q(doc.excerpt)}`,
        `author: ${q(doc.author)}`,
    ];
    if (doc.ogImage) lines.push(`ogImage: ${q(doc.ogImage)}`);
    lines.push('---', '');
    return lines.join('\n') + '\n' + doc.content.replace(/\s+$/, '') + '\n';
}

/* ------------------------------ validation ------------------------------ */

/** Validates untrusted input (a request body, a localStorage blob) into a PostDoc, or returns the reason. Drafts may have no title yet. */
export function coercePostDoc(input: unknown, opts: { allowEmptyTitle?: boolean } = {}): { ok: true; doc: PostDoc } | { ok: false; error: string } {
    if (!input || typeof input !== 'object') return { ok: false, error: 'post must be an object' };
    const p = input as Record<string, unknown>;
    if (!isValidSlug(p.slug)) return { ok: false, error: 'slug must be lowercase letters, numbers and hyphens' };
    if (typeof p.title !== 'string' || (!opts.allowEmptyTitle && !p.title.trim())) return { ok: false, error: 'title is required' };
    if (typeof p.content !== 'string') return { ok: false, error: 'content must be a string' };
    if (p.content.length > 900_000) return { ok: false, error: 'post body is too large' };
    const tags = Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter(Boolean) : [];
    const doc: PostDoc = {
        title: p.title.trim(),
        slug: p.slug,
        date: typeof p.date === 'string' && p.date ? p.date : new Date().toISOString().slice(0, 10),
        tags: [...new Set(tags)].slice(0, 30),
        published: p.published === true,
        featured: p.featured === true,
        excerpt: typeof p.excerpt === 'string' ? p.excerpt : '',
        author: typeof p.author === 'string' && p.author.trim() ? p.author : 'Matthew Coleman',
        content: p.content,
    };
    if (typeof p.ogImage === 'string' && p.ogImage) doc.ogImage = p.ogImage;
    return { ok: true, doc };
}

/* ------------------------------- helpers -------------------------------- */

/** Featured first, then newest first: the order the blog has always used. */
export function sortPosts<T extends { featured?: boolean; date: string }>(posts: T[]): T[] {
    return [...posts].sort((a, b) => {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
}

/** The same arithmetic lib/notion.ts used: split on whitespace, 200 wpm. */
export function readingStats(content: string): { wordCount: number; readingTime: number } {
    const wordCount = content.split(/\s+/).length;
    return { wordCount, readingTime: Math.ceil(wordCount / 200) };
}

export interface PostSummary {
    slug: string;
    title: string;
    date: string;
    tags: string[];
    published: boolean;
    featured: boolean;
    excerpt: string;
}
