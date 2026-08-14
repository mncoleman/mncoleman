# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Next.js 16 (App Router, `output: 'export'` static site) · React 19 · TypeScript · Tailwind CSS 3.4 + shadcn/ui (new-york) + ReactBits registry · next-themes · Notion as CMS (`@notionhq/client` + `notion-to-md`) · `motion` (Framer Motion), `gsap`, `lenis` for animation · `ogl` (Dark Veil WebGL background) · `cobe` (visitor globe) · `react-markdown` + `remark-gfm`. Deployed to **`https://mncoleman.com`** (custom domain) via GitHub Pages.

## Architecture

Four independently-deployed pieces live in this repo. Pushing to `main` deploys only the first; the other three each have their own deploy step, and a change spanning them must ship in dependency order (the Worker mints the JWT the artifact service authorises against, so the Worker goes first):

1. **Next.js static site** (repo root) — statically exported at build time, hosted on GitHub Pages behind the custom domain. All content is fetched from Notion **at build time**; there is no runtime server for the site itself.
2. **`worker/`** — a Cloudflare Worker (`mncoleman-admin-auth`) that handles admin login (Telegram OIDC), mints session JWTs, stores admin users in KV, fires GitHub `repository_dispatch` rebuild triggers, and proxies artifact uploads to the artifact service.
3. **`worker-mcp/`** — a second Cloudflare Worker (`mncoleman-site-mcp`) serving the **public, unauthenticated MCP server** at `https://mncoleman.com/mcp`. It owns a route on the Cloudflare-proxied apex, so `/mcp*` is intercepted while every other path still falls through to GitHub Pages. Holds no secrets; reads `public/data/site-content.json` (built by `scripts/generate-search-index.ts`) plus the artifact service's public list endpoints. Stateless per MCP 2026-07-28 (SEP-2575) with the legacy `initialize` handshake still supported. Separate Worker on purpose — `worker/` gates every POST behind an Origin allowlist + CSRF header that MCP clients cannot send.
4. **`server/`** — a Bun + Hono service on an Oracle ARM box (`artifacts.mncoleman.com`) that hosts uploaded artifacts (HTML/PDF/images) and the "A"I library (prompts + skills), each with auto-generated OG share images. Deployed as a Docker container. See `server/README.md`.

The site uses a **two-layer adapter pattern** for Notion content: `lib/notion.ts` does the direct API integration; `lib/blog.ts`, `lib/resources.ts`, `lib/resume.ts`, `lib/projects.ts` are thin adapters per content type. Every fetcher validates credentials before calling Notion, falls back to sample data when they are absent, and throws when they are present but the fetch fails (see Patterns).

## Directory Map

```
app/                    — Next.js App Router pages (see Pages below)
  admin/                — Admin panel (client-side, talks to the Worker).
                          `layout.tsx` owns the session/login gate + tab nav for all
                          /admin/* subroutes; each subpage is a thin wrapper that pulls
                          `workerUrl`/`user` from `components/admin/admin-context.tsx`.
  ai/                   — "A"I library (prompts + skills from the artifact service)
  artifacts/            — Hosted artifact gallery + detail pages
  blog/, projects/,
  resources/            — Notion-backed content (list + [slug] detail + OG image)
  brand-kit/            — Brand/design-system showcase page
  layout.tsx            — Root layout: header nav, footer, providers, GA, fonts
  sitemap.ts, robots.ts, manifest.ts, opengraph-image.tsx — SEO/PWA route handlers
lib/                    — Data layer + helpers (Notion adapters, artifacts, auth, OG)
components/
  ui/                   — shadcn/ui + ReactBits + custom animated icons
  admin/                — Admin panel components
  brand-kit/            — Brand kit showcase components
  visitor-globe/        — cobe WebGL globe + "where are you from" guestbook
  *.tsx                 — Nav, search, theme, page transitions, PWA install, etc.
data/                   — about.json, artifacts.json (static manifest), search-index.json (generated)
hooks/                  — use-toast
scripts/                — Build-time scripts (search index, OG finalize, SW version stamp)
worker/                 — Cloudflare Worker (admin auth) — separate deploy
worker-mcp/             — Cloudflare Worker (public MCP server at /mcp) — separate deploy
server/                 — Bun/Hono artifact + "A"I library service — separate deploy
public/                 — Static assets, icons, sw.js, CNAME, fonts
profile-summary-card-output/ — CI-generated GitHub stat SVGs (do not hand-edit)
```

## Key Files

