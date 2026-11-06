import type { ComponentProps } from 'react';
import { bakeVerseLink } from '@/lib/bible-server';
import { VerseLink } from './VerseLink';

/**
 * The `a` renderer for post bodies (react-markdown `components.a`). Server component: verse
 * links get their text baked in from public/bible-data at build time; invalid verse refs and
 * ordinary links fall through to a plain anchor.
 */
export function MarkdownLink({ href, children, node: _node, ...props }: ComponentProps<'a'> & { node?: unknown }) {
    void _node;
    const verse = bakeVerseLink(href);
    if (verse) {
        return (
            <VerseLink href={verse.href} reference={verse.reference} kjv={verse.kjv} web={verse.web}>
                {children}
            </VerseLink>
        );
    }
    const isExternal = href?.startsWith('http');
    return isExternal ? (
        <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
    ) : (
        <a href={href} {...props}>{children}</a>
    );
}
