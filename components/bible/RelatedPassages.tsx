'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatReference, type VerseRef } from '@/lib/bible/reference';
import { getBook } from '@/lib/bible/books';
import { useTranslation, type Tr } from './translation';

/**
 * "Related passages" for one verse. The server bakes only the targets (e.g. "Rom.8.28",
 * "Ps.1.1-3"), so the links work without JS and the page stays small. When the <details> is
 * first opened, the verse text is fetched from /bible-data/{kjv|web}/{book}.json (cached per
 * book) for the current translation. A failed fetch leaves just the links.
 */
interface BookFile {
    chapters: (string | null)[][];
}
const cache = new Map<string, Promise<BookFile>>();
function loadBook(tr: Tr, book: string): Promise<BookFile> {
    const key = `${tr}/${book}`;
    let p = cache.get(key);
    if (!p) {
        p = fetch(`/bible-data/${tr}/${book}.json`).then((r) => {
            if (!r.ok) throw new Error(String(r.status));
            return r.json() as Promise<BookFile>;
        });
        p.catch(() => cache.delete(key)); // do not remember a failure
        cache.set(key, p);
    }
    return p;
}

function parse(t: string): VerseRef | null {
    const m = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)(?:-(\d+))?$/.exec(t);
    if (!m || !getBook(m[1])) return null;
    const ref: VerseRef = { book: m[1], chapter: Number(m[2]), start: Number(m[3]) };
    if (m[4] && Number(m[4]) > ref.start!) ref.end = Number(m[4]);
    return ref;
}

const MAX_VERSES = 2;

export function RelatedPassages({ targets }: { targets: string[] }) {
    const refs = targets.map(parse).filter((r): r is VerseRef => r !== null);
    const tr = useTranslation();
    const [opened, setOpened] = useState(false);
    const [texts, setTexts] = useState<Record<string, string | null>>({});
    const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle');

    useEffect(() => {
        if (!opened) return;
        let live = true;
        setState('loading');
        Promise.all(refs.map((r) => loadBook(tr, r.book).then((f) => [r, f] as const)))
            .then((pairs) => {
                if (!live) return;
                const out: Record<string, string | null> = {};
                for (const [r, f] of pairs) {
                    const end = Math.min(r.end ?? r.start!, r.start! + MAX_VERSES - 1);
                    const parts: string[] = [];
                    let missing = false;
                    for (let v = r.start!; v <= end; v++) {
                        const t = f.chapters[r.chapter - 1]?.[v - 1];
                        if (t) parts.push(end > r.start! ? `${v} ${t}` : t);
                        else missing = true;
                    }
                    const more = (r.end ?? r.start!) > end ? ' …' : '';
                    out[`${tr}:${r.book}.${r.chapter}.${r.start}-${r.end ?? ''}`] = parts.length ? parts.join(' ') + more : missing ? `(not in ${tr.toUpperCase()})` : null;
                }
                setTexts((prev) => ({ ...prev, ...out }));
                setState('idle');
            })
            .catch(() => live && setState('failed'));
        return () => {
            live = false;
        };
        // refs is derived from targets; re-run when opened or the translation changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [opened, tr, targets.join('|')]);

    if (refs.length === 0) return null;
    return (
        <details className="bible-det" onToggle={(e) => e.currentTarget.open && setOpened(true)}>
            <summary>Related passages ({refs.length})</summary>
            <ul className="bible-rel">
                {refs.map((r) => {
                    const href = `/bible/${r.book}/${r.chapter}/#v${r.start}${r.end ? `-${r.end}` : ''}`;
                    const text = texts[`${tr}:${r.book}.${r.chapter}.${r.start}-${r.end ?? ''}`];
                    return (
                        <li key={href}>
                            <Link href={href} prefetch={false}>
                                {formatReference(r)}
                            </Link>{' '}
                            {text ? <span className="text-muted-foreground">{text}</span> : opened && state === 'loading' ? <span className="text-muted-foreground">Loading…</span> : null}
                        </li>
                    );
                })}
            </ul>
        </details>
    );
}
