'use client';

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useWorld, type Look, type Target } from './store';

/**
 * What the scene is made of: glass, hairlines and type.
 *
 * The look is the site's own, moved into space — the bento cards' translucent
 * fill and 1px border, the near-black ground, Roboto. Everything is drawn to
 * canvas textures and shown unlit, so a card in the scene is the same pixels a
 * card on the page would be, and the scene needs no lights, no models and no
 * downloads beyond its one JS chunk.
 */

export interface Pal {
    dark: boolean;
    void: string;
    text: string;
    dim: string;
    faint: string;
    fill: string;
    stroke: string;
    /** Glass as a 3D surface: colour and opacity. */
    glass: string;
    glassA: number;
    accent: string;
    /** The room itself: the site's own dark ground, not the sky's blue. */
    wall: string;
    floor: string;
    ceil: string;
}

export function palette(dark: boolean, glow: Look['glow']): Pal {
    return dark
        ? {
            dark,
            void: '#06070a',
            text: '#fafafa',
            dim: 'rgba(250,250,250,0.62)',
            faint: 'rgba(250,250,250,0.38)',
            fill: 'rgba(255,255,255,0.055)',
            stroke: 'rgba(255,255,255,0.18)',
            glass: '#ffffff',
            glassA: 0.06,
            accent: glow === 'blue' ? '#74b8ff' : '#e4e4e7',
            wall: '#0e0e10',
            floor: '#0a0a0b',
            ceil: '#08080a',
        }
        : {
            dark,
            void: '#f1efe9',
            text: '#18181b',
            dim: 'rgba(24,24,27,0.66)',
            faint: 'rgba(24,24,27,0.42)',
            fill: 'rgba(255,255,255,0.8)',
            stroke: 'rgba(0,0,0,0.14)',
            glass: '#ffffff',
            glassA: 0.5,
            accent: glow === 'blue' ? '#2f6fb0' : '#3f3f46',
            wall: '#f4f2ec',
            floor: '#e7e3da',
            ceil: '#fbfaf7',
        };
}

export const PalCtx = createContext<Pal>(palette(true, 'blue'));
export const usePal = () => useContext(PalCtx);

export type V3 = [number, number, number];
export const noRay = () => null;

/** Deterministic randomness, so the sky is the same sky on every visit. */
export function rng(seed: number) {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/* ── Type ───────────────────────────────────────────────────────────────── */

let family = '';
export function fontFamily() {
    if (!family) family = getComputedStyle(document.body).fontFamily || 'sans-serif';
    return family;
}

export function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
    const out: string[] = [];
    for (const para of text.split('\n')) {
        let line = '';
        for (const word of para.split(/\s+/)) {
            const next = line ? `${line} ${word}` : word;
            if (line && g.measureText(next).width > width) {
                out.push(line);
                line = word;
            } else {
                line = next;
            }
        }
        out.push(line);
    }
    return out;
}

function texture(cv: HTMLCanvasElement) {
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
}

/** A plane showing a canvas, unlit. */
function Sheet({ tex, w, h, p, r, both }: { tex: THREE.Texture; w: number; h: number; p?: V3; r?: V3; both?: boolean }) {
    useEffect(() => () => tex.dispose(), [tex]);
    return (
        <mesh position={p} rotation={r}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial map={tex} transparent depthWrite={false} side={both ? THREE.DoubleSide : THREE.FrontSide} toneMapped={false} />
        </mesh>
    );
}

