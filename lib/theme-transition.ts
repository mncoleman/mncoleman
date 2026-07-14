import { flushSync } from 'react-dom';

type SetTheme = (theme: string) => void;

/** Anchors the reveal circle on the bulb, so the light spreads out from the lamp. */
function setOrigin(): void {
    const bulb = document.querySelector('.pull-chain');
    if (!bulb) return;
    const root = document.documentElement;
    const r = bulb.getBoundingClientRect();
    root.style.setProperty('--theme-x', `${((r.left + r.width / 2) / window.innerWidth) * 100}%`);
    root.style.setProperty('--theme-y', `${((r.top + r.height / 2) / window.innerHeight) * 100}%`);
}

/**
 * Animates the theme change: the new theme is wiped in as a circle expanding from the
 * bulb (see the ::view-transition rules in globals.css), rather than snapping.
 *
 * The callback MUST update the DOM synchronously and return. The View Transitions API
 * pauses rendering while it runs, so anything that waits on a frame — requestAnimationFrame,
 * a transition, an animation — never fires, the returned promise never settles, and the
 * browser holds the page frozen until it gives up with
 * "TimeoutError: Transition was aborted because of timeout in DOM update".
 * That is exactly the bug this file shipped with. `flushSync` forces React to commit
 * setTheme's class change before the callback returns, so there is nothing to wait for.
 *
 * Falls back to an instant switch under prefers-reduced-motion and in browsers without
 * View Transitions (Firefox).
 */
export function setThemeWithTransition(setTheme: SetTheme, next: string): void {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const supported = typeof document.startViewTransition === 'function';

    if (reduced || !supported) {
        setTheme(next);
        return;
    }

    setOrigin();

    const transition = document.startViewTransition(() => {
        flushSync(() => setTheme(next));
    });

    // An aborted/skipped transition is not an error worth surfacing as an unhandled
    // rejection — the theme still changed, we just didn't get to animate it.
    transition.finished.catch(() => {});
    transition.ready.catch(() => {});
    transition.updateCallbackDone.catch(() => {});
}
