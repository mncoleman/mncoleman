import { ImageResponse } from 'next/og';
import { getProjectBySlug, getProjectSlugs } from '@/lib/projects';
import { OgCard, OG_SIZE, OG_CONTENT_TYPE, loadOgFonts } from '@/lib/og-card';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export async function generateStaticParams() {
    const slugs = await getProjectSlugs();
    return slugs.map((slug) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const project = await getProjectBySlug(slug);
    return new ImageResponse(
        <OgCard eyebrow="mncoleman · Project" title={project?.name || 'Project'} description={project?.description} />,
        { ...size, fonts: await loadOgFonts() }
    );
}
