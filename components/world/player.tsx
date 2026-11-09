'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EYE, HUB_R, PLACES, POD_D, canStand, place, roomAt, roomDef, world, type RoomId, type Target } from './store';

/**
 * First-person controller.
 *
 * Two ways to look, because not everyone who lands here plays games: click to
 * capture the mouse, or just drag. Either way WASD / arrows walk. The thing
 * under the crosshair — or under the pointer, when the mouse is free — is the
 * hover target; click or E uses it. Gates and the map walk you somewhere on
 * their own, along waypoints that keep to the glass.
 */

const WALK = 3.4;
const RUN = 6;
const TRAVEL = 9;
const REACH = 7;

function spot(id: RoomId): { x: number; z: number; yaw: number } {
    const r = roomDef(id);
    if (!r) return { x: 0, z: 3.6, yaw: 0 };
    const [x, z] = place(r, 0, -POD_D + 0.4);
    return { x, z, yaw: r.rot };
}

function route(from: RoomId, to: RoomId, x: number, z: number): { pts: [number, number][]; yaw: number } {
    const pts: [number, number][] = [];
    const a = roomDef(from);
    const b = roomDef(to);
    const mouth = HUB_R - 1.3;
    if (a && from !== to) pts.push(place(a, 0, -mouth));
    const last = pts.length ? pts[pts.length - 1] : ([x, z] as [number, number]);
    const next: [number, number] = b ? place(b, 0, -mouth) : [0, 3.6];
    // Crossing the hub: step round the core rather than through it.
    if (from !== to) {
        const dx = next[0] - last[0];
        const dz = next[1] - last[1];
        const len = Math.hypot(dx, dz) || 1;
        const t = Math.max(0, Math.min(1, -(last[0] * dx + last[1] * dz) / (len * len)));
        const cx = last[0] + dx * t;
        const cz = last[1] + dz * t;
        if (Math.hypot(cx, cz) < 2.2) {
            const side = Math.hypot(cx, cz) > 0.05 ? [cx, cz] : [-dz, dx];
            const sl = Math.hypot(side[0], side[1]);
            pts.push([(side[0] / sl) * 2.6, (side[1] / sl) * 2.6]);
        }
    }
    if (b) {
        if (from !== to) pts.push(next);
        pts.push(place(b, 0, -POD_D + 0.4));
    } else {
        pts.push(next);
    }
    return { pts, yaw: b ? b.rot : 0 };
}

const turn = (from: number, to: number, k: number) => {
    let d = to - from;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return from + d * k;
};

