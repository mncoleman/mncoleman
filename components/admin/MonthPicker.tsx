'use client';

import { useState } from 'react';
import { CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Month + year picker in the site's own style, replacing the browser's native
 * `<input type="month">` popup. Projects are dated to the month, which is all
 * the site ever shows ("September 2026"), so a day grid would be noise.
 *
 * Value is `YYYY-MM-01` or '' — the shape `data/projects.json` already uses.
 */
export function MonthPicker({ value, onChange }: { value: string; onChange: (next: string) => void }) {
    const [open, setOpen] = useState(false);
    const selected = value.match(/^(\d{4})-(\d{2})/);
    const selYear = selected ? Number(selected[1]) : null;
    const selMonth = selected ? Number(selected[2]) - 1 : null;
    const [year, setYear] = useState(selYear ?? new Date().getFullYear());

    const label = selYear !== null && selMonth !== null
        ? `${new Date(selYear, selMonth, 1).toLocaleDateString(undefined, { month: 'long' })} ${selYear}`
        : 'Pick a month';

    const pick = (m: number) => {
        onChange(`${year}-${String(m + 1).padStart(2, '0')}-01`);
        setOpen(false);
    };

    const now = new Date();

    return (
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o && selYear !== null) setYear(selYear); }}>
            <PopoverTrigger asChild>
                <Button type="button" variant="outline" className={cn('w-full justify-start gap-2 font-normal', !value && 'text-muted-foreground')}>
                    <CalendarIcon size={14} />
                    {label}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3" align="start">
                <div className="mb-2 flex items-center justify-between">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
                        <ChevronLeft size={14} />
                    </Button>
                    <span className="text-sm font-medium tabular-nums">{year}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
                        <ChevronRight size={14} />
                    </Button>
                </div>
                <div className="grid grid-cols-4 gap-1">
                    {MONTHS.map((m, i) => {
                        const on = year === selYear && i === selMonth;
                        const current = year === now.getFullYear() && i === now.getMonth();
                        return (
                            <button
                                key={m}
                                type="button"
                                onClick={() => pick(i)}
                                className={cn(
                                    'rounded-md px-2 py-1.5 text-sm transition-colors',
                                    on ? 'bg-foreground text-background' : 'hover:bg-accent',
                                    current && !on && 'ring-1 ring-border'
                                )}
                            >
                                {m}
                            </button>
                        );
                    })}
                </div>
                <div className="mt-2 flex items-center justify-between">
                    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground" onClick={() => { onChange(''); setOpen(false); }}>
                        <X size={12} /> Clear
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setYear(now.getFullYear()); pick(now.getMonth()); }}>
                        This month
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
