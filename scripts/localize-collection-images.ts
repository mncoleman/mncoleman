/**
 * Replace Notion-hosted images in data/projects.json and data/resources.json
 * with copies committed under public/collections/.
 *
 * Notion serves file blocks as pre-signed S3 URLs that expire after an hour and
 * carry Amazon's temporary access key in the query string — so a frozen export
 * has dead images AND trips GitHub's secret scanner. This fetches the pages
 * again (fresh URLs), downloads each image once, and rewrites the markdown to
 * the local path.
 *
 *   npx tsx --env-file=.env.local scripts/localize-collection-images.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { Client } from '@notionhq/client';
import { withNotionRetry } from '../lib/notion-retry';
import { slugify } from '../lib/utils';

const OUT_DIR = 'public/collections';
const IMAGE_MD = /!\[([^\]]*)\]\((https:\/\/[^)]+amazonaws\.com[^)]+)\)/g;

async function main() {
    const token = process.env.NOTION_TOKEN;
    if (!token) throw new Error('NOTION_TOKEN required');
    const notion = new Client({ auth: token });
    mkdirSync(OUT_DIR, { recursive: true });

    for (const [file, dbEnv] of [
        ['data/projects.json', 'NOTION_PROJECTS_DATABASE_ID'],
        ['data/resources.json', 'NOTION_RESOURCES_DATABASE_ID'],
    ] as const) {
        const items = JSON.parse(readFileSync(file, 'utf8')) as { id: string; name: string; content?: string }[];
        // A fresh, non-global RegExp per test: the global one keeps lastIndex
        // between calls and silently skips every other item.
        const needs = items.filter((i) => new RegExp(IMAGE_MD.source).test(i.content || ''));
        if (needs.length === 0) {
            console.log(`${file}: nothing to localize`);
            continue;
        }
        const dbId = process.env[dbEnv];
        if (!dbId) throw new Error(`${dbEnv} required to refresh image links`);
        const pages: any = await withNotionRetry('databases.query', () => notion.databases.query({ database_id: dbId }));

        for (const item of needs) {
            const page = pages.results.find((p: any) => slugify(p.properties.Name?.title?.[0]?.plain_text || '') === item.id);
            if (!page) throw new Error(`No Notion page found for ${item.id}`);
            const blocks: any = await withNotionRetry('blocks.children.list', () =>
                notion.blocks.children.list({ block_id: page.id, page_size: 100 })
            );
            const fresh: string[] = blocks.results
                .filter((b: any) => b.type === 'image')
                .map((b: any) => b.image?.file?.url || b.image?.external?.url)
                .filter(Boolean);

            let n = 0;
            let content = item.content || '';
            for (const match of [...content.matchAll(IMAGE_MD)]) {
                const [full, alt, stale] = match;
                const stalePath = new URL(stale).pathname;
                const url = fresh.find((u) => new URL(u).pathname === stalePath);
                if (!url) throw new Error(`No fresh URL for ${item.id} image ${stalePath}`);
                const res = await fetch(url);
                if (!res.ok) throw new Error(`Download failed (${res.status}) for ${item.id}`);
                const ext = (stalePath.match(/\.(\w+)$/)?.[1] || 'bin').toLowerCase();
                const name = `${item.id}-${++n}.${ext}`;
                writeFileSync(`${OUT_DIR}/${name}`, Buffer.from(await res.arrayBuffer()));
                content = content.replace(full, `![${alt}](/collections/${name})`);
                console.log(`${item.id}: ${name}`);
            }
            item.content = content;
        }
        writeFileSync(file, JSON.stringify(items, null, 2) + '\n');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
