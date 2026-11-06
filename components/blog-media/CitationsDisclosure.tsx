'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * The "Citations (N)" toggle at the end of a post. A real <details>, so it opens and closes with
 * no JavaScript; the script only adds `aria-expanded` and opens the list when a marker (or a
 * link with the entry's hash) points inside it, since browsers differ on opening <details> for
 * fragment navigation. It also owns the touch behaviour of the marker cards: with no hover, the
 * first tap on a marker that links out opens its card (Open source / Go to citation), and a second
 * tap follows the link. Mouse and keyboard users are unaffected (the card is CSS hover/focus).
 */
export function CitationsDisclosure({ count, children }: { count: number; children: ReactNode }) {
    const ref = useRef<HTMLDetailsElement>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const details = ref.current;
        if (!details) return;
        const openForHash = () => {
            const id = decodeURIComponent(window.location.hash.slice(1));
            const target = id ? document.getElementById(id) : null;
            if (target && details.contains(target) && !details.open) {
                details.open = true;
                setOpen(true);
                requestAnimationFrame(() => target.scrollIntoView({ block: 'center' }));
            }
        };
        const touch = window.matchMedia('(hover: none)');
        const closeCards = (except?: Element | null) => {
            document.querySelectorAll('.cite-wrap[data-open]').forEach((w) => { if (w !== except) w.removeAttribute('data-open'); });
        };
        const onClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            const marker = target?.closest?.('a.cite-ref') as HTMLElement | null;
            const wrap = marker?.closest('.cite-wrap') ?? null;
            if (touch.matches && marker && wrap && marker.getAttribute('target') === '_blank' && !wrap.hasAttribute('data-open')) {
                // First tap: show the card instead of leaving the page.
                e.preventDefault();
                closeCards(wrap);
                wrap.setAttribute('data-open', '');
                return;
            }
            if (!target?.closest?.('.cite-card')) closeCards(marker ? wrap : null);
            else if (target.closest('a')) closeCards();
            const a = target?.closest?.('a[data-footnote-ref], a[data-cite-go]');
            // A marker that opens an outside address (href not "#...") leaves the list alone.
            if (a && a.getAttribute('href')?.startsWith('#') && !details.open) {
                // Open before the browser follows the link, so the target has a layout to scroll to.
                details.open = true;
                setOpen(true);
            }
        };
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeCards(); };
        openForHash();
        window.addEventListener('hashchange', openForHash);
        document.addEventListener('click', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('hashchange', openForHash);
            document.removeEventListener('click', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, []);

    return (
        <details ref={ref} className="post-cites not-prose" onToggle={(e) => setOpen(e.currentTarget.open)}>
            <summary aria-expanded={open}>
                <span>Citations ({count})</span>
            </summary>
            {children}
        </details>
    );
}
