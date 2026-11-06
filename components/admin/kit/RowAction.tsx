'use client';

import { Check, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCopyLink } from './use-copy-link';
import type { LinkState } from './copy-link';

/**
 * "Copy link" for one record. `path` is the public path (`/blog/my-post/`), `state` says whether
 * it is live / password-protected so the toast can be honest about it.
 *
 * - `variant="row"` (default): a 32px icon button in the last column of a `DataRow`. Hidden until the
 *   row is hovered or focused on desktop, always visible on touch and on phone widths. It never opens the row.
 * - `variant="button"`: the labelled button beside an editor's title.
 */
export function RowAction({ path, state, variant = 'row', className }: { path: string; state: LinkState; variant?: 'row' | 'button'; className?: string }) {
    const { copy, copied } = useCopyLink();
    const done = copied === path;
    const onClick = (e: React.MouseEvent) => {
        // The overlay link is a sibling, so this click never reaches it; stop anyway in case a parent handles clicks.
        e.stopPropagation();
        void copy(path, state);
    };
    if (variant === 'button') {
        return (
            <button
                type="button"
                onClick={onClick}
                aria-label="Copy link"
                className={cn('inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-border px-3 text-[13px] font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring', done && 'text-emerald-600 dark:text-emerald-400', className)}
            >
                {done ? <Check size={15} /> : <Link2 size={15} />}
                <span className="max-[699px]:hidden">Copy link</span>
            </button>
        );
    }
    return (
        <button
            type="button"
            data-tip={done ? 'Copied' : 'Copy link'}
            aria-label="Copy link"
            onClick={onClick}
            className={cn(
                'relative z-[2] inline-grid h-8 w-8 place-items-center rounded-md text-muted-foreground outline-none transition-[opacity,background-color] hover:bg-foreground/[0.08] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
                'opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 focus-visible:opacity-100',
                '[@media(hover:none)]:opacity-100 max-[699px]:opacity-100',
                done && 'text-emerald-600 opacity-100 dark:text-emerald-400',
                // Tooltip: pure CSS from data-tip, left of the button.
                'after:pointer-events-none after:absolute after:right-[calc(100%+6px)] after:top-1/2 after:z-10 after:-translate-y-1/2 after:whitespace-nowrap after:rounded-md after:bg-primary after:px-2 after:py-1.5 after:text-xs after:leading-none after:text-primary-foreground after:opacity-0 after:transition-opacity after:content-[attr(data-tip)] hover:after:opacity-100 focus-visible:after:opacity-100 [@media(hover:none)]:after:hidden max-[699px]:after:hidden',
                className,
            )}
        >
            {done ? <Check size={16} /> : <Link2 size={16} />}
        </button>
    );
}
