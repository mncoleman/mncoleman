'use client';

import { ChevronDown } from 'lucide-react';
import { SelectField, type SelectOption } from '@/components/admin/fields/SelectField';
import { cn } from '@/lib/utils';

/**
 * A branded dropdown button for list headers ("All tags", "Any author"). It is the existing
 * `SelectField` (Radix popover + cmdk list: portaled, flips and shifts to stay on screen, capped
 * to the room available, arrow keys / Enter / Esc) dressed as a header button instead of a
 * property value. The first option is the "everything" one: it gets the quiet look, any other
 * choice turns the button solid-outlined so an active filter is obvious.
 */
export function SelectMenu({
    value,
    options,
    onChange,
    label,
    searchPlaceholder,
    className,
}: {
    value: string;
    /** First option = "All ..." (the unfiltered state). */
    options: SelectOption[];
    onChange: (value: string) => void;
    label: string;
    searchPlaceholder?: string;
    className?: string;
}) {
    const current = options.find((o) => o.value === value) ?? options[0];
    const active = options.length > 0 && value !== options[0].value;
    return (
        <SelectField
            aria-label={label}
            value={value}
            options={options}
            onChange={onChange}
            searchPlaceholder={searchPlaceholder}
            contentClassName="min-w-[200px]"
            className={cn(
                'mx-0 h-10 shrink-0 gap-2 rounded-lg border px-3 py-0 text-sm font-normal',
                active ? 'border-foreground/40 font-medium text-foreground' : 'border-border/60 text-foreground',
                className,
            )}
            trigger={<><span>{current?.label}</span><ChevronDown size={14} aria-hidden="true" className="text-muted-foreground" /></>}
        />
    );
}
