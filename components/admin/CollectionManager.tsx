'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Circle, ExternalLink, Link2, Loader2, Plus, RefreshCw, Search, Settings2, Tags as TagsIcon, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { authHeaders } from '@/lib/admin-auth';
import { cn, slugify } from '@/lib/utils';
import { DEFAULT_TAG_KEY, flattenTags, tagKeys, tagValues } from '@/lib/tags';
import { PasteInput } from '@/components/admin/PasteField';
import { TagPicker } from '@/components/admin/TagPicker';
import { TagManager } from '@/components/admin/TagManager';
import { MonthPicker } from '@/components/admin/MonthPicker';
import { MarkdownEditor } from '@/components/admin/MarkdownEditor';
import { CollectionDetail } from '@/components/collection-detail';
import { COLLECTIONS, useContent, type Change, type CollectionName, type Item } from '@/components/admin/content-store';
import { useDeploy, useNow, deployProgress, clock } from '@/components/admin/deploy-status';

/**
 * One JSON-backed collection: a table on the left and the selected record's
 * editor beside it, so the list never locks while you edit. Edits stage as you
 * type (see content-store.tsx); Publish in the top bar ships them.
 *
 * Images dropped or pasted into the body are uploaded straight away (their own
 * commit, into public/collections/) and inserted as markdown at the caret.
 */

function readAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.readAsDataURL(file);
    });
}

