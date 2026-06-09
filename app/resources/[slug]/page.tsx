import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getResourceBySlug, getResourceSlugs } from '@/lib/resources';
import { slugify } from '@/lib/utils';
import { ShareActions } from '@/components/ShareActions';
import { PageEntrance } from '@/components/page-entrance';

export const dynamicParams = false;

export async function generateStaticParams() {
    const slugs = await getResourceSlugs();
    return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params;
    const resource = await getResourceBySlug(slug);
    if (!resource) return { title: 'Resource not found | Matthew Coleman' };

    const description = resource.description || `Resource: ${resource.name}`;
    const url = `/resources/${slug}/`;
    return {
        title: `${resource.name} | Resources | Matthew Coleman`,
        description,
        // og:image / twitter:image come from the co-located opengraph-image.tsx.
        openGraph: { title: resource.name, description, url, type: 'article' },
    };
}

export default async function ResourceDetailPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const resource = await getResourceBySlug(slug);
    if (!resource) notFound();

    const detailsPath = `/resources/${slugify(resource.name)}/`;

    return (
        <PageEntrance>
            <article className="container mx-auto px-4 py-16 max-w-3xl">
                <Link
                    href="/resources"
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to resources
                </Link>

                <header className="mb-8">
                    <h1 className="text-4xl font-bold mb-4 tracking-tight">{resource.name}</h1>
                    {resource.description && (
                        <p className="text-lg text-muted-foreground leading-relaxed">{resource.description}</p>
                    )}
                    {resource.categories.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-4">
                            {resource.categories.map((cat) => (
                                <span
                                    key={cat}
                                    className="px-3 py-1 bg-accent text-accent-foreground border border-border rounded-full text-xs font-medium whitespace-nowrap"
                                >
                                    {cat}
                                </span>
                            ))}
                        </div>
                    )}
                </header>

                <ShareActions
                    openUrl={resource.url || undefined}
                    openLabel="Visit site"
                    copyUrl={resource.url || detailsPath}
                    copyLabel="Copy link"
                    shareUrl={detailsPath}
                    className="mb-10 pb-8 border-b border-border/30"
                />

                {resource.content ? (
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
                        >{resource.content}</ReactMarkdown>
                    </div>
                ) : (
                    <p className="text-muted-foreground">
                        No additional details for this resource yet — use the buttons above to visit or share it.
                    </p>
                )}
            </article>
        </PageEntrance>
    );
}
