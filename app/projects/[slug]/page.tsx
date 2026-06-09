import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getProjectBySlug, getProjectSlugs } from '@/lib/projects';
import { slugify } from '@/lib/utils';
import { ShareActions } from '@/components/ShareActions';
import { PageEntrance } from '@/components/page-entrance';

export const dynamicParams = false;

export async function generateStaticParams() {
    const slugs = await getProjectSlugs();
    return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params;
    const project = await getProjectBySlug(slug);
    if (!project) return { title: 'Project not found | Matthew Coleman' };

    const description = project.description || `Project: ${project.name}`;
    const url = `/projects/${slug}/`;
    return {
        title: `${project.name} | Projects | Matthew Coleman`,
        description,
        // og:image / twitter:image come from the co-located opengraph-image.tsx.
        openGraph: { title: project.name, description, url, type: 'article' },
    };
}

export default async function ProjectDetailPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const project = await getProjectBySlug(slug);
    if (!project) notFound();

    const detailsPath = `/projects/${slugify(project.name)}/`;

    return (
        <PageEntrance>
            <article className="container mx-auto px-4 py-16 max-w-3xl">
                <Link
                    href="/projects"
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to projects
                </Link>

                <header className="mb-8">
                    <h1 className="text-4xl font-bold mb-4 tracking-tight">{project.name}</h1>
                    {project.description && (
                        <p className="text-lg text-muted-foreground leading-relaxed">{project.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 mt-4">
                        {project.date && (
                            <span className="inline-flex items-center text-sm text-muted-foreground">
                                <Calendar className="h-4 w-4 mr-2" />
                                {format(new Date(project.date), 'MMMM yyyy')}
                            </span>
                        )}
                        {project.tech.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {project.tech.map((tag) => (
                                    <span
                                        key={tag}
                                        className="px-3 py-1 bg-accent text-accent-foreground border border-border rounded-full text-xs font-medium whitespace-nowrap"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </header>

                <ShareActions
                    openUrl={project.url || undefined}
                    openLabel="View project"
                    copyUrl={project.url || detailsPath}
                    copyLabel="Copy link"
                    shareUrl={detailsPath}
                    className="mb-10 pb-8 border-b border-border/30"
                />

                {project.content ? (
                    <div className="prose prose-neutral dark:prose-invert max-w-none">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                a: ({ href, children, ...props }) => {
                                    const isExternal = href?.startsWith('http');
                                    return isExternal ? (
                                        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
                                    ) : (
                                        <a href={href} {...props}>{children}</a>
                                    );
                                },
                            }}
                        >{project.content}</ReactMarkdown>
                    </div>
                ) : (
                    <p className="text-muted-foreground">
                        No additional write-up for this project yet — use the buttons above to view or share it.
                    </p>
                )}
            </article>
        </PageEntrance>
    );
}
