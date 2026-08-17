'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A number that counts up to its value once, then stops.
 *
 * Demand-driven like every other loop in this repo (see the animation gotcha in
 * CLAUDE.md): one rAF chain that ends when the ease reaches 1, no interval, no
 * ambient work. Under `prefers-reduced-motion` it renders the final value
 * immediately — a ticker is decoration, and the number is the content.
 *
 * `tabular-nums` is not optional here. Proportional digits change width as they
 * change value, so an un-tabular counter visibly jitters its own layout on every
 * frame, and a row of them never settles.
 */
export function CountUp({
    value,
    duration = 1100,
    decimals = 0,
    delay = 0,
    suffix = '',
    prefix = '',
    className,
}: {
    value: number;
    duration?: number;
    decimals?: number;
    delay?: number;
    suffix?: string;
    prefix?: string;
    className?: string;
}) {
    const [shown, setShown] = useState(0);
    const frame = useRef(0);

    useEffect(() => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setShown(value);
            return;
        }

        let start = 0;
        const step = (now: number) => {
            if (!start) start = now;
            const elapsed = now - start - delay;
            if (elapsed < 0) {
                frame.current = requestAnimationFrame(step);
                return;
            }
            const t = Math.min(elapsed / duration, 1);
            // Ease-out quint: most of the distance covered early, so the number
            // reads as arriving rather than as a progress bar.
            setShown(value * (1 - Math.pow(1 - t, 5)));
            if (t < 1) frame.current = requestAnimationFrame(step);
        };
        frame.current = requestAnimationFrame(step);

        // Guaranteed settle. A backgrounded tab pauses rAF outright, so a counter
        // started in one — open the dialog, switch tabs, come back — would sit at
        // zero forever and read as broken data rather than as a paused animation.
        // Timers are only throttled, never stopped, so this always lands.
        const settle = window.setTimeout(() => setShown(value), delay + duration + 400);

        return () => {
            cancelAnimationFrame(frame.current);
            clearTimeout(settle);
        };
    }, [value, duration, delay]);

    return (
        <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {prefix}
            {shown.toLocaleString(undefined, {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
            })}
            {suffix}
        </span>
    );
}
