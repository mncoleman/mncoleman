# The daily brief

`/brief` on mncoleman.com: a morning digest published by a scheduled Claude agent and rendered by the site from data. The agent sends JSON only; the design lives in `components/brief/`, so restyling it restyles every edition.

## How it fits together

| Piece | Where | Notes |
| --- | --- | --- |
| Pages (the "skeleton") | `app/brief/`, `components/brief/` | Static. `/brief` (latest), `/brief/YYYY-MM-DD`, `/brief/archive`. |
| Content | Cloudflare KV namespace `BRIEFS` | `brief:<date>`, `index`, `config`. Hide or delete an edition and it is gone within about a minute (KV propagation), no rebuild. |
| Writes | admin Worker, `PUT/PATCH/DELETE /api/briefs/:date`, `PUT /api/briefs/config` | Validated by `lib/brief.ts`. Needs the `content` feature. |
| Public reads | `worker-mcp`, `/api/brief/index`, `/latest`, `/<date>`, `/rss` | Same origin as the site. Honour the visibility switch and hidden editions. |
| MCP | `get_brief`, `list_briefs` (public, `/mcp`); `publish_brief`, `delete_brief` (signed in, `/mcp/admin`) | |

`/brief/YYYY-MM-DD` exists for every date from `BRIEF_FIRST_DATE` to 45 days past the last build (`app/brief/brief-config.ts`); the daily rebuild moves that window. A date with no edition says so.

## For the scheduling agent

- Connector: add `https://mncoleman.com/mcp/admin` as a custom connector and sign in once. (The public `https://mncoleman.com/mcp` cannot publish.)
- Tool: `publish_brief`, one argument: `{ "edition": { ... } }`.
- Reply: `{ url, date, edition_number, replaced, warnings[] }`. On a validation failure the tool returns an error listing `{path, reason}` for every problem; fix those fields and call again. Publishing the same date again replaces it and keeps its number.
- Before researching: `list_brief_sources({ section? })` returns the source library to start from.
- Other tools: `get_brief({ date? })`, `list_briefs({ limit? })`, `delete_brief({ date, confirm: true })`.

### Edition

```jsonc
{
  "date": "2026-11-13",                       // required
  "location": "Berthoud, CO",                 // required
  "compiled_at": "2026-11-13T07:52:00-07:00", // required
  "summary": "One sentence for the opening page.",            // optional
  "weather": { "summary": "", "high_f": 63, "tonight": "", "wind": "", "tomorrow": "", "source": "", "source_url": "https://" },
  "verses": [ { "text": "", "reference": "", "translation": "NKJV", "url": "https://", "source": "Bible Gateway" } ],  // 1 to 4, one per source
  "devotional": { "title": "", "scripture": { "reference": "", "text": "" }, "body": "", "attribution": "", "url": "https://" },
  "top_signals": [ { "headline": "", "sector": "signal", "item_id": "s1" } ],        // up to 5
  "sectors": [ {
    "key": "signal",              // signal | local | nation | world | field_notes, each once
    "title": "AI and Tech",
    "summary": "One sentence.",
    "items": [ {                  // 3 to 8 (fewer warns, more is refused)
      "id": "s1", "confidence": "confirmed",   // confirmed | developing | contested | note
      "title": "", "brief": "The line on the card.",
      "detail": "The full write-up shown when the card is opened. Paragraphs separated by a blank line.",
      "sources": [ { "outlet": "AP", "url": "https://" } ]   // 1 to 6, url required
    } ]
  } ],
  "watchlist": [ { "when": "2026-11-17", "label": "TUE 17 NOV", "what": "", "sources": [ { "outlet": "", "url": "https://" } ] } ],
  "notices": [ "Scripture taken from the New King James Version..." ]
}
```

Rules: plain text only (HTML and Markdown are stripped, with a warning); every source needs a URL; item ids are unique in the edition; en and em dashes warn. `edition_number` is assigned by the server. A single `verse` object is still accepted in place of `verses`. `weather`, `verses`, `devotional`, `top_signals`, `watchlist` and `notices` may be left out, and the page skips them. `bluf` is accepted as an old name for `summary`.

## Setup

The `BRIEFS` namespace exists and is bound in both `worker/wrangler.toml` and `worker-mcp/wrangler.toml`. Deploy `worker/` before `worker-mcp/`. Seed or publish at least one edition before the pages reach `main`: the home page bar opens `/brief`, which says "No brief yet" until one exists. `data/brief-sample.json` is the sample; its source links are outlet home pages, not the articles.

## Day to day

- **Preview locally:** `npm run dev`, open `/brief`. With no Worker behind it the page shows `data/brief-sample.json`. Check a new edition's JSON with `npx tsx lib/brief.selftest.ts` as a model for calling `validateBrief`.
- **Take one edition down:** admin panel, Brief (`/admin/brief`), Hide (reversible) or the bin (permanent).
- **Roll back an edition:** publish the corrected JSON for the same date; it replaces the stored one.
- **Turn the whole section off:** admin panel, Brief (`/admin/brief`), the Public / Private button. Private makes the pages, archive, feed and public MCP tools show nothing; nothing is deleted.
- **Search indexing:** off. `BRIEF_INDEXABLE` in `app/brief/brief-config.ts` (noindex on the pages and a robots.txt rule); changing it needs a deploy.
- **Source library:** the link list on the same admin page. It is the External sources page that closes every edition, and the publishing agent reads it through the admin MCP tool `list_brief_sources` (each link: name, URL, the part of the brief it feeds, a note). It is edited only in the admin panel; the MCP tool is read-only on purpose, so the agent cannot rewrite its own source list.
- **Roll back the design:** revert the commit that changed `components/brief/`; content is untouched.

