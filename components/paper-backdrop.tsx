'use client';

import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Light mode's backdrop: a sheet of paper you can draw on.
 *
 * Light mode used to run the Waves line art, which read as noise on white. Rather
 * than replace it with nothing, the ground becomes an actual surface — a warm paper
 * grain — and the pointer leaves graphite on it. Nothing is persisted: a reload is
 * a fresh sheet, and the eraser in the corner control cluster clears it on demand.
 *
 * Everything is procedural. A paper photo would be a few hundred KB on the critical
 * path for a decorative background; a 128px noise tile generated once and used as a
 * repeating pattern costs nothing to ship and tiles seamlessly at any viewport.
 *
 * Two interactions sit on top of the drawing:
 *   • a click on bare paper advances the pencil through a muted rainbow, so the
 *     next marks come out in a new colour (existing marks keep theirs);
 *   • the eraser retraces what was drawn rather than blanking the sheet, clearing
 *     the marks along their own paths over three seconds. Nothing is drawn doing
 *     the clearing — the lines simply retreat the way they arrived.
 *
 * Cost control (see the animation-loop gotcha in CLAUDE.md): there is no ambient
 * rAF loop at all. Pointer samples are queued and flushed once per frame, and the
 * loop stops the moment the pointer stops. The erase loop runs only during the three
 * seconds it takes. Fine pointers only — on touch, drawing would fight the
 * scroll gesture, so it renders paper and nothing else.
 */

const PAPER = '#f7f4ec';

/**
 * The pencil's palette. Graphite first, so the sheet starts where it always did;
 * a click walks the rest. Deliberately desaturated — these are laid down with
 * `multiply` on warm paper, and saturated ink reads as marker, not pencil.
 */
const INKS = [
    '46, 46, 44', // graphite
    '150, 74, 68', // brick
    '166, 110, 56', // ochre
    '132, 128, 58', // olive gold
    '78, 120, 88', // sage
    '66, 104, 132', // slate blue
    '112, 88, 132', // muted violet
];

const MAX_WIPERS = 8;
const WIPE_SWATH = 96; // CSS px of paper each wiper clears as it passes
const WIPE_SPEED = 1500; // px/s one wiper can cover before we dispatch another
const ERASE_MS = 3000;

/** Points are cheap, but not free — a long session shouldn't grow without bound. */
const MAX_POINTS = 24000;

type Point = [number, number];

