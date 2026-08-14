// Typed client for the visitor-globe endpoints on the Bun service. Public reads
// and the submission flow all hit the artifacts host directly (same pattern as
// the artifacts/ai pages). A dedicated NEXT_PUBLIC_VISITOR_API_URL lets local
// dev point at a localhost server without redirecting the artifacts pages.
const API_BASE =
    process.env.NEXT_PUBLIC_VISITOR_API_URL ||
    process.env.NEXT_PUBLIC_ARTIFACTS_API_URL ||
    'https://artifacts.mncoleman.com';

export interface Pin {
    id: string;
    lat: number;
    lng: number;
    place_label: string;
    country: string | null;
    name: string | null;
    food: string | null;
    song: string | null;
    fact: string | null;
    quote: string | null;
    created_at: number;
}

export interface GeoResult {
    label: string;
    lat: number;
    lng: number;
    country: string | null;
    precision: 'country' | 'city' | 'address';
}

export type CaptchaType = 'slider' | 'rotary' | 'solar' | 'choice' | 'text';

export interface Challenge {
    token: string;
    captcha: { id: string; prompt: string; type: CaptchaType; choices?: string[]; min?: number; max?: number };
    captchaSig: string;
    honeypotField: string;
}

export interface SubmitPayload {
    token: string;
    captchaId: string;
    captchaSig: string;
    captchaAnswer: string;
    honeypotField: string;
    honeypotValue: string;
    lat: number;
    lng: number;
    place_label: string;
    country: string | null;
    precision: string;
    name?: string;
    food?: string;
    song?: string;
    fact?: string;
    quote?: string;
}

export interface SubmitResult {
    ok: boolean;
    pin?: Pin;
    error?: string;
    field?: string;
    status: number;
}

export async function fetchPins(signal?: AbortSignal): Promise<Pin[]> {
    // One-shot retry: a rare cold-start 5xx shouldn't silently show the empty
    // state in production (dev's StrictMode double-fire masked this once).
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(`${API_BASE}/api/visitors`, { signal });
            if (res.ok) {
                const data = (await res.json()) as { pins: Pin[] };
                return data.pins || [];
            }
            if (res.status < 500) break; // client error — retrying won't help
        } catch (e) {
            if (signal?.aborted) throw e;
        }
        if (attempt === 0) await new Promise((r) => setTimeout(r, 400));
    }
    console.warn('[visitor-globe] could not load pins');
    return [];
}

export async function fetchChallenge(): Promise<Challenge> {
    const res = await fetch(`${API_BASE}/api/visitors/challenge`);
    if (!res.ok) throw new Error(`challenge ${res.status}`);
    return (await res.json()) as Challenge;
}

export async function geocode(q: string, signal?: AbortSignal): Promise<GeoResult[]> {
    const res = await fetch(`${API_BASE}/api/geocode?q=${encodeURIComponent(q)}&limit=6`, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { results: GeoResult[] };
    return data.results || [];
}

export async function submitPin(p: SubmitPayload): Promise<SubmitResult> {
    const body: Record<string, unknown> = {
        token: p.token,
        captchaId: p.captchaId,
        captchaSig: p.captchaSig,
        captchaAnswer: p.captchaAnswer,
        [p.honeypotField]: p.honeypotValue,
        lat: p.lat,
        lng: p.lng,
        place_label: p.place_label,
        country: p.country,
        precision: p.precision,
        name: p.name,
        food: p.food,
        song: p.song,
        fact: p.fact,
        quote: p.quote,
    };
    const res = await fetch(`${API_BASE}/api/visitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    let data: { ok?: boolean; pin?: Pin; error?: string; field?: string } = {};
    try {
        data = await res.json();
    } catch {
        /* ignore */
    }
    return { ok: res.ok && !!data.ok, pin: data.pin, error: data.error, field: data.field, status: res.status };
}
