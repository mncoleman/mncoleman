'use client';

import { useEffect, useState, type ReactNode } from 'react';

/**
 * Deferral primitives for the homepage's decorative WebGL.
 *
 * `dynamic(..., { ssr: false })` keeps these components out of the server render, but it
 * does NOT stop them downloading and booting during hydration — which is exactly the
 * window LCP is measured in. This wrapper moves that work off the critical path:
 * nothing here is content, so nothing here should compete with painting content.
 */

/**
 * Mounts children only after the page has loaded and the main thread has gone idle.
 *
 * For the full-bleed background shaders: they cover the viewport, so an observer would
 * fire immediately and buy nothing. Waiting for `load` + idle means the backdrop paints
 * after the content it sits behind, which is the correct priority order anyway.
 */
export function DeferUntilIdle({ children, timeout = 2000 }: { children: ReactNode; timeout?: number }) {
    const [show, setShow] = useState(false);

    useEffect(() => {
        let idleId = 0;
        let cancelled = false;

        const schedule = () => {
            if (cancelled) return;
            const ric = window.requestIdleCallback;
            if (typeof ric === 'function') {
                idleId = ric(() => !cancelled && setShow(true), { timeout });
            } else {
                // Safari has no requestIdleCallback; a timeout is a fine stand-in.
                idleId = window.setTimeout(() => !cancelled && setShow(true), 200);
            }
        };

        if (document.readyState === 'complete') {
            schedule();
        } else {
            window.addEventListener('load', schedule, { once: true });
        }

        return () => {
            cancelled = true;
            window.removeEventListener('load', schedule);
            if (idleId) {
                if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idleId);
                else window.clearTimeout(idleId);
            }
        };
    }, [timeout]);

    return show ? <>{children}</> : null;
}
