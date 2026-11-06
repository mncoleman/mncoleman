'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Lock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canUse, type AdminUser } from '@/components/admin/admin-context';
import {
    AdminPage, Cell, ColumnHeader, DataList, DataRow, EmptyState, HeaderSpacer, ListFooter, ListSkeleton, NewButton, PageHeader, RowAction, RowTitle,
    SearchField, SegmentedFilter, SelectMenu, StatusPill, useListKeyboard,
} from '@/components/admin/kit';
import {
    copyTarget, detailHref, filterArtifacts, isDynamic, relativeTime, type TypeFilter, type VisibilityFilter,
} from '@/components/admin/artifacts/artifact-logic';
import { formatFileSize, typeLabel, useArtifacts } from '@/components/admin/artifacts/shared';

/**
 * Artifacts list, on the same kit as Posts: name (with its /a/slug address and a lock when private),
 * Type (Instant or Static), Visibility, Updated, and a per-row Copy link. A row opens the full-page
 * detail (`/admin/artifacts/edit?slug=` or `?file=`); Upload artifact opens the same route with no key.
 *
 * Two kinds live side by side: instant artifacts on the artifact service (live the moment they save) and
 * static ones committed to the site (live after a build). Access: editors without the Artifacts feature see
 * only their granted instant artifacts, with no upload, no static list and no Type filter. The service enforces all of it.
 */

const COLS = 'minmax(0,1fr) 130px 120px 130px 32px';
const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'dynamic', label: 'Instant' },
    { value: 'static', label: 'Static' },
];
const VISIBILITY_OPTIONS = [
    { value: 'all', label: 'Any visibility' },
    { value: 'public', label: 'Public' },
    { value: 'private', label: 'Private' },
];

export function ArtifactUploader({ workerUrl, user }: { workerUrl: string; user: AdminUser }) {
    const fullAccess = canUse(user, 'artifacts');
    const api = workerUrl.replace(/\/$/, '');
    const router = useRouter();
    const { artifacts, loading, error, reload } = useArtifacts(api, fullAccess);
    const [query, setQuery] = useState('');
    const [type, setType] = useState<TypeFilter>('all');
    const [visibility, setVisibility] = useState<VisibilityFilter>('all');
    const searchRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const visible = useMemo(() => filterArtifacts(artifacts, { query, type, visibility }), [artifacts, query, type, visibility]);
    const upload = () => router.push('/admin/artifacts/edit');
    useListKeyboard({ searchRef, listRef, onNew: fullAccess ? upload : undefined, enabled: !loading });
    const clear = () => { setQuery(''); setType('all'); setVisibility('all'); };

    return (
        <AdminPage>
            <PageHeader title="Artifacts">
                <SearchField ref={searchRef} value={query} onChange={setQuery} placeholder="Search artifacts…" />
                {fullAccess && <SegmentedFilter label="Type" value={type} onChange={setType} options={TYPE_OPTIONS} />}
                <SelectMenu label="Visibility" value={visibility} onChange={(v) => setVisibility(v as VisibilityFilter)} options={VISIBILITY_OPTIONS} />
                <HeaderSpacer />
                {fullAccess && <NewButton onClick={upload} title="Upload artifact (N)">Upload artifact</NewButton>}
            </PageHeader>

            {error && artifacts.length === 0 ? (
                <EmptyState title="Could not load artifacts" body={<span className="text-red-600">{error}</span>} action={<Button size="sm" variant="outline" onClick={() => void reload()} className="gap-1.5"><RefreshCw size={13} /> Try again</Button>} />
            ) : loading && artifacts.length === 0 ? (
                <ListSkeleton cols={COLS} />
            ) : visible.length === 0 ? (
                <EmptyState
                    icon={<FileUp size={20} />}
                    title={artifacts.length === 0 ? 'No artifacts yet' : 'Nothing matches'}
                    body={artifacts.length === 0 ? (fullAccess ? 'Share your first page with Upload artifact.' : 'No artifacts have been shared with you yet.') : 'Try a different search or filter.'}
                    action={artifacts.length > 0 ? <Button size="sm" variant="outline" onClick={clear}>Clear filters</Button> : undefined}
                />
            ) : (
                <div ref={listRef}>
                    <DataList cols={COLS} label="Artifacts">
                        <ColumnHeader labels={['Name', 'Type', 'Visibility', 'Updated', '']} />
                        {visible.map((a) => {
                            const priv = a.visibility === 'private';
                            const copy = copyTarget(a);
                            return (
                                <DataRow key={a.id} href={detailHref(a)} label={`Open ${a.name}`}>
                                    <RowTitle
                                        title={<span className="inline-flex min-w-0 items-center gap-1.5">{priv && <Lock size={13} aria-label="Private" className="shrink-0 text-amber-600 dark:text-amber-400" />}<span className="truncate">{a.name}</span></span>}
                                        subtitle={[isDynamic(a) ? `/a/${a.slug}` : a.filename, a.description].filter(Boolean).join(' · ')}
                                    />
                                    <Cell className="flex-col !items-start gap-1"><StatusPill tone={isDynamic(a) ? 'info' : 'neutral'}>{isDynamic(a) ? 'Instant' : 'Static'}</StatusPill><span className="text-[11px]">{typeLabel(a)} · {formatFileSize(a.size)}</span></Cell>
                                    <Cell><StatusPill tone={priv ? 'warn' : 'ok'}>{priv ? 'Private' : 'Public'}</StatusPill></Cell>
                                    <Cell className="tabular-nums">{relativeTime(a.uploadedAt)}</Cell>
                                    <Cell end><RowAction path={copy.path} state={copy.state} /></Cell>
                                </DataRow>
                            );
                        })}
                    </DataList>
                </div>
            )}
            {!loading && artifacts.length > 0 && <ListFooter shown={visible.length} loaded={artifacts.length} />}
        </AdminPage>
    );
}