/** A line or two of text floating on nothing. */
export function Label({
    text, w, h, p, r, size = 0.1, color, weight = 500, align = 'center', maxLines = 2, upper, spacing = 0,
}: {
    text: string; w: number; h: number; p?: V3; r?: V3; size?: number; color?: string; weight?: number;
    align?: 'left' | 'center' | 'right'; maxLines?: number; upper?: boolean; spacing?: number;
}) {
    const pal = usePal();
    const ink = color ?? pal.text;
    const tex = useMemo(() => {
        const ppu = Math.min(380, 1500 / Math.max(w, h));
        const cv = document.createElement('canvas');
        cv.width = Math.max(8, Math.round(w * ppu));
        cv.height = Math.max(8, Math.round(h * ppu));
        const g = cv.getContext('2d')!;
        const str = upper ? text.toUpperCase() : text;
        let px = size * ppu;
        let lines: string[] = [];
        for (let i = 0; i < 14; i++) {
            g.font = `${weight} ${px}px ${fontFamily()}`;
            if (spacing) g.letterSpacing = `${px * spacing}px`;
            lines = wrap(g, str, cv.width);
            if (lines.length <= maxLines && lines.length * px * 1.2 <= cv.height && lines.every((l) => g.measureText(l).width <= cv.width)) break;
            px *= 0.9;
        }
        lines = lines.slice(0, maxLines);
        g.fillStyle = ink;
        g.textBaseline = 'middle';
        g.textAlign = align;
        const lh = px * 1.2;
        const x = align === 'left' ? 0 : align === 'right' ? cv.width : cv.width / 2;
        lines.forEach((l, i) => g.fillText(l, x, (cv.height - lines.length * lh) / 2 + lh / 2 + i * lh));
        return texture(cv);
    }, [text, w, h, size, ink, weight, align, maxLines, upper, spacing]);
    return <Sheet tex={tex} w={w} h={h} p={p} r={r} />;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

/**
 * One of the site's cards, as an object: same fill, same hairline border, same
 * label / title / copy stack as the bento on the home page.
 */
export function GlassCard({
    w, h, kind, title, text, tags, cta = 'Open', p, r,
}: {
    w: number; h: number; kind: string; title: string; text?: string; tags?: string[]; cta?: string | null; p?: V3; r?: V3;
}) {
    const pal = usePal();
    const tex = useMemo(() => {
        const ppu = Math.min(460, 1500 / Math.max(w, h));
        const cv = document.createElement('canvas');
        cv.width = Math.round(w * ppu);
        cv.height = Math.round(h * ppu);
        const g = cv.getContext('2d')!;
        const u = ppu; // one world unit, in pixels
        const pad = 0.075 * u;
        const inner = cv.width - pad * 2;
        roundRect(g, 1.5, 1.5, cv.width - 3, cv.height - 3, 0.05 * u);
        g.fillStyle = pal.fill;
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = pal.stroke;
        g.stroke();

        g.textBaseline = 'top';
        g.textAlign = 'left';
        let y = pad;
        const kpx = 0.04 * u;
        g.font = `500 ${kpx}px ${fontFamily()}`;
        g.letterSpacing = `${kpx * 0.1}px`;
        g.fillStyle = pal.dim;
        g.fillText(kind.toUpperCase(), pad, y);
        g.letterSpacing = '0px';
        y += kpx * 1.9;

        // Leave room at the foot for the tags and the call to action.
        const foot = cv.height - pad - 0.05 * u - (tags?.length ? 0.075 * u : 0);
        let tpx = Math.min(0.085, w * 0.085) * u;
        let lines: string[] = [];
        for (let i = 0; i < 10; i++) {
            g.font = `700 ${tpx}px ${fontFamily()}`;
            lines = wrap(g, title, inner);
            if (lines.length <= 3 && lines.every((l) => g.measureText(l).width <= inner)) break;
            tpx *= 0.9;
        }
        lines = lines.slice(0, 3);
        g.fillStyle = pal.text;
        lines.forEach((l) => {
            g.fillText(l, pad, y);
            y += tpx * 1.18;
        });
        y += tpx * 0.3;

        if (text) {
            const bpx = 0.05 * u;
            g.font = `400 ${bpx}px ${fontFamily()}`;
            g.fillStyle = pal.dim;
            const body = wrap(g, text, inner);
            const room = Math.max(0, Math.floor((foot - y) / (bpx * 1.45)));
            body.slice(0, room).forEach((l, i) => {
                const last = i === room - 1 && body.length > room;
                g.fillText(last ? `${l.replace(/\s*\S*$/, '')}…` : l, pad, y);
                y += bpx * 1.45;
            });
        }

        let fy = cv.height - pad;
        if (cta) {
            const cpx = 0.044 * u;
            g.font = `500 ${cpx}px ${fontFamily()}`;
            g.fillStyle = pal.text;
            g.textBaseline = 'bottom';
            g.fillText(`${cta}  →`, pad, fy);
            fy -= cpx * 2;
        }
        if (tags?.length) {
            const gpx = 0.033 * u;
            g.font = `400 ${gpx}px ${fontFamily()}`;
            g.textBaseline = 'middle';
            let x = pad;
            for (const tag of tags.slice(0, 3)) {
                const tw = g.measureText(tag).width + gpx * 1.3;
                if (x + tw > cv.width - pad) break;
                roundRect(g, x, fy - gpx * 1.9, tw, gpx * 1.9, gpx * 0.95);
                g.strokeStyle = pal.stroke;
                g.lineWidth = 1.5;
                g.stroke();
                g.fillStyle = pal.dim;
                g.fillText(tag, x + gpx * 0.65, fy - gpx * 0.92);
                x += tw + gpx * 0.5;
            }
        }
        return texture(cv);
    }, [w, h, kind, title, text, tags, cta, pal]);
    return <Sheet tex={tex} w={w} h={h} p={p} r={r} both />;
}

/** A glass floor: faint fill, concentric rings and spokes, like a drafted plan. */
export function GlassDisc({ radius, p, rings = 4, spokes = 28, solid, rim = true }: { radius: number; p?: V3; rings?: number; spokes?: number; solid?: boolean; rim?: boolean }) {
    const pal = usePal();
    const tex = useMemo(() => {
        const n = 1024;
        const cv = document.createElement('canvas');
        cv.width = cv.height = n;
        const g = cv.getContext('2d')!;
        const c = n / 2;
        g.beginPath();
        g.arc(c, c, c - 2, 0, Math.PI * 2);
        if (solid) {
            // A real floor: the room's ground, with a pool of light under the ceiling ring.
            const pool = g.createRadialGradient(c, c, 0, c, c, c);
            pool.addColorStop(0, pal.dark ? '#1a1a1e' : '#ffffff');
            pool.addColorStop(0.75, pal.floor);
            pool.addColorStop(1, pal.floor);
            g.fillStyle = pool;
        } else {
            g.fillStyle = pal.dark ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.72)';
        }
        g.fill();
        g.strokeStyle = pal.dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
        g.lineWidth = 1.5;
        for (let i = 1; i <= rings; i++) {
            g.beginPath();
            g.arc(c, c, ((c - 2) * i) / (rings + 1), 0, Math.PI * 2);
            g.stroke();
        }
        for (let i = 0; i < spokes; i++) {
            const a = (i / spokes) * Math.PI * 2;
            g.beginPath();
            g.moveTo(c + Math.cos(a) * c * 0.2, c + Math.sin(a) * c * 0.2);
            g.lineTo(c + Math.cos(a) * (c - 2), c + Math.sin(a) * (c - 2));
            g.stroke();
        }
        g.beginPath();
        g.arc(c, c, c - 3, 0, Math.PI * 2);
        g.strokeStyle = pal.stroke;
        g.lineWidth = 3;
        g.stroke();
        return texture(cv);
    }, [pal, rings, spokes, solid]);
    useEffect(() => () => tex.dispose(), [tex]);
    return (
        <group position={p}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[radius, 96]} />
                <meshBasicMaterial map={tex} transparent={!solid} depthWrite={!!solid} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
            {rim && (
                <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={noRay}>
                    <torusGeometry args={[radius, 0.022, 8, 128]} />
                    <meshBasicMaterial color={pal.accent} toneMapped={false} />
                </mesh>
            )}
        </group>
    );
}

