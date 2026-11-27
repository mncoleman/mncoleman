'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChefHat, Search } from 'lucide-react';
import { PageEntrance } from '@/components/page-entrance';
import FoldText from '@/components/ui/fold-text';

const ARTIFACTS_API = process.env.NEXT_PUBLIC_ARTIFACTS_API_URL || 'https://artifacts.mncoleman.com';

interface RecipeCard {
    slug: string;
    name: string;
    description?: string;
    url: string;
    ogImage?: string;
    uploadedAt: string;
    updatedAt?: string;
}

/**
 * Recipes live on the artifact service as recipe-kind artifacts and render there from the
 * recipe template, so this page is only the index: fetched live, so a recipe saved from Claude
 * shows up without a rebuild.
 */
export default function RecipesPageClient() {
    const [recipes, setRecipes] = useState<RecipeCard[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [query, setQuery] = useState('');

    useEffect(() => {
        let live = true;
        fetch(`${ARTIFACTS_API}/api/list`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((d) => {
                if (!live) return;
                const rows = ((d?.artifacts || []) as (RecipeCard & { kind?: string })[]).filter((a) => a.kind === 'recipe');
                rows.sort((a, b) => a.name.localeCompare(b.name));
                setRecipes(rows);
            })
            .catch(() => { if (live) setFailed(true); });
        return () => { live = false; };
    }, []);

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!recipes || !q) return recipes || [];
        return recipes.filter((r) => `${r.name} ${r.description || ''}`.toLowerCase().includes(q));
    }, [recipes, query]);

    return (
        <PageEntrance>
            <div className="container mx-auto max-w-5xl px-4 py-16">
                <header className="mb-10 text-center text-balance">
                    <h1 className="mb-4 text-6xl font-bold leading-tight tracking-tight md:text-7xl lg:text-[6.75rem]">
                        <FoldText text="Recipes" fontSize="inherit" fontWeight={700} hoverRefold />
                    </h1>
                    <p className="mx-auto mb-8 max-w-2xl text-lg text-muted-foreground">
                        Each one is a single chart: ingredients down the side, every step across, ready to print.
                    </p>
                    {recipes && recipes.length > 6 && (
                        <label className="mx-auto flex max-w-md items-center gap-2 rounded-full border border-border/50 bg-background/50 px-4 py-2 backdrop-blur-sm focus-within:ring-2 focus-within:ring-ring">
                            <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            <input
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search recipes"
                                aria-label="Search recipes"
                                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                            />
                        </label>
                    )}
                </header>

                {failed ? (
                    <p className="text-center text-muted-foreground">Recipes could not be loaded right now.</p>
                ) : recipes === null ? (
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2" aria-busy="true">
                        {[0, 1, 2, 3].map((i) => <div key={i} className="h-64 animate-pulse rounded-2xl border border-border/30 bg-muted/30" />)}
                    </div>
                ) : shown.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
                        <ChefHat className="h-8 w-8" aria-hidden="true" />
                        {recipes.length === 0 ? 'No recipes yet.' : 'Nothing matches that search.'}
                    </div>
                ) : (
                    <ul className="grid grid-cols-1 gap-6 md:grid-cols-2">
                        {shown.map((r) => (
                            <li key={r.slug}>
                                <a
                                    href={r.url}
                                    className="group block overflow-hidden rounded-2xl border border-border/30 bg-background/40 backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-border hover:shadow-lg"
                                >
                                    {r.ogImage && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={r.ogImage} alt="" loading="lazy" className="aspect-[1200/630] w-full object-cover" />
                                    )}
                                    <div className="p-5">
                                        <h2 className="text-lg font-semibold group-hover:underline group-hover:underline-offset-4">{r.name}</h2>
                                        {r.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.description}</p>}
                                    </div>
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </PageEntrance>
    );
}
