import { ImageResponse } from 'next/og';
import { getPostBySlug, getAllPosts } from '@/lib/blog';
import { OgCard, OG_SIZE, OG_CONTENT_TYPE, loadOgFonts } from '@/lib/og-card';

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export async function generateStaticParams() {
    const posts = await getAllPosts();
    return posts.map((post) => ({ slug: post.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const post = await getPostBySlug(slug);
    return new ImageResponse(
        <OgCard eyebrow="mncoleman · Blog" title={post?.title || 'Blog'} description={post?.excerpt} />,
        { ...size, fonts: await loadOgFonts() }
    );
}
