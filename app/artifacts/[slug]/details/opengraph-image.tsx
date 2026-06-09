import { ImageResponse } from 'next/og';
import { getArtifacts, getStaticArtifactBySlug } from '@/lib/artifacts';
import { artifactSlug } from '@/lib/utils';
import { OgCard, OG_SIZE, OG_CONTENT_TYPE, loadOgFonts } from '@/lib/og-card';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export function generateStaticParams() {
    const seen = new Set<string>();
    const params: { slug: string }[] = [];
    for (const a of getArtifacts()) {
        const slug = artifactSlug(a);
        if (seen.has(slug)) continue;
        seen.add(slug);
        params.push({ slug });
    }
    return params;
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const artifact = getStaticArtifactBySlug(slug);
    return new ImageResponse(
        <OgCard eyebrow="mncoleman · Artifact" title={artifact?.name || 'Artifact'} description={artifact?.description} />,
        { ...size, fonts: await loadOgFonts() }
    );
}
