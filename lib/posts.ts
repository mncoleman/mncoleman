import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { NotionPost } from './notion';
import { parsePost, readingStats, sortPosts } from './post-format';

/**
 * Blog posts, read at build time from `data/posts/<slug>.md` (see lib/post-format.ts).
 * Returns the same shape lib/notion.ts did, so the blog pages, the search index
 * and the MCP feed are unchanged. Server-side only (fs).
 *
 * Failure policy (CLAUDE.md pattern rule 2: never publish an empty blog by accident):
 *  - `data/posts/` MISSING fails a production build (NODE_ENV=production, which `next build`
 *    sets, or CI / Cloudflare Pages) with instructions. In dev and tests it returns [].
 *  - `data/posts/` present but EMPTY is a legitimate blog with no posts yet: returns [].
 *  - A file that cannot be parsed (unclosed quote, unclosed front matter, `published` not
 *    literally true/false, no title, slug not matching its filename) throws and names the file,
 *    so the previous good deploy stays live instead of shipping a broken post.
 */

function postsDir() {
    return join(process.cwd(), 'data', 'posts');
}

function mustHavePosts() {
    return process.env.NODE_ENV === 'production' || !!process.env.CI || !!process.env.CF_PAGES;
}

function readAll(): NotionPost[] {
    const POSTS_DIR = postsDir();
    if (!existsSync(POSTS_DIR)) {
        if (mustHavePosts()) {
            throw new Error(
                'data/posts/ is missing, so this build would publish an empty blog. ' +
                'Run `npx tsx --env-file=.env.local scripts/import-notion-posts.ts --write` and commit data/posts first.'
            );
        }
        return [];
    }
    const posts: NotionPost[] = [];
    for (const file of readdirSync(POSTS_DIR)) {
        if (!file.endsWith('.md')) continue;
        const stem = file.slice(0, -3);
        const source = `data/posts/${file}`;
        const doc = parsePost(readFileSync(join(POSTS_DIR, file), 'utf8'), stem, source);
        if (doc.slug !== stem) throw new Error(`${source}: front matter slug "${doc.slug}" does not match the filename`);
        const { wordCount, readingTime } = readingStats(doc.content);
        posts.push({
            id: doc.slug || stem,
            slug: doc.slug || stem,
            title: doc.title,
            date: doc.date,
            excerpt: doc.excerpt,
            author: doc.author,
            tags: doc.tags,
            published: doc.published,
            featured: doc.featured,
            ogImage: doc.ogImage,
            content: doc.content,
            wordCount,
            readingTime,
        });
    }
    return posts;
}

/** Published posts, featured first then newest first. List rows carry no body, like the Notion list did. */
export async function getPublishedPosts(): Promise<NotionPost[]> {
    return sortPosts(readAll().filter((p) => p.published)).map(({ content: _c, wordCount: _w, readingTime: _r, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars
}

export async function getPostBySlug(slug: string): Promise<NotionPost | null> {
    return readAll().find((p) => p.published && p.slug === slug) ?? null;
}

export async function getPublishedPostsWithContent(): Promise<NotionPost[]> {
    return sortPosts(readAll().filter((p) => p.published));
}
