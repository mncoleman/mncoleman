import { Client } from '@notionhq/client';

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
    category: string;
    description: string;
    published: boolean;
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
                category: 'Sample',
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
            category: page.properties.Category?.select?.name || 'Uncategorized',
            description: page.properties.Description?.rich_text?.[0]?.plain_text || '',
            published: page.properties.Published?.checkbox || false
        }));
    } catch (error) {
        console.error('Error fetching resources:', error);
        return [];
    }
}

export async function getResourcesByCategory(): Promise<Record<string, Resource[]>> {
    const resources = await getPublishedResources();
    return resources.reduce((acc, resource) => {
        const category = resource.category;
        if (!acc[category]) acc[category] = [];
        acc[category].push(resource);
        return acc;
    }, {} as Record<string, Resource[]>);
}
