import { ImageResponse } from 'next/og';
import { getResourceBySlug, getResourceSlugs } from '@/lib/resources';
import { OgCard, OG_SIZE, OG_CONTENT_TYPE, loadOgFonts } from '@/lib/og-card';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export async function generateStaticParams() {
    const slugs = await getResourceSlugs();
    return slugs.map((slug) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const resource = await getResourceBySlug(slug);
    return new ImageResponse(
        <OgCard eyebrow="mncoleman · Resource" title={resource?.name || 'Resource'} description={resource?.description} />,
        { ...size, fonts: await loadOgFonts() }
    );
}
