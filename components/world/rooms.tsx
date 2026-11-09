'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { BRIDGE_W, CORE_R, HUB_R, POD_D, POD_R, ROOMS, useWorld, type Item, type Look, type RoomDef, type RoomId } from './store';
import { Arc, GlassCard, GlassDisc, Interact, Label, Line, Pane, Slab, noRay, rng, usePal, type V3 } from './kit';

/**
 * The place itself: a round, dark room at the centre of the site, with a door
 * for every page and a window between each pair of doors looking out at the
 * Dark Veil. Through each door, a short passage to that page's own round room,
 * where its content hangs as the same glass cards the site is made of.
 *
 * The room is the site's dark mode — near-black walls, hairlines, type. The
 * blue is outside, where it is on the home page: behind everything.
 */

export interface Content {
    home: Item;
    posts: Item[];
    projects: Item[];
    resources: Item[];
    artifacts: Item[];
    about: Item[];
    resume: Item;
    ai: Item;
    mcp: Item;
}

const HP = Math.PI / 2;
const TAU = Math.PI * 2;
const HH = 4.2;
const DOOR_H = 2.7;
const BRIDGE_IN = HUB_R - 0.15;
const BRIDGE_OUT = POD_D - POD_R + 0.15;
const SILL = 0.55;
const HEAD = 3.45;

/* ── Sky ────────────────────────────────────────────────────────────────── */

/** What is outside the windows: Dark Veil, a star field, or nothing. */
function Sky({ kind }: { kind: Look['sky'] }) {
    const pal = usePal();
    const tex = useMemo(() => {
        const W = 2048;
        const Hh = 1024;
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = Hh;
        const g = cv.getContext('2d')!;
        g.fillStyle = pal.dark ? '#030508' : '#dfe8f3';
        g.fillRect(0, 0, W, Hh);
        const rnd = rng(kind === 'veil' ? 5 : 9);
        if (kind === 'veil') {
            // Drifts of the veil's blue, then a few bright folds across them.
            const tones = pal.dark
                ? ['rgba(34,98,196,0.7)', 'rgba(18,52,120,0.75)', 'rgba(96,164,240,0.42)', 'rgba(46,78,170,0.55)']
                : ['rgba(120,170,230,0.5)', 'rgba(170,200,240,0.55)', 'rgba(90,140,210,0.3)', 'rgba(200,215,240,0.6)'];
            for (let i = 0; i < 13; i++) {
                const x = rnd() * W;
                const y = Hh * (0.3 + rnd() * 0.4);
                const r = 160 + rnd() * 380;
                // Drawn a full turn either side as well, so the seam behind you closes.
                for (const ox of [0, W, -W]) {
                    const grad = g.createRadialGradient(x + ox, y, 0, x + ox, y, r);
                    grad.addColorStop(0, tones[i % tones.length]);
                    grad.addColorStop(1, 'rgba(0,0,0,0)');
                    g.fillStyle = grad;
                    g.fillRect(x + ox - r, y - r, r * 2, r * 2);
                }
            }
            for (let i = 0; i < 6; i++) {
                const x = rnd() * W;
                g.save();
                g.translate(x, Hh / 2);
                g.rotate(-0.6 + rnd() * 1.2);
                const band = g.createLinearGradient(-70, 0, 70, 0);
                band.addColorStop(0, 'rgba(0,0,0,0)');
                band.addColorStop(0.5, pal.dark ? 'rgba(140,196,255,0.3)' : 'rgba(255,255,255,0.7)');
                band.addColorStop(1, 'rgba(0,0,0,0)');
                g.fillStyle = band;
                g.fillRect(-70, -Hh, 140, Hh * 2);
                g.restore();
            }
        }
        if (kind !== 'plain') {
            const count = kind === 'stars' ? 1600 : 90;
            for (let i = 0; i < count; i++) {
                const a = 0.1 + rnd() * 0.55;
                g.fillStyle = pal.dark ? `rgba(255,255,255,${a})` : `rgba(40,50,70,${a * 0.5})`;
                const sz = rnd() < 0.94 ? 1 : 1.8;
                g.fillRect(rnd() * W, rnd() * Hh, sz, sz);
            }
        }
        const t = new THREE.CanvasTexture(cv);
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
    }, [kind, pal.dark]);
    useEffect(() => () => tex.dispose(), [tex]);
    const ref = useRef<THREE.Mesh>(null);
    useFrame((_, dt) => {
        // The veil drifts, slowly, as it does behind the home page.
        if (ref.current) ref.current.rotation.y += dt * 0.006;
    });
    return (
        <mesh ref={ref} raycast={noRay}>
            <sphereGeometry args={[110, 48, 32]} />
            <meshBasicMaterial map={tex} side={THREE.BackSide} toneMapped={false} depthWrite={false} />
        </mesh>
    );
}

