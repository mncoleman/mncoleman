'use client';

import { useState, type ReactNode } from 'react';
import { Command as CommandPrimitive } from 'cmdk';
import { Check } from 'lucide-react';
import { Command, CommandEmpty, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface SelectOption {
    value: string;
    /** Plain text: what search matches and what screen readers announce. */
    label: string;
    /** Optional richer row (avatar, pill). Falls back to the label. */
    render?: ReactNode;
}

/**
 * A branded single-choice field: a quiet button that opens a list (type to search
 * when `searchPlaceholder` is given). Keyboard: arrows move, Enter chooses, Esc closes.
 * Replaces the browser's native `<select>`.
 */
export function SelectField({
    value,
    options,
    onChange,
    trigger,
    searchPlaceholder,
    'aria-label': ariaLabel,
    id,
    className,
    contentClassName,
}: {
    value: string;
    options: SelectOption[];
    onChange: (value: string) => void;
    /** What the button shows. Defaults to the chosen option's row. */
    trigger?: ReactNode;
    searchPlaceholder?: string;
    'aria-label': string;
    id?: string;
    className?: string;
    contentClassName?: string;
}) {
    const [open, setOpen] = useState(false);
    const current = options.find((o) => o.value === value);
    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    id={id}
                    type="button"
                    aria-label={`${ariaLabel}: ${current?.label ?? 'none'}`}
                    aria-haspopup="listbox"
                    aria-expanded={open}
                    className={cn(
                        '-mx-2 inline-flex min-h-[26px] max-w-full items-center gap-2 rounded-[5px] px-2 py-[3px] text-left text-sm outline-none transition-colors hover:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring',
                        className,
                    )}
                >
                    {trigger ?? current?.render ?? current?.label ?? <span className="text-muted-foreground">Empty</span>}
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" collisionPadding={8} className={cn('w-[var(--radix-popover-trigger-width)] min-w-[240px] rounded-[10px] p-1 shadow-xl', contentClassName)}>
                <Command className="bg-transparent" defaultValue={value ? `${current?.label ?? value}` : undefined}>
                    {/* cmdk wires arrow keys and Enter through its input, so it is always present; hidden when search is off. */}
                    <CommandPrimitive.Input
                        autoFocus
                        placeholder={searchPlaceholder}
                        aria-label={searchPlaceholder || `Choose: ${ariaLabel}`}
                        className={searchPlaceholder
                            ? 'mb-1 w-[calc(100%-4px)] mx-0.5 rounded-md border border-input bg-background px-2 py-1 text-[13px] outline-none focus:border-ring'
                            : 'sr-only'}
                    />
                    <CommandList className="max-h-[min(300px,calc(var(--radix-popover-content-available-height)-3.5rem))]">
                        <CommandEmpty>Nothing found.</CommandEmpty>
                        {options.map((o) => (
                            <CommandItem
                                key={o.value}
                                value={o.label}
                                onSelect={() => { onChange(o.value); setOpen(false); }}
                                className="gap-2.5 rounded-md py-1.5 text-sm data-[selected=true]:bg-muted"
                            >
                                {o.render ?? o.label}
                                <span className="flex-1" />
                                {o.value === value && <Check size={14} aria-hidden="true" />}
                            </CommandItem>
                        ))}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
