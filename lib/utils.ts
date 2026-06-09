import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * URL-safe slug from arbitrary text. Client-safe (no Node deps) so the same
 * function can run at build time (generateStaticParams) and in the browser
 * (computing a card's details link), guaranteeing the two always agree.
 */
export function slugify(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

/**
 * Stable details-page slug for a STATIC artifact. Derived from the filename
 * (the codebase already treats filename as a static artifact's unique identity),
 * falling back to the display name. Instant artifacts use their own server slug.
 */
export function artifactSlug(a: { filename?: string; name?: string }): string {
  const stem = (a.filename || '').replace(/\.[^.]+$/, '');
  return slugify(stem || a.name || 'artifact');
}
