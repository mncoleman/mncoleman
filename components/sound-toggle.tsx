'use client';

import { useSyncExternalStore } from 'react';
import { isMuted, setMuted, subscribeMuted } from '@/lib/click-sound';

function SpeakerIcon({ muted }: { muted: boolean }) {
    return (
        <svg
            width="16"
            height="16"
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
 * Turns the click sound off.
 *
 * It lives in the footer rather than in the floating corner cluster because that
 * cluster is `hidden md:` throughout — the custom cursor, the scroll controls and
 * the eraser all control things that only exist on a desktop pointer. The sound
 * plays on a phone too, so the switch has to be reachable on one.
 *
 * `useSyncExternalStore` reads the module-level flag that every click already
 * consults, so there is one source of truth and no state to keep in step. The
 * server snapshot is deliberately "not muted": that matches the default, so the
 * only visitors who see a flicker are the ones who have turned it off, and for
 * them a wrong first paint would be the sound icon rather than a wrong sound.
 */
export function SoundToggle({ className }: { className?: string }) {
    const muted = useSyncExternalStore(subscribeMuted, isMuted, () => false);
    const label = muted ? 'Turn click sounds on' : 'Turn click sounds off';

    return (
        <button
            type="button"
            onClick={() => setMuted(!muted)}
            aria-pressed={!muted}
            title={label}
            className={className}
            data-print-hide
        >
            <SpeakerIcon muted={muted} />
            {muted ? 'Sound off' : 'Sound on'}
        </button>
    );
}
