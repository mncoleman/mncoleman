'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { authHeaders } from '@/lib/admin-auth';
import type { Tags } from '@/lib/tags';
import {
    COLLECTIONS, EMPTY, blankItem, createItem, diff, loadedState, normalizeItem, problems, pruneEmptyNew, removeItem, revertChange, rewriteAllTags, stored, updateItem,
    type Change, type CollectionName, type CollectionState, type Item,
} from '@/components/admin/content-logic';
import { usePathname } from 'next/navigation';
import { useDeploy } from '@/components/admin/deploy-status';
import { includedInGlobalPublish, isPrivateDraft, postBlockers, publishPendingPosts, type PendingPost } from '@/lib/post-staging';

/**
 * Staged edits for the two JSON-backed collections, `data/projects.json` and
 * `data/resources.json`, plus blog posts. Lives in the admin layout so switching between
 * sections keeps unpublished work.
 *
 * Posts are staged differently: the editor already autosaves them to the Worker (KV drafts), so
 * the store only lists which drafts differ from the committed file (`GET /api/posts?pending=1`,
 * no per-post fetches) and, on Publish, sends each one through the editor's own publish route
 * with the Status the writer set (a Draft is saved but stays hidden). See lib/post-staging.ts.
 *
 * Edits apply to the staged copy as you type; nothing reaches the site until
 * Publish, which writes each changed file back through the Worker as one commit
 * (the Pages Git integration builds it). The Worker hands out the file's git
 * sha with the items and requires it back, so a 409 means the file moved
 * underneath us (another admin, or an earlier publish) and the only safe move
 * is to reload.
 */

export { COLLECTIONS, type CollectionName, type Item, type Change } from '@/components/admin/content-logic';

/** The full-page editor for one record. Static export has no per-record routes, so the key rides in the query string (like /admin/posts/edit?slug=). */
export function editHref(name: CollectionName, k: string): string {
    return `${COLLECTIONS[name].href}/edit?id=${encodeURIComponent(k)}`;
}

interface PostsState {
    status: 'idle' | 'loading' | 'ready' | 'error';
    pending: PendingPost[];
    error?: string;
}

