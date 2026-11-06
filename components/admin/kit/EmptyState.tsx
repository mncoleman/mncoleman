'use client';

import type { ReactNode } from 'react';

/** Centered empty / error / not-found block: icon tile, title, one line of help, one action. */
export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: ReactNode; action?: ReactNode }) {
    return (
        <div className="px-6 py-16 text-center text-muted-foreground">
            {icon && <div className="mb-3 inline-grid h-11 w-11 place-items-center rounded-xl border border-border/60">{icon}</div>}
            <h3 className="mb-1 text-base font-medium text-foreground">{title}</h3>
            {body && <p className="mb-4 text-sm">{body}</p>}
            {action}
        </div>
    );
}
