/**
 * Server-side page lookup for citations (runs in the admin Worker; pure and testable with a fake fetch).
 *
 * SSRF stance: this is a fetch of an admin-supplied URL, so every hop is validated before it is
 * requested. Workers cannot resolve DNS themselves, so a public-looking hostname that RESOLVES to a
 * private address cannot be detected here; that case is covered by Cloudflare's network (a Worker's
 * `fetch` cannot reach private/loopback ranges or other Cloudflare-internal services). What this
 * module blocks itself: non-http(s) schemes, credentials in the URL, ports other than 80/443,
 * IP literals in private/loopback/link-local/metadata/reserved ranges (IPv4 in any spelling the URL
 * parser normalises; every IPv6 literal), and obviously internal hostnames (localhost, single-label
 * names, .local/.internal/.lan/.home.arpa ...). It also follows at most 3 redirects (re-validating each),
 * times out at 5s, reads at most 512 KB, accepts only HTML, forwards no cookies or auth, and never
 * returns the body: only five short, control-character-free fields.
 */
import { cleanField, MAX_FIELD, type LookupResult } from './citations';

export const MAX_REDIRECTS = 3;
export const TIMEOUT_MS = 5000;
export const MAX_BODY_BYTES = 512 * 1024;

const INTERNAL_SUFFIXES = ['.localhost', '.local', '.localdomain', '.internal', '.intranet', '.lan', '.home', '.corp', '.private', '.home.arpa', '.test', '.invalid', '.example'];

function ipv4Parts(host: string): number[] | null {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (!m) return null;
    const p = m.slice(1).map(Number);
    return p.every((n) => n <= 255) ? p : null;
}

/** True for IPv4 addresses that are not ordinary public unicast. */
export function isBlockedIPv4(p: number[]): boolean {
    const [a, b, c] = p;
    return (
        a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 0 && (c === 0 || c === 2)) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)) ||
        (a === 198 && b === 51 && c === 100) ||
        (a === 203 && b === 0 && c === 113)
    );
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; reason: string };

/** Validates a URL for lookup. Returns the parsed URL, or why it was refused. */
export function checkLookupUrl(raw: string, base?: string): UrlCheck {
    let url: URL;
    try {
        url = base ? new URL(raw, base) : new URL(raw);
    } catch {
        return { ok: false, reason: 'not a URL' };
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, reason: 'scheme' };
    if (url.username || url.password) return { ok: false, reason: 'credentials' };
    if (url.port && url.port !== '80' && url.port !== '443') return { ok: false, reason: 'port' };
    let host = url.hostname.toLowerCase();
    if (host.endsWith('.')) host = host.slice(0, -1);
    if (!host) return { ok: false, reason: 'host' };
    if (host.startsWith('[') || host.includes(':')) return { ok: false, reason: 'ipv6 literal' };
    const v4 = ipv4Parts(host);
    if (v4) return isBlockedIPv4(v4) ? { ok: false, reason: 'private address' } : { ok: true, url };
    // Anything else that ends in a number is an (invalid) IP spelling, never a real site.
    if (/^\d+$/.test(host.split('.').pop() || '')) return { ok: false, reason: 'ip spelling' };
    if (!host.includes('.')) return { ok: false, reason: 'internal host' };
    if (host === 'localhost' || INTERNAL_SUFFIXES.some((s) => host.endsWith(s))) return { ok: false, reason: 'internal host' };
    return { ok: true, url };
}

// ---------------------------------------------------------------- metadata extraction

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…' };

export function decodeEntities(s: string): string {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
        if (e[0] === '#') {
            const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
            return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
        }
        return ENTITIES[e.toLowerCase()] ?? m;
    });
}

function metaTags(html: string): Map<string, string> {
    const out = new Map<string, string>();
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
        const attrs: Record<string, string> = {};
        for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
        const key = (attrs.property || attrs.name || attrs.itemprop || '').toLowerCase();
        const content = attrs.content;
        if (key && content !== undefined && !out.has(key)) out.set(key, decodeEntities(content));
    }
    return out;
}

type Json = unknown;
function jsonLdObjects(html: string): Record<string, Json>[] {
    const found: Record<string, Json>[] = [];
    const visit = (v: Json) => {
        if (Array.isArray(v)) v.forEach(visit);
        else if (v && typeof v === 'object') {
            found.push(v as Record<string, Json>);
            visit((v as Record<string, Json>)['@graph']);
        }
    };
    for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
        try {
            visit(JSON.parse(m[1]));
        } catch {
            /* malformed JSON-LD is common; skip it */
        }
    }
    return found;
}

function nameOf(v: Json): string {
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) return v.map(nameOf).filter(Boolean).slice(0, 3).join(', ');
    if (v && typeof v === 'object') return nameOf((v as Record<string, Json>).name);
    return '';
}

