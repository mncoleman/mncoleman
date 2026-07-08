import { ImageResponse } from 'next/og';
import { OgCard, OG_SIZE, OG_CONTENT_TYPE, loadOgFonts } from '@/lib/og-card';

// Default site-wide OpenGraph card. Applies to the homepage and any route that
// doesn't ship its own opengraph-image.tsx (about, blog/projects/resources index, etc.).
// Non-dynamic metadata image route — static export requires an explicit directive.
export const dynamic = 'force-static';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Matthew Coleman — mncoleman.com';

export default async function Image() {
    return new ImageResponse(
        <OgCard
            eyebrow="mncoleman.com"
            title="Matthew Coleman"
            description="Personal website — blog, projects, resources, and resume."
        />,
        { ...size, fonts: await loadOgFonts() }
    );
}
