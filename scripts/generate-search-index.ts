import { getPublishedPostsWithContent } from '../lib/notion';
import { getPublishedProjects } from '../lib/projects';
import { getPublishedResources } from '../lib/resources';
import { getResume } from '../lib/resume';
import { getArtifacts } from '../lib/artifacts';
import { slugify } from '../lib/utils';
import about from '../data/about.json';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SITE_URL = 'https://mncoleman.com';

interface SearchItem {
    id: string;
    title: string;
    description: string;
    content?: string;
    url: string;
    type: 'blog' | 'project' | 'resource' | 'resume' | 'artifact';
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

    const artifacts = getArtifacts();
    searchItems.push(
        ...artifacts.map(a => ({
            id: a.id,
            title: a.name,
            description: a.description || `${a.filename} (${a.type})`,
            url: `/artifacts/${a.filename}`,
            type: 'artifact' as const,
            metadata: [a.type],
        })),
    );

    const outDir = join(process.cwd(), 'data');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'search-index.json'), JSON.stringify(searchItems));

    console.log(`Search index generated with ${searchItems.length} items`);

    // The public MCP server (worker-mcp/) has no Notion credentials and no
    // database of its own — it reads this feed over HTTP and serves it as MCP
    // tools. Everything in it is content that is already published on the site.
    // NOTE: it deliberately lives under /data/, not /mcp/, because the Worker
    // route claims mncoleman.com/mcp* — a feed under /mcp/ would be fetched by
    // the Worker from itself.
    const feed = {
        generatedAt: new Date().toISOString(),
        site: {
            name: 'Matthew Coleman',
            url: SITE_URL,
            description: 'Personal site of Matthew Coleman — blog, projects, resources, resume and hosted artifacts.',
        },
        about,
        blog: posts.map(p => ({
            slug: p.slug,
            title: p.title,
            date: p.date,
            excerpt: p.excerpt,
            author: p.author,
            tags: p.tags,
            featured: !!p.featured,
            readingTime: p.readingTime,
            wordCount: p.wordCount,
            url: `${SITE_URL}/blog/${p.slug}`,
            content: p.content || '',
        })),
        projects: projects.map(p => ({
            slug: slugify(p.name),
            name: p.name,
            description: p.description,
            tech: p.tech,
            date: p.date,
            externalUrl: p.url || '',
            url: `${SITE_URL}/projects/${slugify(p.name)}`,
        })),
        resources: resources.map(r => ({
            slug: slugify(r.name),
            name: r.name,
            description: r.description,
            categories: r.categories,
            externalUrl: r.url || '',
            url: `${SITE_URL}/resources/${slugify(r.name)}`,
        })),
        resume: resume
            ? { title: resume.title, lastUpdated: resume.lastUpdated, url: `${SITE_URL}/resume`, content: resume.content }
            : null,
        artifacts: artifacts.map(a => ({
            id: a.id,
            name: a.name,
            description: a.description,
            type: a.type,
            size: a.size,
            uploadedAt: a.uploadedAt,
            url: `${SITE_URL}/artifacts/${a.filename}`,
        })),
    };

    const publicDataDir = join(process.cwd(), 'public', 'data');
    mkdirSync(publicDataDir, { recursive: true });
    writeFileSync(join(publicDataDir, 'site-content.json'), JSON.stringify(feed));

    console.log(
        `MCP content feed generated (${feed.blog.length} posts, ${feed.projects.length} projects, ` +
        `${feed.resources.length} resources, ${feed.artifacts.length} artifacts)`,
    );
}

main().catch(err => {
    console.error('Failed to generate search index:', err);
    process.exit(1);
});
