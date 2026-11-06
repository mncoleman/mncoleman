/**
 * Admin profile photos: which source wins, what we are willing to store, and what an
 * upload must look like. Pure (no Worker, DOM or KV types) so the Worker, the admin UI
 * and the selftest all run the same code.
 *
 * Sources, per person (the owner included: the owner is ONE identity whichever way they
 * sign in, so a Google login can show the Telegram photo and the other way round):
 *   upload    a photo they uploaded
 *   google    the `picture` claim of a Google sign-in
 *   telegram  the `picture` claim of a Telegram sign-in, or the Telegram profile lookup
 *
 * Choice ('pin'): 'auto' (the default) is Google first, then Telegram. Picking a source
 * pins it; uploading a photo pins 'upload', which is how an upload ends up on top. A pin
 * whose source has since gone missing falls back to automatic, never to a blank.
 */

export type AvatarSource = 'upload' | 'google' | 'telegram';
export type AvatarPin = 'auto' | AvatarSource;
export const AVATAR_PINS: readonly AvatarPin[] = ['auto', 'upload', 'google', 'telegram'];

export function isAvatarPin(v: unknown): v is AvatarPin {
    return typeof v === 'string' && (AVATAR_PINS as readonly string[]).includes(v);
}

/** What is kept in KV (`avatar-meta:<id>`). Never holds an email or a Telegram id. */
export interface AvatarMeta {
    pin?: AvatarPin;
    google?: { url: string; at: number };
    telegram?: { url: string; at: number };
    /** `token` names the stored bytes (random, so the public URL is unguessable); `v` is a content hash for cache keying. */
    upload?: { token: string; v: string; at: number };
    /**
     * The Telegram handle this person signs in with, kept server-side only so a Google
     * session can still find their cached Telegram photo. Never sent to a client.
     */
    tgName?: string;
}

/** What the client gets about its own photo. */
export interface AvatarState {
    photoUrl: string | null;
    /** Which source `photoUrl` came from. */
    source: AvatarSource | null;
    /** The person's choice. */
    pin: AvatarPin;
    /** The URL behind each source, null where that source does not exist. */
    sources: { upload: string | null; google: string | null; telegram: string | null };
}

/* --------------------------------- sanitising -------------------------------- */

const MAX_URL = 512;

function parseHttps(raw: unknown): URL | null {
    if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_URL) return null;
    let u: URL;
    try { u = new URL(raw.trim()); } catch { return null; }
    if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    return u;
}

/** Google profile pictures live on *.googleusercontent.com. Anything else is dropped. */
export function sanitizeGoogleUrl(raw: unknown): string | null {
    const u = parseHttps(raw);
    if (!u) return null;
    const h = u.hostname.toLowerCase();
    if (h !== 'googleusercontent.com' && !h.endsWith('.googleusercontent.com')) return null;
    u.hash = '';
    return u.toString();
}

const TG_HOSTS = ['t.me', 'telegram.org', 'telegram-cdn.org', 'cdn-telegram.org'];

/**
 * Telegram's public photo hosts. `api.telegram.org` is refused outright: its file URLs
 * embed the bot token. `proxyOrigin` additionally allows this Worker's own
 * `/api/avatar/<username>` proxy path (the only way a bot-API photo may be shown).
 */
export function sanitizeTelegramUrl(raw: unknown, proxyOrigin?: string): string | null {
    const u = parseHttps(raw);
    if (!u) return null;
    const h = u.hostname.toLowerCase();
    if (h === 'api.telegram.org') return null;
    if (TG_HOSTS.some((base) => h === base || h.endsWith(`.${base}`))) {
        // t.me answers "no photo" with Telegram's own logo; that is not a person's picture.
        if (h.endsWith('telegram.org') && u.pathname.startsWith('/img/')) return null;
        u.hash = '';
        return u.toString();
    }
    if (proxyOrigin && u.origin === proxyOrigin && /^\/api\/avatar\/[a-z0-9_]{1,32}$/.test(u.pathname) && !u.search) {
        return u.toString();
    }
    return null;
}

