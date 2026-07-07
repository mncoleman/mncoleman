/**
 * Geoapify Address Autocomplete proxy.
 *
 * Runs server-side so the API key never reaches the browser; the route in front
 * of it adds per-IP rate-limiting. Geoapify's free plan (3,000 credits/day,
 * autocomplete = 1 credit) permits permanently storing the resolved coordinate
 * with a "Powered by Geoapify" attribution, which is what a guestbook pin needs.
 * A small in-memory cache absorbs repeat keystrokes to stay well under quota.
 */

const GEOAPIFY_KEY = process.env.GEOAPIFY_KEY || '';
const BASE = 'https://api.geoapify.com/v1/geocode/autocomplete';

export interface GeoResult {
    label: string;
    lat: number;
    lng: number;
    country: string | null;
    precision: 'country' | 'city' | 'address';
}

const cache = new Map<string, { at: number; results: GeoResult[] }>();
const CACHE_TTL = 5 * 60 * 1000;
const CACHE_MAX = 500;

function precisionFromType(t: string | undefined): 'country' | 'city' | 'address' {
    switch (t) {
        case 'country':
            return 'country';
        case 'state':
        case 'county':
        case 'city':
        case 'postcode':
        case 'district':
        case 'suburb':
            return 'city';
        default:
            return 'address'; // street / amenity / building / etc.
    }
}

export function geocodeConfigured(): boolean {
    return !!GEOAPIFY_KEY;
}

export async function geocodeAutocomplete(q: string, limit: number): Promise<GeoResult[]> {
    if (!GEOAPIFY_KEY) {
        console.warn('[geocode] GEOAPIFY_KEY not set — returning no results');
        return [];
    }
    const key = `${limit}:${q.toLowerCase()}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.results;

    const url = `${BASE}?text=${encodeURIComponent(q)}&limit=${limit}&format=json&apiKey=${GEOAPIFY_KEY}`;
    let results: GeoResult[] = [];
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
            console.warn('[geocode] geoapify status', res.status);
            return [];
        }
        const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
        results = (data.results || [])
            .map((r): GeoResult => {
                const parts = [r.city, r.state, r.country].filter(Boolean) as string[];
                return {
                    label: (r.formatted as string) || parts.join(', '),
                    lat: Number(r.lat),
                    lng: Number(r.lon),
                    country: (r.country as string) || null,
                    precision: precisionFromType(r.result_type as string | undefined),
                };
            })
            .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng) && !!r.label);
    } catch (e) {
        console.warn('[geocode] error', e);
        return [];
    }

    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(key, { at: Date.now(), results });
    return results;
}
