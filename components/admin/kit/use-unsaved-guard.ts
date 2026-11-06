'use client';

import { useEffect } from 'react';

export const UNSAVED_MESSAGE = 'You have changes that are not saved. Leave without saving them?';

/** True for a plain left-click on an in-app link that would leave the current page. Pure, so the selftest can run it. */
export function leavesPage(a: { href: string; target?: string; download?: boolean | string }, e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }, here: { origin: string; pathname: string; search: string }): boolean {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
    if ((a.target && a.target !== "_self") || !!a.download) return false;
    let u: URL;
    try { u = new URL(a.href, here.origin); } catch { return false; }
    if (u.origin !== here.origin) return false;
    return u.pathname !== here.pathname || u.search !== here.search;
}

/**
 * While `dirty`, warn before the page is lost: the browser's own prompt on close or reload, and a confirm when an
 * in-app link (sidebar, Back, breadcrumb) would leave. The browser's Back button cannot be intercepted reliably, so it is not.
 */
export function useUnsavedGuard(dirty: boolean, message: string = UNSAVED_MESSAGE) {
    useEffect(() => {
        if (!dirty) return;
        const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
        const onClick = (e: MouseEvent) => {
            const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
            if (!a) return;
            if (!leavesPage(a, e, { origin: location.origin, pathname: location.pathname, search: location.search })) return;
            if (!window.confirm(message)) { e.preventDefault(); e.stopImmediatePropagation(); }
        };
        window.addEventListener('beforeunload', onUnload);
        document.addEventListener('click', onClick, true);
        return () => {
            window.removeEventListener('beforeunload', onUnload);
            document.removeEventListener('click', onClick, true);
        };
    }, [dirty, message]);
}
