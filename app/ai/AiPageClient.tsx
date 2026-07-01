'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquareText, PackageOpen, Copy, Check, Share2 } from 'lucide-react';
import { PageEntrance } from '@/components/page-entrance';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type LibraryKind = 'prompt' | 'skill';
type FilterValue = 'prompt' | 'all' | 'skill';

interface LibraryItem {
    slug: string;
    kind: LibraryKind;
    name: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    url: string;
    ogImage: string;
    promptText?: string;
    skillMd?: string;
    downloadUrls: { txt?: string; md?: string; zip?: string };
}

const ARTIFACTS_API = process.env.NEXT_PUBLIC_ARTIFACTS_API_URL || 'https://artifacts.mncoleman.com';

// Order matters: Prompts <-> All <-> Skills, All in the middle.
const FILTERS: { value: FilterValue; label: string }[] = [
    { value: 'prompt', label: 'Prompts' },
    { value: 'all', label: 'All' },
    { value: 'skill', label: 'Skills' },
];

function truncate(s: string, max: number): string {
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export default function AiPageClient() {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<FilterValue>('all');
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`${ARTIFACTS_API}/api/library/list`, { cache: 'no-store' });
                const data = res.ok ? await res.json() : { items: [] };
                if (!cancelled) setItems(data.items || []);
            } catch {
                if (!cancelled) setItems([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const filtered = useMemo(() => {
        if (filter === 'all') return items;
        return items.filter((i) => i.kind === filter);
    }, [items, filter]);

    const doCopy = useCallback(async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1600);
        } catch {
            window.prompt('Copy:', text);
        }
    }, []);

    return (
        <PageEntrance>
            <div className="container mx-auto px-4 py-16 max-w-5xl">
                <div className="mb-10 text-center">
                    <h1 className="text-4xl font-bold tracking-tight mb-3">&quot;A&quot;I</h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        Prompts and Agent Skills I&apos;ve written — AI resources, made by a (mostly) human.
                    </p>
                </div>

                <div className="flex justify-center mb-10">
                    <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
                        <TabsList className="relative grid grid-cols-3 w-[320px]">
                            {FILTERS.map((f) => (
                                <TabsTrigger
                                    key={f.value}
                                    value={f.value}
                                    className="relative z-10 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                                >
                                    {filter === f.value && (
                                        <motion.div
                                            layoutId="ai-toggle-pill"
                                            className="absolute inset-0 rounded-md bg-background shadow"
                                            transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                                        />
                                    )}
                                    <span className="relative z-10">{f.label}</span>
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>
                </div>

                {loading ? (
                    <p className="text-center text-sm text-muted-foreground py-12">Loading…</p>
                ) : filtered.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-12">Nothing here yet.</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {filtered.map((item) => {
                            const preview = item.kind === 'prompt' ? (item.promptText || '') : (item.description || '');
                            const copyTarget = item.kind === 'prompt' ? (item.promptText || '') : (item.skillMd || '');
                            const copyKey = `copy-${item.slug}`;
                            const shareKey = `share-${item.slug}`;
                            return (
                                <article
                                    key={item.slug}
                                    className="group relative flex flex-col h-full p-6 rounded-2xl border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 hover:bg-background/80 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-primary/5 overflow-hidden"
                                >
                                    <a
                                        href={item.url}
                                        aria-label={`View details for ${item.name}`}
                                        className="absolute inset-0 z-[1] rounded-2xl"
                                    />
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                                            {item.kind === 'prompt'
                                                ? <MessageSquareText className="h-5 w-5" />
                                                : <PackageOpen className="h-5 w-5" />}
                                        </div>
                                        <span className="text-[10px] px-2 py-0.5 rounded-full border bg-muted/50 border-border text-muted-foreground capitalize">
                                            {item.kind}
                                        </span>
                                    </div>

                                    <div className="flex-1">
                                        <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors duration-300">
                                            {item.name}
                                        </h3>
                                        {preview && (
                                            <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                                                {truncate(preview, 180)}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                                        <span>{formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}</span>
                                    </div>

                                    <div className="relative z-10 flex gap-2 pt-4 mt-auto border-t border-border/30">
                                        <button
                                            type="button"
                                            onClick={() => doCopy(copyTarget, copyKey)}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
                                        >
                                            {copiedKey === copyKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                            {copiedKey === copyKey ? 'Copied' : 'Copy'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => doCopy(item.url, shareKey)}
                                            title="Copy share link"
                                            aria-label="Copy share link"
                                            className="flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
                                        >
                                            {copiedKey === shareKey ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        </PageEntrance>
    );
}
