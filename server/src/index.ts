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
import { notFoundPage, passwordPromptPage, artifactDetailsPage } from './pages';
import { encryptPassword, decryptPassword } from './crypto';
import {
    ensureLibraryRoot,
    libraryItemExists,
    createLibraryItem,
    getLibraryMeta,
    updateLibraryMeta,
    getPromptText,
    replacePromptText,
    getSkillMd,
    getSkillBody,
    writeSkillBody,
    listSkillResources,
    reconcileSkillResources,
    saveLibraryOg,
    getLibraryOg,
    saveSkillZip,
    getSkillZip,
    listAllLibraryItems,
    removeLibraryItem,
    isResourceFolder,
    type LibraryItemMeta,
    type LibraryKind,
    type ResourceFile,
} from './library-storage';
import { buildSkillZip } from './library-zip';
import { libraryDetailsPage } from './library-pages';

const STORAGE_ROOT = resolve(process.env.STORAGE_ROOT || '/srv/artifacts');
const RESERVED_FILENAMES = new Set(['..', '.', 'meta.json', 'og.png', '']);
const ROOT_REDIRECT = process.env.ROOT_REDIRECT || 'https://mncoleman.com/artifacts/';
const SITE_FAVICON_SVG = 'https://mncoleman.com/icon.svg';
const SITE_FAVICON_ICO = 'https://mncoleman.com/favicon.ico';

function normalizeMimeType(t: string): string {
    return (t || 'application/octet-stream').split(';')[0].trim().toLowerCase();
}

await ensureRoot();
await ensureLibraryRoot();