/** A lit hairline: a thin bar in the accent colour. */
export function Line({ s, p, r, dim }: { s: V3; p?: V3; r?: V3; dim?: boolean }) {
    const pal = usePal();
    return (
        <mesh position={p} rotation={r} raycast={noRay}>
            <boxGeometry args={s} />
            <meshBasicMaterial color={pal.accent} transparent={dim} opacity={dim ? 0.45 : 1} toneMapped={false} />
        </mesh>
    );
}

/** A flat pane of glass. */
export function Pane({ w, h, p, r, a }: { w: number; h: number; p?: V3; r?: V3; a?: number }) {
    const pal = usePal();
    return (
        <mesh position={p} rotation={r}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial color={pal.glass} transparent opacity={a ?? pal.glassA} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
    );
}

/* ── Aimable things ─────────────────────────────────────────────────────── */

/**
 * Makes its children a target: the player controller finds `userData.target` by
 * walking up from whatever the crosshair hits. While aimed at, the contents ease
 * toward `pull` and swell a touch — a card leaning out to meet you.
 */
export function Interact({
    target, p, r, pull = [0, 0, 0.14], swell = 1.05, children,
}: {
    target: Target; p?: V3; r?: V3; pull?: V3; swell?: number; children: ReactNode;
}) {
    const inner = useRef<THREE.Group>(null);
    const t = useRef(0);
    const hot = useWorld((s) => s.hover?.id === target.id);
    useFrame((_, dt) => {
        const g = inner.current;
        if (!g) return;
        const goal = hot ? 1 : 0;
        if (Math.abs(goal - t.current) < 0.001) return;
        t.current += (goal - t.current) * (1 - Math.exp(-dt * 14));
        const a = t.current;
        g.position.set(pull[0] * a, pull[1] * a, pull[2] * a);
        g.scale.setScalar(1 + (swell - 1) * a);
    });
    return (
        <group position={p} rotation={r} userData={{ target }}>
            <group ref={inner}>{children}</group>
        </group>
    );
}

