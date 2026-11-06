/**
 * Staged publishing for blog posts, shared by the Worker (which classifies drafts), the admin
 * store (which lists and publishes them) and the self-test. Pure: no fs, no React, no fetch of
 * its own (publishing takes the request function as a parameter).
 *
 * A post is an unpublished change when the autosaved draft in Worker KV (POST_DRAFTS) differs
 * from the committed `data/posts/<slug>.md`, or when there is a draft and no file at all.
 * "Removed" is not a staged kind for posts: deleting a post is its own confirmed, immediate action.
 *
 * PRIVACY RULE: the repo behind the site is public and drafts are not. Global Publish therefore
 * commits a pending post only when it already has a committed file or its Status is Published.
 * A never-committed Status=Draft post stays in KV and is committed only by that post's own
 * "Publish changes" button (an explicit action). See `includedInGlobalPublish`.
 */
import { coercePostDoc, samePost, type PostDoc } from './post-format';

export interface PendingPost {
    slug: string;
    /** The draft's title (what Publish would write), not the committed file's. */
    title: string;
    /** The draft's Status: false stays hidden on the site after Publish. */
    published: boolean;
    kind: 'added' | 'edited';
    /** A committed file exists for this slug (so the draft is already in the repo in some form). */
    committed: boolean;
    version: number;
    updatedAt: string;
    /** The committed file changed after this draft was saved, so publishing it would overwrite that change. */
    stale: boolean;
    /** Why the draft cannot be published as it is (no title yet), or empty. */
    problem: string;
}

export interface StoredDraftLike {
    post: PostDoc;
    version: number;
    updatedAt: string;
    baseSha?: string | null;
}

/** What the committed file looks like to the classifier. */
export type CommittedFile = { sha: string; doc: PostDoc } | { sha: string; invalid: string } | null;

/** A draft as a pending change, or null when it is identical to the committed file (nothing to publish). */
export function classifyDraft(slug: string, draft: StoredDraftLike, file: CommittedFile): PendingPost | null {
    const checked = coercePostDoc(draft.post);
    const problem = checked.ok ? '' : checked.error === 'title is required' ? 'needs a title' : checked.error;
    const base = { committed: !!file, slug, title: draft.post.title, published: draft.post.published === true, version: draft.version, updatedAt: draft.updatedAt, problem };
    if (!file) return { ...base, kind: 'added', stale: false };
    const stale = draft.baseSha !== undefined && (draft.baseSha ?? null) !== file.sha;
    if ('invalid' in file) return { ...base, kind: 'edited', stale };
    if (samePost(draft.post, file.doc)) return null;
    return { ...base, kind: 'edited', stale };
}

/** Whether global Publish may commit this post: it is already in the repo, or the writer set it to Published. */
export const includedInGlobalPublish = (p: Pick<PendingPost, 'committed' | 'published'>) => p.committed || p.published;

/** Private drafts: never committed and not Published. Listed, not counted, never committed by global Publish. */
export const isPrivateDraft = (p: Pick<PendingPost, 'committed' | 'published'>) => !includedInGlobalPublish(p);

/** Plain-language reasons the staged posts cannot all be published, one per post. */
export function postBlockers(pending: readonly PendingPost[]): string[] {
    const out: string[] = [];
    for (const p of pending) {
        const name = `“${p.title.trim() || p.slug}”`;
        if (p.problem) out.push(`The post ${name} ${p.problem}. Open it to fix that.`);
        else if (p.stale) out.push(`The post ${name} was changed on the site after your draft was saved. Open it and choose which version to keep.`);
    }
    return out;
}

export type ApiCall = (path: string, init?: { method?: string; body?: unknown }) => Promise<{ status: number; json: any }>;

export interface PostPublishResult {
    /** Slugs now on the site as saved (Draft ones stay hidden). */
    done: string[];
    /** Last commit made, which is the one the site build waits for. */
    commit?: string;
    errors: { slug: string; title: string; message: string }[];
}

/**
 * Publishes each pending post through the same routes the editor's own button uses, one at a
 * time, with the Status the writer set (a Draft is written but stays hidden). A post that fails
 * does not stop the others. The draft is re-read first, so what is written is the latest autosave.
 */
export async function publishPendingPosts(call: ApiCall, pending: readonly PendingPost[]): Promise<PostPublishResult> {
    const result: PostPublishResult = { done: [], errors: [] };
    for (const p of pending) {
        const fail = (message: string) => result.errors.push({ slug: p.slug, title: p.title || p.slug, message });
        try {
            if (isPrivateDraft(p)) continue; // explicit action only: never committed by global Publish
            if (p.problem || p.stale) { fail(p.problem ? p.problem : 'was changed on the site after its draft was saved'); continue; }
            const cur = await call(`/api/posts/${p.slug}`);
            if (cur.status !== 200) { fail(cur.json?.message || cur.json?.error || `could not be read (${cur.status})`); continue; }
            const draft = cur.json?.draft as StoredDraftLike | null;
            if (!draft) continue; // published or discarded somewhere else in the meantime
            const sha: string | null = cur.json?.sha ?? null;
            // Re-checked on the fresh draft: Status may have changed to Draft since the list was read.
            if (!sha && draft.post.published !== true) continue;
            if (draft.baseSha !== undefined && (draft.baseSha ?? null) !== sha) { fail('was changed on the site after its draft was saved'); continue; }
            const res = await call(`/api/posts/${p.slug}/publish`, { method: 'POST', body: { post: draft.post, sha, draftVersion: draft.version } });
            if (res.status === 200 && res.json?.ok) {
                // `draftKept` (a newer draft saved meanwhile) is a normal result: it simply stays pending.
                result.done.push(p.slug);
                result.commit = res.json.commit || result.commit;
            } else if (res.status === 409 && res.json?.error === 'slug_taken') fail('uses a web address another post already has');
            else if (res.status === 409) fail('was changed on the site while publishing');
            else fail(res.json?.message || res.json?.error || `failed (${res.status})`);
        } catch {
            fail('could not be reached');
        }
    }
    return result;
}
