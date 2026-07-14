type SetTheme = (theme: string) => void;

/**
 * Cross-fades the whole page when the theme flips, instead of snapping.
 *
 * Uses the View Transitions API: the browser snapshots the current frame, applies the
 * theme, then cross-fades old → new as compositor layers. That's why this is preferred
 * over putting a CSS `transition` on colours — a global colour transition would have every
 * element on the page animating on every paint, and it still couldn't cross-fade the WebGL
 * backdrop swapping from Dark Veil to Waves. A snapshot handles all of it in one pass.
 *
 * `disableTransitionOnChange` stays on in next-themes: it suppresses per-element CSS
 * transitions during the swap, which would otherwise double-animate underneath this.
 *
 * Falls back to an instant switch where the API is missing (Firefox) or the visitor has
 * asked for reduced motion.
 */
/** Anchors the reveal circle on the bulb, so the light visibly spreads out from it. */
function setOrigin(): void {
    const bulb = document.querySelector('.pull-chain');
    const root = document.documentElement;
    if (!bulb) return;
    const r = bulb.getBoundingClientRect();
    root.style.setProperty('--theme-x', `${((r.left + r.width / 2) / window.innerWidth) * 100}%`);
    root.style.setProperty('--theme-y', `${((r.top + r.height / 2) / window.innerHeight) * 100}%`);
}

export function setThemeWithTransition(setTheme: SetTheme, next: string): void {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const supported = typeof document.startViewTransition === 'function';

    if (reduced || !supported) {
        setTheme(next);
        return;
    }

    setOrigin();

    document.startViewTransition(() => {
        setTheme(next);
        // Resolve on the next frame so the "new" snapshot is taken after React has
        // committed the theme class, not before it.
        return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    });
}
