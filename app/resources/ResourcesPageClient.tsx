'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { Filter } from 'lucide-react';
import { CardActions } from '@/components/ui/card-actions';
import { useToast } from '@/hooks/use-toast';
import { PageEntrance } from '@/components/page-entrance';
import { BookmarkIcon, type BookmarkIconHandle } from '@/components/ui/bookmark';
import { slugify } from '@/lib/utils';
import { flattenTags, type Tags } from '@/lib/tags';
import { TagFilterBar, useTagFilter } from '@/components/tag-filter';

interface Resource {
    id: string;
    name: string;
    url: string;
    tags: Tags;
    description: string;
    published: boolean;
}

interface ResourcesPageClientProps {
    initialResources: Resource[];
}

function ResourceCard({
    resource,
    selectedValues,
    showToast,
}: {
    resource: Resource;
    selectedValues: Set<string>;
    showToast: (msg: string) => void;
}) {
    const iconRef = useRef<BookmarkIconHandle>(null);

    return (
        <article
            className="group relative flex flex-col h-full p-6 rounded-2xl border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 hover:bg-background/80 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-primary/5 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both overflow-hidden cursor-pointer"
            onMouseEnter={() => iconRef.current?.startAnimation()}
            onMouseLeave={() => iconRef.current?.stopAnimation()}
        >
            <Link
                href={`/resources/${slugify(resource.name)}/`}
                aria-label={`View details for ${resource.name}`}
                className="absolute inset-0 z-[1] rounded-2xl"
            />
            <div className="flex justify-between items-start mb-4">
                <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                    <BookmarkIcon ref={iconRef} size={20} />
                </div>
            </div>

            <div className="flex-1">
                <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors duration-300">
                    {resource.name}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                    {resource.description}
                </p>
            </div>

            <div className="flex flex-wrap gap-1.5 mt-2 mb-4">
                {flattenTags(resource.tags).map(cat => (
                    <span
                        key={cat}
                        className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${selectedValues.has(cat)
                            ? 'bg-primary/10 border-primary/20 text-primary'
                            : 'bg-muted/50 border-border text-muted-foreground'
                            }`}
                    >
                        {cat}
                    </span>
                ))}
            </div>

            <CardActions
                contentType="resource"
                url={resource.url}
                title={resource.name}
                onToast={showToast}
                className="relative z-10"
            />

            <div className="absolute bottom-0 left-0 right-0 h-1">
                <div className="h-full w-0 bg-primary group-hover:w-full transition-all duration-500 mx-auto" />
            </div>
        </article>
    );
}

export default function ResourcesPageClient({ initialResources }: ResourcesPageClientProps) {
    const filter = useTagFilter(initialResources);
    const filteredResources = filter.filtered;
    const { showToast, ToastComponent } = useToast();

    return (
        <PageEntrance>
        <div className="container mx-auto px-4 py-16 max-w-5xl">
            <header className="mb-12 text-center text-balance">
                <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60 leading-tight">
                    Resources
                    <span className="block text-xl md:text-2xl font-medium text-muted-foreground mt-2">
                        Tools, Websites & Inspiration
                    </span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                    A curated collection of useful websites, tools, and resources I use frequently or find useful.
                </p>
            </header>

            <TagFilterBar filter={filter} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredResources.map((resource) => (
                    <ResourceCard
                        key={resource.id}
                        resource={resource}
                        selectedValues={filter.selectedValues}
                        showToast={showToast}
                    />
                ))}
            </div>

            {ToastComponent}

            {filteredResources.length === 0 && (
                <div className="text-center py-24 bg-accent/10 rounded-3xl border border-dashed border-border/50 animate-in zoom-in-95 duration-500">
                    <div className="p-4 rounded-full bg-accent/20 w-16 h-16 flex items-center justify-center mx-auto mb-6">
                        <Filter className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No resources found</h3>
                    <p className="text-muted-foreground max-w-md mx-auto">
                        We couldn't find any resources matching your current criteria. Try clearing your filters.
                    </p>
                    <button
                        onClick={filter.clear}
                        className="mt-8 px-6 py-2 bg-primary text-primary-foreground rounded-full font-medium hover:opacity-90 transition-opacity"
                    >
                        Clear All Filters
                    </button>
                </div>
            )}
        </div>
        </PageEntrance>
    );
}
