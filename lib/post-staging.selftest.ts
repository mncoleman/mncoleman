/** Run: npx tsx lib/post-staging.selftest.ts — staged publishing for posts (classification, blockers, the publish loop). */
import assert from 'node:assert/strict';
import { emptyPost, type PostDoc } from './post-format';
import { classifyDraft, includedInGlobalPublish, isPrivateDraft, postBlockers, publishPendingPosts, type ApiCall, type PendingPost } from './post-staging';

const doc = (over: Partial<PostDoc> = {}): PostDoc => ({ ...emptyPost(), title: 'Hello', slug: 'hello', date: '2026-11-01', content: 'Body', published: true, ...over });
const draftOf = (post: PostDoc, over: object = {}) => ({ post, version: 3, updatedAt: '2026-11-06T00:00:00Z', baseSha: 'sha1', ...over });

// classification
assert.equal(classifyDraft('hello', draftOf(doc()), { sha: 'sha1', doc: doc() }), null, 'identical draft is not a change');
assert.equal(classifyDraft('hello', draftOf(doc({ content: 'Body 2' })), { sha: 'sha1', doc: doc() })?.kind, 'edited');
const added = classifyDraft('new', draftOf(doc({ slug: 'new', published: false }), { baseSha: null }), null)!;
assert.deepEqual([added.kind, added.published, added.stale, added.problem], ['added', false, false, '']);
assert.equal(classifyDraft('hello', draftOf(doc({ content: 'x' }), { baseSha: 'old' }), { sha: 'sha1', doc: doc() })?.stale, true, 'file moved after the draft: stale');
assert.equal(classifyDraft('hello', draftOf(doc({ content: 'x' }), { baseSha: undefined }), { sha: 'sha1', doc: doc() })?.stale, false, 'no recorded base: not stale');
assert.equal(classifyDraft('t', draftOf(doc({ slug: 't', title: '' }), { baseSha: null }), null)?.problem, 'needs a title');
assert.equal(classifyDraft('hello', draftOf(doc()), { sha: 'sha1', invalid: 'bad yaml' })?.kind, 'edited', 'a file the parser rejects is still replaceable by a draft');
// Status counts as a change by itself.
assert.equal(classifyDraft('hello', draftOf(doc({ published: false })), { sha: 'sha1', doc: doc() })?.kind, 'edited');

// privacy rule: a never-committed Draft is private; committed or Published is included
assert.deepEqual([added.committed, includedInGlobalPublish(added), isPrivateDraft(added)], [false, false, true], 'never-committed Draft stays private');
const pubNew = classifyDraft('n2', draftOf(doc({ slug: 'n2', published: true }), { baseSha: null }), null)!;
assert.equal(includedInGlobalPublish(pubNew), true, 'a never-committed Published post is included');
const hiddenEdit = classifyDraft('hello', draftOf(doc({ published: false })), { sha: 'sha1', doc: doc() })!;
assert.equal(includedInGlobalPublish(hiddenEdit), true, 'an already committed post is included even when set to Draft');

// blockers
const p = (o: Partial<PendingPost>): PendingPost => ({ committed: true, slug: 's', title: 'T', published: true, kind: 'edited', version: 1, updatedAt: '', stale: false, problem: '', ...o });
assert.deepEqual(postBlockers([p({}), p({ title: '', slug: 'x', problem: 'needs a title' }), p({ stale: true })]), [
    'The post “x” needs a title. Open it to fix that.',
    'The post “T” was changed on the site after your draft was saved. Open it and choose which version to keep.',
]);

// publish loop with a fake Worker
void (async () => {
    const calls: string[] = [];
    const bodies: Record<string, any> = {};
    const state: Record<string, { sha: string | null; draft: any }> = {
        a: { sha: 'sa', draft: draftOf(doc({ slug: 'a', title: 'A', published: true }), { baseSha: 'sa', version: 4 }) },
        b: { sha: 'sb', draft: draftOf(doc({ slug: 'b', title: 'B', published: false }), { baseSha: 'sb', version: 1 }) },
        c: { sha: 'sc', draft: draftOf(doc({ slug: 'c', title: 'C' }), { baseSha: 'sc' }) },
        d: { sha: 'sd', draft: draftOf(doc({ slug: 'd', title: 'D' }), { baseSha: 'old' }) },
        f: { sha: null, draft: draftOf(doc({ slug: 'f', title: 'F', published: false }), { baseSha: null }) },
        g: { sha: null, draft: draftOf(doc({ slug: 'g', title: 'G', published: false }), { baseSha: null }) },
    };
    let n = 0;
    const call: ApiCall = async (path, init) => {
        calls.push(`${init?.method || 'GET'} ${path}`);
        const m = /^\/api\/posts\/([a-z]+)(\/publish)?$/.exec(path)!;
        const s = state[m[1]];
        if (!m[2]) return { status: 200, json: { post: null, sha: s.sha, draft: s.draft } };
        bodies[m[1]] = init?.body;
        if (m[1] === 'c') return { status: 409, json: { error: 'stale' } };
        return { status: 200, json: { ok: true, sha: 'new', commit: `commit${++n}` } };
    };
    const pending = [p({ slug: 'a', title: 'A' }), p({ slug: 'b', title: 'B', published: false }), p({ slug: 'c', title: 'C' }), p({ slug: 'd', title: 'D' }), p({ slug: 'e', title: 'E', problem: 'needs a title' }), p({ slug: 'f', title: 'F', kind: 'added', committed: false, published: false }), p({ slug: 'g', title: 'G', kind: 'added', committed: false, published: true })];
    const r = await publishPendingPosts(call, pending);
    assert.deepEqual(r.done, ['a', 'b'], 'a and b published; c failed, d stale, e blocked, none stopped the others');
    assert.ok(!calls.some((c) => c.includes('/f')), 'a private Draft is never fetched or committed');
    assert.ok(!calls.some((c) => c.includes('/g/publish')), 'a list entry whose fresh draft is now Draft and uncommitted is not committed');
    assert.equal(r.commit, 'commit2', 'the last commit is the one the site build waits for');
    assert.equal(bodies.a.post.published, true);
    assert.equal(bodies.b.post.published, false, 'an already committed post set to Draft is written but stays a Draft');
    assert.deepEqual([bodies.a.sha, bodies.a.draftVersion, bodies.b.sha], ['sa', 4, 'sb']);
    assert.deepEqual(r.errors.map((e) => e.slug), ['c', 'd', 'e']);
    assert.ok(!calls.some((c) => c.includes('/e')), 'a blocked post is never sent');
    console.log('post-staging selftest ok');
})();
