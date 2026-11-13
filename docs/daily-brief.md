# The daily brief

`/brief` on mncoleman.com: a morning digest published by a scheduled Claude agent and rendered by the site from data. The agent sends JSON only; the design lives in `components/brief/`, so restyling it restyles every edition.

## How it fits together

| Piece | Where | Notes |
| --- | --- | --- |
| Pages (the "skeleton") | `app/brief/`, `components/brief/` | Static. `/brief` (latest), `/brief/YYYY-MM-DD`, `/brief/archive`. |
| Content | Cloudflare KV namespace `BRIEFS` | `brief:<date>`, `index`, `config`. Hide or delete an edition and it is gone at once, no rebuild. |
| Writes | admin Worker, `PUT/PATCH/DELETE /api/briefs/:date`, `PUT /api/briefs/config` | Validated by `lib/brief.ts`. Needs the `content` feature. |
| Public reads | `worker-mcp`, `/api/brief/index`, `/latest`, `/<date>`, `/rss` | Same origin as the site. Honour the visibility switch and hidden editions. |
| MCP | `get_brief`, `list_briefs` (public, `/mcp`); `publish_brief`, `delete_brief` (signed in, `/mcp/admin`) | |

`/brief/YYYY-MM-DD` exists for every date from `BRIEF_FIRST_DATE` to 45 days past the last build (`app/brief/brief-config.ts`); the daily rebuild moves that window. A date with no edition says so.

## For the scheduling agent

- Connector: add `https://mncoleman.com/mcp/admin` as a custom connector and sign in once. (The public `https://mncoleman.com/mcp` cannot publish.)
- Tool: `publish_brief`, one argument: `{ "edition": { ... } }`.
- Reply: `{ url, date, edition_number, replaced, warnings[] }`. On a validation failure the tool returns an error listing `{path, reason}` for every problem; fix those fields and call again. Publishing the same date again replaces it and keeps its number.
- Other tools: `get_brief({ date? })`, `list_briefs({ limit? })`, `delete_brief({ date, confirm: true })`.

### Edition

```jsonc
{
  "date": "2026-11-13",                       // required
  "location": "Berthoud, CO",                 // required
  "compiled_at": "2026-11-13T07:52:00-07:00", // required
  "summary": "One sentence for the opening page.",            // optional
  "weather": { "summary": "", "high_f": 63, "tonight": "", "wind": "", "tomorrow": "", "source": "", "source_url": "https://" },
  "verse": { "text": "", "reference": "", "translation": "NKJV", "url": "https://" },
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

Rules: plain text only (HTML and Markdown are stripped, with a warning); every source needs a URL; item ids are unique in the edition; en and em dashes warn. `edition_number` is assigned by the server. `weather`, `verse`, `devotional`, `top_signals`, `watchlist` and `notices` may be left out, and the page skips them. `bluf` is accepted as an old name for `summary`.

## One-time setup (not done yet)

1. `cd worker && npx wrangler kv namespace create BRIEFS`
2. Uncomment the `BRIEFS` block in **both** `worker/wrangler.toml` and `worker-mcp/wrangler.toml` with that id.
3. Deploy `worker/`, then `worker-mcp/`, then merge to `main` for the pages.
4. Seed the sample: sign in to the admin panel, then publish `data/brief-sample.json` through `publish_brief` (or `PUT /api/briefs/2026-11-13` with `{"edition": <that file>}`). Its source links are outlet home pages, not the articles.

## Day to day

- **Preview locally:** `npm run dev`, open `/brief`. With no Worker behind it the page shows `data/brief-sample.json`. Check a new edition's JSON with `npx tsx lib/brief.selftest.ts` as a model for calling `validateBrief`.
- **Take one edition down:** admin Overview, Daily brief, Hide (reversible) or the bin (permanent).
- **Roll back an edition:** publish the corrected JSON for the same date; it replaces the stored one.
- **Turn the whole section off:** admin Overview, Daily brief, the Public / Private button. Private makes the pages, archive, feed and public MCP tools show nothing; nothing is deleted.
- **Search indexing:** off. `BRIEF_INDEXABLE` in `app/brief/brief-config.ts` (noindex on the pages and a robots.txt rule); changing it needs a deploy.
- **External sources page:** the link list in the same admin section; it is the last page of every edition.
- **Roll back the design:** revert the commit that changed `components/brief/`; content is untouched.
