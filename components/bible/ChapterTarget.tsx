'use client';

import { useEffect, useSyncExternalStore } from 'react';

const subscribe = (fn: () => void) => {
    window.addEventListener('hashchange', fn);
    return () => window.removeEventListener('hashchange', fn);
};
const hash = () => window.location.hash;

/**
 * Highlights the verse or range named by the URL (#v13, #v23-25), scrolls to it, and shows a
 * "view in cross referencer" link for it in the header. Without JS the CSS :target rule still
 * highlights a single verse.
 */
export function ChapterTarget({ book, chapter, count, label }: { book: string; chapter: number; count: number; label: string }) {
    const h = useSyncExternalStore(subscribe, hash, () => '');
    const m = /^#v(\d+)(?:-(\d+))?$/.exec(h);
    let start = m ? Number(m[1]) : 0;
    let end = m ? Number(m[2] ?? m[1]) : 0;
    if (start < 1 || start > count) start = end = 0;
    else end = Math.min(Math.max(end, start), count);

    useEffect(() => {
        document.querySelectorAll('.bible-verse[data-hl]').forEach((el) => el.removeAttribute('data-hl'));
        if (!start) return;
        for (let v = start; v <= end; v++) document.getElementById(`v${v}`)?.setAttribute('data-hl', '1');
        document.getElementById(`v${start}`)?.scrollIntoView({ block: 'start' });
    }, [start, end]);

    if (!start) return null;
    const range = end > start ? `${start}-${end}` : String(start);
    return (
        <p className="mt-3 text-sm text-muted-foreground">
            Selected: {label}:{range}{' '}
            <a
                href={`https://dkcoleman.com/bible?ref=${book}.${chapter}.${start}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-foreground underline underline-offset-2 hover:no-underline"
            >
                View in cross referencer
            </a>
        </p>
    );
}
