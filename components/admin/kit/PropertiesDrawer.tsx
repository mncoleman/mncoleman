'use client';

import { createPortal } from 'react-dom';
import { forwardRef, useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type RefObject } from 'react';
import { PanelRight, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    DRAWER_MODAL_BELOW, DRAWER_STORAGE_KEY, escapeClosesDrawer, initialDrawerOpen, shouldPersist,
} from './drawer-state';

/**
 * The collapsible right-hand Properties drawer (extracted from PostEditor; same behaviour).
 *
 *   const drawer = usePropertiesDrawer({ enabled: view === 'write' });
 *   <main data-drawer-inert ...>page</main>
 *   <PropertiesDrawer drawer={drawer} label="Project properties">
 *       <PropRow icon={Tag} label="Tags">...</PropRow>
 *   </PropertiesDrawer>
 *   // the toggle: <PropertiesToggle drawer={drawer} /> in your own top bar, or inside <TopBarSlot> to land in the shell's.
 *
 * - From 1100px up it is a 340px column that pushes the page; below that it slides over a dimmed scrim.
 * - Cmd/Ctrl + . toggles it. The open/closed choice is remembered in localStorage (wide screens only).
 * - Below 768px (phones, where it covers the whole app) it is a modal dialog: everything marked
 *   `data-drawer-inert` goes `inert`, Tab stays inside, Esc closes, focus returns to the toggle.
 *   Popovers opened from inside it portal to the document root at z-[100], above the drawer (z-55); they are
 *   not part of the trap, so they take focus and Esc first (Radix handles Esc and calls preventDefault, which we honour).
 * - It scrolls internally (`data-lenis-prevent`) with no visible scrollbar.
 */
export interface DrawerApi {
    open: boolean;
    setOpen: (open: boolean, persist?: boolean) => void;
    toggle: () => void;
    /** True when the drawer is open as a modal dialog (phone widths). Put `inert` on the page content when it is. */
    modal: boolean;
    enabled: boolean;
    id: string;
    toggleRef: RefObject<HTMLButtonElement | null>;
    asideRef: RefObject<HTMLElement | null>;
    closeRef: RefObject<HTMLButtonElement | null>;
}

let drawerCount = 0;

