/** No-framework self-test:  npx tsx lib/post-editor-logic.selftest.ts */
import assert from 'node:assert/strict';
import {
    addDays, addMonths, authorOptions, cleanTypedSlug, formatLongDate, headingHint, monthGrid, parseTypedDate, slugAfterTitleChange, tagChoices, toIso,
} from './post-editor-logic';

// dates
assert.equal(toIso(2026, 10, 4), '2026-11-04');
assert.equal(toIso(2026, 1, 30), null, 'Feb 30 is not a day');
assert.equal(toIso(2024, 1, 29), '2024-02-29');
assert.equal(toIso(2025, 1, 29), null);
assert.equal(formatLongDate('2026-11-04'), 'November 4, 2026');
assert.equal(formatLongDate('2026-11-04T09:30:00Z'), 'November 4, 2026', 'datetimes show their date');
assert.equal(formatLongDate(''), '');
assert.equal(parseTypedDate('2026-11-04'), '2026-11-04');
assert.equal(parseTypedDate('2026-1-4'), '2026-01-04');
assert.equal(parseTypedDate('11/4/2026'), '2026-11-04');
assert.equal(parseTypedDate('Nov 4, 2026'), '2026-11-04');
assert.equal(parseTypedDate('november 4 2026'), '2026-11-04');
assert.equal(parseTypedDate('4 Nov 2026'), '2026-11-04');
assert.equal(parseTypedDate('2026-13-01'), null);
assert.equal(parseTypedDate('soon'), null);
assert.equal(parseTypedDate(''), null);
assert.equal(addDays('2026-12-31', 1), '2027-01-01');
assert.equal(addDays('2026-03-01', -1), '2026-02-28');
assert.equal(addMonths('2026-01-31', 1), '2026-02-28', 'day clamps to the shorter month');
assert.equal(addMonths('2026-01-15', -2), '2025-11-15');
const grid = monthGrid(2026, 10); // November 2026 starts on a Sunday
assert.equal(grid.length, 42);
assert.equal(grid[0].iso, '2026-11-01');
assert.equal(grid[0].inMonth, true);
assert.equal(grid[30].iso, '2026-12-01');
assert.equal(grid[30].inMonth, false);
assert.equal(monthGrid(2026, 0)[0].iso, '2025-12-28', 'January 2026 starts on a Thursday');

// slug follows the title until edited or published
assert.equal(slugAfterTitleChange({ title: 'The Light of the Body', slug: '', touched: false, locked: false }), 'the-light-of-the-body');
assert.equal(slugAfterTitleChange({ title: 'New title', slug: 'my-own', touched: true, locked: false }), 'my-own');
assert.equal(slugAfterTitleChange({ title: 'New title', slug: 'live-post', touched: false, locked: true }), 'live-post');
assert.equal(cleanTypedSlug('  Hello,  World!! '), 'hello-world-');
assert.equal(cleanTypedSlug('--a__b'), 'a-b');

// author list
const users = [{ name: 'Matthew Coleman', role: 'super_admin' }, { name: 'Dana Whitfield', role: 'editor' }, { name: 'matthew coleman', role: 'editor' }];
assert.deepEqual(authorOptions(users, 'Dana Whitfield').map((u) => u.name), ['Matthew Coleman', 'Dana Whitfield'], 'duplicates fold, current author present');
const withAnon = authorOptions(users, 'Anonymous');
assert.equal(withAnon[0].name, 'Anonymous');
assert.equal(withAnon[0].external, true);
assert.equal(withAnon.length, 3);
assert.equal(authorOptions(users, 'matthew coleman').length, 2, 'case-insensitive match is not external');
assert.deepEqual(authorOptions([], '').length, 0);
assert.equal(authorOptions([], 'Matthew Coleman')[0].external, true, 'still selectable when the list failed to load');

// tags
assert.deepEqual(tagChoices('', ['A', 'B'], ['A']), [{ tag: 'B' }]);
assert.deepEqual(tagChoices('fa', ['Faith', 'Family'], []), [{ tag: 'Faith' }, { tag: 'Family' }, { tag: 'fa', create: true }]);
assert.deepEqual(tagChoices('faith', ['Faith'], []), [{ tag: 'Faith' }], 'exact match (any case) offers no create row');
assert.deepEqual(tagChoices('Faith', ['Faith'], ['Faith']), [], 'already chosen: nothing to add');

// heading placeholders: h2/h3/h4 -> 1/2/3, a stray h1 is never 'Heading 0'
assert.deepEqual([2, 3, 4].map(headingHint), ['Heading 1', 'Heading 2', 'Heading 3']);
assert.equal(headingHint(1), 'Heading 1');
assert.equal(headingHint(undefined), 'Heading 1');

console.log('post-editor-logic selftest ok');
