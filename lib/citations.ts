/**
 * Citations: pure helpers shared by the editor, the site renderer and their self-tests.
 * No DOM, no React. A source is stored in a post as a standard GFM footnote definition
 *   [^1]: Smith, Jane. "Title." *Website*, Publisher, 20 May 2025, https://example.com. Accessed 6 Nov. 2026.
 * and the formatting rules below produce that line (MLA-style, one-liner, italics as `*...*`).
 */

export interface Source {
    /** Web address, when the source is a page. */
    url?: string;
    /** Free text exactly as typed or pasted (a full MLA entry, say). Used verbatim when no details are filled in. */
    text?: string;
    author?: string;
    title?: string;
    /** Website (the container; italicised). */
    site?: string;
    publisher?: string;
    /** `YYYY-MM-DD`, `YYYY-MM`, `YYYY`, or free text. */
    date?: string;
    /** `YYYY-MM-DD`. Only shown with a URL. */
    accessed?: string;
}

export interface Seg {
    t: string;
    /** Italic. */
    i?: boolean;
}

/** Max length of any single field (matches the Worker lookup). */
export const MAX_FIELD = 200;

/** MLA month abbreviations: May, June and July are spelled out, March and April too. */
export const MLA_MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];

export function isUrl(s: string): boolean {
    return /^https?:\/\/\S+$/i.test(s.trim());
}

/** `2025-05-20` -> `20 May 2025`; `2025-11` -> `Nov. 2025`; `2025` -> `2025`; anything else is returned as typed. */
export function mlaDate(d: string | undefined): string {
    if (!d) return '';
    const v = d.trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (m && +m[2] >= 1 && +m[2] <= 12) return `${+m[3]} ${MLA_MONTHS[+m[2] - 1]} ${m[1]}`;
    m = /^(\d{4})-(\d{2})$/.exec(v);
    if (m && +m[2] >= 1 && +m[2] <= 12) return `${MLA_MONTHS[+m[2] - 1]} ${m[1]}`;
    return v;
}

const MONTH_LOOKUP: Record<string, number> = {};
['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'].forEach((n, i) => {
    MONTH_LOOKUP[n] = i + 1;
    MONTH_LOOKUP[n.slice(0, 3)] = i + 1;
});
MONTH_LOOKUP.sept = 9;

/** A typed date ("4 Nov. 2026", "Nov 4, 2026", "2026-11-04", or just "Nov. 2026" / "2026") as `YYYY-MM-DD`, `YYYY-MM` or `YYYY`; null when it is not clearly a date. */
export function parseTypedDate(input: string): string | null {
    const v = input.trim().replace(/\.(?=\s|$)/g, '').replace(/,/g, '');
    const pad = (n: number) => String(n).padStart(2, '0');
    // Partial dates: a source often has only a year or a month.
    let m = /^(\d{4})$/.exec(v);
    if (m) return m[1];
    m = /^(\d{4})-(\d{1,2})$/.exec(v);
    if (m) return +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}-${pad(+m[2])}` : null;
    m = /^([A-Za-z]+)\s+(\d{4})$/.exec(v);
    if (m && MONTH_LOOKUP[m[1].toLowerCase()]) return `${m[2]}-${pad(MONTH_LOOKUP[m[1].toLowerCase()])}`;
    m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
    if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
    m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(v);
    if (m && MONTH_LOOKUP[m[2].toLowerCase()]) return `${m[3]}-${pad(MONTH_LOOKUP[m[2].toLowerCase()])}-${pad(+m[1])}`;
    m = /^([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})$/.exec(v);
    if (m && MONTH_LOOKUP[m[1].toLowerCase()]) return `${m[3]}-${pad(MONTH_LOOKUP[m[1].toLowerCase()])}-${pad(+m[2])}`;
    return null;
}

/** Collapses whitespace, strips control characters, caps the length. */
export function cleanField(v: unknown, max = MAX_FIELD): string {
    if (typeof v !== 'string') return '';
    return v.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function todayIso(now = new Date()): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const STRUCT_KEYS = ['author', 'title', 'site', 'publisher', 'date'] as const;
const hasStructure = (s: Source) => STRUCT_KEYS.some((k) => (s[k] || '').trim());

/** What kind of entry this is: filled-in details, only a URL, or free text kept as given. */
export function sourceKind(s: Source): 'full' | 'url' | 'free' {
    if (hasStructure(s)) return 'full';
    return s.url?.trim() ? 'url' : 'free';
}

/**
 * MLA 9 style entry: Author. "Title." *Website*, Publisher, D Mon. YYYY, URL. Accessed D Mon. YYYY.
 * Missing parts are left out. Free text is kept as given; a bare URL shows the URL.
 */
export function formatMla(s: Source): Seg[] {
    const kind = sourceKind(s);
    if (kind === 'free') return [{ t: (s.text ?? '').trim() }];
    if (kind === 'url') {
        const segs: Seg[] = [{ t: s.url!.trim() }];
        return segs;
    }
    const segs: Seg[] = [];
    const author = (s.author || '').trim();
    const title = (s.title || '').trim();
    const site = (s.site || '').trim();
    const publisher = (s.publisher || '').trim();
    const url = (s.url || '').trim();
    if (author) segs.push({ t: author.replace(/\.?\s*$/, '.') + ' ' });
    if (title) segs.push({ t: '“' + title.replace(/[.?!]?\s*$/, (m) => (/[?!]/.test(m) ? m.trim() : '.')) + '” ' });
    const cont: Seg[] = [];
    if (site) cont.push({ t: site, i: true });
    if (publisher && publisher !== site) cont.push({ t: publisher });
    if (s.date) cont.push({ t: mlaDate(s.date) });
    if (url) cont.push({ t: url });
    cont.forEach((c, k) => {
        segs.push(c);
        segs.push({ t: k < cont.length - 1 ? ', ' : '.' });
    });
    if (url && s.accessed) segs.push({ t: ' Accessed ' + mlaDate(s.accessed) + '.' });
    // A trailing space after a title with nothing after it.
    const last = segs[segs.length - 1];
    if (last) last.t = last.t.replace(/\s+$/, '');
    return segs;
}

export const toPlain = (s: Source) => formatMla(s).map((x) => x.t).join('').trim();

/** Escapes what would change meaning in a markdown line (not used for URLs or free text). */
function escMd(t: string): string {
    return t
        .replace(/[\\*[\]<`]/g, (c) => `\\${c}`)
        .replace(/(^|[^A-Za-z0-9])_|_(?=$|[^A-Za-z0-9])/g, (m) => m.replace('_', '\\_'));
}

