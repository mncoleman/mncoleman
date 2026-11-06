/** No-framework self-test for the staged collection logic:  npx tsx components/admin/content-logic.selftest.ts */
import assert from 'node:assert/strict';
import {
    EMPTY, blankItem, bodyEditorKey, createItem, diff, isEmptyNew, loadedState, normalizeItem, problems, pruneEmptyNew, removeItem, revertChange, toMonthStart, updateItem,
    type CollectionState, type Item,
} from './content-logic';

const raw = (id: string, name: string, extra: Record<string, unknown> = {}) => ({ id, name, description: '', url: '', tags: {}, published: true, content: 'body ' + id, ...extra });
const loaded = (): Item[] => [normalizeItem('projects', raw('verses', 'Verses')), normalizeItem('projects', raw('globe', 'Globe', { tech: ['web'] }))];
const ready = (): CollectionState => loadedState(EMPTY, loaded(), 'sha1');

// load: normalises legacy tags, no changes staged, revision starts moving
let s = ready();
assert.equal(s.status, 'ready');
assert.deepEqual(s.items[1].tags, { Tech: ['web'] }, 'legacy tech folds into the default key');
assert.deepEqual(diff(s.base, s.items), []);
assert.equal(s.revision, 1);

// create: a new record is staged as "added", in front, with no slug yet
s = createItem(s, blankItem('projects', 'new-a'));
assert.equal(s.items[0]._k, 'new-a');
assert.equal(diff(s.base, s.items)[0].kind, 'added');
assert.deepEqual(problems('projects', s.items), ['A project has no name.'], 'an unnamed new record blocks publishing');

// typing: rename moves the slug (id follows slugify(name)), is an edit, and never bumps the revision
const rev = s.revision;
s = updateItem(s, 'new-a', { name: 'My New Thing' });
assert.equal(s.items[0].id, 'my-new-thing');
assert.equal(s.revision, rev, 'typing does not remount the editor');
s = updateItem(s, 'verses', { name: 'Verses 2' });
const ch = diff(s.base, s.items);
assert.deepEqual(ch.map((c) => `${c.kind}:${c.item._k}`).sort(), ['added:new-a', 'edited:verses']);
assert.equal(s.items.find((i) => i._k === 'verses')!.id, 'verses-2', 'rename moves the page address');
// two records on one address are a blocker
s = updateItem(s, 'globe', { name: 'Verses 2' });
assert.ok(problems('projects', s.items).some((p) => p.includes('/projects/verses-2/')));
s = updateItem(s, 'globe', { name: 'Globe' });

// discard an edit: back to the loaded copy (incl. body and slug) and the body editor is told to remount
const before = s.revision;
const edited = diff(s.base, s.items).find((c) => c.kind === 'edited')!;
s = updateItem(s, 'verses', { content: 'typed after' });
s = revertChange(s, edited);
assert.equal(s.items.find((i) => i._k === 'verses')!.name, 'Verses');
assert.equal(s.items.find((i) => i._k === 'verses')!.content, 'body verses');
assert.equal(s.items.find((i) => i._k === 'verses')!.id, 'verses');
assert.equal(s.revision, before + 1, 'discard bumps the revision');
assert.notEqual(bodyEditorKey(before, 'verses'), bodyEditorKey(s.revision, 'verses'), 'so the body editor remounts');
assert.equal(bodyEditorKey(3, 'x'), bodyEditorKey(3, 'x'), 'and stays mounted otherwise');

// discard an added record: gone
s = revertChange(s, diff(s.base, s.items).find((c) => c.kind === 'added')!);
assert.equal(s.items.some((i) => i._k === 'new-a'), false);
assert.deepEqual(diff(s.base, s.items), []);

// remove then undo the removal: back at its old position
s = removeItem(s, 'verses');
const removed = diff(s.base, s.items);
assert.equal(removed[0].kind, 'removed');
s = revertChange(s, removed[0]);
assert.equal(s.items[0]._k, 'verses');

// load while a record was being created: first load keeps it, a deliberate reload drops it (its button says so)
let early: CollectionState = createItem({ ...EMPTY, status: 'loading' }, blankItem('projects', 'new-early'));
early = loadedState(early, loaded(), 'sha1');
assert.equal(early.items[0]._k, 'new-early', 'a record created before the first load finishes survives it');
assert.equal(early.items.length, 3);
const reloaded = loadedState(early, loaded(), 'sha2');
assert.equal(reloaded.items.some((i) => i._k === 'new-early'), false, 'reload drops unpublished edits');
assert.ok(reloaded.revision > early.revision, 'and remounts the editor');

// untouched new records are pruned; touched ones and saved ones are not
let p = createItem(ready(), blankItem('resources', 'new-empty'));
p = createItem(p, { ...blankItem('resources', 'new-typed'), name: 'x' });
assert.equal(isEmptyNew(p.items[1]), true);
assert.equal(isEmptyNew(p.items[0]), false);
p = pruneEmptyNew(p);
assert.deepEqual(p.items.map((i) => i._k), ['new-typed', 'verses', 'globe']);
assert.equal(pruneEmptyNew(p), p, 'nothing to prune: same state back');
assert.equal(isEmptyNew({ ...blankItem('projects', 'verses') }), false, 'a saved record is never "empty new"');

// stored date format: month only, first of the month
assert.equal(toMonthStart('2026-03-15'), '2026-03-01');
assert.equal(toMonthStart('2026-03'), '2026-03-01');
assert.equal(toMonthStart('2026'), '2026-01-01');
assert.equal(toMonthStart('2026-03-01'), '2026-03-01');
assert.equal(toMonthStart(''), '');
assert.equal(toMonthStart('soon'), '');
assert.equal(toMonthStart('2026-13-01'), '');

console.log('content-logic selftest ok');
