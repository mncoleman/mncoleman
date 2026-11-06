# Bible data licenses

- **KJV (King James Version, 1769 Oxford standard text).** Public domain. The UK Crown patent
  (Letters Patent) applies only to printing in the United Kingdom. Source: github.com/aruljohn/Bible-kjv,
  commit a9aa4e55afbb3e095f57e4b14cd1f22c5ee8d7c9 (2019-11-20), verified 31,102 verses / 1,189 chapters.
- **WEB (World English Bible), "engwebp" edition: updated WEB, 66-book protocanon, "2020 stable text edition".**
  Public domain. "World English Bible" is a trademark of eBible.org; do not alter the text and still call it
  the WEB. Source: https://ebible.org/Scriptures/engwebp_usfm.zip, snapshot with Last-Modified 2026-10-30
  (Haiola build dated 30 Oct 2026), fetched 2026-11-06. Footnotes, cross-references and Strong's tags are stripped.
  Divergences from the KJV verse grid (re-mapped verses, null verses) are listed in NOTES.md.
- **OpenBible.info cross-references.** CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Attribution:
  "Cross-references from the Treasury of Scripture Knowledge via OpenBible.info"
  (https://www.openbible.info/labs/cross-references/), shown in the footer of every /bible page.
  Source file cross_references.txt (dated 2026-11-02, sha256 ea07bfc0...4100e0, pinned in scripts/bible/xrefs.ts),
  reduced by scripts/bible/xrefs.ts to the top 8 targets per verse in data/bible/xrefs/{OSIS}.json
  (targets off the KJV verse grid dropped; cross-chapter ranges cut to their first verse). Counts in _stats.json.
- **Bible text on the site:** KJV (public domain), WEB (public domain; World English Bible is a trademark of eBible.org).
