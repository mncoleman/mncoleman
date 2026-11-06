/**
 * Self-test for the post file format and the read path. No framework, no network:
 *   npx tsx scripts/test-posts.ts
 */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { coercePostDoc, nextSlug, parsePost, PostFormatError, samePost, serializePost, slugFromTitle, sortPosts, splitFrontMatter, type PostDoc } from '../lib/post-format';

const base: PostDoc = {
    title: 'He said: "hello" — and left',
    slug: 'he-said-hello',
    date: '2026-03-04',
    tags: ['AI', 'Dev, Ops', 'with "quotes"'],
    published: true,
    featured: true,
    excerpt: 'Line one\nline two: with colon # and hash',
    author: 'Matthew Coleman',
    ogImage: '/blog/x.png',
    content: '## Heading\n\nBody with ---\n\n---\n\nand `code`, **bold**.\n\n- a\n- b',
};

// Round trip (excerpt newlines fold to a space by design).
{
    const back = parsePost(serializePost(base));
    assert.deepEqual(back, { ...base, excerpt: 'Line one line two: with colon # and hash' });
    assert.equal(serializePost(back), serializePost(parsePost(serializePost(back))), 'serialize is stable');
}

// Empty tags, no ogImage, empty body.
{
    const d: PostDoc = { ...base, tags: [], ogImage: undefined, content: '' };
    const back = parsePost(serializePost(d));
    assert.deepEqual(back.tags, []);
    assert.equal(back.ogImage, undefined);
    assert.equal(back.content, '');
}

// Hand-edited files still load: bare scalars, single quotes, block lists, CRLF, no slug.
{
    const raw = "---\r\ntitle: 'It''s fine'\r\ndate: 2025-01-02\r\ntags:\r\n  - one\r\n  - two\r\npublished: true\r\n---\r\n\r\nHi\r\n";
    const d = parsePost(raw, 'from-filename');
    assert.equal(d.title, "It's fine");
    assert.equal(d.slug, 'from-filename');
    assert.equal(d.date, '2025-01-02');
    assert.deepEqual(d.tags, ['one', 'two']);
    assert.equal(d.published, true);
    assert.equal(d.featured, false);
    assert.equal(d.content, 'Hi');
    assert.deepEqual(splitFrontMatter('no front matter').meta, {});
}

// Validation.
{
    assert.equal(coercePostDoc({ ...base, slug: 'Bad Slug' }).ok, false);
    assert.equal(coercePostDoc({ ...base, title: '  ' }).ok, false);
    assert.equal(coercePostDoc({ ...base, title: '' }, { allowEmptyTitle: true }).ok, true);
    assert.equal(slugFromTitle('  Café: Hello, World!  '), 'cafe-hello-world');
}

// Strict parsing: each of these must throw, naming the file.
{
    const ok = "---\ntitle: \"T\"\nslug: t\ndate: 2026-01-01\ntags: []\npublished: true\nfeatured: false\nexcerpt: \"\"\nauthor: \"A\"\n---\n\nbody\n";
    assert.equal(parsePost(ok, 't', 'data/posts/t.md').title, 'T');
    const bad: [string, string, RegExp][] = [
        ['unclosed double quote', ok.replace('title: "T"', 'title: "T'), /unclosed|invalid quoted/],
        ['unclosed single quote', ok.replace('title: "T"', "title: 'T"), /unclosed quote/],
        ['unclosed list', ok.replace('tags: []', 'tags: ["a", "b"'), /unclosed list|invalid/],
        ['front matter never closed', ok.replace('\n---\n\nbody\n', '\n\nbody\n'), /never closed/],
        ['published: yes', ok.replace('published: true', 'published: yes'), /published.*exactly true or false/],
        ['published: True', ok.replace('published: true', 'published: True'), /published.*exactly true or false/],
        ['featured: 1', ok.replace('featured: false', 'featured: 1'), /featured.*exactly true or false/],
        ['missing title', ok.replace('title: "T"\n', ''), /missing `title`/],
        ['empty title', ok.replace('title: "T"', 'title: ""'), /missing `title`/],
        ['no front matter at all', 'just a body', /missing `title`/],
        ['bad slug', ok.replace('slug: t', 'slug: Bad Slug'), /invalid slug/],
    ];
    for (const [name, raw, re] of bad) {
        assert.throws(() => parsePost(raw, 't', 'data/posts/t.md'), (e: unknown) => e instanceof PostFormatError && re.test(e.message) && e.message.startsWith('data/posts/t.md:'), name);
    }
}

