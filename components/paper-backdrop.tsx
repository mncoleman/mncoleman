'use client';

import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
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
 * Light mode's backdrop: a sheet of paper you can draw on.
 *
 * Light mode used to run the Waves line art, which read as noise on white. Rather
 * than replace it with nothing, the ground becomes an actual surface — a warm paper
 * grain — and the pointer leaves graphite on it. Nothing is persisted: a reload is
 * a fresh sheet, and the eraser in the corner control cluster clears it on demand.
 *
 * How graphite behaves lives in `lib/pencil.ts`, shared with the brand kit's
 * contained demo. What stays here is everything about being a full-viewport page
 * backdrop: sizing against the window, listening at the page level, the corner
 * control.
 *
 * Two interactions sit on top of the drawing:
 *   • a click on bare paper advances the pencil through a muted rainbow, so the
 *     next marks come out in a new colour (existing marks keep theirs);
 *   • the eraser retraces what was drawn rather than blanking the sheet, clearing
 *     the marks along their own paths over three seconds.
 *
 * Cost control (see the animation-loop gotcha in CLAUDE.md): there is no ambient
 * rAF loop at all. Pointer samples are queued and flushed once per frame, and the
 * loop stops the moment the pointer stops. The erase loop runs only during the
 * three seconds it takes. Fine pointers only — on touch, drawing would fight the
 * scroll gesture, so it renders paper and nothing else.
 */

const MAX_WIPERS = 8;
const WIPE_SWATH = 96; // CSS px of paper each wiper clears as it passes
const WIPE_SPEED = 1500; // px/s one wiper can cover before we dispatch another
const ERASE_MS = 3000;

/** Points are cheap, but not free — a long session shouldn't grow without bound. */
const MAX_POINTS = 24000;