function polylineLength(pts: Point[]): number {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    return len;
}

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

        // ── Paper grain, built once as a small tileable pattern ──
        const tile = document.createElement('canvas');
        tile.width = tile.height = 128;
        const tctx = tile.getContext('2d')!;
        const img = tctx.createImageData(128, 128);
        for (let i = 0; i < img.data.length; i += 4) {
            // Warm base with a little per-pixel tooth. The spread is deliberately
            // small — visible as texture, never as static.
            const n = (Math.random() - 0.5) * 18;
            img.data[i] = 247 + n;
            img.data[i + 1] = 244 + n;
            img.data[i + 2] = 236 + n;
            img.data[i + 3] = 255;
        }
        tctx.putImageData(img, 0, 0);
        const grain = ctx.createPattern(tile, 'repeat')!;

        const paintPaper = () => {
            const w = canvas.width, h = canvas.height;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            ctx.fillStyle = PAPER;
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = grain;
            ctx.fillRect(0, 0, w, h);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        /**
         * Wipes one swath-width band of the sheet back to bare paper.
         *
         * Not `destination-out` — that punches a hole clean through the canvas and you
         * see the page background through it, not paper. Instead the band is stroked
         * with the paper fill and then the grain pattern, which repaints it exactly as
         * `paintPaper` would. Both run at the identity transform (coordinates scaled by
         * hand) because a canvas pattern lives in the *current* transform's space: at
         * the dpr transform the grain would come out at a different scale and the wiped
         * band would seam visibly against the untouched sheet.
         */
        const wipe = (from: Point, to: Point) => {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = WIPE_SWATH * dpr;
            ctx.beginPath();
            ctx.moveTo(from[0] * dpr, from[1] * dpr);
            ctx.lineTo(to[0] * dpr, to[1] * dpr);
            ctx.strokeStyle = PAPER;
            ctx.stroke();
            ctx.strokeStyle = grain;
            ctx.stroke();
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        };

        const resize = () => {
            // innerWidth/innerHeight, not parent dims — same reasoning as dark-veil.
            canvas.width = Math.floor(window.innerWidth * dpr);
            canvas.height = Math.floor(window.innerHeight * dpr);
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            paintPaper(); // a resize is a fresh sheet; scaling graphite would smear it
            strokes = [];
            current = null;
            stored = 0;
        };

        // Touch and coarse pointers skip drawing entirely — it would fight scrolling.
        const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let raf = 0;
        let queued: Point[] = [];
        let tail: Point[] = [];
        let ink = 0;

        // Completed geometry, kept so the erase has routes to retrace. Drawing alone
        // would not need it — the canvas is the only state the pencil requires.
        let strokes: Point[][] = [];
        let current: Point[] | null = null;
        let stored = 0;

        let erasing = false;

        resize();
        window.addEventListener('resize', resize);

        /**
         * Draws this frame's samples as ONE smoothed path, in a few offset passes.
         *
         * Per-segment strokes were the first attempt and they beaded: every sample got
         * its own round-capped line, so the caps stacked at each join and a fast drag
         * came out as a string of dots. Curving through the points with the midpoints as
         * anchors gives a single continuous path instead, and offsetting the WHOLE path
         * per pass (rather than jittering each segment) keeps the pencil's tooth without
         * reintroducing lumps.
         */
        const drawPath = (pts: Point[]) => {
            if (pts.length < 2) return;

            // Faster movement leaves a lighter, thinner line, the way a real pencil does.
            const speed = Math.min(polylineLength(pts) / (pts.length - 1) / 22, 1);
            const width = 3.2 - speed * 1.6;
            // Colour needs more of itself than graphite does to survive `multiply` on a
            // warm ground — at graphite's alpha the muted hues barely register.
            const alpha = (ink === 0 ? 0.14 : 0.2) - speed * 0.05;

            ctx.globalCompositeOperation = 'multiply';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            for (let p = 0; p < 3; p++) {
                const ox = (Math.random() - 0.5) * 1.5;
                const oy = (Math.random() - 0.5) * 1.5;
                ctx.strokeStyle = `rgba(${INKS[ink]}, ${alpha})`;
                ctx.lineWidth = width * (0.7 + Math.random() * 0.5);
                ctx.beginPath();
                ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
                for (let i = 1; i < pts.length - 1; i++) {
                    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
                    const my = (pts[i][1] + pts[i + 1][1]) / 2;
                    ctx.quadraticCurveTo(pts[i][0] + ox, pts[i][1] + oy, mx + ox, my + oy);
                }
                const end = pts[pts.length - 1];
                ctx.lineTo(end[0] + ox, end[1] + oy);
                ctx.stroke();
            }
        };

        const flush = () => {
            raf = 0;
            // Carry the previous frame's last two points so consecutive frames join
            // smoothly instead of restarting the curve every 16ms.
            const pts = tail.concat(queued);
            queued = [];
            drawPath(pts);
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

        // Leaving the window breaks the line rather than connecting across the gap.
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

        // ── The erase ─────────────────────────────────────────────────────────────
        let eraseRaf = 0;

        const finishErase = () => {
            paintPaper();
            strokes = [];
            current = null;
            stored = 0;
            tail = [];
            erasing = false;
        };

        const runErase = () => {
            if (erasing) return;
            const paths = strokes.filter((s) => s.length >= 2);
            // Nothing drawn, or motion is unwelcome: just hand back a clean sheet.
            if (!paths.length || reduced) {
                finishErase();
                return;
            }
            erasing = true;

            // Dispatch however many wipers it takes to clear the ink inside ERASE_MS,
            // capped so a heavily-scribbled sheet doesn't spawn an unbounded number.
            const total = paths.reduce((sum, p) => sum + polylineLength(p), 0);
            const count = Math.max(
                1,
                Math.min(MAX_WIPERS, Math.ceil(total / (WIPE_SPEED * (ERASE_MS / 1000))))
            );

            // Longest-first into the emptiest bucket: a cheap balance that keeps every
            // wiper busy for roughly the same three seconds.
            const buckets: Array<{ pts: Point[]; len: number }> = Array.from(
                { length: count },
                () => ({ pts: [], len: 0 })
            );
            [...paths]
                .sort((a, b) => polylineLength(b) - polylineLength(a))
                .forEach((path) => {
                    const target = buckets.reduce((min, b) => (b.len < min.len ? b : min));
                    target.pts.push(...path);
                    target.len += polylineLength(path);
                });

            // Precompute cumulative arc length so each frame is a lookup, not a re-walk.
            const routes = buckets
                .filter((b) => b.pts.length >= 2)
                .map((b) => {
                    const cum = [0];
                    for (let i = 1; i < b.pts.length; i++) {
                        cum.push(
                            cum[i - 1] +
                                Math.hypot(
                                    b.pts[i][0] - b.pts[i - 1][0],
                                    b.pts[i][1] - b.pts[i - 1][1]
                                )
                        );
                    }
                    return { pts: b.pts, cum, total: cum[cum.length - 1], cursor: 0 };
                });

            const at = (route: (typeof routes)[number], dist: number): Point => {
                const { pts, cum } = route;
                while (route.cursor < cum.length - 2 && cum[route.cursor + 1] < dist) route.cursor++;
                const i = route.cursor;
                const span = cum[i + 1] - cum[i];
                const t = span > 0 ? (dist - cum[i]) / span : 0;
                return [
                    pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t,
                    pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t,
                ];
            };

            const prev: Point[] = routes.map((r) => at(r, 0));

            const start = performance.now();
            const step = (now: number) => {
                const t = Math.min((now - start) / ERASE_MS, 1);
                routes.forEach((route, i) => {
                    const pos = at(route, route.total * t);
                    wipe(prev[i], pos);
                    prev[i] = pos;
                });
                if (t < 1) eraseRaf = requestAnimationFrame(step);
                else finishErase();
            };
            eraseRaf = requestAnimationFrame(step);
        };

        eraseRef.current = runErase;

        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('pointerout', onLeave);
        window.addEventListener('click', onClick);
        document.addEventListener('mouseleave', onLeave);

        return () => {
            window.removeEventListener('resize', resize);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerout', onLeave);
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

function EraserIcon() {
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

