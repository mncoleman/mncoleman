/**
 * Tags on projects and resources are keyed: `{ Tech: ['Web App'], Type: ['Game'] }`.
 * A key is a kind of tag, a value is one option under it. Both are free text and
 * created from the admin panel — there is no registry, the vocabulary is whatever
 * the records currently use.
 *
 * Records written before keys existed carry a flat `tech` / `categories` array;
 * `normalizeTags` folds that into the collection's default key so old data keeps
 * rendering until the admin next saves it.
 */
export type Tags = Record<string, string[]>;

export const DEFAULT_TAG_KEY = { projects: 'Tech', resources: 'Category' } as const;

export function normalizeTags(tags: unknown, legacy: unknown, defaultKey: string): Tags {
    const out: Tags = {};
    if (tags && typeof tags === 'object' && !Array.isArray(tags)) {
        for (const [key, values] of Object.entries(tags as Record<string, unknown>)) {
            if (Array.isArray(values) && values.length > 0) out[key] = values.map(String);
        }
    }
    if (Array.isArray(legacy) && legacy.length > 0 && !out[defaultKey]) out[defaultKey] = legacy.map(String);
    return out;
}

/** Every value across every key, deduped, in key order. */
export function flattenTags(tags: Tags): string[] {
    return [...new Set(Object.values(tags).flat())];
}

/** Keys in order of first appearance across the records. */
export function tagKeys(items: { tags: Tags }[]): string[] {
    const seen = new Set<string>();
    for (const i of items) for (const k of Object.keys(i.tags)) seen.add(k);
    return [...seen];
}

/** Values in use under one key, alphabetical. */
export function tagValues(items: { tags: Tags }[], key: string): string[] {
    const seen = new Set<string>();
    for (const i of items) for (const v of i.tags[key] || []) seen.add(v);
    return [...seen].sort((a, b) => a.localeCompare(b));
}
