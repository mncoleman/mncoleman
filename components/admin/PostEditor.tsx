'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Check, CloudOff, ExternalLink, Loader2, RotateCcw, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { authHeaders } from '@/lib/admin-auth';
import { cn } from '@/lib/utils';
import { isValidSlug, nextSlug, samePost, slugFromTitle } from '@/lib/post-format';
import { MarkdownEditor } from '@/components/admin/MarkdownEditor';
import { TagPicker } from '@/components/admin/TagPicker';
import { usePostSync, type SyncStatus } from '@/components/admin/PostSync';
import { POST_TAGS_CACHE_KEY } from '@/components/admin/PostsManager';

function readAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.readAsDataURL(file);
    });
}

function cachedTags(): string[] {
    try {
        const raw = sessionStorage.getItem(POST_TAGS_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
    } catch {
        return [];
    }
}

function ago(ms: number) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
}

/** The pill in the top bar: always says where the latest keystroke is. */
function StatusPill({ status, detail }: { status: SyncStatus; detail: string }) {
    const map: Record<SyncStatus, { label: string; cls: string; icon: React.ReactNode }> = {
        loading: { label: 'Loading…', cls: 'text-muted-foreground', icon: <Loader2 size={12} className="animate-spin" /> },
        idle: { label: 'Up to date', cls: 'text-muted-foreground', icon: <Check size={12} /> },
        saving: { label: 'Saving…', cls: 'text-sky-600 dark:text-sky-400', icon: <Loader2 size={12} className="animate-spin" /> },
        saved: { label: 'Saved', cls: 'text-emerald-600 dark:text-emerald-400', icon: <Check size={12} /> },
        local: { label: 'Saved on this device', cls: 'text-muted-foreground', icon: <Check size={12} /> },
        offline: { label: 'Offline, will retry', cls: 'text-amber-700 dark:text-amber-400', icon: <CloudOff size={12} /> },
        conflict: { label: 'Conflict', cls: 'text-red-600 dark:text-red-400', icon: <AlertTriangle size={12} /> },
        unavailable: { label: 'Drafts not set up', cls: 'text-amber-700 dark:text-amber-400', icon: <AlertTriangle size={12} /> },
        error: { label: 'Not saved', cls: 'text-red-600 dark:text-red-400', icon: <AlertTriangle size={12} /> },
    };
    const s = map[status];
    return (
        <span role="status" aria-live="polite" title={detail || s.label} className={cn('inline-flex items-center gap-1.5 rounded-full border border-border/60 px-2.5 py-1 text-xs', s.cls)}>
            {s.icon} {s.label}
        </span>
    );
}

