import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { join, resolve } from 'node:path';
import {
    ensureRoot,
    exists as slugExists,
    save,
    SlugTakenError,
    getMeta,
    getFile,
    listAll,
    remove,
    saveOg,
    getOg,
    updateMeta,
    replaceFile,
    type ArtifactMeta,
    type Visibility,
} from './storage';
import { isValidSlug, suggestFromFilename } from './slugs';
import { requireAuth } from './auth';
import { renderOg } from './og';
import { signSlugCookie, verifySlugCookie, cookieName, parseCookies } from './cookies';
import { notFoundPage, passwordPromptPage } from './pages';

const STORAGE_ROOT = resolve(process.env.STORAGE_ROOT || '/srv/artifacts');
const RESERVED_FILENAMES = new Set(['..', '.', 'meta.json', 'og.png', '']);
const ROOT_REDIRECT = process.env.ROOT_REDIRECT || 'https://mncoleman.com/artifacts/';
const SITE_FAVICON_SVG = 'https://mncoleman.com/icon.svg';
const SITE_FAVICON_ICO = 'https://mncoleman.com/favicon.ico';

function normalizeMimeType(t: string): string {
    return (t || 'application/octet-stream').split(';')[0].trim().toLowerCase();
}

await ensureRoot();

const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://artifacts.mncoleman.com').replace(/\/$/, '');
const MAX_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || `${25 * 1024 * 1024}`, 10);
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'https://mncoleman.com,http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const app = new Hono();

app.use(
    '/api/*',
    cors({
        origin: (origin) => (CORS_ORIGINS.includes(origin) ? origin : null),
        allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Authorization', 'Content-Type'],
        maxAge: 600,
    })
);

app.get('/health', (c) => c.text('ok'));

function publicArtifactView(m: ArtifactMeta) {
    return {
        id: m.slug,
        slug: m.slug,
        name: m.name,
        description: m.description,
        type: normalizeMimeType(m.type),
        size: m.size,
        uploadedAt: m.uploadedAt,
        filename: m.filename,
        url: `${PUBLIC_BASE}/a/${m.slug}`,
        downloadUrl: `${PUBLIC_BASE}/raw/${m.slug}`,
        ogImage: `${PUBLIC_BASE}/og/${m.slug}.png`,
        // Legacy artifacts written before Phase 4 didn't have this field — default to public.
        visibility: m.visibility ?? 'public',
        source: 'dynamic' as const,
    };
}

function adminArtifactView(m: ArtifactMeta) {
    return { ...publicArtifactView(m), hasPassword: !!m.passwordHash };
}

app.get('/api/list', async (c) => {
    const all = await listAll();
    const metas = all.filter((m) => m.visibility !== 'private');
    const body = JSON.stringify({ artifacts: metas.map(publicArtifactView) });
    const latest = metas[0]?.uploadedAt || '0';
    const etag = `W/"${metas.length}-${latest}"`;
    if (c.req.header('If-None-Match') === etag) {
        return new Response(null, { status: 304, headers: { ETag: etag } });
    }
    return new Response(body, {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
            ETag: etag,
        },
    });
});

// Admin-only listing — includes private artifacts (with hasPassword flag, never the hash).
app.get('/api/admin/list', requireAuth, async (c) => {
    const metas = await listAll();
    return c.json({ artifacts: metas.map(adminArtifactView) });
});

