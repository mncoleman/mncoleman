'use client';

import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Clears the homepage down to its backdrop — cards, globe and scroll cue gone, nav
 * and the corner controls kept — so the paper (or the veil) is the whole screen.
 *
 * The hiding is a single class on `<html>` plus two rules in `globals.css`, not
 * context threaded through `app/page.tsx`. Nothing else needs to know the mode
 * exists, and the sections stay mounted, so leaving the mode restores the page
 * exactly as it was rather than re-running every entrance animation.
 *
 * Not persisted, matching the pencil marks it exists to show off: a reload is a
 * fresh sheet and a full page.
 */

const CLASS = 'blank-canvas';

export function BlankCanvasToggle() {
    const [blank, setBlank] = useState(false);

    const toggle = useCallback(() => setBlank((on) => !on), []);

    useEffect(() => {
        document.documentElement.classList.toggle(CLASS, blank);
        // Leaving the homepage with the mode on would hide `.home-*` on a page that
        // does not have them, but the class would still be sitting there for the
        // next visit to `/` — so drop it on unmount.
        return () => document.documentElement.classList.remove(CLASS);
    }, [blank]);

    // Escape is what people reach for to get out of a stripped-back view.
    useEffect(() => {
        if (!blank) return;
        const onKey = (e: KeyboardEvent) => {
            // Last out of the room: anything layered above this — the search palette,
            // the scroll-settings popover — marks Escape handled, so one press closes
            // that and leaves blank mode alone.
            if (e.key === 'Escape' && !e.defaultPrevented) setBlank(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [blank]);

    const label = blank ? 'Show the page content' : 'Hide the page content';

    return (
        <button
            type="button"
            onClick={toggle}
            data-print-hide
            aria-pressed={blank}
            aria-label={label}
            title={label}
            className={cn(
                // Third slot in the corner cluster: cursor toggle at right-5, scroll
                // settings at right-[4.5rem], and the eraser (light mode only) at
                // right-[11.5rem]. This one sits between them so the cluster stays
                // contiguous in dark mode, where there is no eraser.
                'fixed bottom-5 right-[8rem] z-40 hidden md:inline-flex h-10 w-10',
                'items-center justify-center rounded-lg border backdrop-blur-xl',
                'transition-colors duration-300 pwa-safe-bottom',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                blank
                    ? // Match the cursor toggle: the engaged state reads as pressed
                      // rather than leaving both states looking identical.
                      'border-foreground/30 bg-foreground/10 text-foreground'
                    : 'border-border/40 bg-background/40 text-muted-foreground hover:border-border hover:text-foreground'
            )}
        >
            <BlankCanvasIcon blank={blank} />
        </button>
    );
}

/** A frame with cards in it; the cards clear out when the mode is on. */
function BlankCanvasIcon({ blank }: { blank: boolean }) {
    return (
        <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden
        >
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            {!blank && (
                <>
                    <rect x="6.5" y="7.5" width="5.5" height="4" rx="1" fill="currentColor" stroke="none" />
                    <rect x="14" y="7.5" width="3.5" height="9" rx="1" fill="currentColor" stroke="none" />
                    <rect x="6.5" y="13" width="5.5" height="3.5" rx="1" fill="currentColor" stroke="none" />
                </>
            )}
        </svg>
    );
}
