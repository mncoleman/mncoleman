'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';
import { setThemeWithTransition } from '@/lib/theme-transition';
import { playSwitch } from '@/lib/click-sound';
import type {
    Engine as EngineType,
    Body as BodyType,
    Constraint as ConstraintType,
} from 'matter-js';

/**
 * Pull-chain light/dark toggle — ported from the Dovito Hub `pull-chain-toggle`
 * component (Font Awesome bulb variant). The chain is a real Matter.js rope: a string
 * of circular bodies joined by distance constraints, hanging under gravity.
 *
 * Click the bulb, or grab the knob and pull it down, to flip the theme. Flicking the
 * chain sideways just swings it — only a genuine downward pull toggles.
 *
 * Two behaviours from the source are load-bearing; don't "simplify" them:
 *  - the max-reach clamp, which stops the chain stretching down over page content
 *  - the three-way release (pointerup + pointercancel + lostpointercapture) with a
 *    one-shot guard, which is what stops a chain getting stuck pinned to the cursor
 */

// Font Awesome 6 — lightbulb (solid), viewBox 384x512.
const BULB_PATH =
    'M272 384c9.6-31.9 29.5-59.1 49.2-86.2c5.2-7.1 10.4-14.2 15.4-21.4c19.8-28.5 31.4-63 31.4-100.3C368 78.8 289.2 0 192 0S16 78.8 16 176c0 37.3 11.6 71.9 31.4 100.3c5 7.2 10.2 14.3 15.4 21.4c19.8 27 39.6 54.4 49.2 86.2l160 0zM192 512c44.2 0 80-35.8 80-80l0-16-160 0 0 16c0 44.2 35.8 80 80 80zM112 176c0 8.8-7.2 16-16 16s-16-7.2-16-16c0-61.9 50.1-112 112-112c8.8 0 16 7.2 16 16s-7.2 16-16 16c-44.2 0-80 35.8-80 80z';

const CX = 80;
const VBH = 150;
const BULB_SIZE = 42;
const CORD_BASE = 14;
const CHAIN_LEN = 40;
const BEADS = 5;

const FA_VB = 384;
const SCALE = BULB_SIZE / 512;
const BULB_W = FA_VB * SCALE;
const BULB_H = 512 * SCALE;
const BULB_TOP = 20;
const PIVOT_Y = BULB_TOP + BULB_H + 2;

// The rope's rest geometry. setupPhysics seeds bead i at exactly this y, so rendering it
// server-side means the chain is already in place at first paint and does not jump when
// the lazily-loaded engine takes over.
const SEG_LEN = CHAIN_LEN / (BEADS + 1);
const REST_Y = (i: number) => PIVOT_Y + SEG_LEN * (i + 1);
const REST_POINTS = [
    `${CX},${PIVOT_Y}`,
    ...Array.from({ length: BEADS }, (_, i) => `${CX},${REST_Y(i).toFixed(1)}`),
].join(' ');