- `app/layout.tsx` — Root layout: sticky header nav, footer, theme/transition providers, lazy GA, local Roboto font.
- `app/page.tsx` — Home page: bento grid + lazy Dark Veil background + lazy visitor globe + animated icons.
- `lib/notion.ts` — Direct Notion API integration for blog posts; `NotionPost` type, credential validation, sample-data fallback, reading-time calc.
- `lib/blog.ts` / `lib/resources.ts` / `lib/resume.ts` / `lib/projects.ts` — Per-content-type adapters over Notion.
- `lib/artifacts.ts` — Reads `data/artifacts.json` static manifest; file-type/label/size helpers.
- `lib/admin-auth.ts` — Client-side session token helpers (sessionStorage) + `authHeaders()` for Worker calls.
- `lib/og-card.tsx` — Shared OG image renderer used by the per-route `opengraph-image.tsx` files. **Must stay visually identical to `server/src/og.tsx`** — static artifacts unfurl from here, instant ones from there, and a viewer seeing both should not be able to tell which pipeline produced which. They cannot share code (separate deploys; the Docker image only copies `server/`), so a change to one is a manual change to the other.
- `lib/resume-parse.ts` — Parses the Notion resume markdown into typed sections for the card layout. Every classifier is a fuzzy heading match and unrecognised sections fall through to `extra`, which still renders as prose — a renamed section degrades rather than disappears. `app/resume/page.tsx` keeps a full-prose fallback for markdown with no recognisable structure.
- `lib/notion-retry.ts` — Retries *transient* Notion failures (rate limits, 5xx, socket drops) so an unattended build survives a blip. Deterministic failures (bad token, deleted database) are not retried and surface immediately.
- `lib/utils.ts` — `cn()`, `slugify()`, `artifactSlug()` (shared by `generateStaticParams` and the browser so slugs always agree).
- `next.config.ts` — Static export config (no basePath — custom domain).
- `.github/workflows/deploy.yml` — Build + deploy to GitHub Pages.
- `worker/index.ts` + `worker/wrangler.toml` — Admin auth Worker.
- `server/src/index.ts` + `server/README.md` — Artifact/"A"I library service.

### Pages

`/` · `/about` · `/blog` + `/blog/[slug]` · `/projects` + `/projects/[slug]` · `/resources` + `/resources/[slug]` · `/resume` · `/artifacts` · `/ai` · `/brand-kit` · `/privacy` · `/terms` · `/admin` + `/admin/{analytics,artifacts,library,visitors,users}`. List pages that need client interactivity split into a server `page.tsx` (metadata + data fetch) plus a `*PageClient.tsx` (`'use client'`).

## Data Model

Content comes from **four separate Notion data sources** (three databases + one page) plus local/remote JSON:

- **Blog database** (`NOTION_DATABASE_ID`) — Title, Slug, Date, Tags, Published, Featured, Excerpt, Author. Featured posts sort first, then newest-first.
- **Resources database** (`NOTION_RESOURCES_DATABASE_ID`) — Name, URL, Category, Description, Published.
- **Projects database** (`NOTION_PROJECTS_DATABASE_ID`) — Name, Description, URL, Tech, Date, Published. Detail slugs derive from `slugify(name)`.
- **Resume page** (`NOTION_RESUME_PAGE_ID`) — single page, body rendered to markdown.
- **Artifacts** — static ones in `data/artifacts.json`; dynamic ("instant") ones served live from the artifact service (`source: 'static' | 'dynamic'`).
- **Search index** — `data/search-index.json`, regenerated at build time from all content.

## Patterns & Conventions

- **Credential validation before connect**: every Notion fetcher checks for a missing/placeholder token *before* calling `getNotionClient()`, and treats the two failure modes differently:
  1. **Credentials missing or placeholder** → return sample data. Local dev has to work with no `.env`.
  2. **Credentials present but the fetch failed** → rethrow, and let the build fail.

  Case 2 is deliberate: `deploy.yml` builds daily and deploys unconditionally on success, so falling back to sample data during a Notion outage would publish "Welcome to Notion CMS" over the live site. A failed build leaves the previous good deploy on Pages. `scripts/generate-search-index.ts` `process.exit(1)`s on the same throw, so the MCP feed can't drift either.

  ```typescript
  const token = process.env.NOTION_TOKEN;
  if (!databaseId || !token || token === 'ntn_your_integration_token_here') {
      console.warn('Returning sample data because Notion credentials are not configured');
      return [/* sample data */];
  }
  try {
      /* ...query Notion... */
  } catch (error) {
      console.error('Error fetching …:', error);
      throw error; // configured creds + failed fetch = outage, not a dev machine
  }
  ```