export function PostEditor({ workerUrl, slug: initialSlug }: { workerUrl: string; slug: string }) {
    const router = useRouter();
    const sync = usePostSync(workerUrl, initialSlug);
    const { doc, update, status, detail, live, busy } = sync;
    const [dialog, setDialog] = useState<'publish' | 'unpublish' | 'delete' | null>(null);
    const [actionError, setActionError] = useState('');
    // The slug follows the title until it has been committed or edited by hand.
    const [slugTouched, setSlugTouched] = useState(!!initialSlug);
    const [tagOptions] = useState<string[]>(() => cachedTags());

    // New posts only: is this slug already a file or somebody's draft? Checked live, 400ms after the last keystroke.
    const [slugCheck, setSlugCheck] = useState<{ slug: string; taken: boolean } | null>(null);
    const docForCheck = useRef(doc);
    useEffect(() => { docForCheck.current = doc; });
    const { ownsSlug } = sync;
    useEffect(() => {
        const slug = doc.slug;
        if (live.sha || !isValidSlug(slug) || status === 'loading' || ownsSlug(slug)) return;
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`${workerUrl}/api/posts/${slug}`, { headers: authHeaders(), credentials: 'include' });
                if (!res.ok || cancelled) return;
                const json = await res.json();
                // The same text already saved under this slug is this post's own earlier save, not a clash.
                const own = json.draft && !json.post && samePost(json.draft.post, docForCheck.current);
                if (!cancelled) setSlugCheck({ slug, taken: !!(json.post || json.draft) && !own });
            } catch { /* offline: the Worker re-checks on save */ }
        }, 400);
        return () => { cancelled = true; clearTimeout(t); };
    }, [doc.slug, live.sha, status, workerUrl, ownsSlug]);
    const slugIsTaken = !live.sha && ((slugCheck?.slug === doc.slug && slugCheck.taken) || sync.slugTaken === doc.slug);
    const slugLocked = !!live.sha;
    const slugOk = isValidSlug(doc.slug);
    const canPublish = !!doc.title.trim() && slugOk && !!doc.date && !slugIsTaken;
    const blocked = status === 'loading' || status === 'conflict' || !!busy;

    const uploadImage = useCallback(async (file: File): Promise<string> => {
        const res = await fetch(`${workerUrl}/api/collections/images`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            credentials: 'include',
            body: JSON.stringify({ filename: file.name, type: file.type, content: await readAsBase64(file) }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `Upload failed (${res.status})`);
        return json.path as string;
    }, [workerUrl]);

    // Cmd/Ctrl+S saves the draft now (never commits).
    const { saveNow } = sync;
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [saveNow]);

    const onTitle = (title: string) => {
        update(slugTouched || slugLocked ? { title } : { title, slug: slugFromTitle(title) });
    };

    const run = async (kind: 'publish' | 'unpublish' | 'delete') => {
        setActionError('');
        const result = kind === 'publish' ? await sync.publish() : kind === 'unpublish' ? await sync.unpublish() : await sync.remove();
        if (!result.ok) { setActionError(result.error || 'Something went wrong.'); return; }
        setDialog(null);
        if (kind === 'delete') router.push('/admin/posts');
    };

    const dateValue = useMemo(() => doc.date.slice(0, 10), [doc.date]);

    if (sync.loadError) {
        return (
            <div className="flex flex-col items-center gap-3 py-24 text-sm text-muted-foreground">
                <p className="text-red-600">{sync.loadError}</p>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void sync.retryLoad()} className="gap-1.5"><RotateCcw size={13} /> Try again</Button>
                    <Button size="sm" variant="ghost" asChild><Link href="/admin/posts">Back to posts</Link></Button>
                </div>
            </div>
        );
    }

    const verb = live.published ? 'Publish changes' : 'Publish';
    const hideInstead = live.published && !doc.published;

    return (
        <div className="mx-auto max-w-3xl">
            {/* Top bar */}
            <div className="sticky top-0 z-20 -mx-4 mb-6 flex flex-wrap items-center gap-2 border-b border-border/60 bg-background/90 px-4 py-2.5 backdrop-blur md:-mx-8 md:px-8">
                <Link href="/admin/posts" className="mr-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ArrowLeft size={13} /> Posts
                </Link>
                <StatusPill status={status} detail={detail} />
                {status === 'saved' && sync.savedAt && <span className="hidden text-[11px] text-muted-foreground sm:inline">{ago(sync.savedAt)}</span>}
                <div className="ml-auto flex items-center gap-2">
                    {live.published && (
                        <a href={`/blog/${doc.slug}/`} target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:flex">
                            <ExternalLink size={12} /> View
                        </a>
                    )}
                    {(live.sha || sync.status !== 'loading') && (
                        <button type="button" onClick={() => setDialog('delete')} disabled={blocked && status !== 'conflict'} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-red-600 disabled:opacity-40" title="Delete post" aria-label="Delete post">
                            <Trash2 size={14} />
                        </button>
                    )}
                    <Button
                        size="sm"
                        onClick={() => { setActionError(''); setDialog(hideInstead ? 'unpublish' : 'publish'); }}
                        disabled={blocked || (!hideInstead && !canPublish)}
                        title={!canPublish && !hideInstead ? (slugIsTaken ? 'That slug is already used' : 'Add a title (and a valid slug) first') : undefined}
                        className="gap-1.5"
                    >
                        {busy === 'publishing' || busy === 'unpublishing' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {hideInstead ? 'Unpublish' : verb}
                    </Button>
                </div>
            </div>

            {sync.restored && (
                <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-900 dark:text-sky-200" role="status">
                    <span className="min-w-0 flex-1">Restored unsaved changes from this browser ({ago(sync.restored.savedAt)}).</span>
                    <button type="button" className="text-xs underline underline-offset-4" onClick={() => void sync.discardRestored()}>Discard them</button>
                    <button type="button" className="text-xs underline underline-offset-4" onClick={sync.dismissRestored}>Dismiss</button>
                </div>
            )}

            {sync.conflict && (
                <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm" role="alert">
                    <div className="font-medium text-red-700 dark:text-red-300">
                        {sync.conflict.kind === 'stale' ? 'The published version changed' : 'This draft changed somewhere else'}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {sync.conflict.kind === 'stale'
                            ? 'Someone (or another tab) committed this post after you opened it. Nothing has been overwritten.'
                            : sync.conflict.theirs
                                ? `The saved copy has a different title or body than what is on screen. Nothing has been overwritten. Theirs: “${sync.conflict.theirs.title || 'Untitled'}”.`
                                : 'The saved draft is gone (it was published or deleted elsewhere). Nothing has been overwritten.'}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" disabled={busy === 'resolving'} onClick={() => void sync.resolveKeepMine()}>
                            Keep mine{sync.conflict.kind === 'stale' ? ' (fetch latest, then publish again)' : ' (overwrite the saved draft)'}
                        </Button>
                        <Button size="sm" variant="outline" disabled={busy === 'resolving'} onClick={() => void sync.resolveLoadTheirs()}>
                            Load theirs (discard what is on screen)
                        </Button>
                    </div>
                </div>
            )}

            {(status === 'unavailable' || status === 'error') && detail && (
                <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200" role="status">
                    {detail} Your edits are still kept in this browser.
                </div>
            )}

            {/* Title */}
            <input
                autoFocus={!doc.title}
                value={doc.title}
                onChange={(e) => onTitle(e.target.value)}
                placeholder="Untitled post"
                aria-label="Title"
                className="w-full bg-transparent text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/40 md:text-4xl"
            />

            {/* Metadata row */}
            <div className="mt-4 grid gap-4 rounded-lg border border-border/60 p-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="post-slug" className="text-xs text-muted-foreground">Slug</Label>
                    <input
                        id="post-slug"
                        value={doc.slug}
                        readOnly={slugLocked}
                        onChange={(e) => { setSlugTouched(true); update({ slug: slugFromTitle(e.target.value) }); }}
                        placeholder="auto-from-title"
                        className={cn('h-8 w-full rounded-md border border-border/60 bg-transparent px-2.5 text-sm outline-none focus:border-foreground/40', slugLocked && 'text-muted-foreground')}
                    />
                    <div className="truncate text-[11px] text-muted-foreground">
                        /blog/{doc.slug || '…'}/{slugLocked && ' · fixed once committed'}
                    </div>
                    {slugIsTaken && (
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-red-600" role="alert">
                            <span>Another post or draft already uses this slug.</span>
                            <button type="button" className="underline underline-offset-4" onClick={() => { setSlugTouched(true); update({ slug: nextSlug(doc.slug) }); }}>
                                Use {nextSlug(doc.slug)}
                            </button>
                        </div>
                    )}
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="post-date" className="text-xs text-muted-foreground">Date</Label>
                    <input
                        id="post-date"
                        type="date"
                        value={dateValue}
                        onChange={(e) => update({ date: e.target.value })}
                        className="h-8 w-full rounded-md border border-border/60 bg-transparent px-2.5 text-sm outline-none focus:border-foreground/40"
                    />
                </div>
                <div className="sm:col-span-2">
                    <TagPicker
                        label="Tags"
                        singular="tag"
                        value={doc.tags}
                        options={[...new Set([...tagOptions, ...doc.tags])].sort()}
                        onChange={(tags) => update({ tags })}
                    />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="post-excerpt" className="text-xs text-muted-foreground">Excerpt</Label>
                    <textarea
                        id="post-excerpt"
                        value={doc.excerpt}
                        onChange={(e) => update({ excerpt: e.target.value })}
                        rows={2}
                        placeholder="One or two lines for the blog list and the share card…"
                        className="w-full resize-none rounded-md border border-border/60 bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-foreground/40"
                    />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="post-author" className="text-xs text-muted-foreground">Author</Label>
                    <input
                        id="post-author"
                        value={doc.author}
                        onChange={(e) => update({ author: e.target.value })}
                        className="h-8 w-full rounded-md border border-border/60 bg-transparent px-2.5 text-sm outline-none focus:border-foreground/40"
                    />
                </div>
                <div className="flex items-end gap-6">
                    <label className="flex items-center gap-2 text-sm">
                        <Switch checked={doc.featured} onCheckedChange={(featured) => update({ featured })} aria-label="Featured" /> Featured
                    </label>
                    <label className="flex items-center gap-2 text-sm" title="Takes effect when you publish">
                        <Switch checked={doc.published} onCheckedChange={(published) => update({ published })} aria-label="Published" /> Published
                    </label>
                </div>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
                {live.published ? 'Live on the site.' : live.sha ? 'Committed, hidden from the site.' : 'Not committed yet.'}
                {' '}Edits autosave as a draft; only <strong>Publish</strong> commits to the site and rebuilds it.
            </p>

            {/* Body. The editor is uncontrolled after mount, so a replaced body remounts it via the key. */}
            <div className="mt-6">
                {status !== 'loading' && (
                    <MarkdownEditor
                        key={sync.bodyKey}
                        value={doc.content}
                        onChange={(content) => update({ content })}
                        onUpload={uploadImage}
                        placeholder="Write your post. Drop or paste an image to upload it."
                    />
                )}
                <p className="mt-2 text-xs text-muted-foreground">Each image uploads as its own commit.</p>
            </div>

            {/* Confirms */}
            <Dialog open={dialog === 'publish'} onOpenChange={(o) => !o && !busy && setDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{live.published ? 'Publish changes?' : 'Publish this post?'}</DialogTitle>
                        <DialogDescription>
                            This commits <code className="text-foreground">data/posts/{doc.slug}.md</code> to the site&apos;s repository and triggers a rebuild.
                            It goes live in about a minute and a half. Your draft is cleared once the commit lands.
                        </DialogDescription>
                    </DialogHeader>
                    {actionError && <p className="text-sm text-red-600">{actionError}</p>}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialog(null)} disabled={!!busy}>Cancel</Button>
                        <Button onClick={() => void run('publish')} disabled={!!busy} className="gap-1.5">
                            {busy === 'publishing' && <Loader2 size={14} className="animate-spin" />} Commit and rebuild
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={dialog === 'unpublish'} onOpenChange={(o) => !o && !busy && setDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Unpublish this post?</DialogTitle>
                        <DialogDescription>
                            This commits <code className="text-foreground">published: false</code> for <code className="text-foreground">{doc.slug}</code> and triggers a rebuild. The file stays in the repository; the page leaves the site after the rebuild.
                        </DialogDescription>
                    </DialogHeader>
                    {actionError && <p className="text-sm text-red-600">{actionError}</p>}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialog(null)} disabled={!!busy}>Cancel</Button>
                        <Button onClick={() => void run('unpublish')} disabled={!!busy} className="gap-1.5">
                            {busy === 'unpublishing' && <Loader2 size={14} className="animate-spin" />} Commit and rebuild
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={dialog === 'delete'} onOpenChange={(o) => !o && !busy && setDialog(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete “{doc.title || doc.slug || 'Untitled'}”?</DialogTitle>
                        <DialogDescription>
                            {live.sha
                                ? <>This commits a deletion of <code className="text-foreground">data/posts/{doc.slug}.md</code> and triggers a rebuild. It can only be recovered from git history.</>
                                : 'This discards the draft. It was never committed, so it cannot be recovered.'}
                        </DialogDescription>
                    </DialogHeader>
                    {actionError && <p className="text-sm text-red-600">{actionError}</p>}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDialog(null)} disabled={!!busy}>Keep it</Button>
                        <Button variant="destructive" onClick={() => void run('delete')} disabled={!!busy} className="gap-1.5">
                            {busy === 'deleting' && <Loader2 size={14} className="animate-spin" />} Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
