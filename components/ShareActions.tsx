'use client';

import { useState, useCallback } from 'react';
import { ExternalLink, Download, Copy, Check, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShareActionsProps {
    /** The artifact / external URL the "Open" button opens (omit to hide it). */
    openUrl?: string;
    openLabel?: string;
    /** Direct download URL (artifacts only — omit to hide the Download button). */
    downloadUrl?: string;
    downloadFilename?: string;
    /** URL the "Copy link" button copies — the artifact/external destination, NOT this page. */
    copyUrl: string;
    copyLabel?: string;
    /** This details page's own URL; copied by "Share Page". Relative paths are resolved to absolute. */
    shareUrl: string;
    className?: string;
}

function toAbsolute(url: string): string {
    if (/^https?:\/\//.test(url)) return url;
    if (typeof window !== 'undefined') return `${window.location.origin}${url}`;
    return url;
}

export function ShareActions({
    openUrl,
    openLabel = 'Open',
    downloadUrl,
    downloadFilename,
    copyUrl,
    copyLabel = 'Copy link',
    shareUrl,
    className,
}: ShareActionsProps) {
    const [copied, setCopied] = useState<'link' | 'share' | null>(null);

    const doCopy = useCallback(async (which: 'link' | 'share', url: string) => {
        const abs = toAbsolute(url);
        try {
            await navigator.clipboard.writeText(abs);
            setCopied(which);
            setTimeout(() => setCopied(prev => (prev === which ? null : prev)), 1600);
        } catch {
            // Older browsers / denied clipboard permission — fall back to a prompt.
            window.prompt('Copy link:', abs);
        }
    }, []);

    return (
        <div className={cn('flex flex-wrap gap-2', className)}>
            {openUrl && (
                <a
                    href={openUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
                >
                    <ExternalLink className="h-4 w-4" />
                    {openLabel}
                </a>
            )}

            {downloadUrl && (
                <a
                    href={downloadUrl}
                    download={downloadFilename}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-accent-foreground hover:bg-accent/80 transition-colors text-sm font-medium"
                >
                    <Download className="h-4 w-4" />
                    Download
                </a>
            )}

            <button
                type="button"
                onClick={() => doCopy('link', copyUrl)}
                title={copyLabel}
                aria-label={copyLabel}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-accent text-accent-foreground hover:bg-accent/80 transition-colors text-sm font-medium"
            >
                {copied === 'link' ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                <span className="hidden sm:inline">{copied === 'link' ? 'Copied' : copyLabel}</span>
            </button>

            <button
                type="button"
                onClick={() => doCopy('share', shareUrl)}
                title="Copy this page's shareable link"
                aria-label="Share page"
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-sm font-medium"
            >
                {copied === 'share' ? <Check className="h-4 w-4 text-emerald-500" /> : <Share2 className="h-4 w-4" />}
                {copied === 'share' ? 'Copied' : 'Share Page'}
            </button>
        </div>
    );
}
