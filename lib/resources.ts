import { Client } from '@notionhq/client';
import { slugify } from './utils';

const getNotionClient = () => {
    if (!process.env.NOTION_TOKEN || process.env.NOTION_TOKEN === 'ntn_your_integration_token_here') {
        throw new Error('NOTION_TOKEN is not defined or is a placeholder');
    }
    return new Client({ auth: process.env.NOTION_TOKEN });
};

export interface Resource {
    id: string;
    name: string;
    url: string;
    categories: string[];
    description: string;
    published: boolean;
}

export interface ResourceDetail extends Resource {
    /** Notion page body rendered to markdown (empty when the record has no body). */
    content?: string;
}

/** Unique details-page slugs for every published resource. */
export async function getResourceSlugs(): Promise<string[]> {
    const resources = await getPublishedResources();
    const seen = new Set<string>();
    for (const r of resources) {
        const slug = slugify(r.name);
        if (seen.has(slug)) {
            console.warn(`[resources] Duplicate details slug "${slug}" ("${r.name}") — only the first is reachable. Rename to disambiguate.`);
            continue;
        }
        seen.add(slug);
    }
    return Array.from(seen);
}

/** Look up a resource by its slug and fetch its Notion page body (blog-style). */
export async function getResourceBySlug(slug: string): Promise<ResourceDetail | null> {
    const resources = await getPublishedResources();
    const match = resources.find(r => slugify(r.name) === slug);
    if (!match) return null;

    const token = process.env.NOTION_TOKEN;
    // No real credentials (sample data) or a sample record — return metadata only.
    if (!token || token === 'ntn_your_integration_token_here' || match.id.startsWith('sample')) {
        return { ...match };
    }

    try {
        const notion = getNotionClient();
        const { NotionToMarkdown } = await import('notion-to-md');
        const n2m = new NotionToMarkdown({ notionClient: notion });
        const mdblocks = await n2m.pageToMarkdown(match.id);
        const content = n2m.toMarkdownString(mdblocks).parent;
        return { ...match, content };
    } catch (error) {
        console.error(`Error fetching resource body for slug ${slug}:`, error);
        return { ...match };
    }
}

export async function getPublishedResources(): Promise<Resource[]> {
    const databaseId = process.env.NOTION_RESOURCES_DATABASE_ID;
    const token = process.env.NOTION_TOKEN;

    // Check for valid credentials before attempting to connect
    if (!databaseId || databaseId.includes('your_resources_database_id') || !token || token === 'ntn_your_integration_token_here') {
        console.warn('NOTION_RESOURCES_DATABASE_ID not set or is a placeholder, returning sample data');
        return [
            {
                id: 'sample-1',
                name: 'Sample Resource',
                url: 'https://example.com',
                categories: ['Sample'],
                description: 'This is a sample resource.',
                published: true
            }
        ];
    }

    try {
        const notion = getNotionClient();
        const response = await notion.databases.query({
            database_id: databaseId,
            filter: {
                property: 'Published',
                checkbox: { equals: true }
            }
        });

        return response.results.map((page: any) => ({
            id: page.id,
            name: page.properties.Name?.title?.[0]?.plain_text || 'Untitled',
            url: page.properties.URL?.url || '',
            categories: page.properties.Category?.multi_select?.map((item: any) => item.name) || [],
            description: page.properties.Description?.rich_text?.[0]?.plain_text || '',
            published: page.properties.Published?.checkbox || false
        }));
    } catch (error) {
        console.error('Error fetching resources:', error);
        return [];
    }
}

