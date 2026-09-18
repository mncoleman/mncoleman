'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { AlertTriangle, Check, ExternalLink, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { authHeaders } from '@/lib/admin-auth';
import { cn, slugify } from '@/lib/utils';

/**
 * Editor for the two JSON-backed collections, `data/resources.json` and
 * `data/projects.json`. Each save writes the whole file back through the Worker
 * as one commit, which the Pages Git integration then builds — so an edit is
 * live a few minutes later, and there is no Notion in the loop.
 *
 * The Worker returns the file's git sha with the items and requires it back on
 * save; a 409 means the file moved underneath us (another admin, or a build
 * committing to main) and the only safe move is to reload.
 */

type CollectionName = 'resources' | 'projects';

interface ResourceItem {
    id: string;
    name: string;
    url: string;
    categories: string[];
    description: string;
    published: boolean;
    content?: string;
}

interface ProjectItem {
    id: string;
    name: string;
    description: string;
    url: string;
    tech: string[];
    date: string;
    published: boolean;
    content?: string;
}

type Item = ResourceItem | ProjectItem;

const COLLECTIONS: Record<CollectionName, { label: string; singular: string; tagsField: 'categories' | 'tech'; tagsLabel: string; path: string }> = {
    resources: { label: 'Resources', singular: 'resource', tagsField: 'categories', tagsLabel: 'Categories', path: '/resources' },
    projects: { label: 'Projects', singular: 'project', tagsField: 'tech', tagsLabel: 'Tech', path: '/projects' },
};

function emptyItem(name: CollectionName): Item {
    if (name === 'resources') {
        return { id: '', name: '', url: '', categories: [], description: '', published: false, content: '' };
    }
    return { id: '', name: '', description: '', url: '', tech: [], date: '', published: false, content: '' };
}

function tagsOf(item: Item, field: 'categories' | 'tech'): string[] {
    const v = (item as unknown as Record<string, unknown>)[field];
    return Array.isArray(v) ? (v as string[]) : [];
}

function ItemForm({
    collection,
    initial,
    existingIds,
    onSave,
    onCancel,
}: {
    collection: CollectionName;
    initial: Item;
    existingIds: string[];
    onSave: (item: Item) => void;
    onCancel: () => void;
}) {
    const cfg = COLLECTIONS[collection];
    const [draft, setDraft] = useState<Item>(initial);
    const [tagsText, setTagsText] = useState(tagsOf(initial, cfg.tagsField).join(', '));

    const set = (patch: Partial<ResourceItem & ProjectItem>) => setDraft((d) => ({ ...d, ...patch }) as Item);

    // The slug is the details-page URL, so it follows the name until the record
    // has been saved once; after that renaming keeps the old URL working.
    const slug = initial.id || slugify(draft.name);
    const duplicate = !initial.id && existingIds.includes(slug);
    const valid = draft.name.trim().length > 0 && !duplicate;

    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault();
                if (!valid) return;
                const tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean);
                onSave({ ...draft, id: slug, [cfg.tagsField]: tags } as Item);
            }}
        >
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="name">Name</Label>
                    <Input id="name" value={draft.name} onChange={(e) => set({ name: e.target.value })} required />
                    <p className="text-xs text-muted-foreground">
                        URL: {cfg.path}/{slug || '…'}/
                        {duplicate && <span className="ml-2 text-red-600">— already used by another {cfg.singular}</span>}
                    </p>
                </div>
                <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="url">Link</Label>
                    <Input id="url" type="url" value={draft.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" />
                </div>
                <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="description">Short description</Label>
                    <Textarea id="description" rows={2} value={draft.description} onChange={(e) => set({ description: e.target.value })} />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="tags">{cfg.tagsLabel}</Label>
                    <Input id="tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="Comma-separated" />
                </div>
                {collection === 'projects' && (
                    <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <Input
                            id="date"
                            type="month"
                            value={(draft as ProjectItem).date?.slice(0, 7) || ''}
                            onChange={(e) => set({ date: e.target.value ? `${e.target.value}-01` : '' })}
                        />
                    </div>
                )}
                <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="content">Details page body (Markdown, optional)</Label>
                    <Textarea
                        id="content"
                        rows={10}
                        className="font-mono text-xs"
                        value={draft.content || ''}
                        onChange={(e) => set({ content: e.target.value })}
                    />
                </div>
                <div className="flex items-center gap-3 sm:col-span-2">
                    <Switch id="published" checked={draft.published} onCheckedChange={(v) => set({ published: v })} />
                    <Label htmlFor="published">Published</Label>
                </div>
            </div>
            <div className="flex gap-2">
                <Button type="submit" disabled={!valid} className="gap-2">
                    <Check size={14} /> Done
                </Button>
                <Button type="button" variant="outline" onClick={onCancel} className="gap-2">
                    <X size={14} /> Cancel
                </Button>
            </div>
        </form>
    );
}

