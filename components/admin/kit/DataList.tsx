'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The bordered, table-like list every admin section uses.
 *
 *   <DataList cols="minmax(0,2.4fr) minmax(0,1.4fr) 140px 130px 40px" label="Projects">
 *     <ColumnHeader labels={['Name', 'Tags', 'Date', 'Status', '']} />
 *     <DataRow href="/admin/projects/edit?id=x">
 *       <RowTitle title="Verses" subtitle="/projects/verses/" />
 *       <Cell><ChipRow tags={...} /></Cell>
 *       <Cell>Nov 3, 2026</Cell>
 *       <Cell><StatusPill published /></Cell>
 *       <Cell end><RowAction path="/projects/verses/" state={{ live: true }} /></Cell>
 *     </DataRow>
 *   </DataList>
 *
 * `cols` is a CSS grid-template-columns shared by the header and every row (one variable, so they
 * always line up). Under 700px the header disappears and each row stacks: the title cell on its own
 * line, the other cells wrapping underneath, the action pinned right.
 * Each row carries `data-row` and one focusable `[data-row-link]` so `useListKeyboard` can move focus between rows.
 */
export function DataList({ cols, label, children, className }: { cols: string; label: string; children: ReactNode; className?: string }) {
    return (
        <div role="list" aria-label={label} style={{ '--cols': cols } as CSSProperties} className={cn('overflow-hidden rounded-[10px] border border-border/60', className)} data-list>
            {children}
        </div>
    );
}

export function ColumnHeader({ labels }: { labels: string[] }) {
    return (
        <div aria-hidden="true" className="grid h-[38px] items-center gap-4 border-b border-border/60 bg-muted/35 px-5 text-xs font-medium text-muted-foreground [grid-template-columns:var(--cols)] max-[699px]:hidden">
            {labels.map((l, i) => <div key={i} className="min-w-0 truncate">{l}</div>)}
        </div>
    );
}

/**
 * One row. Structure (valid HTML, keyboard friendly):
 *
 *   <div role="listitem" class="relative">     the row: layout, hover, the cells
 *     ...cells (RowTitle, Cell...)
 *     <a href data-row-link aria-label>        a stretched overlay link: the one tab stop that opens the row
 *       (or <button data-row-link> when given `onOpen` instead of `href`)
 *     <button> RowAction                       a sibling above the overlay (z-[2]), never nested in the link
 *   </div>
 *
 * `label` names the link for screen readers (the record's title; pass it, the fallback is just "Open"). Tab reaches each row's link, Enter opens it,
 * and the RowAction button copies on Enter/Space without opening the row. `useListKeyboard` moves focus between
 * `[data-row-link]` elements.
 */
export function DataRow({ href, onOpen, label, active, children, className }: { href?: string; onOpen?: () => void; label?: string; active?: boolean; children: ReactNode; className?: string }) {
    const cls = cn(
        'group/row relative grid min-h-[68px] items-center gap-4 border-b border-border/60 px-5 text-inherit transition-colors [grid-template-columns:var(--cols)] last:border-b-0',
        'hover:bg-foreground/[0.045] has-[[data-row-link]:focus-visible]:bg-foreground/[0.045] has-[[data-row-link]:focus-visible]:shadow-[inset_2px_0_0_hsl(var(--ring))]',
        'max-[699px]:flex max-[699px]:min-h-0 max-[699px]:flex-wrap max-[699px]:gap-x-2.5 max-[699px]:gap-y-1.5 max-[699px]:px-4 max-[699px]:py-3',
        active && 'bg-foreground/[0.045]',
        className,
    );
    const overlay = 'absolute inset-0 z-[1] cursor-pointer outline-none';
    return (
        <div role="listitem" data-row className={cls}>
            {children}
            {href
                ? <Link href={href} data-row-link aria-label={label || 'Open'} className={overlay} />
                : <button type="button" data-row-link aria-label={label || 'Open'} onClick={onOpen} className={cn(overlay, 'w-full')} />}
        </div>
    );
}

/** The first cell: a bold title (with optional inline badges) over a quiet subtitle. */
export function RowTitle({ title, subtitle, badges, subtitleClassName, subtitleTitle }: { title: ReactNode; subtitle?: ReactNode; badges?: ReactNode; subtitleClassName?: string; subtitleTitle?: string }) {
    return (
        <div className="min-w-0 max-[699px]:basis-full">
            <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap text-[15px] font-medium">
                <span className="truncate">{title}</span>
                {badges}
            </div>
            {subtitle && <div title={subtitleTitle} className={cn('mt-px truncate text-xs text-muted-foreground', subtitleClassName)}>{subtitle}</div>}
        </div>
    );
}

/** A plain cell. `end` right-aligns it and (on phones) pushes it to the line's right edge, for the row action. */
export function Cell({ children, end, className }: { children?: ReactNode; end?: boolean; className?: string }) {
    return (
        <div className={cn('flex min-w-0 flex-wrap items-center gap-1.5 text-sm text-muted-foreground max-[699px]:text-[13px]', end && 'justify-end max-[699px]:ml-auto', className)}>
            {children}
        </div>
    );
}
