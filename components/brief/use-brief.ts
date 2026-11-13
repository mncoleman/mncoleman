'use client';

import { useEffect, useState } from 'react';
import type { BriefEdition, BriefLink, BriefSummary } from '@/lib/brief';

/**
 * Where the brief's content comes from. The pages are static shells in the
 * repo; the editions live in KV and are served by `worker-mcp` at
 * `/api/brief/*` on the same origin, so an edition can be hidden or removed
 * without a rebuild.
 *
 * `next dev` has no Worker behind it, so outside production a failed request
 * falls back to `data/brief-sample.json`. The dynamic import sits behind a
 * NODE_ENV check that the bundler removes, so the sample never ships.
 */
const API = process.env.NEXT_PUBLIC_BRIEF_API || '/api/brief';

export interface LoadedBrief { edition: BriefEdition; newer: string | null; older: string | null; links?: BriefLink[] }
export type Loaded<T> = { status: 'loading' } | { status: 'ready'; data: T } | { status: 'missing' } | { status: 'error' };

async function sample(): Promise<BriefEdition | null> {
    if (process.env.NODE_ENV === 'production') return null;
    return (await import('@/data/brief-sample.json')).default as unknown as BriefEdition;
}

async function get<T>(path: string): Promise<T | 'missing'> {
    const res = await fetch(`${API}/${path}`, { headers: { Accept: 'application/json' } });
    // The Worker always answers JSON. Anything else (the site's own 404 page) means the API is not there at all.
    if (!(res.headers.get('Content-Type') || '').includes('json')) throw new Error(`no brief API (${res.status})`);
    if (res.status === 404) return 'missing';
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as T;
}

function useLoad<T>(key: string, load: () => Promise<T | 'missing'>): Loaded<T> {
    const [state, setState] = useState<{ key: string; value: Loaded<T> }>({ key, value: { status: 'loading' } });
    useEffect(() => {
        let live = true;
        load()
            .then((data) => { if (live) setState({ key, value: data === 'missing' ? { status: 'missing' } : { status: 'ready', data } }); })
            .catch(() => { if (live) setState({ key, value: { status: 'error' } }); });
        return () => { live = false; };
        // `load` is rebuilt every render; `key` is what identifies the request.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key]);
    return state.key === key ? state.value : { status: 'loading' };
}

/** One edition by date, or the newest when `date` is 'latest'. */
export function useBrief(date: string): Loaded<LoadedBrief> {
    return useLoad(date, async () => {
        try {
            return await get<LoadedBrief>(date);
        } catch (e) {
            const s = await sample();
            if (!s) throw e;
            const links = [{ label: 'National Weather Service', url: 'https://www.weather.gov' }, { label: 'AP News', url: 'https://apnews.com' }, { label: 'The Colorado Sun', url: 'https://coloradosun.com' }];
            return date === 'latest' || date === s.date ? { edition: s, newer: null, older: null, links } : 'missing';
        }
    });
}

export function useBriefIndex(): Loaded<BriefSummary[]> {
    return useLoad('index', async () => {
        try {
            const r = await get<{ briefs: BriefSummary[] }>('index');
            return r === 'missing' ? [] : r.briefs;
        } catch (e) {
            const s = await sample();
            if (!s) throw e;
            return [{ date: s.date, edition_number: s.edition_number, headline: s.top_signals[0]?.headline || '' }];
        }
    });
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Calendar pieces of a YYYY-MM-DD date, read as that date everywhere (never shifted by the viewer's timezone). */
export function dateParts(iso: string) {
    const d = new Date(`${iso}T12:00:00Z`);
    return { dow: DOW[d.getUTCDay()], day: d.getUTCDate(), mon: MON[d.getUTCMonth()], year: d.getUTCFullYear(), dowIndex: d.getUTCDay() };
}
export const shortDate = (iso: string) => { const p = dateParts(iso); return `${p.dow} ${p.day} ${p.mon}`; };
export const MONTHS = MON;
export const DAYS = DOW;
export const pad3 = (n: number) => String(n).padStart(3, '0');
