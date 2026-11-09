'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Canvas, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import searchIndex from '@/data/search-index.json';
import about from '@/data/about.json';
import { cn, slugify } from '@/lib/utils';
import { EYE, PLACES, world, useWorld, type Look, type RoomId } from './store';
import { PalCtx, palette } from './kit';
import { Space, type Content } from './rooms';
import { Player } from './player';

/**
 * The walkable site: a full-window 3D scene over the page, plus the DOM that
 * sits on top of it (where you are, what you are aiming at, the map, and the
 * switches for the look).
 *
 * Content comes from the same search index the site search uses, so the pods
 * fill themselves from whatever is published. Opening something does not leave
 * the scene: its card appears in the world, where the thing is.
 */

interface Entry {
    id: string;
    title: string;
    description: string;
    url: string;
    type: string;
    metadata?: string[];
}

function buildContent(): Content {
    const entries = searchIndex as Entry[];
    const of = (type: string) => entries.filter((e) => e.type === type);
    const resume = of('resume')[0];
    return {
        home: {
            id: 'home', kind: 'Home', title: 'Matthew Coleman', url: '/',
            text: 'Welcome to my personal website. I write about technology, share resources, and document my life journey.',
        },
        posts: of('blog').map((e) => ({ id: e.id, kind: 'Article', title: e.title, text: e.description, tags: e.metadata, url: e.url })),
        projects: of('project').map((e) => ({
            id: e.id, kind: 'Project', title: e.title, text: e.description, tags: e.metadata,
            url: `/projects/${slugify(e.title)}`, link: /^https?:/.test(e.url) ? e.url : undefined,
        })),
        resources: of('resource').map((e) => ({
            id: e.id, kind: e.metadata?.[0] ?? 'Resource', title: e.title, text: e.description,
            url: `/resources/${slugify(e.title)}`, link: /^https?:/.test(e.url) ? e.url : undefined,
        })),
        artifacts: of('artifact').map((e) => ({ id: e.id, kind: 'Artifact', title: e.title, text: e.description, link: e.url })),
        about: [
            { id: 'about-intro', kind: 'About', title: 'Introduction', text: about.introduction, url: '/about' },
            { id: 'about-what', kind: 'About', title: 'What I do', text: about.whatIDo, url: '/about' },
            { id: 'about-site', kind: 'About', title: 'This website', text: about.thisWebsite, url: '/about' },
        ],
        resume: {
            id: 'resume', kind: 'Career', title: resume?.title ?? 'Resume',
            text: resume?.description ?? 'Professional experience and qualifications.', url: '/resume',
        },
        ai: { id: 'ai', kind: 'Library', title: 'AI Library', text: 'Prompts and skills I use, ready to take.', url: '/ai' },
        mcp: {
            id: 'mcp', kind: 'MCP server', title: 'Browse this site from your AI', url: '/ai',
            text: 'Point any MCP client at the address below and it can search and read everything published here.',
            copy: 'https://mncoleman.com/mcp',
        },
    };
}

const chip =
    'pointer-events-auto inline-flex h-9 items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 text-xs text-foreground backdrop-blur-xl transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const key = 'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border/60 bg-muted/50 px-1 font-mono text-[10px] text-muted-foreground';

