/**
 * Book lookup by name, OSIS id, abbreviation or unique prefix. Adapted from
 * github.com/mncoleman/bible-cross-references (src/core/bible/book-lookup.ts),
 * MIT License, Copyright (c) 2026 Oleksii Trekhleb. English only; adds an `exact` flag so
 * the picker can tell "typed the whole book" from "typed enough to be unambiguous".
 */
import { BOOKS, type Book } from './books';

export type BookLookupResult =
    | { readonly kind: 'found'; readonly book: Book; readonly exact: boolean }
    | { readonly kind: 'ambiguous'; readonly candidates: readonly Book[] }
    | { readonly kind: 'unknown' };

/** Lowercase, roman-numeral prefix to digit ("II Kings" -> "2kings"), separators removed. */
export function normalizeBookName(value: string): string {
    return value
        .normalize('NFC')
        .trim()
        .toLowerCase()
        .replace(/^(i{1,3})\s+/, (_m: string, numeral: string) => String(numeral.length))
        .replace(/[\s.\-'’‘ʼº°ª]+/gu, '');
}

/** The same with accents folded away, for typing without them. */
export function foldBookName(value: string): string {
    return normalizeBookName(value).normalize('NFD').replace(/\p{M}+/gu, '');
}

interface Index {
    readonly exact: ReadonlyMap<string, Book>;
    readonly byName: readonly { readonly book: Book; readonly names: readonly string[] }[];
}

let cached: Index | null = null;

function index(): Index {
    if (cached) return cached;
    const exact = new Map<string, Book>();
    for (const book of BOOKS) {
        for (const spelling of [book.id, book.name, book.referenceName, ...book.aliases]) {
            const key = normalizeBookName(spelling);
            // First book keeps a contested spelling; the table has none today.
            if (!exact.has(key)) exact.set(key, book);
        }
    }
    cached = {
        exact,
        byName: BOOKS.map((book) => ({
            book,
            names: [book.name, book.referenceName].map(foldBookName),
        })),
    };
    return cached;
}

export function lookupBook(query: string): BookLookupResult {
    const key = normalizeBookName(query);
    if (key === '') return { kind: 'unknown' };
    const idx = index();
    const hit = idx.exact.get(key);
    if (hit) return { kind: 'found', book: hit, exact: true };
    const loose = foldBookName(query);
    const candidates = idx.byName.filter(({ names }) => names.some((n) => n.startsWith(loose))).map(({ book }) => book);
    if (candidates.length === 1) return { kind: 'found', book: candidates[0], exact: false };
    return candidates.length === 0 ? { kind: 'unknown' } : { kind: 'ambiguous', candidates };
}
