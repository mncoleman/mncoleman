'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { parseTypedDate as parsePartialDate } from '@/lib/citations';
import {
    MONTH_NAMES, addDays, addMonths, formatLongDate, monthGrid, parseTypedDate, partsOf, todayIso,
} from '@/lib/post-editor-logic';

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/**
 * A branded date field: a quiet button that opens a month grid. Replaces the
 * browser's own `<input type="date">`, which looks different on every machine.
 * Type a date in the box (2026-11-04, 11/4/2026, Nov 4, 2026) or pick one; arrow
 * keys move by day and week, Page Up/Down by month, Home/End to the week's ends.
 */
export function DatePicker({
    value,
    onChange,
    'aria-label': ariaLabel = 'Date',
    id,
    clearable = false,
    className,
    allowPartial = false,
    format,
}: {
    /** `YYYY-MM-DD` (a longer datetime is shown by its date); with `allowPartial` also `YYYY-MM` or `YYYY`. */
    value: string;
    onChange: (iso: string) => void;
    'aria-label'?: string;
    id?: string;
    clearable?: boolean;
    className?: string;
    /** Accept a year or a year and month alone (citations: sources often have no day). */
    allowPartial?: boolean;
    /** How a value is shown on the button (default: long date). */
    format?: (value: string) => string;
}) {
    const [open, setOpen] = useState(false);
    const selected = partsOf(value) ? value.slice(0, 10) : '';
    const partial = allowPartial && /^\d{4}(-\d{2})?$/.test(value) ? value : '';
    const shown = selected || partial;
    const show = (v: string) => (format ? format(v) : formatLongDate(v));
    const startOf = () => selected || (partial ? (partial.length === 4 ? `${partial}-01-01` : `${partial}-01`) : todayIso());
    const parse = (t: string) => (allowPartial ? parsePartialDate(t) ?? parseTypedDate(t) : parseTypedDate(t));
    const [focus, setFocus] = useState(startOf());
    const [typed, setTyped] = useState(shown);
    const [invalid, setInvalid] = useState(false);
    const gridRef = useRef<HTMLDivElement>(null);
    const wantFocus = useRef(false);
    const today = todayIso();

    const view = partsOf(focus)!;
    const cells = monthGrid(view.year, view.month0);

    useEffect(() => {
        if (open && wantFocus.current) {
            wantFocus.current = false;
            gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focus}"]`)?.focus();
        }
    });

    const choose = (iso: string) => {
        onChange(iso);
        setOpen(false);
    };

    const onGridKey = (e: React.KeyboardEvent) => {
        let next: string | null = null;
        if (e.key === 'ArrowLeft') next = addDays(focus, -1);
        else if (e.key === 'ArrowRight') next = addDays(focus, 1);
        else if (e.key === 'ArrowUp') next = addDays(focus, -7);
        else if (e.key === 'ArrowDown') next = addDays(focus, 7);
        else if (e.key === 'PageUp') next = addMonths(focus, e.shiftKey ? -12 : -1);
        else if (e.key === 'PageDown') next = addMonths(focus, e.shiftKey ? 12 : 1);
        else if (e.key === 'Home') next = addDays(focus, -new Date(view.year, view.month0, view.day).getDay());
        else if (e.key === 'End') next = addDays(focus, 6 - new Date(view.year, view.month0, view.day).getDay());
        if (next) {
            e.preventDefault();
            wantFocus.current = true;
            setFocus(next);
        }
    };

    return (
        <Popover
            open={open}
            onOpenChange={(o) => {
                if (o) {
                    setFocus(startOf());
                    setTyped(shown);
                    setInvalid(false);
                    wantFocus.current = true;
                }
                setOpen(o);
            }}
        >
            <PopoverTrigger asChild>
                <button
                    id={id}
                    type="button"
                    aria-label={`${ariaLabel}: ${shown ? show(shown) : 'empty'}`}
                    aria-haspopup="dialog"
                    aria-expanded={open}
                    className={cn(
                        '-mx-2 inline-flex min-h-[26px] max-w-full items-center rounded-[5px] px-2 py-[3px] text-left text-sm tabular-nums outline-none transition-colors hover:bg-foreground/[0.07] focus-visible:ring-2 focus-visible:ring-ring',
                        !shown && 'text-muted-foreground',
                        className,
                    )}
                >
                    {shown ? show(shown) : 'Empty'}
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                collisionPadding={12}
                aria-label="Choose a date"
                role="dialog"
                className="w-[280px] rounded-[10px] p-2.5 shadow-xl"
                onOpenAutoFocus={(e) => {
                    e.preventDefault();
                    gridRef.current?.querySelector<HTMLButtonElement>(`[data-iso="${focus}"]`)?.focus();
                }}
            >
                <div className="mb-2 flex items-center justify-between text-sm">
                    <button type="button" aria-label="Previous month" onClick={() => setFocus(addMonths(focus, -1))} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                        <ChevronLeft size={16} />
                    </button>
                    <strong className="font-medium" aria-live="polite">{MONTH_NAMES[view.month0]} {view.year}</strong>
                    <button type="button" aria-label="Next month" onClick={() => setFocus(addMonths(focus, 1))} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                        <ChevronRight size={16} />
                    </button>
                </div>
                <input
                    value={typed}
                    onChange={(e) => { setTyped(e.target.value); setInvalid(false); }}
                    onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        e.preventDefault();
                        const iso = parse(typed);
                        if (iso) choose(iso); else setInvalid(true);
                    }}
                    placeholder={allowPartial ? 'Type a date, e.g. 2025, 2025-05 or 2025-05-20' : 'Type a date, e.g. 2026-11-04'}
                    aria-label="Type a date"
                    aria-invalid={invalid || undefined}
                    spellCheck={false}
                    autoComplete="off"
                    className={cn('mb-2 w-full rounded-md border border-input bg-background px-2 py-1 text-[13px] outline-none focus:border-ring', invalid && 'border-red-500')}
                />
                {invalid && <p role="alert" className="-mt-1 mb-2 text-xs text-red-600 dark:text-red-400">That is not a date. Try 2026-11-04.</p>}
                <div className="grid grid-cols-7 gap-0.5" aria-hidden="true">
                    {WEEKDAYS.map((d) => <span key={d} className="py-0.5 text-center text-[11px] text-muted-foreground">{d}</span>)}
                </div>
                <div ref={gridRef} role="grid" aria-label={`${MONTH_NAMES[view.month0]} ${view.year}`} className="grid grid-cols-7 gap-0.5" onKeyDown={onGridKey}>
                    {cells.map((c) => (
                        <button
                            key={c.iso}
                            type="button"
                            data-iso={c.iso}
                            tabIndex={c.iso === focus ? 0 : -1}
                            aria-pressed={c.iso === selected}
                            aria-label={formatLongDate(c.iso)}
                            onClick={() => choose(c.iso)}
                            className={cn(
                                'h-8 rounded-md text-[13px] tabular-nums outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                                !c.inMonth && 'text-muted-foreground opacity-55',
                                c.iso === today && 'shadow-[inset_0_0_0_1px_hsl(var(--muted-foreground))]',
                                c.iso === selected && 'bg-primary text-primary-foreground opacity-100 hover:bg-primary',
                            )}
                        >
                            {c.day}
                        </button>
                    ))}
                </div>
                <div className="mt-2 flex flex-wrap justify-between gap-1 border-t border-border pt-2">
                    {allowPartial && (
                        <>
                            <button type="button" onClick={() => choose(`${view.year}-${String(view.month0 + 1).padStart(2, '0')}`)} className="rounded-[5px] px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Month only</button>
                            <button type="button" onClick={() => choose(String(view.year))} className="rounded-[5px] px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Year only</button>
                        </>
                    )}
                    <button type="button" onClick={() => choose(today)} className="rounded-[5px] px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Today</button>
                    {clearable && <button type="button" onClick={() => choose('')} className="rounded-[5px] px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Clear</button>}
                </div>
            </PopoverContent>
        </Popover>
    );
}
