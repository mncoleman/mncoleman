import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getResourceBySlug, getResourceSlugs } from '@/lib/resources';
import { slugify } from '@/lib/utils';
import { PageEntrance } from '@/components/page-entrance';
import { CollectionDetail } from '@/components/collection-detail';

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
                <CollectionDetail
                    kind="resource"
                    name={resource.name}
                    description={resource.description}
                    tags={resource.categories}
                    url={resource.url}
                    content={resource.content}
                    detailsPath={detailsPath}
                    backLink={(children, className) => <Link href="/resources" className={className}>{children}</Link>}
                />
            </article>
        </PageEntrance>
    );
}
