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
    type ArtifactMeta,
} from './storage';
import { isValidSlug, suggestFromFilename } from './slugs';
import { requireAuth } from './auth';
import { renderOg } from './og';

const STORAGE_ROOT = resolve(process.env.STORAGE_ROOT || '/srv/artifacts');
const RESERVED_FILENAMES = new Set(['..', '.', 'meta.json', 'og.png', '']);

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
        type: m.type,
        size: m.size,
        uploadedAt: m.uploadedAt,
        filename: m.filename,
        url: `${PUBLIC_BASE}/a/${m.slug}`,
        downloadUrl: `${PUBLIC_BASE}/raw/${m.slug}`,
        ogImage: `${PUBLIC_BASE}/og/${m.slug}.png`,
        source: 'dynamic' as const,
    };
}

app.get('/api/list', async (c) => {
    const metas = await listAll();
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

    const meta: ArtifactMeta = {
        slug,
        name: ((form.get('name') as string | null) || file.name).slice(0, 200),
        description: ((form.get('description') as string | null) || '').slice(0, 500),
        filename: safeFilename,
        type: file.type || 'application/octet-stream',
        size: buf.byteLength,
        uploadedAt: new Date().toISOString(),
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

    return c.json({ ok: true, artifact: publicArtifactView(meta) }, 201);
});

app.delete('/api/:slug', requireAuth, async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    if (!(await slugExists(slug))) return c.json({ error: 'not found' }, 404);
    await remove(slug);
    return c.json({ ok: true });
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

    const tags = [
        `<meta property="og:title" content="${escapeAttr(meta.name)}">`,
        `<meta property="og:description" content="${escapeAttr(desc)}">`,
        `<meta property="og:image" content="${ogUrl}">`,
        `<meta property="og:url" content="${pageUrl}">`,
        `<meta property="og:type" content="article">`,
        `<meta name="twitter:card" content="summary_large_image">`,
        `<meta name="twitter:title" content="${escapeAttr(meta.name)}">`,
        `<meta name="twitter:description" content="${escapeAttr(desc)}">`,
        `<meta name="twitter:image" content="${ogUrl}">`,
    ].join('\n    ');

    if (/<\/head>/i.test(html)) {
        return html.replace(/<\/head>/i, `    ${tags}\n  </head>`);
    }
    if (/<head[^>]*>/i.test(html)) {
        return html.replace(/<head[^>]*>/i, (m) => `${m}\n    ${tags}`);
    }
    return `<!DOCTYPE html><html><head>${tags}</head><body>${html}</body></html>`;
}

app.get('/a/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return c.notFound();
    const meta = await getMeta(slug);
    if (!meta) return c.notFound();

    const file = await getFile(slug, meta.filename);

    if (meta.type.startsWith('text/html')) {
        const injected = injectOgMeta(file.toString('utf-8'), meta);
        return new Response(injected, {
            headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': 'public, max-age=300',
                'X-Artifact-Slug': slug,
            },
        });
    }

    return new Response(file, {
        headers: {
            'Content-Type': meta.type,
            'Content-Disposition': `inline; filename="${meta.filename}"`,
            'Cache-Control': 'public, max-age=300',
            'X-Artifact-Slug': slug,
        },
    });
});

app.get('/raw/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return c.notFound();
    const meta = await getMeta(slug);
    if (!meta) return c.notFound();
    const file = await getFile(slug, meta.filename);
    return new Response(file, {
        headers: {
            'Content-Type': meta.type,
            'Content-Disposition': `attachment; filename="${meta.filename}"`,
            'Cache-Control': 'public, max-age=300',
        },
    });
});

const port = parseInt(process.env.PORT || '7878', 10);
Bun.serve({ port, fetch: app.fetch, idleTimeout: 60 });
console.log(`[artifacts] listening on :${port} (storage=${process.env.STORAGE_ROOT || '/srv/artifacts'})`);