/* ── Room pieces ────────────────────────────────────────────────────────── */

const onRing = (r: number, a: number, y: number): V3 => [Math.sin(a) * r, y, -Math.cos(a) * r];

/** A window in a round wall: sill, head, a pane, and a drawn frame. */
function Window({ r, a0, a1 }: { r: number; a0: number; a1: number }) {
    const mid = (a0 + a1) / 2;
    return (
        <>
            <Arc r={r} a0={a0} a1={a1} y0={0} y1={SILL} />
            <Arc r={r} a0={a0} a1={a1} y0={HEAD} y1={HH} />
            <Arc r={r} a0={a0} a1={a1} y0={SILL} y1={HEAD} kind="glass" />
            <Arc r={r - 0.01} a0={a0} a1={a1} y0={SILL} y1={SILL + 0.025} kind="line" />
            <Arc r={r - 0.01} a0={a0} a1={a1} y0={HEAD - 0.025} y1={HEAD} kind="line" />
            {[a0, mid, a1].map((a) => (
                <Line key={a} s={[0.025, HEAD - SILL, 0.025]} p={onRing(r - 0.01, a, (SILL + HEAD) / 2)} r={[0, -a, 0]} dim />
            ))}
        </>
    );
}

/** A ceiling with a ring of light in it. */
function Ceiling({ r, ring }: { r: number; ring: number }) {
    const pal = usePal();
    return (
        <group position={[0, HH, 0]}>
            <mesh rotation={[HP, 0, 0]}>
                <circleGeometry args={[r, 64]} />
                <meshBasicMaterial color={pal.ceil} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
            <mesh rotation={[HP, 0, 0]} position={[0, -0.02, 0]} raycast={noRay}>
                <torusGeometry args={[ring, 0.035, 8, 96]} />
                <meshBasicMaterial color={pal.dark ? '#ffffff' : '#d4d4d8'} toneMapped={false} />
            </mesh>
            <mesh rotation={[HP, 0, 0]} position={[0, -0.01, 0]} raycast={noRay}>
                <ringGeometry args={[ring - 0.5, ring + 0.5, 96]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={pal.dark ? 0.05 : 0.5} side={THREE.DoubleSide} depthWrite={false} toneMapped={false} />
            </mesh>
        </group>
    );
}

/** A doorway drawn in light: two posts and a beam. */
function Gate({ z }: { z: number }) {
    const half = BRIDGE_W / 2;
    return (
        <group position={[0, 0, z]}>
            <Line s={[0.03, DOOR_H, 0.03]} p={[-half, DOOR_H / 2, 0]} />
            <Line s={[0.03, DOOR_H, 0.03]} p={[half, DOOR_H / 2, 0]} />
            <Line s={[half * 2 + 0.03, 0.03, 0.03]} p={[0, DOOR_H, 0]} />
        </group>
    );
}

/* ── Hub ────────────────────────────────────────────────────────────────── */

/** Turns to face you, so the card in the middle reads from anywhere in the room. */
function Facing({ children, y }: { children: React.ReactNode; y: number }) {
    const g = useRef<THREE.Group>(null);
    useFrame(({ camera }) => {
        if (g.current) g.current.rotation.y = Math.atan2(camera.position.x, camera.position.z);
    });
    return (
        <group ref={g} position={[0, y, 0]}>
            {children}
        </group>
    );
}

function Hub({ home, room }: { home: Item; room: boolean }) {
    const pal = usePal();
    const gap = Math.asin((BRIDGE_W / 2 + 0.02) / HUB_R);
    const step = TAU / ROOMS.length;
    const pier = 0.07;
    return (
        <group>
            <GlassDisc radius={HUB_R} rings={5} spokes={ROOMS.length * 4} solid={room} rim={!room} />
            {room ? (
                <>
                    <Ceiling r={HUB_R} ring={3.4} />
                    {ROOMS.map((r) => {
                        const a = r.angle;
                        return (
                            <group key={r.id}>
                                <Arc r={HUB_R} a0={a - gap} a1={a + gap} y0={DOOR_H} y1={HH} />
                                <Arc r={HUB_R} a0={a + gap} a1={a + gap + pier} y0={0} y1={HH} />
                                <Window r={HUB_R} a0={a + gap + pier} a1={a + step - gap - pier} />
                                <Arc r={HUB_R} a0={a + step - gap - pier} a1={a + step - gap} y0={0} y1={HH} />
                            </group>
                        );
                    })}
                </>
            ) : (
                // No walls: a waist-high glass rail between the bridges instead.
                ROOMS.map((r) => (
                    <group key={r.id}>
                        <Arc r={HUB_R} a0={r.angle + gap + 0.04} a1={r.angle + step - gap - 0.04} y0={0} y1={1.1} kind="glass" />
                        <Arc r={HUB_R} a0={r.angle + gap + 0.04} a1={r.angle + step - gap - 0.04} y0={1.08} y1={1.105} kind="line" />
                    </group>
                ))
            )}

            {/* The core: a glass drum with the home page hovering over it. */}
            <mesh position={[0, 0.45, 0]}>
                <cylinderGeometry args={[CORE_R, CORE_R, 0.9, 48, 1, true]} />
                <meshBasicMaterial color={pal.glass} transparent opacity={pal.dark ? 0.07 : 0.5} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
            {[0.012, 0.9].map((y) => (
                <mesh key={y} position={[0, y, 0]} rotation={[-HP, 0, 0]} raycast={noRay}>
                    <torusGeometry args={[CORE_R, 0.016, 8, 64]} />
                    <meshBasicMaterial color={pal.accent} toneMapped={false} />
                </mesh>
            ))}
            <Facing y={1.95}>
                <Interact target={{ id: 'home', hint: 'Read', label: home.title, item: home }}>
                    <GlassCard w={1.9} h={1.15} kind="Introduction" title={home.title} text={home.text} cta="Read" />
                </Interact>
            </Facing>
        </group>
    );
}

/* ── Pods ───────────────────────────────────────────────────────────────── */

function Pod({ room, items, verb, walls }: { room: RoomDef; items: Item[]; verb: string; walls: boolean }) {
    const pal = usePal();
    const shown = items.slice(0, 18);
    const rows = Math.min(3, Math.max(1, Math.ceil(shown.length / 6)));
    const perRow = Math.ceil(shown.length / rows);
    const h = rows === 3 ? 0.82 : rows === 2 ? 1.08 : 1.3;
    const w = rows === 1 ? 1.15 : 1.0;
    const arc = POD_R - 0.4;
    const step = (w + 0.14) / arc;
    const base = 0.55;
    const top = base + rows * (h + 0.12);
    const len = BRIDGE_OUT - BRIDGE_IN + 0.5;
    const mid = -(BRIDGE_IN + BRIDGE_OUT) / 2;
    const da = Math.asin((BRIDGE_W / 2 + 0.02) / POD_R);
    return (
        <group rotation={[0, room.rot, 0]}>
            {/* Hub side: the door, its name over it, and the whole opening as a click target. */}
            <Gate z={-BRIDGE_IN} />
            <Interact target={{ id: `gate-${room.id}`, hint: 'Go to', label: room.title, goto: room.id }} p={[0, 0, -BRIDGE_IN]} pull={[0, 0, 0]} swell={1}>
                <Label text={room.title} w={2.3} h={0.42} p={[0, 3.12, 0]} size={0.24} weight={700} upper spacing={0.14} maxLines={1} />
                <Pane w={BRIDGE_W} h={DOOR_H} p={[0, DOOR_H / 2, 0]} a={0} />
            </Interact>

            {/* The passage. */}
            {walls ? (
                <>
                    <Slab w={BRIDGE_W} h={len} p={[0, 0.002, mid]} r={[-HP, 0, 0]} c={pal.floor} />
                    <Slab w={BRIDGE_W} h={len} p={[0, DOOR_H, mid]} r={[HP, 0, 0]} c={pal.ceil} />
                    <Slab w={len} h={DOOR_H} p={[-BRIDGE_W / 2, DOOR_H / 2, mid]} r={[0, HP, 0]} />
                    <Slab w={len} h={DOOR_H} p={[BRIDGE_W / 2, DOOR_H / 2, mid]} r={[0, HP, 0]} />
                </>
            ) : (
                <Pane w={BRIDGE_W} h={len} p={[0, 0.002, mid]} r={[-HP, 0, 0]} a={pal.dark ? 0.05 : 0.6} />
            )}
            <Line s={[0.02, 0.02, len]} p={[-BRIDGE_W / 2 + 0.02, 0.015, mid]} dim />
            <Line s={[0.02, 0.02, len]} p={[BRIDGE_W / 2 - 0.02, 0.015, mid]} dim />

            {/* The page's own room. */}
            <group position={[0, 0, -POD_D]}>
                <GlassDisc radius={POD_R} rings={3} spokes={20} solid={walls} rim={!walls} />
                {walls && (
                    <>
                        <Ceiling r={POD_R} ring={2.2} />
                        {/* The wall the cards hang on, a window either side, and the door behind you. */}
                        <Arc r={POD_R} a0={-1.16} a1={1.16} y0={0} y1={HH} />
                        <Window r={POD_R} a0={1.16} a1={2.05} />
                        <Arc r={POD_R} a0={2.05} a1={Math.PI - da} y0={0} y1={HH} />
                        <Arc r={POD_R} a0={Math.PI - da} a1={Math.PI + da} y0={DOOR_H} y1={HH} />
                        <Arc r={POD_R} a0={Math.PI + da} a1={TAU - 2.05} y0={0} y1={HH} />
                        <Window r={POD_R} a0={TAU - 2.05} a1={TAU - 1.16} />
                    </>
                )}
            </group>
            <Gate z={-BRIDGE_OUT} />
            <Interact target={{ id: `home-${room.id}`, hint: 'Back to', label: 'the hub', goto: 'home' }} p={[0, 0, -BRIDGE_OUT]} r={[0, Math.PI, 0]} pull={[0, 0, 0]} swell={1}>
                <Label text="Home" w={2.3} h={0.36} p={[0, 3.05, 0]} size={0.18} color={pal.dim} weight={700} upper spacing={0.16} maxLines={1} />
                <Pane w={BRIDGE_W} h={DOOR_H} p={[0, DOOR_H / 2, 0]} a={0} />
            </Interact>

            <Label text={room.title} w={4.2} h={0.5} p={[0, top + 0.36, -POD_D - arc + 0.5]} size={0.36} weight={700} maxLines={1} />
            {shown.map((item, i) => {
                const row = Math.floor(i / perRow);
                const inRow = Math.min(perRow, shown.length - row * perRow);
                const phi = ((i % perRow) - (inRow - 1) / 2) * step;
                const y = base + (rows - 1 - row) * (h + 0.12) + h / 2;
                return (
                    <Interact
                        key={item.id}
                        target={{ id: `${room.id}-${item.id}`, hint: verb, label: item.title, item }}
                        p={[Math.sin(phi) * arc, y, -POD_D - Math.cos(phi) * arc]}
                        r={[0, -phi, 0]}
                    >
                        <GlassCard w={w} h={h} kind={item.kind} title={item.title} text={item.text} tags={item.tags} cta={verb} />
                    </Interact>
                );
            })}
        </group>
    );
}

/* ── Everything ─────────────────────────────────────────────────────────── */

export function Space({ content }: { content: Content }) {
    const look = useWorld((s) => s.look);
    const walls = look.shell === 'room';
    const items: Record<Exclude<RoomId, 'home'>, [Item[], string]> = {
        blog: [content.posts, 'Read'],
        projects: [content.projects, 'Open'],
        resources: [content.resources, 'Open'],
        artifacts: [content.artifacts, 'View'],
        ai: [[content.ai, content.mcp], 'Open'],
        resume: [[content.resume], 'Read'],
        about: [content.about, 'Read'],
    };
    return (
        <>
            <Sky kind={look.sky} />
            <Hub home={content.home} room={walls} />
            {ROOMS.map((room) => {
                const [list, verb] = items[room.id as Exclude<RoomId, 'home'>];
                return <Pod key={room.id} room={room} items={list} verb={verb} walls={walls} />;
            })}
        </>
    );
}
