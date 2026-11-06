/**
 * Copy-link helpers (pure except `copyText`). One builder for every public address so a row's
 * "Copy link" button and the editor's agree, and one place for the three toast messages.
 */

export const SITE_ORIGIN = 'https://mncoleman.com';

/** `/blog/x` or `blog/x/` -> `https://mncoleman.com/blog/x/` (always a leading and trailing slash, like the site's own links). */
export function siteUrl(path: string): string {
    // An absolute address (an instant artifact on the artifact service, a library page) is copied exactly as given.
    if (/^https?:\/\//i.test(path)) return path;
    const clean = path.replace(/^\/+|\/+$/g, '');
    return clean ? `${SITE_ORIGIN}/${clean}/` : `${SITE_ORIGIN}/`;
}

/** The public path of one record: `entryPath('blog', 'my-post')` -> `/blog/my-post/`. */
export function entryPath(section: string, slug: string): string {
    return `/${section.replace(/^\/+|\/+$/g, '')}/${encodeURIComponent(slug)}/`;
}

export interface LinkState {
    /** Visible to visitors (published). */
    live: boolean;
    /** The link opens a password page. */
    passwordProtected?: boolean;
}

/** What the toast says after copying. Never blocks the copy: a draft's link is still useful to have. */
export function copyLinkMessage(state: LinkState): string {
    if (state.passwordProtected) return 'Link copied. It asks for a password.';
    if (!state.live) return 'Link copied. It isn’t live yet.';
    return 'Link copied';
}

export const COPY_FAILED = 'Could not copy. Select the address and copy it yourself.';

/** Writes to the clipboard, falling back to a hidden textarea where the async API is blocked. Resolves false on failure. */
export async function copyText(text: string): Promise<boolean> {
    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* fall through to the legacy path */ }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch {
        return false;
    }
}
