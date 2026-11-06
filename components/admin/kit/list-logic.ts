/**
 * Pure list logic for the admin kit: no React, so `list-logic.selftest.ts` runs it under tsx.
 * Every admin list (posts, projects, resources, and phase 2's artifacts / AI library / users)
 * filters, searches and moves through rows the same way, so the rules live here once.
 */

export type StatusFilter = 'all' | 'published' | 'draft';

/** Labels for the shared All / Published / Drafts segmented filter. */
export const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'published', label: 'Published' },
    { value: 'draft', label: 'Drafts' },
];

/**
 * True when every word of `query` appears somewhere in the joined fields (case-insensitive).
 * An empty query matches everything. Words, not the whole phrase, so "verses web" finds a
 * row that has both anywhere in its text.
 */
export function matchesQuery(fields: ReadonlyArray<string | null | undefined>, query: string): boolean {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return true;
    const haystack = fields.filter((f): f is string => typeof f === 'string').join('\n').toLowerCase();
    return words.every((w) => haystack.includes(w));
}

export function matchesStatus(published: boolean, filter: StatusFilter): boolean {
    return filter === 'all' || (filter === 'published' ? published : !published);
}

/** Search + status (+ optional extra predicate, e.g. a tag filter) in one pass. */
export function filterRows<T>(
    rows: readonly T[],
    opts: { query: string; status: StatusFilter; fields: (row: T) => ReadonlyArray<string | null | undefined>; published: (row: T) => boolean; extra?: (row: T) => boolean },
): T[] {
    return rows.filter((r) => matchesStatus(opts.published(r), opts.status) && (!opts.extra || opts.extra(r)) && matchesQuery(opts.fields(r), opts.query));
}

/**
 * Index to move to when an arrow key is pressed. `current` is -1 when nothing is focused:
 * Down then goes to the first row, Up to the last. Never wraps and never leaves the list.
 */
export function moveIndex(current: number, delta: 1 | -1, length: number): number {
    if (length <= 0) return -1;
    if (current < 0) return delta === 1 ? 0 : length - 1;
    return Math.max(0, Math.min(length - 1, current + delta));
}

/** The quiet footer line: "Showing 7 of 12". `shown` survives the filters, `loaded` is what the page holds, `total` what exists (may exceed `loaded` while paging). */
export function footerText(shown: number, loaded: number, total = loaded): string {
    return `Showing ${shown} of ${Math.max(total, loaded)}`;
}