/**
 * True when a Telegram photo URL says nothing about who it belongs to. `t.me/i/userpic/<size>/<username>.jpg`
 * embeds the handle, and the Worker's own proxy path embeds it too, so neither may be shown to
 * anyone but the person themselves (or the owner). CDN file URLs are random hashes.
 */
export function isOpaqueTelegramUrl(url: string | null): boolean {
    if (!url) return false;
    let u: URL;
    try { u = new URL(url); } catch { return false; }
    const h = u.hostname.toLowerCase();
    if (h === 't.me' || h.endsWith('.t.me')) return false;
    if (/\/api\/avatar\/[a-z0-9_]{1,32}$/.test(u.pathname)) return false;
    return !/userpic/i.test(u.pathname);
}

/** True for the Worker's own Telegram proxy path, whose URL contains a Telegram username. */
export function isTelegramProxyUrl(url: string | null): boolean {
    return !!url && /\/api\/avatar\/[a-z0-9_]{1,32}$/.test(url);
}

/** The picture URL a sign-in's verified ID token carries, already sanitised. */
export function pictureFromClaims(provider: 'google' | 'telegram', claims: unknown): string | null {
    const picture = (claims as { picture?: unknown } | null)?.picture;
    return provider === 'google' ? sanitizeGoogleUrl(picture) : sanitizeTelegramUrl(picture);
}

/* ------------------------------- meta + resolver ----------------------------- */

/** Reads a stored meta value defensively: a malformed or hand-edited entry yields {} rather than throwing. */
export function parseMeta(raw: string | null | undefined): AvatarMeta {
    if (!raw) return {};
    type Loose = { pin?: unknown; tgName?: unknown; google?: { url?: unknown; at?: unknown }; telegram?: { url?: unknown; at?: unknown }; upload?: { token?: unknown; v?: unknown; at?: unknown } };
    let o: Loose;
    try { o = JSON.parse(raw); } catch { return {}; }
    if (!o || typeof o !== 'object') return {};
    const meta: AvatarMeta = {};
    if (isAvatarPin(o.pin)) meta.pin = o.pin;
    const g = sanitizeGoogleUrl(o.google?.url);
    if (g) meta.google = { url: g, at: Number(o.google?.at) || 0 };
    const t = sanitizeTelegramUrl(o.telegram?.url);
    if (t) meta.telegram = { url: t, at: Number(o.telegram?.at) || 0 };
    if (typeof o.tgName === 'string' && /^[a-z0-9_]{1,32}$/.test(o.tgName)) meta.tgName = o.tgName;
    if (typeof o.upload?.token === 'string' && /^[a-f0-9]{32}$/.test(o.upload.token) && typeof o.upload.v === 'string' && /^[a-f0-9]{8,64}$/.test(o.upload.v)) {
        meta.upload = { token: o.upload.token, v: o.upload.v, at: Number(o.upload?.at) || 0 };
    }
    return meta;
}

const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Fold the photos a sign-in just revealed into the stored meta. An unchanged URL is only
 * rewritten once a day, so a login does not cost a KV write each time. A missing or
 * unusable photo never erases a stored one.
 */
export function mergeCapturedPhotos(
    meta: AvatarMeta,
    incoming: { google?: string | null; telegram?: string | null; telegramName?: string | null },
    now: number,
): { meta: AvatarMeta; changed: boolean } {
    const next: AvatarMeta = { ...meta };
    let changed = false;
    const tgName = (incoming.telegramName || '').toLowerCase();
    if (/^[a-z0-9_]{1,32}$/.test(tgName) && meta.tgName !== tgName) { next.tgName = tgName; changed = true; }
    for (const source of ['google', 'telegram'] as const) {
        const url = incoming[source];
        if (!url) continue;
        const have = meta[source];
        if (have && have.url === url && now - have.at < REFRESH_AFTER_MS) continue;
        next[source] = { url, at: now };
        changed = true;
    }
    return { meta: next, changed };
}

export function uploadPhotoUrl(workerOrigin: string, upload: { token: string; v: string }): string {
    return `${workerOrigin}/api/avatar-upload/${upload.token}?v=${upload.v}`;
}

