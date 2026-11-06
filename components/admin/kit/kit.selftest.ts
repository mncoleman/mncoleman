/** No-framework self-test for the admin kit's pure logic:  npx tsx components/admin/kit/kit.selftest.ts */
import assert from 'node:assert/strict';
import { filterRows, footerText, matchesQuery, matchesStatus, moveIndex } from './list-logic';
import { copyLinkMessage, entryPath, siteUrl } from './copy-link';
import { DRAWER_WIDE, escapeClosesDrawer, initialDrawerOpen, isModalWidth, isOverlay, shouldPersist } from './drawer-state';
import { notify, subscribeToasts } from './toast';
import { leavesPage } from './use-unsaved-guard';

// search: every word must appear somewhere, any case, any field
assert.equal(matchesQuery(['Verses', 'a Bible app', undefined], ''), true);
assert.equal(matchesQuery(['Verses', 'a Bible app'], 'bible verses'), true);
assert.equal(matchesQuery(['Verses', 'a Bible app'], 'bible music'), false);
assert.equal(matchesQuery([null, undefined], 'x'), false);
assert.equal(matchesQuery(['Hello'], '   '), true);

// status
assert.equal(matchesStatus(true, 'all'), true);
assert.equal(matchesStatus(false, 'published'), false);
assert.equal(matchesStatus(false, 'draft'), true);
assert.equal(matchesStatus(true, 'draft'), false);

const rows = [
    { n: 'Verses', t: ['web'], p: true },
    { n: 'Chords', t: ['music'], p: false },
    { n: 'Globe', t: ['web', '3d'], p: true },
];
const f = (query: string, status: 'all' | 'published' | 'draft', tag?: string) =>
    filterRows(rows, { query, status, fields: (r) => [r.n, ...r.t], published: (r) => r.p, extra: tag ? (r) => r.t.includes(tag) : undefined }).map((r) => r.n);
assert.deepEqual(f('', 'all'), ['Verses', 'Chords', 'Globe']);
assert.deepEqual(f('', 'draft'), ['Chords']);
assert.deepEqual(f('web', 'published'), ['Verses', 'Globe']);
assert.deepEqual(f('', 'all', '3d'), ['Globe']);
assert.deepEqual(f('glo', 'draft'), []);

// keyboard movement: never wraps, starts at the right end
assert.equal(moveIndex(-1, 1, 5), 0);
assert.equal(moveIndex(-1, -1, 5), 4);
assert.equal(moveIndex(0, -1, 5), 0);
assert.equal(moveIndex(4, 1, 5), 4);
assert.equal(moveIndex(2, 1, 5), 3);
assert.equal(moveIndex(0, 1, 0), -1);

assert.equal(footerText(3, 12), 'Showing 3 of 12');
assert.equal(footerText(3, 12, 40), 'Showing 3 of 40');
assert.equal(footerText(12, 12), 'Showing 12 of 12');

// copy link
assert.equal(siteUrl('/blog/my-post'), 'https://mncoleman.com/blog/my-post/');
assert.equal(siteUrl('projects/x/'), 'https://mncoleman.com/projects/x/');
assert.equal(siteUrl('https://artifacts.mncoleman.com/a/x'), 'https://artifacts.mncoleman.com/a/x', 'an absolute address is copied as given');
assert.equal(siteUrl('https://mncoleman.com/artifacts/a.html'), 'https://mncoleman.com/artifacts/a.html', 'no trailing slash added to a file');
assert.equal(siteUrl(''), 'https://mncoleman.com/');
assert.equal(entryPath('blog', 'hello-world'), '/blog/hello-world/');
assert.equal(entryPath('/projects/', 'a b'), '/projects/a%20b/');
assert.equal(siteUrl(entryPath('resources', 'musical-toys')), 'https://mncoleman.com/resources/musical-toys/');
assert.equal(copyLinkMessage({ live: true }), 'Link copied');
assert.equal(copyLinkMessage({ live: false }), 'Link copied. It isn’t live yet.');
assert.equal(copyLinkMessage({ live: true, passwordProtected: true }), 'Link copied. It asks for a password.');
assert.equal(copyLinkMessage({ live: false, passwordProtected: true }), 'Link copied. It asks for a password.');

// drawer state
assert.equal(initialDrawerOpen(1440, null), true, 'wide + nothing stored: open');
assert.equal(initialDrawerOpen(1440, '0'), false);
assert.equal(initialDrawerOpen(1440, '1'), true);
assert.equal(initialDrawerOpen(DRAWER_WIDE - 1, '1'), false, 'below 1100 it starts closed whatever was stored');
assert.equal(shouldPersist(1440), true);
assert.equal(shouldPersist(800), false);
assert.equal(isOverlay(1099), true);
assert.equal(isOverlay(1100), false);
assert.equal(isModalWidth(767), true);
assert.equal(isModalWidth(768), false);
const esc = (o: Partial<Parameters<typeof escapeClosesDrawer>[0]>) => escapeClosesDrawer({ width: 900, open: true, modal: false, focusInside: true, defaultPrevented: false, ...o });
assert.equal(esc({}), true);
assert.equal(esc({ width: 1400 }), false, 'a side column does not close on Esc');
assert.equal(esc({ defaultPrevented: true }), false, 'a popover that already took Esc keeps it');
assert.equal(esc({ focusInside: false }), false);
assert.equal(esc({ focusInside: false, modal: true, width: 390 }), true);
assert.equal(esc({ open: false }), false);

// toast store
const seen: string[] = [];
const off = subscribeToasts((m) => seen.push(m));
notify('one');
off();
notify('two');
assert.deepEqual(seen, ['one']);

// unsaved-changes guard: only a plain click on an in-app link to a different page counts as leaving
const here = { origin: 'http://x.test', pathname: '/admin/library/edit/', search: '?slug=a' };
const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
assert.equal(leavesPage({ href: '/admin/library/' }, click, here), true);
assert.equal(leavesPage({ href: '/admin/library/edit/?slug=b' }, click, here), true);
assert.equal(leavesPage({ href: '/admin/library/edit/?slug=a' }, click, here), false, 'same page');
assert.equal(leavesPage({ href: 'https://other.test/x' }, click, here), false, 'another site opens in the browser, which has its own prompt');
assert.equal(leavesPage({ href: '/admin/' , target: '_blank' }, click, here), false);
assert.equal(leavesPage({ href: '/admin/' }, { ...click, metaKey: true }, here), false);

console.log('kit selftest ok');
