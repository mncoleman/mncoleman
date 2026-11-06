import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SignJWT } from 'jose';
import { PREVIEW_AUDIENCE, PREVIEW_PURPOSE } from './preview-token';

// Route-level tests: run the real service in a subprocess on a free port with a temp store.
const SECRET = 'route-test-secret';
const PORT = 20000 + Math.floor(Math.random() * 20000);
const BASE = `http://127.0.0.1:${PORT}`;
const key = new TextEncoder().encode(SECRET);
let root = '';
let proc: ReturnType<typeof Bun.spawn>;

const sign = (claims: Record<string, unknown>, aud: string, exp: number | string = '90s') =>
    new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setAudience(aud).setExpirationTime(exp).sign(key);
const preview = (slug: string, exp: number | string = '90s') => sign({ purpose: PREVIEW_PURPOSE, preview: slug }, PREVIEW_AUDIENCE, exp);
const adminToken = () => sign({ sub: 'owner', role: 'super_admin', artifacts: '*', manageSecrets: true }, 'artifacts-service', '5m');
const get = (path: string) => fetch(`${BASE}${path}`, { redirect: 'manual' });

async function upload(slug: string, visibility: 'public' | 'private') {
    const fd = new FormData();
    fd.append('file', new File([`<html><body>CONTENT-${slug}</body></html>`], 'a.html', { type: 'text/html' }));
    fd.append('slug', slug);
    fd.append('name', slug);
    fd.append('visibility', visibility);
    if (visibility === 'private') fd.append('password', 'hunter22');
    const res = await fetch(`${BASE}/api/upload`, { method: 'POST', headers: { Authorization: `Bearer ${await adminToken()}` }, body: fd });
    expect(res.status).toBe(201);
}

beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), 'preview-routes-'));
    proc = Bun.spawn(['bun', 'run', 'src/index.ts'], {
        cwd: join(import.meta.dir, '..'),
        env: { ...process.env, JWT_SECRET: SECRET, PORT: String(PORT), STORAGE_ROOT: join(root, 'store'), LIBRARY_ROOT: join(root, 'lib'), PUBLIC_BASE_URL: BASE },
        stdout: 'ignore', stderr: 'ignore',
    });
    for (let i = 0; i < 50; i++) {
        try { if ((await fetch(`${BASE}/health`)).ok) break; } catch { /* not up yet */ }
        await Bun.sleep(100);
    }
    await upload('priv-a', 'private');
    await upload('priv-b', 'private');
    await upload('pub-c', 'public');
});

afterAll(() => {
    proc?.kill();
    rmSync(root, { recursive: true, force: true });
});

const isGate = async (r: Response) => r.status === 200 && (await r.text()).includes('Unlock');

describe('/a/:slug?adminPreview=', () => {
    test('valid token: 303, unlock cookie, clean Location, no-referrer', async () => {
        const r = await get(`/a/priv-a?select=1&adminPreview=${await preview('priv-a')}`);
        expect(r.status).toBe(303);
        expect(r.headers.get('location')).toBe('/a/priv-a?select=1');
        expect(r.headers.get('referrer-policy')).toBe('no-referrer');
        const cookie = r.headers.get('set-cookie') || '';
        expect(cookie).toMatch(/^_a_priv-a=priv-a\.\d+\./);
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('Secure');
        expect(cookie).toContain('SameSite=Lax');
        // And the cookie it set really unlocks the artifact.
        const page = await fetch(`${BASE}/a/priv-a`, { headers: { Cookie: cookie.split(';')[0] } });
        expect(await page.text()).toContain('CONTENT-priv-a');
    });
    test('no token: gate', async () => {
        expect(await isGate(await get('/a/priv-a'))).toBe(true);
    });
    test('expired token: gate, no cookie', async () => {
        const r = await get(`/a/priv-a?adminPreview=${await preview('priv-a', Math.floor(Date.now() / 1000) - 5)}`);
        expect(r.headers.get('set-cookie')).toBeNull();
        expect(await isGate(r)).toBe(true);
    });
    test('garbage token: gate, and the gate response is no-referrer', async () => {
        const r = await get('/a/priv-a?adminPreview=garbage');
        expect(r.headers.get('referrer-policy')).toBe('no-referrer');
        expect(await isGate(r)).toBe(true);
    });
    test('token for slug A on slug B: gate', async () => {
        const r = await get(`/a/priv-b?adminPreview=${await preview('priv-a')}`);
        expect(r.headers.get('set-cookie')).toBeNull();
        expect(await isGate(r)).toBe(true);
    });
    test('public artifact ignores the token: served normally, no cookie, no redirect', async () => {
        const r = await get(`/a/pub-c?adminPreview=${await preview('pub-c')}`);
        expect(r.status).toBe(200);
        expect(r.headers.get('set-cookie')).toBeNull();
        expect(await r.text()).toContain('CONTENT-pub-c');
    });
});

describe('requireAuth refuses a preview token', () => {
    test('artifact API route', async () => {
        const r = await fetch(`${BASE}/api/admin/list`, { headers: { Authorization: `Bearer ${await preview('priv-a')}` } });
        expect(r.status).toBe(401);
    });
    test('library write routes (POST and PATCH)', async () => {
        const h = { Authorization: `Bearer ${await preview('priv-a')}` };
        expect((await fetch(`${BASE}/api/library`, { method: 'POST', headers: h, body: new FormData() })).status).toBe(401);
        expect((await fetch(`${BASE}/api/library/anything`, { method: 'PATCH', headers: h, body: new FormData() })).status).toBe(401);
    });
    test('control: a real service token passes the same auth', async () => {
        const r = await fetch(`${BASE}/api/admin/list`, { headers: { Authorization: `Bearer ${await adminToken()}` } });
        expect(r.status).toBe(200);
    });
});
