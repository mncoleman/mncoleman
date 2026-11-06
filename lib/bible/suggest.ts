/**
 * Turns what a person typed after `@` into picker results. Synchronous and network-free:
 * typed references resolve against the built-in book table (and exact verse counts once
 * the index has loaded). Phrase search runs separately against search.json.
 */
import { BOOKS, type Book } from './books';
import { lookupBook, normalizeBookName } from './book-lookup';
import {
    checkRef,
    formatReference,
    splitReference,
    type VerseRef,
    type Versification,
    BUILTIN_VERSIFICATION,
} from './reference';
import type { SearchData } from './data';

export type PickItem =
    | { kind: 'book'; book: Book }
    | { kind: 'ref'; ref: VerseRef }
    | { kind: 'hit'; ref: VerseRef; tokens: string[] };

export type PickGrid =
    | { type: 'chapter'; book: Book }
    | { type: 'verse'; book: Book; chapter: number; count: number };

export interface Suggestions {
    /** Reference-shaped results (books, passages). */
    items: PickItem[];
    grid: PickGrid | null;
    /** Why nothing matched, when a reference was recognised but is out of range. */
    message: string | null;
    /** The query reads as words, so a phrase search should run. */
    phrase: string | null;
}

const EMPTY: Suggestions = { items: [], grid: null, message: null, phrase: null };

/** Same normalisation the build applies to search.json. */
export function normalizeSearchText(s: string): string {
    return s
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function suggest(query: string, v: Versification = BUILTIN_VERSIFICATION): Suggestions {
    const q = query.trim();
    if (!q) return EMPTY;

    const typed = splitReference(q);
    if (typed) {
        if (typed.crossChapter) return { ...EMPTY, message: 'Pick a range inside one chapter.' };
        const found = lookupBook(typed.book);
        if (found.kind === 'unknown') return { ...EMPTY, phrase: phraseOf(q) };
        const books = found.kind === 'found' ? [found.book] : found.candidates.slice(0, 5);
        const items: PickItem[] = [];
        let grid: PickGrid | null = null;
        let message: string | null = null;
        for (const book of books) {
            const res = checkRef(book, typed, v);
            if (res.ok) {
                items.push({ kind: 'ref', ref: res.ref });
                const count = v.verseCount(book.id, res.ref.chapter);
                if (books.length === 1 && res.ref.start === undefined && count) {
                    grid = { type: 'verse', book, chapter: res.ref.chapter, count };
                }
            } else if (books.length === 1) {
                const e = res.error;
                message =
                    e.kind === 'no-such-chapter'
                        ? `${book.name} has ${e.chapters} chapter${e.chapters === 1 ? '' : 's'}.`
                        : e.kind === 'no-such-verse'
                          ? `${formatReference({ book: book.id, chapter: typed.chapter })} has ${e.verses || 'fewer'} verses.`
                          : null;
            }
        }
        return { items, grid, message, phrase: null };
    }

    const found = lookupBook(q);
    if (found.kind === 'unknown') return { ...EMPTY, phrase: phraseOf(q) };
    if (found.kind === 'ambiguous') {
        return { ...EMPTY, items: found.candidates.slice(0, 6).map((book) => ({ kind: 'book' as const, book })) };
    }
    const { book } = found;
    // The whole name is typed: nothing left to complete, only chapters to pick.
    const typedWhole = [book.name, book.referenceName].some((n) => normalizeBookName(n) === normalizeBookName(q));
    return {
        ...EMPTY,
        items: typedWhole ? [] : [{ kind: 'book', book }],
        grid: { type: 'chapter', book },
    };
}

function phraseOf(q: string): string | null {
    const n = normalizeSearchText(q);
    return n.replace(/\s/g, '').length >= 3 ? n : null;
}

/** Verses containing the phrase (best) or all of its words, in canonical order, at most `limit`. */
export function searchPhrase(normalized: string, data: SearchData, limit = 8): PickItem[] {
    const tokens = normalized.split(' ').filter(Boolean);
    if (tokens.length === 0) return [];
    const exact: PickItem[] = [];
    const loose: PickItem[] = [];
    for (const book of BOOKS) {
        const chapters = data[book.id];
        if (!chapters) continue;
        for (let c = 0; c < chapters.length && exact.length < limit; c++) {
            const verses = chapters[c];
            for (let i = 0; i < verses.length; i++) {
                const s = verses[i];
                if (!s) continue;
                if (s.includes(normalized)) {
                    exact.push({ kind: 'hit', ref: { book: book.id, chapter: c + 1, start: i + 1 }, tokens });
                    if (exact.length >= limit) break;
                } else if (loose.length < limit && tokens.length > 1 && tokens.every((t) => s.includes(t))) {
                    loose.push({ kind: 'hit', ref: { book: book.id, chapter: c + 1, start: i + 1 }, tokens });
                }
            }
        }
        if (exact.length >= limit) break;
    }
    return [...exact, ...loose].slice(0, limit);
}
