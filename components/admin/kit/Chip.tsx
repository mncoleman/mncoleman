'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { tagHue } from '@/lib/post-editor-logic';

/**
 * A small coloured label. Tag chips take their colour from the text (`tagHue`, so "web" is the
 * same colour on every page); pass `hue` for a fixed one. With `onRemove` it grows an x button.
 * `More` is the quiet "+2" chip a list row shows when a record has more tags than fit.
 */
export function Chip({ children, hue, onRemove, removeLabel }: { children: string; hue?: string; onRemove?: () => void; removeLabel?: string }) {
    const h = hue ?? tagHue(children);
    return (
        <span
            className={cn('inline-flex h-[22px] items-center gap-0.5 whitespace-nowrap rounded text-[13px]', onRemove ? 'pl-2 pr-1' : 'px-2')}
            style={{ background: `color-mix(in srgb, ${h} 18%, transparent)`, color: `color-mix(in srgb, ${h} 55%, hsl(var(--foreground)))` }}
        >
            {children}
            {onRemove && (
                <button type="button" onClick={onRemove} aria-label={removeLabel ?? `Remove ${children}`} className="grid place-items-center rounded-[3px] p-0.5 opacity-50 outline-none hover:bg-foreground/[0.08] hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring">
                    <X size={12} />
                </button>
            )}
        </span>
    );
}

/** The "+N" overflow chip: neutral grey, not removable. */
export function MoreChip({ count }: { count: number }) {
    return <Chip hue="#737373">{`+${count}`}</Chip>;
}

/** Up to `max` tag chips and a "+N" for the rest: what list rows show in a Tags column. */
export function ChipRow({ tags, max = 3 }: { tags: string[]; max?: number }) {
    if (tags.length === 0) return <span className="text-muted-foreground/60">None</span>;
    return (
        <>
            {tags.slice(0, max).map((t) => <Chip key={t}>{t}</Chip>)}
            {tags.length > max && <MoreChip count={tags.length - max} />}
        </>
    );
}
