'use client';

import { useSyncExternalStore } from 'react';
import { isMuted, setMuted, subscribeMuted } from '@/lib/click-sound';
import { cn } from '@/lib/utils';

function SpeakerIcon({ muted }: { muted: boolean }) {
    return (
        <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M11 5 6 9H3v6h3l5 4z" />
            {muted ? (
                <>
                    <line x1="16" y1="9" x2="21" y2="15" />
                    <line x1="21" y1="9" x2="16" y2="15" />
                </>
            ) : (
                <>
                    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
                    <path d="M18.5 5.5a9 9 0 0 1 0 13" />
                </>
            )}
        </svg>
    );
}

/**
 * Turns the click sound off. A square at the right end of the floating corner cluster,
 * matching the cursor toggle beside it.
 *
 * Unlike the rest of that cluster it is NOT `hidden md:`: the cursor, scroll and eraser
 * controls only mean anything with a desktop pointer, but the sound plays on a phone
 * too, so this one stays reachable at every size. It takes the right-most slot for the
 * same reason, so on a phone it sits alone in the corner rather than in a gap.
 *
 * `useSyncExternalStore` reads the module-level flag that every click already
 * consults, so there is one source of truth and no state to keep in step. The
 * server snapshot is deliberately "not muted": that matches the default, so the
 * only visitors who see a flicker are the ones who have turned it off, and for
 * them a wrong first paint would be the sound icon rather than a wrong sound.
 */
export function SoundToggle() {
    const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
    const label = muted ? 'Turn click sounds on' : 'Turn click sounds off';

    return (
        <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-pressed={muted}
            aria-label={label}
            title={label}
            data-print-hide
            className={cn(
                'fixed bottom-5 right-5 z-40 inline-flex h-10 w-10 items-center justify-center',
                'rounded-lg border backdrop-blur-xl transition-colors pwa-safe-bottom',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                muted
                    ? // Off is the deliberate state, shown pressed like the cursor toggle.
                      'border-foreground/30 bg-foreground/10 text-foreground'
                    : 'border-border/40 bg-background/40 text-muted-foreground hover:border-border hover:text-foreground'
            )}
        >
            <SpeakerIcon muted={muted} />
        </button>
    );
}
