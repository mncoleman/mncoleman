import { slugify } from './utils';
import projectsData from '@/data/projects.json';

/**
 * Projects live in `data/projects.json`, edited from the admin panel
 * (/admin/content → Worker → GitHub commit → Pages build). They used to come
 * from a Notion database — see lib/resources.ts for why that moved.
 *
 * `id` is the details-page slug (`slugify(name)`), kept stable by the editor.
 */
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
    /** Markdown body for the details page (empty when the record has none). */
    content?: string;
}

interface StoredProject extends Project {
    content?: string;
}

const ALL = projectsData as StoredProject[];

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

/** Look up a published project by its slug, body included. */
export async function getProjectBySlug(slug: string): Promise<ProjectDetail | null> {
    const match = ALL.find((p) => p.published && slugify(p.name) === slug);
    if (!match) return null;
    return { ...match, content: match.content?.trim() || undefined };
}

export async function getPublishedProjects(): Promise<Project[]> {
    return ALL.filter((p) => p.published).map(({ content: _content, ...rest }) => rest);
}
