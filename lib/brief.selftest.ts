/**
 * Self-test for lib/brief.ts. No framework: `npx tsx lib/brief.selftest.ts`.
 * The sample edition must validate cleanly; then the things that must be refused or cleaned.
 */
import sample from '../data/brief-sample.json';
import { briefVerses, cleanBriefLinks, isBriefDate, validateBrief } from './brief';

let failed = 0;
const check = (name: string, ok: unknown) => { if (!ok) { failed++; console.error(`FAIL  ${name}`); } else console.log(`ok    ${name}`); };
const clone = () => JSON.parse(JSON.stringify(sample));
const errorsOf = (e: unknown) => { const r = validateBrief(e); return r.ok ? [] : r.errors.map((x) => x.path); };

let r = validateBrief(sample);
const good = r;
check('the sample edition is valid', good.ok);
check('the sample edition has no warnings', good.warnings.length === 0);
check('validation is idempotent', good.ok && JSON.stringify(validateBrief(good.edition)) === JSON.stringify(good));

check('real dates only', isBriefDate('2026-11-13') && !isBriefDate('2026-02-30') && !isBriefDate('13-11-2026'));
check('not an object', errorsOf('nope').length === 1);

let e = clone(); delete e.date;
check('missing date is named', errorsOf(e).includes('date'));
e = clone(); e.sectors[0].items[0].sources[0].url = '';
check('a source without a url is refused, by path', errorsOf(e).includes('sectors[0].items[0].sources[0].url'));
e = clone(); e.sectors[1].items[2].sources[0].url = 'javascript:alert(1)';
check('a non-http url is refused', errorsOf(e).includes('sectors[1].items[2].sources[0].url'));
e = clone(); e.sectors[0].items[1].id = e.sectors[0].items[0].id;
check('duplicate item ids are refused', errorsOf(e).includes('sectors[0].items[1].id'));
e = clone(); e.sectors[0].items[0].confidence = 'rumour';
check('unknown confidence is refused', errorsOf(e).includes('sectors[0].items[0].confidence'));
e = clone(); e.sectors[1].key = e.sectors[0].key;
check('a sector twice is refused', errorsOf(e).includes('sectors[1].key'));
e = clone(); e.top_signals[0].item_id = 'zz9';
check('a top story must point at a real item', errorsOf(e).includes('top_signals[0].item_id'));
e = clone(); e.sectors[0].items[0].title = 'x'.repeat(200);
check('over-long text is refused with the limit', errorsOf(e).includes('sectors[0].items[0].title'));
e = clone(); e.sectors[0].items = [...e.sectors[0].items, ...e.sectors[0].items.map((i: any, n: number) => ({ ...i, id: `x${n}` }))].slice(0, 9);
check('more than 8 items is refused', errorsOf(e).includes('sectors[0].items'));

e = clone(); e.sectors[0].items[0].brief = 'Now <b>with</b> **markup** and a [link](https://example.com).';
r = validateBrief(e);
check('markup is stripped and reported, not rejected', r.ok && r.edition.sectors[0].items[0].brief === 'Now with markup and a link.' && r.warnings.some((w) => w.path === 'sectors[0].items[0].brief'));
e = clone(); e.sectors[0].items[0].detail = 'First paragraph\nstill first.\n\n\nSecond  paragraph.';
r = validateBrief(e);
check('detail keeps paragraphs', r.ok && r.edition.sectors[0].items[0].detail === 'First paragraph still first.\n\nSecond paragraph.');
e = clone(); e.sectors[0].summary = 'A range of 3–5 mph — roughly.';
r = validateBrief(e);
check('dashes warn but publish', r.ok && r.warnings.some((w) => w.path === 'sectors[0].summary'));
e = clone(); e.sectors[0].bluf = e.sectors[0].summary; delete e.sectors[0].summary;
r = validateBrief(e);
check('the old field name `bluf` is still accepted', r.ok && !!r.edition.sectors[0].summary);
e = clone(); e.verse = e.verses[0]; delete e.verses;
r = validateBrief(e);
check('a single `verse` is still accepted and stored as a list', r.ok && r.edition.verses?.length === 1 && !('verse' in r.edition && r.edition.verse));
e = clone(); e.verse = e.verses[0];
check('`verse` and `verses` together are refused', errorsOf(e).includes('verse'));
e = clone(); e.verses = [e.verses[0], { text: 'Even there your hand will guide me.', reference: 'Psalm 139:10', translation: 'NIV', url: 'https://www.bible.com/verse-of-the-day', source: 'Bible App' }];
r = validateBrief(e);
check('two verses, each with its own source and link', r.ok && r.edition.verses?.length === 2 && r.edition.verses[1].source === 'Bible App' && r.warnings.length === 0);
delete e.verses[1].source;
r = validateBrief(e);
check('with several verses, a missing source warns', r.ok && r.warnings.some((w) => w.path === 'verses[1].source'));
check('the old stored shape still reads', briefVerses({ verse: { text: 't', reference: 'r', translation: 'KJV' } }).length === 1 && briefVerses({}).length === 0);
e = clone(); delete e.weather; delete e.verses; delete e.devotional; e.watchlist = []; e.top_signals = [];
check('optional sections may be left out', validateBrief(e).ok);
e = clone(); e.sectors[4].items = e.sectors[4].items.slice(0, 2);
r = validateBrief(e);
check('fewer than 3 items warns but publishes', r.ok && r.warnings.some((w) => w.path === 'sectors[4].items'));
e = clone(); e.watchlist = [e.watchlist[3], e.watchlist[0]];
r = validateBrief(e);
check('the watchlist is sorted soonest first', r.ok && r.edition.watchlist[0].when < r.edition.watchlist[1].when);

check('links: a clean list passes', Array.isArray(cleanBriefLinks([{ label: ' AP ', url: 'https://apnews.com' }])));
const lib = cleanBriefLinks([{ label: 'NWS Berthoud', url: 'https://forecast.weather.gov/', section: 'weather', note: '  Use the  point forecast. ' }, { label: 'AP', url: 'https://apnews.com', section: 'bogus' }]);
check('links: section and note are kept, cleaned; an unknown section is dropped', Array.isArray(lib) && lib[0].section === 'weather' && lib[0].note === 'Use the point forecast.' && !('section' in lib[1]) && !('note' in lib[1]));
check('links: a bad address is refused', typeof cleanBriefLinks([{ label: 'x', url: 'ftp://x' }]) === 'string');

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
if (failed) process.exit(1);