export function resolveAvatar(input: {
    pin?: AvatarPin | null;
    upload?: string | null;
    google?: string | null;
    telegram?: string | null;
}): AvatarState {
    const sources = { upload: input.upload || null, google: input.google || null, telegram: input.telegram || null };
    const pin: AvatarPin = input.pin && isAvatarPin(input.pin) ? input.pin : 'auto';
    let source: AvatarSource | null = null;
    if (pin !== 'auto' && sources[pin]) source = pin;
    else if (sources.google) source = 'google';
    else if (sources.telegram) source = 'telegram';
    return { photoUrl: source ? sources[source] : null, source, pin, sources };
}

/* ---------------------------------- uploads ---------------------------------- */

/** After the client has resized to 256x256 a photo is a few tens of KB; this is generous headroom. */
export const MAX_AVATAR_BYTES = 300 * 1024;
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type AvatarType = typeof AVATAR_TYPES[number];

export type UploadCheck =
    | { ok: true; type: AvatarType }
    | { ok: false; status: number; error: string };

/** Identify an image by its first bytes. Anything else, SVG and HTML included, is null. */
export function sniffImageType(b: Uint8Array): AvatarType | null {
    if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
    if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    return null;
}

/**
 * Decide whether uploaded bytes may be stored. The bytes decide the type, not the
 * header: a declared type is only checked against them. SVG is refused by name so the
 * message is useful, and by omission (it has no magic bytes) everywhere else.
 */
export function validateAvatarUpload(bytes: Uint8Array, declaredType?: string | null): UploadCheck {
    const declared = (declaredType || '').split(';')[0].trim().toLowerCase();
    if (declared === 'image/svg+xml') {
        return { ok: false, status: 415, error: 'SVG images are not allowed. Use a PNG, JPEG or WebP photo.' };
    }
    if (bytes.length === 0) return { ok: false, status: 400, error: 'That file is empty.' };
    if (bytes.length > MAX_AVATAR_BYTES) {
        return { ok: false, status: 413, error: 'That photo is too large. Pick a smaller one.' };
    }
    const sniffed = sniffImageType(bytes);
    if (!sniffed) return { ok: false, status: 415, error: 'That is not a PNG, JPEG or WebP photo.' };
    if (declared && declared !== sniffed) {
        return { ok: false, status: 415, error: 'The file does not match its type. Pick a different photo.' };
    }
    return { ok: true, type: sniffed };
}

/** Centre square of a w x h image, for the client-side crop to 256x256. */
export function squareCrop(w: number, h: number): { sx: number; sy: number; side: number } {
    const side = Math.max(1, Math.min(w, h));
    return { sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), side };
}

export const AVATAR_SIZE = 256;

/* --------------------------- KV helpers (login capture) ---------------------- */

export interface KvLike {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
}

/**
 * Names that no invite may take. 'owner' is the session user id of the owner, who is never in
 * KV, so a person invited under that id would share the owner's session id and photo record.
 */
export const RESERVED_USER_IDS: readonly string[] = ['owner'];
export const isReservedUserId = (id: string) => RESERVED_USER_IDS.includes(id.trim().toLowerCase().replace(/^@/, ''));

/**
 * The owner's record lives under a key no user id can produce: Telegram ids are [a-z0-9_] and an
 * email id always has text before its '@', so '@owner' is never a real id.
 */
export const avatarMetaKey = (id: string) => (id === 'owner' ? 'avatar-meta:@owner' : `avatar-meta:${id}`);

/**
 * Called by both sign-in callbacks with the photo their ID token carried. The owner
 * signs in two ways but is one person, so both write to the same `id` ('owner').
 * Never throws: a failed write must not fail a login.
 */
export async function captureLoginPhotos(
    kv: KvLike,
    id: string,
    incoming: { google?: string | null; telegram?: string | null; telegramName?: string | null },
    now: number = Date.now(),
): Promise<boolean> {
    if (!id || (!incoming.google && !incoming.telegram && !incoming.telegramName)) return false;
    try {
        const meta = parseMeta(await kv.get(avatarMetaKey(id)));
        const merged = mergeCapturedPhotos(meta, incoming, now);
        if (!merged.changed) return false;
        await kv.put(avatarMetaKey(id), JSON.stringify(merged.meta));
        return true;
    } catch (e) {
        console.error('Avatar capture failed:', e);
        return false;
    }
}
