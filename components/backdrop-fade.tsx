'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Fades a WebGL backdrop in once it has actually drawn, instead of when it mounts.
 *
 * `DeferUntilIdle` deliberately holds the backdrops back until after load + idle, so
 * they always arrive after the cards they sit behind. That part is correct — decoration
 * should not compete with LCP. What was missing is the arrival itself: Dark Veil had no
 * fade at all and snapped in against the bare background, which is the "glitchy" flash.
 *
 * A plain mount-time `animate-in fade-in` does not fix it (the light branch had one and
 * still popped): the element mounts before OGL has compiled its shaders and drawn frame
 * one, so the fade plays out against an empty canvas and the first painted frame lands at
 * full opacity anyway. So this waits for a `<canvas>` to exist, gives it one more frame to
 * paint, and only then transitions — meaning what fades in is a real frame.
 *
 * Layout note: the wrapper sets ONLY opacity and a transition. It must never set
 * transform, filter, or will-change — each of those makes it a containing block for
 * `position: fixed` descendants, which would break Dark Veil's full-viewport coverage
 * (see the Dark Veil canvas gotcha in CLAUDE.md). Callers that need the wrapper to carry
 * layout (the contained variant on /resume) pass it in via `className`.
 */
export function BackdropFade({
    children,
    className,
    duration = 900,
}: {
    children: ReactNode;
    className?: string;
    duration?: number;
}) {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    const [instant, setInstant] = useState(false);

    useEffect(() => {
        // Reduced motion gets the backdrop, just not the animation — consistent with
        // dark-veil.tsx and Waves.tsx, which both still render a frame under it.
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setInstant(true);
            setVisible(true);
            return;
        }

        let raf = 0;
        let frames = 0;
        let cancelled = false;

        const tick = () => {
            if (cancelled) return;
            // ~3s ceiling: if WebGL is unavailable or the context fails, reveal anyway
            // rather than leaving an invisible backdrop forever.
            if (ref.current?.querySelector('canvas') || frames > 180) {
                raf = requestAnimationFrame(() => !cancelled && setVisible(true));
                return;
            }
            frames++;
            raf = requestAnimationFrame(tick);
        };

        raf = requestAnimationFrame(tick);
        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
        };
    }, []);

    return (
        <div
            ref={ref}
            className={className}
            style={{
                opacity: visible ? 1 : 0,
                transition: instant ? undefined : `opacity ${duration}ms ease-out`,
            }}
        >
            {children}
        </div>
    );
}
