import { slugify } from './utils';
import { DEFAULT_TAG_KEY, flattenTags, normalizeTags, type Tags } from './tags';
import resourcesData from '@/data/resources.json';

/**
 * Resources live in `data/resources.json`, edited from the admin panel
 * (/admin/content → Worker → GitHub commit → Pages build). They used to come
 * from a Notion database; every build then fetched seventeen page bodies and
 * spent minutes in Notion's rate-limit backoff. Now the build reads a file.
 *
 * `id` is the details-page slug (`slugify(name)`), kept stable by the editor.
 */
export interface Resource {
    id: string;
    name: string;
    url: string;
    /** Keyed tags, e.g. `{ Category: [...] }`. */
    tags: Tags;
    /** Every tag value across all keys, flat — what search and the MCP feed index. */
    categories: string[];
    description: string;
    published: boolean;
}

export interface ResourceDetail extends Resource {
    /** Markdown body for the details page (empty when the record has none). */
    content?: string;
}

interface StoredResource extends Resource {
    content?: string;
}

// Records may still carry the pre-keys flat `categories` array; fold it into the default key.
const ALL: StoredResource[] = (resourcesData as unknown as Array<Record<string, unknown>>).map((raw) => {
    const tags = normalizeTags(raw.tags, raw.categories, DEFAULT_TAG_KEY.resources);
    return { ...raw, tags, categories: flattenTags(tags) } as unknown as StoredResource;
});

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

/** Look up a published resource by its slug, body included. */
export async function getResourceBySlug(slug: string): Promise<ResourceDetail | null> {
    const match = ALL.find((r) => r.published && slugify(r.name) === slug);
    if (!match) return null;
    return { ...match, content: match.content?.trim() || undefined };
}

export async function getPublishedResources(): Promise<Resource[]> {
    return ALL.filter((r) => r.published).map(({ content: _content, ...rest }) => rest);
}
