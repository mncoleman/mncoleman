'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { authHeaders } from '@/lib/admin-auth';
import { emptyPost, isValidSlug, samePost, type PostDoc } from '@/lib/post-format';
import { useDeploy } from '@/components/admin/deploy-status';

/**
 * The editor's sync engine. Three layers, each there so a failure of the next
 * one loses nothing:
 *
 *   1. React state     every keystroke lands here first; the UI never waits.
 *   2. localStorage    a mirror of the unsent draft, written within ~250ms of an
 *                      edit and on tab hide/close. Survives a dead network, a
 *                      closed tab, a crashed browser.
 *   3. Worker KV       debounced autosave (~800ms). NEVER a git commit.
 *
 * Only `publish` commits. A failed save retries with backoff and never blocks
 * typing. A version mismatch (another tab or device wrote the draft) stops
 * autosave and asks which copy to keep instead of overwriting either.
 */

export type SyncStatus = 'loading' | 'idle' | 'saving' | 'saved' | 'local' | 'offline' | 'conflict' | 'unavailable' | 'error';

export type Conflict =
    | { kind: 'draft'; theirs: PostDoc | null; theirsVersion: number }
    | { kind: 'stale' };

export interface LiveState {
    /** Git blob sha of data/posts/<slug>.md, or null if never committed. */
    sha: string | null;
    published: boolean;
}

interface Mirror {
    doc: PostDoc;
    /** Server draft version this edit was based on. */
    baseVersion: number;
    /** Slug the server draft is stored under (null: none yet). */
    serverSlug: string | null;
    savedAt: number;
}

const SAVE_DEBOUNCE_MS = 800;
const MIRROR_DEBOUNCE_MS = 250;
const MAX_BACKOFF_MS = 30_000;
export const NEW_KEY = '__new__';
const mirrorKey = (id: string) => `mnc-post-draft:${id}`;

function readMirror(id: string): Mirror | null {
    try {
        const raw = localStorage.getItem(mirrorKey(id));
        if (!raw) return null;
        const m = JSON.parse(raw) as Mirror;
        if (!m || typeof m !== 'object' || !m.doc || typeof m.doc.content !== 'string') return null;
        const d = m.doc;
        const str = (v: unknown, f = '') => (typeof v === 'string' ? v : f);
        const doc: PostDoc = {
            ...emptyPost(), ...d,
            title: str(d.title), slug: str(d.slug), date: str(d.date, emptyPost().date), excerpt: str(d.excerpt), author: str(d.author, 'Matthew Coleman'),
            tags: Array.isArray(d.tags) ? d.tags.filter((t): t is string => typeof t === 'string') : [],
            published: d.published === true, featured: d.featured === true,
        };
        return { ...m, doc, baseVersion: Number.isInteger(m.baseVersion) ? m.baseVersion : 0, serverSlug: typeof m.serverSlug === 'string' ? m.serverSlug : null };
    } catch {
        return null;
    }
}
function writeMirror(id: string, m: Mirror) {
    try { localStorage.setItem(mirrorKey(id), JSON.stringify(m)); } catch { /* private mode / quota: the server copy still exists */ }
}
function clearMirror(id: string) {
    try { localStorage.removeItem(mirrorKey(id)); } catch { /* ignore */ }
}

class NetworkError extends Error {}

async function api(workerUrl: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; json: any }> {
    let res: Response;
    try {
        res = await fetch(`${workerUrl}${path}`, {
            method: init.method || 'GET',
            headers: authHeaders(init.body !== undefined ? { 'Content-Type': 'application/json' } : undefined),
            credentials: 'include',
            body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        });
    } catch {
        throw new NetworkError('Network unreachable');
    }
    let json: any = null;
    try { json = await res.json(); } catch { /* empty or non-JSON body */ }
    return { status: res.status, json };
}

const sameDoc = samePost;

