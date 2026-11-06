import { describe, expect, test } from 'bun:test';
import { SignJWT } from 'jose';
import { verifyPreviewToken, PREVIEW_PURPOSE, PREVIEW_AUDIENCE } from './preview-token';

const SECRET = 'testsecret';
const key = (s: string) => new TextEncoder().encode(s);

async function mint(o: { slug?: string; aud?: string; secret?: string; purpose?: string; exp?: string | number; alg?: string } = {}) {
    return new SignJWT({ purpose: o.purpose ?? PREVIEW_PURPOSE, preview: o.slug ?? 'my-slug' })
        .setProtectedHeader({ alg: o.alg ?? 'HS256' })
        .setIssuedAt()
        .setAudience(o.aud ?? PREVIEW_AUDIENCE)
        .setExpirationTime(o.exp ?? '90s')
        .sign(key(o.secret ?? SECRET));
}

describe('verifyPreviewToken', () => {
    test('accepts a valid token for its slug', async () => {
        expect(await verifyPreviewToken(await mint(), 'my-slug', SECRET)).toBe(true);
    });
    test('rejects a missing token', async () => {
        expect(await verifyPreviewToken(undefined, 'my-slug', SECRET)).toBe(false);
        expect(await verifyPreviewToken('', 'my-slug', SECRET)).toBe(false);
    });
    test('rejects an expired token', async () => {
        const past = Math.floor(Date.now() / 1000) - 10;
        expect(await verifyPreviewToken(await mint({ exp: past }), 'my-slug', SECRET)).toBe(false);
    });
    test('rejects a token minted for another slug', async () => {
        expect(await verifyPreviewToken(await mint({ slug: 'other' }), 'my-slug', SECRET)).toBe(false);
    });
    test('rejects the wrong audience', async () => {
        expect(await verifyPreviewToken(await mint({ aud: 'something-else' }), 'my-slug', SECRET)).toBe(false);
    });
    test('rejects a service-audience token (aud artifacts-service)', async () => {
        expect(await verifyPreviewToken(await mint({ aud: 'artifacts-service' }), 'my-slug', SECRET)).toBe(false);
    });
    test('rejects HS384', async () => {
        expect(await verifyPreviewToken(await mint({ alg: 'HS384' }), 'my-slug', SECRET)).toBe(false);
    });
    test('rejects alg none', async () => {
        const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
        const t = `${b({ alg: 'none', typ: 'JWT' })}.${b({ purpose: PREVIEW_PURPOSE, preview: 'my-slug', aud: PREVIEW_AUDIENCE, exp: Math.floor(Date.now() / 1000) + 90 })}.`;
        expect(await verifyPreviewToken(t, 'my-slug', SECRET)).toBe(false);
    });
    test('rejects a token signed with another secret', async () => {
        expect(await verifyPreviewToken(await mint({ secret: 'nope' }), 'my-slug', SECRET)).toBe(false);
    });
    test('rejects a tampered token', async () => {
        const t = await mint({ slug: 'other' });
        const [h, , s] = t.split('.');
        const forged = Buffer.from(JSON.stringify({ purpose: PREVIEW_PURPOSE, preview: 'my-slug', aud: 'artifacts-service', exp: Math.floor(Date.now() / 1000) + 90 })).toString('base64url');
        expect(await verifyPreviewToken(`${h}.${forged}.${s}`, 'my-slug', SECRET)).toBe(false);
    });
    test('rejects an ordinary admin service token (no preview purpose)', async () => {
        expect(await verifyPreviewToken(await mint({ purpose: 'artifact-list' }), 'my-slug', SECRET)).toBe(false);
    });
    test('rejects everything when the secret is unset', async () => {
        expect(await verifyPreviewToken(await mint(), 'my-slug', undefined)).toBe(false);
    });
});
