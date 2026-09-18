/**
 * One-off: export the Resources and Projects Notion databases (with page bodies)
 * to data/resources.json and data/projects.json, the files the site now reads
 * instead of Notion. Run with:
 *
 *   npx tsx --env-file=.env.local scripts/migrate-notion-collections.ts
 *
 * Kept in the repo as the record of how the data got here. Safe to re-run: it
 * overwrites both files wholesale.
 */
import { writeFileSync } from 'fs';
import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { withNotionRetry } from '../lib/notion-retry';
import { slugify } from '../lib/utils';

type AnyPage = { id: string; properties: Record<string, any> };

async function main() {
    const token = process.env.NOTION_TOKEN;
    const resourcesDb = process.env.NOTION_RESOURCES_DATABASE_ID;
    const projectsDb = process.env.NOTION_PROJECTS_DATABASE_ID;
    if (!token || !resourcesDb || !projectsDb) {
        throw new Error('NOTION_TOKEN, NOTION_RESOURCES_DATABASE_ID and NOTION_PROJECTS_DATABASE_ID are required');
    }
    const notion = new Client({ auth: token });
    const n2m = new NotionToMarkdown({ notionClient: notion });

    const queryAll = async (database_id: string): Promise<AnyPage[]> => {
        const out: AnyPage[] = [];
        let cursor: string | undefined;
        do {
            const res: any = await withNotionRetry('databases.query', () =>
                notion.databases.query({ database_id, start_cursor: cursor, page_size: 100 })
            );
            out.push(...(res.results as AnyPage[]));
            cursor = res.has_more ? res.next_cursor : undefined;
        } while (cursor);
        return out;
    };

    const body = async (id: string): Promise<string> => {
        const blocks = await withNotionRetry('pageToMarkdown', () => n2m.pageToMarkdown(id));
        return n2m.toMarkdownString(blocks).parent?.trim() || '';
    };

    console.log('Fetching resources…');
    const resources = [];
    for (const page of await queryAll(resourcesDb)) {
        const p = page.properties;
        const name = p.Name?.title?.[0]?.plain_text || 'Untitled';
        resources.push({
            id: slugify(name),
            name,
            url: p.URL?.url || '',
            categories: p.Category?.multi_select?.map((i: any) => i.name) || [],
            description: p.Description?.rich_text?.map((t: any) => t.plain_text).join('') || '',
            published: !!p.Published?.checkbox,
            content: await body(page.id),
        });
        console.log(`  ${name}`);
    }

    console.log('Fetching projects…');
    const projects = [];
    for (const page of await queryAll(projectsDb)) {
        const p = page.properties;
        const name = p.Name?.title?.[0]?.plain_text || 'Untitled';
        projects.push({
            id: slugify(name),
            name,
            description: p.Description?.rich_text?.map((t: any) => t.plain_text).join('') || '',
            url: p.URL?.url || '',
            // The Notion database stores this as a single "Category" select, which the
            // site has always shown as the tech list.
            tech: p.Category?.select ? [p.Category.select.name] : (p.Tech?.multi_select?.map((i: any) => i.name) || []),
            date: p.Date?.date?.start || '',
            published: !!p.Published?.checkbox,
            content: await body(page.id),
        });
        console.log(`  ${name}`);
    }

    writeFileSync('data/resources.json', JSON.stringify(resources, null, 2) + '\n');
    writeFileSync('data/projects.json', JSON.stringify(projects, null, 2) + '\n');
    console.log(`Wrote ${resources.length} resources and ${projects.length} projects.`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