- **Static params from the data layer**: `[slug]` routes call `generateStaticParams` backed by `get*Slugs()` helpers; slugs are computed with `slugify()`/`artifactSlug()` from `lib/utils.ts` so build-time and client-side links always match.
- **Frosted glass over Dark Veil**: `bg-background/40 backdrop-blur-xl border border-border/30`.
- **Lazy-load heavy/decorative code**: Dark Veil (OGL), ScrollFloat (GSAP), and the visitor globe (cobe) are `dynamic(..., { ssr: false })` so they stay off the homepage's initial JS and don't affect LCP.
- **Smooth scroll**: `components/smooth-scroll.tsx` mounts one site-wide Lenis (`<ReactLenis root>`) in the root layout. It scrolls the real document, so `sticky`/`fixed` and `window.scrollY` readers are unaffected — but **every nested scroll container needs `data-lenis-prevent`** (modals, `<pre>` blocks, the visitor wheel, ScrollStack) or Lenis eats its wheel events. Programmatic scrolling goes through `useSmoothScrollTo()`, not `scrollIntoView`. Disabled entirely under `prefers-reduced-motion`. `components/scroll-settings.tsx` exposes live glide / reach / smooth-wheel controls (persisted to `localStorage['scroll-prefs']`); prefs are pushed onto the running instance via `lenis.options`, never through the `options` prop — lenis/react re-creates the instance whenever that prop changes by value.
- **Theming**: `next-themes` class-based dark mode; Tailwind CSS variables; shadcn new-york, base color neutral.
- **Admin auth**: client stores a Worker-minted JWT in `sessionStorage`; requests to the Worker/artifact service carry `Authorization: Bearer <jwt>` via `authHeaders()`.

## Common Tasks

- **Add a blog post / resource / project**: add a row in the corresponding Notion database with `Published` checked, then rebuild (Notion is build-time only — content is not live).
- **Add an artifact (static)**: add an entry to `data/artifacts.json`; place the file under `public/artifacts/`. Dynamic artifacts are uploaded through the admin panel → Worker → artifact service.
- **Add a page**: create `app/<route>/page.tsx`; add the nav link in `app/layout.tsx` (and to `components/mobile-nav.tsx` if needed); add it to `app/sitemap.ts`.
- **Add a shadcn/ui component**: `npx shadcn@latest add button` (shadcn) or `npx shadcn@latest add @react-bits/<name>` (ReactBits registry). Both registries are configured in `components.json`.
- **Change OG images**: edit `lib/og-card.tsx` (shared renderer) or a route's `opengraph-image.tsx`, **and make the matching change in `server/src/og.tsx`** so both pipelines still produce the same card. Bump `OG_VERSION` there so already-published instant artifacts re-render. `scripts/finalize-og-images.ts` runs at the end of the build: it gives each generated image a real `.png` sibling (GitHub Pages serves extensionless files as `application/octet-stream`, which strict OG consumers reject) and injects OG tags into the raw static artifact HTML, which Next never renders and which therefore ships without any.
- **Deploy the Worker**: `cd worker && npx wrangler deploy` (secrets via `wrangler secret put`).
- **Deploy the MCP Worker**: `cd worker-mcp && npx wrangler deploy`.
- **Deploy the artifact service**: see the Docker build/ship steps in `server/README.md`. Do NOT recreate the container from that `docker run` block by hand — carry the live container's env forward with `docker inspect artifacts --format '{{range .Config.Env}}{{println .}}{{end}}' | grep -v '^PATH='` instead, so a documentation drift can't silently drop a secret.

## Environment

```bash
npm run dev        # dev server (port 3000; raised Node heap)
npm run dev:lite   # dev server with Dark Veil disabled + smaller heap
npm run build      # generate-search-index → next build → finalize-og-images → stamp-sw-version → out/
npm run lint       # ESLint
npm run dev:artifacts  # run the artifact service locally (tsx)
```

