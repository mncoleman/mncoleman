/**
 * The daily brief's edition format: its types, and the one validator every
 * writer goes through (`PUT /api/briefs/:date` in the admin Worker, which is
 * what the `publish_brief` MCP tool calls).
 *
 * An edition is DATA ONLY. The site renders every edition from this shape with
 * one template (`components/brief/`), so nothing here may carry markup: text
 * fields are reduced to plain text, and anything that looked like HTML or
 * Markdown is reported as a warning rather than rendered.
 *
 * Errors name the field (`sectors[1].items[2].sources[0].url`) and the reason,
 * so a model that produced the edition can fix exactly that and retry.
 * Warnings do not block publishing.
 *
 * No imports: this file is bundled into two Workers and the Next client.
 * `npx tsx lib/brief.selftest.ts` checks it.
 */

export const SECTOR_KEYS = ['signal', 'local', 'nation', 'world', 'field_notes'] as const;
export type SectorKey = typeof SECTOR_KEYS[number];
export const CONFIDENCE = ['confirmed', 'developing', 'contested', 'note'] as const;
export type Confidence = typeof CONFIDENCE[number];

export interface BriefSource { outlet: string; url: string }
/** `brief` is the line on the card; `detail` is the whole write-up shown when it is opened, paragraphs split by a blank line. */
export interface BriefItem { id: string; confidence: Confidence; title: string; brief: string; detail: string; sources: BriefSource[] }
export interface BriefSector { key: SectorKey; title: string; summary: string; items: BriefItem[] }
export interface BriefWatch { when: string; label: string; what: string; sources: BriefSource[] }

export interface BriefEdition {
    date: string;
    edition_number: number;
    location: string;
    compiled_at: string;
    /** One sentence for the opening page. Optional: the page falls back to the first top story. */
    summary?: string;
    weather?: { summary: string; high_f: number; tonight: string; wind: string; tomorrow: string; source: string; source_url?: string };
    verse?: { text: string; reference: string; translation: string; url?: string };
    devotional?: { title: string; scripture: { reference: string; text: string }; body: string; attribution: string; url?: string };
    top_signals: { headline: string; sector: SectorKey; item_id: string }[];
    sectors: BriefSector[];
    watchlist: BriefWatch[];
    notices: string[];
}

/** One row of the archive: what the calendar, the list and `list_briefs` show. */
export interface BriefSummary { date: string; edition_number: number; headline: string; hidden?: boolean }

export interface BriefIssue { path: string; reason: string }
export type BriefResult =
    | { ok: true; edition: BriefEdition; warnings: BriefIssue[] }
    | { ok: false; errors: BriefIssue[]; warnings: BriefIssue[] };

/** KV layout of the BRIEFS namespace, shared by the Worker that writes it and the one that reads it. */
export const BRIEF_INDEX_KEY = 'index';
export const BRIEF_CONFIG_KEY = 'config';
export const briefKey = (date: string) => `brief:${date}`;
/** `private` turns the whole section off for the public (pages, API and MCP) without deleting anything. */
export interface BriefLink { label: string; url: string }
/** `links` is the "External sources" page: a list kept in the admin panel, the same on every edition. */
export interface BriefConfig { visibility: 'public' | 'private'; links?: BriefLink[] }
export const DEFAULT_BRIEF_CONFIG: BriefConfig = { visibility: 'public', links: [] };

/** The admin panel's link list, checked before it is stored. Returns the clean list or a message. */
export function cleanBriefLinks(input: unknown): BriefLink[] | string {
    if (!Array.isArray(input) || input.length > 60) return 'links must be a list of at most 60';
    const out: BriefLink[] = [];
    for (const [i, raw] of input.entries()) {
        const label = typeof raw?.label === 'string' ? raw.label.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
        let href = '';
        if (typeof raw?.url === 'string' && raw.url.length <= 600) { try { const u = new URL(raw.url); if (/^https?:$/.test(u.protocol)) href = u.href; } catch { /* refused below */ } }
        if (!label || !href) return `link ${i + 1} needs a name and an http(s) address`;
        out.push({ label, url: href });
    }
    return out;
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z][a-z0-9_-]{0,15}$/;

