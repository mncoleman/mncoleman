'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Circle, Loader2, Plus, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/admin-auth';
import { cn } from '@/lib/utils';
import type { PostSummary } from '@/lib/post-format';

/** The editor reads this for its tag suggestions, so it needs no list fetch of its own. */
export const POST_TAGS_CACHE_KEY = 'mnc-post-tags';

interface Row extends PostSummary {
    sha: string;
    draft: { version: number; updatedAt: string } | null;
    /** The file exists but the parser rejects it; shown with the reason instead of being hidden. */
    error?: string;
}

type Filter = 'all' | 'live' | 'draft';

function when(iso: string) {
    const t = new Date(iso);
    return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function PostsManager({ workerUrl }: { workerUrl: string }) {
    const [rows, setRows] = useState<Row[] | null>(null);
    const [error, setError] = useState('');
    const [draftsAvailable, setDraftsAvailable] = useState(true);
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<Filter>('all');

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

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (rows || []).filter((r) => {
            if (filter === 'live' && !r.published) return false;
            if (filter === 'draft' && r.published) return false;
            return !q || [r.title, r.excerpt, r.slug, ...r.tags].join('\n').toLowerCase().includes(q);
        });
    }, [rows, query, filter]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <h1 className="mr-2 text-lg font-semibold tracking-tight">Posts</h1>
                <div className="relative min-w-[10rem] flex-1">
                    <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search posts…"
                        aria-label="Search posts"
                        className="h-8 w-full rounded-md border border-border/60 bg-transparent pl-8 pr-2 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/40"
                    />
                </div>
                <div className="flex h-8 items-center rounded-md border border-border/60 p-0.5">
                    {([['all', 'All'], ['live', 'Live'], ['draft', 'Drafts']] as [Filter, string][]).map(([v, label]) => (
                        <button key={v} type="button" onClick={() => setFilter(v)} aria-pressed={filter === v}
                            className={cn('h-full rounded px-2 text-xs transition-colors', filter === v ? 'bg-foreground/[0.08] font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}>
                            {label}
                        </button>
                    ))}
                </div>
                <Button size="sm" asChild className="h-8 gap-1.5">
                    <Link href="/admin/posts/edit"><Plus size={14} /> New post</Link>
                </Button>
            </div>

            {!draftsAvailable && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    Draft storage is not set up on the Worker (no POST_DRAFTS KV binding). You can still publish, but autosave to the server is off; edits are kept in this browser only.
                </div>
            )}

            {error ? (
                <div className="flex flex-col items-center gap-3 py-16 text-sm">
                    <p className="text-red-600">{error}</p>
                    <Button size="sm" variant="outline" onClick={() => void load(0)} className="gap-1.5"><RefreshCw size={13} /> Try again</Button>
                </div>
            ) : rows === null ? (
                <div className="flex justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : visible.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">{rows.length === 0 ? 'No posts yet.' : 'Nothing matches.'}</div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-border/60">
                    <table className="w-full table-fixed text-sm">
                        <thead className="bg-muted/30 text-left text-xs text-muted-foreground">
                            <tr className="border-b border-border/60">
                                <th className="px-4 py-2 font-medium">Title</th>
                                <th className="hidden w-32 px-3 py-2 font-medium sm:table-cell">Date</th>
                                <th className="w-36 px-4 py-2 text-right font-medium">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((r) => (
                                <tr key={r.slug} className="border-b border-border/40 last:border-b-0 hover:bg-muted/40">
                                    <td className="px-4 py-2.5">
                                        <Link href={`/admin/posts/edit?slug=${encodeURIComponent(r.slug)}`} className="block min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="truncate font-medium">{r.title || <span className="text-muted-foreground">Untitled</span>}</span>
                                                {r.error && <span className="shrink-0 rounded border border-red-500/40 px-1 text-[10px] uppercase tracking-wider text-red-600">Invalid file</span>}
                                                {r.featured && <span className="shrink-0 rounded border border-border/60 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">Featured</span>}
                                            </div>
                                            <div className={cn('mt-0.5 truncate text-xs', r.error ? 'text-red-600' : 'text-muted-foreground')} title={r.error}>{r.error || `/blog/${r.slug}/`}</div>
                                        </Link>
                                    </td>
                                    <td className="hidden px-3 py-2.5 text-xs tabular-nums text-muted-foreground sm:table-cell">{when(r.date)}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-xs', r.published ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                                            <Circle size={7} className={r.published ? 'fill-current' : ''} />
                                            {r.published ? 'Live' : r.sha ? 'Hidden' : 'Draft'}
                                        </span>
                                        {r.draft && r.sha && <div className="text-[11px] text-amber-700 dark:text-amber-400">unpublished edits</div>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {rows && rows.length > 0 && (
                <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
                    <span>Showing {rows.length} of {total}{(query || filter !== 'all') && ' (search and filters only cover what is loaded)'}</span>
                    {nextOffset !== null && (
                        <Button size="sm" variant="outline" disabled={loadingMore} onClick={() => void load(nextOffset)} className="h-7 gap-1.5 text-xs">
                            {loadingMore && <Loader2 size={12} className="animate-spin" />} Load more
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}
