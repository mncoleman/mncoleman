'use client';

import { useEffect, useRef, useState } from 'react';
import { EraserIcon } from '@/components/paper-backdrop';
import {
    INKS,
    makeGrain,
    paintPaper as paintSheet,
    planErase,
    pointAt,
    strokePath,
    wipeSwath,
    type EraseRoute,
    type Point,
} from '@/lib/pencil';

/**
 * The light-mode paper backdrop, boxed.
 *
 * Runs the same engine as the real thing (`lib/pencil.ts`) so the brand kit cannot
 * drift from what it documents. What differs is only what has to: the canvas is
 * sized by ResizeObserver against its container rather than the window, it accepts
 * pointer events itself instead of listening at the page level, and it works on
 * touch — a bounded box can take a drag without fighting the page scroll, which is
 * exactly why the full-page version refuses to.
 */

const MAX_WIPERS = 6;
const WIPE_SWATH = 72;
const WIPE_SPEED = 900;
const ERASE_MS = 2000;

export function PencilDemo({ height = 224 }: { height?: number }) {
    const wrapRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const apiRef = useRef<{ erase: () => void; cycle: () => number }>({ erase: () => {}, cycle: () => 0 });
    const [ink, setInk] = useState(0);

    useEffect(() => {
        const wrap = wrapRef.current;
        const canvas = canvasRef.current;
        if (!wrap || !canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const grain = makeGrain(ctx);
        const paintPaper = () => paintSheet(ctx, canvas, dpr, grain);
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let raf = 0;
        let eraseRaf = 0;
        let queued: Point[] = [];
        let tail: Point[] = [];
        let inkIndex = 0;
        let strokes: Point[][] = [];
        let current: Point[] | null = null;
        let drawing = false;
        let erasing = false;

        const finishErase = () => {
            paintPaper();
            strokes = [];
            current = null;
            tail = [];
            erasing = false;
        };

        const resize = () => {
            const rect = wrap.getBoundingClientRect();
            if (!rect.width) return;
            canvas.width = Math.floor(rect.width * dpr);
            canvas.height = Math.floor(rect.height * dpr);
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            paintPaper();
            if (erasing && eraseRaf) {
                cancelAnimationFrame(eraseRaf);
                finishErase();
                return;
            }
            strokes = [];
            current = null;
        };

        const observer = new ResizeObserver(resize);
        observer.observe(wrap);
        resize();

        const flush = () => {
            raf = 0;
            const pts = tail.concat(queued);
            queued = [];
            strokePath(ctx, pts, inkIndex);
            tail = pts.slice(-2);
        };

        const local = (e: PointerEvent): Point => {
            const rect = canvas.getBoundingClientRect();
            return [e.clientX - rect.left, e.clientY - rect.top];
        };

        // Press-and-drag rather than hover: inside a box on a scrollable page, a
        // hover-to-draw demo would scribble on anyone who merely moved past it.
        const onDown = (e: PointerEvent) => {
            if (erasing) return;
            drawing = true;
            canvas.setPointerCapture(e.pointerId);
            current = [local(e)];
            strokes.push(current);
            tail = [];
        };

        const onMove = (e: PointerEvent) => {
            if (!drawing || erasing || !current) return;
            const p = local(e);
            current.push(p);
            queued.push(p);
            if (!raf) raf = requestAnimationFrame(flush);
        };

        const onUp = () => {
            drawing = false;
            current = null;
            tail = [];
        };

        const runErase = () => {
            if (erasing) return;
            const routes: EraseRoute[] = planErase(strokes, {
                maxWipers: MAX_WIPERS,
                speed: WIPE_SPEED,
                durationMs: ERASE_MS,
            });
            if (!routes.length || reduced) {
                finishErase();
                return;
            }
            erasing = true;
            const prev: Point[] = routes.map((r) => pointAt(r, 0));
            const start = performance.now();
            const step = (now: number) => {
                const t = Math.min((now - start) / ERASE_MS, 1);
                routes.forEach((route, i) => {
                    const pos = pointAt(route, route.total * t);
                    wipeSwath(ctx, dpr, grain, prev[i], pos, WIPE_SWATH);
                    prev[i] = pos;
                });
                if (t < 1) eraseRaf = requestAnimationFrame(step);
                else finishErase();
            };
            eraseRaf = requestAnimationFrame(step);
        };

        apiRef.current = {
            erase: runErase,
            cycle: () => {
                inkIndex = (inkIndex + 1) % INKS.length;
                return inkIndex;
            },
        };

        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup', onUp);
        canvas.addEventListener('pointercancel', onUp);

        return () => {
            observer.disconnect();
            canvas.removeEventListener('pointerdown', onDown);
            canvas.removeEventListener('pointermove', onMove);
            canvas.removeEventListener('pointerup', onUp);
            canvas.removeEventListener('pointercancel', onUp);
            if (raf) cancelAnimationFrame(raf);
            if (eraseRaf) cancelAnimationFrame(eraseRaf);
            apiRef.current = { erase: () => {}, cycle: () => 0 };
        };
    }, []);

    return (
        <div className="space-y-3">
            <div
                ref={wrapRef}
                className="relative overflow-hidden rounded-xl border border-border/40"
                style={{ height }}
            >
                <canvas
                    ref={canvasRef}
                    className="block h-full w-full touch-none"
                    style={{ cursor: 'crosshair' }}
                    aria-label="Drawing surface — press and drag to draw"
                    role="img"
                />
                <span className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-neutral-500">
                    press and drag to draw
                </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => setInk(apiRef.current.cycle())}
                    className="inline-flex items-center gap-2 rounded-lg border border-border/40 bg-background/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                    <span
                        className="h-3 w-3 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: `rgb(${INKS[ink]})` }}
                        aria-hidden
                    />
                    Next colour
                </button>

                <button
                    type="button"
                    onClick={() => apiRef.current.erase()}
                    className="inline-flex items-center gap-2 rounded-lg border border-border/40 bg-background/60 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                >
                    <EraserIcon />
                    Erase
                </button>

                <div className="ml-auto flex items-center gap-1" aria-hidden>
                    {INKS.map((rgb, i) => (
                        <span
                            key={rgb}
                            className="h-3 w-3 rounded-full ring-1 ring-black/10 transition-transform"
                            style={{
                                backgroundColor: `rgb(${rgb})`,
                                transform: i === ink ? 'scale(1.35)' : 'scale(1)',
                            }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
