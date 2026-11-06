/**
 * Build static KJV + WEB Bible data for the verse-mention feature.
 *
 *   npx tsx scripts/bible/build.ts <sourceDir>
 *
 * <sourceDir> must contain:
 *   kjvrepo/   clone of github.com/aruljohn/Bible-kjv (one JSON per book)
 *   webz/      unzipped https://ebible.org/Scriptures/engwebp_usfm.zip
 *
 * Source files are treated as untrusted data: parsed, never executed.
 * Writes public/bible-data/{index.json,kjv/*,web/*,search.json,NOTES.md}.
 */
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

// [OSIS id, display name, KJV repo filename (no .json), USFM code]
const BOOKS: [string, string, string, string][] = [
  ["Gen", "Genesis", "Genesis", "GEN"], ["Exod", "Exodus", "Exodus", "EXO"],
  ["Lev", "Leviticus", "Leviticus", "LEV"], ["Num", "Numbers", "Numbers", "NUM"],
  ["Deut", "Deuteronomy", "Deuteronomy", "DEU"], ["Josh", "Joshua", "Joshua", "JOS"],
  ["Judg", "Judges", "Judges", "JDG"], ["Ruth", "Ruth", "Ruth", "RUT"],
  ["1Sam", "1 Samuel", "1Samuel", "1SA"], ["2Sam", "2 Samuel", "2Samuel", "2SA"],
  ["1Kgs", "1 Kings", "1Kings", "1KI"], ["2Kgs", "2 Kings", "2Kings", "2KI"],
  ["1Chr", "1 Chronicles", "1Chronicles", "1CH"], ["2Chr", "2 Chronicles", "2Chronicles", "2CH"],
  ["Ezra", "Ezra", "Ezra", "EZR"], ["Neh", "Nehemiah", "Nehemiah", "NEH"],
  ["Esth", "Esther", "Esther", "EST"], ["Job", "Job", "Job", "JOB"],
  ["Ps", "Psalms", "Psalms", "PSA"], ["Prov", "Proverbs", "Proverbs", "PRO"],
  ["Eccl", "Ecclesiastes", "Ecclesiastes", "ECC"], ["Song", "Song of Solomon", "SongofSolomon", "SNG"],
  ["Isa", "Isaiah", "Isaiah", "ISA"], ["Jer", "Jeremiah", "Jeremiah", "JER"],
  ["Lam", "Lamentations", "Lamentations", "LAM"], ["Ezek", "Ezekiel", "Ezekiel", "EZK"],
  ["Dan", "Daniel", "Daniel", "DAN"], ["Hos", "Hosea", "Hosea", "HOS"],
  ["Joel", "Joel", "Joel", "JOL"], ["Amos", "Amos", "Amos", "AMO"],
  ["Obad", "Obadiah", "Obadiah", "OBA"], ["Jonah", "Jonah", "Jonah", "JON"],
  ["Mic", "Micah", "Micah", "MIC"], ["Nah", "Nahum", "Nahum", "NAM"],
  ["Hab", "Habakkuk", "Habakkuk", "HAB"], ["Zeph", "Zephaniah", "Zephaniah", "ZEP"],
  ["Hag", "Haggai", "Haggai", "HAG"], ["Zech", "Zechariah", "Zechariah", "ZEC"],
  ["Mal", "Malachi", "Malachi", "MAL"], ["Matt", "Matthew", "Matthew", "MAT"],
  ["Mark", "Mark", "Mark", "MRK"], ["Luke", "Luke", "Luke", "LUK"],
  ["John", "John", "John", "JHN"], ["Acts", "Acts", "Acts", "ACT"],
  ["Rom", "Romans", "Romans", "ROM"], ["1Cor", "1 Corinthians", "1Corinthians", "1CO"],
  ["2Cor", "2 Corinthians", "2Corinthians", "2CO"], ["Gal", "Galatians", "Galatians", "GAL"],
  ["Eph", "Ephesians", "Ephesians", "EPH"], ["Phil", "Philippians", "Philippians", "PHP"],
  ["Col", "Colossians", "Colossians", "COL"], ["1Thess", "1 Thessalonians", "1Thessalonians", "1TH"],
  ["2Thess", "2 Thessalonians", "2Thessalonians", "2TH"], ["1Tim", "1 Timothy", "1Timothy", "1TI"],
  ["2Tim", "2 Timothy", "2Timothy", "2TI"], ["Titus", "Titus", "Titus", "TIT"],
  ["Phlm", "Philemon", "Philemon", "PHM"], ["Heb", "Hebrews", "Hebrews", "HEB"],
  ["Jas", "James", "James", "JAS"], ["1Pet", "1 Peter", "1Peter", "1PE"],
  ["2Pet", "2 Peter", "2Peter", "2PE"], ["1John", "1 John", "1John", "1JN"],
  ["2John", "2 John", "2John", "2JN"], ["3John", "3 John", "3John", "3JN"],
  ["Jude", "Jude", "Jude", "JUD"], ["Rev", "Revelation", "Revelation", "REV"],
];

