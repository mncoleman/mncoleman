'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { BookOpen, Calendar, Filter, X, ArrowRight } from 'lucide-react';
import { Post } from '@/lib/blog';
import { format } from 'date-fns';

interface BlogPageClientProps {
    initialPosts: Post[];
    allTags: string[];
}

export default function BlogPageClient({ initialPosts, allTags }: BlogPageClientProps) {
    const [selectedTag, setSelectedTag] = useState<string | null>(null);

    const filteredPosts = useMemo(() => {
        if (!selectedTag) return initialPosts;
        return initialPosts.filter(post => post.tags?.includes(selectedTag));
    }, [initialPosts, selectedTag]);

    return (
        <div className="container mx-auto px-4 py-16 max-w-5xl">
            <header className="mb-12 text-center text-balance">
                <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60 leading-tight">
                    Blog
                    <span className="block text-xl md:text-2xl font-medium text-muted-foreground mt-2">
                        Thoughts on technology, life, and sometimes just random things.
                    </span>
                </h1>
            </header>

            {/* Tag Filter */}
            {allTags.length > 0 && (
                <div className="mb-12 flex flex-wrap items-center justify-center gap-2">
                    <div className="flex items-center gap-2 mr-2 text-muted-foreground text-sm font-medium">
                        <Filter className="h-4 w-4" />
                        <span>Filter:</span>
                    </div>
                    <button
                        onClick={() => setSelectedTag(null)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${selectedTag === null
                            ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                            : 'bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground'
                            }`}
                    >
                        All Posts
                    </button>
                    {allTags.map((tag) => (
                        <button
                            key={tag}
                            onClick={() => setSelectedTag(tag)}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${selectedTag === tag
                                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                                : 'bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground'
                                }`}
                        >
                            {tag}
                        </button>
                    ))}
                    {selectedTag && (
                        <button
                            onClick={() => setSelectedTag(null)}
                            className="p-1.5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all ml-2"
                            title="Clear filter"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            )}

            {/* Posts Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {filteredPosts.map((post) => (
                    <Link
                        key={post.id}
                        href={`/blog/${post.slug}`}
                        className="group relative flex flex-col h-full p-6 rounded-2xl border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 hover:bg-background/80 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-primary/5 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both overflow-hidden"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                                <BookOpen className="h-5 w-5" />
                            </div>
                            {post.featured && (
                                <span className="px-2.5 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full text-[10px] font-bold uppercase tracking-wider">
                                    Featured
                                </span>
                            )}
                        </div>

                        <div className="flex-1">
                            <h2 className="text-2xl font-bold mb-3 group-hover:text-primary transition-colors duration-300 leading-tight">
                                {post.title}
                            </h2>
                            <p className="text-muted-foreground leading-relaxed mb-6 text-sm line-clamp-3">
                                {post.excerpt}
                            </p>
                        </div>

                        <div className="space-y-4">
                            {post.tags && post.tags.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {post.tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className={`text-[10px] font-medium px-2 py-0.5 rounded-full border transition-all ${selectedTag === tag
                                                ? 'bg-primary/10 border-primary/20 text-primary'
                                                : 'bg-accent text-accent-foreground border-border'
                                                }`}
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="flex items-center justify-between pt-4 border-t border-border/30">
                                <div className="flex items-center text-xs text-muted-foreground text-opacity-80">
                                    <Calendar className="h-3.5 w-3.5 mr-1.5" />
                                    <span>{format(new Date(post.date), 'MMMM dd, yyyy')}</span>
                                </div>
                                <div className="text-primary opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 flex items-center gap-1 text-xs font-semibold">
                                    Read more <ArrowRight className="h-3 w-3" />
                                </div>
                            </div>
                        </div>

                        {/* Interactive hover indicator */}
                        <div className="absolute bottom-0 left-0 right-0 h-1">
                            <div className="h-full w-0 bg-primary group-hover:w-full transition-all duration-500 mx-auto" />
                        </div>
                    </Link>
                ))}
            </div>

            {filteredPosts.length === 0 && (
                <div className="text-center py-24 bg-accent/10 rounded-3xl border border-dashed border-border/50 animate-in zoom-in-95 duration-500">
                    <div className="p-4 rounded-full bg-accent/20 w-16 h-16 flex items-center justify-center mx-auto mb-6">
                        <Filter className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No posts found</h3>
                    <p className="text-muted-foreground max-w-md mx-auto">
                        We couldn't find any blog posts matching that tag. Try another one or clear all filters.
                    </p>
                    <button
                        onClick={() => setSelectedTag(null)}
                        className="mt-8 px-6 py-2 bg-primary text-primary-foreground rounded-full font-medium hover:opacity-90 transition-opacity"
                    >
                        Clear All Filters
                    </button>
                </div>
            )}
        </div>
    );
}
