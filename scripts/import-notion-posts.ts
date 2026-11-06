/**
 * One-time: export the Notion blog database to data/posts/<slug>.md, the files the
 * site now reads (lib/posts.ts) and the admin writes (/admin/posts).
 *
 *   npx tsx --env-file=.env.local scripts/import-notion-posts.ts            # dry run
 *   npx tsx --env-file=.env.local scripts/import-notion-posts.ts --write    # write files locally
 *   ... --write --force   also overwrite files that already exist
 *
 * Needs NOTION_TOKEN + NOTION_DATABASE_ID (as lib/notion.ts does). Reads only;
 * the dry run touches no files and downloads nothing. With --write, any
 * Notion-hosted image is downloaded into public/blog/ and the Markdown is
 * rewritten to the local path: Notion serves file blocks as pre-signed S3 URLs
 * that expire in an hour (and trip GitHub's secret scanner), so they cannot be
 * left in a committed post. n2m returns fresh URLs, so images are fetched in the
 * same run. Nothing is committed or pushed; review `git status`, then commit.
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { withNotionRetry } from '../lib/notion-retry';
import { isValidSlug, serializePost, slugFromTitle, type PostDoc } from '../lib/post-format';

const POSTS_DIR = 'data/posts';
const IMAGE_DIR = 'public/blog';
const IMAGE_MD = /!\[([^\]]*)\]\((https:\/\/[^)\s]+)\)/g;
const NOTION_HOSTED = /amazonaws\.com|notion-static\.com|notion\.so\/image/;

const write = process.argv.includes('--write');
const force = process.argv.includes('--force');

async function main() {
    const token = process.env.NOTION_TOKEN;
    const databaseId = process.env.NOTION_DATABASE_ID;
    if (!token || token === 'ntn_your_integration_token_here' || !databaseId || databaseId.includes('your_database_id')) {
        throw new Error('NOTION_TOKEN and NOTION_DATABASE_ID are required');
    }
    const notion = new Client({ auth: token });
    const n2m = new NotionToMarkdown({ notionClient: notion });

    console.log(write ? 'WRITE mode: files will be created under data/posts/ and public/blog/.' : 'DRY RUN: nothing will be written. Pass --write to create files.');

    // Every post, published or not: the admin decides what is live via `published`.
    const pages: any[] = [];
    let cursor: string | undefined;
    do {
        const res: any = await withNotionRetry('databases.query', () =>
            notion.databases.query({ database_id: databaseId, start_cursor: cursor, page_size: 100 })
        );
        pages.push(...res.results);
        cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    console.log(`Found ${pages.length} pages in the Notion database.`);

    if (write) {
        mkdirSync(POSTS_DIR, { recursive: true });
        mkdirSync(IMAGE_DIR, { recursive: true });
    }

    const used = new Set<string>();
    let written = 0;
    let skipped = 0;
    // Every slug that differs from what the Notion Slug property says (live URLs today), for redirects.
    const changed: { from: string; to: string; why: string }[] = [];

    for (const page of pages) {
        const p = page.properties;
        const title: string = p.Title?.title?.map((t: any) => t.plain_text).join('') || 'Untitled';
        const rawSlug: string = p.Slug?.rich_text?.map((t: any) => t.plain_text).join('').trim() || '';
        // Never silently change a URL: a Notion slug that is already a valid slug is kept verbatim.
        // Only a slug that cannot be a filename (uppercase, spaces, ...) or is missing is derived.
        let slug = isValidSlug(rawSlug) ? rawSlug : slugFromTitle(rawSlug || title) || 'untitled';
        let why = isValidSlug(rawSlug) ? '' : rawSlug ? 'Notion slug is not a valid slug shape; normalized' : 'no Slug in Notion; derived from title';
        const wanted = slug;
        for (let n = 2; used.has(slug); n++) { slug = `${wanted}-${n}`; why = `duplicate of another post's slug; suffixed`; }
        used.add(slug);
        if (why) {
            changed.push({ from: rawSlug, to: slug, why });
            console.log(`  !! slug change  "${rawSlug || '(none)'}" -> "${slug}"  (${why})  [${title}]`);
        }

        const blocks = await withNotionRetry('pageToMarkdown', () => n2m.pageToMarkdown(page.id));
        let content = (n2m.toMarkdownString(blocks).parent || '').trim();

        const images = [...content.matchAll(IMAGE_MD)].filter((m) => NOTION_HOSTED.test(m[2]));
        if (write) {
            let n = 0;
            for (const [full, alt, src] of images) {
                const res = await fetch(src);
                if (!res.ok) throw new Error(`Image download failed (${res.status}) for ${slug}`);
                const ext = (new URL(src).pathname.match(/\.(\w{2,5})$/)?.[1] || (res.headers.get('content-type') || '').split('/')[1] || 'png').toLowerCase().replace('jpeg', 'jpg');
                const name = `${slug}-${++n}.${ext}`;
                writeFileSync(`${IMAGE_DIR}/${name}`, Buffer.from(await res.arrayBuffer()));
                content = content.replace(full, `![${alt}](/blog/${name})`);
            }
        }

        const doc: PostDoc = {
            title,
            slug,
            date: p.Date?.date?.start || new Date().toISOString().slice(0, 10),
            tags: p.Tags?.multi_select?.map((t: any) => t.name) || [],
            published: !!p.Published?.checkbox,
            featured: !!p.Featured?.checkbox,
            excerpt: p.Excerpt?.rich_text?.map((t: any) => t.plain_text).join('') || '',
            author: p.Author?.rich_text?.map((t: any) => t.plain_text).join('') || 'Anonymous',
            content,
        };

        const file = `${POSTS_DIR}/${slug}.md`;
        const exists = existsSync(file);
        const summary = `${doc.published ? 'live ' : 'draft'} ${doc.date.slice(0, 10)}  ${file}  (${content.split(/\s+/).length} words, ${images.length} Notion image${images.length === 1 ? '' : 's'})`;
        if (exists && !force) {
            console.log(`  skip  ${summary}  [exists; use --force]`);
            skipped++;
            continue;
        }
        console.log(`  ${write ? 'write' : 'would write'}  ${summary}${exists ? '  [overwrite]' : ''}`);
        if (write) {
            writeFileSync(file, serializePost(doc));
            written++;
        }
    }

    if (changed.length) {
        console.log(`\n${changed.length} slug${changed.length === 1 ? '' : 's'} changed from Notion. Old URL -> new URL (add as redirects, e.g. in public/_redirects):`);
        for (const c of changed) {
            if (c.from) console.log(`  /blog/${c.from}/ /blog/${c.to}/ 301`);
            else console.log(`  (no old URL: Notion had no slug) -> /blog/${c.to}/`);
        }
    } else {
        console.log('\nNo slugs changed: every URL is kept as in Notion.');
    }
    console.log(write ? `Wrote ${written} posts (${skipped} skipped). Review with git status, then commit.` : `Dry run complete: ${pages.length - skipped} posts would be written (${skipped} skipped).`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
