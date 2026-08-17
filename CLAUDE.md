# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

Next.js 16 (App Router, `output: 'export'` static site) · React 19 · TypeScript · Tailwind CSS 3.4 + shadcn/ui (new-york) + ReactBits registry · next-themes · Notion as CMS (`@notionhq/client` + `notion-to-md`) · `motion` (Framer Motion), `gsap`, `lenis` for animation · `ogl` (Dark Veil WebGL background) · `cobe` (visitor globe) · `react-markdown` + `remark-gfm` · `jspdf` (resume PDF, dynamically imported on click only). Deployed to **`https://mncoleman.com`** (custom domain) via Cloudflare Pages.

## Architecture

Five independently-deployed pieces live in this repo. Pushing to `main` deploys only the first; the others each have their own deploy step, and a change spanning them must ship in dependency order (the Worker mints the JWT the artifact service authorises against, so the Worker goes first):

1. **Next.js static site** (repo root) — statically exported at build time, hosted on **Cloudflare Pages** behind the custom domain. Cloudflare builds it directly from this GitHub repo (Pages Git integration); there is no GitHub Actions deploy workflow. All content is fetched from Notion **at build time**; there is no runtime server for the site itself.

   Migrated off GitHub Pages on 2026-08-15 after its origin certificate expired and could not renew: the ACME challenge runs through the Cloudflare-proxied apex, and Full (strict) refused the very certificate the renewal existed to replace. Cloudflare Pages has no origin certificate, so that whole failure mode is gone rather than managed.