Required env (see `.env.example`): `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `NOTION_RESOURCES_DATABASE_ID`, `NOTION_RESUME_PAGE_ID`, `NOTION_PROJECTS_DATABASE_ID`. Optional: `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_WORKER_URL` (admin auth Worker — `app/admin/layout.tsx`, `app/artifacts/ArtifactsPageClient.tsx`; defaults to `http://localhost:8787`), `NEXT_PUBLIC_TELEGRAM_BOT_NAME` (admin login widget), `NEXT_PUBLIC_ARTIFACTS_API_URL` (artifact + "A"I library service — `components/admin/{ArtifactUploader,LibraryManager}.tsx`, `app/artifacts/ArtifactsPageClient.tsx`, `app/ai/AiPageClient.tsx`; defaults to `https://artifacts.mncoleman.com`), `NEXT_PUBLIC_VISITOR_API_URL` (visitor-globe guestbook — `components/visitor-globe/visitor-api.ts`; falls back to `NEXT_PUBLIC_ARTIFACTS_API_URL`), `NEXT_PUBLIC_DISABLE_DARKVEIL`. All build-time values must also be set as **GitHub Secrets** for production builds.

**Deploy**: pushing to `main` triggers `.github/workflows/deploy.yml` (build → GitHub Pages). It also runs on a daily 6 AM UTC cron and on `repository_dispatch` events (`admin_trigger`, `rebuild_site`, `sync_notion`, `content_update`) fired by the Worker. `profile-cards.yml` regenerates the GitHub stat SVGs daily at 5 AM UTC.

## Gotchas

1. **No basePath**: the site runs on the custom domain `mncoleman.com` (via `public/CNAME`), so `next.config.ts` has **no** `basePath`. (It previously used `/mncoleman`/`/matthew-coleman` for the GitHub Pages subpath — don't reintroduce that.)
2. **Notion token format**: tokens start with `ntn_`, **not** `secret_`. Validation checks for the placeholder `ntn_your_integration_token_here`.
3. **Separate Notion databases**: Blog, Resources, and Projects are distinct databases with distinct IDs (plus the Resume page). "Databases with multiple data sources are not supported" means you pointed at a database with synced/linked blocks — use the plain database ID.
4. **Notion is build-time only**: content changes require a rebuild to appear; they are not real-time. Use the admin rebuild trigger or wait for the daily cron.
5. **Images unoptimized**: static export disables Next image optimization; use `<img>` or `unoptimized` `<Image>`.
6. **Dark Veil canvas coverage**: use `position: fixed` with explicit `100vw/100vh`; use `window.innerWidth/innerHeight` (not parent dims) for resize; don't wrap the canvas in positioned containers; `overflow-x: hidden` on html/body; `resolutionScale` affects render resolution only, not visual size. WebGL/GSAP components need `'use client'`.
7. **Shared JWT secret**: the Worker and the artifact service share one HS256 `JWT_SECRET` (and `ARTIFACTS_JWT_SECRET`). Rotating one without the other breaks uploads.
8. **GA4 page_views are manual**: the root layout configures gtag with `send_page_view: false`, and `components/analytics.tsx` fires one `page_view` per App Router navigation. GA4 Enhanced Measurement's *"page changes based on browser history events"* must stay **OFF** on the property, or every soft navigation is counted twice. `/admin/analytics` reads GA4 through the Worker's `/api/analytics/summary` (service-account auth, `GA_SA_CLIENT_EMAIL` + `GA_SA_PRIVATE_KEY` secrets, `GA_PROPERTY_ID` var, 10-min KV cache).
9. **`profile-summary-card-output/`** is regenerated by CI daily — don't hand-edit the SVGs there.
10. **The two OG renderers must move together**: `lib/og-card.tsx` (static, build-time) and `server/src/og.tsx` (instant, runtime). Stored instant cards record an `ogVersion`; `/og/*` re-renders lazily when it no longer matches `OG_VERSION`, so a redesign reaches already-published artifacts instead of only new ones.
11. **Worker ↔ service role contract**: the admin Worker stamps a `role` claim on the short-lived artifacts JWT, and the service discloses decrypted private-artifact passwords only for `super_admin`. It **fails closed** — an absent claim omits the field. Consequence: deploy the Worker before the service, or the password column goes blank in between.
12. **No `btoa`/`atob` on the artifacts manifest.** `btoa` throws above U+00FF and `atob` decodes UTF-8 as Latin-1, so an em-dash in a description used to 500 the write *after* the file commit landed and corrupt the manifest on every edit. `worker/index.ts` has TextEncoder/TextDecoder base64 helpers — use those.
13. **Animation loops must be gated.** `components/ui/dark-veil.tsx` is the reference: `prefers-reduced-motion` renders one static frame, plus an IntersectionObserver and a `visibilitychange` pause, plus demand-driven rAF that stops once motion settles. `components/Waves.tsx` follows it. Also keep `touchmove` listeners `passive: true` unless the handler genuinely calls `preventDefault()` — a non-passive one blocks every scroll frame on the page.
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