/** The one-line markdown for a definition body. Free text is stored verbatim (with whitespace collapsed). */
export function toMarkdown(s: Source): string {
    const kind = sourceKind(s);
    if (kind === 'free') return cleanField(s.text, 200_000);
    return formatMla(s)
        .map((x) => {
            if (x.i) return `*${escMd(x.t)}*`;
            // URLs are written as they are; GFM links them.
            if (isUrl(x.t) || /^https?:\/\//i.test(x.t)) return x.t;
            return escMd(x.t).replace(/(https?:\/\/\S+)/g, (u) => u.replace(/\\([*_[\]<`\\])/g, '$1'));
        })
        .join('')
        .trim();
}

/** Identity for "the same source used twice": URL without fragment and trailing slashes, else the text. */
export function sourceKey(s: Source): string {
    const url = (s.url || '').trim();
    if (url) return 'u:' + url.toLowerCase().replace(/#.*$/, '').replace(/\/+$/, '');
    const body = hasStructure(s) ? toPlain(s) : (s.text || '');
    return 't:' + body.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Smallest positive integer label ("1", "2", ...) not in use. */
export function nextLabel(used: Iterable<string>): string {
    const set = new Set(used);
    let n = 1;
    while (set.has(String(n))) n++;
    return String(n);
}

/** Unique labels in order of first appearance: the order citations are numbered in. */
export function citationOrder(labelsInDocOrder: readonly string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const l of labelsInDocOrder) {
        if (!seen.has(l)) {
            seen.add(l);
            out.push(l);
        }
    }
    return out;
}

/** A footnote label as GFM allows it: no whitespace, no `]`, no `^`, not empty. */
export function isValidLabel(l: string): boolean {
    return /^[^\s\]^[]+$/.test(l);
}

/** Plain-text `[^label]: body` lines, in the order given. */
export function renderDefinitions(entries: readonly { label: string; source: Source }[]): string {
    return entries.map((e) => `[^${e.label}]: ${toMarkdown(e.source)}`).join('\n');
}

/**
 * Reads the definition lines out of markdown source: `[^label]: text`, with continuation lines
 * indented by 2+ spaces or a tab (as GFM). Returns the label/text pairs in the order written.
 */
export function parseDefinitionLines(block: string): { label: string; text: string }[] {
    const out: { label: string; text: string }[] = [];
    let live = false; // a definition is still open
    let blank = false; // blank line(s) since its last line
    for (const line of block.split('\n')) {
        const m = /^ {0,3}\[\^([^\s\]^[]+)\]:[ \t]*(.*)$/.exec(line);
        if (m) {
            out.push({ label: m[1], text: m[2].trim() });
            live = true;
            blank = false;
        } else if (line.trim() === '') {
            blank = true;
        } else if (live && (blank ? /^(?: {4,}|\t)\S/ : /^(?: {2,}|\t)\S/).test(line)) {
            // A paragraph after a blank line needs the GFM four-space indent; a plain continuation needs two.
            out[out.length - 1].text += ' ' + line.trim();
            blank = false;
        } else if (live && !blank && !startsBlock(line)) {
            // Lazy continuation: an unindented line straight after paragraph text stays in the paragraph.
            out[out.length - 1].text += ' ' + line.trim();
        } else {
            live = false;
            blank = false;
        }
    }
    return out;
}

/** A line that begins a new block (heading, list item, quote, fence, rule, HTML), so it cannot be a lazy paragraph continuation. */
export function startsBlock(line: string): boolean {
    return /^ {0,3}(?:#{1,6}(?:\s|$)|[-*+]\s|\d{1,9}[.)]\s|>|```|~~~|<|(?:[-*_][ \t]*){3,}$)/.test(line);
}

/** A lookup result from the Worker, made safe to put into a form. */
export interface LookupResult {
    title?: string;
    author?: string;
    website?: string;
    publisher?: string;
    datePublished?: string;
}

export function sanitizeLookup(raw: unknown): LookupResult {
    const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const out: LookupResult = {};
    for (const k of ['title', 'author', 'website', 'publisher'] as const) {
        const v = cleanField(r[k]);
        if (v) out[k] = v;
    }
    const d = cleanField(r.datePublished, 40);
    if (d) {
        const iso = /^(\d{4}-\d{2}-\d{2})/.exec(d);
        out.datePublished = iso ? iso[1] : d;
    }
    return out;
}

/** The text offered as display text when the writer typed none. */
export function fallbackDisplay(s: Source): string {
    return cleanField(s.title) || cleanField(s.site) || 'source';
}

export interface RichSeg extends Seg {
    b?: boolean;
    href?: string;
}

/**
 * The small inline-markdown subset a definition uses (`*italic*`, `**bold**`, `[text](url)`, bare
 * URLs, backslash escapes) as plain segments, so the editor can show an entry without a markdown
 * engine or innerHTML. Anything else is shown as typed.
 */
export function richSegments(md: string): RichSeg[] {
    const out: RichSeg[] = [];
    const re = /\\([\\*_[\]<`])|\*\*([^*]+)\*\*|\*([^*]+)\*|(?<![A-Za-z0-9])_([^_]+)_(?![A-Za-z0-9])|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|(https?:\/\/[^\s<>]+[^\s<>.,;:!?)'"\]])/g;
    let last = 0;
    const text = (t: string) => {
        if (t) out.push({ t });
    };
    for (const m of md.matchAll(re)) {
        text(md.slice(last, m.index));
        last = (m.index ?? 0) + m[0].length;
        if (m[1] !== undefined) text(m[1]);
        else if (m[2] !== undefined) out.push({ t: m[2], b: true });
        else if (m[3] !== undefined || m[4] !== undefined) out.push({ t: (m[3] ?? m[4]) as string, i: true });
        else if (m[5] !== undefined) out.push({ t: m[5], href: m[6] });
        else out.push({ t: m[7], href: m[7] });
    }
    text(md.slice(last));
    return out;
}

/** Only http(s), mailto and site-relative links are offered as links (not protocol-relative `//host`). */
export const isSafeHref = (h: string) => /^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(h);

/** Trailing characters that belong to the sentence, not the address. */
function trimUrl(raw: string): string {
    let u = raw;
    for (;;) {
        const before = u;
        u = u.replace(/[.,;:!?'"*_”’]+$/, '');
        // A closing bracket belongs to the address only when it balances an opening one inside it.
        for (const [open, close] of [['(', ')'], ['[', ']']] as const) {
            while (u.endsWith(close) && u.split(close).length > u.split(open).length) u = u.slice(0, -1);
        }
        if (u === before) return u;
    }
}

/** A safe http(s) address, or null. Rejects other schemes (javascript:, data:, mailto:, ...). */
export function safeHttpUrl(raw: string | undefined | null): string | null {
    if (!raw) return null;
    try {
        const u = new URL(raw.trim());
        return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname ? raw.trim() : null;
    } catch {
        return null;
    }
}

/**
 * The address a definition points at: the target of a markdown link, else the first bare http(s) address
 * in the text, with sentence punctuation and a trailing " Accessed 6 Nov. 2026." left off.
 */
export function firstUrl(md: string): string | null {
    const link = /\[[^\]]*\]\(\s*<?(\S+?)>?(?:\s+"[^"]*")?\s*\)/g;
    for (const m of md.matchAll(link)) {
        const ok = safeHttpUrl(m[1]);
        if (ok) return ok;
    }
    for (const m of md.matchAll(/https?:\/\/[^\s<>]+/gi)) {
        const ok = safeHttpUrl(trimUrl(m[0]));
        if (ok) return ok;
    }
    return null;
}

/** Where a source points: its URL field, else an address found in its text. */
export function sourceHref(s: Source): string | null {
    return safeHttpUrl(s.url) ?? firstUrl(toMarkdown(s));
}
