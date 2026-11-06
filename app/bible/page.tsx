import type { Metadata } from 'next';
import { BOOKS } from '@/lib/bible/books';
import { BibleHead } from '@/components/bible/BibleHead';
import { BibleCredits } from '@/components/bible/BibleCredits';

export const metadata: Metadata = {
    title: 'Bible (KJV/WEB) | Matthew Coleman',
    description: 'Read the King James Version and World English Bible by chapter, with related passages for every verse.',
    alternates: { canonical: '/bible/' },
    openGraph: { title: 'Bible (KJV/WEB)', url: '/bible/', type: 'website' },
};

function Testament({ title, testament }: { title: string; testament: 'OT' | 'NT' }) {
    return (
        <section className="mb-12">
            <h2 className="mb-6 text-2xl font-semibold tracking-tight">{title}</h2>
            <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
                {BOOKS.filter((b) => b.testament === testament).map((b) => (
                    <div key={b.id} id={b.id} className="scroll-mt-24">
                        <h3 className="mb-2 font-medium">{b.name}</h3>
                        <ul className="bible-ch">
                            {Array.from({ length: b.chapters }, (_, i) => i + 1).map((c) => (
                                <li key={c}>
                                    <a href={`/bible/${b.id}/${c}/`}>{c}</a>
                                </li>
                            ))}
                        </ul>
                    </div>
                ))}
            </div>
        </section>
    );
}

export default function BibleIndexPage() {
    return (
        <div className="container mx-auto max-w-4xl px-4 py-16">
            <BibleHead />
            <header className="mb-12">
                <h1 className="mb-3 text-4xl font-bold tracking-tight">Bible</h1>
                <p className="text-muted-foreground">King James Version and World English Bible, with related passages for every verse.</p>
            </header>
            <Testament title="Old Testament" testament="OT" />
            <Testament title="New Testament" testament="NT" />
            <BibleCredits />
        </div>
    );
}
