import type { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/blog';
import { getProjectSlugs } from '@/lib/projects';
import { getResourceSlugs } from '@/lib/resources';

const BASE = 'https://mncoleman.com';

// Static export requires this route to be statically generated at build time.
export const dynamic = 'force-static';

/** Public, indexable routes (admin is intentionally excluded — see robots.ts). */
const STATIC_ROUTES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '', priority: 1.0, changeFrequency: 'weekly' },
    { path: 'blog', priority: 0.9, changeFrequency: 'daily' },
    { path: 'projects', priority: 0.8, changeFrequency: 'weekly' },
    { path: 'resources', priority: 0.8, changeFrequency: 'weekly' },
    { path: 'ai', priority: 0.7, changeFrequency: 'weekly' },
    { path: 'artifacts', priority: 0.6, changeFrequency: 'weekly' },
    { path: 'resume', priority: 0.6, changeFrequency: 'monthly' },
    { path: 'about', priority: 0.6, changeFrequency: 'monthly' },
    { path: 'brand-kit', priority: 0.4, changeFrequency: 'monthly' },
    { path: 'privacy', priority: 0.3, changeFrequency: 'yearly' },
    { path: 'terms', priority: 0.3, changeFrequency: 'yearly' },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    const now = new Date();

    const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
        url: `${BASE}/${r.path ? `${r.path}/` : ''}`,
        lastModified: now,
        changeFrequency: r.changeFrequency,
        priority: r.priority,
    }));

    // Content routes are resilient: if a Notion fetch fails at build, that section
    // is simply omitted rather than failing the whole sitemap.
    const [posts, projectSlugs, resourceSlugs] = await Promise.all([
        getAllPosts().catch(() => []),
        getProjectSlugs().catch(() => []),
        getResourceSlugs().catch(() => []),
    ]);

    const blogEntries: MetadataRoute.Sitemap = posts.map((post) => ({
        url: `${BASE}/blog/${post.slug}/`,
        lastModified: post.date ? new Date(post.date) : now,
        changeFrequency: 'monthly',
        priority: 0.7,
    }));

    const projectEntries: MetadataRoute.Sitemap = projectSlugs.map((slug) => ({
        url: `${BASE}/projects/${slug}/`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.6,
    }));

    const resourceEntries: MetadataRoute.Sitemap = resourceSlugs.map((slug) => ({
        url: `${BASE}/resources/${slug}/`,
        lastModified: now,
        changeFrequency: 'monthly',
        priority: 0.5,
    }));

    return [...staticEntries, ...blogEntries, ...projectEntries, ...resourceEntries];
}
