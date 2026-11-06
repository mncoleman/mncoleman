'use client';

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Editor } from '@tiptap/react';
import {
    AlignLeft, Calendar, Eye, Hash, Loader2, Menu, MoreHorizontal, PanelRight, Pen, RotateCcw, Rocket, Star, Tag, Trash2, User, X, CircleDot, ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { authHeaders } from '@/lib/admin-auth';
import { cn } from '@/lib/utils';
import { isValidSlug, nextSlug, samePost } from '@/lib/post-format';
import { cleanTypedSlug, formatLongDate, slugAfterTitleChange } from '@/lib/post-editor-logic';
import { MarkdownEditor } from '@/components/admin/MarkdownEditor';
import { PostMarkdownPreview } from '@/components/blog-media/PostMarkdownPreview';
import { usePostSync, type SyncStatus } from '@/components/admin/PostSync';
import { POST_TAGS_CACHE_KEY } from '@/components/admin/PostsManager';
import { useShell } from '@/components/admin/shell-context';
import { useContent } from '@/components/admin/content-store';
import { DatePicker } from '@/components/admin/fields/DatePicker';
import { SelectField } from '@/components/admin/fields/SelectField';
import { TagChip, TagCombobox } from '@/components/admin/fields/TagCombobox';
import { Avatar, UserSelect } from '@/components/admin/fields/UserSelect';
import '@/components/admin/page-editor.css';

const PROPS_KEY = 'pe-props-open';
const WIDE = 1100;
const PLACEHOLDER = 'Write, press / for blocks, or @ for a verse or citation';

function readAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.readAsDataURL(file);
    });
}

function cachedTags(): string[] {
    try {
        const raw = sessionStorage.getItem(POST_TAGS_CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === 'string') : [];
    } catch {
        return [];
    }
}

