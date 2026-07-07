import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';

/**
 * No-ugly-CAPTCHA bot defense, all enforced server-side. None of these is a wall
 * on its own; together they make a low-profile guestbook uneconomical to spam:
 *   - trustworthy client IP (Caddy X-Real-IP) for rate-limiting/dedup
 *   - HMAC-signed single-use submission token carrying issue-time (replay + timing)
 *   - honeypot field (dumb bots auto-fill it)
 *   - in-memory sliding-window rate limits
 *   - a branded, lightly-humorous mini-captcha whose answers are server-signed
 *     and bound to the token nonce (charm + friction, not the security boundary)
 */

const TOKEN_SECRET =
    process.env.VISITOR_TOKEN_SECRET || process.env.JWT_SECRET || 'insecure-dev-token-secret';

// Derive a distinct salt for IP hashing so it never equals the token secret.
const IP_SALT = createHash('sha256')
    .update((process.env.VISITOR_IP_SALT || process.env.JWT_SECRET || 'insecure-dev-ip-salt') + ':visitor-ip')
    .digest();

// ── client IP ──────────────────────────────────────────────────────────────
export function clientIp(c: Context): string {
    // Post-deploy, Caddy sets X-Real-IP to the real connection peer via
    // `header_up X-Real-IP {remote_host}` — immune to client XFF spoofing and
    // robust to XFF parse-direction. Fall back to leftmost XFF (Caddy ≥2.7
    // discards client-sent XFF by default) then to 'unknown'.
    const real = c.req.header('x-real-ip');
    if (real) return real.trim();
    const xff = c.req.header('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim();
    return 'unknown';
}

/** HMAC-hash an IP so we never store the raw address (privacy). */
export function hashIp(ip: string): string {
    return createHmac('sha256', IP_SALT).update(ip).digest('hex');
}

// ── base64url ──────────────────────────────────────────────────────────────
function b64u(buf: Buffer): string {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
}

// ── submission token (stateless HMAC; nonce burned on use) ───────────────────
const TOKEN_TTL_MS = 10 * 60 * 1000;

export interface IssuedToken {
    token: string;
    nonce: string;
    issuedAt: number;
    exp: number;
}

export function issueToken(): IssuedToken {
    const nonce = b64u(randomBytes(16));
    const issuedAt = Date.now();
    const exp = issuedAt + TOKEN_TTL_MS;
    const payload = `${nonce}.${issuedAt}.${exp}`;
    const sig = b64u(createHmac('sha256', TOKEN_SECRET).update(payload).digest());
    return { token: `${payload}.${sig}`, nonce, issuedAt, exp };
}

export interface VerifiedToken {
    ok: boolean;
    reason?: string;
    nonce?: string;
    issuedAt?: number;
    exp?: number;
}

export function verifyToken(token: string | undefined): VerifiedToken {
    if (!token || typeof token !== 'string') return { ok: false, reason: 'missing token' };
    const parts = token.split('.');
    if (parts.length !== 4) return { ok: false, reason: 'malformed token' };
    const [nonce, issuedAtStr, expStr, sig] = parts;
    const payload = `${nonce}.${issuedAtStr}.${expStr}`;
    const expected = b64u(createHmac('sha256', TOKEN_SECRET).update(payload).digest());
    if (!safeEqual(sig, expected)) return { ok: false, reason: 'bad signature' };
    const issuedAt = Number(issuedAtStr);
    const exp = Number(expStr);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(exp)) return { ok: false, reason: 'bad fields' };
    if (Date.now() > exp) return { ok: false, reason: 'expired' };
    return { ok: true, nonce, issuedAt, exp };
}

// ── timing ───────────────────────────────────────────────────────────────────
export const MIN_FILL_MS = 2500;
export function tooFast(issuedAt: number): boolean {
    return Date.now() - issuedAt < MIN_FILL_MS;
}

