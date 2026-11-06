/** No-framework self-test for the AI Library rules:  npx tsx components/admin/library/library-logic.selftest.ts */
import assert from 'node:assert/strict';
import { bodyPatch, createProblem, sameBody, filterLibrary, isValidSlug, saveProblem, stripSkillFrontmatter, suggestSlug, type LibraryItem } from './library-logic';
import { siteUrl } from '../kit/copy-link';

const mk = (o: Partial<LibraryItem>): LibraryItem => ({ slug: 'x', kind: 'prompt', name: 'X', createdAt: '', updatedAt: '', url: 'https://artifacts.mncoleman.com/library/x', ogImage: '', downloadUrls: {}, ...o });
const rows = [
    mk({ slug: 'weekly-review', kind: 'prompt', name: 'Weekly review', promptText: 'Walk through the week' }),
    mk({ slug: 'code-review', kind: 'skill', name: 'Code review', description: 'Reads a change and reports problems' }),
];
const f = (query: string, kind: 'all' | 'prompt' | 'skill' = 'all') => filterLibrary(rows, { query, kind }).map((r) => r.slug);
assert.deepEqual(f(''), ['weekly-review', 'code-review']);
assert.deepEqual(f('', 'skill'), ['code-review']);
assert.deepEqual(f('', 'prompt'), ['weekly-review']);
assert.deepEqual(f('review'), ['weekly-review', 'code-review']);
assert.deepEqual(f('walk'), ['weekly-review'], 'prompt text is searched');
assert.deepEqual(f('problems', 'prompt'), []);

assert.equal(stripSkillFrontmatter('---\nname: a\ndescription: b\n---\n\nBody here'), 'Body here');
assert.equal(stripSkillFrontmatter('No front matter'), 'No front matter');
assert.equal(suggestSlug('Weekly Review!'), 'weekly-review');
assert.equal(isValidSlug('ab'), false);
assert.equal(isValidSlug('abc'), true);
assert.equal(isValidSlug('-abc'), false);

const base = { kind: 'prompt' as const, name: 'N', slug: 'my-prompt', promptText: 'hi', description: '', taken: ['other'] };
assert.equal(createProblem(base), null);
assert.match(createProblem({ ...base, name: ' ' })!, /title/);
assert.match(createProblem({ ...base, slug: 'Bad Slug' })!, /address/);
assert.match(createProblem({ ...base, slug: 'other' })!, /already/);
assert.match(createProblem({ ...base, promptText: '' })!, /prompt/);
assert.match(createProblem({ ...base, kind: 'skill' })!, /description/);
assert.equal(createProblem({ ...base, kind: 'skill', description: 'd', promptText: '' }), null);
assert.equal(saveProblem('skill', ' '), 'Skills need a description.');
assert.equal(saveProblem('prompt', ''), null);
assert.equal(siteUrl(rows[0].url), rows[0].url, 'the service page is copied exactly');

// A realistic SKILL.md body: headings the rich editor would rewrite, a table, XML-ish tags, variables, a footnote.
const BODY = [
    '# Code review', '', 'Use when asked to review a change.', '', '##### Fine print', '',
    '| Check | Why |', '| --- | --- |', '| Tests | Catch regressions |', '',
    '<example>', '  Input: {{diff}}', '  Output: a short list', '</example>', '',
    '* mixed bullet', '- another bullet', '',
    'Report only real problems.[^1]', '', '[^1]: Smith, Jane. *Book*, https://example.com.',
].join('\n');
const served = `---\nname: code-review\ndescription: Reviews a change\n---\n\n${BODY}\n`; // the service adds one trailing newline
const loaded = stripSkillFrontmatter(served);
assert.equal(loaded, BODY + '\n', 'the loaded text is the body exactly as stored');
assert.equal(bodyPatch(loaded, loaded), undefined, 'untouched: nothing is sent');
assert.equal(bodyPatch(loaded, loaded.trimEnd()), undefined, 'a trailing newline alone is not a change');
assert.equal(bodyPatch(loaded, loaded + '\n\n'), undefined);
const edited = loaded.replace('Tests', 'Unit tests');
assert.equal(bodyPatch(loaded, edited), edited, 'an edit is sent byte for byte');
assert.ok(bodyPatch(loaded, edited)!.includes('##### Fine print') && bodyPatch(loaded, edited)!.includes('<example>') && bodyPatch(loaded, edited)!.includes('{{diff}}') && bodyPatch(loaded, edited)!.includes('[^1]: Smith'), 'headings, tags, variables and footnotes survive');
// after a save the server returns the trimmed body plus one newline: still equal to what was typed
assert.ok(sameBody(edited, edited.trimEnd() + '\n'));
assert.equal(sameBody('a', 'b'), false);
console.log('library-logic selftest ok');
