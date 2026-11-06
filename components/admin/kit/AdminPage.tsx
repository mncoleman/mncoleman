'use client';

import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Page chrome shared by every admin section. The shell supplies the scrolling column and its
 * padding; `AdminPage` just stacks the page header and its content with room at the bottom.
 */
export function AdminPage({ children, className }: { children: ReactNode; className?: string }) {
    return <div className={cn('pb-16', className)}>{children}</div>;
}

/**
 * The title row: big title, then whatever controls the page has (SearchField, SegmentedFilter,
 * SelectMenu...), then `HeaderSpacer` and the one primary action (`NewButton`). Wraps on narrow
 * screens; under 700px the title and the primary action share the first line and the search takes
 * the full second line.
 */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
    return (
        <div className="mb-5 flex flex-wrap items-center gap-3 max-[699px]:gap-2.5 max-[699px]:[&>*:not(h1)]:order-2 max-[699px]:[&>[data-primary]]:order-1">
            <h1 className="mr-3 text-2xl font-bold leading-tight tracking-[-0.02em] max-[699px]:mr-0 max-[699px]:flex-1">{title}</h1>
            {children}
        </div>
    );
}

/** Pushes everything after it (the primary action) to the right edge. */
export function HeaderSpacer() {
    return <div aria-hidden="true" className="flex-1 max-[699px]:hidden" />;
}

/** The page's one primary action ("New post"). A link when given `href`, a button when given `onClick`. */
export function NewButton({ children, href, onClick, title, disabled }: { children: ReactNode; href?: string; onClick?: () => void; title?: string; disabled?: boolean }) {
    const cls = 'h-10 gap-1.5 rounded-lg px-4 text-sm';
    return href ? (
        <Button asChild data-primary className={cls} title={title}><Link href={href}><Plus size={16} /> {children}</Link></Button>
    ) : (
        <Button data-primary onClick={onClick} disabled={disabled} className={cls} title={title}><Plus size={16} /> {children}</Button>
    );
}
