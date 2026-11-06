/** No-framework self-test:  npx tsx lib/avatar.selftest.ts */
import assert from 'node:assert/strict';
import {
    MAX_AVATAR_BYTES, avatarMetaKey, isOpaqueTelegramUrl, isReservedUserId, captureLoginPhotos, isTelegramProxyUrl, mergeCapturedPhotos, parseMeta,
    pictureFromClaims, resolveAvatar, sanitizeGoogleUrl, sanitizeTelegramUrl, sniffImageType, squareCrop,
    uploadPhotoUrl, validateAvatarUpload,
} from './avatar';

const G = 'https://lh3.googleusercontent.com/a/abc=s96-c';
const T = 'https://cdn4.cdn-telegram.org/file/x.jpg';
const U = 'https://w.example/api/avatar-upload/' + 'a'.repeat(32) + '?v=deadbeef';

// resolver: order
assert.equal(resolveAvatar({ google: G, telegram: T }).source, 'google', 'google beats telegram');
assert.equal(resolveAvatar({ telegram: T }).source, 'telegram', 'telegram when google is missing');
assert.equal(resolveAvatar({ google: G }).photoUrl, G);
assert.equal(resolveAvatar({}).photoUrl, null, 'nothing: initials');
assert.equal(resolveAvatar({}).source, null);
// automatic never uses an upload that has not been picked
assert.equal(resolveAvatar({ upload: U, google: G }).source, 'google');
assert.equal(resolveAvatar({ pin: 'auto', upload: U, telegram: T }).source, 'telegram');
// pins
assert.equal(resolveAvatar({ pin: 'upload', upload: U, google: G, telegram: T }).source, 'upload');
assert.equal(resolveAvatar({ pin: 'telegram', upload: U, google: G, telegram: T }).photoUrl, T);
assert.equal(resolveAvatar({ pin: 'google', google: G, telegram: T }).source, 'google');
// a pin whose source is gone falls back to automatic, never blank
assert.equal(resolveAvatar({ pin: 'upload', google: G, telegram: T }).source, 'google');
assert.equal(resolveAvatar({ pin: 'google', telegram: T }).source, 'telegram');
assert.equal(resolveAvatar({ pin: 'telegram' }).source, null);
assert.equal(resolveAvatar({ pin: 'upload', google: G }).pin, 'upload', 'the choice is kept so it applies again when the source returns');
assert.equal(resolveAvatar({ pin: 'bogus' as never, google: G }).pin, 'auto');
assert.deepEqual(resolveAvatar({ upload: U, telegram: T }).sources, { upload: U, google: null, telegram: T });

// sanitising
assert.equal(sanitizeGoogleUrl(G), G);
assert.equal(sanitizeGoogleUrl('https://lh3.googleusercontent.com/a/x#frag'), 'https://lh3.googleusercontent.com/a/x');
assert.equal(sanitizeGoogleUrl('http://lh3.googleusercontent.com/a/x'), null, 'https only');
assert.equal(sanitizeGoogleUrl('https://googleusercontent.com.evil.com/a'), null, 'suffix lookalike');
assert.equal(sanitizeGoogleUrl('https://evilgoogleusercontent.com/a'), null);
assert.equal(sanitizeGoogleUrl('https://user:pw@lh3.googleusercontent.com/a'), null);
assert.equal(sanitizeGoogleUrl('https://lh3.googleusercontent.com:8443/a'), null);
assert.equal(sanitizeGoogleUrl('javascript:alert(1)'), null);
assert.equal(sanitizeGoogleUrl('https://lh3.googleusercontent.com/' + 'a'.repeat(600)), null, 'length cap');
assert.equal(sanitizeGoogleUrl(undefined), null);
assert.equal(sanitizeGoogleUrl(42), null);
assert.equal(sanitizeTelegramUrl(T), T);
assert.equal(sanitizeTelegramUrl('https://t.me/i/userpic/320/x.jpg'), 'https://t.me/i/userpic/320/x.jpg');
assert.equal(sanitizeTelegramUrl('https://api.telegram.org/file/bot123:SECRET/photos/1.jpg'), null, 'bot token URLs are never stored');
assert.equal(sanitizeTelegramUrl('https://evil.com/x.jpg'), null);
assert.equal(sanitizeTelegramUrl('https://telegram.org/img/t_logo.png'), null, 'the generic logo is not a photo');
assert.equal(sanitizeTelegramUrl('https://lh3.googleusercontent.com/a/x'), null, 'a Google URL is not a Telegram photo');
assert.equal(sanitizeTelegramUrl('https://w.example/api/avatar/bob'), null, 'the proxy needs its origin named');
assert.equal(sanitizeTelegramUrl('https://w.example/api/avatar/bob', 'https://w.example'), 'https://w.example/api/avatar/bob');
assert.equal(sanitizeTelegramUrl('https://w.example/api/avatar/bob', 'https://other.example'), null);
assert.equal(sanitizeTelegramUrl('https://w.example/api/other', 'https://w.example'), null);
assert.ok(isTelegramProxyUrl('https://w.example/api/avatar/bob'));
assert.ok(!isTelegramProxyUrl(T));

