'use client';

import { useRef, useState } from 'react';

/**
 * Drag-only 1–9 slider for numeric mini-captcha answers. Requires a real pointer
 * DRAG on the handle (clicking the track does nothing) — headless bots struggle
 * to synthesize a drag, adding friction beyond a click/keystroke.
 *
 * Feel: the handle follows the pointer CONTINUOUSLY (smooth), then on release
 * ELASTICALLY snaps to the nearest number with an overshoot ease. Keyboard arrows
 * are supported for accessibility. The value commits to onChange only after a
 * genuine drag (or keypress).
 */

const SNAP_EASE = 'left 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';

interface Props {
    min?: number;
    max?: number;
    onChange: (n: number) => void;
    className?: string;
}

export default function CaptchaSlider({ min = 1, max = 9, onChange, className }: Props) {
    const trackRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef(false);
    const movedRef = useRef(false);
    const [pos, setPos] = useState<number | null>(null); // continuous while dragging, integer after
    const [dragging, setDragging] = useState(false);
    const count = max - min + 1;
    const current = pos ?? min;
    const shown = pos == null ? null : Math.round(pos);

    // Continuous value (float) from a pointer x — no rounding, so the handle
    // tracks the finger/mouse smoothly.
    const clientXToValue = (clientX: number) => {
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect) return min;
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        return min + ratio * (count - 1);
    };

    const startDrag = (e: React.PointerEvent) => {
        e.preventDefault();
        draggingRef.current = true;
        movedRef.current = false;
        setDragging(true); // disable transition → instant, smooth follow
        setPos(clientXToValue(e.clientX));

        const move = (ev: PointerEvent) => {
            if (!draggingRef.current) return;
            movedRef.current = true;
            setPos(clientXToValue(ev.clientX));
        };
        const up = (ev: PointerEvent) => {
            draggingRef.current = false;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            const snapped = Math.round(clientXToValue(ev.clientX));
            setDragging(false); // re-enable transition → elastic snap to the number
            setPos(snapped);
            if (movedRef.current) onChange(snapped);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        let v: number | null = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = Math.min(max, Math.round(current) + 1);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = Math.max(min, Math.round(current) - 1);
        if (v != null) {
            e.preventDefault();
            setDragging(false);
            setPos(v);
            onChange(v);
        }
    };

    const pct = ((current - min) / (count - 1)) * 100;
    const transition = dragging ? 'none' : SNAP_EASE;

    return (
        <div className={className}>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Drag the slider to your answer</span>
                <span className="font-mono text-sm text-foreground">{shown ?? '–'}</span>
            </div>
            <div ref={trackRef} className="relative h-6 select-none">
                <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
                <div
                    className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary/50"
                    style={{ left: 0, width: `${pos != null ? pct : 0}%`, transition }}
                />
                {Array.from({ length: count }).map((_, i) => (
                    <span
                        key={i}
                        className="absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border"
                        style={{ left: `${(i / (count - 1)) * 100}%` }}
                    />
                ))}
                <button
                    type="button"
                    role="slider"
                    aria-valuemin={min}
                    aria-valuemax={max}
                    aria-valuenow={shown ?? undefined}
                    aria-label="Slide to the answer"
                    onPointerDown={startDrag}
                    onKeyDown={onKeyDown}
                    className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow cursor-grab touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                    style={{ left: `${pct}%`, transition }}
                />
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground/60">
                {Array.from({ length: count }).map((_, i) => (
                    <span key={i}>{min + i}</span>
                ))}
            </div>
        </div>
    );
}