export function usePropertiesDrawer({ enabled = true, id }: { enabled?: boolean; id?: string } = {}): DrawerApi {
    // The shell only renders after the session check, so reading window in the initialiser cannot cause a hydration mismatch.
    const [open, setOpenState] = useState(() => {
        if (typeof window === 'undefined') return false;
        let stored: string | null = null;
        try { stored = localStorage.getItem(DRAWER_STORAGE_KEY); } catch { /* storage blocked */ }
        return initialDrawerOpen(window.innerWidth, stored);
    });
    const [narrow, setNarrow] = useState(false);
    const [autoId] = useState(() => `props-${++drawerCount}`);
    const toggleRef = useRef<HTMLButtonElement>(null);
    const asideRef = useRef<HTMLElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);

    const setOpen = useCallback((next: boolean, persist = true) => {
        setOpenState(next);
        if (persist && shouldPersist(window.innerWidth)) {
            try { localStorage.setItem(DRAWER_STORAGE_KEY, next ? '1' : '0'); } catch { /* the toggle still works */ }
        }
    }, []);

    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${DRAWER_MODAL_BELOW - 1}px)`);
        const sync = () => setNarrow(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);

    const modal = narrow && open && enabled;

    // Focus: into the drawer when it opens as a modal, back to the toggle when it closes.
    const wasModal = useRef(false);
    useEffect(() => {
        let t: ReturnType<typeof setTimeout> | undefined;
        // The drawer is visibility:hidden until its slide-in starts, and a hidden control cannot take focus: try again next tick.
        if (modal) t = setTimeout(() => closeRef.current?.focus(), 60);
        else if (wasModal.current) toggleRef.current?.focus();
        wasModal.current = modal;
        return () => clearTimeout(t);
    }, [modal]);

    // Everything the page marks data-drawer-inert (shell sidebar and top bar, the editor canvas) goes inert while modal.
    useEffect(() => {
        if (!modal) return;
        const els = Array.from(document.querySelectorAll<HTMLElement>('[data-drawer-inert]'));
        els.forEach((el) => el.setAttribute('inert', ''));
        return () => els.forEach((el) => el.removeAttribute('inert'));
    }, [modal]);

    // Cmd/Ctrl+. toggles; Esc closes an overlay drawer.
    useEffect(() => {
        if (!enabled) return;
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === '.') { e.preventDefault(); setOpen(!open); return; }
            if (e.key === 'Escape' && escapeClosesDrawer({
                width: window.innerWidth, open, modal,
                focusInside: !!(e.target as HTMLElement | null)?.closest?.(`#${id ?? autoId}`),
                defaultPrevented: e.defaultPrevented,
            })) {
                // Focus is held inside the drawer while it is open; the focus effect returns it to the toggle.
                // preventDefault so page-level Esc handlers (the editor's "back to the list") know it is spent.
                e.preventDefault();
                setOpen(false, false);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [enabled, open, modal, setOpen, id, autoId]);

    return { open, setOpen, toggle: () => setOpen(!open), modal, enabled, id: id ?? autoId, toggleRef, asideRef, closeRef };
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
    function IconButton({ label, children, className, ...rest }, ref) {
        return (
            <button
                ref={ref}
                type="button"
                title={label}
                aria-label={label}
                className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted aria-pressed:text-foreground', className)}
                {...rest}
            >
                {children}
            </button>
        );
    },
);

/** The panel-with-a-side-column icon that shows or hides the drawer. Renders nothing when the drawer is disabled. */
export function PropertiesToggle({ drawer, className }: { drawer: DrawerApi; className?: string }) {
    if (!drawer.enabled) return null;
    return (
        // The drawer object carries refs (for focus return); only handed on to the button, never read during render.
        // eslint-disable-next-line react-hooks/refs
        <IconButton ref={drawer.toggleRef} label="Properties (Cmd+.)" aria-pressed={drawer.open} aria-controls={drawer.id} onClick={drawer.toggle} className={className}>
            <PanelRight size={18} />
        </IconButton>
    );
}

/** Where the shell's top bar lets a page add controls (the Properties toggle). */
export const TOPBAR_SLOT_ID = 'admin-topbar-slot';

/** Renders its children into the shell's top bar, after Publish. Does nothing until the shell has mounted the slot. */
export function TopBarSlot({ children }: { children: ReactNode }) {
    const [slot, setSlot] = useState<HTMLElement | null>(null);
    // The slot lives in the shell's header, outside React's tree for this page: look it up once after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setSlot(document.getElementById(TOPBAR_SLOT_ID)); }, []);
    return slot ? createPortal(children, slot) : null;
}

