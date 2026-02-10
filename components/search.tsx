'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Search as SearchIcon, FileText, Briefcase, Link as LinkIcon, User, X, Command } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchItem {
    id: string;
    title: string;
    description: string;
    content?: string;
    url: string;
    type: 'blog' | 'project' | 'resource' | 'resume';
    metadata?: string[];
}

interface SearchProps {
    items: SearchItem[];
}

export function Search({ items }: SearchProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Filter items based on query
    const filteredItems = useMemo(() => {
        if (!query.trim()) return [];

        const lowercaseQuery = query.toLowerCase();

        return items
            .map(item => {
                let score = 0;
                const titleMatch = item.title.toLowerCase().includes(lowercaseQuery);
                const tagMatch = item.metadata?.some(m => m.toLowerCase().includes(lowercaseQuery));
                const descMatch = item.description.toLowerCase().includes(lowercaseQuery);
                const contentMatch = item.content?.toLowerCase().includes(lowercaseQuery);

                if (titleMatch) score += 100;
                if (tagMatch) score += 50;
                if (descMatch) score += 20;
                if (contentMatch) score += 10;

                return { item, score };
            })
            .filter(result => result.score > 0)
            .sort((a, b) => b.score - a.score)
            .map(result => result.item)
            .slice(0, 10);
    }, [items, query]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Toggle search with / or cmd+k/ctrl+k
            if ((e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k')) && !isOpen) {
                const activeElement = document.activeElement;
                const isInput = activeElement && (
                    activeElement.tagName === 'INPUT' ||
                    activeElement.tagName === 'TEXTAREA' ||
                    (activeElement as HTMLElement).isContentEditable
                );

                if (!isInput) {
                    e.preventDefault();
                    setIsOpen(true);
                }
            }

            if (isOpen) {
                if (e.key === 'Escape') {
                    setIsOpen(false);
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelectedIndex(prev => (prev + 1) % Math.max(1, filteredItems.length));
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelectedIndex(prev => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
                } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
                    e.preventDefault();
                    handleSelect(filteredItems[selectedIndex]);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, filteredItems, selectedIndex]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 10);
            setQuery('');
            setSelectedIndex(0);
        }
    }, [isOpen]);

    const handleSelect = (item: SearchItem) => {
        router.push(item.url);
        setIsOpen(false);
    };

    const getIcon = (type: SearchItem['type']) => {
        switch (type) {
            case 'blog': return <FileText className="w-4 h-4" />;
            case 'project': return <Briefcase className="w-4 h-4" />;
            case 'resource': return <LinkIcon className="w-4 h-4" />;
            case 'resume': return <User className="w-4 h-4" />;
            default: return <FileText className="w-4 h-4" />;
        }
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="p-2 hover:bg-accent rounded-lg transition-colors flex items-center gap-2 text-muted-foreground hover:text-foreground"
                aria-label="Search"
            >
                <SearchIcon className="w-5 h-5" />
                <span className="hidden lg:inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold border rounded bg-muted/50 text-muted-foreground transition-all">
                    /
                </span>
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-background/5 backdrop-blur-md transition-opacity"
                        onClick={() => setIsOpen(false)}
                    />

                    {/* Dialog */}
                    <div className="relative w-full max-w-xl bg-card border shadow-2xl rounded-xl overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center border-b px-4">
                            <SearchIcon className="w-5 h-5 text-muted-foreground mr-3" />
                            <input
                                ref={inputRef}
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search resources, blogs, projects..."
                                className="flex-1 h-12 bg-transparent outline-none text-sm"
                            />
                            {query && (
                                <button
                                    onClick={() => setQuery('')}
                                    className="p-1 hover:bg-muted rounded"
                                >
                                    <X className="w-4 h-4 text-muted-foreground" />
                                </button>
                            )}
                        </div>

                        <div
                            ref={scrollContainerRef}
                            className="max-h-[60vh] overflow-y-auto p-2"
                        >
                            {filteredItems.length > 0 ? (
                                <div className="space-y-1">
                                    {filteredItems.map((item, index) => (
                                        <button
                                            key={`${item.type}-${item.id}`}
                                            onClick={() => handleSelect(item)}
                                            onMouseEnter={() => setSelectedIndex(index)}
                                            className={cn(
                                                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                                                index === selectedIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted/50"
                                            )}
                                        >
                                            <div className={cn(
                                                "p-1.5 rounded-md",
                                                index === selectedIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                                            )}>
                                                {getIcon(item.type)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm truncate">{item.title}</div>
                                                <div className="text-xs text-muted-foreground truncate">{item.description}</div>
                                            </div>
                                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                                {item.type}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            ) : query.trim() ? (
                                <div className="py-12 text-center">
                                    <p className="text-sm text-muted-foreground">No results found for "{query}"</p>
                                </div>
                            ) : (
                                <div className="py-4 px-3 space-y-4">
                                    <div className="text-[10px] uppercase font-bold text-muted-foreground opacity-50 px-1">Quick Links</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {['Blog', 'Projects', 'Resources', 'Resume'].map((label) => (
                                            <button
                                                key={label}
                                                onClick={() => {
                                                    router.push(`/${label.toLowerCase()}`);
                                                    setIsOpen(false);
                                                }}
                                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/30 hover:bg-muted transition-colors text-sm text-left"
                                            >
                                                {getIcon(label.toLowerCase() as any)}
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="border-t px-4 py-2 flex justify-between items-center bg-muted/20">
                            <div className="flex gap-4">
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                    <kbd className="px-1 border rounded bg-background">ESC</kbd> to close
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                    <kbd className="px-1 border rounded bg-background">↵</kbd> to select
                                </div>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                <SearchIcon className="w-3 h-3" /> Search mncoleman.com
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
