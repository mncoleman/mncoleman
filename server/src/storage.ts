import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.env.STORAGE_ROOT || '/srv/artifacts';

export type Visibility = 'public' | 'private';

export interface ArtifactMeta {
    slug: string;
    name: string;
    description: string;
    filename: string;
    type: string;
    size: number;
    uploadedAt: string;
    visibility: Visibility;
    /** bcrypt hash, present only when visibility === 'private' */
    passwordHash?: string;
}

export class SlugTakenError extends Error {
    constructor() {
        super('slug already in use');
        this.name = 'SlugTakenError';
    }
}

export async function ensureRoot() {
    if (!existsSync(ROOT)) await mkdir(ROOT, { recursive: true });
}

export async function exists(slug: string): Promise<boolean> {
    return existsSync(join(ROOT, slug));
}

export async function save(slug: string, fileBytes: ArrayBuffer, meta: ArtifactMeta): Promise<void> {
    const dir = join(ROOT, slug);
    try {
        await mkdir(dir);
    } catch (e: any) {
        if (e?.code === 'EEXIST') throw new SlugTakenError();
        throw e;
    }
    try {
        await writeFile(join(dir, meta.filename), Buffer.from(fileBytes));
        await writeFile(join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
    } catch (err) {
        await rm(dir, { recursive: true, force: true }).catch(() => {});
        throw err;
    }
}

export async function getMeta(slug: string): Promise<ArtifactMeta | null> {
    try {
        const raw = await readFile(join(ROOT, slug, 'meta.json'), 'utf-8');
        return JSON.parse(raw) as ArtifactMeta;
    } catch {
        return null;
    }
}

export async function getFile(slug: string, filename: string): Promise<Buffer> {
    return readFile(join(ROOT, slug, filename));
}

export async function saveOg(slug: string, png: Buffer): Promise<void> {
    await writeFile(join(ROOT, slug, 'og.png'), png);
}

export async function getOg(slug: string): Promise<Buffer | null> {
    try {
        return await readFile(join(ROOT, slug, 'og.png'));
    } catch {
        return null;
    }
}

export async function listAll(): Promise<ArtifactMeta[]> {
    await ensureRoot();
    let entries: { name: string; isDirectory: () => boolean }[];
    try {
        entries = await readdir(ROOT, { withFileTypes: true });
    } catch {
        return [];
    }
    const dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const metas = (await Promise.all(dirNames.map((d) => getMeta(d))))
        .filter((m): m is ArtifactMeta => m !== null);
    return metas.sort(
        (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    );
}

export function getLatestUploadedAt(metas: ArtifactMeta[]): string | null {
    if (metas.length === 0) return null;
    return metas[0].uploadedAt;
}

export async function remove(slug: string): Promise<void> {
    await rm(join(ROOT, slug), { recursive: true, force: true });
}
