'use client';

import { useMemo, useState } from 'react';
import { Filter, X } from 'lucide-react';
import { tagKeys, tagValues, type Tags } from '@/lib/tags';

/**
 * Filter state + bar shared by /projects and /resources. One row of pills per tag
 * key; picking a value under several keys narrows with AND, picking a second value
 * under the same key replaces the first.
 */
export function useTagFilter<T extends { tags: Tags }>(items: T[]) {
    const [selected, setSelected] = useState<Record<string, string>>({});

    const keys = useMemo(() => tagKeys(items), [items]);
    const valuesByKey = useMemo(() => Object.fromEntries(keys.map((k) => [k, tagValues(items, k)])), [items, keys]);

    const filtered = useMemo(() => {
        const active = Object.entries(selected);
        if (active.length === 0) return items;
        return items.filter((i) => active.every(([k, v]) => i.tags[k]?.includes(v)));
    }, [items, selected]);

    const pick = (key: string, value: string | null) =>
        setSelected((prev) => {
            const next = { ...prev };
            if (value === null) delete next[key];
            else next[key] = value;
            return next;
        });

    const clear = () => setSelected({});
    const selectedValues = useMemo(() => new Set(Object.values(selected)), [selected]);

    return { keys, valuesByKey, selected, selectedValues, filtered, pick, clear, active: Object.keys(selected).length > 0 };
}

const pill = (on: boolean) =>
    `px-4 py-1.5 rounded-full text-sm font-medium transition-all ${on
        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
        : 'bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground'}`;

export function TagFilterBar({ filter }: { filter: ReturnType<typeof useTagFilter> }) {
    const { keys, valuesByKey, selected, pick, clear, active } = filter;
    const labelled = keys.length > 1;

    return (
        <div className="mb-12 flex flex-col items-center gap-3">
            {keys.map((key, i) => (
                <div key={key} className="flex flex-wrap items-center justify-center gap-2">
                    <div className="flex items-center gap-2 mr-2 text-muted-foreground text-sm font-medium">
                        {i === 0 && <Filter className="h-4 w-4" />}
                        <span>{labelled ? `${key}:` : 'Filter:'}</span>
                    </div>
                    <button onClick={() => pick(key, null)} className={pill(!selected[key])}>
                        All
                    </button>
                    {valuesByKey[key].map((v) => (
                        <button key={v} onClick={() => pick(key, v)} className={pill(selected[key] === v)}>
                            {v}
                        </button>
                    ))}
                    {i === 0 && active && (
                        <button
                            onClick={clear}
                            className="p-1.5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all ml-2"
                            title="Clear filter"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}
