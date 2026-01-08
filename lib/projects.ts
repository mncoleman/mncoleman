import { Client } from '@notionhq/client';

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
