'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Pill colours. The text and background are mixed from one hex so every tone reads in light and dark. */
export const PILL_TONES = {
    ok: '#22c55e',
    warn: '#f59e0b',
    info: '#38bdf8',
    danger: '#ef4444',
    violet: '#a78bfa',
    neutral: '#737373',
} as const;

export type PillTone = keyof typeof PILL_TONES;

/**
 * A rounded status label with a dot: `<StatusPill tone="ok">Live</StatusPill>`.
 * `<StatusPill published={row.published} />` is the shortcut every content list uses
 * (green Published, amber Draft).
 */
export function StatusPill({
    tone,
    published,
    children,
    className,
}: { tone?: PillTone; published?: boolean; children?: ReactNode; className?: string }) {
    const t: PillTone = tone ?? (published ? 'ok' : 'warn');
    const c = PILL_TONES[t];
    return (
        <span
            className={cn('inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-[11px] pl-[7px] pr-[9px] text-[13px]', className)}
            style={{ background: `color-mix(in srgb, ${c} 16%, transparent)`, color: `color-mix(in srgb, ${c} 60%, hsl(var(--foreground)))` }}
        >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
            {children ?? (published ? 'Published' : 'Draft')}
        </span>
    );
}
