## What & why

<!-- What changes, and what problem it solves. Link any issue. -->

## Which pieces does this touch?

This repo ships **four independently deployed pieces**. Pushing to `main` deploys only the
first — tick everything this PR changes, because the rest need their own deploy step.

- [ ] **Next.js site** (repo root) — deploys on merge to `main`
- [ ] **`worker/`** — admin auth Worker → `cd worker && npx wrangler deploy`
- [ ] **`worker-mcp/`** — public MCP server → `cd worker-mcp && npx wrangler deploy`
- [ ] **`server/`** — artifact service → Docker build + ship, see `server/README.md`

If more than one is ticked, note the required **deploy order** here. The admin Worker mints
the JWT the artifact service authorises against, so the Worker generally ships first.

## Checks

- [ ] `npx tsc --noEmit` clean at the repo root
- [ ] `npm run lint` — no new errors
- [ ] `npm run build` succeeds
- [ ] Checked in **both light and dark mode** (if UI)
- [ ] Checked at mobile width (if UI)

## Things this repo gets wrong easily

Only relevant if the PR goes near them — see the Gotchas list in `CLAUDE.md`:

- [ ] No `basePath` reintroduced (custom domain — gotcha 1)
- [ ] New animation loops are gated: reduced-motion, IntersectionObserver, visibility pause
      (`components/ui/dark-veil.tsx` is the reference — gotcha 13)
- [ ] Nested scroll containers have `data-lenis-prevent`
- [ ] Both OG renderers changed together, `OG_VERSION` bumped (`lib/og-card.tsx` +
      `server/src/og.tsx` — gotcha 10)
- [ ] Notion fetchers still distinguish *missing credentials* (sample data) from
      *failed fetch* (throw)
- [ ] Secrets: nothing committed; nothing sensitive behind a `NEXT_PUBLIC_` prefix

## Notes for review

<!-- Anything you're unsure about, deliberate trade-offs, or follow-ups you're leaving. -->
