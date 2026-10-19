'use client';

import { useMemo, useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PasteInput } from '@/components/admin/PasteField';
import { tagKeys, tagValues, type Tags } from '@/lib/tags';

/**
 * Vocabulary editor for one collection: every tag key and the values under it,
 * with usage counts. Rename and delete rewrite every record that uses the key or
 * value (in memory — nothing reaches the site until Save & publish). Renaming
 * onto a name that already exists merges the two.
 */
export function TagManager({
    items,
    onChange,
}: {
    items: { tags: Tags }[];
    onChange: (rewrite: (tags: Tags) => Tags) => void;
}) {
    const keys = useMemo(() => tagKeys(items), [items]);
    const [editing, setEditing] = useState<{ key: string; value?: string } | null>(null);
    const [draft, setDraft] = useState('');
    const [confirm, setConfirm] = useState<{ key: string; value?: string } | null>(null);

    const count = (key: string, value?: string) =>
        items.filter((i) => (value === undefined ? i.tags[key]?.length : i.tags[key]?.includes(value))).length;
    const same = (a: { key: string; value?: string } | null, key: string, value?: string) => a?.key === key && a?.value === value;

    const rename = () => {
        const next = draft.trim();
        if (!editing || !next) return setEditing(null);
        const { key, value } = editing;
        // Reuse an existing spelling that differs only by case.
        const existingKey = keys.find((k) => k.toLowerCase() === next.toLowerCase());
        if (value === undefined) {
            const target = existingKey && existingKey !== key ? existingKey : next;
            if (target !== key) {
                onChange((tags) => {
                    if (!tags[key]) return tags;
                    const { [key]: moved, ...rest } = tags;
                    return { ...rest, [target]: [...new Set([...(rest[target] || []), ...moved])] };
                });
            }
        } else {
            const existingValue = tagValues(items, key).find((v) => v.toLowerCase() === next.toLowerCase());
            const target = existingValue && existingValue !== value ? existingValue : next;
            if (target !== value) {
                onChange((tags) =>
                    tags[key]?.includes(value) ? { ...tags, [key]: [...new Set(tags[key].map((v) => (v === value ? target : v)))] } : tags
                );
            }
        }
        setEditing(null);
    };

    const remove = () => {
        if (!confirm) return;
        const { key, value } = confirm;
        onChange((tags) => {
            if (!tags[key]) return tags;
            if (value === undefined) {
                const { [key]: _gone, ...rest } = tags;
                return rest;
            }
            const left = tags[key].filter((v) => v !== value);
            if (left.length > 0) return { ...tags, [key]: left };
            const { [key]: _gone, ...rest } = tags;
            return rest;
        });
        setConfirm(null);
    };

    const editor = (key: string, value?: string) => (
        <span className="inline-flex items-center gap-1">
            <PasteInput
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); rename(); }
                    if (e.key === 'Escape') setEditing(null);
                }}
                autoFocus
                className="h-7 w-40 text-xs"
                aria-label={`Rename ${value ?? key}`}
            />
            <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={rename} aria-label="Apply rename"><Check size={12} /></Button>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => setEditing(null)} aria-label="Cancel rename"><X size={12} /></Button>
        </span>
    );

    const del = (key: string, value?: string) => (
        <span className="inline-flex items-center gap-1 text-xs">
            Remove from {count(key, value)}?
            <Button type="button" size="sm" variant="destructive" className="h-7 px-2" onClick={remove}>Delete</Button>
            <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => setConfirm(null)}>Keep</Button>
        </span>
    );

    if (keys.length === 0) return <p className="text-sm text-muted-foreground">No tags yet. Add one from a record&apos;s form.</p>;

    return (
        <div className="space-y-4">
            {keys.map((key) => (
                <div key={key} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                        {same(editing, key) ? editor(key) : same(confirm, key) ? del(key) : (
                            <>
                                <span className="text-sm font-semibold">{key}</span>
                                <span className="text-xs text-muted-foreground">{count(key)} records</span>
                                <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5" aria-label={`Rename ${key}`} onClick={() => { setDraft(key); setEditing({ key }); }}><Pencil size={12} /></Button>
                                <Button type="button" size="sm" variant="ghost" className="h-6 px-1.5" aria-label={`Delete ${key}`} onClick={() => setConfirm({ key })}><Trash2 size={12} /></Button>
                            </>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 pl-3">
                        {tagValues(items, key).map((v) =>
                            same(editing, key, v) ? <span key={v}>{editor(key, v)}</span>
                            : same(confirm, key, v) ? <span key={v}>{del(key, v)}</span>
                            : (
                                <span key={v} className="inline-flex items-center gap-1 rounded-full border border-border bg-accent px-2 py-0.5 text-xs text-accent-foreground">
                                    {v} <span className="text-muted-foreground">{count(key, v)}</span>
                                    <button type="button" aria-label={`Rename ${v}`} className="text-muted-foreground hover:text-foreground" onClick={() => { setDraft(v); setEditing({ key, value: v }); }}><Pencil size={11} /></button>
                                    <button type="button" aria-label={`Delete ${v}`} className="text-muted-foreground hover:text-foreground" onClick={() => setConfirm({ key, value: v })}><Trash2 size={11} /></button>
                                </span>
                            )
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
