/**
 * Properties drawer state rules (pure). The drawer is a side column from 1100px up, an overlay
 * below that, and a true modal dialog on phones (below 768px) where it covers the whole app.
 * The open/closed choice is remembered in localStorage only from the wide layout, so opening it
 * briefly on a small screen never changes what a desktop visit starts with.
 */

export const DRAWER_WIDE = 1100;
export const DRAWER_MODAL_BELOW = 768;
export const DRAWER_STORAGE_KEY = 'pe-props-open';

/** Open or closed on first render. `stored` is the raw localStorage value ('1' | '0' | null); a missing one means open on wide screens. */
export function initialDrawerOpen(width: number, stored: string | null): boolean {
    if (width < DRAWER_WIDE) return false;
    return stored === null ? true : stored === '1';
}

export function shouldPersist(width: number): boolean {
    return width >= DRAWER_WIDE;
}

export function isOverlay(width: number): boolean {
    return width < DRAWER_WIDE;
}

export function isModalWidth(width: number): boolean {
    return width < DRAWER_MODAL_BELOW;
}

/** Esc closes the drawer only when it covers the page (overlay widths) and focus is inside it or it is modal. */
export function escapeClosesDrawer(opts: { width: number; open: boolean; modal: boolean; focusInside: boolean; defaultPrevented: boolean }): boolean {
    return !opts.defaultPrevented && opts.open && isOverlay(opts.width) && (opts.modal || opts.focusInside);
}