export function isBriefDate(v: unknown): v is string {
    if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Text with any HTML and the common Markdown markers removed. One line, unless
 * `paragraphs`: then blank lines are kept as paragraph breaks (an item's full
 * write-up), and everything else still collapses.
 */
function toPlain(raw: string, paragraphs = false): string {
    // Control characters and lone surrogates first: they are illegal in XML and one would break the whole feed.
    // The tag and link patterns are length-bounded so a hostile string cannot make them quadratic.
    const clean = raw
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/g, '')
        .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
        .replace(/<[^<>]{0,400}>/g, '')
        .replace(/!?\[([^\[\]]{0,300})\]\((?:https?:|\/)[^()\s]{0,600}\)/g, '$1')
        .replace(/\*\*|__|`/g, '')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '');
    const line = (t: string) => t.replace(/\s+/g, ' ').trim();
    return paragraphs ? clean.split(/\n\s*\n/).map(line).filter(Boolean).join('\n\n') : line(clean);
}

export const briefHeadline = (e: Pick<BriefEdition, 'top_signals' | 'sectors'>): string =>
    e.top_signals[0]?.headline || e.sectors[0]?.items[0]?.title || '';

export function validateBrief(input: unknown): BriefResult {
    const errors: BriefIssue[] = [];
    const warnings: BriefIssue[] = [];
    const err = (path: string, reason: string) => { errors.push({ path, reason }); };
    const warn = (path: string, reason: string) => { warnings.push({ path, reason }); };
    const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

    /** A plain-text field. Returns '' when absent; reports when required, too long, or cleaned. */
    const text = (v: unknown, path: string, max: number, required = true, paragraphs = false): string => {
        if (v === undefined || v === null || v === '') {
            if (required) err(path, 'required, a non-empty string');
            return '';
        }
        if (typeof v !== 'string') { err(path, 'must be a string'); return ''; }
        // Refused before any cleaning runs: nothing legitimate is several times its own limit.
        if (v.length > max * 3 + 500) { err(path, `far too long: ${v.length} characters, the limit is ${max}`); return ''; }
        const clean = toPlain(v, paragraphs);
        if (clean.replace(/\s+/g, ' ') !== v.replace(/\s+/g, ' ').trim()) warn(path, 'HTML or Markdown was removed; send plain text');
        if (!clean && required) err(path, 'required, a non-empty string');
        if (clean.length > max) err(path, `too long: ${clean.length} characters, the limit is ${max}`);
        if (/[–—]/.test(clean)) warn(path, 'contains an en dash or em dash; use commas, colons or "to"');
        return clean;
    };
    const url = (v: unknown, path: string, required: boolean): string | undefined => {
        if (v === undefined || v === null || v === '') {
            if (required) err(path, 'required: the address this came from, so the reader can open it');
            return undefined;
        }
        // Stored as the parser's own normalised form, never the raw string.
        let href = '';
        if (typeof v === 'string' && v.length <= 600) { try { const u = new URL(v); if (/^https?:$/.test(u.protocol)) href = u.href; } catch { /* invalid below */ } }
        if (!href || href.length > 700) { err(path, 'must be an http(s) URL of at most 600 characters'); return undefined; }
        return href;
    };
    const list = (v: unknown, path: string, min: number, max: number): unknown[] => {
        if (v === undefined || v === null) { if (min > 0) err(path, `required, an array of ${min} to ${max}`); return []; }
        if (!Array.isArray(v)) { err(path, 'must be an array'); return []; }
        if (v.length < min || v.length > max) err(path, `has ${v.length} entries; it needs ${min} to ${max}`);
        return v.slice(0, max);
    };
    const sources = (v: unknown, path: string): BriefSource[] =>
        list(v, path, 1, 6).map((s, i) => {
            const p = `${path}[${i}]`;
            if (!isObj(s)) { err(p, 'must be an object {outlet, url}'); return { outlet: '', url: '' }; }
            return { outlet: text(s.outlet, `${p}.outlet`, 60), url: url(s.url, `${p}.url`, true) || '' };
        });

    if (!isObj(input)) return { ok: false, errors: [{ path: '', reason: 'the edition must be a JSON object' }], warnings };

    const date = isBriefDate(input.date) ? input.date : '';
    if (!date) err('date', 'required, a real calendar date as YYYY-MM-DD');
    let editionNumber = 0;
    if (input.edition_number !== undefined && input.edition_number !== null) {
        if (Number.isInteger(input.edition_number) && (input.edition_number as number) > 0 && (input.edition_number as number) < 100000) editionNumber = input.edition_number as number;
        else err('edition_number', 'must be a positive whole number, or left out for the server to assign');
    }
    const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
    const compiledAt = typeof input.compiled_at === 'string' && ISO_RE.test(input.compiled_at) && !Number.isNaN(Date.parse(input.compiled_at)) ? input.compiled_at : '';
    if (!compiledAt) err('compiled_at', 'required, an ISO 8601 timestamp such as 2026-11-13T07:52:00-07:00');

    const edition: BriefEdition = {
        date, edition_number: editionNumber, location: text(input.location, 'location', 60), compiled_at: compiledAt,
        top_signals: [], sectors: [], watchlist: [], notices: [],
    };
    // `bluf` is the name the first drafts of the format used; both are accepted, `summary` is stored.
    const summary = text(input.summary ?? input.bluf, 'summary', 300, false);
    if (summary) edition.summary = summary;

    if (input.weather !== undefined && input.weather !== null) {
        const w = input.weather;
        if (!isObj(w)) err('weather', 'must be an object');
        else {
            const high = typeof w.high_f === 'number' && Number.isFinite(w.high_f) && w.high_f > -100 && w.high_f < 150 ? Math.round(w.high_f) : NaN;
            if (Number.isNaN(high)) err('weather.high_f', 'required, a number in degrees Fahrenheit');
            edition.weather = {
                summary: text(w.summary, 'weather.summary', 80), high_f: high, tonight: text(w.tonight, 'weather.tonight', 120),
                wind: text(w.wind, 'weather.wind', 60), tomorrow: text(w.tomorrow, 'weather.tomorrow', 120), source: text(w.source, 'weather.source', 60),
            };
            const su = url(w.source_url, 'weather.source_url', false);
            if (su) edition.weather.source_url = su; else if (!errors.some((e) => e.path === 'weather.source_url')) warn('weather.source_url', 'missing: add the forecast page so the reader can open it');
        }
    }
    if (input.verse !== undefined && input.verse !== null) {
        const v = input.verse;
        if (!isObj(v)) err('verse', 'must be an object');
        else {
            edition.verse = { text: text(v.text, 'verse.text', 700), reference: text(v.reference, 'verse.reference', 60), translation: text(v.translation, 'verse.translation', 20) };
            const vu = url(v.url, 'verse.url', false);
            if (vu) edition.verse.url = vu; else if (!errors.some((e) => e.path === 'verse.url')) warn('verse.url', 'missing: add a link to the passage');
        }
    }
    if (input.devotional !== undefined && input.devotional !== null) {
        const d = input.devotional;
        if (!isObj(d)) err('devotional', 'must be an object');
        else {
            const sc = isObj(d.scripture) ? d.scripture : {};
            if (!isObj(d.scripture)) err('devotional.scripture', 'required, an object {reference, text}');
            edition.devotional = {
                title: text(d.title, 'devotional.title', 120),
                scripture: { reference: text(sc.reference, 'devotional.scripture.reference', 60), text: text(sc.text, 'devotional.scripture.text', 700) },
                body: text(d.body, 'devotional.body', 6000, true, true), attribution: text(d.attribution, 'devotional.attribution', 160),
            };
            const du = url(d.url, 'devotional.url', false);
            if (du) edition.devotional.url = du; else if (!errors.some((e) => e.path === 'devotional.url')) warn('devotional.url', 'missing: add a link to the reading');
        }
    }

    const ids = new Map<string, SectorKey>();
    const seenSectors = new Set<string>();
    edition.sectors = list(input.sectors, 'sectors', 1, SECTOR_KEYS.length).map((s, si) => {
        const p = `sectors[${si}]`;
        if (!isObj(s)) { err(p, 'must be an object'); return null; }
        const key = (SECTOR_KEYS as readonly string[]).includes(s.key as string) ? (s.key as SectorKey) : null;
        if (!key) err(`${p}.key`, `must be one of: ${SECTOR_KEYS.join(', ')}`);
        else if (seenSectors.has(key)) err(`${p}.key`, `"${key}" appears twice; each sector may appear once`);
        if (key) seenSectors.add(key);
        const rawItems = list(s.items, `${p}.items`, 1, 8);
        if (rawItems.length > 0 && rawItems.length < 3) warn(`${p}.items`, `only ${rawItems.length}; a sector normally carries 3 to 8 items`);
        const items = rawItems.map((it, ii) => {
            const ip = `${p}.items[${ii}]`;
            if (!isObj(it)) { err(ip, 'must be an object'); return null; }
            const id = typeof it.id === 'string' && ID_RE.test(it.id) ? it.id : '';
            if (!id) err(`${ip}.id`, 'required: a short id such as "s1" (lowercase letter first, then letters, digits, - or _, 16 at most)');
            else if (ids.has(id)) err(`${ip}.id`, `"${id}" is already used by another item; ids must be unique in the edition`);
            else if (key) ids.set(id, key);
            const confidence = (CONFIDENCE as readonly string[]).includes(it.confidence as string) ? (it.confidence as Confidence) : null;
            if (!confidence) err(`${ip}.confidence`, `must be one of: ${CONFIDENCE.join(', ')}`);
            return {
                id, confidence: confidence || 'note', title: text(it.title, `${ip}.title`, 110), brief: text(it.brief, `${ip}.brief`, 260),
                detail: text(it.detail, `${ip}.detail`, 8000, true, true), sources: sources(it.sources, `${ip}.sources`),
            };
        }).filter((x): x is BriefItem => !!x);
        return { key: key || 'signal', title: text(s.title, `${p}.title`, 60), summary: text(s.summary ?? s.bluf, `${p}.summary`, 300), items };
    }).filter((x): x is BriefSector => !!x);

    edition.top_signals = list(input.top_signals, 'top_signals', 0, 5).map((t, i) => {
        const p = `top_signals[${i}]`;
        if (!isObj(t)) { err(p, 'must be an object {headline, sector, item_id}'); return null; }
        const owner = typeof t.item_id === 'string' ? ids.get(t.item_id) : undefined;
        if (!owner) err(`${p}.item_id`, 'must be the id of an item in this edition');
        else if (t.sector !== owner) err(`${p}.sector`, `item "${t.item_id}" is in sector "${owner}", not "${String(t.sector)}"`);
        return { headline: text(t.headline, `${p}.headline`, 200), sector: owner || 'signal', item_id: String(t.item_id || '') };
    }).filter((x): x is BriefEdition['top_signals'][number] => !!x);

    edition.watchlist = list(input.watchlist, 'watchlist', 0, 15).map((w, i) => {
        const p = `watchlist[${i}]`;
        if (!isObj(w)) { err(p, 'must be an object {when, label, what, sources}'); return null; }
        if (!isBriefDate(w.when)) err(`${p}.when`, 'required, a date as YYYY-MM-DD (used for sorting; `label` is what is shown)');
        return { when: isBriefDate(w.when) ? w.when : '', label: text(w.label, `${p}.label`, 24), what: text(w.what, `${p}.what`, 220), sources: sources(w.sources, `${p}.sources`) };
    }).filter((x): x is BriefWatch => !!x).sort((a, b) => a.when.localeCompare(b.when));

    edition.notices = list(input.notices, 'notices', 0, 8).map((n, i) => text(n, `notices[${i}]`, 400)).filter(Boolean);

    for (const k of Object.keys(input)) {
        if (!['date', 'edition_number', 'location', 'compiled_at', 'summary', 'bluf', 'weather', 'verse', 'devotional', 'top_signals', 'sectors', 'watchlist', 'notices'].includes(k)) {
            warn(k, 'unknown field, ignored');
        }
    }
    return errors.length ? { ok: false, errors, warnings } : { ok: true, edition, warnings };
}