2. **`worker/`** — a Cloudflare Worker (`mncoleman-admin-auth`) that handles admin login (Telegram OIDC), mints session JWTs, stores admin users in KV, fires **Cloudflare Pages deploy-hook** rebuilds (on a `scheduled()` cron trigger and from the admin panel), and proxies artifact uploads to the artifact service. It still holds `GITHUB_TOKEN` — that is for committing `data/artifacts.json`, which is independent of where the site is hosted.
3. **`worker-mcp/`** — a second Cloudflare Worker (`mncoleman-site-mcp`) serving the **public, unauthenticated MCP server** at `https://mncoleman.com/mcp`. It owns a route on the Cloudflare-proxied apex, so `/mcp*` is intercepted while every other path still falls through to Cloudflare Pages. Worker routes take precedence over a Pages custom domain on the same hostname — verified empirically on a throwaway subdomain before the cutover, not assumed from docs. Holds no secrets; reads `public/data/site-content.json` (built by `scripts/generate-search-index.ts`) plus the artifact service's public list endpoints. Stateless per MCP 2026-07-28 (SEP-2575) with the legacy `initialize` handshake still supported. Separate Worker on purpose — `worker/` gates every POST behind an Origin allowlist + CSRF header that MCP clients cannot send.
4. **`worker-www-redirect/`** — a third Cloudflare Worker (`mncoleman-www-redirect`) doing nothing but a `www` -> apex 301. Holds no secrets and reads nothing. It exists because GitHub Pages used to issue that redirect for free and a Pages custom domain does not — see the Gotchas.
5. **`server/`** — a Bun + Hono service on an Oracle ARM box (`artifacts.mncoleman.com`) that hosts uploaded artifacts (HTML/PDF/images) and the "A"I library (prompts + skills), each with auto-generated OG share images. Deployed as a Docker container. See `server/README.md`.

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
worker/                 — Cloudflare Worker (admin auth + rebuild cron) — separate deploy
worker-mcp/             — Cloudflare Worker (public MCP server at /mcp) — separate deploy
worker-www-redirect/    — Cloudflare Worker (www -> apex 301) — separate deploy
server/                 — Bun/Hono artifact + "A"I library service — separate deploy
public/                 — Static assets, icons, sw.js, fonts, _headers (Pages cache rules)
assets/                 — Build-time-only assets NOT served to visitors (og-veil.jpg)
profile-summary-card-output/ — CI-generated GitHub stat SVGs (do not hand-edit)
```

## Key Files

- `app/layout.tsx` — Root layout: sticky header nav, footer, theme/transition providers, lazy GA, local Roboto font.
- `app/page.tsx` — Home page: bento grid + lazy theme-aware backdrop + lazy visitor globe + animated icons.
- `components/home-backdrop.tsx` — Picks the backdrop per theme: Dark Veil (WebGL) in dark, `paper-backdrop.tsx` in light. Only the active theme's module is fetched.
- `components/paper-backdrop.tsx` — Light mode's ground: a procedural paper grain you can draw graphite on with the pointer. Not persisted. Clicking bare paper cycles the pencil through a muted rainbow (gated on the event target, since the canvas is `pointer-events-none` and the listener must live on the window). The eraser retraces the recorded strokes over 3s, clearing each line along its own path; the wipe repaints paper + grain along a swath **at the identity transform** — `destination-out` would punch through to the page background, and a pattern painted under the dpr transform seams against the untouched sheet.
- `components/blank-canvas-toggle.tsx` — Strips the homepage to its backdrop (cards, globe, scroll cue), keeping nav and the corner cluster. One class on `<html>` plus a couple of rules in `globals.css`; nothing else knows the mode exists and the sections stay mounted, so leaving it does not replay every entrance. `main` is floored at `100vh` in the mode — without it everything above the footer collapses and the footer rides up under the header. Not persisted. Corner cluster order is now cursor `right-5` · scroll `right-[4.5rem]` · blank canvas `right-[8rem]` · eraser `right-[11.5rem]` (light only, so the first three stay contiguous in dark).
- `components/resume-actions.tsx` / `lib/resume-pdf.ts` — Print / Save PDF / Share on the resume. Print hands off to the browser; Save writes a file with no dialog, laying out the typed `ParsedResume` rather than rasterising the DOM (selectable, searchable, ATS-readable). They are meant to produce the same document, so **a change to the print CSS is a change to `lib/resume-pdf.ts` and vice versa**. `buildResumePdf()` is split from `downloadResumePdf()` so the layout can be exercised outside a browser — `jsPDF#save` needs a DOM, nothing above it does.
- `components/backdrop-fade.tsx` — Fades a backdrop in once its canvas has actually drawn. Must never set transform/filter/will-change — each would make it a containing block for Dark Veil's `position: fixed` canvas.
- `components/ui/glass-cube.tsx` — The bento card. Glass + 3D extrusion + tilt in dark; a plain solid card with a lift-and-shadow hover in light, because translucent white over white is a grey box. Colours come from `dark:` variants, not JS state, so hydration can't paint the wrong palette.
- `lib/notion.ts` — Direct Notion API integration for blog posts; `NotionPost` type, credential validation, sample-data fallback, reading-time calc.
- `lib/blog.ts` / `lib/resources.ts` / `lib/resume.ts` / `lib/projects.ts` — Per-content-type adapters over Notion.
- `lib/artifacts.ts` — Reads `data/artifacts.json` static manifest; file-type/label/size helpers.
- `lib/admin-auth.ts` — Client-side session token helpers (sessionStorage) + `authHeaders()` for Worker calls.
- `lib/og-card.tsx` — Shared OG image renderer used by the per-route `opengraph-image.tsx` files. **Must stay visually identical to `server/src/og.tsx`** — static artifacts unfurl from here, instant ones from there, and a viewer seeing both should not be able to tell which pipeline produced which. They cannot share code (separate deploys; the Docker image only copies `server/`), so a change to one is a manual change to the other.
- `app/resume/opengraph-image.tsx` + `assets/og-veil.jpg` — The resume's own unfurl card, with a captured Dark Veil frame behind the name. Deliberately **not** a variant of `lib/og-card.tsx`: that renderer is twinned with `server/src/og.tsx` and a change there means an `OG_VERSION` bump for every published artifact, which this inherits none of. Satori has no WebGL, so the veil cannot render at build time — `assets/og-veil.jpg` is a real frame of `components/ui/dark-veil.tsx` at the site's own `hueShift={40}`, and is a **hard build dependency**: delete it and the build fails.
- `lib/resume-parse.ts` — Parses the Notion resume markdown into typed sections for the card layout. Every classifier is a fuzzy heading match and unrecognised sections fall through to `extra`, which still renders as prose — a renamed section degrades rather than disappears. `app/resume/page.tsx` keeps a full-prose fallback for markdown with no recognisable structure.
- `lib/notion-retry.ts` — Retries *transient* Notion failures (rate limits, 5xx, socket drops) so an unattended build survives a blip. Deterministic failures (bad token, deleted database) are not retried and surface immediately.
- `lib/utils.ts` — `cn()`, `slugify()`, `artifactSlug()` (shared by `generateStaticParams` and the browser so slugs always agree).
- `next.config.ts` — Static export config (no basePath — custom domain).
- `worker-www-redirect/` — Tiny Worker issuing the `www` -> apex 301 that GitHub Pages used to give for free. A Pages custom domain *serves* content rather than redirecting, and a zone Redirect Rule needs a credential neither the DNS token nor the wrangler login carries.
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

  Case 2 is deliberate: the site rebuilds daily and deploys unconditionally on success, so falling back to sample data during a Notion outage would publish "Welcome to Notion CMS" over the live site. A failed build leaves the previous good deploy live on Pages. `scripts/generate-search-index.ts` `process.exit(1)`s on the same throw, so the MCP feed can't drift either.

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
- **Change OG images**: edit `lib/og-card.tsx` (shared renderer) or a route's `opengraph-image.tsx`, **and make the matching change in `server/src/og.tsx`** so both pipelines still produce the same card. Bump `OG_VERSION` there so already-published instant artifacts re-render. `scripts/finalize-og-images.ts` runs at the end of the build: it gives each generated image a real `.png` sibling (Pages, like GitHub Pages before it, types files by extension, so extensionless images are rejected by strict OG consumers) and injects OG tags into the raw static artifact HTML, which Next never renders and which therefore ships without any.
- **Recapture `assets/og-veil.jpg`**: temporarily add `preserveDrawingBuffer: true` to the `new Renderer({...})` call in `components/ui/dark-veil.tsx` (OGL discards the buffer otherwise and `toDataURL` comes back black), load the site in dark mode, then read the canvas into a 1200×630 offscreen and POST the data URL somewhere that writes it to disk — never back through an agent's context. A backgrounded tab pauses rAF, so shim `requestAnimationFrame` onto `setTimeout` or the shader never draws a frame. Revert the renderer flag afterwards.
- **Deploy the Worker**: `cd worker && npx wrangler deploy` (secrets via `wrangler secret put`).
- **Deploy the www redirect Worker**: `cd worker-www-redirect && npx wrangler deploy`.
- **Force a site rebuild** without a push: POST the Pages deploy hook (stored as the Worker secret `PAGES_DEPLOY_HOOK`), or use the admin panel's rebuild button, which does the same thing.
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

