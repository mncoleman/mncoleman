'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { tagChoices, tagHue } from '@/lib/post-editor-logic';

export function TagChip({ tag, onRemove, padded }: { tag: string; onRemove?: () => void; padded?: boolean }) {
    const h = tagHue(tag);
    return (
        <span
            className={cn('inline-flex h-[22px] items-center gap-0.5 rounded text-[13px]', onRemove ? 'pl-2 pr-1' : padded ? 'px-2' : 'px-2')}
            style={{ background: `color-mix(in srgb, ${h} 18%, transparent)`, color: `color-mix(in srgb, ${h} 55%, hsl(var(--foreground)))` }}
        >
            {tag}
            {onRemove && (
                <button type="button" onClick={onRemove} aria-label={`Remove ${tag}`} className="grid place-items-center rounded-[3px] p-0.5 opacity-50 outline-none hover:bg-foreground/[0.08] hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring">
                    <X size={12} />
                </button>
            )}
        </span>
    );
}

/**
 * Tags as coloured chips with a type-ahead box: pick an existing tag or create a
 * new one. Enter or comma adds, Backspace on an empty box removes the last chip,
 * arrows move through the suggestions, Esc closes them.
 */
export function TagCombobox({
    value,
    options,
    onChange,
    placeholder = 'Add tag…',
    'aria-label': ariaLabel = 'Add tag',
}: {
    value: string[];
    /** Every tag in use across the site. */
    options: string[];
    onChange: (next: string[]) => void;
    placeholder?: string;
    'aria-label'?: string;
}) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const [sel, setSel] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listId = useId();
    const choices = useMemo(() => tagChoices(q, options, value), [q, options, value]);
    const active = Math.min(sel, Math.max(0, choices.length - 1));
    const showing = open && choices.length > 0;

    const add = (raw: string) => {
        const t = raw.trim();
        if (!t) return;
        if (!value.some((x) => x.toLowerCase() === t.toLowerCase())) {
            // Reuse the existing spelling when only the case differs.
            onChange([...value, options.find((o) => o.toLowerCase() === t.toLowerCase()) ?? t]);
        }
        setQ('');
        setSel(0);
        inputRef.current?.focus();
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setSel(open ? Math.min(active + 1, choices.length - 1) : 0);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSel(Math.max(0, active - 1));
        } else if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            const pick = choices[active];
            // Typed text that the highlighted suggestion does not start with is what was meant (a brand new tag).
            if (q.trim() && !(pick && e.key === 'Enter' && pick.tag.toLowerCase().includes(q.trim().toLowerCase()))) add(q);
            else if (pick) add(pick.tag);
        } else if (e.key === 'Backspace' && !q && value.length) {
            onChange(value.slice(0, -1));
        } else if (e.key === 'Escape' && showing) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
        }
    };

    return (
        <Popover open={showing}>
            <PopoverAnchor asChild>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5 py-1" onClick={() => inputRef.current?.focus()}>
                    {value.map((t) => <TagChip key={t} tag={t} onRemove={() => { onChange(value.filter((x) => x !== t)); inputRef.current?.focus(); }} />)}
                    <input
                        ref={inputRef}
                        value={q}
                        onChange={(e) => { setQ(e.target.value); setSel(0); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        onBlur={() => setOpen(false)}
                        onKeyDown={onKeyDown}
                        placeholder={placeholder}
                        aria-label={ariaLabel}
                        role="combobox"
                        aria-expanded={showing}
                        aria-controls={listId}
                        aria-autocomplete="list"
                        aria-activedescendant={showing ? `${listId}-${active}` : undefined}
                        autoComplete="off"
                        spellCheck={false}
                        style={{ width: Math.max(90, q.length * 8 + 30) }}
                        className="min-w-[70px] bg-transparent py-0.5 text-sm outline-none placeholder:text-muted-foreground/70"
                    />
                </div>
            </PopoverAnchor>
            <PopoverContent
                align="start"
                // Focus stays in the box: the list is only ever pointed at.
                onOpenAutoFocus={(e) => e.preventDefault()}
                onCloseAutoFocus={(e) => e.preventDefault()}
                className="w-[var(--radix-popover-trigger-width)] rounded-[10px] p-1 shadow-xl"
            >
                <div className="px-2 pb-1 pt-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">{q.trim() ? 'Select or create' : 'Existing tags'}</div>
                <div id={listId} role="listbox" aria-label="Tags" data-lenis-prevent className="max-h-[260px] overflow-y-auto">
                    {choices.map((c, i) => (
                        <div
                            key={c.tag + (c.create ? '+' : '')}
                            id={`${listId}-${i}`}
                            role="option"
                            aria-selected={i === active}
                            onMouseDown={(e) => { e.preventDefault(); add(c.tag); }}
                            onMouseMove={() => setSel(i)}
                            className={cn('flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-sm', i === active && 'bg-muted')}
                        >
                            <TagChip tag={c.tag} />
                            {c.create && <small className="text-xs text-muted-foreground">Create new</small>}
                        </div>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}
