'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * A row of pills that stays on one line. When the pills do not fit, the overflow fades
 * and blurs out at the right edge and a chevron opens the row up into wrapped lines;
 * the height eases open and shut. When everything fits it is just a centred row with no
 * chevron, so wide screens look exactly as before.
 *
 * `label` sits outside the clipped area so it never scrolls or fades with the pills.
 */
export function CollapsibleRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
    const clipRef = useRef<HTMLDivElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = useState(false);
    const [overflowing, setOverflowing] = useState(false);
    const [height, setHeight] = useState<number | undefined>(undefined);

    useLayoutEffect(() => {
        const clip = clipRef.current;
        const inner = innerRef.current;
        if (!clip || !inner) return;
        const measure = () => {
            const first = inner.firstElementChild as HTMLElement | null;
            const row = first ? first.offsetHeight + 8 : 0; // + the inner py-1
            // Overflow is judged on the single-line layout; once open the row wraps,
            // so keep the last collapsed answer instead of re-deciding from it.
            if (!expanded) setOverflowing(inner.scrollWidth > clip.clientWidth + 1);
            setHeight(expanded ? inner.scrollHeight : row);
        };
        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(clip);
        ro.observe(inner);
        return () => ro.disconnect();
    }, [expanded, children]);

    return (
        <div className={cn('flex w-full max-w-3xl items-start gap-2', !overflowing && 'justify-center')}>
            <div className="flex h-10 shrink-0 items-center gap-2 text-sm font-medium text-muted-foreground">{label}</div>
            <div
                ref={clipRef}
                className={cn('relative overflow-hidden transition-[height] duration-300 ease-out', overflowing ? 'min-w-0 flex-1' : 'min-w-0')}
                style={{ height }}
            >
                <div
                    ref={innerRef}
                    // py/px give the pills' focus rings and shadows room inside the clip.
                    className={cn('flex gap-2 px-1 py-1', expanded ? 'flex-wrap' : 'flex-nowrap')}
                >
                    {children}
                </div>
                {overflowing && !expanded && (
                    <div
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-r from-transparent to-background backdrop-blur-[3px] [mask-image:linear-gradient(to_right,transparent,black_70%)]"
                    />
                )}
            </div>
            {overflowing && (
                <div className="flex h-10 shrink-0 items-center">
                <button
                    type="button"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                    aria-label={expanded ? 'Show fewer filters' : 'Show all filters'}
                    title={expanded ? 'Show fewer' : 'Show all'}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/50 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                    <ChevronDown className={cn('h-4 w-4 transition-transform duration-300', expanded && 'rotate-180')} />
                </button>
                </div>
            )}
        </div>
    );
}