// claims
assert.equal(pictureFromClaims('google', { picture: G, email: 'a@b.c' }), G);
assert.equal(pictureFromClaims('google', { picture: 'https://evil.com/p.png' }), null);
assert.equal(pictureFromClaims('google', {}), null);
assert.equal(pictureFromClaims('google', null), null);
assert.equal(pictureFromClaims('telegram', { picture: T }), T);
assert.equal(pictureFromClaims('telegram', { picture: G }), null);

// meta parsing tolerates junk and drops unsafe urls
assert.deepEqual(parseMeta(null), {});
assert.deepEqual(parseMeta('not json'), {});
assert.deepEqual(parseMeta('[]'), {});
assert.equal(parseMeta(JSON.stringify({ google: { url: 'https://evil.com/x', at: 1 } })).google, undefined);
assert.equal(parseMeta(JSON.stringify({ pin: 'upload', upload: { token: '../etc', v: 'abcd1234', at: 1 } })).upload, undefined, 'token must be 32 hex');
assert.equal(parseMeta(JSON.stringify({ pin: 'nope' })).pin, undefined);
assert.equal(uploadPhotoUrl('https://w.example', { token: 'a'.repeat(32), v: 'deadbeef' }), U);

// merge: never erases, rewrites at most daily
const now = 1_000_000_000_000;
const m = mergeCapturedPhotos({}, { google: G, telegram: null }, now);
assert.ok(m.changed);
assert.equal(m.meta.google?.url, G);
assert.equal(m.meta.telegram, undefined);
const same = mergeCapturedPhotos(m.meta, { google: G }, now + 1000);
assert.ok(!same.changed, 'same url within a day: no write');
assert.ok(mergeCapturedPhotos(m.meta, { google: G }, now + 25 * 3600 * 1000).changed, 'refreshed after a day');
const keep = mergeCapturedPhotos(m.meta, { google: null, telegram: T }, now + 1000);
assert.equal(keep.meta.google?.url, G, 'a login without a Google photo keeps the stored one');
assert.equal(keep.meta.telegram?.url, T);
assert.equal(mergeCapturedPhotos(m.meta, { google: 'https://lh3.googleusercontent.com/new' }, now + 1000).meta.google?.url, 'https://lh3.googleusercontent.com/new');

// capture through a fake KV: the owner's Google and Telegram logins land on ONE record
async function captureTest() {
    const store = new Map<string, string>();
    const kv = { get: async (k: string) => store.get(k) ?? null, put: async (k: string, v: string) => { store.set(k, v); } };
    // what the Google callback does with a verified id_token payload
    const googleClaims = { sub: '1', email: 'o@x.com', email_verified: true, picture: G };
    assert.ok(await captureLoginPhotos(kv, 'owner', { google: pictureFromClaims('google', googleClaims) }, now));
    // later, the same person signs in with Telegram
    assert.ok(await captureLoginPhotos(kv, 'owner', { telegram: pictureFromClaims('telegram', { picture: T }) }, now + 5000));
    const meta = parseMeta(store.get(avatarMetaKey('owner')));
    assert.equal(meta.google?.url, G);
    assert.equal(meta.telegram?.url, T);
    const r = resolveAvatar({ google: meta.google?.url, telegram: meta.telegram?.url });
    assert.equal(r.photoUrl, G);
    // a Telegram-only login after the Google photo is gone still shows Telegram
    assert.equal(resolveAvatar({ telegram: meta.telegram?.url }).photoUrl, T);
    // nothing to capture: no write
    const before = store.size;
    assert.ok(!(await captureLoginPhotos(kv, 'owner', { google: null, telegram: null }, now)));
    assert.equal(store.size, before);
    // a failing KV never throws
    const bad = { get: async () => { throw new Error('kv down'); }, put: async () => { throw new Error('kv down'); } };
    assert.equal(await captureLoginPhotos(bad, 'x', { google: G }), false);
}

