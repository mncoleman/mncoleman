import { authHeaders } from '@/lib/admin-auth';

/**
 * Private artifacts sit behind a password gate. The admin panel's frames skip it
 * with a 90-second, single-artifact token from the Worker (which only issues one
 * to people allowed to see that artifact). The service swaps the token for its
 * unlock cookie and redirects to the clean URL. Falls back to the plain URL (the
 * normal password gate) if the Worker refuses or is unreachable.
 */
export async function withPreviewToken(workerUrl: string, slug: string, url: string): Promise<string> {
    try {
        const res = await fetch(`${workerUrl.replace(/\/$/, '')}/api/artifacts/instant/${encodeURIComponent(slug)}/preview-token`, {
            headers: authHeaders(),
            credentials: 'include',
            cache: 'no-store',
        });
        if (!res.ok) return url;
        const data = (await res.json()) as { token?: string };
        if (!data.token) return url;
        return `${url}${url.includes('?') ? '&' : '?'}adminPreview=${encodeURIComponent(data.token)}`;
    } catch {
        return url;
    }
}

/**
 * Opens an artifact in a new tab. A private one gets a fresh token at click time (they
 * expire in 90 seconds, so a link built earlier would be dead); everything else is a
 * plain link. The tab is opened synchronously so popup blockers allow it.
 */
export async function openArtifactTab(workerUrl: string, slug: string, url: string, isPrivate: boolean): Promise<void> {
    if (!isPrivate) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
    }
    const tab = window.open('about:blank', '_blank');
    if (!tab) return;
    tab.opener = null; // the artifact is uploaded content: it must not reach back into the admin panel
    tab.location.href = await withPreviewToken(workerUrl, slug, url);
}
