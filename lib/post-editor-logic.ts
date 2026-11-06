/**
 * Pure helpers behind the post editor's branded controls: no DOM, no React, so
 * `lib/post-editor-logic.selftest.ts` can run them under plain tsx.
 */
import { slugFromTitle } from './post-format';

/* ---------------------------------- dates --------------------------------- */

const pad = (n: number) => String(n).padStart(2, '0');

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function daysInMonth(year: number, month0: number): number {
    return new Date(year, month0 + 1, 0).getDate();
}

/** `YYYY-MM-DD` for a real calendar day, otherwise null (month 13, Feb 30, ...). */
export function toIso(year: number, month0: number, day: number): string | null {
    if (!Number.isInteger(year) || !Number.isInteger(month0) || !Number.isInteger(day)) return null;
    if (year < 1000 || year > 9999 || month0 < 0 || month0 > 11 || day < 1 || day > daysInMonth(year, month0)) return null;
    return `${year}-${pad(month0 + 1)}-${pad(day)}`;
}

/** Splits a date or datetime string into its calendar parts; null when it does not start with a real date. */
export function partsOf(value: string): { year: number; month0: number; day: number } | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || '');
    if (!m) return null;
    const year = Number(m[1]), month0 = Number(m[2]) - 1, day = Number(m[3]);
    return toIso(year, month0, day) ? { year, month0, day } : null;
}

export function addDays(iso: string, n: number): string {
    const p = partsOf(iso);
    if (!p) return iso;
    const d = new Date(p.year, p.month0, p.day + n);
    return toIso(d.getFullYear(), d.getMonth(), d.getDate()) || iso;
}

/** Moves by whole months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, n: number): string {
    const p = partsOf(iso);
    if (!p) return iso;
    const first = new Date(p.year, p.month0 + n, 1);
    const day = Math.min(p.day, daysInMonth(first.getFullYear(), first.getMonth()));
    return toIso(first.getFullYear(), first.getMonth(), day) || iso;
}

export function todayIso(now = new Date()): string {
    return toIso(now.getFullYear(), now.getMonth(), now.getDate())!;
}

/** `November 4, 2026`. Fixed locale: the same words on every machine. */
export function formatLongDate(value: string): string {
    const p = partsOf(value);
    return p ? `${MONTH_NAMES[p.month0]} ${p.day}, ${p.year}` : '';
}

/** Six weeks of cells starting on the Sunday on or before the 1st. */
export function monthGrid(year: number, month0: number): { iso: string; day: number; inMonth: boolean }[] {
    const first = new Date(year, month0, 1);
    const cells: { iso: string; day: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
        const d = new Date(year, month0, 1 - first.getDay() + i);
        cells.push({ iso: toIso(d.getFullYear(), d.getMonth(), d.getDate())!, day: d.getDate(), inMonth: d.getMonth() === month0 });
    }
    return cells;
}

const MONTH_BY_NAME: Record<string, number> = Object.fromEntries(
    MONTH_NAMES.flatMap((n, i) => [[n.toLowerCase(), i], [n.slice(0, 3).toLowerCase(), i]]),
);

/**
 * What people type into the date box: `2026-11-04`, `11/4/2026`, `Nov 4, 2026`,
 * `4 November 2026`. Anything that is not a real day is null.
 */
export function parseTypedDate(text: string): string | null {
    const t = text.trim().replace(/\s+/g, ' ');
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
    if (m) return toIso(+m[1], +m[2] - 1, +m[3]);
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
    if (m) return toIso(+m[3], +m[1] - 1, +m[2]);
    m = /^([A-Za-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/.exec(t);
    if (m && MONTH_BY_NAME[m[1].toLowerCase()] !== undefined) return toIso(+m[3], MONTH_BY_NAME[m[1].toLowerCase()], +m[2]);
    m = /^(\d{1,2}) ([A-Za-z]+)\.?,? (\d{4})$/.exec(t);
    if (m && MONTH_BY_NAME[m[2].toLowerCase()] !== undefined) return toIso(+m[3], MONTH_BY_NAME[m[2].toLowerCase()], +m[1]);
    return null;
}

/* ----------------------------------- slug ---------------------------------- */

/**
 * The web address follows the title until it is edited by hand, and never moves
 * once the post exists on the site (changing it would break links).
 */
export function slugAfterTitleChange(opts: { title: string; slug: string; touched: boolean; locked: boolean }): string {
    return opts.touched || opts.locked ? opts.slug : slugFromTitle(opts.title);
}

/** What a hand-typed web address becomes: lowercase, single hyphens, no edge hyphens (a trailing one is kept while typing). */
export function cleanTypedSlug(raw: string): string {
    return raw
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+/, '')
        .slice(0, 80);
}

/* ---------------------------------- people --------------------------------- */

export interface PanelUser {
    name: string;
    role: string;
    /** Opaque URL of the person's profile photo, or absent/null (initials are shown instead). */
    photoUrl?: string | null;
}

export interface AuthorOption extends PanelUser {
    /** Not a current panel user (e.g. an old post's "Anonymous"): kept so the value is never lost. */
    external?: boolean;
}

export function roleLabel(role: string): string {
    return role === 'super_admin' ? 'Owner' : role === 'editor' ? 'Editor' : role === 'site_admin' || role === 'admin' ? 'Site admin' : '';
}

/** Panel users, with the post's current author kept selectable when it is not one of them. */
export function authorOptions(users: PanelUser[], current: string): AuthorOption[] {
    const seen = new Set<string>();
    const out: AuthorOption[] = [];
    for (const u of users) {
        const key = u.name.trim().toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push({ name: u.name.trim(), role: u.role, photoUrl: u.photoUrl || null });
    }
    const cur = current.trim();
    if (cur && !seen.has(cur.toLowerCase())) out.unshift({ name: cur, role: '', external: true });
    return out;
}

export function initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

const AVATAR_COLORS = ['#525252', '#0e7490', '#9333ea', '#b45309', '#be123c', '#15803d', '#1d4ed8'];
export function colorOf(text: string): string {
    return AVATAR_COLORS[[...text].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
}

/* ----------------------------------- tags ---------------------------------- */

const TAG_HUES = ['#737373', '#0ea5e9', '#a855f7', '#22c55e', '#f59e0b', '#ef4444', '#14b8a6'];
export function tagHue(tag: string): string {
    return TAG_HUES[[...tag].reduce((a, c) => a + c.charCodeAt(0), 0) % TAG_HUES.length];
}

export interface TagChoice {
    tag: string;
    create?: boolean;
}

/** Suggestions for the tag box: unused existing tags that match, plus "create" when nothing matches the text exactly. */
export function tagChoices(query: string, all: string[], chosen: string[]): TagChoice[] {
    const q = query.trim();
    const ql = q.toLowerCase();
    const out: TagChoice[] = all
        .filter((t) => !chosen.some((c) => c.toLowerCase() === t.toLowerCase()) && t.toLowerCase().includes(ql))
        .map((tag) => ({ tag }));
    if (q && ![...all, ...chosen].some((t) => t.toLowerCase() === ql)) out.push({ tag: q, create: true });
    return out;
}

/** Placeholder for an empty heading: h2/h3/h4 read Heading 1/2/3 (the post title is the page's h1); a stray h1 reads Heading 1, never 0. */
export function headingHint(level: unknown): string {
    return `Heading ${Math.min(3, Math.max(1, Number(level) - 1 || 1))}`;
}
