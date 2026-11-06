# Custom Domain Setup (Cloudflare Pages)

How `mncoleman.com` is wired to the site, and how to redo it. The site used to be on GitHub
Pages and moved to Cloudflare Pages on 2026-08-15 (see `CLAUDE.md` for why); nothing here
applies to GitHub Pages any more, and `public/CNAME` no longer exists.

## How it is set up

| Hostname | Served by | Notes |
|----------|-----------|-------|
| `mncoleman.com` | Cloudflare Pages project `mncoleman` | Apex is **proxied** (orange cloud) through Cloudflare. Pages builds from this repo's `main` via its Git integration. |
| `mncoleman.com/mcp*`, `/.well-known/mcp.json` | Worker `mncoleman-site-mcp` (`worker-mcp/`) | Worker routes sit in front of the Pages custom domain on the same hostname, so these paths are intercepted and everything else falls through to Pages. |
| `mncoleman.com/api/count-tokens` | Worker `mncoleman-token-count` (`worker-tokens/`) | Same mechanism. |
| `www.mncoleman.com` | Worker `mncoleman-www-redirect` (`worker-www-redirect/`) | A 301 to the apex. A Pages custom domain serves content rather than redirecting, so the redirect is a Worker route. |
| `artifacts.mncoleman.com` | Bun + Hono container on the Oracle ARM box, behind Caddy | **Not** Cloudflare-proxied. See `server/README.md` and `server/caddyfile.snippet`. |

Because the apex is proxied, pointing its DNS anywhere else (for example straight at another
host) silently breaks `/mcp` and `/api/count-tokens`.

`next.config.ts` has no `basePath` (the site is served from the domain root) and sets
`trailingSlash: true`.

## Redoing the Pages custom domain

The order matters:

1. In the Cloudflare dashboard (or via the Pages API), attach the custom domain to the Pages
   project **first**.
2. Then create or confirm the DNS record: a proxied CNAME to `<project>.pages.dev`.

Attaching a domain through the API does not create the DNS record, and a record you create
yourself before attaching gives a permanent 522. When changing the apex, rehearse the whole
cutover on a throwaway subdomain first.

Pages has no origin certificate to manage, which is the reason for the move: GitHub Pages'
renewal challenge ran through the proxied apex and could not renew.

## Build settings on the Pages project

- Build command `npm run build`, output directory `out`.
- `NODE_VERSION` pinned to 20; build variables (Notion credentials, `BUILD_TOKEN`,
  `NEXT_PUBLIC_*`) live here, not in GitHub Secrets.
- Watch paths: `path_includes: ["*"]` with `path_excludes: ["profile-summary-card-output/*"]`.
  An empty `path_includes` matches nothing, so pushes are accepted and then sit queued forever.
- Preview deployments are off. The deploy hook behind the admin rebuild button and the daily
  06:00 UTC cron is created here and stored as the Worker secret `PAGES_DEPLOY_HOOK`.

## Behaviours worth knowing

- **`_redirects` only matches the path.** A rule written against a full `https://www...` URL
  parses, ships, and never fires. Cross-hostname redirects need a zone Redirect Rule or a
  Worker route.
- **Pages strips `.html`.** `/artifacts/foo.html` 308-redirects to `/artifacts/foo`. Old
  shared links still work.
- **Response headers** come from `public/_headers`, which matches trailing globs only
  (`/_next/static/*`, `/fonts/*`, `/sounds/*`).

## Verifying

```bash
dig mncoleman.com +short                         # Cloudflare proxy IPs, not GitHub's
curl -sI https://mncoleman.com | head -5         # 200, served by Cloudflare
curl -sI https://www.mncoleman.com | head -5     # 301 to https://mncoleman.com
curl -s -o /dev/null -w '%{http_code}\n' https://mncoleman.com/mcp   # answered by the MCP Worker
```

## Credentials

Neither stored Cloudflare credential can edit Rulesets (Transform, Redirect, Page Rules);
those need the dashboard. See gotchas 18 and 19 in `CLAUDE.md` before concluding a token is
broken.
