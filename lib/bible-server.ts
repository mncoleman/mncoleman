/**
 * Server-only (build time) readers for the static Bible data. Uses fs, so never import this
 * from a client component. Everything is memoised per book; a missing or unreadable file
 * degrades to "no data" instead of throwing, so one bad ref can never fail the build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BOOKS, getBook, type Book } from './bible/books';
import { formatReference, parseVerseHref, type VerseRef } from './bible/reference';

export type Tr = 'kjv' | 'web';
export interface BookFile {
    book: string;
    translation: string;
    chapters: (string | null)[][];
}
/** One verse of a passage. `t` is null when the verse does not exist in that translation. */
export interface PassageVerse {
    n: number;
    t: string | null;
}
export interface Passage {
    verses: PassageVerse[];
    /** True when the passage was cut short (long range or a whole chapter). */
    more: boolean;
}
/** Everything a VerseLink needs, baked in at build time. */
export interface VerseLinkData {
    href: string;
    reference: string;
    kjv: Passage;
    web: Passage;
}

const ROOT = process.cwd();
const bookCache = new Map<string, BookFile | null>();
const xrefCache = new Map<string, Record<string, string[]>>();
let gridCache: Map<string, number[]> | null = null;

function readJson<T>(rel: string): T | null {
    try {
        return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8')) as T;
    } catch {
        return null;
    }
}

/** Verse counts per chapter for each book, from the KJV grid in public/bible-data/index.json. */
export function getGrid(): Map<string, number[]> {
    if (!gridCache) {
        const idx = readJson<{ books: { id: string; chapters: number[] }[] }>('public/bible-data/index.json');
        gridCache = new Map((idx?.books ?? []).map((b) => [b.id, b.chapters]));
    }
    return gridCache;
}

export function verseCount(book: string, chapter: number): number | undefined {
    return getGrid().get(book)?.[chapter - 1];
}

export function loadBook(tr: Tr, book: string): BookFile | null {
    if (!getBook(book)) return null; // also keeps path traversal out of the fs call
    const key = `${tr}/${book}`;
    if (!bookCache.has(key)) bookCache.set(key, readJson<BookFile>(`public/bible-data/${tr}/${book}.json`));
    return bookCache.get(key) ?? null;
}

/** Verse text, null when absent from the translation, undefined when the data is unavailable. */
export function verseText(tr: Tr, book: string, chapter: number, verse: number): string | null | undefined {
    return loadBook(tr, book)?.chapters[chapter - 1]?.[verse - 1];
}

export function chapterVerses(tr: Tr, book: string, chapter: number): (string | null)[] {
    return loadBook(tr, book)?.chapters[chapter - 1] ?? [];
}

/** True when the ref lies on the KJV verse grid. */
export function isValidRef(ref: VerseRef): boolean {
    const n = verseCount(ref.book, ref.chapter);
    if (n === undefined) return false;
    if (ref.start === undefined) return true;
    if (ref.start > n) return false;
    return ref.end === undefined || ref.end <= n;
}

export function passage(tr: Tr, ref: VerseRef, max: number): Passage {
    const n = verseCount(ref.book, ref.chapter) ?? 0;
    const start = ref.start ?? 1;
    const end = ref.start === undefined ? n : (ref.end ?? ref.start);
    const verses: PassageVerse[] = [];
    for (let v = start; v <= end && verses.length < max; v++) {
        verses.push({ n: v, t: verseText(tr, ref.book, ref.chapter, v) ?? null });
    }
    return { verses, more: end - start + 1 > verses.length };
}

/** Build the baked data for a `/bible/...` href. Null when it is not a valid verse link. */
export function bakeVerseLink(href: string | undefined): VerseLinkData | null {
    if (!href || !href.startsWith('/bible/')) return null;
    try {
        const ref = parseVerseHref(href);
        if (!ref || !isValidRef(ref) || !loadBook('kjv', ref.book)) return null;
        const max = ref.start === undefined ? 3 : 12;
        return { href, reference: formatReference(ref), kjv: passage('kjv', ref, max), web: passage('web', ref, max) };
    } catch {
        return null;
    }
}

/** Parse a cross-reference target like `Rom.8.28` or `Ps.1.1-3` into a ref. */
export function parseTarget(t: string): VerseRef | null {
    const m = /^([A-Za-z0-9]+)\.(\d+)\.(\d+)(?:-(\d+))?$/.exec(t);
    if (!m) return null;
    const ref: VerseRef = { book: m[1], chapter: Number(m[2]), start: Number(m[3]) };
    if (m[4] && Number(m[4]) > ref.start!) ref.end = Number(m[4]);
    return isValidRef(ref) ? ref : null;
}

/** Cross references for a whole book: `{ "chapter.verse": ["Rom.8.28", ...] }`, best first. */
export function getXrefs(book: string): Record<string, string[]> {
    if (!getBook(book)) return {};
    let x = xrefCache.get(book);
    if (!x) {
        x = readJson<Record<string, string[]>>(`data/bible/xrefs/${book}.json`) ?? {};
        xrefCache.set(book, x);
    }
    return x;
}

export function allChapterParams(): { book: string; chapter: string }[] {
    return BOOKS.flatMap((b: Book) => Array.from({ length: b.chapters }, (_, i) => ({ book: b.id, chapter: String(i + 1) })));
}

export function crossReferencerUrl(book: string, chapter: number, verse = 1): string {
    return `https://dkcoleman.com/bible?ref=${book}.${chapter}.${verse}`;
}

export function chapterHref(book: string, chapter: number): string {
    return `/bible/${book}/${chapter}/`;
}

/** Previous / next chapter across book boundaries. */
export function neighbours(book: string, chapter: number): { prev: VerseRef | null; next: VerseRef | null } {
    const b = getBook(book);
    if (!b) return { prev: null, next: null };
    let prev: VerseRef | null = null;
    let next: VerseRef | null = null;
    if (chapter > 1) prev = { book, chapter: chapter - 1 };
    else if (b.ordinal > 0) {
        const p = BOOKS[b.ordinal - 1];
        prev = { book: p.id, chapter: p.chapters };
    }
    if (chapter < b.chapters) next = { book, chapter: chapter + 1 };
    else if (b.ordinal < BOOKS.length - 1) next = { book: BOOKS[b.ordinal + 1].id, chapter: 1 };
    return { prev, next };
}
