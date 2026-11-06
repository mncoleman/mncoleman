'use client';

import type { ReactNode } from 'react';
import { footerText } from './list-logic';

/** The quiet line under a list: "Showing 7 of 12" on the left, optional extras (Load more, a note) on the right. */
export function ListFooter({ shown, loaded, total, note, children }: { shown: number; loaded: number; total?: number; note?: ReactNode; children?: ReactNode }) {
    return (
        <div className="mx-0.5 mt-3.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
            <span>{footerText(shown, loaded, total)}{note ? <>. {note}</> : null}</span>
            {children}
        </div>
    );
}
