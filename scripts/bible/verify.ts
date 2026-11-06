/**
 * Re-asserts the invariants of public/bible-data. Run: npx tsx scripts/bible/verify.ts
 */
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(__dirname, "../../public/bible-data");
const rd = (p: string) => JSON.parse(fs.readFileSync(path.join(dir, p), "utf8"));
function assert(c: unknown, m: string): asserts c {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

const { books } = rd("index.json") as { books: { id: string; name: string; chapters: number[] }[] };
assert(books.length === 66, "66 books");
assert(books[0].id === "Gen" && books[65].id === "Rev", "canonical order");
const search = rd("search.json") as Record<string, string[][]>;

let chapters = 0, verses = 0, webNull = 0;
for (const b of books) {
  chapters += b.chapters.length;
  const k = rd(`kjv/${b.id}.json`), w = rd(`web/${b.id}.json`);
  assert(k.book === b.id && k.translation === "KJV", `${b.id} kjv header`);
  assert(w.book === b.id && w.translation === "WEB", `${b.id} web header`);
  assert(k.chapters.length === b.chapters.length && w.chapters.length === b.chapters.length, `${b.id} chapter count`);
  assert(search[b.id].length === b.chapters.length, `${b.id} search chapters`);
  b.chapters.forEach((n, ci) => {
    assert(k.chapters[ci].length === n && w.chapters[ci].length === n, `${b.id} ${ci + 1} verse count`);
    assert(search[b.id][ci].length === n, `${b.id} ${ci + 1} search verses`);
    for (let vi = 0; vi < n; vi++) {
      verses++;
      const kt = k.chapters[ci][vi], wt = w.chapters[ci][vi];
      assert(typeof kt === "string" && kt.length > 0, `${b.id} ${ci + 1}:${vi + 1} KJV empty`);
      assert(wt === null || (typeof wt === "string" && wt.length > 0), `${b.id} ${ci + 1}:${vi + 1} WEB empty string`);
      if (wt === null) webNull++;
      else assert(!/[\\|\[\]{}]|\s{2}/.test(wt), `${b.id} ${ci + 1}:${vi + 1} WEB markup residue`);
    }
  });
}
assert(chapters === 1189, `1189 chapters (got ${chapters})`);
assert(verses === 31102, `31102 verses (got ${verses})`);
const notes = fs.readFileSync(path.join(dir, "NOTES.md"), "utf8");
assert(notes.includes(`${webNull} null`), "NOTES.md null count matches data");
console.log(`OK: 66 books, ${chapters} chapters, ${verses} KJV verses, WEB null ${webNull}`);