export function PullChainToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const svgRef = useRef<SVGSVGElement>(null);
    const [mounted, setMounted] = useState(false);

    // The physics loop lives outside React and must always call the *current* toggle.
    // Every route into the toggle goes through this one ref — the chain pull, the
    // bulb click and the screen-reader button — so the chain snap cannot end up on
    // only some of them.
    const toggleRef = useRef<() => void>(() => {});
    useEffect(() => {
        toggleRef.current = () => {
            playSwitch();
            setThemeWithTransition(setTheme, resolvedTheme === 'light' ? 'dark' : 'light');
        };
    }, [resolvedTheme, setTheme]);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;

        // Reduced motion: no rope simulation. The button below still toggles the theme.
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        let teardown: (() => void) | null = null;
        let cancelled = false;

        // matter-js is ~36 KB gzipped and this toggle lives in the header of EVERY page,
        // so a static import put a physics engine on the critical path sitewide. Load it
        // on idle instead. The SVG below renders the chain's rest pose, which is exactly
        // where the simulation starts, so nothing moves when physics takes over.
        const boot = async () => {
            const M = await import('matter-js');
            if (cancelled) return;
            teardown = start(M, svg);
        };

        const ric = window.requestIdleCallback;
        const handle = typeof ric === 'function'
            ? ric(() => void boot(), { timeout: 2000 })
            : window.setTimeout(() => void boot(), 300);

        function start(
            { Engine, Composite, Bodies, Body, Constraint }: typeof import('matter-js'),
            svg: SVGSVGElement,
        ) {
        const engine = Engine.create();
        engine.gravity.y = 1;
        engine.gravity.scale = 0.0011; // gentle — units are SVG pixels
        const world = engine.world;
        const noCollide = Body.nextGroup(true); // chain links never collide with each other

        const bulb = Bodies.circle(CX, PIVOT_Y, 5, { isStatic: true });

        const segLen = SEG_LEN;
        const chain: BodyType[] = [];
        let prev: BodyType | null = null;
        for (let i = 0; i < BEADS; i++) {
            const isHandle = i === BEADS - 1;
            const b = Bodies.circle(CX, PIVOT_Y + segLen * (i + 1), isHandle ? 4 : 2.6, {
                frictionAir: 0.018,
                density: isHandle ? 0.004 : 0.001,
                collisionFilter: { group: noCollide },
            });
            Composite.add(world, b);
            Composite.add(
                world,
                Constraint.create({
                    bodyA: prev || undefined,
                    pointA: prev ? { x: 0, y: 0 } : { x: CX, y: PIVOT_Y },
                    bodyB: b,
                    pointB: { x: 0, y: 0 },
                    length: segLen,
                    stiffness: 0.9,
                    damping: 0.08,
                })
            );
            chain.push(b);
            prev = b;
        }
        const handle = chain[BEADS - 1];
        const restHandleY = PIVOT_Y + CHAIN_LEN;

        const polyline = svg.querySelector('polyline') as SVGPolylineElement;
        const beadEls = Array.from(svg.querySelectorAll<SVGCircleElement>('circle.bead'));
        const handleEl = svg.querySelector('circle.handle') as SVGCircleElement;
        const handleHitEl = svg.querySelector('circle.handle-hit') as SVGCircleElement;

        Body.setVelocity(handle, { x: 0.6, y: 0 }); // a small sway on load

        const yank = () => {
            chain.forEach((b, i) => {
                Body.setVelocity(b, { x: b.velocity.x, y: 3 + i * (2 / chain.length) });
            });
        };

        const toLocal = (clientX: number, clientY: number) => {
            const m = svg.getScreenCTM()?.inverse();
            const p = svg.createSVGPoint();
            p.x = clientX;
            p.y = clientY;
            const r = m ? p.matrixTransform(m) : { x: clientX, y: clientY };
            return { x: r.x, y: r.y };
        };

        const maxReach = CHAIN_LEN * 1.7; // hard cap so the chain never runs over the page
        const clampTarget = (px: number, py: number) => {
            let vx = px - CX;
            let vy = py - PIVOT_Y;
            if (vy < 0) vy = 0; // can't lift the knob above the bulb
            const mag = Math.hypot(vx, vy);
            if (mag > maxReach) {
                const k = maxReach / mag;
                vx *= k;
                vy *= k;
            }
            return { x: CX + vx, y: PIVOT_Y + vy };
        };

        let drag: ConstraintType | null = null;
        let peak = 0;
        let downX = 0;
        let downY = 0;
        let moved = 0;
        let active = false;

        const onDown = (e: PointerEvent) => {
            if (drag) {
                Composite.remove(world, drag);
                drag = null;
            }
            downX = e.clientX;
            downY = e.clientY;
            moved = 0;
            peak = 0;
            active = true;
            const hp = handle.position;
            // Anchor to the knob's CURRENT position so a plain click doesn't fling it.
            drag = Constraint.create({
                pointA: { x: hp.x, y: hp.y },
                bodyB: handle,
                pointB: { x: 0, y: 0 },
                stiffness: 0.6,
                damping: 0.3,
                length: 0,
            });
            Composite.add(world, drag);
            svg.setPointerCapture(e.pointerId);
            e.preventDefault();
        };

        const onMove = (e: PointerEvent) => {
            moved = Math.max(moved, Math.hypot(e.clientX - downX, e.clientY - downY));
            if (!drag) return;
            const raw = toLocal(e.clientX, e.clientY);
            const p = clampTarget(raw.x, raw.y);
            drag.pointA.x = p.x;
            drag.pointA.y = p.y;
            peak = Math.max(peak, p.y - restHandleY);
        };

        const onRelease = (e: PointerEvent) => {
            if (!active) return; // resolve each press exactly once
            active = false;
            const wasDrag = !!drag;
            if (drag) {
                Composite.remove(world, drag);
                drag = null;
            }
            try {
                svg.releasePointerCapture(e.pointerId);
            } catch {
                /* capture already gone */
            }
            const isClick = moved < 6;
            const isPull = wasDrag && peak > 12;
            if (isClick || isPull) {
                yank();
                toggleRef.current();
            }
        };

        svg.addEventListener('pointerdown', onDown);
        svg.addEventListener('pointermove', onMove);
        svg.addEventListener('pointerup', onRelease);
        svg.addEventListener('pointercancel', onRelease);
        svg.addEventListener('lostpointercapture', onRelease);

        let raf = 0;
        let last = performance.now();
        const frame = (now: number) => {
            const dt = Math.min(now - last, 33); // clamp big gaps (tab switch etc.)
            last = now;
            Engine.update(engine as EngineType, dt);

            let pts = `${CX},${PIVOT_Y}`;
            for (const b of chain) pts += ` ${b.position.x.toFixed(1)},${b.position.y.toFixed(1)}`;
            polyline.setAttribute('points', pts);

            beadEls.forEach((el, i) => {
                el.setAttribute('cx', chain[i].position.x.toFixed(1));
                el.setAttribute('cy', chain[i].position.y.toFixed(1));
            });
            const hx = handle.position.x.toFixed(1);
            const hy = handle.position.y.toFixed(1);
            handleEl.setAttribute('cx', hx);
            handleEl.setAttribute('cy', hy);
            handleHitEl.setAttribute('cx', hx);
            handleHitEl.setAttribute('cy', hy);

            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);

        return () => {
            cancelAnimationFrame(raf);
            svg.removeEventListener('pointerdown', onDown);
            svg.removeEventListener('pointermove', onMove);
            svg.removeEventListener('pointerup', onRelease);
            svg.removeEventListener('pointercancel', onRelease);
            svg.removeEventListener('lostpointercapture', onRelease);
            Composite.clear(world, false);
            Engine.clear(engine as EngineType);
            void bulb;
        };
        }

        return () => {
            cancelled = true;
            if (typeof window.cancelIdleCallback === 'function' && typeof ric === 'function') {
                window.cancelIdleCallback(handle as number);
            } else {
                window.clearTimeout(handle as number);
            }
            teardown?.();
        };
    }, []);

    const isLight = mounted && resolvedTheme === 'light';

    return (
        <div className="pull-chain relative w-[52px] shrink-0" data-lit={isLight ? 'on' : 'off'}>
            {/* The SVG hangs below the header. pointer-events are off on the SVG box itself
                so the overhanging chain never swallows clicks meant for the page beneath —
                only the bulb and chain groups opt back in. Events still bubble to the SVG,
                where the physics listeners live. */}
            <svg
                ref={svgRef}
                viewBox={`0 0 160 ${VBH}`}
                className="absolute left-1/2 top-[-14px] w-[52px] -translate-x-1/2 overflow-visible pointer-events-none"
                aria-hidden="true"
            >
                <defs>
                    <radialGradient id="pullchain-halo" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#fff3c4" stopOpacity="0.95" />
                        <stop offset="35%" stopColor="#ffd766" stopOpacity="0.55" />
                        <stop offset="100%" stopColor="#ffb300" stopOpacity="0" />
                    </radialGradient>
                </defs>

                <line className="cord" x1={CX} y1={0} x2={CX} y2={CORD_BASE} />

                <g className="fixture pointer-events-auto cursor-pointer">
                    <circle
                        className="halo"
                        cx={CX}
                        cy={BULB_TOP + BULB_H / 2}
                        r={BULB_SIZE * 0.95}
                        fill="url(#pullchain-halo)"
                    />
                    <g
                        className="glass libfill"
                        transform={`translate(${CX - BULB_W / 2} ${BULB_TOP}) scale(${SCALE})`}
                    >
                        <path d={BULB_PATH} />
                    </g>
                </g>

                {/* Rendered at the chain's REST POSE — the exact state the simulation
                    starts from — so the toggle looks finished at first paint even though
                    matter-js only arrives on idle. The physics loop then paints over these
                    same attributes every frame. */}
                <g className="chain pointer-events-auto cursor-grab">
                    <polyline className="chain-line" points={REST_POINTS} />
                    {Array.from({ length: BEADS - 1 }).map((_, i) => (
                        <circle key={i} className="bead" r="2.6" cx={CX} cy={REST_Y(i)} />
                    ))}
                    <circle className="handle" r="5" cx={CX} cy={REST_Y(BEADS - 1)} />
                    {/* A fatter invisible hit target on the knob — the drawn knob is
                        too small to grab reliably at this size. */}
                    <circle
                        className="handle-hit"
                        r="11"
                        fill="transparent"
                        cx={CX}
                        cy={REST_Y(BEADS - 1)}
                    />
                </g>
            </svg>

            {/* The accessible path to the same state: physics is for pointer users, this
                is for keyboard and screen readers. */}
            <button
                type="button"
                role="switch"
                aria-checked={isLight}
                aria-label="Toggle light mode"
                onClick={() => toggleRef.current()}
                // The lamp has its own sound; the generic key click would double up.
                data-click-sound="off"
                className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-0 focus-visible:top-0 focus-visible:z-50 focus-visible:rounded focus-visible:bg-background focus-visible:px-2 focus-visible:py-1 focus-visible:text-xs focus-visible:ring-2 focus-visible:ring-ring"
            >
                {isLight ? 'Switch to dark mode' : 'Switch to light mode'}
            </button>
        </div>
    );
}
