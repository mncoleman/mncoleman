'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

declare global {
    interface Window {
        dataLayer?: unknown[];
    }
}

// Mirrors the canonical gtag shim: gtag.js consumes the raw `arguments` object,
// not an array, and it drains anything buffered in dataLayer once it loads — so
// pushing here is safe even before the script has executed.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function gtag(..._args: unknown[]) {
    // `arguments`, not `_args`: gtag.js indexes into a real arguments object.
    // eslint-disable-next-line prefer-rest-params
    (window.dataLayer = window.dataLayer || []).push(arguments);
}

/**
 * Fires an explicit `page_view` on every App Router navigation.
 *
 * The root layout configures gtag with `send_page_view: false`, so this is the
 * single source of page_view events — including the first one. Two consequences
 * worth knowing:
 *
 *  1. GA4 Enhanced Measurement's "page changes based on browser history events"
 *     MUST stay off for this property, or every soft navigation is counted twice.
 *  2. Next updates `document.title` in its own post-commit effect, so reading it
 *     straight from `useEffect` can capture the *previous* page's title. Waiting
 *     two frames puts us after paint, by which point the title is correct.
 */
export function Analytics({ gaId }: { gaId: string }) {
    const pathname = usePathname();
    const lastPath = useRef<string | null>(null);

    useEffect(() => {
        if (!pathname || pathname === lastPath.current) return;

        let raf2 = 0;
        const raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(() => {
                // Claim the path here, not in the effect body: StrictMode double-invokes
                // effects in dev, and cancelling the first rAF before it ran while the
                // path was already claimed meant the initial page_view never fired at all.
                lastPath.current = pathname;
                gtag('event', 'page_view', {
                    page_path: pathname,
                    page_location: window.location.href,
                    page_title: document.title,
                    send_to: gaId,
                });
            });
        });

        return () => {
            cancelAnimationFrame(raf1);
            if (raf2) cancelAnimationFrame(raf2);
        };
    }, [pathname, gaId]);

    return null;
}
