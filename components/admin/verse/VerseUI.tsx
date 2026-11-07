'use client';

import { Fragment, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { Loader2, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    buildVerseHref,
    formatReference,
    getBookSync,
    previewText,
    versesOf,
    type PickItem,
    type Translation,
    type VerseRef,
} from '../../../lib/bible';
import { attrsToRef, type PickAction, type Rect, type VerseStore } from './verse-store';
import { ModeChips } from '../citations/ModeChips';

/**
 * The floating pieces of the verse-mention feature: the `@` picker, the display-text
 * composer, the badge edit popover and the hover card. All are portalled to <body> and
 * positioned with `position: fixed` from rects the store captured.
 */

function useStore(store: VerseStore) {
    return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** Fixed-position box anchored under (or above, when short on room) a rect, kept inside the viewport. */
export function Floating({ rect, className, children, ...rest }: { rect: Rect; className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ left: -9999, top: -9999 });
    // Deliberately dependency-free: the box's size changes with its content, and setPos bails out when nothing moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const left = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
        const below = rect.bottom + 6;
        const top = below + h > window.innerHeight ? Math.max(8, rect.top - h - 6) : below;
        setPos((p) => (p.left === left && p.top === top ? p : { left, top }));
    });
    return (
        <div
            ref={ref}
            style={{ left: pos.left, top: pos.top }}
            className={cn('fixed z-50 rounded-lg border border-border bg-popover text-sm text-popover-foreground shadow-lg', className)}
            {...rest}
        >
            {children}
        </div>
    );
}

const noFocusSteal = (e: React.MouseEvent) => e.preventDefault();

