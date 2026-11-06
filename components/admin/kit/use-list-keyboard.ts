'use client';

import { useEffect, type RefObject } from 'react';
import { moveIndex } from './list-logic';

function typingIn(t: EventTarget | null): boolean {
    const el = t as HTMLElement | null;
    return !!el && typeof el.closest === 'function' && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/**
 * Keyboard for every admin list:
 *  - `/` focuses the search box (not while typing elsewhere),
 *  - Down / Up (and J / K) move focus through the rows' `[data-row-link]` elements inside `listRef`. Down from the
 *    search box lands on the first row, Up from the first row returns to the search box. Arrow keys only act while the
 *    search box or the list has focus (so they never hijack page scrolling); J / K also work from nowhere,
 *  - Enter on a focused row opens it (it is a link or a button, the browser does it),
 *  - `n` calls `onNew` when given,
 *  - Esc inside the search box is handled by `SearchField` (clear, then blur); Esc on a row returns to the search box.
 * Stands down while any dialog is open and for modifier combos.
 */
export function useListKeyboard({
    searchRef,
    listRef,
    onNew,
    enabled = true,
}: {
    searchRef: RefObject<HTMLInputElement | null>;
    listRef: RefObject<HTMLElement | null>;
    onNew?: () => void;
    enabled?: boolean;
}) {
    useEffect(() => {
        if (!enabled) return;
        const links = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-row-link]') ?? []);
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
            if (document.querySelector('[role="dialog"]')) return;
            const t = e.target instanceof HTMLElement ? e.target : null;
            const inList = !!t && !!listRef.current?.contains(t);
            const inSearch = !!t && t === searchRef.current;
            const rowLinks = links();
            // The row the focus is in (on its link or on its Copy link button): its link's index.
            const rowEl = inList ? t!.closest('[data-row]') : null;
            const at = rowEl ? rowLinks.findIndex((l) => rowEl.contains(l)) : -1;
            if (e.key === 'Escape') {
                if (inList) { e.preventDefault(); searchRef.current?.focus(); }
                return;
            }
            const down = e.key === 'ArrowDown' || e.key.toLowerCase() === 'j';
            const up = e.key === 'ArrowUp' || e.key.toLowerCase() === 'k';
            if (down || up) {
                const arrow = e.key.startsWith('Arrow');
                if (typingIn(t) && !inSearch) return;
                if (inSearch && !arrow) return; // j / k are letters in the search box
                if (arrow && !inSearch && !inList) return; // never steal page scrolling
                if (!rowLinks.length) return;
                if (up && at === 0) { e.preventDefault(); searchRef.current?.focus(); return; }
                if (inSearch && up) return;
                e.preventDefault();
                rowLinks[moveIndex(at, down ? 1 : -1, rowLinks.length)]?.focus();
                return;
            }
            if (typingIn(t)) return;
            if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
            else if (e.key.toLowerCase() === 'n' && onNew) { e.preventDefault(); onNew(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [searchRef, listRef, onNew, enabled]);
}