const looksLikeUrl = (s: string) => /^https?:\/\//i.test(s.trim());

/** Reads the citation-relevant fields out of an HTML document's head. Pure. */
export function extractMetadata(html: string, pageUrl: string): LookupResult {
    const head = html.slice(0, MAX_BODY_BYTES);
    const meta = metaTags(head);
    const ld = jsonLdObjects(head);
    const ldFirst = (key: string) => {
        for (const o of ld) {
            const v = nameOf(o[key]);
            if (v) return v;
        }
        return '';
    };
    const titleTag = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? '';
    const title = meta.get('og:title') || meta.get('twitter:title') || ldFirst('headline') || decodeEntities(titleTag);
    let host = '';
    try {
        host = new URL(pageUrl).hostname.replace(/^www\./, '');
    } catch {
        /* keep empty */
    }
    const website = meta.get('og:site_name') || meta.get('application-name') || ldFirst('isPartOf') || host;
    const authorMeta = [meta.get('article:author'), meta.get('author'), meta.get('twitter:creator')].find((v) => v && !looksLikeUrl(v)) || '';
    const author = authorMeta || ldFirst('author');
    const publisher = meta.get('publisher') || ldFirst('publisher');
    const dateRaw = meta.get('article:published_time') || meta.get('datepublished') || meta.get('date') || meta.get('dc.date') || ldFirst('datePublished');
    const out: LookupResult = {};
    const put = (k: keyof LookupResult, v: string, max = MAX_FIELD) => {
        const c = cleanField(v, max);
        if (c) out[k] = c;
    };
    put('title', title);
    put('author', looksLikeUrl(author) ? '' : author);
    put('website', website);
    put('publisher', publisher);
    const d = cleanField(dateRaw, 40);
    if (d) out.datePublished = /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : d;
    return out;
}

// ---------------------------------------------------------------- fetching

export type LookupOutcome = { ok: true; result: LookupResult } | { ok: false; error: 'invalid_url' | 'lookup_failed' };

type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

async function readCapped(resp: Response, cap: number): Promise<string> {
    const reader = resp.body?.getReader();
    if (!reader) return (await resp.text()).slice(0, cap);
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < cap) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        total += value.byteLength;
    }
    reader.cancel().catch(() => undefined);
    const buf = new Uint8Array(Math.min(total, cap));
    let off = 0;
    for (const c of chunks) {
        const take = Math.min(c.byteLength, buf.byteLength - off);
        buf.set(c.subarray(0, take), off);
        off += take;
        if (off >= buf.byteLength) break;
    }
    return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}

/**
 * Looks a page up. Never throws; every failure is one of two generic outcomes so nothing about
 * the target (status, headers, timing detail) is reflected back to the caller.
 */
export async function lookupPage(rawUrl: string, doFetch: FetchFn = (u, i) => fetch(u, i)): Promise<LookupOutcome> {
    const first = checkLookupUrl(rawUrl);
    if (!first.ok) return { ok: false, error: 'invalid_url' };
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    try {
        let current = first.url;
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
            const resp = await doFetch(current.toString(), {
                method: 'GET',
                redirect: 'manual',
                signal,
                // No cookies, no Authorization, nothing of the caller's.
                headers: { Accept: 'text/html,application/xhtml+xml;q=0.9', 'User-Agent': 'mncoleman-citation-lookup/1.0 (+https://mncoleman.com)' },
            });
            if (resp.status >= 300 && resp.status < 400) {
                const loc = resp.headers.get('location');
                resp.body?.cancel().catch(() => undefined);
                if (!loc || hop === MAX_REDIRECTS) return { ok: false, error: 'lookup_failed' };
                const next = checkLookupUrl(loc, current.toString());
                if (!next.ok) return { ok: false, error: 'lookup_failed' };
                current = next.url;
                continue;
            }
            if (resp.status !== 200) {
                resp.body?.cancel().catch(() => undefined);
                return { ok: false, error: 'lookup_failed' };
            }
            const type = (resp.headers.get('content-type') || '').toLowerCase();
            if (!/^(text\/html|application\/xhtml\+xml)\b/.test(type)) {
                resp.body?.cancel().catch(() => undefined);
                return { ok: false, error: 'lookup_failed' };
            }
            const html = await readCapped(resp, MAX_BODY_BYTES);
            const result = extractMetadata(html, current.toString());
            return Object.keys(result).length ? { ok: true, result } : { ok: false, error: 'lookup_failed' };
        }
    } catch {
        /* timeout, DNS failure, TLS error: all the same to the caller */
    }
    return { ok: false, error: 'lookup_failed' };
}