function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
    if (tokens.length === 0) return <>{text}</>;
    const pattern = new RegExp(`\\b(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return (
        <>
            {text.split(pattern).map((part, i) =>
                i % 2 === 1 ? (
                    <mark key={i} className="rounded-sm bg-yellow-300/40 text-inherit">
                        {part}
                    </mark>
                ) : (
                    <Fragment key={i}>{part}</Fragment>
                ),
            )}
        </>
    );
}

function Skeleton() {
    return <span className="mt-1 block h-3 w-3/4 animate-pulse rounded bg-muted" />;
}

function TranslationToggle({ store, tr }: { store: VerseStore; tr: Translation }) {
    return (
        <div className="flex overflow-hidden rounded-md border border-border text-[11px]" role="group" aria-label="Translation">
            {(['kjv', 'web'] as const).map((t) => (
                <button
                    key={t}
                    type="button"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        store.setTranslation(t);
                    }}
                    className={cn('px-2 py-0.5 uppercase', tr === t ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                    {t}
                </button>
            ))}
        </div>
    );
}

const ACTIONS: { id: PickAction; label: string; title: string; verse: boolean }[] = [
    { id: 'ref', label: 'Ref', title: 'Copy reference (Alt+1)', verse: false },
    { id: 'verse', label: 'Verse', title: 'Copy verse text (Alt+2)', verse: true },
    { id: 'both', label: 'Both', title: 'Copy reference and verse (Alt+3)', verse: true },
    { id: 'quote', label: 'Paste', title: 'Paste into the post using the settings above (Alt+4)', verse: true },
];

function Picker({ store }: { store: VerseStore }) {
    const { pick, translation, notice, pasteOutput, pasteQuote } = useStore(store);
    const listRef = useRef<HTMLDivElement>(null);
    const sel = pick?.sel ?? 0;
    useLayoutEffect(() => {
        listRef.current?.querySelector('[data-sel="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [sel, pick?.items.length]);
    if (!pick) return null;

    const refItems = pick.items.map((it, i) => ({ it, i })).filter(({ it }) => it.kind !== 'hit');
    const hitItems = pick.items.map((it, i) => ({ it, i })).filter(({ it }) => it.kind === 'hit');

    const row = ({ it, i }: { it: PickItem; i: number }) => {
        const on = i === sel;
        const ref = it.kind === 'book' ? null : it.ref;
        const text = ref ? previewText(translation, ref, 3) : null;
        const loaded = ref ? getBookSync(translation, ref.book) !== null : true;
        return (
            <div
                key={i}
                data-sel={on}
                onMouseDown={(e) => {
                    e.preventDefault();
                    store.choose(it, e.metaKey || e.ctrlKey);
                }}
                onMouseEnter={() => store.setSel(i)}
                className={cn('flex cursor-pointer items-start gap-2 px-3 py-1.5', on && 'bg-accent')}
            >
                <div className="min-w-0 flex-1">
                    <div className="font-semibold">{it.kind === 'book' ? it.book.name : formatReference(it.ref)}</div>
                    {it.kind === 'book' ? (
                        <span className="block text-xs text-muted-foreground">Pick a book, then a chapter</span>
                    ) : text ? (
                        <span className="line-clamp-2 block text-[12.5px] leading-snug text-muted-foreground">
                            {it.kind === 'hit' ? <Highlight text={text} tokens={it.tokens} /> : text}
                        </span>
                    ) : loaded ? null : (
                        <Skeleton />
                    )}
                </div>
                {on && ref && (
                    <div className="flex shrink-0 gap-0.5 pt-0.5">
                        {ACTIONS.map((a) => {
                            const disabled = a.verse && ref.start === undefined && !(a.id === 'quote' && pasteOutput === 'ref');
                            return (
                                <button
                                    key={a.id}
                                    type="button"
                                    disabled={disabled}
                                    title={disabled ? 'Needs a verse, not a whole chapter' : a.title}
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        void store.runAction(a.id, it);
                                    }}
                                    className="rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {a.label}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    const grid = pick.grid;
    return (
        <Floating rect={pick.rect} className="w-[420px] max-w-[94vw] overflow-hidden" onMouseDown={noFocusSteal} data-lenis-prevent>
            {store.citationAvailable() && <ModeChips mode="verse" onCitation={() => store.toCitation()} />}
            <div className="flex items-center justify-between px-3 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                <span>{pick.recent ? 'Recent' : 'Insert verse'}</span>
                <TranslationToggle store={store} tr={translation} />
            </div>
            <div ref={listRef} className="max-h-[320px] overflow-y-auto py-1">
                {refItems.map(row)}
                {hitItems.length > 0 && (
                    <div className="px-3 pb-0.5 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">Verses containing &ldquo;{pick.query.trim()}&rdquo;</div>
                )}
                {hitItems.map(row)}
                {pick.phrase === 'loading' && (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                        <Loader2 size={12} className="animate-spin" /> Loading verse search&hellip;
                    </div>
                )}
                {pick.phrase === 'error' && <div className="px-3 py-2 text-xs text-red-600">Verse search could not load.</div>}
                {pick.message && <div className="px-3 py-2 text-xs text-muted-foreground">{pick.message}</div>}
                {grid && (
                    <>
                        <div className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                            {grid.type === 'chapter' ? `${grid.book.name} chapters` : `${formatReference({ book: grid.book.id, chapter: grid.chapter })} verses`}
                        </div>
                        <div className="flex flex-wrap gap-1 px-3 pb-2">
                            {Array.from({ length: grid.type === 'chapter' ? grid.book.chapters : grid.count }, (_, i) => (
                                <button
                                    key={i}
                                    type="button"
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        store.pickGrid(i + 1);
                                    }}
                                    className="min-w-[30px] rounded border border-border px-1.5 py-0.5 text-xs hover:bg-accent"
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                    </>
                )}
                {pick.items.length === 0 && !grid && !pick.message && pick.phrase === 'none' && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                        {pick.query.trim() ? 'No match. Try “John 3:16” or words from the verse.' : 'Type a reference (John 3:16) or words from a verse.'}
                    </div>
                )}
                {pick.items.length === 0 && pick.phrase === 'ready' && <div className="px-3 py-2 text-xs text-muted-foreground">No verse contains that.</div>}
            </div>
            <div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground" aria-label="Paste settings">
                <span className="uppercase tracking-wide">Paste</span>
                <div className="flex overflow-hidden rounded-md border border-border" role="group" aria-label="What to paste">
                    {([['verse', 'Verse'], ['ref', 'Reference'], ['both', 'Both']] as const).map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            aria-pressed={pasteOutput === id}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                store.setPasteOutput(id);
                            }}
                            className={cn('px-2 py-0.5', pasteOutput === id ? 'bg-accent text-foreground' : 'hover:text-foreground')}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={pasteQuote}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        store.setPasteQuote(!pasteQuote);
                    }}
                    className="ml-auto flex items-center gap-1.5 hover:text-foreground"
                >
                    Quote block
                    <span className={cn('relative h-3.5 w-6 rounded-full transition-colors', pasteQuote ? 'bg-sky-500' : 'bg-muted-foreground/40')}>
                        <span className={cn('absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-all', pasteQuote ? 'left-3 ' : 'left-0.5')} />
                    </span>
                </button>
            </div>
            <div className="border-t border-border px-3 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                {notice ? (
                    <span className="font-medium text-green-600">{notice}</span>
                ) : (
                    <>
                        Enter pick · {'⌘'}Enter pick with default text · Alt+1 ref · Alt+2 verse · Alt+3 both · Alt+4 paste · Esc close
                        {store.citationAvailable() && (
                            <>
                                <br />
                                Tab: Verse / Citation
                            </>
                        )}
                    </>
                )}
            </div>
        </Floating>
    );
}

function Composer({ store }: { store: VerseStore }) {
    const { compose } = useStore(store);
    const ref = useRef<HTMLInputElement>(null);
    const open = compose !== null;
    useLayoutEffect(() => {
        if (open) {
            ref.current?.focus();
            ref.current?.select();
        }
    }, [open]);
    if (!compose) return null;
    const label = formatReference(compose.ref);
    return (
        <Floating rect={compose.rect} className="flex items-center gap-2 border-sky-500 px-2 py-1 ring-2 ring-sky-500/20">
            <span className="whitespace-nowrap text-xs text-muted-foreground">Display text</span>
            <input
                ref={ref}
                defaultValue={label}
                aria-label="Display text"
                className="min-w-[160px] bg-transparent py-0.5 outline-none"
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        store.commitCompose(e.metaKey || e.ctrlKey ? label : e.currentTarget.value);
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        store.commitCompose(null);
                    }
                }}
                onBlur={(e) => store.commitCompose(e.currentTarget.value)}
            />
            <kbd className="rounded border border-border px-1 text-[11px] text-muted-foreground">{'↵'}</kbd>
        </Floating>
    );
}

function EditPopover({ store }: { store: VerseStore }) {
    const { edit } = useStore(store);
    const ref = useRef<HTMLInputElement>(null);
    const open = edit !== null;
    useLayoutEffect(() => {
        if (open) {
            ref.current?.focus();
            ref.current?.select();
        }
    }, [open]);
    if (!edit) return null;
    const label = formatReference(attrsToRef(edit.attrs));
    return (
        <Floating
            rect={edit.rect}
            className="w-[300px] p-2"
            onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) store.saveEdit(ref.current?.value ?? edit.attrs.text);
            }}
        >
            <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
            <input
                ref={ref}
                defaultValue={edit.attrs.text}
                aria-label="Display text"
                className="w-full rounded border border-input bg-background px-2 py-1 outline-none focus:ring-1 focus:ring-ring"
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        store.saveEdit(e.metaKey || e.ctrlKey ? label : e.currentTarget.value);
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        store.closeEdit();
                        store.editor?.commands.focus();
                    }
                }}
            />
            <div className="mt-2 flex items-center justify-between">
                <button
                    type="button"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        store.removeEdit();
                    }}
                    className="flex items-center gap-1 text-xs text-red-600 hover:underline"
                >
                    <Trash2 size={12} /> Remove
                </button>
                <span className="text-[11px] text-muted-foreground">Enter saves · {'⌘'}Enter resets</span>
            </div>
        </Floating>
    );
}

function HoverCard({ store }: { store: VerseStore }) {
    const { hover, translation } = useStore(store);
    if (!hover) return null;
    const ref: VerseRef = attrsToRef(hover.attrs);
    const file = getBookSync(translation, ref.book);
    const verses = file ? versesOf(file, ref).slice(0, ref.start === undefined ? 3 : 12) : null;
    return (
        <Floating
            rect={hover.rect}
            className="w-[360px] max-w-[94vw] p-3"
            onMouseEnter={() => store.hoverKeep()}
            onMouseLeave={() => store.hoverHide()}
        >
            <div className="mb-1.5 flex items-center gap-2">
                <span className="font-semibold">{formatReference(ref)}</span>
                <span className="ml-auto">
                    <TranslationToggle store={store} tr={translation} />
                </span>
            </div>
            {verses ? (
                <p className="mb-2 text-[13.5px] leading-relaxed">
                    {verses.map(([n, t]) => (ref.start === undefined || ref.end !== undefined ? `${n} ${t}` : t)).join(' ')}
                    {ref.start === undefined ? ' …' : ''}
                </p>
            ) : (
                <div className="mb-2 space-y-1.5">
                    <Skeleton />
                    <Skeleton />
                </div>
            )}
            <a href={buildVerseHref(ref)} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-600 hover:underline">
                Open passage &rarr;
            </a>
        </Floating>
    );
}

export function VerseUI({ editor }: { editor: Editor | null }) {
    if (!editor || typeof document === 'undefined') return null;
    const store = (editor.storage as unknown as { verseMention?: { store: VerseStore } }).verseMention?.store;
    if (!store) return null;
    return createPortal(
        <>
            <Picker store={store} />
            <Composer store={store} />
            <EditPopover store={store} />
            <HoverCard store={store} />
        </>,
        document.body,
    );
}
