import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getProjectBySlug, getProjectSlugs } from '@/lib/projects';
import { slugify } from '@/lib/utils';
import { PageEntrance } from '@/components/page-entrance';
import { CollectionDetail } from '@/components/collection-detail';

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
                <CollectionDetail
                    kind="project"
                    name={project.name}
                    description={project.description}
                    date={project.date}
                    tags={project.tech}
                    url={project.url}
                    content={project.content}
                    detailsPath={detailsPath}
                    backLink={(children, className) => <Link href="/projects" className={className}>{children}</Link>}
                />
            </article>
        </PageEntrance>
    );
}
