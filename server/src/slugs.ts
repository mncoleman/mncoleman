const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/;

export function isValidSlug(slug: string): boolean {
    return SLUG_RE.test(slug);
}

export function suggestFromFilename(filename: string): string {
    const base = filename
        .replace(/\.[^.]+$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
    return base || 'artifact';
}
