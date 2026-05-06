import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.JWT_SECRET || '';

function b64u(buf: Buffer): string {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64u(s: string): Buffer {
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** Mints a signed value of form `<slug>.<exp>.<sig>` for cookie use. */
export function signSlugCookie(slug: string, ttlSeconds = 86400): string {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = `${slug}.${exp}`;
    const sig = b64u(createHmac('sha256', SECRET).update(payload).digest());
    return `${slug}.${exp}.${sig}`;
}

/** Returns true if the cookie matches the given slug and has not expired. */
export function verifySlugCookie(value: string | undefined, expectedSlug: string): boolean {
    if (!value) return false;
    const parts = value.split('.');
    if (parts.length !== 3) return false;
    const [slug, expStr, sig] = parts;
    if (slug !== expectedSlug) return false;
    const exp = parseInt(expStr, 10);
    if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
    const expected = createHmac('sha256', SECRET).update(`${slug}.${exp}`).digest();
    const actual = fromB64u(sig);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
}

/** Cookie name scoped to a single artifact slug. */
export function cookieName(slug: string): string {
    return `_a_${slug}`;
}

export function parseCookies(header: string | null | undefined): Record<string, string> {
    if (!header) return {};
    const out: Record<string, string> = {};
    for (const part of header.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        const k = part.slice(0, eq).trim();
        const v = part.slice(eq + 1).trim();
        if (k) out[k] = decodeURIComponent(v);
    }
    return out;
}
