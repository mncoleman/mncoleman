'use client';

import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { authHeaders } from '@/lib/admin-auth';
import { VerseLink } from '@/components/bible/VerseLink';
import { loadBook, type BookFile } from '@/lib/bible/data';
import { formatReference, parseVerseHref, type VerseRef } from '@/lib/bible/reference';
import type { Passage } from '@/lib/bible-server';
import type { EmbedArtifact } from '@/lib/post-media';
import { PostMarkdownView, type PostMarkdownEnv } from './PostMarkdownView';

/**
 * The admin's Preview: the same renderer as the built site (PostMarkdownView: figures, embeds,
 * Mermaid, citations, verse cards) fed from the browser instead of the build.
 *
 * Remaining differences from the live page, by design:
 *  - verse text comes from the lazily fetched /bible-data, not baked into the HTML;
 *  - the artifact list is the Worker's /api/artifacts manifest (static embeds only resolve once it has loaded);
 *  - figures have no reserved box (image sizes are read from disk at build time);
 *  - in-site links do nothing, so a stray click cannot leave the editor.
 */

let artifactCache: Promise<EmbedArtifact[]> | null = null;
function loadArtifacts(workerUrl: string): Promise<EmbedArtifact[]> {
    if (!artifactCache) {
        artifactCache = fetch(`${workerUrl}/api/artifacts`, { headers: authHeaders(), credentials: 'include' })
            .then((r) => (r.ok ? r.json() : { artifacts: [] }))
            .then((j) => (Array.isArray(j.artifacts) ? (j.artifacts as EmbedArtifact[]).filter((a) => a && typeof a.filename === 'string') : []))
            .catch(() => {
                artifactCache = null;
                return [];
            });
    }
    return artifactCache;
}

function passageOf(file: BookFile, ref: VerseRef, max: number): Passage {
    const chapter = file.chapters[ref.chapter - 1] ?? [];
    const start = ref.start ?? 1;
    const end = ref.start === undefined ? chapter.length : (ref.end ?? ref.start);
    const verses: Passage['verses'] = [];
    for (let v = start; v <= end && verses.length < max; v++) verses.push({ n: v, t: chapter[v - 1] ?? null });
    return { verses, more: end - start + 1 > verses.length };
}

function PreviewLink({ href, children, node: _node, ...props }: ComponentProps<'a'> & { node?: unknown }) {
    void _node;
    const ref = useMemo(() => (href?.startsWith('/bible/') ? parseVerseHref(href) : null), [href]);
    const [books, setBooks] = useState<{ kjv: BookFile; web: BookFile } | null>(null);
    useEffect(() => {
        if (!ref) return;
        let live = true;
        Promise.all([loadBook('kjv', ref.book), loadBook('web', ref.book)])
            .then(([kjv, web]) => { if (live) setBooks({ kjv, web }); })
            .catch(() => undefined);
        return () => { live = false; };
    }, [ref]);

    if (ref && books && (books.kjv.chapters[ref.chapter - 1]?.length ?? 0) > 0) {
        const max = ref.start === undefined ? 3 : 12;
        return (
            <VerseLink href={href!} reference={formatReference(ref)} kjv={passageOf(books.kjv, ref, max)} web={passageOf(books.web, ref, max)}>
                {children}
            </VerseLink>
        );
    }
    if (/^https?:/i.test(href || '')) return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
    return <a href={href} onClick={(e) => { if (!href?.startsWith('#')) e.preventDefault(); }} {...props}>{children}</a>;
}

export function PostMarkdownPreview({ content, workerUrl }: { content: string; workerUrl: string }) {
    const [artifacts, setArtifacts] = useState<EmbedArtifact[]>([]);
    useEffect(() => {
        let live = true;
        void loadArtifacts(workerUrl).then((a) => { if (live) setArtifacts(a); });
        return () => { live = false; };
    }, [workerUrl]);
    const env = useMemo<PostMarkdownEnv>(() => ({ artifacts, anchor: PreviewLink }), [artifacts]);
    return (
        <>
            {/* The site's KJV/WEB switch (BibleHead), without its pre-paint script. */}
            <style>{'html:not([data-bible-tr="web"]) .tr-web{display:none}html[data-bible-tr="web"] .tr-kjv{display:none}'}</style>
            <PostMarkdownView content={content} env={env} />
        </>
    );
}
