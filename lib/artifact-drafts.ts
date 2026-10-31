/**
 * Local copies of static artifacts that were uploaded or replaced but are not live yet.
 *
 * A static artifact is a commit to public/artifacts/, so it 404s (or shows the old
 * version) until the next Pages build lands, about a minute and a half later. The admin
 * keeps the file it just sent in IndexedDB so the preview can show it straight away.
 * IndexedDB rather than localStorage because artifacts run to megabytes and
 * localStorage tops out around 5MB of strings. Everything here is best effort: a
 * private window or a blocked store simply means no local copy.
 */

const DB = 'mc-artifact-drafts';
const STORE = 'files';

export interface ArtifactDraft {
    filename: string;
    blob: Blob;
    type: string;
    savedAt: number;
}

function open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'filename' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
    try {
        const db = await open();
        return await new Promise<T>((resolve, reject) => {
            const req = fn(db.transaction(STORE, mode).objectStore(STORE));
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    } catch {
        return null;
    }
}

export function saveDraft(filename: string, file: Blob): Promise<unknown> {
    const draft: ArtifactDraft = { filename, blob: file, type: file.type || 'application/octet-stream', savedAt: Date.now() };
    return run('readwrite', (s) => s.put(draft));
}

export function getDraft(filename: string): Promise<ArtifactDraft | null> {
    return run<ArtifactDraft | undefined>('readonly', (s) => s.get(filename)).then((d) => d ?? null);
}

export function deleteDraft(filename: string): Promise<unknown> {
    return run('readwrite', (s) => s.delete(filename));
}
