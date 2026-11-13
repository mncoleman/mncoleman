import type { Metadata } from 'next';

/**
 * Whether search engines may index the daily brief. Off: the brief carries
 * NKJV scripture used by permission and summaries of other people's reporting,
 * so it is readable by anyone with the link (and through the MCP server) but
 * stays out of search results. Flip this one constant to change that; the
 * pages and `app/robots.ts` both read it.
 *
 * Whether the brief is PUBLIC at all is a separate switch that needs no
 * rebuild: the admin panel's Daily brief section (stored in KV).
 */
export const BRIEF_INDEXABLE = false;

/** The feed, served by worker-mcp from the same KV the pages read. */
export const BRIEF_RSS = '/api/brief/rss';

/** First date the pages are generated for. Nothing was published before it. */
export const BRIEF_FIRST_DATE = '2026-11-01';
/** Days past the build date that get a page, so tomorrow's edition has a URL before the daily rebuild runs. */
export const BRIEF_DAYS_AHEAD = 45;

export function briefMetadata(title: string, path: string): Metadata {
    return {
        title,
        description: 'A morning digest: weather, a verse, and the day in tech, local, national and world news, each story linked to its source.',
        alternates: { canonical: path, types: { 'application/rss+xml': BRIEF_RSS } },
        robots: BRIEF_INDEXABLE ? undefined : { index: false, follow: false },
    };
}
