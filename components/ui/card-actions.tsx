'use client';

import { useState, useCallback } from 'react';
import { ExternalLink, Share2, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CardActionsProps {
    url: string;
    title: string;
    className?: string;
    onToast?: (message: string) => void;
}

export function CardActions({ url, title, className, onToast }: CardActionsProps) {
    const [isCopied, setIsCopied] = useState(false);

    const handleOpen = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        window.open(url, '_blank', 'noopener,noreferrer');
    }, [url]);

    const handleShare = useCallback(async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (navigator.share) {
            try {
                await navigator.share({
                    title: title,
                    url: url
                });
            } catch (err) {
                if ((err as Error).name !== 'AbortError') {
                    onToast?.('Sharing failed');
                }
            }
        } else {
            onToast?.('Sharing not supported on this device');
        }
    }, [title, url, onToast]);

    const handleCopy = useCallback(async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(url);
            setIsCopied(true);
            onToast?.('Link copied to clipboard!');
            setTimeout(() => setIsCopied(false), 2000);
        } catch (err) {
            onToast?.('Failed to copy link');
        }
    }, [url, onToast]);

    return (
        <div className={cn("flex gap-2 pt-4 mt-auto border-t border-border/30", className)}>
            <button
                onClick={handleOpen}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
                title="Open link"
            >
                <ExternalLink className="h-4 w-4" />
                Open
            </button>
            <button
                onClick={handleShare}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/80 transition-colors text-sm font-medium"
                title="Share link"
            >
                <Share2 className="h-4 w-4" />
                Share
            </button>
            <button
                onClick={handleCopy}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground hover:bg-accent/80 transition-colors text-sm font-medium"
                title="Copy link"
            >
                {isCopied ? (
                    <Check className="h-4 w-4" />
                ) : (
                    <Copy className="h-4 w-4" />
                )}
                {isCopied ? 'Copied' : 'Copy'}
            </button>
        </div>
    );
}