type Ref = [number, number]; // [chapter, verse] on the WEB numbering
/**
 * WEB verses whose numbering differs from the KJV grid. Each entry joins the
 * listed WEB verses (in order, space-separated) into one KJV-grid verse.
 * Verified by content, see NOTES.md.
 */
const MERGES: Record<string, { from: Ref[]; to: Ref }[]> = {
  Rom: [
    { from: [[14, 24]], to: [16, 25] },
    { from: [[14, 25]], to: [16, 26] },
    { from: [[14, 26]], to: [16, 27] },
  ],
};

const root = path.resolve(__dirname, "../..");
const out = path.join(root, "public/bible-data");
const src = process.argv[2];
if (!src) throw new Error("usage: tsx scripts/bible/build.ts <sourceDir>");

function assert(c: unknown, m: string): asserts c {
  if (!c) throw new Error("ASSERT FAILED: " + m);
}

// ---------- KJV ----------
function loadKjv(file: string): string[][] {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const chapters: string[][] = [];
  for (const ch of j.chapters as { chapter: string; verses: { verse: string; text: string }[] }[]) {
    assert(Number(ch.chapter) === chapters.length + 1, `${file}: chapter order at ${ch.chapter}`);
    const vs: string[] = [];
    for (const v of ch.verses) {
      assert(Number(v.verse) === vs.length + 1, `${file}: ${ch.chapter}:${v.verse} verse order`);
      vs.push(v.text.replace(/\s+/g, " ").trim());
    }
    chapters.push(vs);
  }
  return chapters;
}

// ---------- WEB (USFM) ----------
function cleanUsfm(s: string): string {
  return s
    .replace(/\\f\s.*?\\f\*/g, "") // footnotes
    .replace(/\\x\s.*?\\x\*/g, "") // cross refs
    .replace(/\|[^\\]*(?=\\\+?[a-z]+\d*\*)/g, "") // |strong="..." / lemma attrs
    .replace(/\\\+?[a-z]+\d*\*/g, "") // closing char markers
    .replace(/\\\+?[a-z]+\d* ?/g, "") // opening char markers
    .replace(/\s+/g, " ")
    .trim();
}

function loadWeb(file: string): Map<string, string> {
  const verses = new Map<string, string>();
  let ch = 0;
  let cur: string | null = null;
  const parts = new Map<string, string[]>();
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\\([a-z0-9]+)\s?(.*)$/.exec(raw);
    if (!m) continue;
    const [, mk, rest] = m;
    if (mk === "c") { ch = parseInt(rest, 10); cur = null; continue; }
    if (mk === "v") {
      const vm = /^(\d+)\s*(.*)$/.exec(rest);
      assert(vm, `${file}: bad \\v line: ${raw.slice(0, 60)}`);
      cur = `${ch}:${vm[1]}`;
      assert(!parts.has(cur), `${file}: duplicate verse ${cur}`);
      parts.set(cur, [vm[2]]);
      continue;
    }
    // headings / non-scripture blocks end the current verse
    if (/^(d|s\d?|ms\d?|mr|r|sp|cl|cd|id|ide|h|toc\d|mt\d?|rem|sts)$/.test(mk)) { cur = null; continue; }
    // paragraph / poetry / list lines carry verse text when a verse is open
    if (cur && rest) parts.get(cur)!.push(rest);
  }
  for (const [k, p] of parts) verses.set(k, cleanUsfm(p.join(" ")));
  return verses;
}

// ---------- build ----------
const notes: string[] = [];
const index: { id: string; name: string; chapters: number[] }[] = [];
const kjvAll: Record<string, string[][]> = {};
const webAll: Record<string, (string | null)[][]> = {};
let kjvVerses = 0, kjvChapters = 0, webNonNull = 0;
const webNulls: string[] = [];
const webMerged: string[] = [];
const strays: string[] = [];