const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || 'https://artifacts.mncoleman.com').replace(/\/$/, '');
const MAX_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || `${25 * 1024 * 1024}`, 10);
const LIBRARY_MAX_BODY_BYTES = 100 * 1024; // prompt text / SKILL.md body
const LIBRARY_MAX_RESOURCE_BYTES = 5 * 1024 * 1024; // per scripts/references/assets file
const LIBRARY_MAX_SKILL_TOTAL_BYTES = 20 * 1024 * 1024; // total skill payload (well under the 50MB Claude-apps zip cap)
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
    return {
        ...publicArtifactView(m),
        hasPassword: !!m.passwordHash,
        // Plaintext password decrypted from the at-rest cipher. May be null for
        // legacy private artifacts uploaded before AES storage was added.
        password: decryptPassword(m.passwordCipher),
    };
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
        ...(visibility === 'private'
            ? {
                  passwordHash: await Bun.password.hash(password),
                  passwordCipher: encryptPassword(password),
              }
            : {}),
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
            next.passwordCipher = encryptPassword(newPassword);
        } else if (next.visibility !== 'private' || !next.passwordHash) {
            // Going private with no password and no existing one — not allowed.
            return c.json({ error: 'private artifacts require a password' }, 400);
        }
        next.visibility = 'private';
    } else if (newVisibility === 'public') {
        next.visibility = 'public';
        if (clearPassword || newVisibility === 'public') {
            delete next.passwordHash;
            delete next.passwordCipher;
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

// Shareable details / landing page for an instant artifact. Renders the artifact's
// metadata + action buttons with the correct OG image, instead of opening the artifact.
// Registered before /a/:slug — distinct path (two segments), but kept first for clarity.
app.get('/a/:slug/details', async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return new Response(notFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    const meta = await getMeta(slug);
    if (!meta) return new Response(notFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    const isPrivate = meta.visibility === 'private';
    const normType = normalizeMimeType(meta.type);
    const html = artifactDetailsPage({
        slug,
        name: meta.name,
        description: meta.description,
        type: normType,
        size: meta.size,
        uploadedAt: meta.uploadedAt,
        publicBase: PUBLIC_BASE,
        viewable: normType === 'text/html' || normType === 'application/pdf' || normType.startsWith('image/'),
        isPrivate,
    });
    return new Response(html, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': isPrivate ? 'no-store' : 'public, max-age=300',
            ...(isPrivate ? { 'X-Robots-Tag': 'noindex' } : {}),
        },
    });
});

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

// ---------------------------------------------------------------------------
// "A"I Library — prompts + skills. No private/password concept: every read
// here is public. Only create/edit/delete require auth (via the Worker bridge).
// ---------------------------------------------------------------------------

function publicLibraryView(
    m: LibraryItemMeta,
    content: { promptText?: string; skillMd?: string; resources?: ResourceFile[] }
) {
    return {
        slug: m.slug,
        kind: m.kind,
        name: m.name,
        description: m.description,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        url: `${PUBLIC_BASE}/library/${m.slug}`,
        ogImage: `${PUBLIC_BASE}/og/library/${m.slug}.png`,
        promptText: content.promptText,
        skillMd: content.skillMd,
        // Resources aren't sensitive — the skill's own zip download already exposes
        // these same files publicly, so including them here lets the admin edit
        // form pre-populate the resource rows from a single list fetch.
        resources: content.resources,
        downloadUrls: m.kind === 'prompt'
            ? { txt: `${PUBLIC_BASE}/raw/library/${m.slug}.txt`, md: `${PUBLIC_BASE}/raw/library/${m.slug}.md` }
            : { zip: `${PUBLIC_BASE}/raw/library/${m.slug}.zip` },
    };
}

/** Validates + sanitizes a skill's resource-row array; throws a Response on the first bad row. */
function parseSkillResources(input: unknown, existingSkillMdBytes: number): ResourceFile[] {
    const rows = Array.isArray(input) ? input : [];
    const resources: ResourceFile[] = [];
    let totalBytes = existingSkillMdBytes;
    for (const r of rows as any[]) {
        const folder = String(r?.folder || '');
        if (!isResourceFolder(folder)) {
            throw new Response(JSON.stringify({ error: `invalid resource folder: ${folder}` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        let filename = String(r?.filename || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
        if (!filename || filename.startsWith('.')) {
            throw new Response(JSON.stringify({ error: 'invalid resource filename' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        const content = String(r?.content || '');
        const bytes = Buffer.byteLength(content, 'utf-8');
        if (bytes > LIBRARY_MAX_RESOURCE_BYTES) {
            throw new Response(JSON.stringify({ error: `resource "${filename}" too large (max ${LIBRARY_MAX_RESOURCE_BYTES} bytes)` }), { status: 413, headers: { 'Content-Type': 'application/json' } });
        }
        totalBytes += bytes;
        if (totalBytes > LIBRARY_MAX_SKILL_TOTAL_BYTES) {
            throw new Response(JSON.stringify({ error: `skill payload too large (max ${LIBRARY_MAX_SKILL_TOTAL_BYTES} bytes total)` }), { status: 413, headers: { 'Content-Type': 'application/json' } });
        }
        resources.push({ folder, filename, content });
    }
    return resources;
}

app.get('/api/library/list', async (c) => {
    const metas = await listAllLibraryItems();
    const items = await Promise.all(metas.map(async (m) => (
        m.kind === 'prompt'
            ? publicLibraryView(m, { promptText: await getPromptText(m.slug) })
            : publicLibraryView(m, { skillMd: await getSkillMd(m.slug), resources: await listSkillResources(m.slug) })
    )));
    return c.json({ items });
});

app.post('/api/library', requireAuth, async (c) => {
    let body: any;
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: 'invalid JSON body' }, 400);
    }

    if (body.kind !== 'prompt' && body.kind !== 'skill') {
        return c.json({ error: 'kind must be "prompt" or "skill"' }, 400);
    }
    const kind: LibraryKind = body.kind;

    let slug = String(body.slug || '').trim().toLowerCase();
    if (!slug) slug = suggestFromFilename(String(body.name || kind));
    if (!isValidSlug(slug)) {
        return c.json(
            { error: 'invalid slug — use 3-60 chars of [a-z0-9-], must start and end with alphanumeric' },
            400
        );
    }
    const name = String(body.name || '').slice(0, 200);
    if (!name) return c.json({ error: 'name is required' }, 400);

    const now = new Date().toISOString();

    if (kind === 'prompt') {
        const promptText = String(body.promptText || '');
        if (Buffer.byteLength(promptText, 'utf-8') > LIBRARY_MAX_BODY_BYTES) {
            return c.json({ error: `prompt text too large (max ${LIBRARY_MAX_BODY_BYTES} bytes)` }, 413);
        }
        const meta: LibraryItemMeta = { slug, kind, name, createdAt: now, updatedAt: now };
        try {
            await createLibraryItem(meta, { promptText });
        } catch (e) {
            if (e instanceof SlugTakenError) return c.json({ error: 'slug already in use' }, 409);
            throw e;
        }
        queueMicrotask(async () => {
            try {
                const png = await renderOg(meta.name, 'mncoleman Prompt:');
                await saveLibraryOg(slug, png);
            } catch (e) {
                console.error('[library-og] render failed:', e);
            }
        });
        return c.json({ ok: true, item: publicLibraryView(meta, { promptText }) }, 201);
    }

    // kind === 'skill'
    const description = String(body.description || '').slice(0, 1024);
    if (!description) return c.json({ error: 'description is required for skills' }, 400);
    const skillBodyMd = String(body.skillBodyMd || '');
    if (Buffer.byteLength(skillBodyMd, 'utf-8') > LIBRARY_MAX_BODY_BYTES) {
        return c.json({ error: `SKILL.md body too large (max ${LIBRARY_MAX_BODY_BYTES} bytes)` }, 413);
    }

    let resources: ResourceFile[];
    try {
        resources = parseSkillResources(body.resources, Buffer.byteLength(skillBodyMd, 'utf-8'));
    } catch (e) {
        if (e instanceof Response) return e;
        throw e;
    }

    const meta: LibraryItemMeta = { slug, kind, name, description, createdAt: now, updatedAt: now };
    try {
        await createLibraryItem(meta, { skillBodyMd, resources });
    } catch (e) {
        if (e instanceof SlugTakenError) return c.json({ error: 'slug already in use' }, 409);
        throw e;
    }

    queueMicrotask(async () => {
        try {
            const png = await renderOg(meta.name, 'mncoleman Skill:');
            await saveLibraryOg(slug, png);
        } catch (e) {
            console.error('[library-og] render failed:', e);
        }
        try {
            const zip = await buildSkillZip(slug);
            await saveSkillZip(slug, zip);
        } catch (e) {
            console.error('[library-zip] build failed:', e);
        }
    });

    const skillMd = await getSkillMd(slug);
    return c.json({ ok: true, item: publicLibraryView(meta, { skillMd, resources: await listSkillResources(slug) }) }, 201);
});

// Edit an existing library item. JSON body; all fields optional (partial update).
app.patch('/api/library/:slug', requireAuth, async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    const existing = await getLibraryMeta(slug);
    if (!existing) return c.json({ error: 'not found' }, 404);

    let body: any;
    try {
        body = await c.req.json();
    } catch {
        return c.json({ error: 'invalid JSON body' }, 400);
    }

    const next: LibraryItemMeta = { ...existing, updatedAt: new Date().toISOString() };
    let nameChanged = false;
    let skillAffected = false;

    if (typeof body.name === 'string') {
        const v = body.name.slice(0, 200);
        if (v && v !== next.name) { next.name = v; nameChanged = true; }
    }

    if (existing.kind === 'prompt') {
        if (typeof body.promptText === 'string') {
            if (Buffer.byteLength(body.promptText, 'utf-8') > LIBRARY_MAX_BODY_BYTES) {
                return c.json({ error: `prompt text too large (max ${LIBRARY_MAX_BODY_BYTES} bytes)` }, 413);
            }
            await replacePromptText(slug, body.promptText);
        }
    } else {
        let descriptionChanged = false;
        if (typeof body.description === 'string') {
            const d = body.description.slice(0, 1024);
            if (!d) return c.json({ error: 'description is required for skills' }, 400);
            if (d !== next.description) { next.description = d; descriptionChanged = true; }
        }

        if (typeof body.skillBodyMd === 'string') {
            if (Buffer.byteLength(body.skillBodyMd, 'utf-8') > LIBRARY_MAX_BODY_BYTES) {
                return c.json({ error: `SKILL.md body too large (max ${LIBRARY_MAX_BODY_BYTES} bytes)` }, 413);
            }
            await writeSkillBody(slug, next, body.skillBodyMd);
            skillAffected = true;
        } else if (descriptionChanged) {
            // Description changed but the body wasn't resent — re-stamp the frontmatter
            // on the existing body so SKILL.md stays internally consistent.
            const currentBody = await getSkillBody(slug);
            await writeSkillBody(slug, next, currentBody);
            skillAffected = true;
        }

        if (Array.isArray(body.resources)) {
            let resources: ResourceFile[];
            try {
                resources = parseSkillResources(body.resources, Buffer.byteLength(await getSkillMd(slug), 'utf-8'));
            } catch (e) {
                if (e instanceof Response) return e;
                throw e;
            }
            await reconcileSkillResources(slug, resources);
            skillAffected = true;
        }
    }

    await updateLibraryMeta(slug, next);

    if (nameChanged) {
        queueMicrotask(async () => {
            try {
                const png = await renderOg(next.name, next.kind === 'prompt' ? 'mncoleman Prompt:' : 'mncoleman Skill:');
                await saveLibraryOg(slug, png);
            } catch (e) {
                console.error('[library-og] re-render failed:', e);
            }
        });
    }
    if (next.kind === 'skill' && skillAffected) {
        queueMicrotask(async () => {
            try {
                const zip = await buildSkillZip(slug);
                await saveSkillZip(slug, zip);
            } catch (e) {
                console.error('[library-zip] rebuild failed:', e);
            }
        });
    }

    const content = next.kind === 'prompt'
        ? { promptText: await getPromptText(slug) }
        : { skillMd: await getSkillMd(slug), resources: await listSkillResources(slug) };
    return c.json({ ok: true, item: publicLibraryView(next, content) });
});

app.delete('/api/library/:slug', requireAuth, async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return c.json({ error: 'invalid slug' }, 400);
    if (!(await libraryItemExists(slug))) return c.json({ error: 'not found' }, 404);
    await removeLibraryItem(slug);
    return c.json({ ok: true });
});

app.get('/og/library/:filename', async (c) => {
    const filename = c.req.param('filename');
    const m = filename.match(/^([a-z0-9][a-z0-9-]{0,59})\.png$/);
    if (!m) return c.notFound();
    const slug = m[1];
    const png = await getLibraryOg(slug);
    if (!png) return c.notFound();
    return new Response(png, {
        headers: {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=86400',
        },
    });
});

app.get('/raw/library/:slugext', async (c) => {
    const slugext = c.req.param('slugext');
    const m = slugext.match(/^([a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?)\.(txt|md|zip)$/);
    if (!m) return c.notFound();
    const [, slug, ext] = m;
    const meta = await getLibraryMeta(slug);
    if (!meta) return c.notFound();

    if (ext === 'zip') {
        if (meta.kind !== 'skill') return c.notFound();
        let zip = await getSkillZip(slug);
        if (!zip) {
            // Lazy-build-on-miss — a stale/missing cache shouldn't fail a manual download click.
            zip = await buildSkillZip(slug);
            await saveSkillZip(slug, zip);
        }
        return new Response(zip, {
            headers: {
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="${slug}.zip"`,
                'Cache-Control': 'no-store',
            },
        });
    }

    if (meta.kind !== 'prompt') return c.notFound();
    const text = await getPromptText(slug);
    return new Response(text, {
        headers: {
            'Content-Type': ext === 'md' ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8',
            'Content-Disposition': `attachment; filename="${slug}.${ext}"`,
            'Cache-Control': 'public, max-age=300',
        },
    });
});

app.get('/library/:slug', async (c) => {
    const slug = c.req.param('slug');
    if (!isValidSlug(slug)) return new Response(notFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    const meta = await getLibraryMeta(slug);
    if (!meta) return new Response(notFoundPage(), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

    const content = meta.kind === 'prompt' ? await getPromptText(slug) : await getSkillMd(slug);
    const html = libraryDetailsPage({
        slug,
        kind: meta.kind,
        name: meta.name,
        description: meta.description,
        content,
        publicBase: PUBLIC_BASE,
        createdAt: meta.createdAt,
    });
    return new Response(html, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
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