export function CollectionManager({ name, workerUrl }: { name: CollectionName; workerUrl: string }) {
    const cfg = COLLECTIONS[name];
    const content = useContent();
    const { status, items, error } = content.state[name];
    const changes = content.changes[name];
    const selectedKey = content.selected[name];
    const selected = items.find((i) => i._k === selectedKey) || null;
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<'all' | 'live' | 'draft'>('all');
    const [tagFilter, setTagFilter] = useState<string | null>(null);
    const [showTags, setShowTags] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const changed = useMemo(() => new Map(changes.map((c) => [c.item._k, c.kind])), [changes]);
    const allTags = useMemo(() => [...new Set(items.flatMap((i) => flattenTags(i.tags)))].sort(), [items]);

    const { ensureLoaded } = content;
    useEffect(() => { ensureLoaded(name); }, [name, ensureLoaded]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return items.filter((i) => {
            if (filter === 'live' && !i.published) return false;
            if (filter === 'draft' && i.published) return false;
            if (tagFilter && !flattenTags(i.tags).includes(tagFilter)) return false;
            if (!q) return true;
            return [i.name, i.description, i.url, i.content || '', ...flattenTags(i.tags)].join('\n').toLowerCase().includes(q);
        });
    }, [items, query, filter, tagFilter]);

    const select = useCallback((k: string | null) => content.select(name, k), [content, name]);

    // Keyboard: / search, N new, ↑/↓ or J/K through the visible list, Esc closes the editor.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
            if (document.querySelector('[role="dialog"]')) return;
            const t = e.target as HTMLElement | null;
            const typing = !!t && typeof t.closest === 'function' && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
            if (e.key === 'Escape') {
                if (typing) t?.blur();
                else if (selectedKey) select(null);
                return;
            }
            if (typing) return;
            if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
            else if (e.key.toLowerCase() === 'n') { e.preventDefault(); content.create(name); }
            else if (['ArrowDown', 'ArrowUp', 'j', 'k'].includes(e.key) && visible.length) {
                e.preventDefault();
                const idx = visible.findIndex((i) => i._k === selectedKey);
                const step = e.key === 'ArrowDown' || e.key === 'j' ? 1 : -1;
                const next = visible[idx === -1 ? 0 : Math.max(0, Math.min(visible.length - 1, idx + step))];
                select(next._k);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [visible, selectedKey, select, content, name]);

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

    if (status !== 'ready' && items.length === 0) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
                {status === 'error' ? (
                    <>
                        <p className="text-red-600">{error}</p>
                        <Button size="sm" variant="outline" onClick={() => content.reload(name)} className="gap-1.5"><RefreshCw size={13} /> Try again</Button>
                    </>
                ) : (
                    <Loader2 className="h-6 w-6 animate-spin" />
                )}
            </div>
        );
    }

    const narrow = !!selected;

    return (
        <div className="flex h-full">
            {/* List. Beside an open record it narrows to name + status; on a phone it gives way to the editor. */}
            <div className={cn('flex h-full min-w-0 flex-col border-r border-border/60 transition-[width] duration-200', narrow ? 'hidden w-[360px] shrink-0 md:flex xl:w-[400px]' : 'w-full')}>
                <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 md:px-6">
                    {!narrow && <h1 className="mr-2 hidden text-lg font-semibold tracking-tight sm:block">{cfg.label}</h1>}
                    <div className="relative min-w-0 flex-1">
                        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder={`Search ${cfg.label.toLowerCase()}…`}
                            aria-label={`Search ${cfg.label.toLowerCase()}`}
                            className="h-8 w-full rounded-md border border-border/60 bg-transparent pl-8 pr-8 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/40"
                        />
                        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border/60 px-1 font-mono text-[10px] text-muted-foreground sm:block">/</kbd>
                    </div>
                    <Segmented value={filter} onChange={setFilter} options={[['all', 'All'], ['live', 'Live'], ['draft', 'Drafts']]} />
                    {!narrow && (
                        <Popover>
                            <PopoverTrigger asChild>
                                <button type="button" className={cn('hidden h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs md:flex', tagFilter ? 'border-foreground/40 text-foreground' : 'border-border/60 text-muted-foreground hover:text-foreground')}>
                                    {tagFilter || 'Tag'}
                                    {tagFilter
                                        ? <X size={12} onClick={(e) => { e.stopPropagation(); setTagFilter(null); }} />
                                        : <ChevronDown size={12} />}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-56 p-1">
                                <div className="max-h-72 overflow-y-auto" data-lenis-prevent>
                                    {allTags.map((t) => (
                                        <button key={t} type="button" onClick={() => setTagFilter(t)} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted">
                                            {t} {tagFilter === t && <Check size={13} />}
                                        </button>
                                    ))}
                                </div>
                                <div className="mt-1 border-t border-border/60 pt-1">
                                    <button type="button" onClick={() => setShowTags(true)} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
                                        <TagsIcon size={13} /> Manage tags…
                                    </button>
                                </div>
                            </PopoverContent>
                        </Popover>
                    )}
                    {/* Icon-only beside the editor, so the toolbar never wraps when the pane opens. */}
                    <Button
                        size="sm"
                        onClick={() => content.create(name)}
                        className={cn('h-8 shrink-0 gap-1.5', narrow && 'w-8 px-0')}
                        title={`New ${cfg.singular} (N)`}
                        aria-label={`New ${cfg.singular}`}
                    >
                        <Plus size={14} /> {!narrow && <span className="hidden sm:inline">New {cfg.singular}</span>}
                    </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto" data-lenis-prevent>
                    {visible.length === 0 ? (
                        <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                            {items.length === 0 ? `No ${cfg.label.toLowerCase()} yet.` : 'Nothing matches.'}
                            {items.length > 0 && (
                                <button type="button" className="text-foreground underline underline-offset-4" onClick={() => { setQuery(''); setFilter('all'); setTagFilter(null); }}>Clear filters</button>
                            )}
                        </div>
                    ) : (
                        <RecordTable name={name} items={visible} selectedKey={selectedKey} changed={changed} onSelect={select} narrow={narrow} />
                    )}
                </div>
                <div className="hidden border-t border-border/60 px-4 py-1.5 text-[11px] text-muted-foreground md:block md:px-6">
                    {visible.length} of {items.length} · <kbd className="font-mono">↑↓</kbd> move · <kbd className="font-mono">N</kbd> new · <kbd className="font-mono">Esc</kbd> close · <kbd className="font-mono">⌘S</kbd> publish
                </div>
            </div>

            {selected && (
                <div className="h-full min-w-0 flex-1">
                    <RecordEditor
                        key={selected._k}
                        name={name}
                        item={selected}
                        items={items}
                        change={changed.get(selected._k)}
                        onChange={(p) => content.update(name, selected._k, p)}
                        onClose={() => select(null)}
                        onRemove={() => content.remove(name, selected._k)}
                        onUpload={uploadImage}
                    />
                </div>
            )}

            <Dialog open={showTags} onOpenChange={setShowTags}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Tags</DialogTitle>
                        <DialogDescription>Rename or delete a kind or a value across every {cfg.singular}. Add new ones from a record&apos;s details panel. Changes stage like any edit.</DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto" data-lenis-prevent>
                        <TagManager items={items} onChange={(rewrite) => content.rewriteTags(name, rewrite)} />
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/* -------------------------------- list ---------------------------------- */

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
    return (
        <div className="flex h-8 shrink-0 items-center rounded-md border border-border/60 p-0.5">
            {options.map(([v, label]) => (
                <button
                    key={v}
                    type="button"
                    onClick={() => onChange(v)}
                    aria-pressed={value === v}
                    className={cn('h-full rounded px-2 text-xs transition-colors', value === v ? 'bg-foreground/[0.08] font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

function ChangeMark({ kind }: { kind?: Change['kind'] }) {
    if (!kind) return null;
    return <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', kind === 'added' ? 'bg-emerald-500' : 'bg-amber-500')} title={kind === 'added' ? 'New, unpublished' : 'Edited, unpublished'} />;
}

function StatusDot({ published }: { published: boolean }) {
    return (
        <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-xs', published ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
            <Circle size={7} className={published ? 'fill-current' : ''} />
            {published ? 'Live' : 'Draft'}
        </span>
    );
}

function RecordTable({
    name, items, selectedKey, changed, onSelect, narrow,
}: {
    name: CollectionName;
    items: Item[];
    selectedKey: string | null;
    changed: Map<string, Change['kind']>;
    onSelect: (k: string) => void;
    narrow: boolean;
}) {
    return (
        <table className="w-full table-fixed text-sm">
            {!narrow && (
                <thead className="sticky top-0 z-10 bg-background text-left text-xs text-muted-foreground">
                    <tr className="border-b border-border/60">
                        <th className="px-4 py-2 font-medium md:px-6">Name</th>
                        <th className="hidden w-[22%] px-3 py-2 font-medium lg:table-cell">Tags</th>
                        {name === 'projects' && <th className="hidden w-24 px-3 py-2 font-medium xl:table-cell">Date</th>}
                        <th className="hidden w-[20%] px-3 py-2 font-medium md:table-cell">Link</th>
                        <th className="w-24 px-4 py-2 text-right font-medium md:px-6">Status</th>
                    </tr>
                </thead>
            )}
            <tbody>
                {items.map((i) => {
                    const active = i._k === selectedKey;
                    return (
                        <tr
                            key={i._k}
                            onClick={() => onSelect(i._k)}
                            className={cn('cursor-pointer border-b border-border/40 transition-colors', active ? 'bg-foreground/[0.06]' : 'hover:bg-muted/40')}
                        >
                            <td className="px-4 py-2.5 md:px-6">
                                <div className="flex items-center gap-2">
                                    <ChangeMark kind={changed.get(i._k)} />
                                    <span className={cn('truncate', active && 'font-medium')}>{i.name || <span className="text-muted-foreground">Untitled</span>}</span>
                                </div>
                                {i.description && <div className="mt-0.5 truncate text-xs text-muted-foreground">{i.description}</div>}
                            </td>
                            {!narrow && (
                                <td className="hidden px-3 py-2.5 lg:table-cell">
                                    <div className="flex flex-wrap gap-1">
                                        {flattenTags(i.tags).slice(0, 3).map((t) => (
                                            <span key={t} className="whitespace-nowrap rounded border border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">{t}</span>
                                        ))}
                                    </div>
                                </td>
                            )}
                            {!narrow && name === 'projects' && <td className="hidden px-3 py-2.5 text-xs tabular-nums text-muted-foreground xl:table-cell">{i.date ? i.date.slice(0, 7) : '—'}</td>}
                            {!narrow && (
                                <td className="hidden truncate px-3 py-2.5 text-xs text-muted-foreground md:table-cell">
                                    {i.url ? i.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : '—'}
                                </td>
                            )}
                            <td className="w-24 px-4 py-2.5 text-right md:px-6"><StatusDot published={i.published} /></td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

/* ------------------------------- editor --------------------------------- */

function RecordEditor({
    name, item, items, change, onChange, onClose, onRemove, onUpload,
}: {
    name: CollectionName;
    item: Item;
    items: Item[];
    change?: Change['kind'];
    onChange: (p: Partial<Item>) => void;
    onClose: () => void;
    onRemove: () => void;
    onUpload: (file: File) => Promise<string>;
}) {
    const cfg = COLLECTIONS[name];
    const { run } = useDeploy();
    const riding = !!run && run.keys.includes(item._k);
    const now = useNow(riding && run?.state !== 'landed');
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [railOpen, setRailOpen] = useState(true);
    const [view, setView] = useState<'write' | 'preview'>('write');
    const [newKey, setNewKey] = useState('');
    const [extraKeys, setExtraKeys] = useState<string[]>([]);
    const slug = slugify(item.name);
    const duplicate = !!slug && items.some((i) => i._k !== item._k && i.id === slug);
    const keys = useMemo(() => {
        const all = [...tagKeys(items), ...Object.keys(item.tags), ...extraKeys];
        if (all.length === 0) all.push(DEFAULT_TAG_KEY[name]);
        return [...new Set(all)];
    }, [items, item.tags, extraKeys, name]);

    const setKey = (key: string, values: string[]) => {
        const { [key]: _old, ...rest } = item.tags; // eslint-disable-line @typescript-eslint/no-unused-vars
        onChange({ tags: values.length ? { ...rest, [key]: values } : rest });
    };

    const addKey = () => {
        const k = newKey.trim();
        if (!k) return;
        if (!keys.some((x) => x.toLowerCase() === k.toLowerCase())) setExtraKeys((x) => [...x, k]);
        setNewKey('');
    };

    let status: React.ReactNode;
    if (change) {
        status = <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><ChangeMark kind={change} /> {change === 'added' ? 'New · not published yet' : 'Edited · not published yet'}</span>;
    } else if (riding && (run.state === 'running' || run.state === 'slow')) {
        status = <span className="flex items-center gap-1.5 text-sky-600 dark:text-sky-400"><Loader2 size={12} className="animate-spin" /> Publishing{run.state === 'running' ? ` · live in ~${clock(deployProgress(run, now).left)}` : '…'}</span>;
    } else if (riding && run.state === 'landed') {
        status = <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><Check size={12} /> Now live</span>;
    } else {
        status = <span className="flex items-center gap-1.5"><Check size={12} /> Matches the live site</span>;
    }

    const rail = (
        <div className="space-y-6 p-4">
            <Field label="Status">
                <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
                    <div>
                        <div className="text-sm">{item.published ? 'Published' : 'Draft'}</div>
                        <div className="text-[11px] text-muted-foreground">{item.published ? 'Shown on the site' : 'Hidden from the site'}</div>
                    </div>
                    <Switch checked={item.published} onCheckedChange={(v) => onChange({ published: v })} aria-label="Published" />
                </div>
            </Field>
            <Field label="Link">
                <div className="relative">
                    <Link2 size={13} className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 text-muted-foreground" />
                    <PasteInput type="url" value={item.url} onChange={(e) => onChange({ url: e.target.value })} placeholder="https://" className="h-8 pl-8 text-sm" transform={(t) => t.trim()} />
                </div>
            </Field>
            {name === 'projects' && (
                <Field label="Date">
                    <MonthPicker value={item.date || ''} onChange={(date) => onChange({ date })} />
                </Field>
            )}
            <div className="space-y-4">
                {keys.map((key) => (
                    <TagPicker key={key} label={key} singular={key.toLowerCase()} value={item.tags[key] || []} options={tagValues(items, key)} onChange={(v) => setKey(key, v)} />
                ))}
                <div className="flex items-center gap-1.5">
                    <PasteInput
                        value={newKey}
                        onChange={(e) => setNewKey(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKey(); } }}
                        placeholder="Add a tag kind (e.g. Status)…"
                        aria-label="New tag kind"
                        wrapperClassName="flex-1"
                        className="h-8 text-xs"
                    />
                </div>
            </div>
            <div className="border-t border-border/60 pt-4">
                {confirmDelete ? (
                    <div className="flex gap-2">
                        <Button size="sm" variant="destructive" onClick={onRemove} className="h-7 flex-1 gap-1 text-xs"><Trash2 size={12} /> Delete</Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)} className="h-7 text-xs">Keep</Button>
                    </div>
                ) : (
                    <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-600">
                        <Trash2 size={12} /> Delete {cfg.singular}
                    </button>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">Deleting stages like any edit; it leaves the site on the next publish.</p>
            </div>
        </div>
    );

    return (
        <div className="flex h-full flex-col">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-3 md:px-4">
                <div className="flex min-w-0 flex-1 items-center gap-2 truncate text-xs text-muted-foreground">{status}</div>
                <Segmented value={view} onChange={setView} options={[['write', 'Write'], ['preview', 'Preview']]} />
                {item.published && slug && !change && (
                    <a href={`${cfg.path}/${slug}/`} target="_blank" rel="noopener noreferrer" className="hidden items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground sm:flex" title="Open the live page">
                        <ExternalLink size={12} /> View
                    </a>
                )}
                <button type="button" onClick={() => setRailOpen((o) => !o)} className={cn('hidden rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:block', railOpen && 'bg-muted text-foreground')} title="Details panel" aria-label="Toggle details panel">
                    <Settings2 size={14} />
                </button>
                <button type="button" onClick={onClose} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Close (Esc)" aria-label="Close editor">
                    <X size={14} />
                </button>
            </div>

            {/* Phone: one scrolling column, details under the body. md+: writing surface and a side rail that scroll separately. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden" data-lenis-prevent>
                {view === 'preview' && <PagePreview name={name} item={item} />}
                <div className={cn('min-w-0 md:flex-1 md:overflow-y-auto', view === 'preview' && 'hidden')} data-lenis-prevent>
                    <div className="mx-auto max-w-3xl px-5 py-8 md:px-8 md:py-10">
                        <input
                            autoFocus={!item.name}
                            value={item.name}
                            onChange={(e) => onChange({ name: e.target.value })}
                            placeholder={`Untitled ${cfg.singular}`}
                            aria-label="Name"
                            className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/40 md:text-3xl"
                        />
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                            {cfg.path}/{slug || '…'}/
                            {duplicate && <span className="ml-2 text-red-600">already used by another {cfg.singular}</span>}
                        </div>
                        <textarea
                            value={item.description}
                            onChange={(e) => onChange({ description: e.target.value })}
                            placeholder="One or two lines for the list page and the share card…"
                            aria-label="Short description"
                            rows={1}
                            className="mt-5 w-full resize-none bg-transparent text-base text-muted-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground/40"
                        />
                        <div className="mt-6 border-t border-border/40 pt-6">
                            <MarkdownEditor
                                value={item.content || ''}
                                onChange={(content) => onChange({ content })}
                                onUpload={onUpload}
                                placeholder="Write the details page. Drop or paste an image to upload it."
                            />
                            <p className="mt-2 text-xs text-muted-foreground">Each image uploads as its own commit.</p>
                        </div>
                    </div>
                </div>
                {railOpen && (
                    <aside className={cn('shrink-0 border-t border-border/60 bg-muted/10 md:w-72 md:overflow-y-auto md:border-l md:border-t-0', view === 'preview' && 'hidden md:block')} data-lenis-prevent>
                        {rail}
                    </aside>
                )}
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            {children}
        </div>
    );
}

/** The detail page as it will look, rendered from the staged copy with the page's own component. */
function PagePreview({ name, item }: { name: CollectionName; item: Item }) {
    const cfg = COLLECTIONS[name];
    const path = `${cfg.path}/${slugify(item.name) || '…'}/`;
    return (
        <div className="flex min-h-[70vh] min-w-0 flex-1 flex-col bg-muted/30 md:min-h-0">
            <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border/60 bg-background px-3 text-xs">
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
            <div className="min-h-0 flex-1 md:overflow-y-auto" data-lenis-prevent>
                <article className="mx-auto max-w-3xl bg-background px-4 py-16">
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
        </div>
    );
}
