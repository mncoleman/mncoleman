import { MarkdownLink } from '@/components/bible/MarkdownLink';
import { getArtifacts } from '@/lib/artifacts';
import { readImageSize } from '@/lib/post-media-server';
import { PostMarkdownView } from './PostMarkdownView';

/**
 * Post body renderer for the built site (server component): the shared view with build-time
 * inputs, namely the artifact manifest, image sizes read from disk and verse text baked in.
 * The admin's Preview uses PostMarkdownPreview with the same view and browser-side inputs.
 */
export function PostMarkdown({ content }: { content: string }) {
    return <PostMarkdownView content={content} env={{ artifacts: getArtifacts(), imageSize: readImageSize, anchor: MarkdownLink }} />;
}