/* ── Walls ──────────────────────────────────────────────────────────────── */

/**
 * A piece of a round wall: the slice between two bearings (radians, clockwise
 * from straight ahead) and two heights. Rooms are assembled from these — solid
 * for wall, `glass` for a window pane, `line` for a lit edge.
 */
export function Arc({
    r, a0, a1, y0, y1, kind = 'wall',
}: {
    r: number; a0: number; a1: number; y0: number; y1: number; kind?: 'wall' | 'glass' | 'line';
}) {
    const pal = usePal();
    const len = a1 - a0;
    return (
        <mesh position={[0, (y0 + y1) / 2, 0]} raycast={kind === 'wall' ? undefined : noRay}>
            <cylinderGeometry args={[r, r, y1 - y0, Math.max(6, Math.ceil(len * 24)), 1, true, Math.PI - a1, len]} />
            {kind === 'wall' ? (
                <meshBasicMaterial color={pal.wall} side={THREE.DoubleSide} toneMapped={false} />
            ) : kind === 'glass' ? (
                <meshBasicMaterial color={pal.glass} transparent opacity={pal.dark ? 0.045 : 0.25} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
            ) : (
                <meshBasicMaterial color={pal.accent} transparent opacity={0.55} side={THREE.DoubleSide} toneMapped={false} />
            )}
        </mesh>
    );
}

/** A flat opaque surface in the room's own colour. */
export function Slab({ w, h, p, r, c }: { w: number; h: number; p?: V3; r?: V3; c?: string }) {
    const pal = usePal();
    return (
        <mesh position={p} rotation={r}>
            <planeGeometry args={[w, h]} />
            <meshBasicMaterial color={c ?? pal.wall} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
    );
}
