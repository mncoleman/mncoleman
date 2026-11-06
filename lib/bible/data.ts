/**
 * Lazy, cached access to the static Bible data under /bible-data. Everything is fetched on
 * first use and kept in memory; nothing here runs at import time.
 *
 * Layout (all produced by scripts/bible/build.ts):
 *   index.json            { books: [{ id, name, chapters: [verseCountPerChapter] }] }
 *   {kjv,web}/{OSIS}.json { book, translation, chapters: [[verseText | null]] }
 *   search.json           { [OSIS]: [ [ "kjv text | web text" per verse ] per chapter ] }
 * Chapters and verses are zero-based arrays: chapter 1 is index 0.
 */
import { BUILTIN_VERSIFICATION, type VerseRef, type Versification } from './reference';

export type Translation = 'kjv' | 'web';

export interface BibleIndex {
    books: { id: string; name: string; chapters: number[] }[];
}
export interface BookFile {
    book: string;
    translation: string;
    chapters: (string | null)[][];
}
export type SearchData = Record<string, string[][]>;

const BASE = '/bible-data';

function cachedFetch<T>(cache: Map<string, Promise<T>>, key: string, url: string): Promise<T> {
    let p = cache.get(key);
    if (!p) {
        p = fetch(url).then((r) => {
            if (!r.ok) throw new Error(`${url}: ${r.status}`);
            return r.json() as Promise<T>;
        });
        // A failure must not be remembered, or one blip would break the feature until reload.
        p.catch(() => cache.delete(key));
        cache.set(key, p);
    }
    return p;
}

let indexValue: BibleIndex | null = null;
let indexById: Map<string, number[]> | null = null;
let searchValue: SearchData | null = null;
const books = new Map<string, BookFile>();
const inflight = {
    index: new Map<string, Promise<BibleIndex>>(),
    book: new Map<string, Promise<BookFile>>(),
    search: new Map<string, Promise<SearchData>>(),
};
const listeners = new Set<() => void>();

/** Called whenever any data finishes loading, so UI can re-render. */
export function onBibleData(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
function emit() {
    listeners.forEach((fn) => fn());
}

export function loadIndex(): Promise<BibleIndex> {
    return cachedFetch(inflight.index, 'index', `${BASE}/index.json`).then((i) => {
        if (!indexValue) {
            indexValue = i;
            indexById = new Map(i.books.map((b) => [b.id, b.chapters]));
            emit();
        }
        return i;
    });
}
export function getIndexSync(): BibleIndex | null {
    return indexValue;
}

/** Exact chapter and verse counts once the index has loaded; chapter counts only before that. */
export const versification: Versification = {
    chapterCount: (book) => indexById?.get(book)?.length ?? BUILTIN_VERSIFICATION.chapterCount(book),
    verseCount: (book, chapter) => indexById?.get(book)?.[chapter - 1],
};

export function loadBook(tr: Translation, book: string): Promise<BookFile> {
    const key = `${tr}/${book}`;
    return cachedFetch(inflight.book, key, `${BASE}/${key}.json`).then((f) => {
        if (!books.has(key)) {
            books.set(key, f);
            emit();
        }
        return f;
    });
}
export function getBookSync(tr: Translation, book: string): BookFile | null {
    return books.get(`${tr}/${book}`) ?? null;
}

export function loadSearch(): Promise<SearchData> {
    return cachedFetch(inflight.search, 'search', `${BASE}/search.json`).then((s) => {
        if (!searchValue) {
            searchValue = s;
            emit();
        }
        return s;
    });
}
export function getSearchSync(): SearchData | null {
    return searchValue;
}

/** The verses of a ref (a whole chapter when it has no verse) as `[number, text]`, from a loaded book. */
export function versesOf(file: BookFile, ref: VerseRef): [number, string][] {
    const chapter = file.chapters[ref.chapter - 1];
    if (!chapter) return [];
    const from = ref.start ?? 1;
    const to = ref.start === undefined ? chapter.length : (ref.end ?? ref.start);
    const out: [number, string][] = [];
    for (let v = from; v <= to; v++) {
        const t = chapter[v - 1];
        if (t) out.push([v, t]);
    }
    return out;
}

/** Joined text of a ref from a loaded book, or null when the book is not loaded yet. `max` caps verses. */
export function previewText(tr: Translation, ref: VerseRef, max = 3): string | null {
    const file = getBookSync(tr, ref.book);
    if (!file) return null;
    const vs = versesOf(file, ref);
    const text = vs.slice(0, max).map(([, t]) => t).join(' ');
    return vs.length > max ? `${text} …` : text;
}

/** Test hook: install data without fetching. */
export function __setDataForTests(d: { index?: BibleIndex; search?: SearchData }) {
    if (d.index) {
        indexValue = d.index;
        indexById = new Map(d.index.books.map((b) => [b.id, b.chapters]));
    }
    if (d.search) searchValue = d.search;
}