**Deploy**: pushing to `main` triggers a **Cloudflare Pages** build (Git integration, project `mncoleman`, build `npm run build`, output `out/`). There is no deploy workflow in `.github/` any more.

- **Build env vars live on the Pages project**, not in GitHub Secrets. Set them in the Cloudflare dashboard (Settings → Variables) or via the Pages API. `NODE_VERSION` is pinned to 20 there; build caching is on; preview deployments are off.
- **Daily content rebuild**: the admin Worker's `scheduled()` handler fires the Pages deploy hook at 06:00 UTC (`[triggers] crons` in `worker/wrangler.toml`). That replaced `deploy.yml`'s `schedule:`.
- **Admin-panel rebuilds** POST the same deploy hook (`PAGES_DEPLOY_HOOK` secret on the Worker) instead of a GitHub `repository_dispatch`.
- **Artifact manifest commits** made by the Worker push to the repo, and the Git integration builds them like any other push — do *not* also fire the deploy hook for those, or one upload builds twice.
- `profile-cards.yml` still runs on Actions (5 AM UTC) because it commits repo content rather than deploying. `profile-summary-card-output/*` is in the Pages **build watch path excludes**, so that commit no longer triggers a full Notion rebuild an hour before the cron does one anyway.

**Local builds**: `.env.local` (gitignored) holds the same values, so `npm run build` works with no credential setup. Source of truth is 1Password item `mncoleman.com Notion Credentials` plus the Pages project vars.

## Gotchas