// ── in-memory sliding-window rate limiter (single container) ──────────────────
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
        buckets.set(key, arr);
        return false;
    }
    arr.push(now);
    buckets.set(key, arr);
    return true;
}

// Trim stale buckets so the Map can't grow unbounded.
setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of buckets) {
        const keep = arr.filter((t) => now - t < 15 * 60 * 1000);
        if (keep.length) buckets.set(k, keep);
        else buckets.delete(k);
    }
}, 5 * 60 * 1000).unref?.();

// ── branded mini-captcha (server-signed answers bound to the token nonce) ─────
export interface CaptchaPuzzle {
    id: string;
    prompt: string;
    /** 'slider' = drag a 1–9 handle (bots struggle to drag); 'solar' = click the right
     *  planet; 'choice' = buttons; 'text' = free text. */
    type: 'slider' | 'solar' | 'choice' | 'text';
    choices?: string[];
    min?: number;
    max?: number;
}

interface PuzzleDef extends CaptchaPuzzle {
    answer: string;
}

function norm(s: string): string {
    return (s || '').toLowerCase().replace(/\s+/g, '').trim();
}

const PUZZLES: PuzzleDef[] = [
    { id: 'math1', type: 'slider', min: 1, max: 9, prompt: "Slide to the answer: what's 2 + 3?", answer: '5' },
    { id: 'globe-rev', type: 'text', prompt: 'Type “globe” backwards (robots hate this one):', answer: 'ebolg' },
    { id: 'planet', type: 'solar', prompt: 'Click your home planet.', answer: 'Earth' },
    { id: 'pin-letters', type: 'slider', min: 1, max: 9, prompt: 'Slide to how many letters are in the word “pin”.', answer: '3' },
    { id: 'country', type: 'choice', prompt: "Pick the one that's an actual country:", choices: ['Canada', 'Narnia', 'Localhost'], answer: 'Canada' },
    { id: 'earth-letters', type: 'slider', min: 1, max: 9, prompt: 'Slide to how many letters are in the word “earth”.', answer: '5' },
    { id: 'animal', type: 'choice', prompt: 'Which one is NOT a real animal?', choices: ['Cat', 'Dog', 'Sasquatch'], answer: 'Sasquatch' },
    { id: 'sky', type: 'choice', prompt: 'On a clear day, the sky is usually…', choices: ['Blue', 'Plaid', 'On fire'], answer: 'Blue' },
    { id: 'drop-pin', type: 'choice', prompt: "You're about to drop a pin on a…", choices: ['Globe', 'Bowling lane', 'Sandwich'], answer: 'Globe' },
    { id: 'half-ten', type: 'slider', min: 1, max: 9, prompt: 'Slide to half of ten.', answer: '5' },
];

function signCaptcha(nonce: string, puzzleId: string, answer: string): string {
    return b64u(createHmac('sha256', TOKEN_SECRET).update(`${nonce}:${puzzleId}:${norm(answer)}`).digest());
}

/** Pick a random puzzle and sign its correct answer, bound to this token nonce. */
export function pickPuzzle(nonce: string): { puzzle: CaptchaPuzzle; sig: string } {
    const p = PUZZLES[Math.floor(Math.random() * PUZZLES.length)];
    const sig = signCaptcha(nonce, p.id, p.answer);
    return {
        puzzle: { id: p.id, prompt: p.prompt, type: p.type, choices: p.choices, min: p.min, max: p.max },
        sig,
    };
}

/**
 * Verify the visitor's answer. We recompute the signature over THEIR answer and
 * compare to the challenge-time signature (over the correct answer) — they match
 * only if the answers match after normalisation, and only for this exact nonce.
 */
export function verifyCaptcha(nonce: string, puzzleId: string, sig: string, answer: string): boolean {
    if (!nonce || !puzzleId || !sig) return false;
    return safeEqual(sig, signCaptcha(nonce, puzzleId, answer));
}

export const HONEYPOT_FIELD = 'website';