/** Pages the Worker's pending list until it says there is no more (it caps a page at 40, under the subrequest limit). */
async function fetchPendingPosts(workerUrl: string): Promise<PendingPost[]> {
    const out: PendingPost[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
        const res: Response = await fetch(`${workerUrl}/api/posts?pending=1&offset=${offset}`, { headers: authHeaders(), credentials: 'include' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Could not check posts (${res.status})`);
        if (Array.isArray(json.unreadable) && json.unreadable.length) throw new Error('Could not check some posts right now.');
        out.push(...(json.posts as PendingPost[]));
        offset = typeof json.nextOffset === 'number' ? json.nextOffset : null;
    }
    return out;
}

interface ContentContextValue {
    state: Record<CollectionName, CollectionState>;
    changes: Record<CollectionName, Change[]>;
    /** Posts that count as unpublished and that global Publish will commit (already in the repo, or set to Published). */
    postChanges: PendingPost[];
    /** Never-committed Drafts: kept private in KV, listed but not counted, committed only by that post's own Publish changes. */
    privateDrafts: PendingPost[];
    /** Included posts that cannot be published as they are (no title, changed on the site); skipped with these notes while everything else publishes. */
    postWarnings: string[];
    postsStatus: PostsState['status'];
    /** Re-reads which posts are unpublished; waits `delay` ms first and merges bursts (the editor calls it after every save). */
    refreshPosts: (delay?: number) => void;
    changeCount: number;
    /** False when everything pending is a post that cannot go out right now. */
    canPublish: boolean;
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
    const [posts, setPosts] = useState<PostsState>({ status: 'idle', pending: [] });
    const newCount = useRef(0);
    const loading = useRef<Set<CollectionName>>(new Set());
    const postsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const postsSeq = useRef(0);
    const lastPostsLoad = useRef(0);
    const { start } = useDeploy();
    const pathname = usePathname();

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
            // Records created while this was loading stay (first load only); a deliberate reload drops unpublished edits, as its button says.
            setState((all) => ({ ...all, [name]: loadedState(all[name], items, json.sha) }));
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

    const loadPosts = useCallback(async (): Promise<PendingPost[] | null> => {
        const seq = ++postsSeq.current;
        lastPostsLoad.current = Date.now();
        setPosts((p) => ({ ...p, status: p.status === 'ready' ? 'ready' : 'loading' }));
        try {
            const pending = await fetchPendingPosts(workerUrl);
            if (seq === postsSeq.current) setPosts({ status: 'ready', pending });
            return pending;
        } catch (e: unknown) {
            if (seq === postsSeq.current) setPosts((p) => ({ ...p, status: 'error', error: e instanceof Error ? e.message : 'Could not check posts' }));
            return null;
        }
    }, [workerUrl]);

    const refreshPosts = useCallback((delay = 0) => {
        if (!enabled) return;
        clearTimeout(postsTimer.current);
        postsTimer.current = setTimeout(() => { void loadPosts(); }, delay);
    }, [enabled, loadPosts]);
    useEffect(() => () => clearTimeout(postsTimer.current), []);

    // Posts change while you are in the editor (autosave) and from other tabs: look again when moving
    // between sections and when this tab regains focus. The first look happens on arrival.
    // Not while editing a post: the count is hidden there and every autosave would otherwise cost GitHub reads.
    // Arriving anywhere else (including leaving the editor) looks again, after a beat so its last save can land.
    useEffect(() => {
        if (/^\/admin\/posts\/edit\/?$/.test(pathname)) return;
        refreshPosts(1200);
    }, [pathname, refreshPosts]);
    useEffect(() => {
        if (!enabled) return;
        // At most once a minute: focus fires constantly when switching windows.
        const onFocus = () => { if (Date.now() - lastPostsLoad.current > 60_000) refreshPosts(0); };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [enabled, refreshPosts]);

    const changes = useMemo(
        () => ({ projects: diff(state.projects.base, state.projects.items), resources: diff(state.resources.base, state.resources.items) }),
        [state]
    );
    const collectionCount = changes.projects.length + changes.resources.length;
    const postChanges = useMemo(() => posts.pending.filter(includedInGlobalPublish), [posts.pending]);
    const privateDrafts = useMemo(() => posts.pending.filter(isPrivateDraft), [posts.pending]);
    const postWarnings = useMemo(() => postBlockers(postChanges), [postChanges]);
    const publishablePosts = useMemo(() => postChanges.filter((p) => !p.problem && !p.stale), [postChanges]);
    const changeCount = collectionCount + postChanges.length;
    // Only project/resource problems stop the whole Publish; a post that cannot go out is skipped with a note.
    const blockers = useMemo(
        () => (['projects', 'resources'] as const).flatMap((n) => (changes[n].length ? problems(n, state[n].items) : [])),
        [changes, state]
    );
    const canPublish = collectionCount + publishablePosts.length > 0;

    // Staged project and resource edits live only in memory. Posts are already saved as drafts online.
    useEffect(() => {
        if (collectionCount === 0) return;
        const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
        window.addEventListener('beforeunload', onUnload);
        return () => window.removeEventListener('beforeunload', onUnload);
    }, [collectionCount]);

    const update = useCallback((name: CollectionName, k: string, p: Partial<Item>) => {
        patch(name, (s) => updateItem(s, k, p));
    }, [patch]);

    const create = useCallback((name: CollectionName) => {
        const k = `new-${Date.now().toString(36)}-${++newCount.current}`;
        patch(name, (s) => createItem(s, blankItem(name, k)));
        setSelected((s) => ({ ...s, [name]: k }));
        return k;
    }, [patch]);

    const remove = useCallback((name: CollectionName, k: string) => {
        patch(name, (s) => removeItem(s, k));
        setSelected((s) => ({ ...s, [name]: s[name] === k ? null : s[name] }));
    }, [patch]);

    const revert = useCallback((name: CollectionName, c: Change) => {
        patch(name, (s) => revertChange(s, c));
    }, [patch]);

    const rewriteTags = useCallback((name: CollectionName, rewrite: (tags: Tags) => Tags) => {
        patch(name, (s) => rewriteAllTags(s, rewrite));
    }, [patch]);

    // A brand-new record nobody typed into would otherwise sit there as an "Untitled" publish blocker once you
    // leave its editor (Back, the sidebar, a link): drop it when the route moves off that collection's editor.
    useEffect(() => {
        for (const name of ['projects', 'resources'] as const) {
            if (pathname.startsWith(`${COLLECTIONS[name].href}/edit`)) continue;
            patch(name, pruneEmptyNew);
        }
    }, [pathname, patch]);

    const select = useCallback((name: CollectionName, k: string | null) => setSelected((s) => ({ ...s, [name]: k })), []);

    const publish = useCallback(async () => {
        if (!canPublish || blockers.length || publishing) return;
        setPublishing(true);
        setPublishError(null);
        setConflict(null);
        let commit: string | undefined;
        const keys: string[] = [];
        const errors: string[] = [];
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
            errors.push(e instanceof Error ? e.message : 'Publish failed');
        }
        // Posts go through the editor's own route, one at a time, each with its own Status. A failure
        // in one collection does not hold them back, and one failed post does not hold back the rest.
        if (publishablePosts.length) {
            try {
                const fresh = ((await loadPosts()) ?? publishablePosts).filter(includedInGlobalPublish);
                const out = await publishPendingPosts(async (path, init) => {
                    const res = await fetch(`${workerUrl}${path}`, {
                        method: init?.method || 'GET',
                        headers: authHeaders(init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined),
                        credentials: 'include',
                        body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
                    });
                    let json: unknown = null;
                    try { json = await res.json(); } catch { /* empty body */ }
                    return { status: res.status, json };
                }, fresh);
                keys.push(...out.done);
                commit = out.commit || commit;
                for (const f of out.errors) errors.push(`The post “${f.title}” ${f.message}.`);
            } catch (e: unknown) {
                errors.push(e instanceof Error ? e.message : 'Publishing posts failed');
            }
            void loadPosts();
        }
        if (errors.length) setPublishError(errors.join(' '));
        setPublishing(false);
        // Whatever did commit is building, even if a later collection failed.
        if (commit) start('publish', { commit, keys });
    }, [canPublish, blockers, publishing, changes, state, publishablePosts, workerUrl, patch, start, loadPosts]);

    const value: ContentContextValue = {
        state, changes, postChanges, privateDrafts, postWarnings, canPublish, postsStatus: posts.status, refreshPosts, changeCount, blockers, publishing, publishError, conflict, selected, select,
        ensureLoaded, reload, update, create, remove, revert, rewriteTags, publish,
    };
    return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent(): ContentContextValue {
    const ctx = useContext(ContentContext);
    if (!ctx) throw new Error('useContent must be used inside ContentProvider');
    return ctx;
}
