Compile today's edition of the MNColeman Brief for mncoleman.com. This run is unattended: make reasonable choices and do not ask questions. Do not send any email, message or notification. The site renders the edition from structured data; you produce DATA ONLY.

Today's edition date is {{DATE}} (America/Denver). The Mountain Time UTC offset today is {{OFFSET}}. The time now is {{NOW}}.

YOUR OUTPUT
Write the edition as one JSON object to the file edition.json in the current directory, using the Write tool. Do not publish it yourself and do not wrap it in anything: the file holds the edition object only (not {"edition": ...}). A script publishes the file after you finish and will send you back any validation errors to fix. When the file is written, end with one short plain-text line giving the number of items per sector.

TOOLS
Research with WebSearch and WebFetch, and with research subagents (the Task or Agent tool) when that tool is available. Use Write and Edit only for edition.json.

STEP 0: THE SOURCE LIBRARY
These are Matthew's chosen sources, read from the site's source library just before this run. Each entry has a section (general, weather, verse, devotional, signal, local, nation, world or field_notes), a label, a url and sometimes a note.
{{SOURCES}}
- For every part of the edition, START with the library links whose section matches that part, plus every "general" link. Read each one and follow its note. A library link always takes priority over a source named elsewhere in this prompt.
- The sources named in STEP 1 are fallbacks for a part that has no library link, and extra places to look.
- If the library above is empty or says it could not be read, carry on with STEP 1 as written and add one line to notices saying the library was unavailable.

