'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    AlertTriangle, BookMarked, Check, ChevronDown, ChevronsLeft, ChevronsRight, Circle, ExternalLink, FolderKanban,
    Loader2, LogOut, Menu, Plus, RefreshCw, Rocket, Search, Undo2, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut,
} from '@/components/ui/command';
import { FancyCursorIcon } from '@/components/fancy-cursor-toggle';
import { useCursorPreference } from '@/components/cursor-preference';
import { cn } from '@/lib/utils';
import { canUse, useAdmin, type AdminUser } from '@/components/admin/admin-context';
import { ADMIN_LINKS, activeLink } from '@/components/admin/AdminNav';
import { COLLECTIONS, useContent, type Change, type CollectionName } from '@/components/admin/content-store';
import { ago, clock, deployProgress, useDeploy, useNow } from '@/components/admin/deploy-status';
import { useRebuild } from '@/components/admin/use-rebuild';

/**
 * The admin's own full-window frame: sidebar, top bar (breadcrumb, ⌘K, deploy
 * status, publish), and a content area each section scrolls itself. While it is
 * mounted the site's header and footer are hidden (`html.admin-shell` in
 * globals.css) and the site's global shortcuts stand down (`inAdminShell()`).
 */

const SIDEBAR_KEY = 'admin-sidebar-collapsed';

/** Sections whose page owns the whole content area (list + editor) instead of a scrolling column. */
function isFullBleed(pathname: string) {
    return /^\/admin\/(projects|resources|artifacts)\/?$/.test(pathname);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
    const { user } = useAdmin();
    const pathname = usePathname();
    // The shell only ever renders client-side (the layout shows a spinner until the
    // session check finishes), so reading storage in the initialiser cannot mismatch.
    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem(SIDEBAR_KEY) === '1'; } catch { return false; }
    });
    // The phone drawer closes on navigation: it remembers the path it was opened on.
    const [drawerAt, setDrawerAt] = useState<string | null>(null);
    const drawer = drawerAt === pathname;
    const setDrawer = (open: boolean) => setDrawerAt(open ? pathname : null);
    const [cmdOpen, setCmdOpen] = useState(false);
    const { publish } = useContent();
    const editsContent = canUse(user, 'content');

    useEffect(() => {
        document.documentElement.classList.add('admin-shell');
        return () => document.documentElement.classList.remove('admin-shell');
    }, []);

    const toggleCollapsed = () => setCollapsed((c) => {
        try { localStorage.setItem(SIDEBAR_KEY, c ? '0' : '1'); } catch { /* storage blocked */ }
        return !c;
    });

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setCmdOpen((o) => !o);
            } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
                // Never the browser's "Save page as…" inside the admin.
                e.preventDefault();
                if (editsContent) publish();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [editsContent, publish]);

    return (
        <div className="fixed inset-0 z-[45] flex bg-background text-foreground">
            <div className="hidden md:flex">
                <Sidebar user={user} collapsed={collapsed} onToggle={toggleCollapsed} />
            </div>
            {drawer && (
                <div className="fixed inset-0 z-[46] flex md:hidden">
                    <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setDrawer(false)} />
                    <div className="relative flex shadow-2xl">
                        <Sidebar user={user} collapsed={false} onToggle={() => setDrawer(false)} closeIcon />
                    </div>
                </div>
            )}

            <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-3 md:px-6">
                    <button type="button" onClick={() => setDrawer(true)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden" aria-label="Open menu">
                        <Menu size={18} />
                    </button>
                    <Breadcrumb />
                    <div className="ml-auto flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setCmdOpen(true)}
                            className="hidden h-8 w-56 items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground lg:flex"
                        >
                            <Search size={13} />
                            <span className="flex-1 text-left">Search or jump to…</span>
                            <kbd className="rounded border border-border/60 bg-background px-1 font-mono text-[10px]">⌘K</kbd>
                        </button>
                        <button type="button" onClick={() => setCmdOpen(true)} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground lg:hidden" aria-label="Search">
                            <Search size={16} />
                        </button>
                        <CursorToggle />
                        <DeployPill />
                        {editsContent && <PublishControl />}
                    </div>
                </header>
                <main
                    className={cn('min-h-0 flex-1', isFullBleed(pathname) ? 'overflow-hidden' : 'overflow-y-auto')}
                    data-lenis-prevent
                >
                    {isFullBleed(pathname) ? children : <div className="mx-auto w-full max-w-6xl p-4 md:p-8">{children}</div>}
                </main>
            </div>

            <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
        </div>
    );
}

