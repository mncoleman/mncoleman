'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Editor } from '@tiptap/react';
import { AlertTriangle, Calendar, Check, CircleDot, ExternalLink, FolderKanban, BookMarked, Hash, AlignLeft, Link2, Loader2, Plus, RefreshCw, Tag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { authHeaders } from '@/lib/admin-auth';
import { cn, slugify } from '@/lib/utils';
import { DEFAULT_TAG_KEY, flattenTags, tagKeys, tagValues } from '@/lib/tags';
import { MarkdownEditor } from '@/components/admin/MarkdownEditor';
import { CollectionDetail } from '@/components/collection-detail';
import { COLLECTIONS, editHref, useContent, type CollectionName, type Item } from '@/components/admin/content-store';
import { bodyEditorKey, toMonthStart } from '@/components/admin/content-logic';
import { PasteInput } from '@/components/admin/PasteField';
import { useDeploy, useNow, deployProgress, clock } from '@/components/admin/deploy-status';
import { DatePicker } from '@/components/admin/fields/DatePicker';
import { SelectField } from '@/components/admin/fields/SelectField';
import { TagCombobox } from '@/components/admin/fields/TagCombobox';
import {
    EmptyState, PropDivider, PropNote, PropRow, PropertiesDrawer, PropertiesToggle, RowAction, SegmentedFilter, StatusPill, TopBarSlot,
    entryPath, notify, usePropertiesDrawer,
} from '@/components/admin/kit';
import '@/components/admin/page-editor.css';

/**
 * Full-page editor for one project or resource (`/admin/<name>/edit?id=<key>`), the same layout as the
 * post editor: a Notion-style page (title, then the body in the page-variant MarkdownEditor) with the
 * collapsible Properties drawer on the right. Every change is staged in content-store as you type; the top
 * bar's "N unpublished" menu publishes or discards them (this page also offers "Undo changes").
 * A record's key (`_k`) is its slug for saved records and `new-...` for a not-yet-published one, which lives
 * only in memory: a full page reload drops it, and this page says so plainly.
 */

function readAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.readAsDataURL(file);
    });
}

const fieldCls = '-mx-2 block w-[calc(100%+16px)] rounded-[5px] bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground/70 hover:bg-foreground/[0.07] focus:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring';

export function CollectionEditor({ name, id, workerUrl }: { name: CollectionName; id: string; workerUrl: string }) {
    const cfg = COLLECTIONS[name];
    const router = useRouter();
    const content = useContent();
    const { ensureLoaded } = content;
    const { status, items } = content.state[name];
    const item = items.find((i) => i._k === id);
    useEffect(() => { ensureLoaded(name); }, [name, ensureLoaded]);

    if (!item) {
        const loading = status !== 'ready' && status !== 'error';
        return (
            <div className="flex h-full items-center justify-center overflow-y-auto p-6" data-lenis-prevent>
                {loading ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
                ) : status === 'error' ? (
                    <EmptyState title={`Could not load ${cfg.label.toLowerCase()}`} body={<span className="text-red-600">{content.state[name].error}</span>} action={<Button size="sm" variant="outline" onClick={() => content.reload(name)} className="gap-1.5"><RefreshCw size={13} /> Try again</Button>} />
                ) : (
                    <EmptyState
                        icon={name === 'projects' ? <FolderKanban size={20} /> : <BookMarked size={20} />}
                        title={`We can't find that ${cfg.singular}`}
                        body={`It may have been deleted, or it was new and unpublished when the page reloaded. A new ${cfg.singular} is only kept until you publish it or leave the admin.`}
                        action={<Button size="sm" variant="outline" asChild><Link href={cfg.href}>Back to {cfg.label.toLowerCase()}</Link></Button>}
                    />
                )}
            </div>
        );
    }
    // Keyed so moving between records remounts the page instead of reusing the editor's state.
    return <Page key={item._k} name={name} item={item} items={items} workerUrl={workerUrl} onGone={() => router.push(cfg.href)} />;
}

