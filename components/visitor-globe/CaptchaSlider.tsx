'use client';

import { useRef, useState } from 'react';

/**
 * Drag-only 1–9 slider used for numeric mini-captcha answers. Requires an actual
 * pointer DRAG on the handle (clicking the track does nothing) — headless bots
 * struggle to synthesize a real drag gesture, so this adds friction beyond a
 * click/keystroke. Keyboard arrows are supported for accessibility. The value is
 * only committed to onChange after a genuine drag (or keypress).
 */

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
    const [pos, setPos] = useState<number | null>(null);
    const count = max - min + 1;
    const current = pos ?? min;

    const clientXToValue = (clientX: number) => {
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect) return min;
        const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
        return min + Math.round(ratio * (count - 1));
    };

    const startDrag = (e: React.PointerEvent) => {
        e.preventDefault();
        draggingRef.current = true;
        movedRef.current = false;
        const move = (ev: PointerEvent) => {
            if (!draggingRef.current) return;
            movedRef.current = true;
            setPos(clientXToValue(ev.clientX));
        };
        const up = (ev: PointerEvent) => {
            draggingRef.current = false;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            if (movedRef.current) {
                const v = clientXToValue(ev.clientX);
                setPos(v);
                onChange(v);
            }
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
            e.preventDefault();
            const v = Math.min(max, current + 1);
            setPos(v);
            onChange(v);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
            e.preventDefault();
            const v = Math.max(min, current - 1);
            setPos(v);
            onChange(v);
        }
    };

    const pct = ((current - min) / (count - 1)) * 100;

    return (
        <div className={className}>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Drag the slider to your answer</span>
                <span className="font-mono text-sm text-foreground">{pos ?? '–'}</span>
            </div>
            <div ref={trackRef} className="relative h-6 select-none">
                <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
                <div
                    className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary/50"
                    style={{ left: 0, width: `${pos != null ? pct : 0}%` }}
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
                    aria-valuenow={pos ?? undefined}
                    aria-label="Slide to the answer"
                    onPointerDown={startDrag}
                    onKeyDown={onKeyDown}
                    className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow cursor-grab touch-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                    style={{ left: `${pct}%` }}
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