export function PaperBackdrop() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const eraseRef = useRef<() => void>(() => {});

    const erase = useCallback(() => {
        eraseRef.current();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Cap DPR at 2: past that the pixel count triples for grain nobody can see.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const grain = makeGrain(ctx);
        const paintPaper = () => paintSheet(ctx, canvas, dpr, grain);

        // Touch and coarse pointers skip drawing entirely — it would fight scrolling.
        const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let raf = 0;
        let eraseRaf = 0;
        let queued: Point[] = [];
        let tail: Point[] = [];
        let ink = 0;

        // Completed geometry, kept so the erase has routes to retrace. Drawing alone
        // would not need it — the canvas is the only state the pencil requires.
        let strokes: Point[][] = [];
        let current: Point[] | null = null;
        let stored = 0;
        let erasing = false;

        const finishErase = () => {
            // Unconditional repaint at the end, so the retrace is purely cosmetic: a
            // wiper that missed a corner, a stroke laid down by a pending flush, and
            // the transit segments between buckets are all cleaned up regardless.
            paintPaper();
            strokes = [];
            current = null;
            stored = 0;
            tail = [];
            erasing = false;
        };

        const resize = () => {
            // innerWidth/innerHeight, not parent dims — same reasoning as dark-veil.
            canvas.width = Math.floor(window.innerWidth * dpr);
            canvas.height = Math.floor(window.innerHeight * dpr);
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            paintPaper(); // a resize is a fresh sheet; scaling graphite would smear it
            // A resize mid-erase would otherwise leave wipers retracing coordinates
            // from a sheet that no longer exists, with drawing locked out until they
            // finished. The sheet is already clean, so end the erase now.
            if (erasing) {
                if (eraseRaf) cancelAnimationFrame(eraseRaf);
                finishErase();
                return;
            }
            strokes = [];
            current = null;
            stored = 0;
        };

        resize();
        window.addEventListener('resize', resize);

        const flush = () => {
            raf = 0;
            // Carry the previous frame's last two points so consecutive frames join
            // smoothly instead of restarting the curve every 16ms.
            const pts = tail.concat(queued);
            queued = [];
            strokePath(ctx, pts, ink);
            tail = pts.slice(-2);
            // Demand-driven: nothing is scheduled until the next pointer sample.
        };

        const onMove = (e: PointerEvent) => {
            if (!fine || erasing) return;
            const p: Point = [e.clientX, e.clientY];

            // A jump this large means the pointer left and re-entered; start a new line
            // rather than drawing a stroke across the gap.
            const prev = current?.[current.length - 1];
            if (!current || (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 220)) {
                if (prev) tail = [];
                current = [];
                strokes.push(current);
            }
            current.push(p);
            stored++;
            while (stored > MAX_POINTS && strokes.length > 1) {
                stored -= strokes.shift()!.length;
            }

            queued.push(p);
            if (!raf) raf = requestAnimationFrame(flush);
        };

        /**
         * Leaving the WINDOW breaks the line rather than connecting across the gap.
         *
         * This used to be wired to `pointerout`, which was wrong in a way that showed
         * up as chunks missing from the drawing: `pointerout` bubbles, so it fired
         * every time the cursor crossed from one element to another — over a card
         * edge, over the MCP callout, over any span of text. Each one dropped the
         * carried tail, and with it up to a frame of travel, so a fast drag came out
         * as a series of disconnected runs. `mouseleave` on the document fires only
         * when the pointer actually leaves, which is the case this exists for; a
         * genuine re-entry is caught by the jump guard in `onMove` anyway.
         */
        const onLeave = () => {
            tail = [];
            current = null;
        };

        /**
         * A click on bare paper advances the pencil. Gated on the target because the
         * canvas is `pointer-events-none` — the listener has to sit on the window, which
         * means every card, nav link and corner control would otherwise change colour on
         * the way to doing its own job.
         */
        const onClick = (e: MouseEvent) => {
            if (!fine || erasing) return;
            // A click that lands on selected text belongs to the selection — it
            // re-rolls the highlight colour (components/selection-ink.tsx), and
            // advancing the pencil at the same time reads as one click doing two
            // unrelated things.
            const selection = document.getSelection();
            if (selection && !selection.isCollapsed && selection.toString().trim()) return;
            const el = e.target as HTMLElement | null;
            // `[role="link"]` is in here because the bento cards are measured divs
            // rather than anchors (see components/transition-link.tsx).
            if (
                el?.closest(
                    'a, button, input, textarea, select, label, [role="button"], [role="link"], header, footer, nav'
                )
            )
                return;
            ink = (ink + 1) % INKS.length;
        };

        const runErase = () => {
            if (erasing) return;
            const routes: EraseRoute[] = planErase(strokes, {
                maxWipers: MAX_WIPERS,
                speed: WIPE_SPEED,
                durationMs: ERASE_MS,
            });
            // Nothing drawn, or motion is unwelcome: just hand back a clean sheet.
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

        eraseRef.current = runErase;

        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('click', onClick);
        document.addEventListener('mouseleave', onLeave);

        return () => {
            window.removeEventListener('resize', resize);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('click', onClick);
            document.removeEventListener('mouseleave', onLeave);
            if (raf) cancelAnimationFrame(raf);
            if (eraseRaf) cancelAnimationFrame(eraseRaf);
            eraseRef.current = () => {};
        };
    }, []);

    return (
        <>
            <canvas
                ref={canvasRef}
                aria-hidden
                className="fixed inset-0 -z-10 h-screen w-screen pointer-events-none"
            />

            <button
                type="button"
                onClick={erase}
                data-print-hide
                aria-label="Erase pencil marks"
                title="Erase pencil marks"
                className={cn(
                    // Fourth slot in the corner cluster: cursor toggle at right-5,
                    // scroll settings at right-[4.5rem], blank canvas at right-[8rem].
                    'fixed bottom-5 right-[11.5rem] z-40 hidden md:inline-flex h-10 w-10',
                    'items-center justify-center rounded-lg border backdrop-blur-xl',
                    'border-border/40 bg-background/40 text-muted-foreground',
                    'transition-colors duration-300 pwa-safe-bottom',
                    'hover:border-border hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                    // Deliberately always visible. It used to appear only once something
                    // had been drawn, which meant clicking it made it vanish — reading as
                    // a broken control rather than a tidy one. The neighbours in this
                    // cluster are permanent; this matches them.
                )}
            >
                <EraserIcon />
            </button>
        </>
    );
}

export function EraserIcon() {
    return (
        <svg
            width="18" height="18" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden
        >
            <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l9.6-9.6a2 2 0 0 1 2.8 0l4.9 4.9a2 2 0 0 1 0 2.8L13 21" />
            <path d="M22 21H7" />
            <path d="m5 11 9 9" />
        </svg>
    );
}
