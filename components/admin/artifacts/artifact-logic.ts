/**
 * Pure artifact rules (no React) so `artifact-logic.selftest.ts` runs them under tsx: how the list
 * searches and filters, where a row opens, what "Copy link" copies, and the short "Updated" text.
 */
import { matchesQuery } from '../kit/list-logic';
import { SITE_ORIGIN, type LinkState } from '../kit/copy-link';

export type Visibility = 'public' | 'private';
export type TypeFilter = 'all' | 'dynamic' | 'static';
export type VisibilityFilter = 'all' | Visibility;

export interface ArtifactRow {
    id: string;
    name: string;
    filename: string;
    description?: string;
    type: string;
    size: number;
    uploadedAt: string;
    slug?: string;
    url?: string;
    source?: 'static' | 'dynamic';
    visibility?: Visibility;
}

/** The public home of instant artifacts. A constant on purpose: a link copied from a local or preview admin must still be the real one. */
export const PUBLIC_ARTIFACTS_ORIGIN = 'https://artifacts.mncoleman.com';

export const isDynamic = (a: Pick<ArtifactRow, 'source'>) => a.source === 'dynamic';

/** Instant artifacts are keyed by slug, static ones by file name (their manifest entries have no reliable slug). */
export function detailHref(a: Pick<ArtifactRow, 'source' | 'slug' | 'filename'>): string {
    return isDynamic(a) && a.slug
        ? `/admin/artifacts/edit?slug=${encodeURIComponent(a.slug)}`
        : `/admin/artifacts/edit?file=${encodeURIComponent(a.filename)}`;
}

/** Edit mode (click text on the page, notes, Link my Claude) exists for instant HTML pages only. */
export function editModeHref(a: Pick<ArtifactRow, 'source' | 'slug' | 'type'>): string | null {
    const html = (a.type || '').split(';')[0].trim().toLowerCase() === 'text/html';
    return isDynamic(a) && html && a.slug ? `/admin/artifacts/edit?slug=${encodeURIComponent(a.slug)}&mode=edit` : null;
}

/**
 * What Copy link copies and says. Instant: the artifact service address; a private one tells the
 * person it asks for a password. Static: the file on the site. Both are absolute, so the kit uses them as given.
 */
export function copyTarget(a: Pick<ArtifactRow, 'source' | 'slug' | 'filename' | 'visibility'>): { path: string; state: LinkState } {
    if (isDynamic(a) && a.slug) {
        return {
            path: `${PUBLIC_ARTIFACTS_ORIGIN}/a/${encodeURIComponent(a.slug)}`,
            state: { live: true, passwordProtected: a.visibility === 'private' },
        };
    }
    return { path: `${SITE_ORIGIN}/artifacts/${encodeURIComponent(a.filename)}`, state: { live: true } };
}

export function filterArtifacts<T extends ArtifactRow>(rows: readonly T[], o: { query: string; type: TypeFilter; visibility: VisibilityFilter }): T[] {
    return rows.filter((a) => {
        if (o.type !== 'all' && (a.source || 'static') !== o.type) return false;
        if (o.visibility !== 'all' && (a.visibility || 'public') !== o.visibility) return false;
        return matchesQuery([a.name, a.slug, a.filename, a.description], o.query);
    });
}

/** "Just now", "5m ago", "3h ago", "4d ago", then the date. */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
    const t = iso ? Date.parse(iso) : NaN;
    if (Number.isNaN(t)) return '';
    const mins = (now - t) / 60000;
    if (mins < 2) return 'Just now';
    if (mins < 60) return `${Math.round(mins)}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    if (mins < 10080) return `${Math.round(mins / 1440)}d ago`;
    return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