function ago(ms: number) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} d ago`;
}

function initialPropsOpen(): boolean {
    if (typeof window === 'undefined' || window.innerWidth < WIDE) return false;
    try {
        const stored = localStorage.getItem(PROPS_KEY);
        return stored === null ? true : stored === '1';
    } catch {
        return true;
    }
}

/** Quiet save state in the top bar: a dot and a few words, never a button. */
function SaveStatus({ status, detail }: { status: SyncStatus; detail: string }) {
    const map: Record<SyncStatus, { label: string; dot: string; text?: string; pulse?: boolean }> = {
        loading: { label: 'Loading…', dot: 'bg-muted-foreground', pulse: true },
        idle: { label: 'Saved', dot: 'bg-emerald-500/70' },
        saved: { label: 'Saved', dot: 'bg-emerald-500/70' },
        saving: { label: 'Saving…', dot: 'bg-amber-500', pulse: true },
        local: { label: 'Saved on this device', dot: 'bg-muted-foreground' },
        offline: { label: 'Offline. Your changes are kept here and will save when you’re back.', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
        conflict: { label: 'Changed somewhere else', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
        unavailable: { label: 'Saved on this device only', dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
        error: { label: 'Not saved', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
    };
    const s = map[status];
    return (
        <span
            role="status"
            aria-live="polite"
            title={detail || s.label}
            className={cn('inline-flex min-w-[28px] max-w-[380px] items-center justify-end gap-1.5 whitespace-nowrap text-xs text-muted-foreground md:min-w-[116px]', s.text)}
        >
            <i className={cn('h-1.5 w-1.5 shrink-0 rounded-full', s.dot, s.pulse && 'animate-pulse')} />
            <span className="hidden truncate md:inline">{s.label}</span>
        </span>
    );
}

const IconButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
    function IconButton({ label, children, className, ...rest }, ref) {
        return (
            <button
                ref={ref}
                type="button"
                title={label}
                aria-label={label}
                className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted aria-pressed:text-foreground', className)}
                {...rest}
            >
                {children}
            </button>
        );
    },
);

/** One row of the Properties drawer: icon + label, then the control. `stack` puts the control under the label. */
function Prop({ icon: Icon, label, stack, children }: { icon: typeof Tag; label: string; stack?: boolean; children: React.ReactNode }) {
    return (
        <div className={cn('-mx-1.5 grid min-h-[34px] items-start rounded-md px-1.5 transition-colors focus-within:bg-foreground/[0.04] hover:bg-foreground/[0.04]', stack ? 'grid-cols-1' : 'grid-cols-[88px_minmax(0,1fr)]')}>
            <div className={cn('flex items-center gap-2 whitespace-nowrap text-sm text-muted-foreground', stack ? 'h-[30px]' : 'h-[34px]')}>
                <Icon size={15} aria-hidden="true" /> {label}
            </div>
            <div className={cn('flex min-h-[34px] min-w-0 flex-wrap items-center gap-1', stack && 'pb-1')}>{children}</div>
        </div>
    );
}

function StatusPill({ published }: { published: boolean }) {
    const c = published ? '#22c55e' : '#f59e0b';
    return (
        <span
            className="inline-flex h-[22px] items-center gap-1.5 rounded-[11px] pl-[7px] pr-[9px] text-[13px]"
            style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: `color-mix(in srgb, ${c} 60%, hsl(var(--foreground)))` }}
        >
            <span className="h-2 w-2 rounded-full" style={{ background: c }} />
            {published ? 'Published' : 'Draft'}
        </span>
    );
}

export function PostEditor({ workerUrl, slug: initialSlug }: { workerUrl: string; slug: string }) {
    const router = useRouter();
    const shell = useShell();
    const { refreshPosts } = useContent();
    const sync = usePostSync(workerUrl, initialSlug);
    const { doc, update, status, detail, live, busy } = sync;
    const [view, setView] = useState<'write' | 'preview'>('write');
    const [propsOpen, setPropsOpenState] = useState(initialPropsOpen);
    const [pubOpen, setPubOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [actionError, setActionError] = useState('');
    const [toast, setToast] = useState('');
    // The web address follows the title until it has been edited by hand or the post is published.
    const [slugTouched, setSlugTouched] = useState(!!initialSlug);
    const [tagOptions] = useState<string[]>(() => cachedTags());
    const editorRef = useRef<Editor | null>(null);
    const titleRef = useRef<HTMLTextAreaElement>(null);
    const excerptRef = useRef<HTMLTextAreaElement>(null);
    const propsBtnRef = useRef<HTMLButtonElement>(null);
    const propsRef = useRef<HTMLElement>(null);
    const propsCloseRef = useRef<HTMLButtonElement>(null);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const notify = useCallback((text: string) => {
        setToast(text);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(''), 3200);
    }, []);
    useEffect(() => () => clearTimeout(toastTimer.current), []);

    const setPropsOpen = useCallback((open: boolean, persist = true) => {
        setPropsOpenState(open);
        if (persist && window.innerWidth >= WIDE) {
            try { localStorage.setItem(PROPS_KEY, open ? '1' : '0'); } catch { /* storage blocked: the toggle still works */ }
        }
    }, []);

    // Below WIDE the Properties drawer covers the page, so it behaves as a modal dialog: the page behind
    // is inert, Tab stays inside, Esc closes, and focus returns to the toggle that opened it.
    const [narrow, setNarrow] = useState(false);
    useEffect(() => {
        // Modal only where the drawer covers the whole app (phone widths). From 768 up the sidebar stays beside it, so it is a plain overlay there.
        const mq = window.matchMedia('(max-width: 767px)');
        const sync = () => setNarrow(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);
    const modalProps = narrow && propsOpen && view === 'write';
    const wasModal = useRef(false);
    useEffect(() => {
        let t: ReturnType<typeof setTimeout> | undefined;
        // The drawer is visibility:hidden until its slide-in starts, and a hidden control cannot take focus: try again next tick.
        if (modalProps) t = setTimeout(() => propsCloseRef.current?.focus(), 60);
        else if (wasModal.current) propsBtnRef.current?.focus();
        wasModal.current = modalProps;
        return () => clearTimeout(t);
    }, [modalProps]);
    const trapTab = (e: React.KeyboardEvent<HTMLElement>) => {
        const root = propsRef.current;
        if (!modalProps || !root || e.key !== 'Tab' || !root.contains(e.target as Node)) return;
        const items = Array.from(root.querySelectorAll<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'))
            .filter((el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    // A new post: is this web address already a file or somebody's draft? Checked live, 400ms after the last keystroke.
    const [slugCheck, setSlugCheck] = useState<{ slug: string; taken: boolean } | null>(null);
    const docForCheck = useRef(doc);
    useEffect(() => { docForCheck.current = doc; });
    const { ownsSlug } = sync;
    useEffect(() => {
        const slug = doc.slug;
        if (live.sha || !isValidSlug(slug) || status === 'loading' || ownsSlug(slug)) return;
        let cancelled = false;
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`${workerUrl}/api/posts/${slug}`, { headers: authHeaders(), credentials: 'include' });
                if (!res.ok || cancelled) return;
                const json = await res.json();
                // The same text already saved under this address is this post's own earlier save, not a clash.
                const own = json.draft && !json.post && samePost(json.draft.post, docForCheck.current);
                if (!cancelled) setSlugCheck({ slug, taken: !!(json.post || json.draft) && !own });
            } catch { /* offline: the Worker re-checks on save */ }
        }, 400);
        return () => { cancelled = true; clearTimeout(t); };
    }, [doc.slug, live.sha, status, workerUrl, ownsSlug]);
    const slugIsTaken = !live.sha && ((slugCheck?.slug === doc.slug && slugCheck.taken) || sync.slugTaken === doc.slug);
    const slugLocked = !!live.sha;
    const slugOk = isValidSlug(doc.slug);
    const blocked = status === 'loading' || status === 'conflict' || !!busy;
    const hideInstead = live.published && !doc.published;
    const problem = !doc.title.trim() ? 'Add a title first.'
        : !slugOk || slugIsTaken ? 'Fix the web address in Properties first.'
        : !doc.date ? 'Pick a date in Properties first.'
        : '';

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

    // Cmd/Ctrl+S saves the draft now (never publishes). Cmd/Ctrl+. shows or hides Properties.
    const { saveNow } = sync;
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveNow(); }
            else if ((e.metaKey || e.ctrlKey) && e.key === '.') { e.preventDefault(); if (view === 'write') setPropsOpen(!propsOpen); }
            else if (e.key === 'Escape' && !e.defaultPrevented && propsOpen && view === 'write' && window.innerWidth < WIDE
                && (modalProps || (e.target as HTMLElement | null)?.closest?.('#post-props'))) {
                // Focus is held inside the drawer while it is open; the focus effect returns it to the toggle.
                setPropsOpen(false, false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [saveNow, view, propsOpen, modalProps, setPropsOpen]);

    // Auto-size the title and summary boxes to their text.
    useEffect(() => {
        const t = titleRef.current;
        if (t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; }
    }, [doc.title, view, status]);
    useEffect(() => {
        const t = excerptRef.current;
        if (t) { t.style.height = 'auto'; t.style.height = `${t.scrollHeight}px`; }
    }, [doc.excerpt, propsOpen, view, status]);

    const onTitle = (title: string) => {
        update({ title, slug: slugAfterTitleChange({ title, slug: doc.slug, touched: slugTouched, locked: slugLocked }) });
    };

    const focusBodyEnd = () => {
        const ed = editorRef.current;
        if (!ed) return;
        const last = ed.state.doc.lastChild;
        if (last && last.type.name !== 'paragraph') ed.chain().insertContentAt(ed.state.doc.content.size, { type: 'paragraph' }).focus('end').run();
        else ed.commands.focus('end');
    };

    const confirmingRef = useRef(false);
    const confirm = async (kind: 'publish' | 'unpublish') => {
        // A ref, not the busy state: two quick clicks both see the same render's value.
        if (confirmingRef.current) return;
        confirmingRef.current = true;
        try {
            await confirmInner(kind);
        } finally {
            confirmingRef.current = false;
        }
    };
    const confirmInner = async (kind: 'publish' | 'unpublish') => {
        setActionError('');
        // "Publish changes" saves this post to the site with the Status the writer chose: Published goes live, Draft stays hidden.
        const result = kind === 'publish' ? await sync.publish({ keepStatus: true }) : await sync.unpublish();
        if (!result.ok) { setActionError(result.error || 'Something went wrong.'); return; }
        setPubOpen(false);
        refreshPosts(0);
        notify(kind === 'unpublish' ? 'Taken off the site. It disappears in a minute or two.'
            : doc.published ? 'Published. It will be on the site in a minute or two.'
            : 'Saved as a draft. Visitors can’t see it on your site.');
    };

    const remove = async () => {
        setActionError('');
        const result = await sync.remove();
        if (!result.ok) { setActionError(result.error || 'Something went wrong.'); return; }
        setDeleteOpen(false);
        refreshPosts(0);
        router.push('/admin/posts');
    };

    if (sync.loadError) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <p className="text-red-600 dark:text-red-400">{sync.loadError}</p>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void sync.retryLoad()} className="gap-1.5"><RotateCcw size={13} /> Try again</Button>
                    <Button size="sm" variant="ghost" asChild><Link href="/admin/posts">Back to posts</Link></Button>
                </div>
            </div>
        );
    }

    const loading = status === 'loading';
    const crumbTitle = doc.title.trim() || 'Untitled';
    const publishing = busy === 'publishing' || busy === 'unpublishing';
    const verb = hideInstead ? 'Unpublish' : 'Publish changes';
    const confirmVerb = hideInstead ? 'Unpublish' : doc.published ? 'Publish' : 'Save as draft';
    const hint = !doc.slug
        ? (slugTouched ? 'Enter a web address.' : 'Fills in from the title. Locked once the post has been saved to the site.')
        : !slugOk ? 'Use lowercase letters, numbers and single hyphens.'
        : slugIsTaken ? null
        : slugLocked ? 'Locked. This post is already on the site (even as a draft), and changing the address would break links to it.'
        : slugTouched ? 'You can change this until the post has been saved to the site. After that it is locked.'
        : 'Follows the title until you change it. Locked once the post has been saved to the site.';
    const hintBad = (!!doc.slug && !slugOk) || slugIsTaken || (!doc.slug && slugTouched);

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* ------------------------------ top bar ------------------------------ */}
            <header inert={modalProps} className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background px-3 md:gap-3 md:px-6">
                {shell && <IconButton label="Open menu" onClick={shell.openMenu} className="md:hidden"><Menu size={18} /></IconButton>}
                <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
                    <Link href="/admin/posts" className="hidden text-muted-foreground hover:text-foreground sm:inline">Posts</Link>
                    <span className="hidden text-muted-foreground/50 sm:inline" aria-hidden="true">/</span>
                    <strong className="truncate font-medium" aria-current="page">{crumbTitle}</strong>
                </nav>
                <div className="ml-auto flex shrink-0 items-center gap-1.5 md:gap-3">
                    <SaveStatus status={status} detail={detail} />
                    <div className="inline-flex rounded-md border border-border/60 p-0.5" role="group" aria-label="View">
                        {([['write', 'Write', Pen], ['preview', 'Preview', Eye]] as const).map(([v, label, Icon]) => (
                            <button
                                key={v}
                                type="button"
                                title={label}
                                aria-pressed={view === v}
                                onClick={() => { setView(v); setPubOpen(false); }}
                                className="inline-flex items-center gap-1.5 rounded px-2.5 py-[3px] text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted aria-pressed:text-foreground"
                            >
                                <Icon size={13} /> <span className="hidden sm:inline">{label}</span>
                            </button>
                        ))}
                    </div>
                    {view === 'write' && (
                        <IconButton
                            ref={propsBtnRef}
                            label="Properties (Cmd+.)"
                            aria-pressed={propsOpen}
                            aria-controls="post-props"
                            onClick={() => setPropsOpen(!propsOpen)}
                        >
                            <PanelRight size={18} />
                        </IconButton>
                    )}
                    <Popover open={pubOpen} onOpenChange={(o) => { setPubOpen(o); if (o) setActionError(''); }}>
                        <PopoverTrigger asChild>
                            <Button size="sm" disabled={blocked} className="h-8 gap-1.5 px-3" title={hideInstead ? 'Take this post off the site' : 'Save this post to the site, with the Status you set'}>
                                {publishing ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                                <span className="hidden sm:inline">{publishing ? (busy === 'unpublishing' ? 'Unpublishing…' : 'Publishing…') : verb}</span>
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" role="dialog" aria-label={hideInstead ? 'Confirm unpublish' : 'Confirm publish changes'} className="w-[300px] rounded-[10px] p-3.5 text-[13px] shadow-xl">
                            <h4 className="mb-1 text-sm font-semibold">
                                {hideInstead ? 'Take this post off the site?' : live.sha ? 'Publish your changes to this post?' : 'Save this post to the site?'}
                            </h4>
                            <p className="mb-3 text-muted-foreground">
                                {hideInstead ? (
                                    'It leaves mncoleman.com in a minute or two. You can publish it again any time. The Status is Draft, so your latest edits are not written to the site.'
                                ) : problem ? problem : (
                                    <>
                                        {doc.published
                                            ? <>This post goes on the site in a minute or two.</>
                                            : <>Status is <b>Draft</b>, so visitors will not see this post. Set Status to Published to make it public.</>}
                                        {!doc.published && !live.sha && <span className="mt-1.5 block">This saves the draft to your site’s code repository. It stays hidden from visitors.</span>}
                                        {!live.sha && <> Its web address, <code className="rounded bg-muted px-1 py-px font-mono text-xs">/blog/{doc.slug}/</code>, can’t be changed afterward.</>}
                                        <span className="mt-1.5 block text-xs">This publishes only this post. Changes to other posts, projects and resources are published from the top bar of those pages.</span>
                                    </>
                                )}
                            </p>
                            {actionError && <p role="alert" className="mb-3 text-red-600 dark:text-red-400">{actionError}</p>}
                            <div className="flex justify-end gap-2">
                                <Button size="sm" variant="outline" className="h-8" onClick={() => setPubOpen(false)} disabled={!!busy}>Cancel</Button>
                                <Button size="sm" className="h-8" onClick={() => void confirm(hideInstead ? 'unpublish' : 'publish')} disabled={!!busy || (!hideInstead && !!problem)} autoFocus>
                                    {busy === 'publishing' || busy === 'unpublishing' ? <Loader2 size={14} className="animate-spin" /> : null} {confirmVerb}
                                </Button>
                            </div>
                        </PopoverContent>
                    </Popover>
                    {(live.sha || sync.status !== 'loading') && (
                        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                            <PopoverTrigger asChild>
                                <IconButton label="More actions"><MoreHorizontal size={18} /></IconButton>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-48 rounded-[10px] p-1 shadow-xl">
                                {live.published && (
                                    <a href={`/blog/${doc.slug}/`} target="_blank" rel="noopener noreferrer" onClick={() => setMoreOpen(false)} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                                        <ExternalLink size={14} /> View on the site
                                    </a>
                                )}
                                <button
                                    type="button"
                                    disabled={blocked && status !== 'conflict'}
                                    onClick={() => { setMoreOpen(false); setActionError(''); setDeleteOpen(true); }}
                                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-red-600 hover:bg-muted disabled:opacity-40 dark:text-red-400"
                                >
                                    <Trash2 size={14} /> Delete post
                                </button>
                            </PopoverContent>
                        </Popover>
                    )}
                </div>
            </header>

            <div className="relative flex min-h-0 flex-1">
                {/* ------------------------------ canvas ------------------------------ */}
                <main id="post-canvas" inert={modalProps} className="min-w-0 flex-1 overflow-y-auto" data-lenis-prevent>
                    <div className="mx-auto w-full max-w-[768px] px-4 pb-[24vh] pt-9 md:px-8 md:pt-[72px]">
                        {sync.restored && (
                            <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2.5 text-[13px] text-sky-900 dark:text-sky-200" role="status">
                                <span className="min-w-0 flex-1">Restored changes from this device ({ago(sync.restored.savedAt)}) that had not saved online yet.</span>
                                <button type="button" className="underline underline-offset-4" onClick={() => void sync.discardRestored()}>Discard them</button>
                                <button type="button" className="underline underline-offset-4" onClick={sync.dismissRestored}>Dismiss</button>
                            </div>
                        )}

                        {sync.conflict && (
                            <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/45 bg-amber-500/10 px-3 py-2.5 text-[13px]" role="alert">
                                <span>This post was changed somewhere else, in another tab or by someone else. Your version has not been overwritten.</span>
                                <span className="flex gap-2">
                                    <Button size="sm" variant="outline" className="h-8" disabled={busy === 'resolving'} onClick={() => { void sync.resolveKeepMine(); notify('Kept your version.'); }}>Keep my version</Button>
                                    <Button size="sm" variant="outline" className="h-8" disabled={busy === 'resolving'} onClick={() => { void sync.resolveLoadTheirs(); notify('Loaded the other version. Your edits here were replaced.'); }}>Load their version</Button>
                                </span>
                            </div>
                        )}

                        {(status === 'unavailable' || status === 'error') && detail && (
                            <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-900 dark:text-amber-200" role="status">
                                {detail} Your edits are still kept in this browser.
                            </div>
                        )}

                        {loading ? (
                            <div className="flex justify-center py-24 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>
                        ) : (
                            <>
                                <textarea
                                    ref={titleRef}
                                    rows={1}
                                    autoFocus={!doc.title}
                                    value={doc.title}
                                    readOnly={view === 'preview'}
                                    onChange={(e) => onTitle(e.target.value.replace(/\n/g, ' '))}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') { e.preventDefault(); editorRef.current?.commands.focus('start'); }
                                    }}
                                    placeholder="Untitled"
                                    aria-label="Title"
                                    spellCheck={false}
                                    className="mb-3.5 block w-full resize-none overflow-hidden bg-transparent p-0 text-[32px] font-bold leading-[1.15] tracking-[-0.025em] text-foreground outline-none placeholder:text-muted-foreground/55 md:text-[42px]"
                                />

                                {view === 'preview' && (
                                    <div className="mb-8 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                        <span className="inline-flex items-center gap-1.5"><Avatar name={doc.author || '?'} /> {doc.author || 'No author'}</span>
                                        {doc.date && <><span aria-hidden="true">·</span><span>{formatLongDate(doc.date)}</span></>}
                                        {doc.tags.map((t) => <TagChip key={t} tag={t} />)}
                                    </div>
                                )}

                                {/* The editor stays mounted behind Preview so its cursor and undo history survive. */}
                                <div hidden={view === 'preview'}>
                                    <MarkdownEditor
                                        key={sync.bodyKey}
                                        variant="page"
                                        value={doc.content}
                                        onChange={(content) => update({ content })}
                                        onUpload={uploadImage}
                                        onNotice={notify}
                                        onEditor={(ed) => { editorRef.current = ed; }}
                                        placeholder={PLACEHOLDER}
                                    />
                                    <div className="h-[40vh] cursor-text" aria-hidden="true" onMouseDown={(e) => { e.preventDefault(); focusBodyEnd(); }} />
                                </div>
                                {view === 'preview' && (
                                    <div className="pe-body">
                                        {doc.content.trim() ? (
                                            <PostMarkdownPreview content={doc.content} workerUrl={workerUrl} />
                                        ) : <p className="text-muted-foreground">Nothing written yet.</p>}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </main>

                {/* --------------------------- properties drawer --------------------------- */}
                {propsOpen && view === 'write' && (
                    <div className="fixed inset-0 z-[54] bg-black/40 min-[1100px]:hidden" onClick={() => { setPropsOpen(false, false); }} aria-hidden="true" />
                )}
                <aside
                    ref={propsRef}
                    id="post-props"
                    aria-label="Post properties"
                    {...(modalProps ? { role: 'dialog', 'aria-modal': true } : {})}
                    onKeyDown={trapTab}
                    className={cn(
                        'pe-drawer shrink-0 overflow-hidden bg-background',
                        'min-[1100px]:relative min-[1100px]:border-l',
                        propsOpen && view === 'write' ? 'min-[1100px]:w-[340px] min-[1100px]:border-border/60' : 'min-[1100px]:invisible min-[1100px]:w-0 min-[1100px]:border-transparent',
                        'max-[1099px]:fixed max-[1099px]:inset-y-0 max-[1099px]:right-0 max-[1099px]:z-[55] max-[1099px]:w-[min(360px,92vw)] max-[1099px]:border-l max-[1099px]:border-border max-[1099px]:shadow-2xl',
                        propsOpen && view === 'write' ? 'max-[1099px]:translate-x-0' : 'max-[1099px]:invisible max-[1099px]:translate-x-full',
                    )}
                    style={{ transition: 'width .2s ease, transform .2s ease, visibility .2s, border-color .2s' }}
                >
                    <div className="h-full w-[340px] overflow-y-auto overflow-x-hidden px-5 pb-28 max-[1099px]:w-full" data-lenis-prevent>
                        <div className="sticky top-0 z-[2] flex h-12 items-center justify-between bg-background text-[13px] text-muted-foreground">
                            <strong className="text-[11px] font-medium uppercase tracking-wider">Properties</strong>
                            <IconButton ref={propsCloseRef} label="Close properties (Cmd+.)" onClick={() => { setPropsOpen(false); if (!modalProps) propsBtnRef.current?.focus(); }}><X size={16} /></IconButton>
                        </div>

                        <Prop icon={CircleDot} label="Status">
                            <SelectField
                                aria-label="Status"
                                value={doc.published ? 'published' : 'draft'}
                                onChange={(v) => update({ published: v === 'published' })}
                                options={[
                                    { value: 'draft', label: 'Draft', render: <StatusPill published={false} /> },
                                    { value: 'published', label: 'Published', render: <StatusPill published /> },
                                ]}
                                trigger={<StatusPill published={doc.published} />}
                            />
                        </Prop>
                        <Prop icon={Calendar} label="Date">
                            <DatePicker value={doc.date} onChange={(date) => update({ date })} aria-label="Date" />
                        </Prop>
                        <Prop icon={Tag} label="Tags">
                            <TagCombobox value={doc.tags} options={[...new Set([...tagOptions, ...doc.tags])].sort((a, b) => a.localeCompare(b))} onChange={(tags) => update({ tags })} />
                        </Prop>
                        <Prop icon={User} label="Author">
                            <UserSelect workerUrl={workerUrl} value={doc.author} onChange={(author) => update({ author })} />
                        </Prop>
                        <Prop icon={Star} label="Featured">
                            <Switch
                                checked={doc.featured}
                                onCheckedChange={(featured) => update({ featured })}
                                aria-label="Featured"
                                className="h-5 w-[34px] border-0 data-[state=unchecked]:bg-foreground/20 [&>span]:h-4 [&>span]:w-4 [&>span]:translate-x-0.5 [&>span]:data-[state=checked]:translate-x-[16px]"
                            />
                        </Prop>

                        <div className="my-2.5 h-px bg-border/60" />

                        <Prop icon={Hash} label="Web address" stack>
                            <div className="flex min-w-0 flex-wrap items-center text-sm text-muted-foreground">
                                <span>/blog/</span>
                                <input
                                    value={doc.slug}
                                    disabled={slugLocked}
                                    onChange={(e) => { setSlugTouched(true); update({ slug: cleanTypedSlug(e.target.value) }); }}
                                    onBlur={() => { if (!slugLocked && doc.slug.endsWith('-')) update({ slug: doc.slug.replace(/-+$/, '') }); }}
                                    aria-label="Web address"
                                    aria-describedby="post-slug-hint"
                                    aria-invalid={hintBad || undefined}
                                    spellCheck={false}
                                    autoComplete="off"
                                    style={{ fieldSizing: 'content', maxWidth: '100%' } as React.CSSProperties}
                                    className={cn('min-w-[60px] rounded-[3px] bg-transparent px-1.5 py-[3px] outline-none hover:bg-foreground/[0.07] focus-visible:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring disabled:hover:bg-transparent', slugLocked ? 'text-muted-foreground' : 'text-foreground')}
                                />
                                <span>/</span>
                            </div>
                        </Prop>
                        <div id="post-slug-hint" className={cn('-mt-1 pb-2 text-xs', hintBad ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')} role={hintBad ? 'alert' : undefined}>
                            {slugIsTaken ? (
                                <>Another post already uses this address.{' '}
                                    <button type="button" className="text-foreground underline underline-offset-[3px]" onClick={() => { setSlugTouched(true); update({ slug: nextSlug(doc.slug) }); }}>
                                        Use {nextSlug(doc.slug)}
                                    </button>
                                </>
                            ) : hint}
                        </div>

                        <Prop icon={AlignLeft} label="Summary" stack>
                            <textarea
                                ref={excerptRef}
                                value={doc.excerpt}
                                onChange={(e) => update({ excerpt: e.target.value })}
                                rows={2}
                                placeholder="One or two sentences for the blog list and link previews"
                                aria-label="Summary"
                                className="-mx-2 block min-h-[34px] w-full resize-none overflow-hidden rounded-[5px] bg-transparent px-2 py-1.5 text-sm leading-normal outline-none placeholder:text-muted-foreground/70 hover:bg-foreground/[0.07] focus:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </Prop>
                    </div>
                </aside>
            </div>

            {toast && (
                <div role="status" className="fixed bottom-6 left-1/2 z-[80] max-w-[90vw] -translate-x-1/2 rounded-lg bg-primary px-3.5 py-2 text-[13px] text-primary-foreground shadow-lg">
                    {toast}
                </div>
            )}

            <Dialog open={deleteOpen} onOpenChange={(o) => !o && !busy && setDeleteOpen(false)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete “{doc.title || doc.slug || 'Untitled'}”?</DialogTitle>
                        <DialogDescription>
                            {live.sha
                                ? 'This removes the post from the site, and its page disappears in a minute or two. It cannot be undone from here.'
                                : 'This throws away the draft. It was never published, so it cannot be brought back.'}
                        </DialogDescription>
                    </DialogHeader>
                    {actionError && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{actionError}</p>}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={!!busy}>Keep it</Button>
                        <Button variant="destructive" onClick={() => void remove()} disabled={!!busy} className="gap-1.5">
                            {busy === 'deleting' && <Loader2 size={14} className="animate-spin" />} Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
