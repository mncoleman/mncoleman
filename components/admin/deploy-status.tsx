'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

/**
 * What the site is doing right now, read from the live site itself rather than
 * from Cloudflare (the Worker holds no Pages API credential, and this needs none):
 *
 * - `/sw.js` carries the deployed commit as `mc-blog-<sha7>` (scripts/stamp-sw-version.ts),
 *   so a publish is live the moment that matches the commit the Worker returned.
 * - `/data/site-content.json` carries `generatedAt`, rewritten by every build, which
 *   is how a rebuild (same commit, so the same sha) is seen to land.
 *
 * The stages in between are estimates, timed from this project's real Pages builds
 * (Oct 2026: 85-97s from push to live, of which `npm run build` is ~18s).
 */

export const DEPLOY_STAGES = [
    { id: 'commit', label: 'Saving to GitHub', detail: 'One commit per changed collection', s: 2 },
    { id: 'queue', label: 'Queued', detail: 'Cloudflare Pages picks up the push', s: 5 },
    { id: 'prepare', label: 'Preparing', detail: 'Clone, restore cache, install dependencies', s: 30 },
    { id: 'build', label: 'Building', detail: 'Pages, share images, search index', s: 25 },
    { id: 'publish', label: 'Publishing', detail: 'Upload changed files, switch traffic', s: 18 },
] as const;

const POLL_MS = 5000;
/** Past this, say so rather than counting down past zero forever. */
const SLOW_AFTER_S = 240;
const GIVE_UP_AFTER_S = 600;
const LANDED_NOTICE_MS = 15000;

export type DeployKind = 'publish' | 'rebuild';

export interface DeployRun {
    kind: DeployKind;
    startedAt: number;
    /** The last commit of a publish; absent for a rebuild. */
    commit?: string;
    /** Records riding on this deploy, for the editor's "Publishing…" / "Now live". */
    keys: string[];
    state: 'running' | 'slow' | 'landed' | 'lost';
}

interface DeployContextValue {
    /** When the live build was generated, or null if it could not be read (dev). */
    liveAt: number | null;
    run: DeployRun | null;
    start: (kind: DeployKind, opts?: { commit?: string; keys?: string[] }) => void;
}

const DeployContext = createContext<DeployContextValue | null>(null);

async function readLiveSha(): Promise<string | null> {
    try {
        // Network-first in our own service worker, and `no-store` past the browser cache.
        const res = await fetch('/sw.js', { cache: 'no-store' });
        if (!res.ok) return null;
        return /mc-blog-([0-9a-f]{7,40})'/.exec(await res.text())?.[1] ?? null;
    } catch {
        return null;
    }
}

async function readGeneratedAt(): Promise<number | null> {
    try {
        const res = await fetch('/data/site-content.json', { cache: 'no-store' });
        if (!res.ok) return null;
        const t = Date.parse((await res.json()).generatedAt);
        return Number.isNaN(t) ? null : t;
    } catch {
        return null;
    }
}

export function DeployProvider({ children }: { children: React.ReactNode }) {
    const [liveAt, setLiveAt] = useState<number | null>(null);
    const [run, setRun] = useState<DeployRun | null>(null);
    const baselineSha = useRef<string | null>(null);

    useEffect(() => {
        readGeneratedAt().then(setLiveAt);
        readLiveSha().then((sha) => { baselineSha.current = sha; });
    }, []);

    const start = useCallback((kind: DeployKind, opts?: { commit?: string; keys?: string[] }) => {
        setRun({ kind, startedAt: Date.now(), commit: opts?.commit, keys: opts?.keys ?? [], state: 'running' });
    }, []);

    // Poll while a run is in flight. Keyed on startedAt so a new run restarts it.
    const startedAt = run?.startedAt;
    const inFlight = run?.state === 'running' || run?.state === 'slow';
    useEffect(() => {
        if (!run || !inFlight) return;
        const { kind, commit } = run;
        let cancelled = false;
        const tick = async () => {
            const elapsed = (Date.now() - run.startedAt) / 1000;
            let landed = false;
            if (kind === 'publish' && commit) {
                const sha = await readLiveSha();
                if (sha && commit.startsWith(sha)) landed = true;
                // A later commit (an image upload, another admin) can deploy over ours
                // before a poll catches it. Main is linear, so a newer live commit that
                // arrived well after ours still contains it.
                else if (sha && sha !== baselineSha.current && elapsed > 150) landed = true;
                if (landed) baselineSha.current = sha;
            } else {
                const at = await readGeneratedAt();
                if (at && at > run.startedAt) landed = true;
            }
            if (cancelled) return;
            if (landed) {
                setLiveAt(Date.now());
                setRun((r) => (r && r.startedAt === run.startedAt ? { ...r, state: 'landed' } : r));
                setTimeout(() => setRun((r) => (r && r.startedAt === run.startedAt ? null : r)), LANDED_NOTICE_MS);
                return;
            }
            if (elapsed > GIVE_UP_AFTER_S) {
                setRun((r) => (r && r.startedAt === run.startedAt ? { ...r, state: 'lost' } : r));
                return;
            }
            if (elapsed > SLOW_AFTER_S) setRun((r) => (r && r.startedAt === run.startedAt && r.state === 'running' ? { ...r, state: 'slow' } : r));
            timer = setTimeout(tick, POLL_MS);
        };
        let timer = setTimeout(tick, POLL_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startedAt, inFlight]);

    return <DeployContext.Provider value={{ liveAt, run, start }}>{children}</DeployContext.Provider>;
}

export function useDeploy(): DeployContextValue {
    const ctx = useContext(DeployContext);
    if (!ctx) throw new Error('useDeploy must be used inside DeployProvider');
    return ctx;
}

/** Re-renders every second while `active`, for countdowns and "42m ago" labels. */
export function useNow(active = true): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return;
        const t = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(t);
    }, [active]);
    return now;
}

export function deployProgress(run: DeployRun, now: number) {
    const stages = DEPLOY_STAGES.filter((st) => run.kind !== 'rebuild' || st.id !== 'commit');
    const total = stages.reduce((n, st) => n + st.s, 0);
    const elapsed = Math.max(0, (now - run.startedAt) / 1000);
    let acc = 0;
    let current = stages.length - 1;
    for (let i = 0; i < stages.length; i++) {
        if (elapsed < acc + stages[i].s) { current = i; break; }
        acc += stages[i].s;
    }
    return { stages, current, fraction: Math.min(1, elapsed / total), left: Math.max(0, Math.ceil(total - elapsed)), elapsed };
}

export function clock(sec: number): string {
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function ago(ms: number, now: number): string {
    const s = Math.round((now - ms) / 1000);
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
}