export function usePostSync(workerUrl: string, initialSlug: string) {
    const id = initialSlug || NEW_KEY;
    const { start: startDeploy } = useDeploy();

    const [doc, setDocState] = useState<PostDoc>(() => emptyPost());
    const [status, setStatusState] = useState<SyncStatus>('loading');
    const [detail, setDetail] = useState('');
    const [loadError, setLoadError] = useState('');
    const [live, setLive] = useState<LiveState>({ sha: null, published: false });
    const [restored, setRestored] = useState<{ savedAt: number } | null>(null);
    const [conflict, setConflict] = useState<Conflict | null>(null);
    /** A slug the server refused because another post or draft already has it. */
    const [slugTaken, setSlugTaken] = useState<string | null>(null);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [busy, setBusy] = useState<'' | 'publishing' | 'unpublishing' | 'deleting' | 'resolving'>('');
    /** Bumped whenever the body is replaced from outside, so the uncontrolled editor remounts. */
    const [bodyKey, setBodyKey] = useState(0);

    const docRef = useRef(doc);
    const liveRef = useRef(live);
    const rev = useRef(0);
    const savedRev = useRef(0);
    const versionRef = useRef(0);
    const serverSlugRef = useRef<string | null>(null);
    const stopped = useRef(false);
    const forceNext = useRef(false);
    const blockFlush = useRef(false);
    const lastPutAt = useRef(0);
    /** While a load-time conflict is unresolved the mirror must keep the base it was really made from. */
    const pinnedBase = useRef<{ baseVersion: number; serverSlug: string | null } | null>(null);
    const inflight = useRef<Promise<void> | null>(null);
    const again = useRef(false);
    const backoff = useRef(2000);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const mirrorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const mounted = useRef(true);
    const loaded = useRef(false);

    const setStatus = useCallback((s: SyncStatus, d = '') => {
        if (!mounted.current) return;
        setStatusState(s);
        setDetail(d);
    }, []);
    const setDoc = useCallback((d: PostDoc) => {
        docRef.current = d;
        setDocState(d);
    }, []);
    const setLiveBoth = useCallback((l: LiveState) => {
        liveRef.current = l;
        setLive(l);
    }, []);

    const dirty = () => rev.current !== savedRev.current;

    const persistMirror = useCallback(() => {
        if (!dirty()) return;
        writeMirror(id, {
            doc: docRef.current,
            baseVersion: pinnedBase.current?.baseVersion ?? versionRef.current,
            serverSlug: pinnedBase.current ? pinnedBase.current.serverSlug : serverSlugRef.current,
            savedAt: Date.now(),
        });
    }, [id]);

    const scheduleMirror = useCallback(() => {
        clearTimeout(mirrorTimer.current);
        mirrorTimer.current = setTimeout(persistMirror, MIRROR_DEBOUNCE_MS);
    }, [persistMirror]);

    /* ------------------------------ autosave ------------------------------ */

    const flush = useCallback(async (): Promise<void> => {
        if (stopped.current || !loaded.current || blockFlush.current) return;
        if (inflight.current) { again.current = true; return; }
        if (!dirty()) return;
        // Workers KV allows about one write per second per key: never PUT faster than that.
        const wait = lastPutAt.current + 1100 - Date.now();
        if (wait > 0) { scheduleSave(wait); return; }
        const snap = docRef.current;
        const snapRev = rev.current;
        if (!isValidSlug(snap.slug)) {
            // Nothing to key a server draft by yet (no title). The local mirror still holds it.
            setStatus('local', 'Saved on this device. Add a title to save it to the server.');
            return;
        }
        const run = (async () => {
            setStatus('saving');
            lastPutAt.current = Date.now();
            const baseVersion = serverSlugRef.current === snap.slug ? versionRef.current : 0;
            let res;
            try {
                res = await api(workerUrl, `/api/posts/${snap.slug}/draft`, {
                    method: 'PUT',
                    body: {
                        post: snap, baseVersion, baseSha: liveRef.current.sha,
                        // First save of a new post under this slug: the Worker refuses a slug somebody else owns.
                        ...(serverSlugRef.current !== snap.slug && !liveRef.current.sha ? { isNew: true } : {}),
                        ...(forceNext.current ? { force: true } : {}),
                    },
                });
            } catch {
                retryLater('Offline, will retry');
                return;
            }
            const { status: code, json } = res;
            const onSaved = (version: number) => {
                const previous = serverSlugRef.current;
                versionRef.current = version;
                serverSlugRef.current = snap.slug;
                savedRev.current = snapRev;
                forceNext.current = false;
                backoff.current = 2000;
                if (previous && previous !== snap.slug) {
                    // The post was re-slugged before its first publish: drop the orphaned draft.
                    void api(workerUrl, `/api/posts/${previous}/draft`, { method: 'DELETE' }).catch(() => undefined);
                }
                if (rev.current !== snapRev) {
                    setStatus('saving');
                    scheduleSave(SAVE_DEBOUNCE_MS);
                } else {
                    clearMirror(id);
                    setSavedAt(Date.now());
                    setStatus('saved');
                }
            };
            if (code === 200 && json?.ok) {
                onSaved(json.version);
                return;
            }
            if (code === 409 && json?.error === 'slug_taken') {
                // Not a transient failure and not a draft clash: this slug belongs to a different post.
                setSlugTaken(snap.slug);
                setStatus('error', json.message || 'That slug is already used by another post.');
                return;
            }
            if (code === 409 && json?.error === 'conflict') {
                const theirs = json.draft as { post: PostDoc; version: number } | null;
                // Our own earlier PUT landed but its response was lost: the "other" copy is us.
                if (theirs && sameDoc(theirs.post, snap)) { onSaved(theirs.version); return; }
                stopped.current = true;
                setConflict({ kind: 'draft', theirs: theirs?.post ?? null, theirsVersion: theirs?.version ?? 0 });
                setStatus('conflict', 'This draft was changed somewhere else.');
                return;
            }
            if (code === 503 && json?.error === 'drafts_unavailable') {
                // Config problem, not a blip: retrying on a timer would never help. Next edit tries again.
                setStatus('unavailable', json.message || 'Draft storage is not set up.');
                return;
            }
            if (code === 401 || code === 403) {
                setStatus('error', 'Signed out or not allowed. Your changes are kept on this device; sign in again.');
                return;
            }
            if (code >= 500 || code === 429) {
                retryLater('Offline, will retry');
                return;
            }
            setStatus('error', json?.error || `Save failed (${code})`);
        })();
        inflight.current = run;
        await run;
        inflight.current = null;
        if (again.current) {
            again.current = false;
            if (dirty()) scheduleSave(SAVE_DEBOUNCE_MS);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workerUrl, id, setStatus]);

    const retryLater = useCallback((message: string) => {
        setStatus('offline', message);
        clearTimeout(saveTimer.current);
        const wait = backoff.current;
        backoff.current = Math.min(backoff.current * 2, MAX_BACKOFF_MS);
        saveTimer.current = setTimeout(() => void flush(), wait);
    }, [flush, setStatus]);

    const scheduleSave = useCallback((delay = SAVE_DEBOUNCE_MS) => {
        clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => { saveTimer.current = undefined; void flush(); }, delay);
    }, [flush]);

    /** Any edit: UI first, then mirror, then (debounced) server. */
    const update = useCallback((patch: Partial<PostDoc>) => {
        setDoc({ ...docRef.current, ...patch });
        rev.current += 1;
        if (patch.slug !== undefined) setSlugTaken(null);
        scheduleMirror();
        if (stopped.current) return;
        backoff.current = 2000;
        setStatus('saving');
        scheduleSave();
    }, [scheduleMirror, scheduleSave, setDoc, setStatus]);

    /** Save now (Cmd+S): skip the debounce. */
    const saveNow = useCallback(() => {
        persistMirror();
        clearTimeout(saveTimer.current);
        saveTimer.current = undefined;
        void flush();
    }, [flush, persistMirror]);

    /* ------------------------------- loading ------------------------------- */

    /** Replace everything with what the server has. `preferCommitted` ignores the draft. */
    const applyServer = useCallback((json: any, preferCommitted = false) => {
        const draft = preferCommitted ? null : (json.draft as { post: PostDoc; version: number } | null);
        const base: PostDoc | null = draft?.post ?? json.post ?? null;
        setLiveBoth({ sha: json.sha ?? null, published: !!json.post?.published });
        if (base) setDoc(base);
        versionRef.current = draft?.version ?? 0;
        serverSlugRef.current = draft ? base!.slug : null;
        savedRev.current = rev.current;
        stopped.current = false;
        forceNext.current = false;
        clearMirror(id);
        setBodyKey((k) => k + 1);
    }, [id, setDoc, setLiveBoth]);

    const load = useCallback(async () => {
        setLoadError('');
        setStatus('loading');
        const mirror = readMirror(id);

        const restoreFromMirror = (m: Mirror, why: 'offline' | 'ahead') => {
            setDoc(m.doc);
            versionRef.current = m.baseVersion;
            serverSlugRef.current = m.serverSlug;
            rev.current += 1; // dirty relative to savedRev
            setRestored({ savedAt: m.savedAt });
            setBodyKey((k) => k + 1);
            loaded.current = true;
            if (why === 'offline') retryLater('Offline, will retry');
            else { setStatus('saving'); scheduleSave(300); }
        };

        if (!initialSlug) {
            loaded.current = true;
            if (mirror) restoreFromMirror(mirror, 'ahead');
            else { setDoc(emptyPost()); setStatus('idle'); }
            return;
        }

        let res;
        try {
            res = await api(workerUrl, `/api/posts/${initialSlug}`);
        } catch {
            if (mirror) restoreFromMirror(mirror, 'offline');
            else setLoadError('Could not reach the server. Check your connection and retry.');
            return;
        }
        if (res.status !== 200) {
            if (mirror) { restoreFromMirror(mirror, 'offline'); return; }
            setLoadError(res.json?.message || res.json?.error || `Could not load this post (${res.status}).`);
            return;
        }
        const json = res.json;
        const draft = json.draft as { post: PostDoc; version: number } | null;
        const base: PostDoc | null = draft?.post ?? json.post ?? null;
        if (!base && !mirror) { setLoadError('This post does not exist.'); return; }
        setLiveBoth({ sha: json.sha ?? null, published: !!json.post?.published });
        loaded.current = true;

        if (!base && mirror) { restoreFromMirror(mirror, 'ahead'); return; }
        if (mirror && !sameDoc(mirror.doc, base!)) {
            const serverVersion = draft?.version ?? 0;
            if (mirror.baseVersion === serverVersion) {
                versionRef.current = serverVersion;
                serverSlugRef.current = draft ? base!.slug : null;
                restoreFromMirror({ ...mirror, baseVersion: serverVersion, serverSlug: serverSlugRef.current }, 'ahead');
            } else {
                // The server draft moved on while this browser held unsent edits: never pick silently.
                pinnedBase.current = { baseVersion: mirror.baseVersion, serverSlug: mirror.serverSlug };
                setDoc(mirror.doc);
                versionRef.current = serverVersion;
                serverSlugRef.current = draft ? base!.slug : null;
                rev.current += 1;
                stopped.current = true;
                setBodyKey((k) => k + 1);
                setConflict({ kind: 'draft', theirs: base, theirsVersion: serverVersion });
                setStatus('conflict', 'Unsent edits on this device differ from the saved draft.');
            }
        } else {
            if (mirror) clearMirror(id);
            setDoc(base!);
            versionRef.current = draft?.version ?? 0;
            serverSlugRef.current = draft ? base!.slug : null;
            setStatus(json.draftsAvailable === false ? 'unavailable' : 'idle',
                json.draftsAvailable === false ? 'Draft storage is not set up on the Worker; edits are kept on this device only.' : '');
            // The file was committed from outside the editor after this draft was saved: publishing would overwrite that commit.
            const draftBaseSha = (draft as { baseSha?: string | null } | null)?.baseSha;
            if (draft && draftBaseSha !== undefined && (draftBaseSha ?? null) !== (json.sha ?? null)) {
                stopped.current = true;
                setConflict({ kind: 'stale' });
                setStatus('conflict', 'The file was committed outside the editor after this draft was saved.');
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workerUrl, id, initialSlug]);

    useEffect(() => {
        mounted.current = true;
        void load();
        const flushMirror = () => persistMirror();
        const onVisibility = () => { if (document.visibilityState === 'hidden') flushMirror(); };
        const onOnline = () => { if (dirty() && !stopped.current) { backoff.current = 2000; void flush(); } };
        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            flushMirror();
            if (dirty() && !stopped.current) { e.preventDefault(); e.returnValue = ''; }
        };
        window.addEventListener('pagehide', flushMirror);
        window.addEventListener('beforeunload', onBeforeUnload);
        window.addEventListener('online', onOnline);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('pagehide', flushMirror);
            window.removeEventListener('beforeunload', onBeforeUnload);
            window.removeEventListener('online', onOnline);
            document.removeEventListener('visibilitychange', onVisibility);
            // Leaving the page: keep the local copy, and let one last save run in the background.
            flushMirror();
            clearTimeout(mirrorTimer.current);
            clearTimeout(saveTimer.current);
            mounted.current = false;
            if (dirty() && !stopped.current) void flush();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]);

    /* ------------------------ conflict resolution ------------------------ */

    const resolveKeepMine = useCallback(async () => {
        const c = conflict;
        if (!c) return;
        setBusy('resolving');
        try {
            if (c.kind === 'draft') {
                pinnedBase.current = null;
                versionRef.current = c.theirsVersion;
                serverSlugRef.current = docRef.current.slug;
                forceNext.current = true;
                stopped.current = false;
                setConflict(null);
                rev.current += 1;
                setStatus('saving');
                await flush();
            } else {
                // The committed file moved. Take its current sha and let the next Publish use it.
                const res = await api(workerUrl, `/api/posts/${docRef.current.slug}`);
                if (res.status === 200) {
                    setLiveBoth({ sha: res.json.sha ?? null, published: !!res.json.post?.published });
                    stopped.current = false;
                    setConflict(null);
                    if (serverSlugRef.current) rev.current += 1; // re-save the draft against the new sha
                    if (dirty()) { setStatus('saving'); scheduleSave(); }
                    else setStatus('idle', 'Updated to the latest published version. Publish again to overwrite it with yours.');
                } else {
                    setStatus('error', 'Could not fetch the latest version. Try again.');
                }
            }
        } catch {
            setStatus('offline', 'Offline, will retry');
        } finally {
            setBusy('');
        }
    }, [conflict, flush, setLiveBoth, setStatus, workerUrl]);

    const resolveLoadTheirs = useCallback(async () => {
        const c = conflict;
        if (!c) return;
        setBusy('resolving');
        try {
            const res = await api(workerUrl, `/api/posts/${docRef.current.slug || initialSlug}`);
            if (res.status !== 200) { setStatus('error', 'Could not fetch their version. Try again.'); return; }
            const hasBase = c.kind === 'stale' ? !!res.json.post : !!(res.json.draft || res.json.post);
            if (!hasBase) { setStatus('conflict', 'There is no saved version to load. Use Keep mine.'); return; }
            pinnedBase.current = null;
            // For a refused publish the committed file is "theirs"; for a draft clash it is the server draft.
            applyServer(res.json, c.kind === 'stale');
            if (c.kind === 'stale' && serverSlugRef.current === null) {
                void api(workerUrl, `/api/posts/${docRef.current.slug}/draft`, { method: 'DELETE' }).catch(() => undefined);
            }
            setConflict(null);
            setRestored(null);
            setStatus('idle');
        } catch {
            setStatus('offline', 'Offline, will retry');
        } finally {
            setBusy('');
        }
    }, [applyServer, conflict, initialSlug, setStatus, workerUrl]);

    /** "Discard" on the restored notice: drop local edits and take what the server has. */
    const discardRestored = useCallback(async () => {
        if (!initialSlug) { setDoc(emptyPost()); clearMirror(id); savedRev.current = rev.current; setRestored(null); setBodyKey((k) => k + 1); setStatus('idle'); return; }
        try {
            const res = await api(workerUrl, `/api/posts/${initialSlug}`);
            if (res.status === 200) { applyServer(res.json); setRestored(null); setStatus('idle'); }
        } catch { setStatus('offline', 'Offline, will retry'); }
    }, [applyServer, id, initialSlug, setDoc, setStatus, workerUrl]);

    /* ----------------------------- git operations ---------------------------- */

    const settle = async () => {
        clearTimeout(saveTimer.current);
        saveTimer.current = undefined;
        again.current = false;
        blockFlush.current = true; // released by the caller's finally
        if (inflight.current) await inflight.current;
        // A failed in-flight save re-arms its retry timer on the way out; cancel that too.
        clearTimeout(saveTimer.current);
        saveTimer.current = undefined;
    };

    const publish = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
        setBusy('publishing');
        await settle();
        const post = { ...docRef.current, published: true };
        const pubRev = rev.current;
        try {
            const res = await api(workerUrl, `/api/posts/${post.slug}/publish`, { method: 'POST', body: { post, sha: liveRef.current.sha, draftVersion: serverSlugRef.current === post.slug ? versionRef.current : 0 } });
            if (res.status === 200 && res.json?.ok) {
                const previous = serverSlugRef.current;
                const kept = res.json.draftKept ? (res.json.draft as { post: PostDoc; version: number }) : null;
                // Keep anything typed while the request was in flight.
                setDoc({ ...docRef.current, published: true });
                setLiveBoth({ sha: res.json.sha, published: true });
                // The Worker deleted this slug's draft; start fresh from here.
                versionRef.current = 0;
                serverSlugRef.current = null;
                savedRev.current = pubRev;
                if (rev.current === pubRev) { clearMirror(id); setStatus('saved'); } else setStatus('saving');
                setRestored(null);
                setSavedAt(Date.now());
                if (previous && previous !== post.slug) void api(workerUrl, `/api/posts/${previous}/draft`, { method: 'DELETE' }).catch(() => undefined);
                if (res.json.commit) startDeploy('publish', { commit: res.json.commit, keys: [post.slug] });
                if (kept) {
                    // A newer draft (another tab or device) was saved after this publish was prepared: the Worker kept it.
                    stopped.current = true;
                    versionRef.current = kept.version;
                    serverSlugRef.current = post.slug;
                    setConflict({ kind: 'draft', theirs: kept.post, theirsVersion: kept.version });
                    setStatus('conflict', 'Published. A newer draft from another session was kept; choose which to continue with.');
                }
                return { ok: true };
            }
            if (res.status === 409 && res.json?.error === 'slug_taken') {
                setSlugTaken(post.slug);
                return { ok: false, error: res.json.message || 'That slug is already used by another post.' };
            }
            if (res.status === 409) {
                stopped.current = true;
                setConflict({ kind: 'stale' });
                setStatus('conflict', 'The published file changed since you opened it.');
                return { ok: false, error: res.json?.message || 'The published file changed since you opened it.' };
            }
            return { ok: false, error: res.json?.error || `Publish failed (${res.status})` };
        } catch {
            return { ok: false, error: 'Network unreachable. Your edits are safe; try Publish again when you are online.' };
        } finally {
            blockFlush.current = false;
            setBusy('');
            if (dirty() && !stopped.current) scheduleSave();
        }
    }, [workerUrl, id, setDoc, setLiveBoth, setStatus, startDeploy, scheduleSave]);

    const unpublish = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
        const sha = liveRef.current.sha;
        if (!sha) return { ok: false, error: 'This post has not been committed.' };
        setBusy('unpublishing');
        try {
            const res = await api(workerUrl, `/api/posts/${docRef.current.slug}/unpublish`, { method: 'POST', body: { sha } });
            if (res.status === 200 && res.json?.ok) {
                setLiveBoth({ sha: res.json.sha, published: false });
                setDoc({ ...docRef.current, published: false });
                // A server draft remembers the sha it was based on; re-save it so it does not look stale.
                if (serverSlugRef.current && !stopped.current) { rev.current += 1; scheduleSave(); }
                if (res.json.commit) startDeploy('publish', { commit: res.json.commit, keys: [docRef.current.slug] });
                return { ok: true };
            }
            if (res.status === 409) {
                stopped.current = true;
                setConflict({ kind: 'stale' });
                setStatus('conflict', 'The published file changed since you opened it.');
            }
            return { ok: false, error: res.json?.message || res.json?.error || `Unpublish failed (${res.status})` };
        } catch {
            return { ok: false, error: 'Network unreachable.' };
        } finally {
            setBusy('');
        }
    }, [workerUrl, setDoc, setLiveBoth, setStatus, startDeploy]);

    const remove = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
        const slug = docRef.current.slug;
        setBusy('deleting');
        await settle();
        try {
            const sha = liveRef.current.sha;
            const draftSlug = serverSlugRef.current || slug;
            if (!sha && !isValidSlug(draftSlug)) {
                // Never reached the server: only the local copy exists.
                stopped.current = true;
                clearMirror(id);
                savedRev.current = rev.current;
                return { ok: true };
            }
            const res = sha
                ? await api(workerUrl, `/api/posts/${slug}?confirm=${encodeURIComponent(slug)}&sha=${encodeURIComponent(sha)}`, { method: 'DELETE' })
                : await api(workerUrl, `/api/posts/${draftSlug}/draft`, { method: 'DELETE' });
            const noStore = !sha && res.status === 503 && res.json?.error === 'drafts_unavailable';
            if ((res.status === 200 && res.json?.ok) || noStore) {
                stopped.current = true; // nothing left to autosave
                clearMirror(id);
                savedRev.current = rev.current;
                if (sha && res.json.commit) startDeploy('publish', { commit: res.json.commit, keys: [slug] });
                return { ok: true };
            }
            return { ok: false, error: res.json?.message || res.json?.error || `Delete failed (${res.status})` };
        } catch {
            return { ok: false, error: 'Network unreachable.' };
        } finally {
            blockFlush.current = false;
            setBusy('');
            if (dirty() && !stopped.current) scheduleSave();
        }
    }, [workerUrl, id, startDeploy]);

    return {
        doc, update, status, detail, loadError, slugTaken, ownsSlug: (slug: string) => serverSlugRef.current === slug, retryLoad: load, live, restored, dismissRestored: () => setRestored(null),
        discardRestored, conflict, resolveKeepMine, resolveLoadTheirs, savedAt, busy, bodyKey, saveNow, publish, unpublish, remove,
    };
}
