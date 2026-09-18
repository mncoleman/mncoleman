'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';

/**
 * Multi-select for categories / tech tags: a searchable popover listing every
 * value already in use, with an "Add" row for whatever was typed that does not
 * exist yet. Chosen values sit above as removable chips. Replaces the native
 * `<select>`, which rendered in the OS's own style rather than the site's.
 */
export function TagPicker({
    label,
    singular,
    value,
    options,
    onChange,
}: {
    label: string;
    singular: string;
    value: string[];
    options: string[];
    onChange: (next: string[]) => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const q = query.trim();
    const exists = (t: string) => [...options, ...value].some((o) => o.toLowerCase() === t.toLowerCase());

    const toggle = (tag: string) => {
        onChange(value.includes(tag) ? value.filter((v) => v !== tag) : [...value, tag]);
    };

    const addNew = () => {
        if (!q) return;
        // Reuse the existing spelling if only the case differs.
        const match = [...options, ...value].find((o) => o.toLowerCase() === q.toLowerCase());
        const tag = match || q;
        if (!value.includes(tag)) onChange([...value, tag]);
        setQuery('');
    };

    return (
        <div className="space-y-2">
            <Label>{label}</Label>
            {value.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {value.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 rounded-full border border-border bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                            {t}
                            <button type="button" onClick={() => toggle(t)} aria-label={`Remove ${t}`} className="text-muted-foreground hover:text-foreground">
                                <X size={12} />
                            </button>
                        </span>
                    ))}
                </div>
            )}
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button type="button" variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between font-normal text-muted-foreground">
                        Add a {singular}…
                        <ChevronsUpDown size={14} className="opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                        <CommandInput
                            placeholder={`Search or type a new ${singular}`}
                            value={query}
                            onValueChange={setQuery}
                            onKeyDown={(e) => {
                                // Enter on a query that matches nothing creates it.
                                if (e.key === 'Enter' && q && !exists(q)) {
                                    e.preventDefault();
                                    addNew();
                                }
                            }}
                        />
                        <CommandList>
                            <CommandEmpty>Nothing yet. Press Enter to add it.</CommandEmpty>
                            {q && !exists(q) && (
                                <CommandGroup>
                                    <CommandItem value={`__add__${q}`} onSelect={addNew} className="gap-2">
                                        <Plus size={14} /> Add “{q}”
                                    </CommandItem>
                                </CommandGroup>
                            )}
                            <CommandGroup heading={options.length ? 'In use' : undefined}>
                                {options.map((o) => {
                                    const on = value.includes(o);
                                    return (
                                        <CommandItem key={o} value={o} onSelect={() => toggle(o)} className="gap-2">
                                            <Check size={14} className={cn(on ? 'opacity-100' : 'opacity-0')} />
                                            {o}
                                        </CommandItem>
                                    );
                                })}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}
