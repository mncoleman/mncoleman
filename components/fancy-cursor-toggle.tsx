'use client';

import { useEffect, useState } from 'react';
import { useCursorPreference } from '@/components/cursor-preference';
import { cn } from '@/lib/utils';

/**
 * The custom cursor itself, in miniature: an 8px filled dot inside a 32px hairline ring
 * (see CustomCursor). Keeping the 1:4 dot-to-ring ratio is what makes the icon read as
 * "that thing on screen" rather than a generic pointer. When the cursor is off, a slash
 * crosses it out.
 */
function FancyCursorIcon({ off }: { off: boolean }) {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            aria-hidden="true"
        >
            <circle cx="12" cy="12" r="9" strokeWidth="1.25" />
            <circle cx="12" cy="12" r="2.25" fill="currentColor" stroke="none" />
            {off && <line x1="4.5" y1="19.5" x2="19.5" y2="4.5" strokeWidth="1.5" />}
        </svg>
    );
}

/**
 * Turns the custom cursor off and restores the native one.
 *
 * Only rendered on hover-capable, fine-pointer devices: the custom cursor never mounts
 * on touch in the first place, so on a phone this would control nothing. That is also
 * why it is absent from the mobile nav.
 *
 * Icon-only, so the label lives in `title` + `aria-label`; `aria-pressed` carries the
 * state for assistive tech.
 */
export function FancyCursorToggle() {
    const { fancy, setFancy } = useCursorPreference();
    const [applicable, setApplicable] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(hover: hover) and (pointer: fine)');
        const update = () => setApplicable(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);

    if (!applicable) return null;

    const label = fancy ? 'Turn off fancy mouse' : 'Turn on fancy mouse';

    return (
        <button
            type="button"
            aria-pressed={!fancy}
            aria-label={label}
            title={label}
            onClick={() => setFancy(!fancy)}
            data-print-hide
            className={cn(
                // Floats bottom-right, above the page but below the custom cursor itself
                // (which sits at z-[9999]) so the cursor still draws over the button.
                'fixed bottom-5 right-5 z-40 hidden md:inline-flex h-10 w-10 items-center justify-center',
                'rounded-lg border backdrop-blur-xl transition-colors pwa-safe-bottom',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                fancy
                    ? 'border-border/40 bg-background/40 text-muted-foreground hover:border-border hover:text-foreground'
                    : // Off is the deliberate, "engaged" state — show it as pressed rather
                      // than leaving the two states looking identical.
                      'border-foreground/30 bg-foreground/10 text-foreground'
            )}
        >
            <FancyCursorIcon off={!fancy} />
        </button>
    );
}
