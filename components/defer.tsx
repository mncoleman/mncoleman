'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Deferral primitives for the homepage's decorative WebGL.
 *
 * `dynamic(..., { ssr: false })` keeps these components out of the server render, but it
 * does NOT stop them downloading and booting during hydration — which is exactly the
 * window LCP is measured in. These two wrappers move that work off the critical path:
 * nothing here is content, so nothing here should compete with painting content.
 */

/**
 * Mounts children only once the placeholder is near the viewport.
 *
 * For below-the-fold work (the visitor globe: cobe + a WebGL canvas + an API round trip)
 * that a visitor may never scroll to at all.
 */
export function DeferUntilVisible({
    children,
    rootMargin = '200px',
    minHeight,
}: {
    children: ReactNode;
    rootMargin?: string;
    minHeight?: number;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [show, setShow] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el || show) return;

        // No IntersectionObserver (very old browsers) — just render it.
        if (typeof IntersectionObserver === 'undefined') {
            setShow(true);
            return;
        }

        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setShow(true);
                    io.disconnect();
                }
            },
            { rootMargin }
        );
        io.observe(el);
        return () => io.disconnect();
    }, [rootMargin, show]);

    // Reserve the space up front so revealing the content can't shift layout (CLS).
    return (
        <div ref={ref} style={minHeight && !show ? { minHeight } : undefined}>
            {show ? children : null}
        </div>
    );
}

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
