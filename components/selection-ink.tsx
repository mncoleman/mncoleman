'use client';

import { useEffect } from 'react';

/**
 * Recolours the text-selection highlight, site-wide, on every new highlight.
 *
 * Make a selection and it comes up in the next colour of the pencil's palette;
 * click away and select something else and it has moved on again. Clicking a
 * selection that is already up re-rolls it in place rather than collapsing it —
 * clicking anywhere else deselects exactly as it always did.
 *
 * Lives in the root layout rather than in `paper-backdrop.tsx` because the paper
 * only exists on the light-mode home page and this belongs on every page in both
 * themes. It publishes an RGB triplet to `<html>`; `::selection` in `globals.css`
 * reads it. A triplet rather than a colour so each theme can set its own alpha.
 *
 * No rAF, no timers, no state: two listeners and a custom property.
 */

/** The pencil's palette (see `paper-backdrop.tsx`), graphite first. */
const LIGHT = [
    '46, 46, 44', // graphite
    '150, 74, 68', // brick
    '166, 110, 56', // ochre
    '132, 128, 58', // olive gold
    '78, 120, 88', // sage
    '66, 104, 132', // slate blue
    '112, 88, 132', // muted violet
];

/**
 * The same seven, lifted for a near-black ground. A tint is only as visible as its
 * contrast with what is under it, so graphite-on-black is no highlight at all —
 * each entry here is its light-mode counterpart pulled up in value.
 */
const DARK = [
    '226, 232, 240', // paper
    '229, 152, 144', // brick
    '226, 176, 112', // ochre
    '206, 200, 122', // olive gold
    '150, 200, 165', // sage
    '140, 180, 220', // slate blue
    '186, 160, 214', // violet
];

/** A click on any of these is that element's business, not ours. */
const INTERACTIVE = 'a, button, input, textarea, select, option, label, [role="button"], [role="link"], [contenteditable]';

function isDark() {
    return document.documentElement.classList.contains('dark');
}

/** Is (x, y) inside the current selection's own painted rectangles? */
function insideSelection(selection: Selection, x: number, y: number) {
    for (let i = 0; i < selection.rangeCount; i++) {
        for (const rect of selection.getRangeAt(i).getClientRects()) {
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true;
        }
    }
    return false;
}

export function SelectionInk() {
    useEffect(() => {
        // Start one before graphite so the FIRST highlight lands on graphite — the
        // colour advances before it is shown, not after.
        let index = -1;
        let hadSelection = false;

        const publish = () => {
            const palette = isDark() ? DARK : LIGHT;
            document.documentElement.style.setProperty(
                '--selection-ink',
                palette[((index % palette.length) + palette.length) % palette.length]
            );
        };

        const advance = () => {
            index += 1;
            publish();
        };

        /**
         * Advance only on the empty -> non-empty transition.
         *
         * `selectionchange` fires continuously while a pointer is dragging, so
         * advancing on every event would strobe through the whole palette mid-drag.
         * One highlight, one colour.
         */
        const onSelectionChange = () => {
            const selection = document.getSelection();
            const has = !!selection && !selection.isCollapsed && selection.toString().trim().length > 0;
            if (has && !hadSelection) advance();
            hadSelection = has;
        };

        /**
         * Clicking inside a live selection re-rolls its colour and keeps it up.
         *
         * `preventDefault` on mousedown is what keeps it — a plain click would
         * otherwise collapse the selection before anyone saw the new colour. It is
         * deliberately narrow: only a primary click, only when the point is genuinely
         * inside the selection's own rectangles, and never over something interactive
         * or over an editable field, where suppressing the default would eat caret
         * placement. Every other click keeps the browser's normal deselect.
         */
        const onMouseDown = (e: MouseEvent) => {
            if (e.button !== 0 || e.detail > 1) return;
            const selection = document.getSelection();
            if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
            const target = e.target as HTMLElement | null;
            if (target?.closest(INTERACTIVE)) return;
            if (!insideSelection(selection, e.clientX, e.clientY)) return;
            e.preventDefault();
            advance();
        };

        // A theme flip has to re-resolve the current index against the other palette,
        // or a highlight held across the switch keeps a colour built for the old ground.
        const observer = new MutationObserver(() => publish());
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        publish();
        document.addEventListener('selectionchange', onSelectionChange);
        document.addEventListener('mousedown', onMouseDown);

        return () => {
            observer.disconnect();
            document.removeEventListener('selectionchange', onSelectionChange);
            document.removeEventListener('mousedown', onMouseDown);
            document.documentElement.style.removeProperty('--selection-ink');
        };
    }, []);

    return null;
}
