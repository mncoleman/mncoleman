'use client';

import dynamic from 'next/dynamic';
import { useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ROOMS, type RoomId } from './store';

/**
 * The way into the walkable office. Everything 3D (three.js, the rooms, the
 * controller) is behind this dynamic import, so it costs the site nothing until
 * someone presses the button.
 */

const World = dynamic(() => import('./world'), {
    ssr: false,
    loading: () => (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background text-xs uppercase tracking-widest text-muted-foreground">
            Opening the office…
        </div>
    ),
});

// Next's dev indicator owns the bottom-left corner in development and would sit
// on top of the button; step one slot right there. Production gets the corner.
const SLOT = process.env.NODE_ENV === 'development' ? 'left-[4.5rem]' : 'left-5';

/** Walk in at the room for the page you are on. */
function roomFor(pathname: string): RoomId {
    const match = ROOMS.find((r) => pathname === r.path || pathname.startsWith(`${r.path}/`));
    return match ? match.id : 'home';
}

export function WorldToggle() {
    const [open, setOpen] = useState(false);
    const pathname = usePathname();
    const close = useCallback(() => setOpen(false), []);

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                data-print-hide
                aria-label="Walk the site in 3D"
                title="Walk the site in 3D"
                className={cn(
                    'fixed bottom-5 z-40 hidden md:inline-flex h-10 w-10 items-center justify-center',
                    SLOT,
                    'rounded-lg border backdrop-blur-xl transition-colors duration-300 pwa-safe-bottom',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'border-border/40 bg-background/40 text-muted-foreground hover:border-border hover:text-foreground'
                )}
            >
                <svg
                    width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden
                >
                    <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
                    <path d="M4 7.5 12 12l8-4.5M12 12v9" />
                </svg>
            </button>
            {open && <World start={roomFor(pathname)} onClose={close} />}
        </>
    );
}
