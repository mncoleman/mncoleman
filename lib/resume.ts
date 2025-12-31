import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';

const getNotionClient = () => {
    if (!process.env.NOTION_TOKEN || process.env.NOTION_TOKEN.includes('your_integration_token')) {
        throw new Error('NOTION_TOKEN is not defined or is a placeholder');
    }
    return new Client({ auth: process.env.NOTION_TOKEN });
};

export interface Resume {
    title: string;
    content: string;
    lastUpdated: string;
}

export async function getResume(): Promise<Resume | null> {
    const pageId = process.env.NOTION_RESUME_PAGE_ID;
    const token = process.env.NOTION_TOKEN;

    // Check for valid credentials before attempting to connect
    if (!pageId || pageId.includes('your_resume_page_id') || !token || token === 'ntn_your_integration_token_here') {
        console.warn('NOTION_RESUME_PAGE_ID not set or is a placeholder');
        return {
            title: 'Resume',
            content: '# Resume\n\nResume content will appear here once configured.',
            lastUpdated: new Date().toISOString()
        };
    }

    try {
        const notion = getNotionClient();
        const n2m = new NotionToMarkdown({ notionClient: notion });

        const page = await notion.pages.retrieve({ page_id: pageId }) as any;
        const mdblocks = await n2m.pageToMarkdown(pageId);
        const mdString = n2m.toMarkdownString(mdblocks);

        return {
            title: page.properties?.title?.title?.[0]?.plain_text || 'Resume',
            content: mdString.parent,
            lastUpdated: page.last_edited_time
        };
    } catch (error) {
        console.error('Error fetching resume:', error);
        return null;
    }
}
