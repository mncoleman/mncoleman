'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle, ArrowLeft, Bot, Check, Copy, Eye, EyeOff, ExternalLink, File as FileIcon, FileUp, Hash, KeyRound, Link2, Loader2,
    Lock, MousePointerClick, RefreshCw, Replace, Trash2, Type, AlignLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PasteInput } from '@/components/admin/PasteField';
import { canManageSecrets, canUse, type AdminUser } from '@/components/admin/admin-context';
import { useDeploy } from '@/components/admin/deploy-status';
import { authHeaders } from '@/lib/admin-auth';
import { openArtifactTab, withPreviewToken } from '@/lib/artifact-preview';
import { artifactSlug } from '@/lib/utils';
import { saveDraft } from '@/lib/artifact-drafts';
import {
    EmptyState, PropDivider, PropNote, PropRow, PropertiesDrawer, PropertiesToggle, RowAction, SegmentedFilter, StatusPill, TopBarSlot,
    copyText, notify, usePropertiesDrawer, useUnsavedGuard,
} from '@/components/admin/kit';
import { siteUrl } from '@/components/admin/kit/copy-link';
import { copyTarget, editModeHref, isDynamic, relativeTime } from '@/components/admin/artifacts/artifact-logic';
import {
    BrowserBar, DropZone, FileFrame, detailsUrl, errorText, fileToBase64, formatFileSize, readSeed, typeLabel, useArtifacts, useNotYetLive, viewUrl,
    type ArtifactEntry, type Visibility,
} from '@/components/admin/artifacts/shared';

/**
 * Full-page detail for one artifact (`/admin/artifacts/edit?slug=` for instant, `?file=` for static): the live
 * preview and a Properties drawer. Nothing is staged: Save writes straight through the Worker, as the old pane did.
 * Private instant artifacts preview WITHOUT the password (a 90-second single-artifact token, see lib/artifact-preview.ts).
 */

const fieldCls = '-mx-2 block w-[calc(100%+16px)] rounded-[5px] bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/70 hover:bg-foreground/[0.07] focus:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring';

export function ArtifactDetail({ workerUrl, user, slug, file }: { workerUrl: string; user: AdminUser; slug?: string; file?: string }) {
    const fullAccess = canUse(user, 'artifacts');
    const api = workerUrl.replace(/\/$/, '');
    const { artifacts, setArtifacts, loading, error, reload } = useArtifacts(api, fullAccess);
    const listed = useMemo(
        () => artifacts.find((a) => (slug ? isDynamic(a) && a.slug === slug : !isDynamic(a) && a.filename === file)) || null,
        [artifacts, slug, file],
    );
    // A static upload is a commit: the list can lag behind it, so open with what the server returned and keep looking.
    const seeded = useMemo(() => readSeed(slug, file), [slug, file]);
    const found = listed || seeded;
    const [tries, setTries] = useState(0);
    useEffect(() => {
        if (loading || listed || tries >= 3) return;
        const t = setTimeout(() => { setTries((n) => n + 1); void reload(); }, 2000);
        return () => clearTimeout(t);
    }, [loading, listed, tries, reload]);
    const retry = () => { setTries(0); void reload(); };

    if (!found) {
        const looking = loading || tries < 3;
        return (
            <div className="flex h-full items-center justify-center overflow-y-auto p-6" data-lenis-prevent>
                {looking ? (
                    <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" />
                        {tries > 0 && <span>Still publishing…</span>}
                    </div>
                ) : error ? (
                    <EmptyState title="Could not load artifacts" body={<span className="text-red-600">{error}</span>} action={<Button size="sm" variant="outline" onClick={retry} className="gap-1.5"><RefreshCw size={13} /> Try again</Button>} />
                ) : (
                    <EmptyState
                        icon={<FileUp size={20} />}
                        title="We can't find that artifact"
                        body="It may have been deleted, you may not have been given access to it, or it may still be publishing."
                        action={<div className="flex gap-2"><Button size="sm" variant="outline" onClick={retry} className="gap-1.5"><RefreshCw size={13} /> Try again</Button><Button size="sm" variant="outline" asChild><Link href="/admin/artifacts">Back to artifacts</Link></Button></div>}
                    />
                )}
            </div>
        );
    }
    return (
        <Page
            key={found.id}
            api={api}
            artifact={found}
            fullAccess={fullAccess}
            secrets={canManageSecrets(user)}
            onUpdated={(a) => setArtifacts((prev) => prev.map((x) => (x.id === a.id ? a : x)))}
        />
    );
}