STEP 1: RESEARCH, THEN ENHANCE AND CONFIRM (do all of this before writing anything)
First gather from the library links (STEP 0). Then, for the news sectors, send research subagents (one per sector, in parallel, if the Task or Agent tool is available; otherwise do it yourself with WebSearch and WebFetch) to do two jobs:
- ENHANCE: find the details the first source left out (numbers, names, dates, what happens next) and at least one more outlet covering the same story.
- CONFIRM: check each story's key facts against a second, independent source. Confirmed by two or more sources: confidence "confirmed". Only one source, or still changing: "developing". Sources disagree: "contested", and say what each side claims. Drop any claim you cannot trace to a page you actually read.
Tell each subagent to return, for every story: the facts, which source supports each, and the exact URLs it read. Cite every source you relied on.
Gather facts for each part below. Reword everything in your own words; never copy article text. Only report what sources support; never invent facts, quotes or URLs. Every source must be the real URL of a page you actually read.
- Weather for Berthoud, Colorado from the National Weather Service: summary, today's high in F, tonight, wind, tomorrow, source and its URL.
- Two verses of the day, each cited separately. (1) Bible Gateway, NKJV (read https://www.biblegateway.com/votd/get/?format=json&version=NKJV): text, reference, translation "NKJV", url you read. (2) The Bible App by YouVersion, as shown on https://www.bible.com/verse-of-the-day: text, reference, translation as shown on the page (currently NIV), url you read. The two services choose different verses, so expect them to differ. If one of the two cannot be read after one retry, include only the one you have.
- Devotional: today's reading from Streams in the Desert by L. B. Cowman (public domain): title, scripture reference and text, the full reading body (paragraphs separated by a blank line), attribution "L. B. Cowman, Streams in the Desert (1925)", and the url you read it from. If the first copy cannot be read in full, try the library's devotional links, then search for another copy of today's reading. Do not leave the devotional out unless no copy can be read at all.
- Sector "signal" (title "AI and Tech"): AI news (The Rundown AI newsletter and others) and technology news.
- Sector "local" (title "Berthoud and Northern Colorado"): Berthoud first, then Loveland, Larimer and Weld, then statewide. Cite local outlets (Reporter-Herald, Coloradoan, Colorado Sun, Good Day Windsor, Greeley Tribune, 9News, etc.).
- Sector "nation" (title "U.S. News and Politics").
- Sector "world" (title "World and Conflict"): international news and war and geopolitics.
- Sector "field_notes" (title "Notes"): The Worldview in 5 Minutes (Adam McManus, paraphrased, never copied; skip if no episode is published, for example weekends), the latest Diary Of A CEO episode takeaways, and themes from the public posts of the X account @mncoleman_ (https://x.com/mncoleman_) from the last 24 hours. Try WebFetch on the profile, then WebSearch for recent posts from that handle. If the X posts cannot be read, simply leave those items out. Include the field_notes sector with whatever real items you have, even one or two. Omit the sector only if there are none.
- Dated upcoming events found in any of today's stories (a closure start, an earnings date, a vote, a hearing, an event) for the watchlist.

FRESHNESS (this matters as much as accuracy)
The reader opens this edition on the morning of {{DATE}}. Every item must describe where the story stands NOW, not where it stood when the first article you found was written.
- For every story, search for anything newer before writing it: a follow-up, a resolution, a statement, a revised figure. Check the publish time of every page you use. A story found in a newsletter or a day-old article is a lead, not the latest word.
- Write the latest known status first. If it was resolved, say it was resolved and when. If it is still ongoing, say what is known as of the newest source and name that source's date.
- Never copy a source's relative time words ("today", "yesterday", "this week", "Thursday's outage was still being repaired Friday"). Rewrite them relative to {{DATE}} with the weekday and date, for example "began Thursday, November 12; Microsoft said Friday it was mostly restored, and nothing newer has been published as of Saturday morning".
- If the newest information you can find is more than 24 hours old, say so plainly in the item ("No update since Friday afternoon"). If the latest development is more than 48 hours old and nothing is still unfolding, leave the story out unless it is still important enough that the reader needs it, and then say how old the latest news is.
- Prefer stories with developments in the last 24 hours. On weekends and quiet days, fewer fresh items is better than padding with stale ones (3 is the minimum per sector).

STEP 2: BUILD THE EDITION JSON
edition = {
  date: "{{DATE}}", location: "Berthoud, CO", compiled_at: ISO 8601 with the offset {{OFFSET}} (for example {{DATE}}T06:40:00{{OFFSET}}), the time you finish,
  summary: one sentence bottom line for the opening page (max 300),
  weather: { summary (max 80), high_f (number), tonight (max 120), wind (max 60), tomorrow (max 120), source: "National Weather Service", source_url },
  verses: [ { text, reference, translation, url, source } ] with the Bible Gateway NKJV verse and the Bible App verse as two entries ("Bible Gateway", "Bible App"),
  devotional: { title, scripture: { reference, text }, body, attribution, url },
  sectors: each of signal, local, nation, world, field_notes at most once, each { key, title (max 60), summary: one sentence bottom line (max 300), items: 3 to 8 } with each item { id: short unique id such as "s1" for signal, "l1" local, "n1" nation, "w1" world, "f1" field notes; confidence: "confirmed" | "developing" | "contested" | "note"; title (max 110); brief: one or two sentences (max 260); detail: the FULL write-up shown when the card is opened, in your own words, complete and not shortened, several paragraphs separated by a blank line (max 8000); sources: 1 to 6 of { outlet, url } },
  top_signals: up to 5 of { headline (max 200), sector: that item's sector key, item_id: that item's id } (the most important stories of the day across all sectors),
  watchlist: up to 15 of { when: "YYYY-MM-DD" for sorting, label: shown text such as "TUE 17 NOV", what (max 220), sources: 1 to 6 of { outlet, url } } in chronological order, future dates only,
  notices: strings including: "Scripture taken from the New King James Version. Copyright 1982 by Thomas Nelson. Used by permission. All rights reserved.", "Scripture quotations taken from the Holy Bible, New International Version, NIV. Copyright 1973, 1978, 1984, 2011 by Biblica, Inc. Used by permission. All rights reserved worldwide." (only if the Bible App verse is NIV and is used; if the page shows another translation, use that translation's copyright notice as shown by YouVersion), "Streams in the Desert by L. B. Cowman (1925), public domain.", "The Worldview in 5 Minutes is paraphrased from its published transcript." (only if used), and "Reuters items read through syndicated copies." (only if used)
}
Guidelines: aim for 5 or 6 items per sector, 3 to 8 allowed. Use confidence "developing" for breaking or still-changing stories, "contested" for claims the parties dispute, "note" for field notes items, "confirmed" otherwise. Do not send edition_number; the server assigns it. Plain text only, no HTML or Markdown. Do not use en dashes or em dashes or double hyphens anywhere in the text. If a verse source's text contains a dash, replace it with a comma. Do not use emojis. No advertising and no Dovito promotion of any kind. Leave out any optional section rather than send it empty or with placeholder text. Every source needs a real url or it is rejected. Item ids must be unique across the whole edition.

WHEN A SOURCE CANNOT BE READ
Retry once. Then look for the same content elsewhere: a library link for that section first, then a search for another outlet or copy. Use what you could read and confirm. Leave out a single item only if nothing about it can be read; leave out a whole section only if it would have no items at all. Never fail the edition over one source. If something was left out, add one plain line to notices saying what and why.
