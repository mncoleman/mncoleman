'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookMarked, FileUp, FolderKanban, Library, Loader2, PenLine, RefreshCw, Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/admin-auth';
import { useAdmin, canUse, canSeeArtifacts } from '@/components/admin/admin-context';
import { COLLECTIONS, editHref, useContent, type CollectionName } from '@/components/admin/content-store';
import { ago, useDeploy, useNow } from '@/components/admin/deploy-status';
import { useRebuild } from '@/components/admin/use-rebuild';
import { AdminPage, HeaderSpacer, NewButton, PageHeader, Section, SectionRow, StatGrid, StatTile, StatusPill } from '@/components/admin/kit';
import { relativeTime } from '@/components/admin/artifacts/artifact-logic';
import { McpConnections } from '@/components/admin/McpConnections';
import type { PostSummary } from '@/lib/post-format';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function greeting(hour: number) {
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/** Pages of posts read for "Recent posts" (40 each). The list is alphabetical, so the newest are found by reading them all and sorting. */
const RECENT_PAGES = 5;

/** The newest few posts by date. Quiet on failure: the section just says so. `partial` is true when more posts exist than were read. */
function useRecentPosts(workerUrl: string, enabled: boolean) {
    const [state, setState] = useState<{ posts: PostSummary[] | null; failed: boolean; partial: boolean }>({ posts: null, failed: false, partial: false });
    useEffect(() => {
        if (!enabled) return;
        let live = true;
        (async () => {
            const all: PostSummary[] = [];
            let offset: number | null = 0;
            for (let page = 0; offset !== null && page < RECENT_PAGES; page++) {
                const res: Response = await fetch(`${workerUrl}/api/posts?offset=${offset}`, { headers: authHeaders(), credentials: 'include' });
                if (!res.ok) throw new Error(String(res.status));
                const j = await res.json();
                all.push(...((j.posts || []) as PostSummary[]));
                offset = typeof j.nextOffset === 'number' ? j.nextOffset : null;
            }
            if (live) setState({ posts: all.sort((a, b) => Date.parse(b.date || '') - Date.parse(a.date || '')).slice(0, 5), failed: false, partial: offset !== null });
        })().catch(() => { if (live) setState({ posts: null, failed: true, partial: false }); });
        return () => { live = false; };
    }, [workerUrl, enabled]);
    return state;
}

export default function AdminOverviewPage() {
    const { user, workerUrl } = useAdmin();
    const router = useRouter();
    const content = useContent();
    const { liveAt, run } = useDeploy();
    const rebuild = useRebuild();
    const now = useNow();
    const editsContent = canUse(user, 'content');
    const deploying = run?.state === 'running' || run?.state === 'slow';
    const firstName = (user.name || user.username || '').split(/\s+/)[0];
    const recentPosts = useRecentPosts(workerUrl, editsContent);

    const { ensureLoaded } = content;
    useEffect(() => {
        if (!editsContent) return;
        ensureLoaded('projects');
        ensureLoaded('resources');
    }, [editsContent, ensureLoaded]);

    const drafts = (name: CollectionName) => content.state[name].items.filter((i) => !i.published).length;
    // Creates the record and opens it in the same step, the way the Projects and Resources lists do.
    const create = (name: CollectionName) => router.push(editHref(name, content.create(name)));
    const recent = editsContent
        ? (['projects', 'resources'] as const).flatMap((name) => content.state[name].items.filter((i) => i.name).slice(0, 3).map((item) => ({ name, item })))
        : [];
    const loadingCollections = editsContent && (['projects', 'resources'] as const).some((n) => content.state[n].status !== 'ready' && content.state[n].items.length === 0);

    const pending = [
        ...(['projects', 'resources'] as const).flatMap((name) =>
            content.changes[name].map((c) => ({ key: `${name}-${c.item._k}`, title: c.item.name || `Untitled ${COLLECTIONS[name].singular}`, where: COLLECTIONS[name].label, kind: c.kind, href: editHref(name, c.item._k) }))),
        ...content.postChanges.map((p) => ({ key: `post-${p.slug}`, title: p.title || p.slug, where: 'Posts', kind: p.kind, href: `/admin/posts/edit?slug=${encodeURIComponent(p.slug)}` })),
    ];

    return (
        <AdminPage>
            <PageHeader title="Overview">
                <HeaderSpacer />
                {canSeeArtifacts(user) && canUse(user, 'artifacts') && (
                    <Button asChild variant="outline" className="h-10 gap-1.5 rounded-lg px-4 text-sm"><Link href="/admin/artifacts/edit"><FileUp size={16} /> Upload artifact</Link></Button>
                )}
                {editsContent && <NewButton href="/admin/posts/edit">New post</NewButton>}
            </PageHeader>
            <p className="-mt-3 mb-5 text-sm text-muted-foreground">{greeting(new Date(now).getHours())}{firstName ? `, ${firstName}` : ''}. Here is what is live, what is waiting, and the quickest way back in.</p>

            <StatGrid cols={3}>
                <StatTile
                    label="Site"
                    value={deploying ? 'Publishing' : 'Live'}
                    detail={liveAt ? `Last build ${ago(liveAt, now)}` : 'Last build time unavailable'}
                    tone={deploying ? undefined : 'up'}
                />
                {editsContent && (
                    <StatTile label="Unpublished changes" value={content.changeCount} detail={content.changeCount ? 'Waiting to go live' : 'Everything is live'} href={pending[0]?.href} />
                )}
                {editsContent && (
                    <StatTile label="Drafts" value={drafts('projects') + drafts('resources')} detail={`${plural(drafts('projects'), 'project')}, ${plural(drafts('resources'), 'resource')}`} />
                )}
            </StatGrid>

            {editsContent && (
                <Section
                    title="Unpublished changes"
                    action={
                        <Button size="sm" onClick={content.publish} disabled={!content.canPublish || content.publishing || content.blockers.length > 0} className="h-8 gap-1.5 text-[13px]">
                            {content.publishing ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />} Publish
                        </Button>
                    }
                >
                    {pending.length === 0 ? (
                        <div className="px-5 py-8 text-center text-sm text-muted-foreground">Everything you have written is live.</div>
                    ) : (
                        pending.map((p) => (
                            <SectionRow
                                key={p.key}
                                href={p.href}
                                title={p.title}
                                subtitle={p.where}
                                right={<StatusPill tone={p.kind === 'added' ? 'info' : 'warn'}>{p.kind === 'added' ? 'New' : 'Edited'}</StatusPill>}
                            />
                        ))
                    )}
                    {(content.blockers.length > 0 || content.postWarnings.length > 0) && (
                        <ul className="space-y-1 border-t border-border/60 px-5 py-3 text-xs text-amber-700 dark:text-amber-400">
                            {[...content.blockers, ...content.postWarnings].map((b) => <li key={b}>{b}</li>)}
                        </ul>
                    )}
                </Section>
            )}

            <div className="grid items-start gap-5 lg:grid-cols-2">
                {editsContent && (
                    <Section title={recentPosts.partial ? `Recent posts (from the first ${RECENT_PAGES * 40})` : 'Recent posts'} action={<Link href="/admin/posts" className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">All posts</Link>}>
                        {recentPosts.failed ? (
                            <div className="px-5 py-6 text-sm text-muted-foreground">Could not load posts right now.</div>
                        ) : recentPosts.posts === null ? (
                            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" /></div>
                        ) : recentPosts.posts.length === 0 ? (
                            <div className="px-5 py-6 text-sm text-muted-foreground">No posts yet.</div>
                        ) : (
                            recentPosts.posts.map((p) => (
                                <SectionRow
                                    key={p.slug}
                                    href={`/admin/posts/edit?slug=${encodeURIComponent(p.slug)}`}
                                    icon={<PenLine size={15} />}
                                    title={p.title || 'Untitled'}
                                    subtitle={relativeTime(p.date) || undefined}
                                    right={<StatusPill published={p.published} />}
                                />
                            ))
                        )}
                    </Section>
                )}
                {editsContent && (
                    <Section title="Projects and resources">
                        {loadingCollections && recent.length === 0 ? (
                            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" /></div>
                        ) : recent.length === 0 ? (
                            <div className="px-5 py-6 text-sm text-muted-foreground">Nothing here yet.</div>
                        ) : (
                            recent.map(({ name, item }) => (
                                <SectionRow
                                    key={`${name}-${item._k}`}
                                    href={editHref(name, item._k)}
                                    icon={name === 'projects' ? <FolderKanban size={15} /> : <BookMarked size={15} />}
                                    title={item.name}
                                    subtitle={COLLECTIONS[name].label}
                                    right={<StatusPill published={item.published} />}
                                />
                            ))
                        )}
                    </Section>
                )}
            </div>

            <McpConnections />

            <Section title="Quick actions" padded>
                <div className="flex flex-wrap gap-2">
                    {editsContent && <Quick icon={PenLine} label="New post" href="/admin/posts/edit" />}
                    {editsContent && <Quick icon={FolderKanban} label="New project" onClick={() => create('projects')} />}
                    {editsContent && <Quick icon={BookMarked} label="New resource" onClick={() => create('resources')} />}
                    {canUse(user, 'artifacts') && <Quick icon={FileUp} label="Upload artifact" href="/admin/artifacts/edit" />}
                    {canUse(user, 'library') && <Quick icon={Library} label="Add prompt or skill" href="/admin/library/edit" />}
                    {canUse(user, 'rebuild') && (
                        <Button variant="outline" onClick={rebuild.trigger} disabled={rebuild.busy} className="h-9 gap-2 text-[13px]">
                            {rebuild.busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Rebuild site
                        </Button>
                    )}
                </div>
                {rebuild.error && <p role="alert" className="mt-3 text-xs text-red-600">{rebuild.error}</p>}
                {canUse(user, 'rebuild') && <p className="mt-3 text-xs text-muted-foreground">Rebuild starts a fresh build of the site from what is already saved. Use it if the site looks out of date.</p>}
                <p className="mt-3 text-xs text-muted-foreground">
                    Press <kbd className="rounded border px-1 font-mono">⌘K</kbd> anywhere to search everything or run any of these.
                </p>
            </Section>
        </AdminPage>
    );
}

function Quick({ icon: Icon, label, onClick, href }: { icon: typeof FileUp; label: string; onClick?: () => void; href?: string }) {
    const cls = 'h-9 gap-2 text-[13px]';
    return href
        ? <Button asChild variant="outline" className={cls}><Link href={href}><Icon size={14} /> {label}</Link></Button>
        : <Button variant="outline" onClick={onClick} className={cls}><Icon size={14} /> {label}</Button>;
}
