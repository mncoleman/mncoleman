/**
 * Keeps admin.mncoleman.com an admin-only origin, and sends mncoleman.com/admin there.
 *
 * Why the admin has its own origin: anything that runs on mncoleman.com (13 static artifact
 * apps, editor uploads, GA) shares one origin with whatever lives there. An admin under
 * /admin shared its storage, its service worker cache and its standing with the admin Worker
 * with all of it. On its own host it shares nothing, as long as this host never serves
 * anything else as a live page. That is this Worker's whole job.
 *
 * The same Pages project serves both hosts (admin.mncoleman.com is a second custom domain),
 * so every file exists on both. A Worker route takes precedence over a Pages custom domain
 * on the same hostname; this one decides, per request, what the admin host may answer:
 *
 *   /admin, /admin/*            the admin itself (pages and their RSC payloads)
 *   /_next/*, /sw.js            the app's own code
 *   /                           redirect to /admin/
 *   any other page              redirect to the same path on mncoleman.com
 *   any other RSC payload       404, so Next falls back to a full navigation (which redirects)
 *   any other script            404
 *   anything else (images, fonts, JSON, the artifact preview frame)
 *                               served with `Content-Security-Policy: sandbox`, which gives it
 *                               an opaque origin even when opened directly, so it can never
 *                               act as the admin.
 */

const ADMIN_HOST = 'admin.mncoleman.com';
const SITE = 'https://mncoleman.com';

// The zone's "Security headers" response rule sets CSP to frame-ancestors 'self' on every
// other host. On this host it leaves CSP alone (a twin rule sets the rest), so this Worker
// owns the header here and must carry frame-ancestors itself.
const FRAME = "frame-ancestors 'self'";
const SANDBOX = `sandbox allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals; ${FRAME}`;

const isAdminPath = (p: string) => p === '/admin' || p.startsWith('/admin/');

/** Next's App Router payloads: `?_rsc=`, the `RSC` header, or a static export's `.txt` files. */
function isRsc(request: Request, url: URL): boolean {
    return url.searchParams.has('_rsc') || request.headers.get('RSC') === '1' || /\.txt$/.test(url.pathname);
}

/** What the browser will do with the response. Requests without the header (curl, old browsers) fall back to Accept. */
function destination(request: Request): string {
    const dest = request.headers.get('Sec-Fetch-Dest');
    if (dest) return dest;
    return (request.headers.get('Accept') || '').includes('text/html') ? 'document' : 'empty';
}

function withHeaders(res: Response, extra: Record<string, string>): Response {
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(extra)) out.headers.set(k, v);
    return out;
}

const notFound = () => new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain', 'X-Robots-Tag': 'noindex' } });

export default {
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        // mncoleman.com/admin and below: the admin moved. 301, path and query kept (the
        // browser keeps the #fragment itself).
        if (url.hostname !== ADMIN_HOST) {
            return Response.redirect(`https://${ADMIN_HOST}${url.pathname}${url.search}`, 301);
        }

        const path = url.pathname;
        if (path === '/') return Response.redirect(`https://${ADMIN_HOST}/admin/`, 302);

        // Pass through to Pages without following its redirects (/admin -> /admin/ is a 308
        // the browser must see, or relative URLs resolve against the wrong path).
        const pass = () => fetch(request, { redirect: 'manual' });

        if (isAdminPath(path) || path.startsWith('/_next/') || path === '/sw.js') {
            return withHeaders(await pass(), { 'Content-Security-Policy': FRAME, 'X-Robots-Tag': 'noindex' });
        }

        const dest = destination(request);
        if (isRsc(request, url)) return notFound();
        if (dest === 'document') return Response.redirect(`${SITE}${path}${url.search}`, 301);
        if (dest === 'script' || dest === 'worker' || dest === 'sharedworker' || dest === 'serviceworker') return notFound();

        // Images, fonts, JSON data, and the static-artifact preview frame (dest "iframe").
        return withHeaders(await pass(), {
            'Content-Security-Policy': SANDBOX,
            'X-Content-Type-Options': 'nosniff',
            'X-Robots-Tag': 'noindex',
        });
    },
};