export function CollectionManager({ workerUrl }: { workerUrl: string }) {
    const [collection, setCollection] = useState<CollectionName>('resources');
    const [items, setItems] = useState<Item[] | null>(null);
    const [sha, setSha] = useState<string>('');
    const [dirty, setDirty] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState<number | 'new' | null>(null);
    const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
    const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

    const cfg = COLLECTIONS[collection];

    const load = useCallback(async (name: CollectionName) => {
        setLoading(true);
        setMessage(null);
        setEditing(null);
        setConfirmDelete(null);
        try {
            const res = await fetch(`${workerUrl}/api/collections/${name}`, { headers: authHeaders(), credentials: 'include' });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
            setItems(json.items);
            setSha(json.sha);
            setDirty(false);
        } catch (e: unknown) {
            setItems(null);
            setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Could not load' });
        } finally {
            setLoading(false);
        }
    }, [workerUrl]);

    useEffect(() => {
        load(collection);
    }, [collection, load]);

    const save = async () => {
        if (!items) return;
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`${workerUrl}/api/collections/${collection}`, {
                method: 'PUT',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'include',
                body: JSON.stringify({ items, sha, message: `Update ${collection} via admin panel` }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || json.error || `Save failed (${res.status})`);
            setSha(json.sha);
            setDirty(false);
            setMessage({ kind: 'ok', text: 'Saved. The site rebuilds from this commit and updates in a few minutes.' });
        } catch (e: unknown) {
            setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'Save failed' });
        } finally {
            setSaving(false);
        }
    };

    const existingIds = useMemo(() => (items || []).map((i) => i.id), [items]);

    const applyEdit = (index: number | 'new', item: Item) => {
        setItems((prev) => {
            const next = [...(prev || [])];
            if (index === 'new') next.unshift(item);
            else next[index] = item;
            return next;
        });
        setDirty(true);
        setEditing(null);
    };

    const remove = (index: number) => {
        setItems((prev) => (prev || []).filter((_, i) => i !== index));
        setDirty(true);
        setConfirmDelete(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1 rounded-md border border-border/50 p-1">
                    {(Object.keys(COLLECTIONS) as CollectionName[]).map((name) => (
                        <button
                            key={name}
                            type="button"
                            onClick={() => {
                                if (dirty && !window.confirm('Discard unsaved changes?')) return;
                                setCollection(name);
                            }}
                            className={cn(
                                'rounded px-3 py-1 text-sm transition-colors',
                                collection === name ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {COLLECTIONS[name].label}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => load(collection)} disabled={loading || saving} className="gap-2">
                        <RefreshCw size={14} /> Reload
                    </Button>
                    <Button size="sm" onClick={() => setEditing('new')} disabled={loading || editing !== null} className="gap-2">
                        <Plus size={14} /> New {cfg.singular}
                    </Button>
                    <Button size="sm" onClick={save} disabled={!dirty || saving || editing !== null} className="gap-2">
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                        Save &amp; publish
                    </Button>
                </div>
            </div>

            {message && (
                <div
                    className={cn(
                        'rounded-md border p-3 text-sm',
                        message.kind === 'ok'
                            ? 'border-green-500/20 bg-green-500/10 text-green-600'
                            : 'border-red-500/20 bg-red-500/10 text-red-600'
                    )}
                >
                    {message.text}
                </div>
            )}

            {dirty && editing === null && (
                <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
                    <AlertTriangle size={16} /> Unsaved changes. Nothing reaches the site until you save.
                </div>
            )}

            {editing === 'new' && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">New {cfg.singular}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ItemForm
                            collection={collection}
                            initial={emptyItem(collection)}
                            existingIds={existingIds}
                            onSave={(item) => applyEdit('new', item)}
                            onCancel={() => setEditing(null)}
                        />
                    </CardContent>
                </Card>
            )}

            {loading && !items && (
                <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {items && (
                <div className="space-y-3">
                    {items.length === 0 && (
                        <p className="text-sm text-muted-foreground">No {collection} yet.</p>
                    )}
                    {items.map((item, index) => (
                        <Card key={item.id || index} className={cn(!item.published && 'opacity-70')}>
                            {editing === index ? (
                                <CardContent className="pt-6">
                                    <ItemForm
                                        collection={collection}
                                        initial={item}
                                        existingIds={existingIds.filter((id) => id !== item.id)}
                                        onSave={(next) => applyEdit(index, next)}
                                        onCancel={() => setEditing(null)}
                                    />
                                </CardContent>
                            ) : (
                                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                                    <div className="min-w-0">
                                        <CardTitle className="flex items-center gap-2 text-base">
                                            <span className="truncate">{item.name}</span>
                                            {!item.published && (
                                                <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                                                    draft
                                                </span>
                                            )}
                                            {item.url && (
                                                <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground" aria-label="Open link">
                                                    <ExternalLink size={14} />
                                                </a>
                                            )}
                                        </CardTitle>
                                        <CardDescription className="mt-1 line-clamp-2">{item.description}</CardDescription>
                                        {tagsOf(item, cfg.tagsField).length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {tagsOf(item, cfg.tagsField).map((t) => (
                                                    <span key={t} className="rounded-full border border-border bg-accent px-2 py-0.5 text-[10px] text-accent-foreground">
                                                        {t}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1">
                                        {confirmDelete === index ? (
                                            <>
                                                <Button size="sm" variant="destructive" onClick={() => remove(index)} className="gap-1">
                                                    <Trash2 size={14} /> Delete
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(null)}>
                                                    Keep
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <Button size="sm" variant="outline" onClick={() => setEditing(index)} disabled={editing !== null} aria-label="Edit">
                                                    <Pencil size={14} />
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(index)} disabled={editing !== null} aria-label="Delete">
                                                    <Trash2 size={14} />
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </CardHeader>
                            )}
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}