/* -------------------------------- sidebar ------------------------------- */

function Sidebar({ user, collapsed, onToggle, closeIcon }: { user: AdminUser; collapsed: boolean; onToggle: () => void; closeIcon?: boolean }) {
    const { logout } = useAdmin();
    const pathname = usePathname();
    const current = activeLink(pathname)?.href;
    const content = useContent();
    const links = ADMIN_LINKS.filter((l) => l.allowed(user));
    const counts: Record<string, number | undefined> = {
        '/admin/projects': content.state.projects.status === 'ready' ? content.state.projects.items.length : undefined,
        '/admin/resources': content.state.resources.status === 'ready' ? content.state.resources.items.length : undefined,
    };
    const pending: Record<string, number> = {
        '/admin/projects': content.changes.projects.length,
        '/admin/resources': content.changes.resources.length,
    };
    const initials = (user.name || user.username || 'A').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
    const roleLabel = user.role === 'super_admin' ? 'Owner' : user.role === 'editor' ? 'Editor' : 'Site admin';

    return (
        <aside className={cn('flex h-full shrink-0 flex-col border-r border-border/60 bg-muted/20 transition-[width] duration-200', collapsed ? 'w-14' : 'w-60')}>
            <div className={cn('flex h-14 shrink-0 items-center border-b border-border/60', collapsed ? 'justify-center' : 'justify-between px-4')}>
                {!collapsed && (
                    <Link href="/" className="flex items-center gap-2" title="Back to the site">
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-foreground text-[11px] font-bold text-background">M</span>
                        <span className="text-sm font-semibold">mncoleman</span>
                        <span className="text-xs text-muted-foreground">admin</span>
                    </Link>
                )}
                <button type="button" onClick={onToggle} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={closeIcon ? 'Close menu' : 'Toggle sidebar'}>
                    {closeIcon ? <X size={16} /> : collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
                </button>
            </div>
            <nav className="flex-1 overflow-y-auto p-2" data-lenis-prevent>
                {(['Content', 'Site'] as const).map((group) => {
                    const inGroup = links.filter((l) => l.group === group);
                    if (!inGroup.length) return null;
                    return (
                        <div key={group} className="mb-4">
                            {!collapsed && <div className="px-2 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{group}</div>}
                            {inGroup.map(({ href, label, icon: Icon }) => {
                                const active = current === href;
                                const dirty = pending[href] || 0;
                                return (
                                    <Link
                                        key={href}
                                        href={href}
                                        title={collapsed ? label : undefined}
                                        aria-current={active ? 'page' : undefined}
                                        className={cn(
                                            'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors',
                                            collapsed && 'justify-center',
                                            active ? 'bg-foreground/[0.08] font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                        )}
                                    >
                                        <span className="relative">
                                            <Icon size={16} />
                                            {collapsed && dirty > 0 && <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-amber-500" />}
                                        </span>
                                        {!collapsed && (
                                            <>
                                                <span className="flex-1">{label}</span>
                                                {dirty > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title={`${dirty} unpublished`} />}
                                                {counts[href] !== undefined && <span className="text-xs tabular-nums text-muted-foreground/70">{counts[href]}</span>}
                                            </>
                                        )}
                                    </Link>
                                );
                            })}
                        </div>
                    );
                })}
            </nav>
            <div className={cn('flex items-center gap-2 border-t border-border/60 p-3', collapsed && 'justify-center')}>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium" title={collapsed ? user.name : undefined}>{initials}</span>
                {!collapsed && (
                    <>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm">{user.name || user.username || 'Admin'}</span>
                            <span className="block truncate text-[11px] text-muted-foreground">{roleLabel}</span>
                        </span>
                        <button type="button" onClick={logout} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Log out" title="Log out">
                            <LogOut size={14} />
                        </button>
                    </>
                )}
            </div>
        </aside>
    );
}

function Breadcrumb() {
    const pathname = usePathname();
    const link = activeLink(pathname);
    const content = useContent();
    const name = (Object.keys(COLLECTIONS) as CollectionName[]).find((n) => link?.href === COLLECTIONS[n].href);
    const selected = name ? content.state[name].items.find((i) => i._k === content.selected[name]) : undefined;
    const sub = !name && link && link.href !== '/admin' && pathname.replace(/\/$/, '') !== link.href;
    return (
        <div className="flex min-w-0 items-center gap-1.5 text-sm">
            {selected && name ? (
                <>
                    <button type="button" onClick={() => content.select(name, null)} className="hidden text-muted-foreground hover:text-foreground sm:inline">{link?.label}</button>
                    <span className="hidden text-muted-foreground/50 sm:inline">/</span>
                    <span className="truncate font-medium">{selected.name || `Untitled ${COLLECTIONS[name].singular}`}</span>
                </>
            ) : sub && link ? (
                <>
                    <Link href={link.href} className="text-muted-foreground hover:text-foreground">{link.label}</Link>
                    <span className="text-muted-foreground/50">/</span>
                    <span className="truncate font-medium">Edit</span>
                </>
            ) : (
                <span className="truncate font-medium">{link?.label ?? 'Admin'}</span>
            )}
        </div>
    );
}

/* ------------------------------- top bar -------------------------------- */

/** The site's fancy-cursor switch; the shell covers the corner cluster where it normally floats. */
function CursorToggle() {
    const { fancy, setFancy } = useCursorPreference();
    const label = fancy ? 'Turn off fancy mouse' : 'Turn on fancy mouse';
    return (
        <button
            type="button"
            onClick={() => setFancy(!fancy)}
            aria-pressed={!fancy}
            aria-label={label}
            title={label}
            className={cn(
                'hidden h-8 w-8 items-center justify-center rounded-md border transition-colors [@media(hover:hover)_and_(pointer:fine)]:flex',
                fancy ? 'border-border/60 text-muted-foreground hover:bg-muted/60 hover:text-foreground' : 'border-foreground/30 bg-foreground/10 text-foreground'
            )}
        >
            <FancyCursorIcon off={!fancy} />
        </button>
    );
}

export function DeployPill() {
    const { liveAt, run } = useDeploy();
    const now = useNow();
    const inFlight = run && (run.state === 'running' || run.state === 'slow');
    const p = inFlight ? deployProgress(run, now) : null;
    const label = !run
        ? liveAt ? `Live · ${ago(liveAt, now)}` : 'Live'
        : run.state === 'landed' ? 'Now live'
        : run.state === 'lost' ? 'Check Cloudflare'
        : run.state === 'slow' ? 'Taking longer than usual'
        : `${p!.stages[p!.current].label} · ~${clock(p!.left)}`;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <button type="button" className="relative flex h-8 items-center gap-2 overflow-hidden rounded-md border border-border/60 px-2.5 text-xs hover:bg-muted/60" aria-label={`Site status: ${label}`}>
                    {inFlight ? (
                        <Loader2 size={12} className="animate-spin text-sky-500" />
                    ) : run?.state === 'lost' ? (
                        <AlertTriangle size={12} className="text-amber-500" />
                    ) : (
                        <span className="relative flex h-2 w-2">
                            <span className={cn('absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-40', run?.state === 'landed' && 'animate-ping')} />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                        </span>
                    )}
                    <span className="hidden tabular-nums sm:inline">{label}</span>
                    {p && (
                        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-border/40">
                            <span className="block h-full bg-sky-500 transition-[width] duration-1000 ease-linear" style={{ width: `${p.fraction * 100}%` }} />
                        </span>
                    )}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 text-sm">
                {inFlight && p ? (
                    <>
                        <div className="flex items-baseline justify-between">
                            <span className="font-medium">{run.kind === 'rebuild' ? 'Rebuilding from Notion' : run.kind === 'static' ? 'Publishing a static artifact' : 'Publishing your changes'}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">{run.state === 'slow' ? clock(Math.round(p.elapsed)) : `~${clock(p.left)} left`}</span>
                        </div>
                        <ol className="mt-3 space-y-2.5">
                            {p.stages.map((st, i) => {
                                const done = i < p.current || run.state === 'slow';
                                const active = i === p.current && run.state !== 'slow';
                                return (
                                    <li key={st.id} className="flex gap-2.5">
                                        <span className="mt-0.5">
                                            {done ? <Check size={13} className="text-emerald-500" /> : active ? <Loader2 size={13} className="animate-spin text-sky-500" /> : <Circle size={13} className="text-muted-foreground/40" />}
                                        </span>
                                        <span className={cn('min-w-0', !done && !active && 'text-muted-foreground')}>
                                            <span className="block text-xs font-medium">{st.label}</span>
                                            <span className="block text-[11px] text-muted-foreground">{st.detail}</span>
                                        </span>
                                        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">~{st.s}s</span>
                                    </li>
                                );
                            })}
                        </ol>
                        <p className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                            {run.state === 'slow'
                                ? 'Still waiting for the new build to show up on the site. It may be queued behind another build.'
                                : 'Steps are estimated from typical build times; “live” is confirmed against the site itself. You can keep editing.'}
                        </p>
                    </>
                ) : run?.state === 'lost' ? (
                    <>
                        <div className="font-medium">No new build seen after 10 minutes</div>
                        <p className="mt-2 text-xs text-muted-foreground">The commit went through, but the site has not picked it up. Check the Pages deployments in the Cloudflare dashboard.</p>
                    </>
                ) : (
                    <>
                        <div className="font-medium">{run?.state === 'landed' ? 'Your changes are live' : 'Site is live'}</div>
                        <div className="mt-3 space-y-2 text-xs">
                            <StatusRow k="Last deploy" v={liveAt ? ago(liveAt, now) : 'unknown'} />
                            <StatusRow k="Typical publish" v="about a minute and a half" />
                            <StatusRow k="Daily rebuild" v="06:00 UTC" />
                        </div>
                        {run?.state === 'landed' && (
                            <a href="/" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs underline underline-offset-4">
                                <ExternalLink size={11} /> Open the site
                            </a>
                        )}
                    </>
                )}
            </PopoverContent>
        </Popover>
    );
}

function StatusRow({ k, v }: { k: string; v: string }) {
    return (
        <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{k}</span>
            <span className="tabular-nums">{v}</span>
        </div>
    );
}

function PublishControl() {
    const content = useContent();
    const router = useRouter();
    const { changes, changeCount, blockers, publishing, publishError } = content;
    const disabled = changeCount === 0 || blockers.length > 0 || publishing;

    const open = (name: CollectionName, c: Change) => {
        content.select(name, c.item._k);
        router.push(COLLECTIONS[name].href);
    };

    return (
        <div className="flex items-center">
            <Popover>
                <PopoverTrigger asChild>
                    <button
                        type="button"
                        className={cn(
                            'flex h-8 items-center gap-1.5 rounded-l-md border border-r-0 px-2.5 text-xs transition-colors',
                            publishError || blockers.length
                                ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                                : changeCount > 0
                                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                    : 'border-border/60 text-muted-foreground'
                        )}
                    >
                        {changeCount > 0 ? <><span className="sm:hidden">{changeCount}</span><span className="hidden sm:inline">{changeCount} unpublished</span></> : <span className="hidden sm:inline">No changes</span>}
                        <ChevronDown size={12} />
                    </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0 text-sm">
                    {(publishError || blockers.length > 0) && (
                        <div className="space-y-1 border-b border-border/60 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                            {publishError && <p>{publishError}</p>}
                            {content.conflict && (
                                <button type="button" onClick={() => content.reload(content.conflict!)} className="mt-1 inline-flex items-center gap-1 font-medium underline underline-offset-4">
                                    <RefreshCw size={11} /> Reload {COLLECTIONS[content.conflict].label.toLowerCase()} (drops its unpublished edits)
                                </button>
                            )}
                            {blockers.map((b) => <p key={b}>{b}</p>)}
                        </div>
                    )}
                    {changeCount === 0 ? (
                        <p className="px-3 py-4 text-xs text-muted-foreground">Everything matches the live site. Edits you make are staged here until you publish.</p>
                    ) : (
                        <>
                            <div className="border-b border-border/60 px-3 py-2 text-xs font-medium text-muted-foreground">Published together, one commit per collection</div>
                            <div className="max-h-72 overflow-y-auto py-1" data-lenis-prevent>
                                {(Object.keys(changes) as CollectionName[]).flatMap((name) =>
                                    changes[name].map((c) => (
                                        <div key={`${name}-${c.item._k}`} className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/50">
                                            <span className={cn('w-14 shrink-0 text-[10px] font-medium uppercase tracking-wider', c.kind === 'added' ? 'text-emerald-600' : c.kind === 'removed' ? 'text-red-600' : 'text-amber-600')}>
                                                {c.kind}
                                            </span>
                                            <button type="button" className="min-w-0 flex-1 truncate text-left disabled:cursor-default" disabled={c.kind === 'removed'} onClick={() => open(name, c)}>
                                                {c.item.name || 'Untitled'} <span className="text-xs text-muted-foreground">· {COLLECTIONS[name].singular}</span>
                                            </button>
                                            <button type="button" onClick={() => content.revert(name, c)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100" title="Discard this change" aria-label="Discard this change">
                                                <Undo2 size={13} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </>
                    )}
                </PopoverContent>
            </Popover>
            <Button size="sm" onClick={content.publish} disabled={disabled} className="h-8 gap-1.5 rounded-l-none" title="Publish (⌘S)">
                {publishing ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />}
                <span className="hidden sm:inline">Publish</span>
            </Button>
        </div>
    );
}

/* --------------------------- command palette ---------------------------- */

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const { user } = useAdmin();
    const router = useRouter();
    const content = useContent();
    const rebuild = useRebuild();
    const links = ADMIN_LINKS.filter((l) => l.allowed(user));
    const editsContent = canUse(user, 'content');

    const run = (fn: () => void) => { onOpenChange(false); fn(); };
    const openItem = (name: CollectionName, k: string) => run(() => { content.select(name, k); router.push(COLLECTIONS[name].href); });
    const create = (name: CollectionName) => run(() => { content.create(name); router.push(COLLECTIONS[name].href); });

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <CommandInput placeholder="Search content, jump to a page, or run an action…" />
            <CommandList data-lenis-prevent>
                <CommandEmpty>No results.</CommandEmpty>
                <CommandGroup heading="Actions">
                    {editsContent && <CommandItem onSelect={() => create('projects')}><Plus /> New project</CommandItem>}
                    {editsContent && <CommandItem onSelect={() => create('resources')}><Plus /> New resource</CommandItem>}
                    {editsContent && content.changeCount > 0 && (
                        <CommandItem onSelect={() => run(content.publish)}><Rocket /> Publish {content.changeCount} change{content.changeCount === 1 ? '' : 's'}<CommandShortcut>⌘S</CommandShortcut></CommandItem>
                    )}
                    {canUse(user, 'rebuild') && <CommandItem onSelect={() => run(rebuild.trigger)}><RefreshCw /> Rebuild site from Notion</CommandItem>}
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Go to">
                    {links.map(({ href, label, icon: Icon }) => (
                        <CommandItem key={href} onSelect={() => run(() => router.push(href))}><Icon /> {label}</CommandItem>
                    ))}
                </CommandGroup>
                {editsContent && (['projects', 'resources'] as const).map((name) => (
                    content.state[name].items.length > 0 && (
                        <CommandGroup key={name} heading={COLLECTIONS[name].label}>
                            {content.state[name].items.map((i) => (
                                <CommandItem key={i._k} value={`${name} ${i.name} ${i.description} ${i._k}`} onSelect={() => openItem(name, i._k)}>
                                    {name === 'projects' ? <FolderKanban /> : <BookMarked />}
                                    <span className="truncate">{i.name || 'Untitled'}</span>
                                    {!i.published && <span className="ml-auto text-xs text-muted-foreground">Draft</span>}
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )
                ))}
            </CommandList>
        </CommandDialog>
    );
}