1. **No basePath**: the site runs on the custom domain `mncoleman.com`, so `next.config.ts` has **no** `basePath`. (It previously used `/mncoleman`/`/matthew-coleman` for the GitHub Pages subpath — don't reintroduce that. `public/CNAME` is also gone; it only meant anything to GitHub Pages.)
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
14. **A Pages custom domain needs a DNS record Cloudflare created.** Attaching the domain via the API does *not* create the record, and a record you made yourself first gives a permanent 522. Order that works: attach the custom domain to the Pages project, *then* point the record (proxied CNAME → `<project>.pages.dev`). Confirmed by rehearsing the whole cutover on a throwaway subdomain first — do that again before touching the apex.
15. **`_redirects` only matches the PATH.** A rule written against a full `https://www…` URL parses, ships, and silently never fires — which is exactly how the www redirect was missed the first time. Cross-hostname redirects need a zone Redirect Rule (needs a zone-scoped credential, dashboard only) or a Worker route, which is why `worker-www-redirect/` exists.
16. **Pages strips `.html`.** `/artifacts/foo.html` 308-redirects to `/artifacts/foo`. Content still serves and unfurlers follow it, so old shared links keep working — but the `og:url` values `finalize-og-images.ts` injects point at the `.html` form and are therefore redirect targets. Harmless; don't "fix" it by rewriting links.
17. **An empty `.env.local` does not fail the build, it fakes it.** Missing Notion credentials take the sample-data branch, so you get a clean green build that quietly published "Welcome to Notion CMS". If a build's output looks oddly generic, check the credentials before anything else. (This is also why the Pages project must keep its env vars — same trap, live.)
18. **Two wrangler credential files exist.** `~/.wrangler/config/default.toml` is the live one; `~/Library/Preferences/.wrangler/config/default.toml` can hold a stale token that fails with a misleading "Authentication error". Read the OAuth token from the former. It is short-lived (~1h) — run any `wrangler` command to refresh it before a long API session.
19. **Neither stored Cloudflare credential can edit Rulesets.** The 1Password DNS token does DNS + zone settings (it *can* flip the SSL mode); the wrangler OAuth login does Workers/Pages/DNS-adjacent work but only `zone:read`. Transform Rules, Redirect Rules and Page Rules therefore need Matthew in the dashboard. Don't conclude a token is broken — check this list first.

20. **Pages build watch paths: an empty `path_includes` matches NOTHING.** Setting `path_excludes` via the API without also setting `path_includes: ["*"]` silently filters out every push — deployments are created and then sit in `queued`/`idle` forever rather than failing. Cost ~10 minutes of "why is this deploy stuck" on 2026-08-15. The pair is currently `path_includes: ["*"]` + `path_excludes: ["profile-summary-card-output/*"]`, so the daily profile-card commit no longer triggers a full Notion rebuild an hour before the cron does one. If a deploy ever hangs in `queued`, check these two fields first.

21. **The resume prints out of a stylesheet, not out of the DOM you see.** Nearly every element on `/resume` is invisible until JavaScript animates it in — motion's `initial={{opacity:0}}`, the contact chips' inline `animation: fadeSlideIn`, the experience cards' collapsed `grid-template-rows: 0fr`. A printer runs none of it, so the `@media print` block in `globals.css` is `!important` throughout (it is overriding inline styles) and scoped to `.resume-print`. It also has to **hide `[aria-hidden]` and un-hide `.sr-only`**, because the typewriter headings render half-typed decorative copy plus the real string. Verify it by injecting the rules as a plain stylesheet and screenshotting — **never by calling `window.print()`**, which opens a modal that freezes browser automation for the rest of the session.

22. **`public/_headers` matches trailing globs only.** `/_next/static/*` works; `/*/opengraph-image.png` needs a wildcard mid-path and would be the same silent no-op as gotcha #15. There is deliberately no rule for the generated OG cards.

13. **Animation loops must be gated.** `components/ui/dark-veil.tsx` is the reference: `prefers-reduced-motion` renders one static frame, plus an IntersectionObserver and a `visibilitychange` pause, plus demand-driven rAF that stops once motion settles. `components/Waves.tsx` follows it. Also keep `touchmove` listeners `passive: true` unless the handler genuinely calls `preventDefault()` — a non-passive one blocks every scroll frame on the page.
```

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
