/**
 * Run: npx tsx lib/bible/selftest.ts
 * Parser, href round-trip, suggestions and phrase search, against the real generated data when present.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
    BOOKS,
    __setDataForTests,
    buildVerseHref,
    formatReference,
    lookupBook,
    normalizeSearchText,
    parseReference,
    parseVerseHref,
    searchPhrase,
    suggest,
    versification,
    type BibleIndex,
    type SearchData,
    type VerseRef,
} from './index';

const dir = path.join(process.cwd(), 'public/bible-data');
const haveData = fs.existsSync(path.join(dir, 'index.json'));
if (haveData) {
    const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')) as BibleIndex;
    __setDataForTests({ index });
    // Built-in chapter counts must agree with the generated index.
    for (const b of index.books) assert.equal(BOOKS.find((x) => x.id === b.id)?.chapters, b.chapters.length, `chapters ${b.id}`);
    assert.equal(index.books.length, BOOKS.length);
    assert.deepEqual(index.books.map((b) => b.id), BOOKS.map((b) => b.id));
}

const ok = (text: string, want: VerseRef) => {
    const r = parseReference(text, versification);
    assert.ok(r.ok, `${text}: ${JSON.stringify(r)}`);
    if (r.ok) assert.deepEqual(r.ref, want, text);
};
ok('John 3:16', { book: 'John', chapter: 3, start: 16 });
ok('jn 3 16', { book: 'John', chapter: 3, start: 16 });
ok('1co13', { book: '1Cor', chapter: 13 });
ok('1 cor 13:4-7', { book: '1Cor', chapter: 13, start: 4, end: 7 });
ok('Gen.1.1', { book: 'Gen', chapter: 1, start: 1 });
ok('matt 6:23–25', { book: 'Matt', chapter: 6, start: 23, end: 25 });
ok('psalm 23', { book: 'Ps', chapter: 23 });
ok('II Kings 5:1', { book: '2Kgs', chapter: 5, start: 1 });
ok('romans 8', { book: 'Rom', chapter: 8 });
ok('Matt 12:13-13', { book: 'Matt', chapter: 12, start: 13 });
assert.equal(parseReference('Matt 6:23-7:2').ok, false);
assert.equal(parseReference('Romans 17').ok, false);
assert.equal(parseReference('xyzzy 3').ok, false);
assert.equal(parseReference('jo 3').ok, false); // ambiguous
if (haveData) assert.equal(parseReference('John 3:99', versification).ok, false);

assert.equal(lookupBook('gene').kind, 'found');
assert.equal(lookupBook('jo').kind, 'ambiguous');
assert.equal(lookupBook('psalm').kind === 'found' && lookupBook('psalm').kind, 'found');

const refs: VerseRef[] = [
    { book: 'Matt', chapter: 12, start: 13 },
    { book: 'Matt', chapter: 6, start: 23, end: 25 },
    { book: 'Rom', chapter: 8 },
    { book: '1John', chapter: 4, start: 9 },
];
const hrefs = ['/bible/Matt/12#v13', '/bible/Matt/6#v23-25', '/bible/Rom/8', '/bible/1John/4#v9'];
refs.forEach((r, i) => {
    assert.equal(buildVerseHref(r), hrefs[i]);
    assert.deepEqual(parseVerseHref(hrefs[i]), r);
});
assert.equal(formatReference(refs[0]), 'Matthew 12:13');
assert.equal(formatReference(refs[1]), 'Matthew 6:23-25');
assert.equal(formatReference(refs[2]), 'Romans 8');
assert.equal(formatReference({ book: 'Ps', chapter: 23, start: 1 }), 'Psalm 23:1');
for (const bad of ['/bible/Nope/1', '/bible/Matt/0', '/bible/Matt/6#v25-23', '/bible/Matt/6/', 'https://x.com/bible/Matt/6', '/bible/Matt/6#v0', '/bible/Matt/6#x1']) {
    assert.equal(parseVerseHref(bad), null, bad);
}

// Suggestions
let s = suggest('matt 6:23', versification);
assert.deepEqual(s.items, [{ kind: 'ref', ref: { book: 'Matt', chapter: 6, start: 23 } }]);
s = suggest('romans 8', versification);
assert.equal(s.items.length, 1);
if (haveData) assert.equal(s.grid?.type, 'verse');
s = suggest('psalm', versification);
assert.equal(s.items.length, 0); // whole name typed: grid only
assert.equal(s.grid?.type, 'chapter');
s = suggest('ps', versification);
assert.equal(s.items[0].kind, 'book');
assert.equal(suggest('jo', versification).items.length, 5);
assert.match(suggest('romans 99', versification).message ?? '', /16 chapters/);
assert.equal(suggest('love is patient', versification).phrase, 'love is patient');
assert.equal(suggest('', versification).items.length, 0);

if (haveData) {
    const search = JSON.parse(fs.readFileSync(path.join(dir, 'search.json'), 'utf8')) as SearchData;
    const t0 = performance.now();
    const hits = searchPhrase(normalizeSearchText('love is patient'), search);
    const ms = performance.now() - t0;
    assert.ok(hits.some((h) => h.kind === 'hit' && h.ref.book === '1Cor' && h.ref.chapter === 13 && h.ref.start === 4), 'love is patient -> 1 Cor 13:4');
    const lilies = searchPhrase('consider the lilies', search);
    assert.ok(lilies.some((h) => h.kind === 'hit' && h.ref.book === 'Matt' && h.ref.chapter === 6 && h.ref.start === 28));
    console.log(`phrase search ${ms.toFixed(1)}ms`);
    // Every ref a search hit returns must exist in the index.
    for (const h of hits.concat(lilies)) if (h.kind === 'hit') assert.ok(versification.verseCount(h.ref.book, h.ref.chapter) !== undefined);
}
console.log('lib/bible selftest ok');
