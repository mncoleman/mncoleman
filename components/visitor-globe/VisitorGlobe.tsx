'use client';

import { useEffect, useRef, useState } from 'react';
import createGlobe from 'cobe';
import type { Pin } from './visitor-api';

/**
 * Minimalist dark globe (cobe v2) with branded, PULSING, CLICKABLE pins.
 *
 * cobe's flat dot markers can't do sonar-ring pulses, receive clicks, or show
 * tooltips, so we render the globe with NO cobe markers and overlay our own DOM
 * pins, positioned every frame by replicating cobe's EXACT projection (extracted
 * from its source: U(location) + O(t)), so pins lock to the globe pixel-perfectly
 * as it spins. cobe v2 has no internal loop — we drive globe.update() from our own
 * rAF, which also lets us gate it (visibility + reduced-motion), pause the spin on
 * hover so pins are easy to target, and animate spin-to-focus.
 *
 * Interactions: hover a pin → name/location tooltip; click a pin → parent opens
 * the full details card (via onSelect).
 */

const PI = Math.PI;
const EE = 0.8; // cobe base radius
const MARKER_ELEVATION = 0.05; // cobe default markerElevation
const R = EE + MARKER_ELEVATION; // 0.85 — where cobe places markers

const BASE_COLOR: [number, number, number] = [0.11, 0.11, 0.13];
const GLOW_COLOR: [number, number, number] = [0.16, 0.17, 0.22];

const AUTO_SPEED = 0.0032;
const DRAG_THRESHOLD = 5;

// cobe's location -> unit vector (verbatim from cobe/dist U()).
function toVec(lat: number, lng: number): [number, number, number] {
    const r = (lat * PI) / 180;
    const a = (lng * PI) / 180 - PI;
    const o = Math.cos(r);
    return [-o * Math.cos(a), Math.sin(r), o * Math.sin(a)];
}

interface Props {
    pins: Pin[];
    focusedId?: string | null;
    className?: string;
    onSelect?: (id: string) => void;
    onUserInteract?: () => void;
}

function shortestTo(current: number, target: number): number {
    const twoPi = PI * 2;
    let t = target;
    while (t - current > PI) t -= twoPi;
    while (t - current < -PI) t += twoPi;
    return t;
}

