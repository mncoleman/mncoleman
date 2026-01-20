'use client';

import { useState, useMemo } from 'react';
import { ExternalLink, Code2, Calendar, Filter, X } from 'lucide-react';
import { format } from 'date-fns';
import { CardActions } from '@/components/ui/card-actions';
import { useToast } from '@/hooks/use-toast';

interface Project {
    id: string;
    name: string;
    description: string;
    url: string;
    tech: string[];
    date: string;
    published: boolean;
}

interface ProjectsPageClientProps {
    projects: Project[];
}

export default function ProjectsPageClient({ projects }: ProjectsPageClientProps) {
    const [selectedTech, setSelectedTech] = useState<string | null>(null);
    const { showToast, ToastComponent } = useToast();

    const allTech = useMemo(() => {
        const techSet = new Set<string>();
        projects.forEach(p => p.tech.forEach(t => techSet.add(t)));
        return Array.from(techSet).sort();
    }, [projects]);

    const filteredProjects = useMemo(() => {
        if (!selectedTech) return projects;
        return projects.filter(p => p.tech.includes(selectedTech));
    }, [projects, selectedTech]);

    return (
        <div className="container mx-auto px-4 py-16 max-w-5xl">
            <header className="mb-12 text-center text-balance">
                <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60 leading-tight">
                    Things I've Made
                    <span className="block text-xl md:text-2xl font-medium text-muted-foreground mt-2">
                        (Probably with AI)
                    </span>
                </h1>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                    A collection of projects, experiments, and various things I've built along my journey. Most of these involve AI in some capacity.
                </p>
            </header>

            {/* Filter Bar */}
            <div className="mb-12 flex flex-wrap items-center justify-center gap-2">
                <div className="flex items-center gap-2 mr-2 text-muted-foreground text-sm font-medium">
                    <Filter className="h-4 w-4" />
                    <span>Filter:</span>
                </div>
                <button
                    onClick={() => setSelectedTech(null)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${selectedTech === null
                        ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                        : 'bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}
                >
                    All
                </button>
                {allTech.map(tech => (
                    <button
                        key={tech}
                        onClick={() => setSelectedTech(tech)}
                        className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${selectedTech === tech
                            ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                            : 'bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground'
                            }`}
                    >
                        {tech}
                    </button>
                ))}
                {selectedTech && (
                    <button
                        onClick={() => setSelectedTech(null)}
                        className="p-1.5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all ml-2"
                        title="Clear filter"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {filteredProjects.map((project) => (
                    <article
                        key={project.id}
                        className="group relative flex flex-col h-full p-6 rounded-2xl border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 hover:bg-background/80 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-primary/5 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both overflow-hidden"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                                <Code2 className="h-5 w-5" />
                            </div>
                        </div>

                        <div className="flex-1">
                            <h2 className="text-2xl font-bold mb-3 group-hover:text-primary transition-colors duration-300">
                                {project.name}
                            </h2>
                            <p className="text-muted-foreground leading-relaxed mb-6">
                                {project.description}
                            </p>
                        </div>

                        <div className="space-y-4">
                            {project.tech.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {project.tech.map((tag) => (
                                        <span
                                            key={tag}
                                            className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-all ${selectedTech === tag
                                                ? 'bg-primary/10 border-primary/20 text-primary'
                                                : 'bg-accent text-accent-foreground border-border'
                                                }`}
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="flex items-center text-sm text-muted-foreground py-4 border-t border-border/30">
                                <Calendar className="h-4 w-4 mr-2" />
                                <span>
                                    {project.date ? format(new Date(project.date), 'MMMM yyyy') : 'Recently'}
                                </span>
                            </div>
                        </div>

                        <CardActions
                            url={project.url}
                            title={project.name}
                            onToast={showToast}
                        />

                        {/* Interactive hover indicator */}
                        <div className="absolute bottom-0 left-0 right-0 h-1">
                            <div className="h-full w-0 bg-primary group-hover:w-full transition-all duration-500 mx-auto" />
                        </div>
                    </article>
                ))}
            </div>

            {ToastComponent}

            {filteredProjects.length === 0 && (
                <div className="text-center py-24 bg-accent/10 rounded-3xl border border-dashed border-border/50 animate-in zoom-in-95 duration-500">
                    <div className="p-4 rounded-full bg-accent/20 w-16 h-16 flex items-center justify-center mx-auto mb-6">
                        <Filter className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No projects found</h3>
                    <p className="text-muted-foreground max-w-md mx-auto">
                        We couldn't find any projects matching your current filter. Try selecting a different technology or clearing filters.
                    </p>
                    <button
                        onClick={() => setSelectedTech(null)}
                        className="mt-8 px-6 py-2 bg-primary text-primary-foreground rounded-full font-medium hover:opacity-90 transition-opacity"
                    >
                        Clear All Filters
                    </button>
                </div>
            )}
        </div>
    );
}