/** The open item, as a glass card standing in the world between you and the thing. */
function ItemCard({ dark, onVisit }: { dark: boolean; onVisit: (url: string) => void }) {
    const panel = useWorld((s) => s.panel);
    const at = useWorld((s) => s.panelAt);
    const { camera } = useThree();
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const pose = useMemo(() => {
        if (!panel || !at) return null;
        const dx = camera.position.x - at[0];
        const dz = camera.position.z - at[2];
        const d = Math.hypot(dx, dz) || 1;
        // 1.7m in front of you, on the line to the item; closer if the item is.
        const gap = Math.min(1.7, d * 0.6);
        return {
            p: [camera.position.x - (dx / d) * gap, EYE - 0.02, camera.position.z - (dz / d) * gap] as [number, number, number],
            yaw: Math.atan2(dx, dz),
        };
    }, [panel, at, camera]);
    if (!panel || !pose) return null;
    const copied = copiedId === panel.id;
    return (
        <Html transform position={pose.p} rotation={[0, pose.yaw, 0]} distanceFactor={1.25} zIndexRange={[60, 0]}>
            <div className={cn(dark && 'dark')}>
                <div
                    className="w-[480px] select-text rounded-2xl border border-border bg-background/95 p-7 text-foreground shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200"
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{panel.kind}</div>
                    <h2 className="mt-2 text-3xl font-bold leading-tight">{panel.title}</h2>
                    {panel.tags && panel.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                            {panel.tags.map((t) => (
                                <span key={t} className="rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground">{t}</span>
                            ))}
                        </div>
                    )}
                    {panel.text && <p className="mt-4 whitespace-pre-line leading-relaxed text-muted-foreground">{panel.text}</p>}
                    {panel.copy && (
                        <div className="mt-4 flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 font-mono text-xs">
                            <span className="truncate">{panel.copy}</span>
                            <button
                                type="button"
                                className="ml-auto shrink-0 rounded border border-border/60 px-2 py-1 font-sans text-[11px] hover:bg-muted"
                                onClick={() => navigator.clipboard?.writeText(panel.copy!).then(() => setCopiedId(panel.id), () => {})}
                            >
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                        </div>
                    )}
                    <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
                        {panel.link && (
                            <a className="inline-flex h-9 items-center rounded-lg bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90" href={panel.link} target="_blank" rel="noopener noreferrer">
                                Open in a new tab ↗
                            </a>
                        )}
                        {panel.url && (
                            <button type="button" className="inline-flex h-9 items-center rounded-lg border border-border px-4 font-medium hover:bg-muted" onClick={() => onVisit(panel.url!)}>
                                Leave to its page
                            </button>
                        )}
                        <button type="button" className="ml-auto inline-flex h-9 items-center gap-2 rounded-lg px-2 text-muted-foreground hover:text-foreground" onClick={() => world.set({ panel: null })}>
                            Put back <span className={key}>Esc</span>
                        </button>
                    </div>
                </div>
            </div>
        </Html>
    );
}

const LOOKS: { [K in keyof Look]: { label: string; options: Look[K][] } } = {
    sky: { label: 'Sky', options: ['veil', 'stars', 'plain'] },
    shell: { label: 'Walls', options: ['room', 'open'] },
    glow: { label: 'Lines', options: ['white', 'blue'] },
};

