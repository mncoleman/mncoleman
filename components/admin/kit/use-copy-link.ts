'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { COPY_FAILED, copyLinkMessage, copyText, siteUrl, type LinkState } from './copy-link';
import { notify } from './toast';

/**
 * `const { copy, copied } = useCopyLink();`
 * `copy('/blog/my-post/', { live: post.published })` copies `https://mncoleman.com/blog/my-post/`
 * and toasts "Link copied" (or "Link copied. It asks for a password." / "Link copied. It isn't
 * live yet."). `copied` is the path that was copied in the last 1.6s, so a button can flash a tick.
 */
export function useCopyLink() {
    const [copied, setCopied] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(timer.current), []);
    const copy = useCallback(async (path: string, state: LinkState) => {
        const ok = await copyText(siteUrl(path));
        notify(ok ? copyLinkMessage(state) : COPY_FAILED);
        if (ok) {
            setCopied(path);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(null), 1600);
        }
        return ok;
    }, []);
    return { copy, copied };
}
