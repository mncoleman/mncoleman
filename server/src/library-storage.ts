import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SlugTakenError } from './storage';

const ROOT = process.env.LIBRARY_ROOT || '/srv/library';

export type LibraryKind = 'prompt' | 'skill';
export type ResourceFolder = 'scripts' | 'references' | 'assets';
const RESOURCE_FOLDERS: ResourceFolder[] = ['scripts', 'references', 'assets'];

export interface LibraryItemMeta {
    slug: string;
    kind: LibraryKind;
    name: string;
    createdAt: string;
    updatedAt: string;
    /** Skills only — required, ≤1024 chars, doubles as SKILL.md frontmatter `description`. */
    description?: string;
    /**
     * Design revision of the cached `og.png`. Bumping OG_VERSION in `og.tsx`
     * makes every stored card regenerate lazily on next read, so a card
     * redesign reaches already-published items without a manual re-save.
     */
    ogVersion?: number;
}

export interface ResourceFile {
    folder: ResourceFolder;
    filename: string;
    content: string;
}

export function isResourceFolder(f: string): f is ResourceFolder {
    return (RESOURCE_FOLDERS as string[]).includes(f);
}

export async function ensureLibraryRoot() {
    if (!existsSync(ROOT)) await mkdir(ROOT, { recursive: true });
}

export async function libraryItemExists(slug: string): Promise<boolean> {
    return existsSync(join(ROOT, slug));
}

/** Builds the full SKILL.md frontmatter block. `name`/`description` are guaranteed
 *  valid by construction — name is the already-validated slug, description is
 *  capped to 1024 chars by the route handler before this is called. */
function buildSkillFrontmatter(meta: LibraryItemMeta): string {
    const description = (meta.description || '').replace(/\n/g, ' ').trim();
    return ['---', `name: ${meta.slug}`, `description: ${description}`, '---', ''].join('\n');
}

export async function createLibraryItem(
    meta: LibraryItemMeta,
    body: { promptText?: string; skillBodyMd?: string; resources?: ResourceFile[] }
): Promise<void> {
    const dir = join(ROOT, meta.slug);
    try {
        await mkdir(dir);
    } catch (e: any) {
        if (e?.code === 'EEXIST') throw new SlugTakenError();
        throw e;
    }
    try {
        await writeFile(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
        if (meta.kind === 'prompt') {
            await writeFile(join(dir, 'prompt.md'), body.promptText || '');
        } else {
            await writeSkillBody(meta.slug, meta, body.skillBodyMd || '');
            await reconcileSkillResources(meta.slug, body.resources || []);
        }
    } catch (err) {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
        throw err;
    }
}

export async function getLibraryMeta(slug: string): Promise<LibraryItemMeta | null> {
    try {
        const raw = await readFile(join(ROOT, slug, 'meta.json'), 'utf-8');
        return JSON.parse(raw) as LibraryItemMeta;
    } catch {
        return null;
    }
}

export async function updateLibraryMeta(slug: string, meta: LibraryItemMeta): Promise<void> {
    await writeFile(join(ROOT, slug, 'meta.json'), JSON.stringify(meta, null, 2));
}

export async function getPromptText(slug: string): Promise<string> {
    try {
        return await readFile(join(ROOT, slug, 'prompt.md'), 'utf-8');
    } catch {
        return '';
    }
}

export async function replacePromptText(slug: string, text: string): Promise<void> {
    await writeFile(join(ROOT, slug, 'prompt.md'), text);
}

export async function getSkillMd(slug: string): Promise<string> {
    try {
        return await readFile(join(ROOT, slug, 'SKILL.md'), 'utf-8');
    } catch {
        return '';
    }
}

/** Writes the full assembled SKILL.md (frontmatter + admin-authored body) to disk. */
export async function writeSkillBody(slug: string, meta: LibraryItemMeta, bodyMd: string): Promise<void> {
    const full = `${buildSkillFrontmatter(meta)}\n${bodyMd.trim()}\n`;
    await writeFile(join(ROOT, slug, 'SKILL.md'), full);
}

/** Strips the frontmatter back off so the admin edit form can re-populate just the body. */
export async function getSkillBody(slug: string): Promise<string> {
    const full = await getSkillMd(slug);
    const match = full.match(/^---\n[\s\S]*?\n---\n\n?([\s\S]*)$/);
    return match ? match[1] : full;
}

export async function listSkillResources(slug: string): Promise<ResourceFile[]> {
    const out: ResourceFile[] = [];
    for (const folder of RESOURCE_FOLDERS) {
        const dir = join(ROOT, slug, folder);
        if (!existsSync(dir)) continue;
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile()) continue;
            const content = await readFile(join(dir, entry.name), 'utf-8');
            out.push({ folder, filename: entry.name, content });
        }
    }
    return out;
}

/** Full-replace: wipes scripts/references/assets and rewrites from the given list,
 *  so the on-disk layout never drifts from what the admin last submitted. */
export async function reconcileSkillResources(slug: string, resources: ResourceFile[]): Promise<void> {
    const slugDir = resolve(join(ROOT, slug));
    for (const folder of RESOURCE_FOLDERS) {
        await rm(join(slugDir, folder), { recursive: true, force: true }).catch(() => {});
    }
    for (const r of resources) {
        const dir = resolve(join(slugDir, r.folder));
        const target = resolve(join(dir, r.filename));
        if (!target.startsWith(`${dir}/`)) {
            throw new Error(`invalid resource filename: ${r.filename}`);
        }
        await mkdir(dir, { recursive: true });
        await writeFile(target, r.content);
    }
}

export async function saveLibraryOg(slug: string, png: Buffer): Promise<void> {
    await writeFile(join(ROOT, slug, 'og.png'), png);
}

export async function getLibraryOg(slug: string): Promise<Buffer | null> {
    try {
        return await readFile(join(ROOT, slug, 'og.png'));
    } catch {
        return null;
    }
}

export async function saveSkillZip(slug: string, zip: Buffer): Promise<void> {
    await writeFile(join(ROOT, slug, 'skill.zip'), zip);
}

export async function getSkillZip(slug: string): Promise<Buffer | null> {
    try {
        return await readFile(join(ROOT, slug, 'skill.zip'));
    } catch {
        return null;
    }
}

export async function listAllLibraryItems(): Promise<LibraryItemMeta[]> {
    await ensureLibraryRoot();
    let entries: { name: string; isDirectory: () => boolean }[];
    try {
        entries = await readdir(ROOT, { withFileTypes: true });
    } catch {
        return [];
    }
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const metas = (await Promise.all(dirNames.map((d) => getLibraryMeta(d))))
        .filter((m): m is LibraryItemMeta => m !== null);
    return metas.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
}

export async function removeLibraryItem(slug: string): Promise<void> {
    await rm(join(ROOT, slug), { recursive: true, force: true });
}