function Page({ api, artifact: a, fullAccess, secrets, onUpdated }: {
    api: string; artifact: ArtifactEntry; fullAccess: boolean; secrets: boolean; onUpdated: (a: ArtifactEntry) => void;
}) {
    const router = useRouter();
    const { start } = useDeploy();
    const dynamic = isDynamic(a);
    const drawer = usePropertiesDrawer({ id: 'artifact-props' });
    const [view, setView] = useState<'preview' | 'page'>('preview');
    const [name, setName] = useState(a.name);
    const [description, setDescription] = useState(a.description || '');
    const [file, setFile] = useState<globalThis.File | null>(null);
    const [vis, setVis] = useState<Visibility>(a.visibility || 'public');
    const [password, setPassword] = useState('');
    const [reveal, setReveal] = useState(false);
    const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [frameKey, setFrameKey] = useState(0);
    const pending = useNotYetLive(a, !dynamic, frameKey);

    const dirty = name !== a.name || description !== (a.description || '') || !!file || vis !== (a.visibility || 'public') || !!password;
    const goingPrivate = dynamic && vis === 'private' && a.visibility !== 'private';
    const problem = dynamic && vis === 'private'
        ? password && password.length < 4 ? 'Passwords need at least 4 characters.'
        : goingPrivate && !password ? 'Set a password to make this private.' : null
        : null;
    const url = viewUrl(a);
    const editHref = editModeHref(a);
    const copy = copyTarget(a);
    const private_ = a.visibility === 'private';
    useUnsavedGuard(dirty && busy === null);
    // The service caches public artifacts for 5 minutes; a replaced file or a visibility change must not show the browser's stale copy.
    const fresh = (u: string) => `${u}${u.includes('?') ? '&' : '?'}v=${encodeURIComponent(`${a.uploadedAt}-${frameKey}`)}`;

    // A private artifact's frame would otherwise show the public password gate. The Worker issues a 90-second
    // single-artifact token to people allowed to see it; the service trades it for the unlock cookie and redirects
    // to the clean address. Remints on reload.
    const privateInstant = dynamic && private_ && !!a.slug;
    const previewKey = `${frameKey}|${a.uploadedAt}|${url}`;
    // Tagged with the key it was minted for, so a reload (new key) never renders the previous, expired token URL.
    const [preview, setPreview] = useState<{ k: string; src: string } | null>(null);
    const previewSrc = preview && preview.k === previewKey ? preview.src : null;
    useEffect(() => {
        if (!privateInstant || !a.slug) return;
        let live = true;
        withPreviewToken(api, a.slug, fresh(url)).then((u) => { if (live) setPreview({ k: previewKey, src: u }); });
        return () => { live = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [privateInstant, api, a.slug, a.uploadedAt, frameKey, url]);
    const openTab = privateInstant && a.slug ? () => { void openArtifactTab(api, a.slug!, url, true); } : undefined;

    const save = async () => {
        if (!dirty || problem) return;
        setBusy('save');
        setError(null);
        try {
            let res: Response;
            if (dynamic && a.slug) {
                const fd = new FormData();
                if (name !== a.name) fd.append('name', name);
                if (description !== (a.description || '')) fd.append('description', description);
                if (secrets && vis !== (a.visibility || 'public')) fd.append('visibility', vis);
                if (secrets && password) fd.append('password', password);
                if (secrets && vis === 'public' && a.visibility === 'private') fd.append('clearPassword', 'true');
                if (file) fd.append('file', file);
                res = await fetch(`${api}/api/artifacts/instant/${encodeURIComponent(a.slug)}`, { method: 'PATCH', headers: authHeaders(), credentials: 'include', body: fd });
            } else {
                const body: Record<string, unknown> = { filename: a.filename, name, description };
                if (file) {
                    body.content = await fileToBase64(file);
                    body.type = file.type || 'application/octet-stream';
                    body.size = file.size;
                }
                res = await fetch(`${api}/api/artifacts`, {
                    method: 'PATCH',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    credentials: 'include',
                    body: JSON.stringify(body),
                });
            }
            if (!res.ok) throw new Error(await errorText(res, 'Save failed'));
            if (!dynamic && file) void saveDraft(a.filename, file);
            const data = await res.json().catch(() => ({}));
            const returned = data && typeof data === 'object' ? (data.artifact ?? data) : {};
            const next: ArtifactEntry = {
                ...a,
                name,
                description,
                ...(dynamic && secrets ? { visibility: vis, hasPassword: vis === 'private', password: vis === 'private' ? (password || a.password) : null } : {}),
                ...(file ? { type: file.type || a.type, size: file.size, uploadedAt: new Date().toISOString() } : {}),
                ...(dynamic && returned && typeof returned === 'object' && 'slug' in returned ? returned : {}),
                source: a.source,
            };
            onUpdated(next);
            if (!dynamic) start('static');
            setFile(null);
            setPassword('');
            setFrameKey((k) => k + 1);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Save failed');
        } finally {
            setBusy(null);
        }
    };

    const remove = async () => {
        setBusy('delete');
        setError(null);
        try {
            const res = dynamic && a.slug
                ? await fetch(`${api}/api/artifacts/instant/${encodeURIComponent(a.slug)}`, { method: 'DELETE', headers: authHeaders(), credentials: 'include' })
                : await fetch(`${api}/api/artifacts?file=${encodeURIComponent(a.filename)}`, { method: 'DELETE', headers: authHeaders(), credentials: 'include' });
            if (!res.ok) throw new Error(await errorText(res, 'Delete failed'));
            if (!dynamic) start('static');
            notify(`Deleted “${a.name}”.`);
            router.push('/admin/artifacts');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Delete failed');
            setBusy(null);
            setConfirmDelete(false);
        }
    };

    const copyLink = async () => {
        const ok = await copyText(siteUrl(copy.path));
        notify(ok ? (copy.state.passwordProtected ? 'Link copied. It asks for a password.' : 'Link copied') : 'Could not copy. Select the address and copy it yourself.');
    };
    const copyPassword = async () => notify((await copyText(a.password || '')) ? 'Password copied' : 'Could not copy the password.');

    const state = dirty
        ? <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><i className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved changes</span>
        : saved
            ? <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><Check size={12} /> {dynamic ? 'Saved, live now' : 'Saved, live after the next build'}</span>
            : <span className="flex items-center gap-1.5">{dynamic ? 'Instant: changes go live when you save' : 'Static: changes go live after the site rebuilds'}</span>;

    const shareUrl = detailsUrl(a, artifactSlug);

    return (
        <div className="flex h-full min-h-0">
            <main id="artifact-canvas" data-drawer-inert className="min-w-0 flex-1 overflow-y-auto" data-lenis-prevent>
                <div className="mx-auto flex min-h-full w-full max-w-[1100px] flex-col px-4 pb-8 pt-6 md:px-8 md:pt-8">
                    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        <Link href="/admin/artifacts" className="inline-flex items-center gap-1.5 rounded px-1 py-1 hover:bg-muted hover:text-foreground"><ArrowLeft size={13} /> Artifacts</Link>
                        <div className="min-w-0">{state}</div>
                    </div>
                    {dirty && (
                        <Button size="sm" onClick={save} disabled={busy !== null || !!problem} className="mb-4 h-9 w-full gap-1.5 text-[13px] min-[700px]:hidden" title={problem || 'Save changes'}>
                            {busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save changes
                        </Button>
                    )}

                    {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-700 dark:text-red-300"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}</div>}

                    <div className="mb-2 flex flex-wrap items-start gap-3">
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Name"
                            aria-label="Name"
                            className="min-w-[200px] flex-1 bg-transparent p-0 text-[28px] max-[699px]:basis-full font-bold leading-[1.15] tracking-[-0.025em] text-foreground outline-none placeholder:text-muted-foreground/55 md:text-[34px]"
                        />
                        <div className="flex shrink-0 items-center gap-2">
                            <RowAction variant="button" path={copy.path} state={copy.state} />
                            <Button variant="outline" asChild className="h-8 gap-1.5 px-3 text-[13px]">
                                <a href={pending?.url ?? url} target="_blank" rel="noopener noreferrer" onClick={openTab ? (e) => { e.preventDefault(); openTab(); } : undefined}><ExternalLink size={15} /> <span className="max-[699px]:hidden">Open live page</span></a>
                            </Button>
                        </div>
                    </div>
                    <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-muted-foreground">
                        <StatusPill tone={dynamic ? 'info' : 'neutral'}>{dynamic ? 'Instant' : 'Static'}</StatusPill>
                        {dynamic && <StatusPill tone={private_ ? 'warn' : 'ok'}>{private_ ? 'Private' : 'Public'}</StatusPill>}
                        <span>Updated {relativeTime(a.uploadedAt)}</span>
                        <span className="ml-auto"><SegmentedFilter size="sm" label="View" value={view} onChange={setView} options={[{ value: 'preview', label: 'Preview' }, { value: 'page', label: 'Share page' }]} /></span>
                    </div>

                    <div className="flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-[10px] border border-border/60 bg-muted/30">
                        {private_ && dynamic && view === 'preview' && (
                            <div className="flex items-start gap-2 border-b border-border/60 bg-amber-500/10 px-3 py-2 text-[13px]"><Lock size={15} className="mt-px shrink-0" /> <span><b className="font-medium">Private page.</b> Visitors must enter the password. {secrets ? 'As a site admin you see it here without one.' : 'You can preview it here without one because you were given access to it.'}</span></div>
                        )}
                        {view === 'preview' ? (
                            <>
                                <BrowserBar url={url} href={pending?.url} onOpen={openTab} badge={pending ? 'Still being published' : private_ ? 'Private · password-gated' : undefined} />
                                {pending && <div className="border-b border-border/60 bg-amber-500/10 px-3 py-2 text-[13px]">Still being published. It will appear in a minute or two. Until then this is the copy you uploaded.</div>}
                                <div className="relative min-h-0 flex-1 [&>*]:absolute [&>*]:inset-0">
                                    {privateInstant && !previewSrc ? (
                                        <div className="flex h-full items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
                                    ) : (
                                        <FileFrame key={`${frameKey}-${pending?.url ?? 'live'}`} src={pending?.url ?? previewSrc ?? fresh(url)} type={a.type} title={a.name} sameOrigin={!dynamic} />
                                    )}
                                </div>
                            </>
                        ) : (
                            <>
                                <BrowserBar url={dynamic ? shareUrl : `${typeof window !== 'undefined' ? window.location.origin : ''}${shareUrl}`} badge={dynamic ? undefined : 'As of the last build'} />
                                {/* The share page is this site's own page (static) or the service's own template (instant), not uploaded content. */}
                                <iframe key={frameKey} src={fresh(shareUrl)} title={`${a.name} share page`} className="min-h-0 w-full flex-1 border-0 bg-background" />
                            </>
                        )}
                    </div>
                </div>
            </main>

            <TopBarSlot>
                {dirty && (
                    <Button size="sm" onClick={save} disabled={busy !== null || !!problem} className="mr-1 h-8 gap-1.5 text-[13px] max-[699px]:hidden" title={problem || 'Save changes'}>
                        {busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
                    </Button>
                )}
                <PropertiesToggle drawer={drawer} />
            </TopBarSlot>
            <PropertiesDrawer drawer={drawer} label="Artifact properties">
                {dynamic && secrets && (
                    <PropRow icon={Eye} label="Visibility">
                        <SegmentedFilter size="sm" label="Visibility" value={vis} onChange={setVis} options={[{ value: 'public', label: 'Public' }, { value: 'private', label: 'Private' }]} />
                    </PropRow>
                )}
                {dynamic && !secrets && private_ && (
                    <>
                        <PropRow icon={Lock} label="Visibility"><StatusPill tone="warn">Private</StatusPill></PropRow>
                        <PropNote>Only a site admin can change visibility or the password.</PropNote>
                    </>
                )}
                {dynamic && secrets && vis === 'private' && (
                    <>
                        {private_ && a.hasPassword && (
                            <PropRow icon={KeyRound} label="Password">
                                {a.password ? (
                                    <span className="flex min-w-0 items-center gap-1">
                                        <code className="min-w-0 truncate font-mono text-xs" data-testid="current-password">{reveal ? a.password : '•'.repeat(Math.min(a.password.length, 12))}</code>
                                        <button type="button" onClick={() => setReveal((r) => !r)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title={reveal ? 'Hide' : 'Reveal'} aria-label={reveal ? 'Hide password' : 'Reveal password'}>{reveal ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                                        <button type="button" onClick={copyPassword} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Copy password" aria-label="Copy password"><Copy size={14} /></button>
                                    </span>
                                ) : (
                                    <span className="text-xs italic text-muted-foreground">Not recoverable (set before passwords were stored)</span>
                                )}
                            </PropRow>
                        )}
                        <PropRow icon={KeyRound} label={a.hasPassword && private_ ? 'New password' : 'Password'} stack>
                            <PasteInput
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={a.hasPassword && private_ ? 'Type one to change it' : 'At least 4 characters'}
                                aria-label="New password"
                                autoComplete="new-password"
                                className="h-8 text-sm"
                            />
                        </PropRow>
                        <PropNote bad={!!problem}>{problem || (a.hasPassword && private_ ? 'Leave blank to keep the current one.' : 'Visitors type this to get in.')}</PropNote>
                    </>
                )}
                {dynamic && <PropDivider />}

                <PropRow icon={Type} label="Name" stack>
                    <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" aria-label="Name" className={fieldCls} />
                </PropRow>
                <PropRow icon={AlignLeft} label="Description" stack>
                    <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        placeholder="A line about what this is, for the list and the share card"
                        aria-label="Description"
                        className="-mx-2 block min-h-[34px] w-full resize-none rounded-[5px] bg-transparent px-2 py-1.5 text-sm leading-normal outline-none [field-sizing:content] placeholder:text-muted-foreground/70 hover:bg-foreground/[0.07] focus:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring"
                    />
                </PropRow>
                <PropRow icon={Hash} label="Address" stack>
                    <span className="min-w-0 break-all py-1.5 text-sm text-muted-foreground">{dynamic ? `/a/${a.slug}` : a.filename}</span>
                </PropRow>
                <PropNote>The address stays the same when you replace the file. To use a different one, upload a new artifact.</PropNote>
                <PropRow icon={Link2} label="Sharing link" stack>
                    <div className="flex w-full min-w-0 items-center gap-1.5">
                        <input readOnly value={siteUrl(copy.path)} aria-label="Sharing link" onFocus={(e) => e.currentTarget.select()} className="h-8 min-w-0 flex-1 rounded-md border border-border/60 bg-transparent px-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                        <Button size="sm" variant="outline" onClick={copyLink} className="h-8 shrink-0 gap-1.5 px-2.5 text-[13px]"><Copy size={13} /> Copy</Button>
                    </div>
                </PropRow>

                <PropDivider />
                <PropRow icon={Replace} label="Replace file" stack>
                    <div className="w-full">
                        <DropZone file={file} onFile={setFile} compact label="Drop a new version or click" />
                    </div>
                </PropRow>
                <PropNote>Keeps the same address{dynamic ? ' and share card' : ''}. {editHref ? 'For a small text change, edit mode is quicker.' : ''}</PropNote>

                <PropRow icon={FileIcon} label="File" stack>
                    <dl className="w-full space-y-1 py-1 text-xs">
                        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Name</dt><dd className="truncate">{a.filename}</dd></div>
                        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Type</dt><dd>{typeLabel(a)}</dd></div>
                        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Size</dt><dd className="tabular-nums">{formatFileSize(a.size)}</dd></div>
                        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Updated</dt><dd className="tabular-nums">{a.uploadedAt?.slice(0, 10)}</dd></div>
                        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Lives</dt><dd>{dynamic ? 'Artifact server' : 'The site'}</dd></div>
                    </dl>
                </PropRow>

                {editHref && (
                    <>
                        <PropDivider />
                        <div className="flex flex-col gap-2">
                            <Button asChild variant="outline" size="sm" className="h-9 w-full justify-start gap-2 text-[13px]"><Link href={editHref}><MousePointerClick size={15} /> Open edit mode</Link></Button>
                            <Button asChild variant="outline" size="sm" className="h-9 w-full justify-start gap-2 text-[13px]"><Link href={editHref}><Bot size={15} /> Link my Claude</Link></Button>
                        </div>
                        <PropNote>Edit mode lets you click text on the page to change it and leave notes. Link my Claude lets your Claude session read the notes and make the changes.</PropNote>
                    </>
                )}

                {fullAccess && (
                    <>
                        <PropDivider />
                        <button type="button" onClick={() => setConfirmDelete(true)} className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-600">
                            <Trash2 size={12} /> Delete artifact
                        </button>
                    </>
                )}
            </PropertiesDrawer>

            <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete “{a.name}”?</DialogTitle>
                        <DialogDescription>
                            {dynamic
                                ? 'This removes the file, share card and details now. Anyone with the link gets a 404. It cannot be undone.'
                                : 'This removes the file from the site. It disappears after the next site rebuild.'}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDelete(false)}>Keep it</Button>
                        <Button variant="destructive" onClick={remove} disabled={busy !== null} className="gap-1.5">
                            {busy === 'delete' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
