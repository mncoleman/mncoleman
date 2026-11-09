'use client';

import { useSyncExternalStore } from 'react';

/**
 * The walkable site: its plan, and the little bit of state the 3D scene and the
 * DOM overlay share.
 *
 * Plan: a round glass hub (home) floating in the site's own backdrop, with one
 * pod per page set around it like spokes, each joined to the hub by a bridge.
 * Every pod is described in a frame rotated about the hub's centre so that
 * "outward" is always local -z; `place()` turns that into world coordinates.
 *
 * Collision is discs and corridors: you can stand on the hub, on a pod, or on
 * the bridge between them, and nowhere else.
 */

export type RoomId = 'home' | 'blog' | 'projects' | 'resources' | 'resume' | 'about' | 'artifacts' | 'ai';

/** Something you can pick up and read. */
export interface Item {
    id: string;
    kind: string;
    title: string;
    text: string;
    tags?: string[];
    /** A page on this site. */
    url?: string;
    /** Somewhere else on the web. */
    link?: string;
    /** A string worth copying (the MCP endpoint). */
    copy?: string;
}

/** Something the crosshair can land on. */
export interface Target {
    id: string;
    hint: string;
    label: string;
    item?: Item;
    goto?: RoomId;
    map?: boolean;
}

export interface RoomDef {
    id: RoomId;
    /** The page it stands for. */
    title: string;
    path: string;
    /** Clockwise from straight ahead, radians. */
    angle: number;
    /** Rotation of the pod's frame: local -z points away from the hub. */
    rot: number;
}

export const EYE = 1.62;
export const HUB_R = 6.5;
export const POD_R = 4.2;
/** Hub centre to pod centre. */
export const POD_D = 14.5;
export const BRIDGE_W = 2.2;
/** Radius of the plinth in the middle of the hub. */
export const CORE_R = 1.0;
const EDGE = 0.4;

const PAGES: { id: RoomId; title: string; path: string }[] = [
    { id: 'blog', title: 'Blog', path: '/blog' },
    { id: 'projects', title: 'Projects', path: '/projects' },
    { id: 'resources', title: 'Resources', path: '/resources' },
    { id: 'artifacts', title: 'Artifacts', path: '/artifacts' },
    { id: 'ai', title: 'AI', path: '/ai' },
    { id: 'resume', title: 'Resume', path: '/resume' },
    { id: 'about', title: 'About', path: '/about' },
];

export const ROOMS: RoomDef[] = PAGES.map((p, i) => {
    const angle = (i / PAGES.length) * Math.PI * 2;
    return { ...p, angle, rot: -angle };
});

/** Order used by the map and the number keys. */
export const PLACES: { id: RoomId; title: string; path: string }[] = [{ id: 'home', title: 'Home', path: '/' }, ...PAGES];

export const roomDef = (id: RoomId) => ROOMS.find((r) => r.id === id);

/** A point in a pod's frame (x across, z along the spoke, hub at 0, pod at -POD_D) to world. */
export function place(r: RoomDef, x: number, z: number): [number, number] {
    const c = Math.cos(r.rot);
    const s = Math.sin(r.rot);
    return [x * c + z * s, -x * s + z * c];
}

/** World to a pod's frame. */
function local(r: RoomDef, x: number, z: number): [number, number] {
    const c = Math.cos(r.rot);
    const s = Math.sin(r.rot);
    return [x * c - z * s, x * s + z * c];
}

export function canStand(x: number, z: number): boolean {
    const d = Math.hypot(x, z);
    if (d < CORE_R + 0.35) return false;
    if (d <= HUB_R - EDGE) return true;
    for (const r of ROOMS) {
        const [lx, lz] = local(r, x, z);
        if (Math.hypot(lx, lz + POD_D) <= POD_R - EDGE) return true;
        if (Math.abs(lx) <= BRIDGE_W / 2 - 0.3 && lz <= -(HUB_R - 1) && lz >= -(POD_D - POD_R + 1)) return true;
    }
    return false;
}

export function roomAt(x: number, z: number): RoomId {
    for (const r of ROOMS) {
        const [lx, lz] = local(r, x, z);
        if (Math.hypot(lx, lz + POD_D) <= POD_R + 0.3) return r.id;
    }
    return 'home';
}

/** The three independent choices that make up the look. */
export interface Look {
    sky: 'veil' | 'stars' | 'plain';
    shell: 'room' | 'open';
    glow: 'blue' | 'white';
}

/* ── Shared state ───────────────────────────────────────────────────────── */

interface State {
    hover: Target | null;
    room: RoomId;
    panel: Item | null;
    /** Where the open item sits in the world, so its card can appear there. */
    panelAt: [number, number, number] | null;
    locked: boolean;
    map: boolean;
    look: Look;
}

const state: State = {
    hover: null, room: 'home', panel: null, panelAt: null, locked: false, map: false,
    look: { sky: 'veil', shell: 'room', glow: 'white' },
};
const subs = new Set<() => void>();

export const world = {
    get: () => state,
    set(patch: Partial<State>) {
        let changed = false;
        for (const k of Object.keys(patch) as (keyof State)[]) {
            if (state[k] !== patch[k]) {
                (state as unknown as Record<string, unknown>)[k] = patch[k];
                changed = true;
            }
        }
        if (changed) subs.forEach((fn) => fn());
    },
    subscribe(fn: () => void) {
        subs.add(fn);
        return () => {
            subs.delete(fn);
        };
    },
    /** Set by the player controller: walk to a room. */
    travel: null as null | ((id: RoomId) => void),
    /** Set by the overlay: leave. */
    exit: null as null | (() => void),
};

export function useWorld<T>(select: (s: State) => T): T {
    return useSyncExternalStore(
        world.subscribe,
        () => select(state),
        () => select(state)
    );
}