app.post('/api/upload', requireAuth, async (c) => {
    let form: FormData;
    try {
        form = await c.req.formData();
    } catch {
        return c.json({ error: 'invalid multipart body' }, 400);
    }

    const file = form.get('file');
    if (!(file instanceof File)) {
        return c.json({ error: 'file required' }, 400);
    }
    if (file.size === 0) {
        return c.json({ error: 'file is empty' }, 400);
    }
    if (file.size > MAX_BYTES) {
        return c.json({ error: `file too large (max ${MAX_BYTES} bytes)` }, 413);
    }

    let slug = ((form.get('slug') as string | null) || '').trim().toLowerCase();
    if (!slug) slug = suggestFromFilename(file.name);
    if (!isValidSlug(slug)) {
        return c.json(
            { error: 'invalid slug — use 3-60 chars of [a-z0-9-], must start and end with alphanumeric' },
            400
        );
    }

    let safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'file';
    if (RESERVED_FILENAMES.has(safeFilename) || safeFilename.startsWith('.')) {
        safeFilename = `file_${safeFilename.replace(/^\.+/, '')}` || 'file';
    }
    const resolvedPath = resolve(join(STORAGE_ROOT, slug, safeFilename));
    const slugDir = resolve(join(STORAGE_ROOT, slug)) + '/';
    if (!resolvedPath.startsWith(slugDir)) {
        return c.json({ error: 'invalid filename' }, 400);
    }

    const buf = await file.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
        return c.json({ error: `file too large (max ${MAX_BYTES} bytes)` }, 413);
    }

    const visibility: Visibility =
        ((form.get('visibility') as string | null) || 'public') === 'private' ? 'private' : 'public';
    const password = (form.get('password') as string | null) || '';
    if (visibility === 'private') {
        if (password.length < 4) {
            return c.json({ error: 'private artifacts require a password of at least 4 characters' }, 400);
        }
        if (password.length > 200) {
            return c.json({ error: 'password too long' }, 400);
        }
    }

    const meta: ArtifactMeta = {
        slug,
        name: ((form.get('name') as string | null) || file.name).slice(0, 200),
        description: ((form.get('description') as string | null) || '').slice(0, 500),
        filename: safeFilename,
        type: normalizeMimeType(file.type),
        size: buf.byteLength,
        uploadedAt: new Date().toISOString(),
        visibility,
        ...(visibility === 'private' ? { passwordHash: await Bun.password.hash(password) } : {}),
    };

    try {
        await save(slug, buf, meta);
    } catch (e) {
        if (e instanceof SlugTakenError) {
            return c.json({ error: 'slug already in use' }, 409);
        }
        throw e;
    }

    // Render OG image in the background — don't block the upload response.
    queueMicrotask(async () => {
        try {
            const png = await renderOg(meta.name);
            await saveOg(slug, png);
        } catch (e) {
            console.error('[og] render failed:', e);
        }
    });

    return c.json({ ok: true, artifact: adminArtifactView(meta) }, 201);
});

app.delete('/api/:slug', requireAuth, async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    if (!(await slugExists(slug))) return c.json({ error: 'not found' }, 404);
    await remove(slug);
    return c.json({ ok: true });
});