## Changing the brief (for a future session)

Read this section before touching anything. It is the map; the code comments carry the reasons.

### Where things are

| To change | Edit | Then |
| --- | --- | --- |
| What an edition may contain (a field, a limit, a rule) | `lib/brief.ts` (`BriefEdition`, `validateBrief`) | every row below that mentions the field |
| How an edition looks | `components/brief/BriefEdition.tsx`, `components/brief/brief.css` | site deploy only |
| The archive, calendar, search | `components/brief/BriefArchive.tsx` | site deploy only |
| Loading, dev fallback, date helpers | `components/brief/use-brief.ts` | site deploy only |
| Routes, page titles, indexing, the date window | `app/brief/*`, `app/brief/brief-config.ts` | site deploy only |
| The share card | `app/brief/opengraph-image.tsx` (mirrors `brief.css` colours by hand) | site deploy only |
| The home page bar | `components/brief-callout.tsx` | site deploy only |
| What the agent is told to send | `publish_brief` description in `worker-mcp/index.ts`, and the Edition block above | deploy `worker-mcp/` |
| Storing, numbering, hiding, visibility, the link list | `/api/briefs/*` in `worker/index.ts` | deploy `worker/` |
| Public reads, `get_brief`, `list_briefs`, RSS | `worker-mcp/index.ts` (`briefIndex`, `briefEdition`, `briefRss`) | deploy `worker-mcp/` |
| Admin page (`/admin/brief`) | `components/admin/BriefAdmin.tsx`, `app/admin/brief/page.tsx`, the sidebar entry in `components/admin/AdminNav.tsx` | site deploy only |
| The sample shown in `next dev` | `data/brief-sample.json` (must pass `validateBrief` with no warnings) | nothing |

### Adding or changing a field: the checklist

A field lives in six places. Miss one and it validates but never shows, or shows but the agent never sends it.

1. `lib/brief.ts`: the type, and its handling in `validateBrief` (use the `text` / `url` / `list` helpers so limits, plain-text cleaning and field-path errors come for free; add the name to the known-fields list at the bottom or it warns as unknown).
2. `lib/brief.selftest.ts`: a case that it is accepted, and one that a bad value is refused by path.
3. `components/brief/BriefEdition.tsx` (+ `brief.css`): render it, and render nothing when it is absent.
4. `publish_brief`'s description in `worker-mcp/index.ts`: this text is the only spec the scheduled agent sees.
5. The Edition block in this file.
6. `data/brief-sample.json`, so `next dev` shows it.

**Editions already in KV are never rewritten.** When a field changes shape, keep reading the old shape. `verse` became `verses`: the validator still accepts a single `verse` and stores a list, and the page reads both through `briefVerses()`. Follow that pattern rather than migrating stored data.

### Checks before shipping

```bash
npx tsx lib/brief.selftest.ts
```

```bash
npx tsx worker/mcp-oauth.selftest.ts
```

- `npx tsc --noEmit -p .` covers the site and `worker-mcp/`; `worker/` is excluded from the root tsconfig, so bundle it to catch syntax and import errors: `node_modules/.bin/esbuild worker/index.ts --bundle --format=esm --outfile=/dev/null`.
- `npm run dev`, open `/brief`: it shows `data/brief-sample.json`. To preview real or hand-made data, intercept `/api/brief/latest` in a headless browser and return your own `{ edition, newer, older, links }`.
- A full `npm run build` fails in a checkout that has unrelated untracked work in `app/`; build in a clean worktree if so.

### Deploy order

1. `cd worker && npx wrangler deploy` (the validator runs here; ship it first or the agent's new field is rejected or silently dropped).
2. `cd worker-mcp && npx wrangler deploy` (tool text and public reads).
3. Merge to `main` for the pages. Verify with `curl -s https://mncoleman.com/sw.js | grep -o 'mc-blog-[a-z0-9]*'` matching the commit.
4. Tell the scheduling agent what changed; it only learns the format from `publish_brief`'s description, which it reads when it lists tools.

A change that only adds an optional field can ship in any order without breaking anything: an older page ignores a field it does not know.

### Things that already went wrong once

- **`wrangler.toml`: top-level keys must stay above every `[table]`.** A `[[services]]` block added above `workers_dev = true` made TOML read it as part of that table and switched the workers.dev URL off.
- **The site builds links with a trailing slash.** `/api/brief/rss/` reaches the Worker with the slash; the handler strips it. Any new `/api/brief/*` path gets the same treatment for free, but only inside that handler.
- **`Origin: null` is normal** on the OAuth consent form post, because that page is served `no-referrer`. A hand-written test client sends a real Origin and will not catch a check that refuses null.
- **KV is not instant.** A hide, delete or republish can take about a minute to show publicly. Do not conclude a write failed from one stale read.
- **In `next dev` a missing API looks like the site's HTML 404.** `use-brief.ts` treats a non-JSON reply as "no API here" and falls back to the sample; a JSON 404 means "no such edition".
- **Text is plain text, and control characters are stripped on the way in.** One raw control character in an edition would make RSS readers reject the whole feed.
- **The brief is a fixed full-screen layer over the site.** It hides the site header and footer from focus with `html:has(.brief)`; anything new that floats above the page (z-index over 60) will sit on top of it.
- **Plain words only in the UI.** No "BLUF", "Sector", "Situation", "Signal". The stored field names keep some of those (`top_signals`, sector key `signal`); the page never prints them.
