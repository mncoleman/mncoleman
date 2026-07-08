# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Next.js 16 (App Router, `output: 'export'` static site) · React 19 · TypeScript · Tailwind CSS 3.4 + shadcn/ui (new-york) + ReactBits registry · next-themes · Notion as CMS (`@notionhq/client` + `notion-to-md`) · `motion` (Framer Motion), `gsap`, `lenis` for animation · `ogl` (Dark Veil WebGL background) · `cobe` (visitor globe) · `react-markdown` + `remark-gfm`. Deployed to **`https://mncoleman.com`** (custom domain) via GitHub Pages.

## Architecture

Three independently-deployed pieces live in this repo:

1. **Next.js static site** (repo root) — statically exported at build time, hosted on GitHub Pages behind the custom domain. All content is fetched from Notion **at build time**; there is no runtime server for the site itself.
2. **`worker/`** — a Cloudflare Worker (`mncoleman-admin-auth`) that handles admin login (Telegram OIDC), mints session JWTs, stores admin users in KV, fires GitHub `repository_dispatch` rebuild triggers, and proxies artifact uploads to the artifact service.
3. **`server/`** — a Bun + Hono service on an Oracle ARM box (`artifacts.mncoleman.com`) that hosts uploaded artifacts (HTML/PDF/images) and the "A"I library (prompts + skills), each with auto-generated OG share images. Deployed as a Docker container. See `server/README.md`.

The site uses a **two-layer adapter pattern** for Notion content: `lib/notion.ts` does the direct API integration; `lib/blog.ts`, `lib/resources.ts`, `lib/resume.ts`, `lib/projects.ts` are thin adapters per content type. Every fetcher validates credentials before calling Notion and falls back to sample data (see Patterns).

## Directory Map