function Page({ name, item, items, workerUrl, onGone }: { name: CollectionName; item: Item; items: Item[]; workerUrl: string; onGone: () => void }) {
    const cfg = COLLECTIONS[name];
    const content = useContent();
    const change = content.changes[name].find((c) => c.item._k === item._k);
    const baseItem = content.state[name].base.find((b) => b._k === item._k);
    const { run } = useDeploy();
    const riding = !!run && run.keys.includes(item._k);
    const now = useNow(riding && run?.state !== 'landed');
    const [view, setView] = useState<'write' | 'preview'>('write');
    const drawer = usePropertiesDrawer({ id: 'collection-props' });
    const [confirmDelete, setConfirmDelete] = useState(false);
    // The body editor reads its text once on mount: remount it whenever the record changed from outside it (discard, reload).
    const bodyKey = bodyEditorKey(content.state[name].revision, item._k);
    const [newKey, setNewKey] = useState('');
    const [extraKeys, setExtraKeys] = useState<string[]>([]);
    const editorRef = useRef<Editor | null>(null);
    const titleRef = useRef<HTMLTextAreaElement>(null);
    const descRef = useRef<HTMLTextAreaElement>(null);
    const update = useCallback((p: Partial<Item>) => content.update(name, item._k, p), [content, name, item._k]);

    const slug = slugify(item.name);
    const duplicate = !!slug && items.some((i) => i._k !== item._k && i.id === slug);
    // Live = the SITE has it published at this address (not new, not renamed since). A published record staged back to
    // Draft is still live until you publish, so its link still works.
    const live = !!baseItem?.published && baseItem.id === item.id && change?.kind !== 'added';
    const renamed = !!baseItem && !!baseItem.id && baseItem.id !== slug;

    const keys = useMemo(() => {
        const all = [...tagKeys(items), ...Object.keys(item.tags), ...extraKeys];
        if (all.length === 0) all.push(DEFAULT_TAG_KEY[name]);
        return [...new Set(all)];
    }, [items, item.tags, extraKeys, name]);
    const setKey = (key: string, values: string[]) => {
        const { [key]: _old, ...rest } = item.tags; // eslint-disable-line @typescript-eslint/no-unused-vars
        update({ tags: values.length ? { ...rest, [key]: values } : rest });
    };
    const addKey = () => {
        const k = newKey.trim();
        if (!k) return;
        if (!keys.some((x) => x.toLowerCase() === k.toLowerCase())) setExtraKeys((x) => [...x, k]);
        setNewKey('');
    };

    useEffect(() => {
        for (const r of [titleRef, descRef]) {
            const t = r.current;
            if (t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; }
        }
    }, [item.name, item.description, view, drawer.open]);

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

    const focusBodyEnd = () => {
        const ed = editorRef.current;
        if (!ed) return;
        const last = ed.state.doc.lastChild;
        if (last && last.type.name !== 'paragraph') ed.chain().insertContentAt(ed.state.doc.content.size, { type: 'paragraph' }).focus('end').run();
        else ed.commands.focus('end');
    };

    // Esc leaves the editor for the list (first Esc just leaves a field you are typing in; popovers, dialogs and the
    // overlay drawer take their own Esc first). Alt+Up / Alt+Down step to the previous / next record in list order.
    const router = useRouter();
    const { items: all } = content.state[name];
    const at = all.findIndex((i) => i._k === item._k);
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.defaultPrevented) return;
            if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                const next = all[at + (e.key === 'ArrowDown' ? 1 : -1)];
                if (next) { e.preventDefault(); router.push(editHref(name, next._k)); }
                return;
            }
            if (e.key !== 'Escape') return;
            if (document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper]')) return;
            if (drawer.open && window.innerWidth < 1100) return;
            const t = e.target instanceof HTMLElement ? e.target : null;
            if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) { t.blur(); return; }
            router.push(cfg.href);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [all, at, name, router, cfg.href, drawer.open]);

    const undo = () => {
        if (!change) return;
        content.revert(name, change);
        if (change.kind === 'added') { onGone(); return; }
        notify('Changes undone.');
    };
    const remove = () => {
        content.remove(name, item._k);
        setConfirmDelete(false);
        onGone();
    };

    let state: React.ReactNode;
    if (change) {
        state = (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><i className="h-1.5 w-1.5 rounded-full bg-amber-500" /> {change.kind === 'added' ? 'New, not published yet' : 'Edited, not published yet'}</span>
                <button type="button" onClick={undo} className="text-foreground underline underline-offset-4">{change.kind === 'added' ? 'Discard' : 'Undo changes'}</button>
            </span>
        );
    } else if (riding && (run.state === 'running' || run.state === 'slow')) {
        state = <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400"><Loader2 size={12} className="animate-spin" /> Publishing{run.state === 'running' ? `, live in about ${clock(deployProgress(run, now).left)}` : '…'}</span>;
    } else if (riding && run.state === 'landed') {
        state = <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><Check size={12} /> Now live</span>;
    } else {
        state = <span className="flex items-center gap-1.5"><Check size={12} /> Matches the live site</span>;
    }

    const conflict = content.conflict === name;
    const statusOptions = [
        { value: 'draft', label: 'Draft', render: <StatusPill published={false} /> },
        { value: 'published', label: 'Published', render: <StatusPill published /> },
    ];

    return (
        <div className="flex h-full min-h-0">
            <main id="collection-canvas" data-drawer-inert className="min-w-0 flex-1 overflow-y-auto" data-lenis-prevent>
                <div className="mx-auto w-full max-w-[768px] px-4 pb-[24vh] pt-6 md:px-8 md:pt-10">
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-xs text-muted-foreground">
                        <div className="min-w-0">{state}</div>
                        <div className="flex items-center gap-2">
                            {live && slug && (
                                <a href={`${cfg.path}/${slug}/`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded px-1.5 py-1 hover:bg-muted hover:text-foreground" title="Open the live page">
                                    <ExternalLink size={12} /> View
                                </a>
                            )}
                            <SegmentedFilter size="sm" label="View" value={view} onChange={setView} options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />
                        </div>
                    </div>

                    {conflict && (
                        <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/45 bg-amber-500/10 px-3 py-2.5 text-[13px]">
                            <span className="flex items-start gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> The {cfg.label.toLowerCase()} list was changed somewhere else, so this could not be published. Reload to get the latest version (this drops your unpublished edits to {cfg.label.toLowerCase()}).</span>
                            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => content.reload(name)}><RefreshCw size={13} /> Reload {cfg.label.toLowerCase()}</Button>
                        </div>
                    )}

                    {view === 'write' ? (
                        <>
                            <div className="flex items-start gap-3">
                                <textarea
                                    ref={titleRef}
                                    rows={1}
                                    autoFocus={!item.name}
                                    value={item.name}
                                    onChange={(e) => update({ name: e.target.value.replace(/\n/g, ' ') })}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); editorRef.current?.commands.focus('start'); } }}
                                    placeholder={`Untitled ${cfg.singular}`}
                                    aria-label="Name"
                                    spellCheck={false}
                                    className="mb-2 block w-full min-w-0 flex-1 resize-none overflow-hidden bg-transparent p-0 text-[32px] font-bold leading-[1.15] tracking-[-0.025em] text-foreground outline-none placeholder:text-muted-foreground/55 md:text-[42px]"
                                />
                                {slug && <RowAction variant="button" path={entryPath(cfg.path.slice(1), slug)} state={{ live }} className="mt-1.5 md:mt-2.5" />}
                            </div>
                            <div className="mb-7 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
                                <StatusPill published={item.published} />
                                {name === 'projects' && item.date && <><span>{new Date(item.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span><span aria-hidden="true">·</span></>}
                                <span className="truncate">{cfg.path}/{slug || '…'}/</span>
                                {duplicate && <span role="alert" className="text-red-600 dark:text-red-400">Another {cfg.singular} already uses this address.</span>}
                            </div>
                            <MarkdownEditor
                                key={bodyKey}
                                variant="page"
                                value={item.content || ''}
                                onChange={(c) => update({ content: c })}
                                onUpload={uploadImage}
                                onNotice={notify}
                                onEditor={(ed) => { editorRef.current = ed; }}
                                placeholder="Write, press / for blocks, or @ for a verse or citation"
                            />
                            <div className="h-[40vh] cursor-text" aria-hidden="true" onMouseDown={(e) => { e.preventDefault(); focusBodyEnd(); }} />
                        </>
                    ) : (
                        <PagePreview name={name} item={item} />
                    )}
                </div>
            </main>

            <TopBarSlot><PropertiesToggle drawer={drawer} /></TopBarSlot>
            <PropertiesDrawer drawer={drawer} label={`${cfg.singular[0].toUpperCase()}${cfg.singular.slice(1)} properties`}>
                <PropRow icon={CircleDot} label="Status">
                    <SelectField
                        aria-label="Status"
                        value={item.published ? 'published' : 'draft'}
                        onChange={(v) => update({ published: v === 'published' })}
                        options={statusOptions}
                        trigger={<StatusPill published={item.published} />}
                    />
                </PropRow>
                {name === 'projects' && (
                    <PropRow icon={Calendar} label="Date">
                        <DatePicker
                            value={item.date || ''}
                            onChange={(date) => update({ date: toMonthStart(date) })}
                            aria-label="Date"
                            allowPartial
                            clearable
                            format={(v) => new Date(`${v.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                        />
                    </PropRow>
                )}
                <PropRow icon={Link2} label="Link" stack>
                    <PasteInput type="url" value={item.url} onChange={(e) => update({ url: e.target.value.trim() })} transform={(t) => t.trim()} placeholder="https://" aria-label="Link" spellCheck={false} autoComplete="off" className="h-8 text-sm" wrapperClassName="w-full" />
                </PropRow>
                {keys.map((key) => (
                    <PropRow key={key} icon={Tag} label={key}>
                        <TagCombobox
                            aria-label={`Add ${key.toLowerCase()} tag`}
                            value={item.tags[key] || []}
                            options={tagValues(items, key)}
                            onChange={(v) => setKey(key, v)}
                        />
                    </PropRow>
                ))}
                <PropRow icon={Plus} label="New kind">
                    <input
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKey(); } }}
                        placeholder="Add a tag kind, e.g. Status"
                        aria-label="New tag kind"
                        className={fieldCls}
                    />
                </PropRow>

                <PropDivider />

                <PropRow icon={Hash} label="Web address" stack>
                    <div className="flex min-w-0 flex-wrap items-center text-sm text-muted-foreground">
                        <span>{cfg.path}/</span>
                        <span className={cn('min-w-0 break-all px-1.5', duplicate ? 'text-red-600 dark:text-red-400' : 'text-foreground')} aria-label="Web address">{slug || '…'}</span>
                        <span>/</span>
                    </div>
                </PropRow>
                <PropNote bad={duplicate} id="collection-slug-hint">
                    {duplicate
                        ? <>Another {cfg.singular} already uses this address. Change the name to fix it.</>
                        : renamed
                            ? <>Renamed: the page moves to this address when you publish, and the old one stops working.</>
                            : <>Follows the name. Renaming a published {cfg.singular} moves its page.</>}
                </PropNote>

                <PropRow icon={AlignLeft} label="Description" stack>
                    <textarea
                        ref={descRef}
                        value={item.description}
                        onChange={(e) => update({ description: e.target.value })}
                        rows={2}
                        placeholder="One or two lines for the list page and the share card"
                        aria-label="Description"
                        className="-mx-2 block min-h-[34px] w-full resize-none overflow-hidden rounded-[5px] bg-transparent px-2 py-1.5 text-sm leading-normal outline-none placeholder:text-muted-foreground/70 hover:bg-foreground/[0.07] focus:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring"
                    />
                </PropRow>

                <PropDivider />
                <PropNote>Changes stay unpublished until you press Publish at the top. Images upload as soon as you add them, each as its own save to your site.</PropNote>
                <button type="button" onClick={() => { drawer.setOpen(false, false); setConfirmDelete(true); }} className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-600">
                    <Trash2 size={12} /> Delete {cfg.singular}
                </button>
            </PropertiesDrawer>

            <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete “{item.name || `Untitled ${cfg.singular}`}”?</DialogTitle>
                        <DialogDescription>
                            {change?.kind === 'added'
                                ? 'It was never published, so it is gone for good.'
                                : 'It leaves the site the next time you publish. Until then you can undo it from the unpublished menu at the top.'}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmDelete(false)}>Keep it</Button>
                        <Button variant="destructive" onClick={remove} className="gap-1.5"><Trash2 size={14} /> Delete</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/** The detail page as it will look, rendered from the staged copy with the page's own component. */
function PagePreview({ name, item }: { name: CollectionName; item: Item }) {
    const cfg = COLLECTIONS[name];
    const path = `${cfg.path}/${slugify(item.name) || '…'}/`;
    return (
        <div className="-mx-4 overflow-hidden rounded-[10px] border border-border/60 md:mx-0">
            <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border/60 bg-muted/35 px-3 text-xs">
                <span className="hidden gap-1.5 sm:flex" aria-hidden="true">
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
                    <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
                </span>
                <span className="min-w-0 flex-1 truncate rounded bg-muted/60 px-2 py-0.5 text-muted-foreground">mncoleman.com{path}</span>
                <span className="shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">
                    {item.published ? 'Draft preview' : 'Hidden on site'}
                </span>
            </div>
            <article className="bg-background px-4 py-12">
                <CollectionDetail
                    kind={name === 'projects' ? 'project' : 'resource'}
                    name={item.name || `Untitled ${cfg.singular}`}
                    description={item.description}
                    date={name === 'projects' ? item.date : undefined}
                    tags={flattenTags(item.tags)}
                    url={item.url}
                    content={item.content}
                    detailsPath={path}
                    backLink={(children, className) => <span className={className}>{children}</span>}
                />
            </article>
        </div>
    );
}
