/** No-framework self-test for the Users rules:  npx tsx components/admin/users/user-logic.selftest.ts */
import assert from 'node:assert/strict';
import { rowSubtitle, accessChanged, accessOf, accessSummary, canRemove, displayName, filterUsers, normalizeRole, sortUsers, toggleIn, type ManagedUser } from './user-logic';

const u = (o: Partial<ManagedUser>): ManagedUser => ({ id: 'x', username: '', method: 'email', email: null, sub: null, firstName: null, status: 'active', role: 'editor', features: [], artifactGrants: [], invitedAt: '2026-01-01T00:00:00Z', claimedAt: null, ...o });
const rows = [
    u({ id: 'owner', role: 'super_admin', firstName: 'Matthew', username: 'mnc', method: 'telegram', claimedAt: '' }),
    u({ id: 'a', role: 'site_admin', firstName: 'David', email: 'david@example.com', claimedAt: '2026-03-01T00:00:00Z' }),
    u({ id: 'b', role: 'editor', email: 'sarah@example.com', status: 'invited' }),
    u({ id: 'c', role: 'admin' as never, email: 'legacy@example.com', claimedAt: '2026-02-01T00:00:00Z' }),
];
const ids = (r: ManagedUser[]) => r.map((x) => x.id);
assert.equal(normalizeRole('admin'), 'site_admin', 'legacy admin is a Site admin');
assert.equal(normalizeRole('super_admin'), 'super_admin');
assert.deepEqual(ids(filterUsers(rows, { query: '', role: 'site_admin', status: 'all' })), ['a', 'c']);
assert.deepEqual(ids(filterUsers(rows, { query: '', role: 'all', status: 'invited' })), ['b']);
assert.deepEqual(ids(filterUsers(rows, { query: 'sarah', role: 'all', status: 'all' })), ['b']);
assert.deepEqual(ids(filterUsers(rows, { query: '@mnc', role: 'all', status: 'all' })), ['owner'], 'a leading @ is ignored');
assert.deepEqual(ids(filterUsers(rows, { query: 'mnc', role: 'all', status: 'all' })), ['owner']);
assert.deepEqual(ids(filterUsers(rows, { query: 'owner', role: 'all', status: 'all' })), ['owner'], 'role name is searchable');
assert.deepEqual(ids(sortUsers(rows)), ['owner', 'a', 'c', 'b']);
assert.equal(displayName(rows[2]), 'sarah@example.com');
assert.equal(displayName(rows[0]), 'Matthew');
assert.deepEqual(toggleIn(['a'], 'b'), ['a', 'b']);
assert.deepEqual(toggleIn(['a', 'b'], 'a'), ['b']);

const saved = accessOf(u({ role: 'editor', features: ['content', 'library'], artifactGrants: ['x'] }));
assert.equal(accessChanged(saved, { ...saved, features: ['library', 'content'] }), false, 'order does not matter');
assert.equal(accessChanged(saved, { ...saved, features: ['content'] }), true);
assert.equal(accessChanged(saved, { ...saved, artifactGrants: [] }), true);
assert.equal(accessChanged(saved, { ...saved, role: 'site_admin' }), true);
const admin = accessOf(u({ role: 'site_admin' }));
assert.equal(accessChanged(admin, { ...admin, features: ['content'] }), false, 'a site admin has everything: lists are ignored');

assert.equal(accessSummary(u({ role: 'super_admin' })), 'Owner');
assert.equal(accessSummary(u({ role: 'editor' })), 'Editor · no access yet');
assert.equal(accessSummary(u({ role: 'editor', features: ['library'], artifactGrants: ['trip'] }), () => 'Trip'), 'Editor · AI Library · Edits: Trip');
assert.equal(accessSummary(u({ role: 'editor', features: ['artifacts'], artifactGrants: ['trip'] })), 'Editor · Artifacts', 'grants are moot with the Artifacts feature');

assert.equal(canRemove(rows[0], 'me'), false, 'the owner cannot be removed');
assert.equal(canRemove(rows[1], 'a'), false, 'nor yourself');
assert.equal(canRemove(rows[1], 'me'), true);
assert.equal(rowSubtitle(rows[0]), '@mnc', 'owner: handle only');
assert.equal(rowSubtitle(u({ firstName: 'Alex', username: 'alexr', method: 'telegram', email: 'alex@example.com', features: ['library'] })), '@alexr · Editor · AI Library · Google: alex@example.com');
assert.equal(rowSubtitle(u({ email: 'sarah@example.com', features: ['content'] })), 'Editor · Posts, projects and resources', 'an email-only person is already named by the address');
console.log('user-logic selftest ok');
