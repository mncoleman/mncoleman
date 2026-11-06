import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getBook } from '@/lib/bible/books';
import { formatReference, type VerseRef } from '@/lib/bible/reference';
import {
    allChapterParams,
    chapterHref,
    chapterVerses,
    crossReferencerUrl,
    getXrefs,
    neighbours,
    parseTarget,
    verseCount,
} from '@/lib/bible-server';
import { BibleHead } from '@/components/bible/BibleHead';
import { BibleCredits } from '@/components/bible/BibleCredits';
import { ChapterTarget } from '@/components/bible/ChapterTarget';
import { RelatedPassages } from '@/components/bible/RelatedPassages';
import { TranslationToggle } from '@/components/bible/translation';

export const dynamicParams = false;

export function generateStaticParams() {
    return allChapterParams();
}

type Params = Promise<{ book: string; chapter: string }>;

function resolve(book: string, chapter: string) {
    const b = getBook(book);
    const ch = /^\d+$/.test(chapter) ? Number(chapter) : 0;
    if (!b || ch < 1 || ch > b.chapters) return null;
    return { b, ch };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
    const { book, chapter } = await params;
    const r = resolve(book, chapter);
    if (!r) return { title: 'Passage not found | Matthew Coleman' };
    const label = formatReference({ book, chapter: r.ch });
    const first = chapterVerses('kjv', book, r.ch)[0] ?? '';
    const description = first ? `${label}: ${first.length > 150 ? `${first.slice(0, 147)}...` : first}` : `${label} in the King James Version and World English Bible.`;
    const url = chapterHref(book, r.ch);
    return {
        title: `${label} (KJV/WEB) | Bible | Matthew Coleman`,
        description,
        alternates: { canonical: url },
        openGraph: { title: `${label} (KJV/WEB)`, description, url, type: 'article' },
    };
}

export default async function ChapterPage({ params }: { params: Params }) {
    const { book, chapter } = await params;
    const r = resolve(book, chapter);
    if (!r) notFound();
    const { b, ch } = r;

    const label = formatReference({ book, chapter: ch });
    const kjv = chapterVerses('kjv', book, ch);
    const web = chapterVerses('web', book, ch);
    const count = verseCount(book, ch) ?? kjv.length;
    const xrefs = getXrefs(book);
    const { prev, next } = neighbours(book, ch);

    const nav = (ref: VerseRef | null, dir: 'prev' | 'next') =>
        ref ? (
            <Link
                href={chapterHref(ref.book, ref.chapter)}
                prefetch={false}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
                {dir === 'prev' && <ChevronLeft className="h-4 w-4" />}
                {formatReference(ref)}
                {dir === 'next' && <ChevronRight className="h-4 w-4" />}
            </Link>
        ) : (
            <span />
        );

    return (
        <article className="container mx-auto max-w-3xl px-4 py-16">
            <BibleHead />
            <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                <Link href="/bible/" className="hover:text-foreground">Bible</Link>
                <span aria-hidden>/</span>
                <Link href={`/bible/#${b.id}`} className="hover:text-foreground">{b.name}</Link>
                <span aria-hidden>/</span>
                <span aria-current="page" className="text-foreground">{label}</span>
            </nav>

            <header className="mb-8 border-b border-border pb-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="text-4xl font-bold tracking-tight">{label}</h1>
                    <TranslationToggle />
                </div>
                <ChapterTarget book={book} chapter={ch} count={count} label={label} />
            </header>

            <div className="space-y-5">
                {Array.from({ length: count }, (_, i) => i + 1).map((v) => {
                    const related = (xrefs[`${ch}.${v}`] ?? []).filter((t) => parseTarget(t) !== null);
                    return (
                        <div key={v} id={`v${v}`} className="bible-verse">
                            <p className="bible-p">
                                <sup>{v}</sup>
                                <span className="tr-kjv">{kjv[v - 1] ?? <em className="text-muted-foreground">(not in KJV)</em>}</span>
                                <span className="tr-web">{web[v - 1] ?? <em className="text-muted-foreground">(not in WEB)</em>}</span>
                            </p>
                            <div className="bible-x">
                                <a
                                    href={crossReferencerUrl(book, ch, v)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    View in cross referencer <span aria-hidden>↗</span>
                                </a>
                            </div>
                            {related.length > 0 && <RelatedPassages targets={related} />}
                        </div>
                    );
                })}
            </div>

            <div className="mt-12 flex items-center justify-between border-t border-border pt-6">
                {nav(prev, 'prev')}
                {nav(next, 'next')}
            </div>
            <BibleCredits xrefs />
        </article>
    );
}
