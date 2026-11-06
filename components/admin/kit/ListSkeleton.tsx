'use client';

import { cn } from '@/lib/utils';

/** Shimmer placeholder rows shaped like a `DataList` (same `cols`), shown while a list loads. Under 700px they stack. */
export function ListSkeleton({ cols, rows = 6 }: { cols: string; rows?: number }) {
    const n = cols.split(/\s+(?![^()]*\))/).length;
    return (
        <div aria-busy="true" aria-label="Loading" role="status" style={{ '--cols': cols } as React.CSSProperties} className="overflow-hidden rounded-[10px] border border-border/60">
            {Array.from({ length: rows }, (_, r) => (
                <div key={r} className="grid min-h-[68px] items-center gap-4 border-b border-border/60 px-5 last:border-b-0 [grid-template-columns:var(--cols)] max-[699px]:flex max-[699px]:flex-col max-[699px]:items-start max-[699px]:gap-2 max-[699px]:px-4 max-[699px]:py-3.5">
                    {Array.from({ length: Math.min(n, 4) }, (_, c) => (
                        <span key={c} className={cn('block h-3.5 animate-pulse rounded bg-muted', c === 0 ? 'w-[60%] max-[699px]:w-[70%]' : 'w-[50%] max-[699px]:w-[40%]')} />
                    ))}
                </div>
            ))}
        </div>
    );
}
