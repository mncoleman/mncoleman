'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Loader2, PenLine, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/admin-auth';
import { cn } from '@/lib/utils';
import type { PostSummary } from '@/lib/post-format';
import {
    AdminPage, Cell, ColumnHeader, DataList, DataRow, EmptyState, HeaderSpacer, ListFooter, ListSkeleton, NewButton, PageHeader, RowAction, RowTitle,
    SearchField, SegmentedFilter, StatusPill, STATUS_OPTIONS, entryPath, filterRows, useListKeyboard, type StatusFilter,
} from '@/components/admin/kit';

/** The editor reads this for its tag suggestions, so it needs no list fetch of its own. */
export const POST_TAGS_CACHE_KEY = 'mnc-post-tags';

interface Row extends PostSummary {
    sha: string;
    draft: { version: number; updatedAt: string } | null;
    /** The file exists but the parser rejects it; shown with the reason instead of being hidden. */
    error?: string;
}

/** Name | Date | Status | Copy link. Shared by the real list and its skeleton. */
const COLS = 'minmax(0,1fr) 150px 150px 32px';

function when(iso: string) {
    const t = new Date(iso);
    return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function PostsManager({ workerUrl }: { workerUrl: string }) {
    const [rows, setRows] = useState<Row[] | null>(null);
    const [error, setError] = useState('');
    const [draftsAvailable, setDraftsAvailable] = useState(true);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<StatusFilter>('all');
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const [total, setTotal] = useState(0);
    const [nextOffset, setNextOffset] = useState<number | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);

    /** Pages of 40 from the Worker; nothing is dropped, `Load more` fetches the rest. */
    const load = useCallback(async (offset = 0) => {
        setError('');
        if (offset > 0) setLoadingMore(true);
        try {
            const res = await fetch(`${workerUrl}/api/posts?offset=${offset}`, { headers: authHeaders(), credentials: 'include' });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `Could not load posts (${res.status})`);
            const page = json.posts as Row[];
            setRows((prev) => {
                const merged = offset > 0 ? [...(prev || []), ...page] : page;
                try { sessionStorage.setItem(POST_TAGS_CACHE_KEY, JSON.stringify([...new Set(merged.flatMap((p) => p.tags))])); } catch { /* optional */ }
                return merged.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
            });
            setTotal(json.total ?? page.length);
            setNextOffset(json.nextOffset ?? null);
            setDraftsAvailable(json.draftsAvailable !== false);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Could not load posts');
        } finally {
            setLoadingMore(false);
        }
    }, [workerUrl]);

    useEffect(() => { void load(); }, [load]);

    const visible = useMemo(
        () => filterRows(rows || [], { query, status: filter, published: (r) => r.published, fields: (r) => [r.title, r.excerpt, r.slug, ...r.tags] }),
        [rows, query, filter],
    );
    useListKeyboard({ searchRef, listRef });

    return (
        <AdminPage>
            <PageHeader title="Posts">
                <SearchField ref={searchRef} value={query} onChange={setQuery} placeholder="Search posts…" />
                <SegmentedFilter label="Show" value={filter} onChange={setFilter} options={STATUS_OPTIONS} />
                <HeaderSpacer />
                <NewButton href="/admin/posts/edit">New post</NewButton>
            </PageHeader>

            {!draftsAvailable && (
                <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    Saving drafts online is not set up yet. You can still publish, but your edits are only kept in this browser until you do.
                </div>
            )}

            {error ? (
                <EmptyState title="Could not load posts" body={<span className="text-red-600">{error}</span>} action={<Button size="sm" variant="outline" onClick={() => void load(0)} className="gap-1.5"><RefreshCw size={13} /> Try again</Button>} />
            ) : rows === null ? (
                <ListSkeleton cols={COLS} />
            ) : visible.length === 0 ? (
                <EmptyState
                    icon={<PenLine size={20} />}
                    title={rows.length === 0 ? 'No posts yet' : 'Nothing matches'}
                    body={rows.length === 0 ? 'Write your first one with New post.' : 'Try a different search or filter.'}
                />
            ) : (
                <div ref={listRef}>
                    <DataList cols={COLS} label="Posts">
                        <ColumnHeader labels={['Title', 'Date', 'Status', '']} />
                        {visible.map((r) => (
                            <DataRow key={r.slug} label={r.title || 'Untitled'} href={`/admin/posts/edit?slug=${encodeURIComponent(r.slug)}`}>
                                <RowTitle
                                    title={r.title || <span className="text-muted-foreground">Untitled</span>}
                                    badges={<>
                                        {r.error && <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-px text-[11px] font-normal text-red-600 dark:text-red-400">Can’t be read</span>}
                                        {r.featured && <span className="shrink-0 rounded bg-muted px-1.5 py-px text-[11px] font-normal text-muted-foreground">Featured</span>}
                                    </>}
                                    subtitle={r.error || `/blog/${r.slug}/`}
                                    subtitleTitle={r.error}
                                    subtitleClassName={cn(r.error && 'text-red-600')}
                                />
                                <Cell className="tabular-nums">{when(r.date)}</Cell>
                                <Cell className="flex-col !items-start gap-1">
                                    <StatusPill published={r.published} />
                                    {r.draft && r.sha && <span className="text-[11px] text-amber-700 dark:text-amber-400">Changes not published yet</span>}
                                </Cell>
                                <Cell end>
                                    {!r.error && <RowAction path={entryPath('blog', r.slug)} state={{ live: r.published }} />}
                                </Cell>
                            </DataRow>
                        ))}
                    </DataList>
                </div>
            )}
            {rows && rows.length > 0 && (
                <ListFooter
                    shown={visible.length}
                    loaded={rows.length}
                    total={total}
                    note={(query || filter !== 'all') && nextOffset !== null ? 'Search and filters only look at the posts shown here' : undefined}
                >
                    {nextOffset !== null && (
                        <Button size="sm" variant="outline" disabled={loadingMore} onClick={() => void load(nextOffset)} className="h-7 gap-1.5 text-xs">
                            {loadingMore && <Loader2 size={12} className="animate-spin" />} Load more
                        </Button>
                    )}
                </ListFooter>
            )}
        </AdminPage>
    );
}
