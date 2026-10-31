'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { Calendar, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { CardActions } from '@/components/ui/card-actions';
import { useToast } from '@/hooks/use-toast';
import { PageEntrance } from '@/components/page-entrance';
import { FolderCodeIcon, type FolderCodeIconHandle } from '@/components/ui/folder-code';
import { slugify } from '@/lib/utils';
import { flattenTags, type Tags } from '@/lib/tags';
import { TagFilterBar, useTagFilter } from '@/components/tag-filter';
import TechText from '@/components/ui/tech-text';

interface Project {
    id: string;
    name: string;
    description: string;
    url: string;
    tags: Tags;
    date: string;
    published: boolean;
}

interface ProjectsPageClientProps {
    projects: Project[];
}

function ProjectCard({
    project,
    selectedValues,
    showToast,
}: {
    project: Project;
    selectedValues: Set<string>;
    showToast: (msg: string) => void;
}) {
    const iconRef = useRef<FolderCodeIconHandle>(null);

    return (
        <article
            className="group relative flex flex-col h-full p-6 rounded-2xl border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 hover:bg-background/80 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-primary/5 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both overflow-hidden cursor-pointer"
            onMouseEnter={() => iconRef.current?.startAnimation()}
            onMouseLeave={() => iconRef.current?.stopAnimation()}
        >
            <Link
                href={`/projects/${slugify(project.name)}/`}
                aria-label={`View details for ${project.name}`}
                className="absolute inset-0 z-[1] rounded-2xl"
            />
            <div className="flex justify-between items-start mb-4">
                <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                    <FolderCodeIcon ref={iconRef} size={20} />
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
                {flattenTags(project.tags).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {flattenTags(project.tags).map((tag) => (
                            <span
                                key={tag}
                                className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-all ${selectedValues.has(tag)
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
                contentType="project"
                url={project.url}
                title={project.name}
                onToast={showToast}
                className="relative z-10"
            />

            <div className="absolute bottom-0 left-0 right-0 h-1">
                <div className="h-full w-0 bg-primary group-hover:w-full transition-all duration-500 mx-auto" />
            </div>
        </article>
    );
}

export default function ProjectsPageClient({ projects }: ProjectsPageClientProps) {
    const filter = useTagFilter(projects);
    const filteredProjects = filter.filtered;
    const { showToast, ToastComponent } = useToast();

    return (
        <PageEntrance>
        <div className="container mx-auto px-4 py-16 max-w-5xl">
            <header className="mb-12 text-center text-balance">
                <h1 className="sr-only">Things I&apos;ve Made</h1>
                {/* Canvas wordmark: letters turn to dashed vector paths under the cursor. Decorative; the h1 above carries the text. */}
                <div aria-hidden="true" className="mx-auto h-[96px] max-w-3xl text-foreground sm:h-[130px] md:h-[150px]">
                    <TechText text="Things I've Made" fontWeight={700} />
                </div>
                <p className="-mt-2 text-lg text-muted-foreground max-w-2xl mx-auto">
                    A collection of projects, experiments, and various things I've built along my journey. Most of these involve AI in some capacity.
                </p>
            </header>

            <TagFilterBar filter={filter} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {filteredProjects.map((project) => (
                    <ProjectCard
                        key={project.id}
                        project={project}
                        selectedValues={filter.selectedValues}
                        showToast={showToast}
                    />
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
