import { Client } from '@notionhq/client';
import { slugify } from './utils';

const getNotionClient = () => {
    if (!process.env.NOTION_TOKEN || process.env.NOTION_TOKEN === 'ntn_your_integration_token_here') {
        throw new Error('NOTION_TOKEN is not defined or is a placeholder');
    }
    return new Client({ auth: process.env.NOTION_TOKEN });
};

export interface Project {
    id: string;
    name: string;
    description: string;
    url: string;
    tech: string[];
    date: string;
    published: boolean;
}

export interface ProjectDetail extends Project {
    /** Notion page body rendered to markdown (empty when the record has no body). */
    content?: string;
}

/** Unique details-page slugs for every published project. */
export async function getProjectSlugs(): Promise<string[]> {
    const projects = await getPublishedProjects();
    const seen = new Set<string>();
    for (const p of projects) {
        const slug = slugify(p.name);
        if (seen.has(slug)) {
            console.warn(`[projects] Duplicate details slug "${slug}" ("${p.name}") — only the first is reachable. Rename to disambiguate.`);
            continue;
        }
        seen.add(slug);
    }
    return Array.from(seen);
}

/** Look up a project by its slug and fetch its Notion page body (blog-style). */
export async function getProjectBySlug(slug: string): Promise<ProjectDetail | null> {
    const projects = await getPublishedProjects();
    const match = projects.find(p => slugify(p.name) === slug);
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
        console.error(`Error fetching project body for slug ${slug}:`, error);
        return { ...match };
    }
}

export async function getPublishedProjects(): Promise<Project[]> {
    const databaseId = process.env.NOTION_PROJECTS_DATABASE_ID;
    const token = process.env.NOTION_TOKEN;

    // Check for valid credentials before attempting to connect
    if (!databaseId || databaseId.includes('your_projects_database_id') || !token || token === 'ntn_your_integration_token_here') {
        console.warn('NOTION_PROJECTS_DATABASE_ID not set or is a placeholder, returning sample data');
        return [
            {
                id: 'sample-1',
                name: 'Sample Project',
                description: 'This is a sample project built with AI.',
                url: 'https://example.com',
                tech: ['React', 'Next.js', 'Tailwind'],
                date: new Date().toISOString(),
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
            },
        });

        return response.results.map((page: any) => ({
            id: page.id,
            name: page.properties.Name?.title?.[0]?.plain_text || 'Untitled',
            description: page.properties.Description?.rich_text?.[0]?.plain_text || '',
            url: page.properties.URL?.url || '',
            tech: page.properties.Category?.select ? [page.properties.Category.select.name] : [],
            date: '',
            published: page.properties.Published?.checkbox || false
        }));
    } catch (error) {
        console.error('Error fetching projects:', error);
        return [];
    }
}