// upload validator
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>');
assert.equal(sniffImageType(png), 'image/png');
assert.equal(sniffImageType(jpg), 'image/jpeg');
assert.equal(sniffImageType(webp), 'image/webp');
assert.equal(sniffImageType(svg), null);
assert.equal(sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])), null, 'RIFF WAVE is not WebP');
assert.deepEqual(validateAvatarUpload(png, 'image/png'), { ok: true, type: 'image/png' });
assert.deepEqual(validateAvatarUpload(jpg, 'image/jpeg; charset=x'), { ok: true, type: 'image/jpeg' });
assert.deepEqual(validateAvatarUpload(webp, 'image/webp'), { ok: true, type: 'image/webp' });
assert.deepEqual(validateAvatarUpload(png, ''), { ok: true, type: 'image/png' }, 'the bytes decide when no type is declared');
const sv = validateAvatarUpload(svg, 'image/svg+xml');
assert.ok(!sv.ok && sv.status === 415 && /SVG/.test(sv.error));
const sv2 = validateAvatarUpload(svg, 'image/png');
assert.ok(!sv2.ok && sv2.status === 415, 'SVG bytes under a PNG label are still refused');
assert.ok(!validateAvatarUpload(html, 'image/jpeg').ok, 'HTML under an image label is refused');
assert.ok(!validateAvatarUpload(png, 'image/jpeg').ok, 'declared type must match the bytes');
assert.ok(!validateAvatarUpload(png, 'image/gif').ok);
const empty = validateAvatarUpload(new Uint8Array(0), 'image/png');
assert.ok(!empty.ok && empty.status === 400);
const big = new Uint8Array(MAX_AVATAR_BYTES + 1); big.set(png);
const bigR = validateAvatarUpload(big, 'image/png');
assert.ok(!bigR.ok && bigR.status === 413);
const atCap = new Uint8Array(MAX_AVATAR_BYTES); atCap.set(png);
assert.ok(validateAvatarUpload(atCap, 'image/png').ok, 'exactly the cap is allowed');

// reserved ids and the owner's unforgeable key
assert.ok(isReservedUserId('owner') && isReservedUserId('@Owner') && isReservedUserId(' OWNER '));
assert.ok(!isReservedUserId('dana'));
assert.equal(avatarMetaKey('owner'), 'avatar-meta:@owner');
for (const id of ['dana', 'owner_', 'gail@example.com', 'u'.repeat(32)]) assert.notEqual(avatarMetaKey(id), avatarMetaKey('owner'));
// no valid user id (Telegram [a-z0-9_]{1,32} or an email with a local part) can be '@owner'
assert.ok(!/^[a-z0-9_]{1,32}$/.test('@owner') && !/^[^@\s]+@[^@\s]+$/.test('@owner'));

// photo URLs that embed a username or a token are not opaque
assert.ok(!isOpaqueTelegramUrl('https://t.me/i/userpic/320/dana.jpg'), 't.me userpic embeds the handle');
assert.ok(!isOpaqueTelegramUrl('https://t.me/i/userpic/320/dana.jpg?x=1'));
assert.ok(!isOpaqueTelegramUrl('https://cdn4.cdn-telegram.org/i/userpic/320/dana.jpg'));
assert.ok(!isOpaqueTelegramUrl('https://w.example/api/avatar/dana'), 'the proxy path embeds the handle');
assert.ok(isOpaqueTelegramUrl('https://cdn4.cdn-telegram.org/file/Xk3_abc.jpg'));
assert.ok(!isOpaqueTelegramUrl('https://api.telegram.org/file/bot1:SECRET/p.jpg') || sanitizeTelegramUrl('https://api.telegram.org/file/bot1:SECRET/p.jpg') === null);
assert.ok(!isOpaqueTelegramUrl(null) && !isOpaqueTelegramUrl('nonsense'));
// sanitizer still lets the userpic form be stored (for the person's own view) but never a token URL
assert.equal(sanitizeTelegramUrl('https://t.me/i/userpic/320/dana.jpg'), 'https://t.me/i/userpic/320/dana.jpg');
assert.equal(sanitizeTelegramUrl('https://api.telegram.org/file/bot1:SECRET/p.jpg'), null);
// handle is kept server-side in meta, validated
assert.equal(mergeCapturedPhotos({}, { telegramName: 'Dana' }, 1).meta.tgName, 'dana');
assert.equal(mergeCapturedPhotos({}, { telegramName: 'bad name!' }, 1).changed, false);
assert.equal(parseMeta(JSON.stringify({ tgName: '../x' })).tgName, undefined);

// crop geometry
assert.deepEqual(squareCrop(400, 400), { sx: 0, sy: 0, side: 400 });
assert.deepEqual(squareCrop(800, 400), { sx: 200, sy: 0, side: 400 });
assert.deepEqual(squareCrop(300, 500), { sx: 0, sy: 100, side: 300 });
assert.equal(squareCrop(0, 0).side, 1);

captureTest().then(() => console.log('avatar selftest ok'), (e) => { console.error(e); process.exit(1); });
