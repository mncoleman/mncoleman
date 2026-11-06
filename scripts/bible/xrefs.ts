/**
 * Build compact per-book cross-reference files for the static Bible pages.
 *
 *   npx tsx scripts/bible/xrefs.ts <path/to/cross_references.txt> [topN=8]
 *
 * Source: OpenBible.info cross-references (CC BY 4.0), derived from the Treasury of
 * Scripture Knowledge. https://www.openbible.info/labs/cross-references/
 * The file is untrusted data: it is parsed as text, never executed, and its sha256 is
 * pinned below so a changed upstream file fails loudly instead of silently shipping.
 *
 * Writes data/bible/xrefs/{OSIS}.json:   { "12.13": ["Rom.8.28", "Ps.1.1-3"], ... }
 *   key    "chapter.verse" of the source verse
 *   value  up to topN targets, best first (by votes). A target is "Book.c.v" or
 *          "Book.c.v-end" (a range inside one chapter).
 * Also writes data/bible/xrefs/_stats.json (kept/dropped counts).
 *
 * Targets that are not on the KJV verse grid in public/bible-data/index.json are dropped.
 * A range that crosses a chapter boundary is reduced to its first verse (counted).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PINNED_SHA256 = 'ea07bfc069c7a31795a891112109df0dc782f76d138f30edaec9d4c2434100e0';

const root = path.resolve(__dirname, '../..');
const outDir = path.join(root, 'data/bible/xrefs');
const src = process.argv[2];
const TOP = Number(process.argv[3] ?? 8);
if (!src) {
    console.error('usage: tsx scripts/bible/xrefs.ts <cross_references.txt> [topN]');
    process.exit(1);
}

const raw = fs.readFileSync(src);
const sha = crypto.createHash('sha256').update(raw).digest('hex');
if (sha !== PINNED_SHA256) {
    console.error(`sha256 mismatch: got ${sha}, pinned ${PINNED_SHA256}. Review the new file, then update PINNED_SHA256.`);
    process.exit(1);
}

const index = JSON.parse(fs.readFileSync(path.join(root, 'public/bible-data/index.json'), 'utf8')) as {
    books: { id: string; chapters: number[] }[];
};
const grid = new Map(index.books.map((b) => [b.id, b.chapters]));
const verseCount = (book: string, ch: number) => grid.get(book)?.[ch - 1];
const validVerse = (book: string, ch: number, v: number) => {
    const n = verseCount(book, ch);
    return n !== undefined && Number.isInteger(v) && v >= 1 && v <= n;
};

const ID = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)$/;
function parseId(s: string) {
    const m = ID.exec(s);
    return m ? { book: m[1], ch: Number(m[2]), v: Number(m[3]) } : null;
}

const stats = { lines: 0, sourceVerses: 0, droppedBadSource: 0, droppedBadTarget: 0, droppedSelf: 0, rangesTruncatedCrossChapter: 0, droppedDuplicate: 0, droppedBeyondTop: 0, keptRefs: 0, versesWithRefs: 0 };

// book -> "c.v" -> [target, votes][]
const by = new Map<string, Map<string, [string, number][]>>();
const lines = raw.toString('utf8').split('\n');
for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;
    const [from, to, votesRaw] = line.split('\t');
    stats.lines++;
    const f = parseId(from ?? '');
    if (!f || !validVerse(f.book, f.ch, f.v)) { stats.droppedBadSource++; continue; }
    const [a, b] = (to ?? '').split('-');
    const t1 = parseId(a ?? '');
    if (!t1 || !validVerse(t1.book, t1.ch, t1.v)) { stats.droppedBadTarget++; continue; }
    let target = `${t1.book}.${t1.ch}.${t1.v}`;
    if (b !== undefined) {
        const t2 = parseId(b);
        if (!t2 || t2.book !== t1.book || !validVerse(t2.book, t2.ch, t2.v) || (t2.ch === t1.ch && t2.v < t1.v)) {
            stats.droppedBadTarget++;
            continue;
        }
        if (t2.ch !== t1.ch) stats.rangesTruncatedCrossChapter++;
        else if (t2.v > t1.v) target += `-${t2.v}`;
    }
    if (target.replace(/-\d+$/, '') === `${f.book}.${f.ch}.${f.v}`) { stats.droppedSelf++; continue; }
    const votes = Number(votesRaw) || 0;
    let m = by.get(f.book);
    if (!m) by.set(f.book, (m = new Map()));
    const key = `${f.ch}.${f.v}`;
    let arr = m.get(key);
    if (!arr) m.set(key, (arr = []));
    arr.push([target, votes]);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
for (const [book, m] of by) {
    const out: Record<string, string[]> = {};
    const keys = [...m.keys()].sort((x, y) => {
        const [c1, v1] = x.split('.').map(Number);
        const [c2, v2] = y.split('.').map(Number);
        return c1 - c2 || v1 - v2;
    });
    for (const key of keys) {
        stats.sourceVerses++;
        const seen = new Set<string>();
        const sorted = m.get(key)!.slice().sort((p, q) => q[1] - p[1]); // stable: ties keep file order
        const kept: string[] = [];
        for (const [t] of sorted) {
            if (seen.has(t)) { stats.droppedDuplicate++; continue; }
            seen.add(t);
            if (kept.length >= TOP) { stats.droppedBeyondTop++; continue; }
            kept.push(t);
        }
        out[key] = kept;
        stats.keptRefs += kept.length;
        stats.versesWithRefs++;
    }
    fs.writeFileSync(path.join(outDir, `${book}.json`), JSON.stringify(out));
}
fs.writeFileSync(
    path.join(outDir, '_stats.json'),
    JSON.stringify({ source: 'OpenBible.info cross-references, CC BY 4.0', sourceSha256: sha, topN: TOP, ...stats }, null, 1) + '\n',
);
console.log(stats);
