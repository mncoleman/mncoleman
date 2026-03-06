import { getPublishedPostsWithContent } from '../lib/notion';
import { getPublishedProjects } from '../lib/projects';
import { getPublishedResources } from '../lib/resources';
import { getResume } from '../lib/resume';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

interface SearchItem {
    id: string;
    title: string;
    description: string;
    content?: string;
    url: string;
    type: 'blog' | 'project' | 'resource' | 'resume';
    metadata?: string[];
}

async function main() {
    console.log('Generating search index...');

    const [posts, projects, resources, resume] = await Promise.all([
        getPublishedPostsWithContent(),
        getPublishedProjects(),
        getPublishedResources(),
        getResume(),
    ]);

    const searchItems: SearchItem[] = [
        ...posts.map(p => ({
            id: p.id,
            title: p.title,
            description: p.excerpt,
            content: p.content?.slice(0, 500),
            url: `/blog/${p.slug}`,
            type: 'blog' as const,
            metadata: p.tags,
        })),
        ...projects.map(p => ({
            id: p.id,
            title: p.name,
            description: p.description,
            url: p.url || '/projects',
            type: 'project' as const,
            metadata: p.tech,
        })),
        ...resources.map(r => ({
            id: r.id,
            title: r.name,
            description: r.description,
            url: r.url || '/resources',
            type: 'resource' as const,
            metadata: r.categories,
        })),
    ];

    if (resume) {
        searchItems.push({
            id: 'resume',
            title: 'Resume',
            description: 'Matthew Coleman\'s Professional Resume',
            url: '/resume',
            type: 'resume' as const,
        });
    }

    const outDir = join(process.cwd(), 'data');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'search-index.json'), JSON.stringify(searchItems));

    console.log(`Search index generated with ${searchItems.length} items`);
}

main().catch(err => {
    console.error('Failed to generate search index:', err);
    process.exit(1);
});
