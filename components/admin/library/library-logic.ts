/**
 * Pure AI Library rules (no React) so `library-logic.selftest.ts` runs them under tsx: list search and the
 * Prompts / Skills filter, SKILL.md front matter handling, and the checks a Create or Save must pass.
 */
import { matchesQuery } from '../kit/list-logic';

export type LibraryKind = 'prompt' | 'skill';
export type KindFilter = 'all' | LibraryKind;
export type ResourceFolder = 'scripts' | 'references' | 'assets';

export interface ResourceRow { folder: ResourceFolder; filename: string; content: string }

export interface LibraryItem {
    slug: string;
    kind: LibraryKind;
    name: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
    /** The public page for this item on the artifact service (`/library/<slug>`). Copy link uses it as given. */
    url: string;
    ogImage: string;
    promptText?: string;
    skillMd?: string;
    resources?: ResourceRow[];
    downloadUrls: { txt?: string; md?: string; zip?: string };
}

export const RESOURCE_FOLDERS: ResourceFolder[] = ['scripts', 'references', 'assets'];

export function suggestSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export function isValidSlug(slug: string): boolean {
    return /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(slug);
}

/** SKILL.md is server-assembled (front matter + body): strip the front matter so the editor shows only what the admin wrote. */
export function stripSkillFrontmatter(skillMd: string): string {
    const match = skillMd.match(/^---\n[\s\S]*?\n---\n\n?([\s\S]*)$/);
    return match ? match[1] : skillMd;
}

export const KIND_OPTIONS: { value: KindFilter; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'prompt', label: 'Prompts' },
    { value: 'skill', label: 'Skills' },
];

export function filterLibrary<T extends LibraryItem>(rows: readonly T[], o: { query: string; kind: KindFilter }): T[] {
    return rows.filter((r) => (o.kind === 'all' || r.kind === o.kind) && matchesQuery([r.name, r.slug, r.description, r.promptText], o.query));
}

/** The first thing wrong with a new item, in plain words, or null. Matches what the Worker would refuse. */
export function createProblem(v: { kind: LibraryKind; name: string; slug: string; promptText: string; description: string; taken: readonly string[] }): string | null {
    if (!v.name.trim()) return 'Give it a title.';
    if (v.slug && !isValidSlug(v.slug)) return 'The address must be 3 to 60 characters of a-z, 0-9 and -, starting and ending with a letter or digit.';
    if (v.slug && v.taken.includes(v.slug)) return 'Another item already uses that address.';
    if (v.kind === 'prompt' && !v.promptText.trim()) return 'Write the prompt text.';
    if (v.kind === 'skill' && !v.description.trim()) return 'Skills need a description.';
    return null;
}

/** A skill must keep a description when saved. */
export function saveProblem(kind: LibraryKind, description: string): string | null {
    return kind === 'skill' && !description.trim() ? 'Skills need a description.' : null;
}

/** The service stores a body trimmed plus one newline, so a loaded body and the text just saved differ only by trailing whitespace. */
export const sameBody = (a: string, b: string): boolean => a.replace(/\s+$/, '') === b.replace(/\s+$/, '');

/** What to send for a body on Save: nothing when it only differs by trailing whitespace, else the edited text byte for byte. */
export function bodyPatch(loaded: string, edited: string): string | undefined {
    return sameBody(loaded, edited) ? undefined : edited;
}
