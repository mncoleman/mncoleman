'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authHeaders } from '@/lib/admin-auth';
import { slugify } from '@/lib/utils';
import { DEFAULT_TAG_KEY, normalizeTags, type Tags } from '@/lib/tags';
import { useDeploy } from '@/components/admin/deploy-status';

/**
 * Staged edits for the two JSON-backed collections, `data/projects.json` and
 * `data/resources.json`. Lives in the admin layout so switching between the
 * Projects and Resources sections keeps unpublished work.
 *
 * Edits apply to the staged copy as you type; nothing reaches the site until
 * Publish, which writes each changed file back through the Worker as one commit
 * (the Pages Git integration builds it). The Worker hands out the file's git
 * sha with the items and requires it back, so a 409 means the file moved
 * underneath us (another admin, or an earlier publish) and the only safe move
 * is to reload.
 */

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
    date?: string;
    published: boolean;
    content?: string;
}

export type Change = { kind: 'added' | 'edited' | 'removed'; item: Item };

interface CollectionState {
    status: 'idle' | 'loading' | 'ready' | 'error';
    items: Item[];
    base: Item[];
    sha: string;
    error?: string;
}

const EMPTY: CollectionState = { status: 'idle', items: [], base: [], sha: '' };

/** Folds a pre-keys flat `tech` / `categories` array into `tags`, and drops it. */
function normalizeItem(name: CollectionName, raw: Record<string, unknown>): Item {
    const legacyField = name === 'projects' ? 'tech' : 'categories';
    const { [legacyField]: legacy, ...rest } = raw;
    return { ...rest, _k: String(raw.id), tags: normalizeTags(raw.tags, legacy, DEFAULT_TAG_KEY[name]) } as unknown as Item;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function stored({ _k, ...rest }: Item) {
    return rest;
}

function diff(base: Item[], cur: Item[]): Change[] {
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
function problems(name: CollectionName, items: Item[]): string[] {
    const out: string[] = [];
    const seen = new Map<string, number>();
    for (const i of items) {
        if (!i.name.trim()) out.push(`A ${COLLECTIONS[name].singular} has no name.`);
        else seen.set(i.id, (seen.get(i.id) || 0) + 1);
    }
    for (const [id, n] of seen) if (n > 1) out.push(`Two ${COLLECTIONS[name].label.toLowerCase()} share the URL /${name}/${id}/.`);
    return out;
}

interface ContentContextValue {
    state: Record<CollectionName, CollectionState>;
    changes: Record<CollectionName, Change[]>;
    changeCount: number;
    blockers: string[];
    publishing: boolean;
    publishError: string | null;
    /** The collection a publish found moved on GitHub (409); only a reload resolves it. */
    conflict: CollectionName | null;
    selected: Record<CollectionName, string | null>;
    select: (name: CollectionName, k: string | null) => void;
    ensureLoaded: (name: CollectionName) => void;
    reload: (name: CollectionName) => void;
    update: (name: CollectionName, k: string, patch: Partial<Item>) => void;
    create: (name: CollectionName) => string;
    remove: (name: CollectionName, k: string) => void;
    revert: (name: CollectionName, change: Change) => void;
    rewriteTags: (name: CollectionName, rewrite: (tags: Tags) => Tags) => void;
    publish: () => Promise<void>;
}

const ContentContext = createContext<ContentContextValue | null>(null);

export function ContentProvider({ workerUrl, enabled, children }: { workerUrl: string; enabled: boolean; children: React.ReactNode }) {
    const [state, setState] = useState<Record<CollectionName, CollectionState>>({ projects: EMPTY, resources: EMPTY });
    const [selected, setSelected] = useState<Record<CollectionName, string | null>>({ projects: null, resources: null });
    const [publishing, setPublishing] = useState(false);
    const [publishError, setPublishError] = useState<string | null>(null);
    const [conflict, setConflict] = useState<CollectionName | null>(null);
    const newCount = useRef(0);
    const loading = useRef<Set<CollectionName>>(new Set());
    const { start } = useDeploy();

    const patch = useCallback((name: CollectionName, fn: (s: CollectionState) => CollectionState) => {
        setState((all) => ({ ...all, [name]: fn(all[name]) }));
    }, []);

    const reload = useCallback(async (name: CollectionName) => {
        if (loading.current.has(name)) return;
        loading.current.add(name);
        setConflict((c) => (c === name ? null : c));
        setPublishError(null);
        patch(name, (s) => ({ ...s, status: 'loading', error: undefined }));
        try {
            const res = await fetch(`${workerUrl}/api/collections/${name}`, { headers: authHeaders(), credentials: 'include' });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
            const items = (json.items as Record<string, unknown>[]).map((r) => normalizeItem(name, r));
            setState((all) => ({ ...all, [name]: { status: 'ready', items, base: items, sha: json.sha } }));
            setSelected((s) => ({ ...s, [name]: items.some((i) => i._k === s[name]) ? s[name] : null }));
        } catch (e: unknown) {
            patch(name, (s) => ({ ...s, status: 'error', error: e instanceof Error ? e.message : 'Could not load' }));
        } finally {
            loading.current.delete(name);
        }
    }, [workerUrl, patch]);

    const ensureLoaded = useCallback((name: CollectionName) => {
        if (state[name].status === 'idle') reload(name);
    }, [state, reload]);

    // Overview counts and the ⌘K palette want both collections from the start.
    useEffect(() => {
        if (!enabled) return;
        reload('projects');
        reload('resources');
    }, [enabled, reload]);

    const changes = useMemo(
        () => ({ projects: diff(state.projects.base, state.projects.items), resources: diff(state.resources.base, state.resources.items) }),
        [state]
    );
    const changeCount = changes.projects.length + changes.resources.length;
    const blockers = useMemo(
        () => (['projects', 'resources'] as const).flatMap((n) => (changes[n].length ? problems(n, state[n].items) : [])),
        [changes, state]
    );

    // Staged edits live only in memory.
    useEffect(() => {
        if (changeCount === 0) return;
        const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', onUnload);
        return () => window.removeEventListener('beforeunload', onUnload);
    }, [changeCount]);

    const update = useCallback((name: CollectionName, k: string, p: Partial<Item>) => {
        patch(name, (s) => ({
            ...s,
            items: s.items.map((i) => {
                if (i._k !== k) return i;
                const next = { ...i, ...p };
                // The slug is the details-page URL and always follows the name: the
                // site builds its routes from slugify(name), so renaming moves the page.
                next.id = slugify(next.name);
                return next;
            }),
        }));
    }, [patch]);

    const create = useCallback((name: CollectionName) => {
        const k = `new-${Date.now().toString(36)}-${++newCount.current}`;
        const item: Item = name === 'projects'
            ? { _k: k, id: '', name: '', description: '', url: '', tags: {}, date: '', published: false, content: '' }
            : { _k: k, id: '', name: '', url: '', tags: {}, description: '', published: false, content: '' };
        patch(name, (s) => ({ ...s, items: [item, ...s.items] }));
        setSelected((s) => ({ ...s, [name]: k }));
        return k;
    }, [patch]);

    const remove = useCallback((name: CollectionName, k: string) => {
        patch(name, (s) => ({ ...s, items: s.items.filter((i) => i._k !== k) }));
        setSelected((s) => ({ ...s, [name]: s[name] === k ? null : s[name] }));
    }, [patch]);

    const revert = useCallback((name: CollectionName, c: Change) => {
        patch(name, (s) => {
            if (c.kind === 'added') return { ...s, items: s.items.filter((i) => i._k !== c.item._k) };
            const original = s.base.find((i) => i._k === c.item._k);
            if (!original) return s;
            if (c.kind === 'edited') return { ...s, items: s.items.map((i) => (i._k === c.item._k ? original : i)) };
            const at = s.base.findIndex((i) => i._k === c.item._k);
            const items = [...s.items];
            items.splice(Math.min(at, items.length), 0, original);
            return { ...s, items };
        });
    }, [patch]);

    const rewriteTags = useCallback((name: CollectionName, rewrite: (tags: Tags) => Tags) => {
        patch(name, (s) => ({ ...s, items: s.items.map((i) => ({ ...i, tags: rewrite(i.tags) })) }));
    }, [patch]);

    const select = useCallback((name: CollectionName, k: string | null) => setSelected((s) => ({ ...s, [name]: k })), []);

    const publish = useCallback(async () => {
        if (changeCount === 0 || blockers.length || publishing) return;
        setPublishing(true);
        setPublishError(null);
        setConflict(null);
        let commit: string | undefined;
        const keys: string[] = [];
        try {
            for (const name of ['projects', 'resources'] as const) {
                if (!changes[name].length) continue;
                const { items, sha } = state[name];
                const res = await fetch(`${workerUrl}/api/collections/${name}`, {
                    method: 'PUT',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    credentials: 'include',
                    body: JSON.stringify({ items: items.map(stored), sha, message: `Update ${name} via admin panel` }),
                });
                const json = await res.json();
                if (res.status === 409) setConflict(name);
                if (!res.ok) throw new Error(json.message || json.error || `Publishing ${name} failed (${res.status})`);
                patch(name, (s) => ({ ...s, base: items, sha: json.sha }));
                keys.push(...changes[name].map((c) => c.item._k));
                commit = json.commit || commit;
            }
        } catch (e: unknown) {
            setPublishError(e instanceof Error ? e.message : 'Publish failed');
        } finally {
            setPublishing(false);
        }
        // Whatever did commit is building, even if a later collection failed.
        if (commit) start('publish', { commit, keys });
    }, [changeCount, blockers, publishing, changes, state, workerUrl, patch, start]);

    const value: ContentContextValue = {
        state, changes, changeCount, blockers, publishing, publishError, conflict, selected, select,
        ensureLoaded, reload, update, create, remove, revert, rewriteTags, publish,
    };
    return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent(): ContentContextValue {
    const ctx = useContext(ContentContext);
    if (!ctx) throw new Error('useContent must be used inside ContentProvider');
    return ctx;
}
