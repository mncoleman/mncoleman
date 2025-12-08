import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';

const getNotionClient = () => {
    if (!process.env.NOTION_TOKEN) {
        throw new Error('NOTION_TOKEN is not defined');
    }
    return new Client({
        auth: process.env.NOTION_TOKEN,
    });
};

export interface NotionPost {
    id: string;
    slug: string;
    title: string;
    date: string;
    excerpt: string;
    author: string;
    tags: string[];
    published: boolean;
    featured?: boolean;
    content?: string;
    readingTime?: number; // Estimated minutes
    wordCount?: number;
}

export interface BlogStats {
    totalPosts: number;
    totalWords: number;
    avgReadingTime: number;
}

export const getDatabaseId = () => {
    const dbId = process.env.NOTION_DATABASE_ID;
    if (!dbId) {
        console.warn('NOTION_DATABASE_ID is not defined in environment variables');
        return '';
    }
    return dbId;
};

export async function getPublishedPosts(): Promise<NotionPost[]> {
    const databaseId = getDatabaseId();
    if (!databaseId) {
        console.warn('Returning sample data because NOTION_DATABASE_ID is missing');
        return [
            {
                id: 'sample-post',
                slug: 'welcome-to-notion-cms',
                title: 'Welcome to Notion CMS',
                date: new Date().toISOString(),
                excerpt: 'This is a sample post because Notion credentials are not set up yet.',
                author: 'Admin',
                tags: ['Sample', 'Setup'],
                published: true,
            }
        ];
    }

    try {
        const notion = getNotionClient();
        const response = await notion.databases.query({
            database_id: databaseId,
            filter: {
                property: 'Published',
                checkbox: {
                    equals: true,
                },
            },
        });

        const posts = response.results.map((page: any) => {
            const featured = page.properties.Featured?.checkbox || false;
            const post = {
                id: page.id,
                slug: page.properties.Slug?.rich_text?.[0]?.plain_text || '',
                title: page.properties.Title?.title?.[0]?.plain_text || 'Untitled',
                date: page.properties.Date?.date?.start || new Date().toISOString(),
                excerpt: page.properties.Excerpt?.rich_text?.[0]?.plain_text || '',
                author: page.properties.Author?.rich_text?.[0]?.plain_text || 'Anonymous',
                tags: page.properties.Tags?.multi_select?.map((tag: any) => tag.name) || [],
                published: page.properties.Published?.checkbox || false,
                featured,
            };

            // Debug: Log featured posts
            if (featured) {
                console.log(`Featured post found: "${post.title}" (${post.date})`);
            }

            return post;
        });

        // Sort: Featured posts first (newest to oldest), then regular posts (newest to oldest)
        const sortedPosts = posts.sort((a, b) => {
            // If one is featured and the other is not, featured comes first
            if (a.featured && !b.featured) return -1;
            if (!a.featured && b.featured) return 1;

            // If both have the same featured status, sort by date (newest first)
            return new Date(b.date).getTime() - new Date(a.date).getTime();
        });

        console.log('Post order after sorting:', sortedPosts.map(p => `"${p.title}" (featured: ${p.featured}, date: ${p.date})`));

        return sortedPosts;
    } catch (error) {
        console.error('Error fetching posts from Notion:', error);
        return [];
    }
}

export async function getPostBySlug(slug: string): Promise<NotionPost | null> {
    const databaseId = getDatabaseId();
    if (!databaseId) {
        if (slug === 'welcome-to-notion-cms') {
            return {
                id: 'sample-post',
                slug: 'welcome-to-notion-cms',
                title: 'Welcome to Notion CMS',
                date: new Date().toISOString(),
                excerpt: 'This is a sample post because Notion credentials are not set up yet.',
                author: 'Admin',
                tags: ['Sample', 'Setup'],
                published: true,
                content: `
# Welcome to your new Notion CMS!

This is a sample post. To see your own posts here:

1. Create a Notion Integration and Database.
2. Add your \`NOTION_TOKEN\` and \`NOTION_DATABASE_ID\` to \`.env.local\`.
3. Restart the server.

Check \`NOTION_SETUP.md\` for detailed instructions.
        `,
                wordCount: 50,
                readingTime: 1,
            };
        }
        return null;
    }

    try {
        const notion = getNotionClient();
        const n2m = new NotionToMarkdown({ notionClient: notion });
        const response = await notion.databases.query({
            database_id: databaseId,
            filter: {
                and: [
                    {
                        property: 'Slug',
                        rich_text: {
                            equals: slug,
                        },
                    },
                    {
                        property: 'Published',
                        checkbox: {
                            equals: true,
                        },
                    },
                ],
            },
        });

        if (response.results.length === 0) {
            return null;
        }

        const page = response.results[0] as any;
        const mdblocks = await n2m.pageToMarkdown(page.id);
        const mdString = n2m.toMarkdownString(mdblocks);

        // Calculate word count and reading time
        const wordCount = mdString.parent.split(/\s+/).length;
        const readingTime = Math.ceil(wordCount / 200); // Avg reading speed 200 wpm

        return {
            id: page.id,
            slug: page.properties.Slug?.rich_text?.[0]?.plain_text || '',
            title: page.properties.Title?.title?.[0]?.plain_text || 'Untitled',
            date: page.properties.Date?.date?.start || new Date().toISOString(),
            excerpt: page.properties.Excerpt?.rich_text?.[0]?.plain_text || '',
            author: page.properties.Author?.rich_text?.[0]?.plain_text || 'Anonymous',
            tags: page.properties.Tags?.multi_select?.map((tag: any) => tag.name) || [],
            published: page.properties.Published?.checkbox || false,
            featured: page.properties.Featured?.checkbox || false,
            content: mdString.parent,
            wordCount,
            readingTime,
        };
    } catch (error) {
        console.error(`Error fetching post with slug ${slug}:`, error);
        return null;
    }
}

export async function getBlogStats(): Promise<BlogStats> {
    const posts = await getPublishedPosts();

    // We need to fetch content for all posts to get accurate word counts, 
    // but for performance on the dashboard list, we might just estimate or fetch lazily.
    // For now, let's fetch content for all to get accurate stats since this is a static build or admin page.
    // Note: This might be slow if there are many posts.

    let totalWords = 0;
    let totalReadingTime = 0;

    for (const post of posts) {
        if (post.id === 'sample-post') {
            totalWords += 50;
            totalReadingTime += 1;
            continue;
        }

        try {
            // We need to fetch the page content to count words
            // Optimization: In a real app, you might store this in the database properties to avoid fetching blocks
            const notion = getNotionClient();
            const n2m = new NotionToMarkdown({ notionClient: notion });
            const mdblocks = await n2m.pageToMarkdown(post.id);
            const mdString = n2m.toMarkdownString(mdblocks);
            const wordCount = mdString.parent.split(/\s+/).length;
            totalWords += wordCount;
            totalReadingTime += Math.ceil(wordCount / 200);
        } catch (error) {
            console.error(`Error calculating stats for post ${post.id}:`, error);
        }
    }

    return {
        totalPosts: posts.length,
        totalWords,
        avgReadingTime: posts.length > 0 ? Math.round(totalReadingTime / posts.length) : 0,
    };
}