// Edit an existing artifact. Multipart body; all fields optional.
//   name, description     — metadata
//   visibility            — 'public' | 'private'
//   password              — required when transitioning to private (or to rotate)
//   clearPassword=true    — combined with visibility=public, drops the hash
//   file                  — replaces the underlying file (size/type/filename update too)
app.patch('/api/:slug', requireAuth, async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    const existing = await getMeta(slug);
    if (!existing) return c.json({ error: 'not found' }, 404);

    let form: FormData;
    try {
        form = await c.req.formData();
    } catch {
        return c.json({ error: 'invalid multipart body' }, 400);
    }

    const next: ArtifactMeta = { ...existing, visibility: existing.visibility ?? 'public' };
    let nameChanged = false;

    if (form.has('name')) {
        const v = ((form.get('name') as string | null) || '').slice(0, 200);
        if (v && v !== next.name) { next.name = v; nameChanged = true; }
    }
    if (form.has('description')) {
        next.description = ((form.get('description') as string | null) || '').slice(0, 500);
    }

    const newVisibility = form.get('visibility') as string | null;
    const newPassword = (form.get('password') as string | null) || '';
    const clearPassword = form.get('clearPassword') === 'true';

    if (newVisibility === 'private' || (next.visibility === 'private' && newVisibility === null && newPassword)) {
        // Setting private OR rotating password on already-private artifact.
        if (newPassword) {
            if (newPassword.length < 4 || newPassword.length > 200) {
                return c.json({ error: 'password must be 4-200 chars' }, 400);
            }
            next.passwordHash = await Bun.password.hash(newPassword);
        } else if (next.visibility !== 'private' || !next.passwordHash) {
            // Going private with no password and no existing one — not allowed.
            return c.json({ error: 'private artifacts require a password' }, 400);
        }
        next.visibility = 'private';
    } else if (newVisibility === 'public') {
        next.visibility = 'public';
        if (clearPassword || newVisibility === 'public') {
            delete next.passwordHash;
        }
    }

    // Optional file replacement.
    const file = form.get('file');
    if (file instanceof File && file.size > 0) {
        if (file.size > MAX_BYTES) {
            return c.json({ error: `file too large (max ${MAX_BYTES} bytes)` }, 413);
        }
        let safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200) || 'file';
        if (RESERVED_FILENAMES.has(safeFilename) || safeFilename.startsWith('.')) {
            safeFilename = `file_${safeFilename.replace(/^\.+/, '')}` || 'file';
        }
        const resolvedPath = resolve(join(STORAGE_ROOT, slug, safeFilename));
        const slugDir = resolve(join(STORAGE_ROOT, slug)) + '/';
        if (!resolvedPath.startsWith(slugDir)) {
            return c.json({ error: 'invalid filename' }, 400);
        }
        const buf = await file.arrayBuffer();
        await replaceFile(slug, existing.filename, safeFilename, buf);
        next.filename = safeFilename;
        next.type = normalizeMimeType(file.type);
        next.size = buf.byteLength;
        next.uploadedAt = new Date().toISOString();
    }

    await updateMeta(slug, next);

    if (nameChanged) {
        // OG render is title-only — re-render in the background.
        queueMicrotask(async () => {
            try {
                const png = await renderOg(next.name);
                await saveOg(slug, png);
            } catch (e) {
                console.error('[og] re-render failed:', e);
            }
        });
    }

    return c.json({ ok: true, artifact: adminArtifactView(next) });
});

app.get('/og/:filename', async (c) => {
    const filename = c.req.param('filename');
    const m = filename.match(/^([a-z0-9][a-z0-9-]{0,59})\.png$/);
    if (!m) return c.notFound();
    const slug = m[1];
    const png = await getOg(slug);
    if (!png) return c.notFound();
    return new Response(png, {
        headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400',
        },
    });
});

function escapeAttr(s: string): string {
    return s.replace(/[&<>"']/g, (ch) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!
    );
}

function injectOgMeta(html: string, meta: ArtifactMeta): string {
    const ogUrl = `${PUBLIC_BASE}/og/${meta.slug}.png`;
    const pageUrl = `${PUBLIC_BASE}/a/${meta.slug}`;
    const desc = meta.description || `mncoleman Artifact: ${meta.name}`;

    const tags: string[] = [
        `<meta property="og:title" content="${escapeAttr(meta.name)}">`,
        `<meta property="og:description" content="${escapeAttr(desc)}">`,
        `<meta property="og:image" content="${ogUrl}">`,
        `<meta property="og:url" content="${pageUrl}">`,
        `<meta property="og:type" content="article">`,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${escapeAttr(meta.name)}">`,
        `<meta name="twitter:description" content="${escapeAttr(desc)}">`,
        `<meta name="twitter:image" content="${ogUrl}">`,
    ];

    // Inject the mncoleman favicon when the artifact HTML didn't ship one.
    if (!/<link\s+[^>]*rel=["']?(?:shortcut\s+)?icon/i.test(html)) {
        tags.push(`<link rel="icon" type="image/svg+xml" href="${SITE_FAVICON_SVG}">`);
        tags.push(`<link rel="alternate icon" href="${SITE_FAVICON_ICO}">`);
    }

    const block = tags.join('\n    ');
    if (/<\/head>/i.test(html)) {
        return html.replace(/<\/head>/i, `    ${block}\n  </head>`);
    }
    if (/<head[^>]*>/i.test(html)) {
        return html.replace(/<head[^>]*>/i, (m) => `${m}\n    ${block}`);
    }
    return `<!DOCTYPE html><html><head>${block}</head><body>${html}</body></html>`;
}

/** Returns true if the request carries a valid unlock cookie for this slug. */
function isUnlocked(c: any, slug: string): boolean {
    const cookies = parseCookies(c.req.header('Cookie'));
    return verifySlugCookie(cookies[cookieName(slug)], slug);
}

app.get('/a/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return new Response(notFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    const meta = await getMeta(slug);
    if (!meta) return new Response(notFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    if (meta.visibility === 'private' && !isUnlocked(c, slug)) {
        // Serve the prompt with HTTP 200 so OpenGraph crawlers (iMessage/Slack/X)
        // honor the og:image meta. Content is still gated — the artifact bytes
        // are not in the response body.
        return new Response(
            passwordPromptPage({ slug, name: meta.name, description: meta.description, publicBase: PUBLIC_BASE }),
            {
                status: 200,
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'no-store',
                    'X-Robots-Tag': 'noindex',
                },
            }
        );
    }

    const file = await getFile(slug, meta.filename);
    const cacheControl = meta.visibility === 'private' ? 'private, no-store' : 'public, max-age=300';
    const normType = normalizeMimeType(meta.type);

    if (normType === 'text/html') {
        const injected = injectOgMeta(file.toString('utf-8'), meta);
        return new Response(injected, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': cacheControl,
                'X-Artifact-Slug': slug,
            },
        });
    }

    return new Response(file, {
        headers: {
            'Content-Type': normType,
            'Content-Disposition': `inline; filename="${meta.filename}"`,
            'Cache-Control': cacheControl,
            'X-Artifact-Slug': slug,
        },
    });
});