export function Player({ start }: { start: RoomId }) {
    const { camera, gl, scene } = useThree();
    const ray = useMemo(() => new THREE.Raycaster(), []);
    const ndc = useMemo(() => new THREE.Vector2(), []);
    const st = useRef({
        ...spot(start),
        pitch: 0,
        keys: new Set<string>(),
        travel: null as null | { pts: [number, number][]; yaw: number },
        bob: 0,
        tick: 0,
        px: 0,
        py: 0,
        drag: null as null | { x: number; y: number; moved: number },
        /** Where the thing being aimed at is, so an opened item can appear there. */
        aim: new THREE.Vector3(),
    }).current;

    useEffect(() => {
        const el = gl.domElement;
        world.set({ room: start, hover: null, panel: null, panelAt: null, map: false, locked: false });

        const activate = (t: Target | null) => {
            if (!t) return false;
            if (t.goto) st.travel = route(world.get().room, t.goto, st.x, st.z);
            else if (t.map) {
                world.set({ map: true });
                document.exitPointerLock?.();
            } else if (t.item) {
                world.set({ panel: t.item, panelAt: [st.aim.x, st.aim.y, st.aim.z] });
                document.exitPointerLock?.();
            }
            return true;
        };
        world.travel = (id) => {
            st.travel = route(world.get().room, id, st.x, st.z);
            world.set({ map: false, panel: null });
        };

        const locked = () => document.pointerLockElement === el;
        const onLock = () => world.set({ locked: locked() });
        const onDown = (e: PointerEvent) => {
            st.drag = { x: e.clientX, y: e.clientY, moved: 0 };
        };
        const onMove = (e: PointerEvent) => {
            const rect = el.getBoundingClientRect();
            st.px = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            st.py = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
            if (world.get().panel || world.get().map) return;
            if (locked()) {
                st.yaw -= e.movementX * 0.0021;
                st.pitch = Math.max(-1.25, Math.min(1.25, st.pitch - e.movementY * 0.0021));
            } else if (st.drag && e.buttons & 1) {
                const dx = e.clientX - st.drag.x;
                const dy = e.clientY - st.drag.y;
                st.drag.x = e.clientX;
                st.drag.y = e.clientY;
                st.drag.moved += Math.abs(dx) + Math.abs(dy);
                // Dragging turns the view the way you would turn a photo sphere.
                st.yaw += dx * 0.0042;
                st.pitch = Math.max(-1.25, Math.min(1.25, st.pitch + dy * 0.0042));
            }
        };
        const onUp = () => {
            const d = st.drag;
            st.drag = null;
            if (!d || d.moved > 5) return;
            if (world.get().panel) {
                // A click on the scene, past the open card, puts it back.
                world.set({ panel: null });
                return;
            }
            if (world.get().map) return;
            // A click uses what you are aiming at; on nothing, it captures the mouse.
            if (!activate(world.get().hover) && !locked()) {
                try {
                    const p = el.requestPointerLock?.() as unknown as Promise<void> | undefined;
                    p?.catch?.(() => {});
                } catch {
                    /* drag-to-look still works */
                }
            }
        };

        const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            const down = e.type === 'keydown';
            const s = world.get();
            let handled = true;
            if (MOVE.has(e.code)) {
                if (down) {
                    st.keys.add(e.code);
                    if (!e.code.startsWith('Shift')) {
                        st.travel = null;
                        // Walking away from an open card puts it back.
                        if (s.panel) world.set({ panel: null });
                    }
                } else st.keys.delete(e.code);
            } else if (!down) {
                handled = false;
            } else if (e.code === 'Escape') {
                if (s.panel) world.set({ panel: null });
                else if (s.map) world.set({ map: false });
                else if (locked()) document.exitPointerLock?.();
                else world.exit?.();
            } else if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') {
                if (s.panel) world.set({ panel: null });
                else if (!s.map) activate(s.hover);
            } else if (e.code === 'KeyM' || e.code === 'Tab') {
                world.set({ map: !s.map, panel: null });
                if (!s.map) document.exitPointerLock?.();
            } else if (/^Digit[1-8]$/.test(e.code)) {
                world.travel?.(PLACES[Number(e.code.slice(5)) - 1].id);
            }
            // Every other key is swallowed too: the site's own letter shortcuts
            // (B for blog, A for about…) must not fire from in here.
            if (handled) {
                e.preventDefault();
                e.stopPropagation();
            }
        };
        const onBlur = () => st.keys.clear();

        document.addEventListener('pointerlockchange', onLock);
        el.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('keydown', onKey, true);
        window.addEventListener('keyup', onKey, true);
        window.addEventListener('blur', onBlur);

        // A handle for driving the camera from tests and screenshots.
        (window as unknown as Record<string, unknown>).__world = {
            tp: (x: number, z: number, yaw = st.yaw, pitch = 0) => Object.assign(st, { x, z, yaw, pitch, travel: null }),
            enter: (id: RoomId) => Object.assign(st, spot(id), { pitch: 0, travel: null }),
            go: (id: RoomId) => world.travel?.(id),
            look: (look: Partial<ReturnType<typeof world.get>['look']>) => world.set({ look: { ...world.get().look, ...look } }),
            state: () => ({ x: st.x, z: st.z, yaw: st.yaw, ...world.get() }),
        };

        return () => {
            document.removeEventListener('pointerlockchange', onLock);
            el.removeEventListener('pointerdown', onDown);
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('keydown', onKey, true);
            window.removeEventListener('keyup', onKey, true);
            window.removeEventListener('blur', onBlur);
            if (locked()) document.exitPointerLock?.();
            world.travel = null;
            delete (window as unknown as Record<string, unknown>).__world;
        };
    }, [gl, st, start]);

    useFrame((_, raw) => {
        const dt = Math.min(raw, 0.05);
        const s = world.get();
        const busy = !!s.panel || s.map;
        let moving = false;

        if (st.travel) {
            const [tx, tz] = st.travel.pts[0];
            const dx = tx - st.x;
            const dz = tz - st.z;
            const dist = Math.hypot(dx, dz);
            const step = TRAVEL * dt;
            if (dist <= step) {
                st.x = tx;
                st.z = tz;
                st.travel.pts.shift();
                if (!st.travel.pts.length) st.travel = null;
            } else {
                st.x += (dx / dist) * step;
                st.z += (dz / dist) * step;
                // Face where you are going; on the last leg, ease to the pod's heading.
                const heading = st.travel.pts.length > 1 ? Math.atan2(-dx, -dz) : st.travel.yaw;
                st.yaw = turn(st.yaw, heading, 1 - Math.exp(-dt * 6));
                st.pitch += (0 - st.pitch) * (1 - Math.exp(-dt * 5));
            }
            moving = true;
        } else if (!busy) {
            const k = st.keys;
            const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
            const strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
            // With the mouse free there is nothing else to turn with, so the side
            // arrows turn; once it is captured they strafe like A and D.
            const side = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
            let r = strafe;
            if (s.locked) r += side;
            else st.yaw -= side * dt * 2.2;
            if (f || r) {
                const len = Math.hypot(f, r);
                const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? RUN : WALK) * dt;
                const sin = Math.sin(st.yaw);
                const cos = Math.cos(st.yaw);
                const vx = ((-sin * f + cos * r) / len) * speed;
                const vz = ((-cos * f - sin * r) / len) * speed;
                if (canStand(st.x + vx, st.z)) st.x += vx;
                if (canStand(st.x, st.z + vz)) st.z += vz;
                moving = true;
            }
        }

        st.bob += moving ? dt * 9 : 0;
        camera.position.set(st.x, EYE + (moving ? Math.sin(st.bob) * 0.02 : 0), st.z);
        camera.rotation.set(st.pitch, st.yaw, 0, 'YXZ');

        const here = roomAt(st.x, st.z);
        if (here !== s.room) world.set({ room: here });

        // Aim: a few times a second is plenty.
        if (++st.tick % 4 === 0) {
            let hit: Target | null = null;
            if (!busy && !st.travel) {
                if (s.locked) ndc.set(0, 0);
                else ndc.set(st.px, st.py);
                ray.setFromCamera(ndc, camera);
                ray.far = REACH;
                const first = ray.intersectObjects(scene.children, true)[0];
                for (let o: THREE.Object3D | null = first?.object ?? null; o; o = o.parent) {
                    if (o.userData.target) {
                        hit = o.userData.target as Target;
                        o.getWorldPosition(st.aim);
                        break;
                    }
                }
            }
            if ((hit?.id ?? null) !== (s.hover?.id ?? null)) world.set({ hover: hit });
        }
    });

    return null;
}