const usfmFiles = fs.readdirSync(path.join(src, "webz"));
for (const [id, name, kjvName, usfm] of BOOKS) {
  const kjv = loadKjv(path.join(src, "kjvrepo", kjvName + ".json"));
  kjvAll[id] = kjv;
  kjvChapters += kjv.length;
  index.push({ id, name, chapters: kjv.map((c) => c.length) });
  for (const c of kjv) for (const v of c) { assert(v.length > 0, `${id}: empty KJV verse`); kjvVerses++; }

  const f = usfmFiles.find((n) => n.endsWith(`${usfm}engwebp.usfm`));
  assert(f, `no WEB file for ${id}`);
  const web = loadWeb(path.join(src, "webz", f));

  for (const mg of MERGES[id] ?? []) {
    const keys = mg.from.map(([c, v]) => `${c}:${v}`);
    for (const k of keys) assert(web.has(k), `${id}: merge source ${k} missing`);
    const joined = keys.map((k) => web.get(k)!).join(" ");
    for (const k of keys) web.delete(k);
    web.set(`${mg.to[0]}:${mg.to[1]}`, joined);
    webMerged.push(`${id} WEB ${keys.join(" + ")} -> KJV ${mg.to[0]}:${mg.to[1]}`);
  }

  const grid: (string | null)[][] = [];
  const used = new Set<string>();
  kjv.forEach((vs, ci) => {
    grid.push(vs.map((_, vi) => {
      const k = `${ci + 1}:${vi + 1}`;
      const t = web.get(k);
      if (t === undefined || t === "") { webNulls.push(`${id} ${k}`); return null; }
      used.add(k); webNonNull++;
      return t;
    }));
  });
  const stray = [...web.keys()].filter((k) => !used.has(k) && web.get(k) !== "");
  if (stray.length) strays.push(`${id}: ${stray.join(", ")}`);
  webAll[id] = grid;
}

assert(strays.length === 0, "WEB verses off the KJV grid (add MERGES entries):\n" + strays.join("\n"));
assert(index.length === 66, "66 books");
assert(kjvChapters === 1189, `1,189 chapters (got ${kjvChapters})`);
assert(kjvVerses === 31102, `31,102 KJV verses (got ${kjvVerses})`);

// ---------- write ----------
fs.rmSync(out + "/kjv", { recursive: true, force: true });
fs.rmSync(out + "/web", { recursive: true, force: true });
fs.mkdirSync(out + "/kjv", { recursive: true });
fs.mkdirSync(out + "/web", { recursive: true });
const w = (p: string, o: unknown) => fs.writeFileSync(path.join(out, p), JSON.stringify(o));
w("index.json", { books: index });
for (const { id } of index) {
  w(`kjv/${id}.json`, { book: id, translation: "KJV", chapters: kjvAll[id] });
  w(`web/${id}.json`, { book: id, translation: "WEB", chapters: webAll[id] });
}

const norm = (s: string) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
const search: Record<string, string[][]> = {};
for (const { id } of index) {
  search[id] = kjvAll[id].map((vs, ci) =>
    vs.map((t, vi) => `${norm(t)} | ${norm(webAll[id][ci][vi] ?? "")}`));
}
const searchStr = JSON.stringify(search);
fs.writeFileSync(path.join(out, "search.json"), searchStr);

fs.writeFileSync(path.join(out, "NOTES.md"), `# Bible data notes

Generated by \`scripts/bible/build.ts\`. KJV grid: 66 books, 1,189 chapters, 31,102 verses.
WEB verses mapped onto the KJV grid: ${webNonNull} non-null, ${webNulls.length} null.

## WEB verses re-mapped to the KJV grid (merged by content)
${webMerged.map((s) => "- " + s).join("\n") || "- none"}

## Other divergences (kept positional, not re-mapped)
- 1John 5:7-8: WEB has no Johannine Comma, so WEB 5:7 ("For there are three who testify:") and 5:8 are the
  counterparts of KJV 5:8 split across two verses; KJV 5:7 has no real WEB equivalent. Text is positional.
- Clause-level Textus Receptus additions are absent from WEB text inside otherwise-present verses
  (e.g. Matt 27:35, Acts 9:6, Rom 16:25-27 sits at WEB 14:24-26); WEB verse is shorter, not shifted.
- Rom 14:24-26 (WEB, doxology) is placed at KJV 16:25-27 (merge above); WEB 16:25 is a footnote-only stub.
- Psalm titles are unnumbered in both and excluded from verse text. 3John 14 includes the closing
  "Peace be to you..." paragraph (KJV 14 does too). Rev 12:17/13:1 and the other numbering spots
  listed in the task already align one-to-one in the engwebp edition.

## KJV-grid verses with no WEB text (null)
${webNulls.map((s) => "- " + s).join("\n") || "- none"}
`);

console.log(`KJV: ${kjvVerses} verses / ${kjvChapters} chapters / ${index.length} books`);
console.log(`WEB: ${webNonNull} non-null, ${webNulls.length} null`);
console.log("merged:", webMerged);
console.log("nulls:", webNulls);
console.log(`search.json: ${searchStr.length} bytes raw, ${gzipSync(searchStr).length} bytes gz`);