export function PropertiesDrawer({ drawer, label, children }: { drawer: DrawerApi; label: string; children: ReactNode }) {
    const { open, modal, enabled, id, asideRef, closeRef, toggleRef } = drawer;
    const shown = open && enabled;
    const popoverWasOpen = useRef(false);
    const trapTab = (e: React.KeyboardEvent<HTMLElement>) => {
        const root = asideRef.current;
        if (!modal || !root || e.key !== 'Tab' || !root.contains(e.target as Node)) return;
        const items = Array.from(root.querySelectorAll<HTMLElement>('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'))
            .filter((el) => !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    return (
        <>
            {shown && (
                <div
                    className="fixed inset-0 z-[54] bg-black/40 min-[1100px]:hidden"
                    // A popover open inside the drawer is dismissed by the same press (Radix, on pointerdown): remember it was
                    // open so that click closes only the popover, not the drawer under it.
                    onPointerDownCapture={() => { popoverWasOpen.current = !!document.querySelector('[data-radix-popper-content-wrapper]'); }}
                    onClick={() => { if (popoverWasOpen.current) { popoverWasOpen.current = false; return; } drawer.setOpen(false, false); }}
                    aria-hidden="true"
                />
            )}
            <aside
                ref={asideRef}
                id={id}
                aria-label={label}
                {...(modal ? { role: 'dialog', 'aria-modal': true } : {})}
                onKeyDown={trapTab}
                className={cn(
                    'pe-drawer shrink-0 overflow-hidden bg-background',
                    'min-[1100px]:relative min-[1100px]:border-l',
                    shown ? 'min-[1100px]:w-[340px] min-[1100px]:border-border/60' : 'min-[1100px]:invisible min-[1100px]:w-0 min-[1100px]:border-transparent',
                    'max-[1099px]:fixed max-[1099px]:inset-y-0 max-[1099px]:right-0 max-[1099px]:z-[55] max-[1099px]:w-[min(360px,92vw)] max-[1099px]:border-l max-[1099px]:border-border max-[1099px]:shadow-2xl',
                    shown ? 'max-[1099px]:translate-x-0' : 'max-[1099px]:invisible max-[1099px]:translate-x-full',
                )}
                style={{ transition: 'width .2s ease, transform .2s ease, visibility .2s, border-color .2s' }}
            >
                <div className="h-full w-[340px] overflow-y-auto overflow-x-hidden px-5 pb-28 max-[1099px]:w-full" data-lenis-prevent>
                    <div className="sticky top-0 z-[2] flex h-12 items-center justify-between bg-background text-[13px] text-muted-foreground">
                        <strong className="text-[11px] font-medium uppercase tracking-wider">Properties</strong>
                        <IconButton ref={closeRef} label="Close properties (Cmd+.)" onClick={() => { drawer.setOpen(false); if (!modal) toggleRef.current?.focus(); }}><X size={16} /></IconButton>
                    </div>
                    {children}
                </div>
            </aside>
        </>
    );
}

/**
 * One row of the drawer: icon + label, then the control. The label column is a fixed 108px and truncates
 * with an ellipsis only if it truly cannot fit; the value column has `min-width: 0`, so the two can never
 * overlap at any drawer width. `stack` puts the control UNDER the label: use it for long free-text values
 * (web address, link, description, summary) where a beside-the-label control would be cramped.
 * Rows carry `data-prop-row`, `data-prop-label` and `data-prop-value` for layout tests.
 */
export function PropRow({ icon: Icon, label, stack, children }: { icon: LucideIcon; label: string; stack?: boolean; children: ReactNode }) {
    return (
        <div data-prop-row className={cn('-mx-1.5 grid min-h-[34px] items-start rounded-md px-1.5 transition-colors focus-within:bg-foreground/[0.04] hover:bg-foreground/[0.04]', stack ? 'grid-cols-1' : 'grid-cols-[108px_minmax(0,1fr)]')}>
            <div data-prop-label title={label} className={cn('flex min-w-0 items-center gap-2 text-sm text-muted-foreground', stack ? 'h-[30px]' : 'h-[34px]')}>
                <Icon size={15} aria-hidden="true" className="shrink-0" /> <span className="min-w-0 truncate">{label}</span>
            </div>
            <div data-prop-value className={cn('flex min-h-[34px] min-w-0 flex-wrap items-center gap-1', stack && 'pb-1')}>{children}</div>
        </div>
    );
}

export function PropDivider() {
    return <div className="my-2.5 h-px bg-border/60" />;
}

/** Small explanatory text under a PropRow or at the bottom of the drawer. */
export function PropNote({ children, bad, id }: { children: ReactNode; bad?: boolean; id?: string }) {
    return <div id={id} role={bad ? 'alert' : undefined} className={cn('-mt-1 pb-2 text-xs', bad ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>{children}</div>;
}
