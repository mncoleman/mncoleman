// Redirects www.mncoleman.com -> mncoleman.com, preserving path and query.
//
// GitHub Pages used to issue this redirect for free. A Cloudflare Pages custom
// domain SERVES content instead of redirecting, so after the migration the whole
// site answered on both hostnames — duplicate content against the canonical apex
// URLs that sitemap.ts, lib/og-card.tsx and every og:url tag emit.
//
// A zone Redirect Rule would be the lighter fix, but Rulesets need a zone-scoped
// API credential that neither the DNS token nor the wrangler OAuth login carries.
// A Worker route does the same job with credentials we have, and Worker routes
// take precedence over a Pages custom domain on the same hostname.
//
// Note `public/_redirects` cannot do this: Pages only matches the PATH portion in
// the `from` field, so a rule written against a full https://www... URL parses but
// never matches — it fails silently, which is how this was missed the first time.

export default {
    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        url.hostname = 'mncoleman.com';
        return Response.redirect(url.toString(), 301);
    },
};
