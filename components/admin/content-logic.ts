/**
 * Pure state logic for the staged projects/resources collections (no React, so
 * `content-logic.selftest.ts` runs it under tsx). `content-store.tsx` wraps these in React state.
 *
 * `revision` counts the moments the stored records change from OUTSIDE the editor on screen: a (re)load,
 * a revert/discard. The body editor (Tiptap) only reads its `value` on mount, so the full-page editor
 * keys it on the revision: a bump remounts it with the new text instead of letting the next keystroke
 * write the old text back. Ordinary typing (`updateItem`) never bumps it.
 */
import { slugify } from '@/lib/utils';
import { DEFAULT_TAG_KEY, normalizeTags, type Tags } from '@/lib/tags';

export type CollectionName = 'projects' | 'resources';

export const COLLECTIONS: Record<CollectionName, { label: string; singular: string; path: string; href: string }> = {
    projects: { label: 'Projects', singular: 'project', path: '/projects', href: '/admin/projects' },
    resources: { label: 'Resources', singular: 'resource', path: '/resources', href: '/admin/resources' },
};

export interface Item {
    /** Stable key for diffing and selection; `id` follows the name and moves on rename. */
    _k: string;
    id: string;
    name: string;
    description: string;
    url: string;
    tags: Tags;
    /** Projects only. Stored as `YYYY-MM-01`: the site shows month and year, so the day is always the 1st (see `toMonthStart`). */
    date?: string;
    published: boolean;
    content?: string;
}

export type Change = { kind: 'added' | 'edited' | 'removed'; item: Item };

export interface CollectionState {
    status: 'idle' | 'loading' | 'ready' | 'error';
    items: Item[];
    base: Item[];
    sha: string;
    error?: string;
    revision: number;
}

export const EMPTY: CollectionState = { status: 'idle', items: [], base: [], sha: '', revision: 0 };

/** Folds a pre-keys flat `tech` / `categories` array into `tags`, and drops it. */
export function normalizeItem(name: CollectionName, raw: Record<string, unknown>): Item {
    const legacyField = name === 'projects' ? 'tech' : 'categories';
    const { [legacyField]: legacy, ...rest } = raw;
    return { ...rest, _k: String(raw.id), tags: normalizeTags(raw.tags, legacy, DEFAULT_TAG_KEY[name]) } as unknown as Item;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function stored({ _k, ...rest }: Item) {
    return rest;
}

export function diff(base: Item[], cur: Item[]): Change[] {
    const baseBy = new Map(base.map((i) => [i._k, i]));
    const curBy = new Map(cur.map((i) => [i._k, i]));
    const out: Change[] = [];
    for (const i of cur) {
        const b = baseBy.get(i._k);
        if (!b) out.push({ kind: 'added', item: i });
        else if (JSON.stringify(stored(b)) !== JSON.stringify(stored(i))) out.push({ kind: 'edited', item: i });
    }
    for (const b of base) if (!curBy.has(b._k)) out.push({ kind: 'removed', item: b });
    return out;
}

/** Reasons a collection cannot be published as staged. */
export function problems(name: CollectionName, items: Item[]): string[] {
    const out: string[] = [];
    const seen = new Map<string, number>();
    for (const i of items) {
        if (!i.name.trim()) out.push(`A ${COLLECTIONS[name].singular} has no name.`);
        else seen.set(i.id, (seen.get(i.id) || 0) + 1);
    }
    for (const [id, n] of seen) if (n > 1) out.push(`Two ${COLLECTIONS[name].label.toLowerCase()} share the URL /${name}/${id}/.`);
    return out;
}

/** A fresh, unpublished record with the given key (`new-...`). */
export function blankItem(name: CollectionName, k: string): Item {
    return name === 'projects'
        ? { _k: k, id: '', name: '', description: '', url: '', tags: {}, date: '', published: false, content: '' }
        : { _k: k, id: '', name: '', url: '', tags: {}, description: '', published: false, content: '' };
}

export const isNewKey = (k: string) => k.startsWith('new-');

/** A brand-new record nobody has typed anything into: safe to drop without asking. */
export function isEmptyNew(item: Item): boolean {
    return isNewKey(item._k) && !item.name.trim() && !item.description.trim() && !item.url.trim() && !(item.content || '').trim()
        && Object.keys(item.tags).length === 0 && !item.date;
}

/**
 * The server's records arrived. On the FIRST load (nothing loaded yet) records created while it was loading
 * are kept in front; on a deliberate reload (conflict "Reload", which says it drops unpublished edits) they go.
 */
export function loadedState(prev: CollectionState, loaded: Item[], sha: string): CollectionState {
    const firstLoad = prev.base.length === 0 && prev.sha === '';
    const keep = firstLoad ? prev.items.filter((i) => isNewKey(i._k)) : [];
    return { status: 'ready', items: [...keep, ...loaded], base: loaded, sha, revision: prev.revision + 1 };
}

export function createItem(s: CollectionState, item: Item): CollectionState {
    return { ...s, items: [item, ...s.items] };
}

/** Typing. The slug is the details-page URL and always follows the name: the site builds its routes from slugify(name), so renaming moves the page. */
export function updateItem(s: CollectionState, k: string, p: Partial<Item>): CollectionState {
    return {
        ...s,
        items: s.items.map((i) => {
            if (i._k !== k) return i;
            const next = { ...i, ...p };
            next.id = slugify(next.name);
            return next;
        }),
    };
}

export function removeItem(s: CollectionState, k: string): CollectionState {
    return { ...s, items: s.items.filter((i) => i._k !== k) };
}

/** Discard one staged change (new: gone; edited: back to the loaded copy; removed: put back where it was). Remounts the body editor. */
export function revertChange(s: CollectionState, c: Change): CollectionState {
    const bump = s.revision + 1;
    if (c.kind === 'added') return { ...s, items: s.items.filter((i) => i._k !== c.item._k), revision: bump };
    const original = s.base.find((i) => i._k === c.item._k);
    if (!original) return s;
    if (c.kind === 'edited') return { ...s, items: s.items.map((i) => (i._k === c.item._k ? original : i)), revision: bump };
    const at = s.base.findIndex((i) => i._k === c.item._k);
    const items = [...s.items];
    items.splice(Math.min(at, items.length), 0, original);
    return { ...s, items, revision: bump };
}

export function rewriteAllTags(s: CollectionState, rewrite: (tags: Tags) => Tags): CollectionState {
    return { ...s, items: s.items.map((i) => ({ ...i, tags: rewrite(i.tags) })) };
}

/** Drops empty new records (an Untitled blocker nobody can see once they navigate away). Same object back when nothing changed. */
export function pruneEmptyNew(s: CollectionState): CollectionState {
    return s.items.some(isEmptyNew) ? { ...s, items: s.items.filter((i) => !isEmptyNew(i)) } : s;
}

/** `2026-03-15` / `2026-03` / `2026` -> `2026-03-01` (month only, day 1); anything else -> ''. */
export function toMonthStart(date: string): string {
    const m = date.match(/^(\d{4})(?:-(\d{2}))?/);
    if (!m) return '';
    const month = m[2] ? Number(m[2]) : 1;
    if (month < 1 || month > 12) return '';
    return `${m[1]}-${String(month).padStart(2, '0')}-01`;
}

/** The key for the body editor: changes only when the text changed from outside it (see the file comment). */
export function bodyEditorKey(revision: number, itemKey: string): string {
    return `${itemKey}@${revision}`;
}
