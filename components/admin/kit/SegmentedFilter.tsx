'use client';

import { cn } from '@/lib/utils';

/**
 * Segmented control: All / Published / Drafts in the list header (`size="lg"`), or Write /
 * Preview in an editor (`size="sm"`). Plain buttons with `aria-pressed`, so it is keyboard and
 * screen-reader friendly without a native select.
 */
export function SegmentedFilter<T extends string>({
    value,
    onChange,
    options,
    label,
    size = 'lg',
}: {
    value: T;
    onChange: (v: T) => void;
    options: { value: T; label: string }[];
    label: string;
    size?: 'lg' | 'sm';
}) {
    return (
        <div role="group" aria-label={label} className={cn('inline-flex shrink-0 gap-0.5 rounded-lg border border-border/60', size === 'lg' ? 'p-[3px]' : 'p-0.5')}>
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    aria-pressed={value === o.value}
                    onClick={() => onChange(o.value)}
                    className={cn(
                        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                        size === 'lg' ? 'h-8 px-3.5 max-[699px]:px-2.5' : 'h-7 px-3',
                        value === o.value ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
