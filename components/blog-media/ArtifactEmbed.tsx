import { ExternalLink } from 'lucide-react';
import { embedSandbox, type EmbedSpec, type ResolvedEmbed } from '@/lib/post-media';

/**
 * A framed, lazy-loaded artifact. Server component: the iframe is plain HTML. Callers must
 * have resolved the href with resolveEmbedHref (allow-listed hosts only).
 */
export function ArtifactEmbed({ embed, spec, title }: { embed: ResolvedEmbed; spec: EmbedSpec; title: string }) {
    const label = title || embed.name || 'Embedded artifact';
    const frameStyle = spec.square
        ? { aspectRatio: '1 / 1', maxHeight: '90svh' }
        : { height: `min(${spec.height}px, 85svh)` };
    return (
        <figure className="post-embed not-prose">
            <figcaption className="post-embed-bar">
                <span className="post-embed-title">{label}</span>
                <a href={embed.openHref} target="_blank" rel="noopener noreferrer" className="post-embed-open">
                    Open full page <ExternalLink size={13} aria-hidden="true" />
                </a>
            </figcaption>
            <iframe
                src={embed.src}
                title={label}
                loading="lazy"
                sandbox={embedSandbox(embed.kind)}
                allow="clipboard-write"
                referrerPolicy="no-referrer"
                allowFullScreen
                style={frameStyle}
            />
        </figure>
    );
}
