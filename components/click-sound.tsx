'use client';

import { useEffect } from 'react';
import { playClick, preloadClickSound, restoreMuted } from '@/lib/click-sound';

/**
 * Gives every clickable thing on the site a keyboard-switch sound. Renders
 * nothing.
 *
 * Deliberately ONE delegated listener rather than a hook wired into each
 * component: there are a few hundred interactive elements across the site, most
 * of them links inside mapped lists, and per-element handlers would mean touching
 * every one of them and paying for a closure per element per render. A single
 * passive capture listener on the document costs one `closest()` per press.
 *
 * Capture, not bubble, so a handler that stops propagation (the nav does, the
 * modals do) cannot silence its own button.
 */

/**
 * What counts as clickable. Roles are included because half the interactive
 * surface here is shadcn, which builds switches and tabs out of divs.
 *
 * `.cursor-pointer` is NOT in this list even though it looks tempting — it is
 * used decoratively in a few places and would fire on things that do nothing.
 * Anything genuinely clickable that this misses can opt in with
 * `data-click-sound`, and anything caught wrongly opts out with
 * `data-click-sound="off"`.
 */
const CLICKABLE = [
    'a[href]',
    'button',
    'summary',
    'select',
    'label[for]',
    'input[type="checkbox"]',
    'input[type="radio"]',
    'input[type="submit"]',
    'input[type="button"]',
    '[role="button"]',
    '[role="link"]',
    '[role="menuitem"]',
    '[role="menuitemradio"]',
    '[role="option"]',
    '[role="switch"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="tab"]',
    '[data-click-sound]:not([data-click-sound="off"])',
].join(',');

/** Keys that produce nothing on their own, so should sound like nothing. */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Dead']);

function shouldSound(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;

    const hit = target.closest(CLICKABLE);
    if (!hit) return false;
    if (hit.closest('[data-click-sound="off"]')) return false;

    // A disabled control does nothing, so it should sound like nothing.
    if (hit.hasAttribute('disabled') || hit.getAttribute('aria-disabled') === 'true') return false;

    return true;
}

export function ClickSound() {
    useEffect(() => {
        restoreMuted();

        // Fetch the sprite when the browser is otherwise idle, so it never
        // competes with the page's own work. `requestIdleCallback` is still
        // missing in Safari, hence the timeout.
        const canIdle = typeof window.requestIdleCallback === 'function';
        const idle = canIdle
            ? window.requestIdleCallback(() => preloadClickSound(), { timeout: 4000 })
            : window.setTimeout(() => preloadClickSound(), 2000);

        // `pointerdown`, not `click`: the sound belongs to the press, and waiting
        // for the release puts an audible lag on it. It also means the sound
        // still fires for a press that ends up being cancelled, which is what a
        // real key does.
        const onPointerDown = (e: PointerEvent) => {
            if (e.button !== 0 && e.pointerType === 'mouse') return;
            if (shouldSound(e.target)) playClick();
        };

        const onKeyDown = (e: KeyboardEvent) => {
            // A held key repeats; a real switch does not re-click while held.
            if (e.repeat) return;
            // Not `as HTMLElement`: with nothing focused the target can be the
            // Document itself, which has no `closest` — and this listener runs
            // in the capture phase, so throwing here would take out every
            // keydown handler on the page, not just the sound.
            const target = e.target;
            if (!(target instanceof HTMLElement)) return;

            // A field that opts in sounds like a keyboard: every key, including
            // backspace and the arrows, because that is what a keyboard does.
            // Only the bare modifiers are silent — nothing moves when you press
            // Shift on its own.
            if (target.closest('[data-click-sound-typing]')) {
                if (MODIFIERS.has(e.key)) return;
                // A shade under the click level. The same sound at the same
                // volume ten times a second is the difference between a texture
                // and a nuisance.
                playClick(0.7);
                return;
            }

            // Everywhere else, only the two keys that actually activate a
            // control — and never inside a text field, or typing anywhere on the
            // site would trip it.
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (
                target.isContentEditable ||
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA'
            ) {
                return;
            }
            if (shouldSound(target)) playClick();
        };

        document.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
        document.addEventListener('keydown', onKeyDown, { capture: true, passive: true });

        return () => {
            if (canIdle) window.cancelIdleCallback(idle);
            else window.clearTimeout(idle);
            document.removeEventListener('pointerdown', onPointerDown, { capture: true });
            document.removeEventListener('keydown', onKeyDown, { capture: true });
        };
    }, []);

    return null;
}