export default function VisitorGlobe({ pins, focusedId, className, onSelect, onUserInteract }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const pinEls = useRef<Map<string, HTMLDivElement>>(new Map());

    const pinsRef = useRef<Pin[]>(pins);
    const focusedRef = useRef<string | null | undefined>(focusedId);
    const onInteractRef = useRef<(() => void) | undefined>(onUserInteract);
    pinsRef.current = pins;
    onInteractRef.current = onUserInteract;

    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const hoveredIdRef = useRef<string | null>(null);
    hoveredIdRef.current = hoveredId;

    const st = useRef({
        phi: 0,
        theta: 0.22,
        targetPhi: null as number | null,
        targetTheta: 0.22,
        dragging: false,
        didDrag: false,
        hovering: false,
        onscreen: true,
        pageVisible: true,
        reduce: false,
        raf: 0,
        looping: false,
    });

    const ensureLoopRef = useRef<() => void>(() => {});

    useEffect(() => {
        focusedRef.current = focusedId;
        const s = st.current;
        if (!focusedId) {
            s.targetPhi = null;
            return;
        }
        const pin = pinsRef.current.find((p) => p.id === focusedId);
        if (!pin) {
            s.targetPhi = null;
            return;
        }
        const t = toVec(pin.lat, pin.lng);
        const raw = Math.atan2(-t[0], t[2]);
        s.targetPhi = shortestTo(s.phi, raw);
        s.targetTheta = Math.max(-0.5, Math.min(0.5, ((pin.lat * PI) / 180) * 0.6));
        if (s.reduce) {
            s.phi = s.targetPhi;
            s.theta = s.targetTheta;
        }
        ensureLoopRef.current();
    }, [focusedId]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        if (!canvas || !wrap) return;
        const s = st.current;
        s.reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let cssW = 1;
        let cssH = 1;
        const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 2);

        const measure = () => {
            const rect = canvas.getBoundingClientRect();
            cssW = Math.max(1, rect.width);
            cssH = Math.max(1, rect.height);
        };
        measure();

        const globe = createGlobe(canvas, {
            devicePixelRatio: dpr,
            width: cssW * dpr,
            height: cssH * dpr,
            phi: s.phi,
            theta: s.theta,
            dark: 1,
            diffuse: 1.1,
            mapSamples: 16000,
            mapBrightness: 5,
            mapBaseBrightness: 0.06,
            baseColor: BASE_COLOR,
            markerColor: BASE_COLOR,
            glowColor: GLOW_COLOR,
            markers: [],
            opacity: 0.92,
        });

        const positionPins = () => {
            const cosT = Math.cos(s.theta);
            const sinT = Math.sin(s.theta);
            const cosP = Math.cos(s.phi);
            const sinP = Math.sin(s.phi);
            const aspect = cssW / cssH;
            const hid = hoveredIdRef.current;
            let hx = 0;
            let hy = 0;
            let hFront = false;
            let hasHover = false;
            for (const p of pinsRef.current) {
                const el = pinEls.current.get(p.id);
                if (!el) continue;
                const v = toVec(p.lat, p.lng);
                const t0 = v[0] * R;
                const t1 = v[1] * R;
                const t2 = v[2] * R;
                const c = cosP * t0 + sinP * t2;
                const sv = sinP * sinT * t0 + cosT * t1 - cosP * sinT * t2;
                const zz = -sinP * cosT * t0 + sinT * t1 + cosP * cosT * t2;
                const x = ((c / aspect + 1) / 2) * cssW;
                const y = ((-sv + 1) / 2) * cssH;
                const front = zz >= 0;
                el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
                const op = front ? Math.min(1, Math.max(0, zz * 4)) : 0;
                el.style.opacity = op.toFixed(3);
                el.style.zIndex = String(1000 + Math.round(zz * 500));
                el.style.pointerEvents = front && op > 0.35 ? 'auto' : 'none';
                if (focusedRef.current === p.id) el.classList.add('vg-pin--focused');
                else el.classList.remove('vg-pin--focused');
                if (p.id === hid) {
                    hx = x;
                    hy = y;
                    hFront = front && op > 0.35;
                    hasHover = true;
                }
            }
            const tip = tooltipRef.current;
            if (tip) {
                if (hasHover && hFront) {
                    tip.style.transform = `translate3d(${hx}px, ${hy - 20}px, 0) translate(-50%, -100%)`;
                    tip.style.opacity = '1';
                } else {
                    tip.style.opacity = '0';
                }
            }
        };

        const focusAnimating = () =>
            s.targetPhi !== null &&
            Math.abs(s.targetPhi - s.phi) + Math.abs(s.targetTheta - s.theta) > 0.001;

        const shouldLoop = () => {
            if (!s.onscreen || !s.pageVisible) return false;
            if (s.dragging || s.hovering || focusAnimating()) return true;
            return !s.reduce;
        };

        const draw = () => {
            globe.update({ phi: s.phi, theta: s.theta, width: cssW * dpr, height: cssH * dpr, markers: [] });
            positionPins();
        };

        const render = () => {
            if (!shouldLoop()) {
                s.looping = false;
                draw();
                return;
            }
            if (s.targetPhi !== null) {
                s.phi += (s.targetPhi - s.phi) * 0.09;
                s.theta += (s.targetTheta - s.theta) * 0.09;
            } else if (!s.dragging && !s.hovering) {
                s.phi += AUTO_SPEED;
            }
            draw();
            s.raf = requestAnimationFrame(render);
        };

        const startLoop = () => {
            if (s.looping) return;
            if (!shouldLoop()) {
                draw();
                return;
            }
            s.looping = true;
            s.raf = requestAnimationFrame(render);
        };
        ensureLoopRef.current = startLoop;

        // ── drag to rotate ──
        let lastX = 0;
        let lastY = 0;
        let downX = 0;
        let downY = 0;
        const onPointerDown = (e: PointerEvent) => {
            s.dragging = true;
            s.didDrag = false;
            s.targetPhi = null;
            focusedRef.current = null;
            onInteractRef.current?.();
            lastX = downX = e.clientX;
            lastY = downY = e.clientY;
            canvas.style.cursor = 'grabbing';
            startLoop();
        };
        const onPointerMove = (e: PointerEvent) => {
            if (!s.dragging) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            if (Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY) > DRAG_THRESHOLD) s.didDrag = true;
            s.phi += dx * 0.006;
            s.theta = Math.max(-0.9, Math.min(0.9, s.theta + dy * 0.006));
        };
        const onPointerUp = () => {
            s.dragging = false;
            canvas.style.cursor = 'grab';
            startLoop();
        };
        wrap.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);

        // Pause the spin while hovering the globe so pins are easy to target.
        const onEnter = () => {
            s.hovering = true;
            startLoop();
        };
        const onLeave = () => {
            s.hovering = false;
            hoveredIdRef.current = null;
            setHoveredId(null);
            startLoop();
        };
        wrap.addEventListener('pointerenter', onEnter);
        wrap.addEventListener('pointerleave', onLeave);

        // ── gating ──
        const onVisibility = () => {
            s.pageVisible = !document.hidden;
            startLoop();
        };
        document.addEventListener('visibilitychange', onVisibility);
        const io = new IntersectionObserver(
            (entries) => {
                s.onscreen = entries[0]?.isIntersecting ?? true;
                startLoop();
            },
            { threshold: 0.02 }
        );
        io.observe(canvas);
        const onResize = () => {
            measure();
            startLoop();
        };
        window.addEventListener('resize', onResize);

        startLoop();

        return () => {
            cancelAnimationFrame(s.raf);
            s.looping = false;
            ensureLoopRef.current = () => {};
            wrap.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            wrap.removeEventListener('pointerenter', onEnter);
            wrap.removeEventListener('pointerleave', onLeave);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('resize', onResize);
            io.disconnect();
            globe.destroy();
        };
    }, []);

    const pinLabel = (p: Pin) => (p.name ? `${p.name} — ${p.place_label}` : p.place_label);
    const hovered = hoveredId ? pins.find((p) => p.id === hoveredId) : null;

    return (
        <div ref={wrapRef} className={className} style={{ position: 'relative', touchAction: 'pan-y' }}>
            <canvas
                ref={canvasRef}
                aria-label="Interactive globe of where visitors are from"
                role="img"
                style={{ width: '100%', height: '100%', display: 'block', cursor: 'grab', contain: 'layout paint size' }}
            />
            <div className="vg-pin-layer" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                {pins.map((p) => (
                    <div
                        key={p.id}
                        ref={(el) => {
                            if (el) pinEls.current.set(p.id, el);
                            else pinEls.current.delete(p.id);
                        }}
                        className="vg-pin"
                        style={{ opacity: 0 }}
                    >
                        {/* Hit target first so `:hover ~ .vg-pin-dot` works and the
                            transparent button sits under the visible dot/rings. */}
                        <button
                            type="button"
                            className="vg-pin-hit"
                            aria-label={pinLabel(p)}
                            onPointerEnter={() => setHoveredId(p.id)}
                            onPointerLeave={() => setHoveredId((cur) => (cur === p.id ? null : cur))}
                            onClick={() => {
                                if (st.current.didDrag) return;
                                onSelect?.(p.id);
                            }}
                        />
                        <span className="vg-pin-ring" />
                        <span className="vg-pin-ring vg-pin-ring--2" />
                        <span className="vg-pin-dot" />
                    </div>
                ))}

                {/* Single hover tooltip, positioned each frame over the hovered pin. */}
                {hovered && (
                    <div ref={tooltipRef} className="vg-pin-tip glass-panel" style={{ opacity: 0 }}>
                        <span className="vg-pin-tip-name">{hovered.name || 'A visitor'}</span>
                        <span className="vg-pin-tip-place">{hovered.place_label}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
