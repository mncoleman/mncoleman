'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Light mode's backdrop: a sheet of paper you can draw on.
 *
 * Light mode used to run the Waves line art, which read as noise on white. Rather
 * than replace it with nothing, the ground becomes an actual surface — a warm paper
 * grain — and the pointer leaves graphite on it. Nothing is persisted: a reload is
 * a fresh sheet, and the eraser (which only appears once there is something to
 * erase) clears it on demand.
 *
 * Everything is procedural. A paper photo would be a few hundred KB on the critical
 * path for a decorative background; a 128px noise tile generated once and used as a
 * repeating pattern costs nothing to ship and tiles seamlessly at any viewport.
 *
 * Cost control (see the animation-loop gotcha in CLAUDE.md): there is no ambient
 * rAF loop at all. Pointer samples are queued and flushed once per frame, and the
 * loop stops the moment the pointer stops. Fine pointers only — on touch, drawing
 * would fight the scroll gesture, so it renders paper and nothing else.
 */

const PAPER = '#f7f4ec';
const GRAPHITE = '46, 46, 44';

export function PaperBackdrop() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const paintPaperRef = useRef<() => void>(() => {});
    const [hasDrawn, setHasDrawn] = useState(false);

    const erase = useCallback(() => {
        paintPaperRef.current();
        setHasDrawn(false);
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
        paintPaperRef.current = paintPaper;

        const resize = () => {
            // innerWidth/innerHeight, not parent dims — same reasoning as dark-veil.
            canvas.width = Math.floor(window.innerWidth * dpr);
            canvas.height = Math.floor(window.innerHeight * dpr);
            canvas.style.width = `${window.innerWidth}px`;
            canvas.style.height = `${window.innerHeight}px`;
            paintPaper(); // a resize is a fresh sheet; scaling graphite would smear it
        };
        resize();
        window.addEventListener('resize', resize);

        // Touch and coarse pointers skip drawing entirely — it would fight scrolling.
        const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

        let raf = 0;
        let queued: Array<[number, number]> = [];
        let tail: Array<[number, number]> = [];
        let drew = false;

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
        const drawPath = (pts: Array<[number, number]>) => {
            if (pts.length < 2) return;

            let len = 0;
            for (let i = 1; i < pts.length; i++) {
                len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
            }
            // Faster movement leaves a lighter, thinner line, the way a real pencil does.
            const speed = Math.min(len / (pts.length - 1) / 22, 1);
            const width = 3.2 - speed * 1.6;
            const alpha = 0.14 - speed * 0.05;

            ctx.globalCompositeOperation = 'multiply';
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            for (let p = 0; p < 3; p++) {
                const ox = (Math.random() - 0.5) * 1.5;
                const oy = (Math.random() - 0.5) * 1.5;
                ctx.strokeStyle = `rgba(${GRAPHITE}, ${alpha})`;
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

            // A jump this large means the pointer left and re-entered; start a new line
            // rather than drawing a stroke across the gap.
            const broken: Array<[number, number]>[] = [];
            let run: Array<[number, number]> = [];
            for (const pt of pts) {
                const prev = run[run.length - 1];
                if (prev && Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 220) {
                    broken.push(run);
                    run = [];
                }
                run.push(pt);
            }
            broken.push(run);
            for (const seg of broken) drawPath(seg);

            tail = pts.slice(-2);
            // Demand-driven: nothing is scheduled until the next pointer sample.
        };

        const onMove = (e: PointerEvent) => {
            if (!fine) return;
            queued.push([e.clientX, e.clientY]);
            if (!drew) { drew = true; setHasDrawn(true); }
            if (!raf) raf = requestAnimationFrame(flush);
        };

        // Leaving the window breaks the line rather than connecting across the gap.
        const onLeave = () => { tail = []; };

        window.addEventListener('pointermove', onMove, { passive: true });
        window.addEventListener('pointerout', onLeave);
        document.addEventListener('mouseleave', onLeave);

        return () => {
            window.removeEventListener('resize', resize);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerout', onLeave);
            document.removeEventListener('mouseleave', onLeave);
            if (raf) cancelAnimationFrame(raf);
            paintPaperRef.current = () => {};
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
                aria-label="Erase pencil marks"
                title="Erase pencil marks"
                className={cn(
                    // Third slot in the existing corner cluster: the cursor toggle sits
                    // at right-5 and scroll settings at right-[4.5rem].
                    'fixed bottom-5 right-[8rem] z-40 hidden md:inline-flex h-10 w-10',
                    'items-center justify-center rounded-lg border backdrop-blur-xl',
                    'border-border/40 bg-background/40 text-muted-foreground',
                    'transition-all duration-300 pwa-safe-bottom',
                    'hover:border-border hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    // Only offered once there is something to erase.
                    hasDrawn ? 'opacity-100' : 'pointer-events-none opacity-0'
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
