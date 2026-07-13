/**
 * Custom GA4 events.
 *
 * GA4 Enhanced Measurement only sees real `<a href>` anchors — it cannot observe a
 * `<button>` that calls `window.open()`, `navigator.share()`, or `clipboard.writeText()`,
 * which is how every interactive control on this site works. So the interactions worth
 * knowing about (open / copy / share on cards, prompt + skill copies, guestbook signups)
 * only exist in GA if we send them ourselves.
 *
 * No-ops when GA is not configured (local dev, or a build without NEXT_PUBLIC_GA_ID), so
 * callers never need to guard.
 */

type EventParams = Record<string, string | number | boolean | undefined>;

export function trackEvent(name: string, params: EventParams = {}): void {
    if (typeof window === 'undefined') return;

    const dataLayer = window.dataLayer;
    if (!dataLayer) return;

    // Drop undefined values — GA4 records them as the literal string "undefined".
    const clean: EventParams = {};
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined) clean[k] = v;
    }

    // Matches the canonical gtag shim: gtag.js reads the raw arguments object,
    // not an array, so this must stay a function declaration.
    (function gtag() {
        // eslint-disable-next-line prefer-rest-params
        dataLayer.push(arguments);
    } as (...args: unknown[]) => void)('event', name, clean);
}

/** What kind of thing was acted on — keeps the GA4 reports groupable. */
export type ContentType = 'project' | 'resource' | 'artifact' | 'prompt' | 'skill' | 'blog' | 'brand-kit' | 'page';

/** Open / Share / Copy on a card, and the copy buttons across /artifacts, /ai and the brand kit. */
export function trackContentAction(
    action: 'open' | 'copy' | 'share' | 'download',
    contentType: ContentType,
    item: string,
    extra: EventParams = {}
): void {
    trackEvent(`content_${action}`, {
        content_type: contentType,
        item_name: item,
        ...extra,
    });
}