function LookSwitches() {
    const look = useWorld((s) => s.look);
    return (
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-1.5 backdrop-blur-xl">
            {(Object.keys(LOOKS) as (keyof Look)[]).map((k) => (
                <div key={k} className="flex items-center gap-1">
                    <span className="mr-1 text-[10px] uppercase tracking-widest text-muted-foreground">{LOOKS[k].label}</span>
                    {LOOKS[k].options.map((o) => (
                        <button
                            key={o}
                            type="button"
                            onClick={() => world.set({ look: { ...look, [k]: o } })}
                            aria-pressed={look[k] === o}
                            className={cn(
                                'h-6 rounded-md border px-2 text-[11px] capitalize transition-colors',
                                look[k] === o ? 'border-foreground/30 bg-foreground/10 text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {o}
                        </button>
                    ))}
                </div>
            ))}
        </div>
    );
}

function Hud({ onClose, onVisit, dark }: { onClose: () => void; onVisit: (url: string) => void; dark: boolean }) {
    const room = useWorld((s) => s.room);
    const hover = useWorld((s) => s.hover);
    const panel = useWorld((s) => s.panel);
    const map = useWorld((s) => s.map);
    const locked = useWorld((s) => s.locked);
    const [hint, setHint] = useState(true);
    const here = PLACES.find((p) => p.id === room) ?? PLACES[0];

    useEffect(() => {
        const t = window.setTimeout(() => setHint(false), 14000);
        return () => window.clearTimeout(t);
    }, []);

    return (
        <div className={cn('pointer-events-none absolute inset-0 z-[70] select-none text-foreground', dark && 'dark')}>
            <div className="absolute left-4 top-4 flex items-center gap-2">
                <div className={cn(chip, 'h-auto flex-col items-start gap-0 py-2 hover:border-border/40')}>
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">You are in</span>
                    <span className="text-base font-bold leading-tight">{here.title}</span>
                </div>
            </div>
            <div className="absolute left-1/2 top-4 hidden -translate-x-1/2 lg:block">
                <LookSwitches />
            </div>
            <div className="absolute right-4 top-4 flex items-center gap-2">
                <button type="button" className={chip} onClick={() => world.set({ map: !map, panel: null })}>
                    Map <span className={key}>M</span>
                </button>
                <button type="button" className={chip} onClick={() => onVisit(here.path)}>
                    Leave to {here.title}
                </button>
                <button type="button" className={chip} onClick={onClose} aria-label="Leave">
                    <span className={key}>Esc</span>
                </button>
            </div>

            {/* Crosshair, only while the mouse is captured. */}
            {locked && !panel && !map && (
                <div
                    className={cn(
                        'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 mix-blend-difference transition-all duration-150',
                        hover ? 'h-5 w-5' : 'h-1.5 w-1.5 bg-white/80'
                    )}
                />
            )}

            {/* What a click would do. */}
            {hover && !panel && !map && (
                <div className="absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm backdrop-blur-xl">
                    <span className={key}>E</span>
                    <span className="text-muted-foreground">{hover.hint}</span>
                    <span className="max-w-[40ch] truncate font-medium">{hover.label}</span>
                </div>
            )}

            <div className={cn('absolute bottom-5 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-x-4 gap-y-1 rounded-lg border border-border/40 bg-background/40 px-4 py-2 text-[11px] text-muted-foreground backdrop-blur-xl transition-opacity duration-700', (hint || !locked) && !panel ? 'opacity-100' : 'opacity-0')}>
                <span><span className={key}>W</span> <span className={key}>A</span> <span className={key}>S</span> <span className={key}>D</span> or arrows to walk</span>
                <span>{locked ? 'Mouse to look' : 'Click to look around, or drag'}</span>
                <span><span className={key}>E</span> or click to open</span>
                <span><span className={key}>1</span>–<span className={key}>8</span> jump to a page</span>
            </div>

            {map && (
                <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-background/30 backdrop-blur-sm" onClick={() => world.set({ map: false })}>
                    <div className="w-[min(92vw,24rem)] rounded-2xl border border-border/60 bg-background/70 p-5 shadow-2xl backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
                        <div className="mb-3 text-[10px] uppercase tracking-widest text-muted-foreground">Map</div>
                        <ul className="space-y-1">
                            {PLACES.map((p, i) => (
                                <li key={p.id}>
                                    <button
                                        type="button"
                                        onClick={() => world.travel?.(p.id)}
                                        className={cn(
                                            'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                            p.id === room ? 'border-foreground/30 bg-foreground/10' : 'border-transparent hover:border-border hover:bg-muted/50'
                                        )}
                                    >
                                        <span className={key}>{i + 1}</span>
                                        <span className="font-medium">{p.title}</span>
                                        {p.id === room && <span className="ml-auto text-xs text-muted-foreground">You are here</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function World({ start, onClose }: { start: RoomId; onClose: () => void }) {
    const router = useRouter();
    const content = useMemo(() => buildContent(), []);
    // Follows the theme the site is in when you walk in.
    const [dark] = useState(() => document.documentElement.classList.contains('dark'));
    const glow = useWorld((s) => s.look.glow);
    const pal = useMemo(() => palette(dark, glow), [dark, glow]);

    useEffect(() => {
        world.exit = onClose;
        const root = document.documentElement;
        const prev = root.style.overflow;
        root.style.overflow = 'hidden';
        return () => {
            world.exit = null;
            root.style.overflow = prev;
        };
    }, [onClose]);

    const visit = (url: string) => {
        onClose();
        router.push(url);
    };

    return (
        <div className="fixed inset-0 z-[200] bg-background" data-lenis-prevent data-print-hide role="application" aria-label="Walkable 3D site">
            <Canvas
                dpr={[1, 1.75]}
                camera={{ fov: 70, near: 0.05, far: 250, position: [0, EYE, 3.6] }}
                gl={{ antialias: true, powerPreference: 'high-performance' }}
                style={{ cursor: 'crosshair' }}
            >
                <color attach="background" args={[pal.void]} />
                <PalCtx.Provider value={pal}>
                    <Space content={content} />
                </PalCtx.Provider>
                <Player start={start} />
                <ItemCard dark={dark} onVisit={visit} />
            </Canvas>
            <Hud onClose={onClose} onVisit={visit} dark={dark} />
        </div>
    );
}
