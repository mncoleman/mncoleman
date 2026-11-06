'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

/**
 * A standalone post image: optional caption (the Markdown title), click-to-zoom lightbox
 * (Radix Dialog: focus trap, Esc, outside click), lazy loading, reserved box when the size
 * is known. `paper` puts transparent-capable images (SVG, PNG...) on a light surface in dark mode.
 */
export function PostFigure({
    src,
    alt,
    caption,
    width,
    height,
    paper,
}: {
    src: string;
    alt: string;
    caption?: string;
    width?: number;
    height?: number;
    paper: boolean;
}) {
    const isSvg = /\.svg($|[?#])/i.test(src);
    const label = alt || caption || 'Image';
    const sized = width && height ? { width, height, style: { aspectRatio: `${width} / ${height}` } } : {};
    return (
        <figure className="post-figure not-prose" data-paper={paper ? 'true' : undefined}>
            <Dialog.Root>
                <Dialog.Trigger asChild>
                    <button type="button" className="post-figure-btn" aria-label={`Enlarge image: ${label}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={src} alt={alt} loading="lazy" decoding="async" {...sized} />
                    </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                    <Dialog.Overlay className="post-lightbox-overlay" />
                    <Dialog.Content className="post-lightbox" aria-describedby={undefined} data-paper={paper ? 'true' : undefined}>
                        <Dialog.Title className="sr-only">{label}</Dialog.Title>
                        <Dialog.Close className="post-lightbox-close" aria-label="Close">
                            <X size={18} />
                        </Dialog.Close>
                        <div className="post-lightbox-frame">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={alt} className={isSvg ? 'is-svg' : undefined} />
                        </div>
                        {caption ? <p className="post-lightbox-caption">{caption}</p> : null}
                    </Dialog.Content>
                </Dialog.Portal>
            </Dialog.Root>
            {caption ? <figcaption>{caption}</figcaption> : null}
        </figure>
    );
}
