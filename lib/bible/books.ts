/**
 * Book table and lookup helpers, adapted from github.com/mncoleman/bible-cross-references
 * (src/core/bible/books.ts), MIT License, Copyright (c) 2026 Oleksii Trekhleb.
 * Trimmed to English only, with chapter counts added so the chapter grid and
 * chapter validation work before any data file has loaded.
 *
 * Plain TypeScript, no browser APIs: the site build can import it too.
 */

export type Testament = 'OT' | 'NT';

export interface Book {
    /** OSIS book id, e.g. `Gen`, `1Cor`. */
    readonly id: string;
    /** Full English name, e.g. `Psalms`. */
    readonly name: string;
    /** Name used when citing a passage, e.g. `Psalm`. */
    readonly referenceName: string;
    readonly testament: Testament;
    readonly chapters: number;
    /** Extra spellings accepted when parsing input. */
    readonly aliases: readonly string[];
    /** Zero-based canonical position. */
    readonly ordinal: number;
}

// id, name, referenceName ('' = same as name), chapter count, aliases
type Row = readonly [string, string, string, number, readonly string[]];

const OT: readonly Row[] = [
    ['Gen', 'Genesis', '', 50, ['ge', 'gn']],
    ['Exod', 'Exodus', '', 40, ['ex', 'exo']],
    ['Lev', 'Leviticus', '', 27, ['le', 'lv']],
    ['Num', 'Numbers', '', 36, ['nu', 'nm', 'nb']],
    ['Deut', 'Deuteronomy', '', 34, ['de', 'dt', 'deu']],
    ['Josh', 'Joshua', '', 24, ['jos', 'jsh']],
    ['Judg', 'Judges', '', 21, ['jdg', 'jg', 'jdgs']],
    ['Ruth', 'Ruth', '', 4, ['ru', 'rth']],
    ['1Sam', '1 Samuel', '', 31, ['1sa', '1sm']],
    ['2Sam', '2 Samuel', '', 24, ['2sa', '2sm']],
    ['1Kgs', '1 Kings', '', 22, ['1ki', '1kg']],
    ['2Kgs', '2 Kings', '', 25, ['2ki', '2kg']],
    ['1Chr', '1 Chronicles', '', 29, ['1ch', '1chron']],
    ['2Chr', '2 Chronicles', '', 36, ['2ch', '2chron']],
    ['Ezra', 'Ezra', '', 10, ['ezr']],
    ['Neh', 'Nehemiah', '', 13, ['ne']],
    ['Esth', 'Esther', '', 10, ['es', 'est']],
    ['Job', 'Job', '', 42, ['jb']],
    ['Ps', 'Psalms', 'Psalm', 150, ['psa', 'psm', 'pss']],
    ['Prov', 'Proverbs', '', 31, ['pr', 'pro', 'prv']],
    ['Eccl', 'Ecclesiastes', '', 12, ['ec', 'ecc', 'qoh']],
    ['Song', 'Song of Solomon', '', 8, ['sng', 'sos', 'songofsongs', 'canticles']],
    ['Isa', 'Isaiah', '', 66, ['is']],
    ['Jer', 'Jeremiah', '', 52, ['je', 'jr']],
    ['Lam', 'Lamentations', '', 5, ['la']],
    ['Ezek', 'Ezekiel', '', 48, ['eze', 'ezk']],
    ['Dan', 'Daniel', '', 12, ['da', 'dn']],
    ['Hos', 'Hosea', '', 14, ['ho']],
    ['Joel', 'Joel', '', 3, ['jl']],
    ['Amos', 'Amos', '', 9, ['am']],
    ['Obad', 'Obadiah', '', 1, ['ob', 'oba']],
    ['Jonah', 'Jonah', '', 4, ['jon', 'jnh']],
    ['Mic', 'Micah', '', 7, ['mi', 'mc']],
    ['Nah', 'Nahum', '', 3, ['na']],
    ['Hab', 'Habakkuk', '', 3, ['hb']],
    ['Zeph', 'Zephaniah', '', 3, ['zep', 'zp']],
    ['Hag', 'Haggai', '', 2, ['hg']],
    ['Zech', 'Zechariah', '', 14, ['zec', 'zc']],
    ['Mal', 'Malachi', '', 4, ['ml']],
];

const NT: readonly Row[] = [
    ['Matt', 'Matthew', '', 28, ['mt', 'mat']],
    ['Mark', 'Mark', '', 16, ['mk', 'mr', 'mrk']],
    ['Luke', 'Luke', '', 24, ['lk', 'luk']],
    ['John', 'John', '', 21, ['jn', 'jhn', 'joh']],
    ['Acts', 'Acts', '', 28, ['ac', 'act']],
    ['Rom', 'Romans', '', 16, ['ro', 'rm']],
    ['1Cor', '1 Corinthians', '', 16, ['1co']],
    ['2Cor', '2 Corinthians', '', 13, ['2co']],
    ['Gal', 'Galatians', '', 6, ['ga']],
    ['Eph', 'Ephesians', '', 6, ['ephes']],
    ['Phil', 'Philippians', '', 4, ['php', 'pp']],
    ['Col', 'Colossians', '', 4, []],
    ['1Thess', '1 Thessalonians', '', 5, ['1th', '1thes', '1ts']],
    ['2Thess', '2 Thessalonians', '', 3, ['2th', '2thes', '2ts']],
    ['1Tim', '1 Timothy', '', 6, ['1ti', '1tm']],
    ['2Tim', '2 Timothy', '', 4, ['2ti', '2tm']],
    ['Titus', 'Titus', '', 3, ['ti', 'tit']],
    ['Phlm', 'Philemon', '', 1, ['phm', 'pm', 'philem']],
    ['Heb', 'Hebrews', '', 13, ['he']],
    ['Jas', 'James', '', 5, ['jm', 'jam']],
    ['1Pet', '1 Peter', '', 5, ['1pe', '1pt']],
    ['2Pet', '2 Peter', '', 3, ['2pe', '2pt']],
    ['1John', '1 John', '', 5, ['1jn', '1jo', '1jhn']],
    ['2John', '2 John', '', 1, ['2jn', '2jo', '2jhn']],
    ['3John', '3 John', '', 1, ['3jn', '3jo', '3jhn']],
    ['Jude', 'Jude', '', 1, ['jud', 'jd']],
    ['Rev', 'Revelation', '', 22, ['re', 'rv', 'apocalypse']],
];

export const BOOKS: readonly Book[] = [
    ...OT.map((r) => ({ r, testament: 'OT' as const })),
    ...NT.map((r) => ({ r, testament: 'NT' as const })),
].map(({ r: [id, name, ref, chapters, aliases], testament }, ordinal) => ({
    id,
    name,
    referenceName: ref || name,
    testament,
    chapters,
    aliases,
    ordinal,
}));

const BY_ID: ReadonlyMap<string, Book> = new Map(BOOKS.map((b) => [b.id, b]));

export function isBookId(value: string): boolean {
    return BY_ID.has(value);
}

export function getBook(id: string): Book | undefined {
    return BY_ID.get(id);
}
