'use client';

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { cn } from '@/lib/utils';
import { slashItemsVersion, subscribeSlashItems, type SlashItem } from '../slash-registry';
import type { SlashStore } from './SlashCommand';

function Icon({ item }: { item: SlashItem }) {
    const I = item.icon;
    return typeof I === 'string'
        ? <b className="text-[13px]">{I}</b>
        : <I size={18} />;
}

/** The "/" menu: a floating, keyboard-driven list of blocks, anchored at the caret. */
export function SlashUI({ editor }: { editor: Editor | null }) {
    const store = editor?.storage.slashCommand?.store as SlashStore | undefined;
    const state = useSyncExternalStore(store?.subscribe ?? (() => () => undefined), store?.getState ?? (() => null), () => null);
    // Re-evaluate the registry snapshot while open so late-registered items appear.
    useSyncExternalStore(subscribeSlashItems, slashItemsVersion, () => 0);
    const ref = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ left: -9999, top: -9999 });
    const items = store ? store.items() : [];
    const sel = state ? Math.min(state.sel, Math.max(0, items.length - 1)) : 0;

    // Dependency-free on purpose: the menu's size changes with the query; setPos bails when nothing moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || !state) return;
        const w = el.offsetWidth, h = el.offsetHeight;
        const left = Math.max(8, Math.min(state.rect.left, window.innerWidth - w - 8));
        const below = state.rect.bottom + 6;
        const top = below + h > window.innerHeight - 8 ? Math.max(8, state.rect.top - h - 6) : below;
        setPos((p) => (p.left === left && p.top === top ? p : { left, top }));
        el.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
    });

    if (!state || !store || typeof document === 'undefined') return null;
    return createPortal(
        <div
            ref={ref}
            role="listbox"
            aria-label="Insert a block"
            style={{ left: pos.left, top: pos.top }}
            // Clicking must not pull focus out of the editor.
            onMouseDown={(e) => e.preventDefault()}
            className="fixed z-50 w-[300px] max-w-[94vw] animate-in fade-in-0 zoom-in-95 rounded-[10px] border border-border bg-popover p-1 text-sm text-popover-foreground shadow-xl duration-100"
        >
            <div data-lenis-prevent className="max-h-[340px] overflow-y-auto">
                {items.length === 0 ? (
                    <div className="px-2 py-1.5 text-muted-foreground">No matching blocks</div>
                ) : (
                    <>
                        <div className="px-2 pb-0.5 pt-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">Blocks</div>
                        {items.map((item, i) => (
                            <div
                                key={item.id}
                                id={`slash-item-${item.id}`}
                                role="option"
                                aria-selected={i === sel}
                                data-active={i === sel}
                                onMouseMove={() => store.setSel(i)}
                                onClick={() => store.run(item)}
                                className={cn('flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5', i === sel && 'bg-muted')}
                            >
                                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-background"><Icon item={item} /></span>
                                <span className="min-w-0">
                                    <span className="block">{item.title}</span>
                                    <small className="block text-xs leading-tight text-muted-foreground">{item.description}</small>
                                </span>
                                {item.hint && <kbd className="ml-auto rounded border border-border px-1 font-mono text-[11px] text-muted-foreground">{item.hint}</kbd>}
                            </div>
                        ))}
                    </>
                )}
            </div>
            <div className="mt-1 border-t border-border px-2 pb-0.5 pt-1.5 text-xs text-muted-foreground">
                <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd> move · <kbd className="font-mono">↵</kbd> insert · <kbd className="font-mono">esc</kbd> close
            </div>
        </div>,
        document.body,
    );
}