// q() folds every line-break kind (CR, LF, U+2028/2029) so a one-line scalar stays one line.
{
    const d: PostDoc = { ...base, title: 'a\rb\nc\u2028d\u2029e\r\nf', excerpt: 'x\ry' };
    const back = parsePost(serializePost(d), d.slug);
    assert.equal(back.title, 'a b c d e f');
    assert.equal(back.excerpt, 'x y');
}

// Slug helpers.
{
    assert.equal(nextSlug('my-post'), 'my-post-2');
    assert.equal(nextSlug('my-post-2'), 'my-post-3');
    assert.equal(slugFromTitle('a'.repeat(79) + ' b-c'), 'a'.repeat(79), 'cut at 80 leaves no trailing hyphen');
    assert.equal(samePost(base, { ...base }), true);
    assert.equal(samePost(base, { ...base, tags: ['x'] }), false);
}

// Sort: featured first, then newest first.
{
    const sorted = sortPosts([
        { slug: 'old', featured: false, date: '2024-01-01' },
        { slug: 'new', featured: false, date: '2026-01-01' },
        { slug: 'feat-old', featured: true, date: '2023-01-01' },
        { slug: 'feat-new', featured: true, date: '2025-01-01' },
    ]).map((p) => p.slug);
    assert.deepEqual(sorted, ['feat-new', 'feat-old', 'new', 'old']);
}

// Read path: published filter, sort, missing and empty directory.
async function readPath() {
    const dir = mkdtempSync(join(tmpdir(), 'posts-test-'));
    const prev = process.cwd();
    try {
        process.chdir(dir);
        delete process.env.CI; delete process.env.CF_PAGES;
        (process.env as Record<string, string>).NODE_ENV = 'test';
        const { getPublishedPosts, getPostBySlug, getPublishedPostsWithContent } = await import('../lib/posts');
        assert.deepEqual(await getPublishedPosts(), [], 'missing data/posts is not an error');
        // A production build must refuse to publish an empty blog by accident.
        (process.env as Record<string, string>).NODE_ENV = 'production';
        await assert.rejects(getPublishedPosts(), /data\/posts\/ is missing.*import-notion-posts\.ts --write/);
        (process.env as Record<string, string>).NODE_ENV = 'test';
        mkdirSync(join(dir, 'data', 'posts'), { recursive: true });
        (process.env as Record<string, string>).NODE_ENV = 'production';
        assert.deepEqual(await getPublishedPosts(), [], 'an existing but empty data/posts is a blog with no posts');
        (process.env as Record<string, string>).NODE_ENV = 'test';
        const put = (d: Partial<PostDoc> & { slug: string }) =>
            writeFileSync(join(dir, 'data', 'posts', `${d.slug}.md`), serializePost({ ...base, ogImage: undefined, ...d }));
        put({ slug: 'a-old', date: '2024-01-01', featured: false, content: 'one two three' });
        put({ slug: 'b-new', date: '2026-01-01', featured: false });
        put({ slug: 'c-feat', date: '2023-01-01', featured: true });
        put({ slug: 'd-draft', date: '2027-01-01', published: false });
        writeFileSync(join(dir, 'data', 'posts', 'ignore.txt'), 'x');
        const list = await getPublishedPosts();
        assert.deepEqual(list.map((p) => p.slug), ['c-feat', 'b-new', 'a-old']);
        assert.equal(list[0].content, undefined, 'list rows carry no body');
        assert.equal(await getPostBySlug('d-draft'), null, 'drafts are not served');
        const one = await getPostBySlug('a-old');
        assert.equal(one?.content, 'one two three');
        assert.equal(one?.readingTime, 1);
        assert.equal(one?.wordCount, 3);
        assert.equal((await getPublishedPostsWithContent()).length, 3);
        // A broken file fails the read and names itself.
        writeFileSync(join(dir, 'data', 'posts', 'broken.md'), '---\ntitle: "oops\npublished: true\n---\nx');
        await assert.rejects(getPublishedPosts(), /data\/posts\/broken\.md/);
        rmSync(join(dir, 'data', 'posts', 'broken.md'));
        writeFileSync(join(dir, 'data', 'posts', 'mismatch.md'), serializePost({ ...base, slug: 'other' }));
        await assert.rejects(getPublishedPosts(), /mismatch\.md.*does not match the filename/);
    } finally {
        process.chdir(prev);
        rmSync(dir, { recursive: true, force: true });
    }
}

readPath().then(() => console.log('posts self-test: all passed'), (e) => { console.error(e); process.exit(1); });
