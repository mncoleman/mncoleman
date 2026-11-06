'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Library, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    AdminPage, Cell, ColumnHeader, DataList, DataRow, EmptyState, HeaderSpacer, ListFooter, ListSkeleton, NewButton, PageHeader, RowAction, RowTitle,
    SearchField, SegmentedFilter, StatusPill, useListKeyboard,
} from '@/components/admin/kit';
import { relativeTime } from '@/components/admin/artifacts/artifact-logic';
import { KIND_OPTIONS, filterLibrary, type KindFilter } from '@/components/admin/library/library-logic';
import { useLibrary } from '@/components/admin/library/use-library';

/**
 * AI Library list: prompts and skills together, with a Prompts / Skills filter, search, and Copy link (the item's
 * public page on the artifact service). A row opens the full-page editor (`/admin/library/edit?slug=`).
 * Nothing is staged: items are live as soon as they are created or saved.
 */

const COLS = 'minmax(0,1fr) 110px 130px 32px';

export function LibraryManager() {
    const router = useRouter();
    const { items, loading, error, reload } = useLibrary();
    const [query, setQuery] = useState('');
    const [kind, setKind] = useState<KindFilter>('all');
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const visible = useMemo(() => filterLibrary(items, { query, kind }), [items, query, kind]);
    const create = () => router.push('/admin/library/edit');
    useListKeyboard({ searchRef, listRef, onNew: create, enabled: !loading });

    return (
        <AdminPage>
            <PageHeader title="AI Library">
                <SearchField ref={searchRef} value={query} onChange={setQuery} placeholder="Search prompts and skills…" />
                <SegmentedFilter label="Show" value={kind} onChange={setKind} options={KIND_OPTIONS} />
                <HeaderSpacer />
                <NewButton onClick={create} title="New item (N)">New item</NewButton>
            </PageHeader>

            {error && items.length === 0 ? (
                <EmptyState title="Could not load the library" body={<span className="text-red-600">{error}</span>} action={<Button size="sm" variant="outline" onClick={() => void reload()} className="gap-1.5"><RefreshCw size={13} /> Try again</Button>} />
            ) : loading && items.length === 0 ? (
                <ListSkeleton cols={COLS} />
            ) : visible.length === 0 ? (
                <EmptyState
                    icon={<Library size={20} />}
                    title={items.length === 0 ? 'Nothing published yet' : 'Nothing matches'}
                    body={items.length === 0 ? 'Add your first prompt or skill with New item.' : 'Try a different search or filter.'}
                    action={items.length > 0 ? <Button size="sm" variant="outline" onClick={() => { setQuery(''); setKind('all'); }}>Clear filters</Button> : undefined}
                />
            ) : (
                <div ref={listRef}>
                    <DataList cols={COLS} label="Prompts and skills">
                        <ColumnHeader labels={['Name', 'Type', 'Updated', '']} />
                        {visible.map((i) => (
                            <DataRow key={i.slug} href={`/admin/library/edit?slug=${encodeURIComponent(i.slug)}`} label={`Open ${i.name}`}>
                                <RowTitle title={i.name} subtitle={i.description || i.url.replace(/^https?:\/\//, '')} />
                                <Cell><StatusPill tone={i.kind === 'skill' ? 'violet' : 'info'}>{i.kind === 'skill' ? 'Skill' : 'Prompt'}</StatusPill></Cell>
                                <Cell className="tabular-nums">{relativeTime(i.updatedAt || i.createdAt)}</Cell>
                                <Cell end><RowAction path={i.url} state={{ live: true }} /></Cell>
                            </DataRow>
                        ))}
                    </DataList>
                </div>
            )}
            {!loading && items.length > 0 && <ListFooter shown={visible.length} loaded={items.length} />}
        </AdminPage>
    );
}
