'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

/**
 * The home page and brand kit used to be hard-forced to dark (a `dark` class here,
 * regardless of the theme). They no longer are — the header's pull-chain toggle drives
 * every route, and the home page swaps its WebGL backdrop (Dark Veil → Silk) to suit
 * the active theme.
 *
 * Both still render on a transparent surface so that backdrop shows through; every
 * other route keeps its solid `bg-background`.
 */
export function ThemeWrapper({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const hasBackdrop = pathname === '/' || pathname === '/brand-kit';

    return (
        <div
            className={`${hasBackdrop ? 'bg-transparent' : 'bg-background'} text-foreground transition-colors duration-300`}
        >
            {children}
        </div>
    );
}
