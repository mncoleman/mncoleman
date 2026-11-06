/** No-framework self-test for the artifact list rules:  npx tsx components/admin/artifacts/artifact-logic.selftest.ts */
import assert from 'node:assert/strict';
import { copyTarget, detailHref, editModeHref, filterArtifacts, relativeTime, type ArtifactRow } from './artifact-logic';
import { siteUrl, copyLinkMessage } from '../kit/copy-link';

const base = { size: 1, uploadedAt: '2026-01-01T00:00:00Z' };
const rows: ArtifactRow[] = [
    { ...base, id: '1', name: 'Budget', filename: 'budget.html', type: 'text/html', source: 'static', visibility: 'public', description: 'Q4 numbers' },
    { ...base, id: '2', name: 'Trip', filename: 'trip.html', type: 'text/html', source: 'dynamic', slug: 'family-trip', visibility: 'private' },
    { ...base, id: '3', name: 'Chart', filename: 'chart.pdf', type: 'application/pdf', source: 'dynamic', slug: 'chart', visibility: 'public' },
];
const f = (query = '', type: 'all' | 'dynamic' | 'static' = 'all', visibility: 'all' | 'public' | 'private' = 'all') => filterArtifacts(rows, { query, type, visibility }).map((r) => r.id);
assert.deepEqual(f(), ['1', '2', '3']);
assert.deepEqual(f('family'), ['2'], 'search matches the slug');
assert.deepEqual(f('q4'), ['1'], 'and the description');
assert.deepEqual(f('', 'dynamic'), ['2', '3']);
assert.deepEqual(f('', 'static'), ['1']);
assert.deepEqual(f('', 'all', 'private'), ['2']);
assert.deepEqual(f('', 'dynamic', 'public'), ['3']);
assert.deepEqual(f('nothing'), []);

assert.equal(detailHref(rows[1]), '/admin/artifacts/edit?slug=family-trip');
assert.equal(detailHref(rows[0]), '/admin/artifacts/edit?file=budget.html');
assert.equal(editModeHref(rows[1]), '/admin/artifacts/edit?slug=family-trip&mode=edit');
assert.equal(editModeHref(rows[2]), null, 'edit mode is for HTML only');
assert.equal(editModeHref(rows[0]), null, 'and never for static');

const inst = copyTarget(rows[2]);
assert.equal(siteUrl(inst.path), 'https://artifacts.mncoleman.com/a/chart');
assert.equal(copyLinkMessage(inst.state), 'Link copied');
const priv = copyTarget(rows[1]);
assert.equal(siteUrl(priv.path), 'https://artifacts.mncoleman.com/a/family-trip');
assert.equal(copyLinkMessage(priv.state), 'Link copied. It asks for a password.');
assert.equal(siteUrl(copyTarget(rows[0]).path), 'https://mncoleman.com/artifacts/budget.html');

const now = Date.parse('2026-06-10T12:00:00Z');
assert.equal(relativeTime('2026-06-10T11:59:30Z', now), 'Just now');
assert.equal(relativeTime('2026-06-10T11:30:00Z', now), '30m ago');
assert.equal(relativeTime('2026-06-10T07:00:00Z', now), '5h ago');
assert.equal(relativeTime('2026-06-08T12:00:00Z', now), '2d ago');
assert.equal(relativeTime('nope', now), '');
console.log('artifact-logic selftest ok');