```
app/                    — Next.js App Router pages (see Pages below)
  admin/                — Admin panel (client-side, talks to the Worker)
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
- `lib/og-card.tsx` — Shared OG image renderer used by the per-route `opengraph-image.tsx` files.
- `lib/utils.ts` — `cn()`, `slugify()`, `artifactSlug()` (shared by `generateStaticParams` and the browser so slugs always agree).
- `next.config.ts` — Static export config (no basePath — custom domain).
- `.github/workflows/deploy.yml` — Build + deploy to GitHub Pages.
- `worker/index.ts` + `worker/wrangler.toml` — Admin auth Worker.
- `server/src/index.ts` + `server/README.md` — Artifact/"A"I library service.

### Pages

`/` · `/about` · `/blog` + `/blog/[slug]` · `/projects` + `/projects/[slug]` · `/resources` + `/resources/[slug]` · `/resume` · `/artifacts` · `/ai` · `/brand-kit` · `/admin` · `/privacy` · `/terms`. List pages that need client interactivity split into a server `page.tsx` (metadata + data fetch) plus a `*PageClient.tsx` (`'use client'`).

## Data Model

Content comes from **four separate Notion data sources** (three databases + one page) plus local/remote JSON:

- **Blog database** (`NOTION_DATABASE_ID`) — Title, Slug, Date, Tags, Published, Featured, Excerpt, Author. Featured posts sort first, then newest-first.
- **Resources database** (`NOTION_RESOURCES_DATABASE_ID`) — Name, URL, Category, Description, Published.
- **Projects database** (`NOTION_PROJECTS_DATABASE_ID`) — Name, Description, URL, Tech, Date, Published. Detail slugs derive from `slugify(name)`.
- **Resume page** (`NOTION_RESUME_PAGE_ID`) — single page, body rendered to markdown.
- **Artifacts** — static ones in `data/artifacts.json`; dynamic ("instant") ones served live from the artifact service (`source: 'static' | 'dynamic'`).
- **Search index** — `data/search-index.json`, regenerated at build time from all content.

## Patterns & Conventions

- **Credential validation before connect**: every Notion fetcher checks for a missing/placeholder token *before* calling `getNotionClient()`, and returns sample data on missing creds or on error. Never let a build fail because Notion is unreachable.

  ```typescript
  const token = process.env.NOTION_TOKEN;
  if (!databaseId || !token || token === 'ntn_your_integration_token_here') {
      console.warn('Returning sample data because Notion credentials are not configured');
      return [/* sample data */];
  }
  ```

- **Static params from the data layer**: `[slug]` routes call `generateStaticParams` backed by `get*Slugs()` helpers; slugs are computed with `slugify()`/`artifactSlug()` from `lib/utils.ts` so build-time and client-side links always match.
- **Frosted glass over Dark Veil**: `bg-background/40 backdrop-blur-xl border border-border/30`.
- **Lazy-load heavy/decorative code**: Dark Veil (OGL), ScrollFloat (GSAP), and the visitor globe (cobe) are `dynamic(..., { ssr: false })` so they stay off the homepage's initial JS and don't affect LCP.
- **Theming**: `next-themes` class-based dark mode; Tailwind CSS variables; shadcn new-york, base color neutral.
- **Admin auth**: client stores a Worker-minted JWT in `sessionStorage`; requests to the Worker/artifact service carry `Authorization: Bearer <jwt>` via `authHeaders()`.

## Common Tasks

- **Add a blog post / resource / project**: add a row in the corresponding Notion database with `Published` checked, then rebuild (Notion is build-time only — content is not live).
- **Add an artifact (static)**: add an entry to `data/artifacts.json`; place the file under `public/artifacts/`. Dynamic artifacts are uploaded through the admin panel → Worker → artifact service.
- **Add a page**: create `app/<route>/page.tsx`; add the nav link in `app/layout.tsx` (and to `components/mobile-nav.tsx` if needed); add it to `app/sitemap.ts`.
- **Add a shadcn/ui component**: `npx shadcn@latest add button` (shadcn) or `npx shadcn@latest add @react-bits/<name>` (ReactBits registry). Both registries are configured in `components.json`.
- **Change OG images**: edit `lib/og-card.tsx` (shared renderer) or a route's `opengraph-image.tsx`; `scripts/finalize-og-images.ts` runs at the end of the build.
- **Deploy the Worker**: `cd worker && npx wrangler deploy` (secrets via `wrangler secret put`).
- **Deploy the artifact service**: see the Docker build/ship steps in `server/README.md`.

## Environment

```bash
npm run dev        # dev server (port 3000; raised Node heap)
npm run dev:lite   # dev server with Dark Veil disabled + smaller heap
npm run build      # generate-search-index → next build → finalize-og-images → stamp-sw-version → out/
npm run lint       # ESLint
npm run dev:artifacts  # run the artifact service locally (tsx)
```

Required env (see `.env.example`): `NOTION_TOKEN`, `NOTION_DATABASE_ID`, `NOTION_RESOURCES_DATABASE_ID`, `NOTION_RESUME_PAGE_ID`, `NOTION_PROJECTS_DATABASE_ID`. Optional: `NEXT_PUBLIC_GA_ID`, `NEXT_PUBLIC_WORKER_URL`, `NEXT_PUBLIC_TELEGRAM_BOT_NAME`, `NEXT_PUBLIC_DISABLE_DARKVEIL`. All build-time values must also be set as **GitHub Secrets** for production builds.

**Deploy**: pushing to `main` triggers `.github/workflows/deploy.yml` (build → GitHub Pages). It also runs on a daily 6 AM UTC cron and on `repository_dispatch` events (`admin_trigger`, `rebuild_site`, `sync_notion`, `content_update`) fired by the Worker. `profile-cards.yml` regenerates the GitHub stat SVGs daily at 5 AM UTC.

## Gotchas

1. **No basePath**: the site runs on the custom domain `mncoleman.com` (via `public/CNAME`), so `next.config.ts` has **no** `basePath`. (It previously used `/mncoleman`/`/matthew-coleman` for the GitHub Pages subpath — don't reintroduce that.)
2. **Notion token format**: tokens start with `ntn_`, **not** `secret_`. Validation checks for the placeholder `ntn_your_integration_token_here`.
3. **Separate Notion databases**: Blog, Resources, and Projects are distinct databases with distinct IDs (plus the Resume page). "Databases with multiple data sources are not supported" means you pointed at a database with synced/linked blocks — use the plain database ID.
4. **Notion is build-time only**: content changes require a rebuild to appear; they are not real-time. Use the admin rebuild trigger or wait for the daily cron.
5. **Images unoptimized**: static export disables Next image optimization; use `<img>` or `unoptimized` `<Image>`.
6. **Dark Veil canvas coverage**: use `position: fixed` with explicit `100vw/100vh`; use `window.innerWidth/innerHeight` (not parent dims) for resize; don't wrap the canvas in positioned containers; `overflow-x: hidden` on html/body; `resolutionScale` affects render resolution only, not visual size. WebGL/GSAP components need `'use client'`.
7. **Shared JWT secret**: the Worker and the artifact service share one HS256 `JWT_SECRET` (and `ARTIFACTS_JWT_SECRET`). Rotating one without the other breaks uploads.
8. **`profile-summary-card-output/`** is regenerated by CI daily — don't hand-edit the SVGs there.
```
