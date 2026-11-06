'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BookMarked, FolderKanban, RefreshCw, Tags as TagsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { slugify } from '@/lib/utils';
import { flattenTags } from '@/lib/tags';
import { TagManager } from '@/components/admin/TagManager';
import { COLLECTIONS, editHref, useContent, type CollectionName, type Item } from '@/components/admin/content-store';
import {
    AdminPage, Cell, ChipRow, ColumnHeader, DataList, DataRow, EmptyState, HeaderSpacer, ListFooter, ListSkeleton, NewButton, PageHeader, RowAction,
    RowTitle, SearchField, SegmentedFilter, SelectMenu, StatusPill, STATUS_OPTIONS, entryPath, filterRows, useListKeyboard, type StatusFilter,
} from '@/components/admin/kit';

/**
 * Projects and Resources list: the same page as Posts (header with search, filters and one primary
 * action; bordered list; quiet footer), over the staged copy in content-store. A row opens the
 * full-page editor (`/admin/<name>/edit?id=`); Copy link never opens it. Edits made in the editor are
 * already staged here, so the list shows which records have unpublished changes.
 */

/** Name | Tags | Date | Status | Copy link (projects), without Date for resources. Shared with the skeleton. */
const COLS: Record<CollectionName, string> = {
    projects: 'minmax(0,1fr) minmax(0,210px) 130px 150px 32px',
    resources: 'minmax(0,1fr) minmax(0,210px) 150px 32px',
};

function monthLabel(date?: string) {
    const m = date?.match(/^(\d{4})-(\d{2})/);
    if (!m) return '';
    return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

export function CollectionList({ name }: { name: CollectionName }) {
    const cfg = COLLECTIONS[name];
    const router = useRouter();
    const content = useContent();
    const { status, items, base, error } = content.state[name];
    const changes = content.changes[name];
    const changed = useMemo(() => new Map(changes.map((c) => [c.item._k, c.kind])), [changes]);
    const baseById = useMemo(() => new Map(base.map((b) => [b._k, b])), [base]);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<StatusFilter>('all');
    const [tagChoice, setTag] = useState('');
    const [showTags, setShowTags] = useState(false);
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const allTags = useMemo(() => [...new Set(items.flatMap((i) => flattenTags(i.tags)))].sort((a, b) => a.localeCompare(b)), [items]);

    const { ensureLoaded } = content;
    useEffect(() => { ensureLoaded(name); }, [name, ensureLoaded]);
    // A tag that no record uses any more (renamed in the tag dialog) must not leave the list empty behind a hidden filter.
    const tag = allTags.includes(tagChoice) ? tagChoice : '';

    const visible = useMemo(
        () => filterRows<Item>(items, {
            query, status: filter, published: (i) => i.published,
            fields: (i) => [i.name, i.description, i.url, i.content, ...flattenTags(i.tags)],
            extra: tag ? (i) => flattenTags(i.tags).includes(tag) : undefined,
        }),
        [items, query, filter, tag],
    );

    const create = () => router.push(editHref(name, content.create(name)));
    useListKeyboard({ searchRef, listRef, onNew: create, enabled: status === 'ready' });

    const loading = status !== 'ready' && items.length === 0;
    const cols = COLS[name];
    const Icon = name === 'projects' ? FolderKanban : BookMarked;

    return (
        <AdminPage>
            <PageHeader title={cfg.label}>
                <SearchField ref={searchRef} value={query} onChange={setQuery} placeholder={`Search ${cfg.label.toLowerCase()}…`} />
                <SegmentedFilter label="Show" value={filter} onChange={setFilter} options={STATUS_OPTIONS} />
                <SelectMenu
                    label="Tag"
                    value={tag}
                    onChange={setTag}
                    searchPlaceholder="Search tags…"
                    options={[{ value: '', label: 'All tags' }, ...allTags.map((t) => ({ value: t, label: t }))]}
                />
                <Button variant="outline" onClick={() => setShowTags(true)} className="h-10 w-10 shrink-0 rounded-lg p-0 text-muted-foreground" title="Manage tags" aria-label="Manage tags">
                    <TagsIcon size={16} />
                </Button>
                <HeaderSpacer />
                <NewButton onClick={status === 'ready' ? create : undefined} disabled={status !== 'ready'} title={`New ${cfg.singular} (N)`}>New {cfg.singular}</NewButton>
            </PageHeader>

            {status === 'error' && items.length === 0 ? (
                <EmptyState title={`Could not load ${cfg.label.toLowerCase()}`} body={<span className="text-red-600">{error}</span>} action={<Button size="sm" variant="outline" onClick={() => content.reload(name)} className="gap-1.5"><RefreshCw size={13} /> Try again</Button>} />
            ) : loading ? (
                <ListSkeleton cols={cols} />
            ) : visible.length === 0 ? (
                <EmptyState
                    icon={<Icon size={20} />}
                    title={items.length === 0 ? `No ${cfg.label.toLowerCase()} yet` : 'Nothing matches'}
                    body={items.length === 0 ? `Add your first one with New ${cfg.singular}.` : 'Try a different search or filter.'}
                    action={items.length > 0 ? <Button size="sm" variant="outline" onClick={() => { setQuery(''); setFilter('all'); setTag(''); }}>Clear filters</Button> : undefined}
                />
            ) : (
                <div ref={listRef}>
                    <DataList cols={cols} label={cfg.label}>
                        <ColumnHeader labels={name === 'projects' ? ['Name', 'Tags', 'Date', 'Status', ''] : ['Name', 'Tags', 'Status', '']} />
                        {visible.map((i) => {
                            const kind = changed.get(i._k);
                            const slug = slugify(i.name);
                            // The page is live only if the site already has it published at this address (not new, not renamed since).
                            // What matters is the LIVE site: a published record staged back to Draft still has a working link until you publish.
                            const was = baseById.get(i._k);
                            const live = kind !== 'added' && !!was?.published && was.id === i.id;
                            return (
                                <DataRow key={i._k} label={i.name || `Untitled ${cfg.singular}`} href={editHref(name, i._k)}>
                                    <RowTitle
                                        title={i.name || <span className="text-muted-foreground">Untitled</span>}
                                        subtitle={i.description || (i.url ? i.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '') : slug ? `${cfg.path}/${slug}/` : undefined)}
                                    />
                                    <Cell><ChipRow tags={flattenTags(i.tags)} /></Cell>
                                    {name === 'projects' && <Cell className="tabular-nums">{monthLabel(i.date)}</Cell>}
                                    <Cell className="flex-col !items-start gap-1">
                                        <StatusPill published={i.published} />
                                        {kind && <span className="text-[11px] text-amber-700 dark:text-amber-400">{kind === 'added' ? 'New, not published yet' : 'Changes not published yet'}</span>}
                                    </Cell>
                                    <Cell end>
                                        {slug && <RowAction path={entryPath(cfg.path.slice(1), slug)} state={{ live }} />}
                                    </Cell>
                                </DataRow>
                            );
                        })}
                    </DataList>
                </div>
            )}
            {status === 'ready' && items.length > 0 && <ListFooter shown={visible.length} loaded={items.length} />}

            <Dialog open={showTags} onOpenChange={setShowTags}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>Tags</DialogTitle>
                        <DialogDescription>Rename or delete a kind or a value across every {cfg.singular}. Add new ones from a {cfg.singular}&apos;s properties. Changes stay unpublished until you publish.</DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto" data-lenis-prevent>
                        <TagManager items={items} onChange={(rewrite) => content.rewriteTags(name, rewrite)} />
                    </div>
                </DialogContent>
            </Dialog>
        </AdminPage>
    );
}
