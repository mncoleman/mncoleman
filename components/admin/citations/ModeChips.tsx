'use client';

import { cn } from '@/lib/utils';

/** The "Verse | Citation" switch at the top of the `@` popup. Tab flips it from the keyboard. */
export function ModeChips({ mode, onVerse, onCitation }: { mode: 'verse' | 'cite'; onVerse?: () => void; onCitation?: () => void }) {
    const chip = (id: 'verse' | 'cite', label: string, on?: () => void) => (
        <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            tabIndex={-1}
            onMouseDown={(e) => {
                e.preventDefault();
                if (mode !== id) on?.();
            }}
            className={cn(
                'rounded-full px-2.5 py-0.5 text-xs text-muted-foreground hover:text-foreground',
                mode === id && 'bg-muted font-medium text-foreground',
            )}
        >
            {label}
        </button>
    );
    return (
        <div role="tablist" aria-label="Insert" className="flex gap-1 px-3 pt-2">
            {chip('verse', 'Verse', onVerse)}
            {chip('cite', 'Citation', onCitation)}
        </div>
    );
}
