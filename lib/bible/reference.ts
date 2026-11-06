/**
 * Verse references: parsing what a person types, formatting, and the stored href.
 * The typed-reference grammar is adapted from github.com/mncoleman/bible-cross-references
 * (src/core/bible/reference-parse.ts, reference-format.ts), MIT License,
 * Copyright (c) 2026 Oleksii Trekhleb. Extended with verse ranges within a chapter.
 *
 * Plain TypeScript, no browser APIs.
 */
import { getBook, type Book } from './books';
import { lookupBook } from './book-lookup';

/** A passage within one chapter. `end` is only set when it is greater than `start`. */
export interface VerseRef {
    book: string;
    chapter: number;
    start?: number;
    end?: number;
}

/** What the parser needs to know about the text's shape. The built-in one knows chapter counts only. */
export interface Versification {
    chapterCount(book: string): number | undefined;
    verseCount(book: string, chapter: number): number | undefined;
}

export const BUILTIN_VERSIFICATION: Versification = {
    chapterCount: (book) => getBook(book)?.chapters,
    verseCount: () => undefined,
};

export type ReferenceError =
    | { kind: 'unreadable' }
    | { kind: 'unknown-book'; query: string }
    | { kind: 'ambiguous-book'; query: string; candidates: readonly Book[] }
    | { kind: 'no-such-chapter'; book: string; chapters: number }
    | { kind: 'no-such-verse'; book: string; chapter: number; verses: number }
    | { kind: 'cross-chapter' };

export type ReferenceResult = { ok: true; ref: VerseRef } | { ok: false; error: ReferenceError };

/** The pieces of a typed reference, before the book is looked up. */
export interface TypedReference {
    book: string;
    chapter: number;
    start?: number;
    end?: number;
    /** True when a verse separator was typed, even with no verse after it ("John 3:"). */
    separator: boolean;
    /** The range crossed a chapter ("Matt 6:23-7:2"). */
    crossChapter: boolean;
}

// 1 book, 2 chapter, 3 everything after the chapter, 4 start, 5 end, 6 a second ":n" (cross-chapter)
const TYPED =
    /^((?:[1-3]\s*)?[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F\s.'\u2019-]*?)\s*(\d{1,3})((?:\s*[:.,]\s*|\s+)(\d{1,3})?(?:\s*[-\u2013\u2014]\s*(\d{1,3})?(\s*:\s*\d+)?)?)?\s*$/;

/** Splits `Matt 6:23-25` / `jn 3 16` / `1co13` into parts. Null when it is not shaped like a reference. */
export function splitReference(input: string): TypedReference | null {
    const m = TYPED.exec(input.trim());
    if (!m) return null;
    return {
        book: m[1].trim(),
        chapter: Number(m[2]),
        start: m[4] ? Number(m[4]) : undefined,
        end: m[5] ? Number(m[5]) : undefined,
        separator: m[3] !== undefined && /[:.,]/.test(m[3].replace(/\d[\s\S]*$/, '')),
        crossChapter: m[6] !== undefined,
    };
}

/** Normalises numbers against the versification. Returns the ref or the reason it is out of range. */
export function checkRef(
    book: Book,
    typed: Pick<TypedReference, 'chapter' | 'start' | 'end'>,
    v: Versification = BUILTIN_VERSIFICATION,
): ReferenceResult {
    const chapters = v.chapterCount(book.id) ?? book.chapters;
    if (typed.chapter < 1 || typed.chapter > chapters) {
        return { ok: false, error: { kind: 'no-such-chapter', book: book.id, chapters } };
    }
    const ref: VerseRef = { book: book.id, chapter: typed.chapter };
    if (typed.start === undefined) return { ok: true, ref };
    const verses = v.verseCount(book.id, typed.chapter);
    if (typed.start < 1 || (verses !== undefined && typed.start > verses)) {
        return { ok: false, error: { kind: 'no-such-verse', book: book.id, chapter: typed.chapter, verses: verses ?? 0 } };
    }
    ref.start = typed.start;
    if (typed.end !== undefined && typed.end > typed.start) {
        ref.end = verses !== undefined ? Math.min(typed.end, verses) : typed.end;
        if (ref.end <= ref.start) delete ref.end;
    }
    return { ok: true, ref };
}

/** Parses a complete typed reference such as `John 3:16`, `jn 3 16`, `1co13`, `Matt 6:23-25`, `Romans 8`. */
export function parseReference(input: string, v: Versification = BUILTIN_VERSIFICATION): ReferenceResult {
    const typed = splitReference(input);
    if (!typed) return { ok: false, error: { kind: 'unreadable' } };
    if (typed.crossChapter) return { ok: false, error: { kind: 'cross-chapter' } };
    const found = lookupBook(typed.book);
    if (found.kind === 'unknown') return { ok: false, error: { kind: 'unknown-book', query: typed.book } };
    if (found.kind === 'ambiguous') {
        return { ok: false, error: { kind: 'ambiguous-book', query: typed.book, candidates: found.candidates } };
    }
    return checkRef(found.book, typed, v);
}

/** `Matthew 12:13`, `Psalm 23:1-3`, `Romans 8`. */
export function formatReference(ref: VerseRef): string {
    const name = getBook(ref.book)?.referenceName ?? ref.book;
    if (ref.start === undefined) return `${name} ${ref.chapter}`;
    const verses = ref.end !== undefined && ref.end > ref.start ? `${ref.start}-${ref.end}` : String(ref.start);
    return `${name} ${ref.chapter}:${verses}`;
}

/** The stored link target: `/bible/Matt/12#v13`, `/bible/Matt/6#v23-25`, `/bible/Rom/8`. */
export function buildVerseHref(ref: VerseRef): string {
    let href = `/bible/${ref.book}/${ref.chapter}`;
    if (ref.start !== undefined) {
        href += `#v${ref.start}`;
        if (ref.end !== undefined && ref.end > ref.start) href += `-${ref.end}`;
    }
    return href;
}

const HREF = /^\/bible\/([A-Za-z0-9]+)\/(\d+)(?:#v(\d+)(?:-(\d+))?)?$/;

/** Inverse of `buildVerseHref`. Null for anything that is not exactly that shape. */
export function parseVerseHref(href: string): VerseRef | null {
    const m = HREF.exec(href);
    if (!m || !getBook(m[1])) return null;
    const ref: VerseRef = { book: m[1], chapter: Number(m[2]) };
    if (ref.chapter < 1) return null;
    if (m[3] !== undefined) {
        ref.start = Number(m[3]);
        if (ref.start < 1) return null;
        if (m[4] !== undefined) {
            const end = Number(m[4]);
            if (end <= ref.start) return null;
            ref.end = end;
        }
    }
    return ref;
}
