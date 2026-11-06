'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Dashboard building blocks (Overview and Analytics, phase 2). A `Section` is a bordered block with a
 * tinted header bar (title on the left, an optional link or control on the right) and a body; use
 * `padded` for free-form content and leave it off for lists of `SectionRow`s that supply their own padding.
 */
export function Section({ title, action, children, padded, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; padded?: boolean; className?: string }) {
    return (
        <section className={cn('mb-5 overflow-hidden rounded-[10px] border border-border/60 bg-background', className)}>
            <header className="flex min-h-[46px] items-center justify-between gap-3 border-b border-border/60 bg-muted/35 px-5">
                <h2 className="text-sm font-medium">{title}</h2>
                {action}
            </header>
            <div className={cn(padded && 'px-5 py-4')}>{children}</div>
        </section>
    );
}

/** A list line inside a `Section`: title over a quiet subtitle, extras on the right. Pass `href` to make it a link. */
export function SectionRow({ title, subtitle, right, href, icon }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; href?: string; icon?: ReactNode }) {
    const body = (
        <>
            {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
            <div className="min-w-0 flex-1">
                <b className="block truncate font-medium">{title}</b>
                {subtitle && <small className="block text-xs text-muted-foreground">{subtitle}</small>}
            </div>
            {right}
        </>
    );
    const cls = 'flex min-h-[56px] items-center gap-3 border-b border-border/60 px-5 py-2 text-inherit no-underline last:border-b-0';
    return href ? <Link href={href} className={cn(cls, 'transition-colors hover:bg-foreground/[0.045]')}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** A number tile: label, big value, one quiet detail line. `tone` colours the detail (up / down). With `href` it links. */
export function StatTile({ label, value, detail, tone, href }: { label: string; value: ReactNode; detail?: ReactNode; tone?: 'up' | 'down'; href?: string }) {
    const body = (
        <>
            <small className="block text-[13px] text-muted-foreground">{label}</small>
            <div className="my-1 text-[28px] font-bold leading-tight tracking-tight tabular-nums">{value}</div>
            {detail && <div className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', tone === 'up' && 'text-emerald-600 dark:text-emerald-400', tone === 'down' && 'text-red-600 dark:text-red-400')}>{detail}</div>}
        </>
    );
    const cls = 'block rounded-[10px] border border-border/60 px-5 py-4 text-inherit no-underline max-[699px]:p-3.5';
    return href ? <Link href={href} className={cn(cls, 'transition-colors hover:bg-foreground/[0.045]')}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** The responsive row of tiles: 4 across (or 5 with `cols={5}`), 2 under 1100px. */
export function StatGrid({ children, cols = 4 }: { children: ReactNode; cols?: 3 | 4 | 5 }) {
    const wide = cols === 5 ? 'grid-cols-5' : cols === 3 ? 'grid-cols-3' : 'grid-cols-4';
    return <div className={cn('mb-5 grid gap-5 max-[1099px]:grid-cols-2 max-[699px]:gap-3', wide)}>{children}</div>;
}
