'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookMarked, FileUp, FolderKanban, Library, Loader2, RefreshCw, Rocket, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdmin, canUse, canSeeArtifacts } from '@/components/admin/admin-context';
import { COLLECTIONS, useContent, type CollectionName } from '@/components/admin/content-store';
import { ago, useDeploy, useNow } from '@/components/admin/deploy-status';
import { useRebuild } from '@/components/admin/use-rebuild';
import { cn } from '@/lib/utils';

function greeting(hour: number) {
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

export default function AdminOverviewPage() {
    const { user } = useAdmin();
    const router = useRouter();
    const content = useContent();
    const { liveAt, run } = useDeploy();
    const rebuild = useRebuild();
    const now = useNow();
    const editsContent = canUse(user, 'content');
    const deploying = run?.state === 'running' || run?.state === 'slow';
    const firstName = (user.name || user.username || '').split(/\s+/)[0];

    const drafts = (name: CollectionName) => content.state[name].items.filter((i) => !i.published).length;
    const create = (name: CollectionName) => {
        content.create(name);
        router.push(COLLECTIONS[name].href);
    };
    const open = (name: CollectionName, k: string) => {
        content.select(name, k);
        router.push(COLLECTIONS[name].href);
    };
    const recent = editsContent
        ? (['projects', 'resources'] as const).flatMap((name) => content.state[name].items.slice(0, 4).map((item) => ({ name, item })))
        : [];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-semibold tracking-tight">{greeting(new Date(now).getHours())}{firstName ? `, ${firstName}` : ''}</h1>
                <p className="mt-1 text-sm text-muted-foreground">What&apos;s live, what&apos;s waiting, and the quickest way back in.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                <Stat
                    label="Site"
                    value={deploying ? 'Publishing' : 'Live'}
                    sub={liveAt ? `Last deploy ${ago(liveAt, now)}` : 'Last deploy time unavailable'}
                >
                    {canUse(user, 'rebuild') && (
                        <>
                            <Button size="sm" variant="outline" onClick={rebuild.trigger} disabled={rebuild.busy} className="h-7 gap-1.5 text-xs">
                                {rebuild.busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Rebuild from Notion
                            </Button>
                            <p className="mt-2 text-[11px] text-muted-foreground">Blog posts and the resume come from Notion and only appear after a rebuild.</p>
                            {rebuild.error && <p className="mt-1 text-[11px] text-red-600">{rebuild.error}</p>}
                        </>
                    )}
                </Stat>
                {editsContent && (
                    <Stat
                        label="Unpublished"
                        value={String(content.changeCount)}
                        sub={content.changeCount ? 'changes waiting to go live' : 'everything is live'}
                    >
                        <Button size="sm" onClick={content.publish} disabled={!content.changeCount || content.publishing || content.blockers.length > 0} className="h-7 gap-1.5 text-xs">
                            {content.publishing ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />} Publish
                        </Button>
                    </Stat>
                )}
                {editsContent && (
                    <Stat
                        label="Drafts"
                        value={String(drafts('projects') + drafts('resources'))}
                        sub={`${drafts('projects')} projects · ${drafts('resources')} resources`}
                    />
                )}
            </div>

            <div className={cn('grid gap-8', editsContent && 'lg:grid-cols-[1fr_320px]')}>
                {editsContent && (
                    <section>
                        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Jump back in</h2>
                        <div className="divide-y divide-border/60 rounded-lg border border-border/60">
                            {recent.length === 0 && (
                                <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                            )}
                            {recent.map(({ name, item }) => (
                                <button key={`${name}-${item._k}`} type="button" onClick={() => open(name, item._k)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-muted/40">
                                    {name === 'projects' ? <FolderKanban size={15} className="shrink-0 text-muted-foreground" /> : <BookMarked size={15} className="shrink-0 text-muted-foreground" />}
                                    <span className="min-w-0 flex-1 truncate">{item.name || 'Untitled'}</span>
                                    <span className={cn('inline-flex items-center gap-1.5 text-xs', item.published ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
                                        <Circle size={7} className={item.published ? 'fill-current' : ''} />
                                        {item.published ? 'Live' : 'Draft'}
                                    </span>
                                    <span className="hidden w-20 text-right text-xs text-muted-foreground sm:block">{COLLECTIONS[name].label}</span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}
                <section>
                    <h2 className="mb-3 text-sm font-medium text-muted-foreground">Create</h2>
                    <div className="space-y-2">
                        {editsContent && <QuickAction icon={FolderKanban} label="New project" onClick={() => create('projects')} />}
                        {editsContent && <QuickAction icon={BookMarked} label="New resource" onClick={() => create('resources')} />}
                        {canSeeArtifacts(user) && <QuickAction icon={FileUp} label="Upload artifact" href="/admin/artifacts" />}
                        {canUse(user, 'library') && <QuickAction icon={Library} label="Add prompt or skill" href="/admin/library" />}
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground">
                        Press <kbd className="rounded border px-1 font-mono">⌘K</kbd> anywhere to search everything or run any of these.
                    </p>
                </section>
            </div>
        </div>
    );
}

function Stat({ label, value, sub, children }: { label: string; value: string; sub: string; children?: React.ReactNode }) {
    return (
        <div className="flex flex-col rounded-lg border border-border/60 p-4">
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
            {children && <div className="mt-3">{children}</div>}
        </div>
    );
}

function QuickAction({ icon: Icon, label, onClick, href }: { icon: typeof FileUp; label: string; onClick?: () => void; href?: string }) {
    const cls = 'flex w-full items-center gap-3 rounded-md border border-border/60 px-3 py-2.5 text-sm hover:bg-muted/40';
    const inner = <><Icon size={15} className="text-muted-foreground" /><span className="flex-1 text-left">{label}</span></>;
    return href ? <Link href={href} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}