app.get('/raw/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return new Response(notFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    const meta = await getMeta(slug);
    if (!meta) return new Response(notFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    if (meta.visibility === 'private' && !isUnlocked(c, slug)) {
        // Don't render a prompt for raw downloads — point the visitor at the gated viewer.
        return c.redirect(`/a/${encodeURIComponent(slug)}`, 302);
    }

    const file = await getFile(slug, meta.filename);
    return new Response(file, {
        headers: {
            'Content-Type': normalizeMimeType(meta.type),
            'Content-Disposition': `attachment; filename="${meta.filename}"`,
            'Cache-Control': meta.visibility === 'private' ? 'private, no-store' : 'public, max-age=300',
        },
    });
});

// Password gate — verifies the password and sets a slug-scoped signed cookie.
app.post('/unlock/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return new Response(notFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    const meta = await getMeta(slug);
    if (!meta || meta.visibility !== 'private' || !meta.passwordHash) {
        return new Response(notFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    let password = '';
    try {
        const form = await c.req.formData();
        password = ((form.get('password') as string | null) || '').slice(0, 200);
    } catch {
        return new Response(
            passwordPromptPage({ slug, name: meta.name, description: meta.description, publicBase: PUBLIC_BASE, error: 'Invalid form submission' }),
            {
                status: 400,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }
        );
    }

    const ok = password.length > 0 && (await Bun.password.verify(password, meta.passwordHash));
    if (!ok) {
        return new Response(
            passwordPromptPage({ slug, name: meta.name, description: meta.description, publicBase: PUBLIC_BASE, error: 'Incorrect password.' }),
            {
                status: 401,
                headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }
        );
    }

    const cookieValue = signSlugCookie(slug, 60 * 60 * 24); // 24h
    return new Response(null, {
        status: 303,
        headers: {
            'Location': `/a/${encodeURIComponent(slug)}`,
            'Set-Cookie': `${cookieName(slug)}=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
        },
    });
});

// Favicon: redirect to mncoleman.com's so artifact pages and direct visits look on-brand.
app.get('/favicon.ico', (c) => c.redirect(SITE_FAVICON_ICO, 302));
app.get('/icon.svg', (c) => c.redirect(SITE_FAVICON_SVG, 302));

// Root: send people to the listings page on the main site.
app.get('/', (c) => c.redirect(ROOT_REDIRECT, 302));

// Catch-all: animated 404.
app.notFound(() =>
    new Response(notFoundPage(), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
);

const port = parseInt(process.env.PORT || '7878', 10);
Bun.serve({ port, fetch: app.fetch, idleTimeout: 60 });
console.log(`[artifacts] listening on :${port} (storage=${process.env.STORAGE_ROOT || '/srv/artifacts'})`);
