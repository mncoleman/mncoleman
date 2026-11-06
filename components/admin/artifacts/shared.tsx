'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Code, ExternalLink, File, FileText, FileType, Image as ImageIcon, UploadCloud } from 'lucide-react';
import { authHeaders } from '@/lib/admin-auth';
import { deleteDraft, getDraft } from '@/lib/artifact-drafts';
import { cn } from '@/lib/utils';
import { isDynamic, type ArtifactRow, type Visibility } from './artifact-logic';

/** Pieces shared by the artifact list, the detail page and the upload page. */

export const ARTIFACTS_API = process.env.NEXT_PUBLIC_ARTIFACTS_API_URL || 'https://artifacts.mncoleman.com';
// Public repo the Worker commits static artifacts to; read for previews before a build lands.
const GITHUB_REPO = 'mncoleman/mncoleman';

export interface ArtifactEntry extends ArtifactRow {
    downloadUrl?: string;
    hasPassword?: boolean;
    /** Plaintext password: only present on admin-fetched instant artifacts, and only for the owner. */
    password?: string | null;
}

export type { Visibility };

export function suggestSlug(name: string): string {
    return name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export function isValidSlug(slug: string): boolean {
    return /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(slug);
}

function mime(type: string) {
    return (type || '').split(';')[0].trim().toLowerCase();
}

export function kindOf(type: string): 'html' | 'pdf' | 'image' | 'other' {
    const t = mime(type);
    if (t === 'text/html') return 'html';
    if (t === 'application/pdf') return 'pdf';
    if (t.startsWith('image/')) return 'image';
    return 'other';
}

export function FileGlyph({ type, size, className }: { type: string; size?: number; className?: string }) {
    const k = kindOf(type);
    if (k === 'image') return <ImageIcon size={size} className={className} />;
    if (k === 'html') return <Code size={size} className={className} />;
    if (k === 'pdf') return <FileType size={size} className={className} />;
    if (mime(type).startsWith('text/')) return <FileText size={size} className={className} />;
    return <File size={size} className={className} />;
}

export function typeLabel(a: { type: string; filename?: string }) {
    const ext = a.filename?.split('.').pop();
    const k = kindOf(a.type);
    if (k === 'html') return 'HTML';
    if (k === 'pdf') return 'PDF';
    return (ext || mime(a.type).split('/')[1] || 'File').toUpperCase().slice(0, 5);
}

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Where the artifact itself is served. */
export function viewUrl(a: ArtifactEntry): string {
    if (isDynamic(a)) return a.url || `${ARTIFACTS_API}/a/${encodeURIComponent(a.slug || '')}`;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://mncoleman.com';
    return `${origin}/artifacts/${a.filename}`;
}

/** The public details (share) page, as /artifacts links it. */
export function detailsUrl(a: ArtifactEntry, slugOf: (a: ArtifactEntry) => string): string {
    return isDynamic(a) ? `${viewUrl(a).replace(/\/$/, '')}/details` : `/artifacts/${slugOf(a)}/details/`;
}

export async function fileToBase64(f: globalThis.File): Promise<string> {
    const bytes = new Uint8Array(await f.arrayBuffer());
    let out = '';
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(out);
}

export async function errorText(res: Response, fallback: string) {
    const text = await res.text().catch(() => '');
    try {
        const json = JSON.parse(text);
        return json.message || json.error || fallback;
    } catch {
        return text || fallback;
    }
}

/**
 * Every artifact this person may see: instant ones from the artifact service (through the Worker, so private
 * ones are included) and, for people with the Artifacts feature, the static manifest. Newest first.
 * The list and the detail page share it; there is no single-artifact endpoint.
 */
export function useArtifacts(api: string, fullAccess: boolean) {
    const [artifacts, setArtifacts] = useState<ArtifactEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [staticRes, dynamicRes] = await Promise.all([
                fullAccess
                    ? fetch(`${api}/api/artifacts`, { headers: authHeaders(), credentials: 'include' }).then((r) => (r.ok ? r.json() : { artifacts: [] }))
                    : Promise.resolve({ artifacts: [] }),
                fetch(`${api}/api/artifacts/instant/list`, { headers: authHeaders(), credentials: 'include' }).then((r) => {
                    if (!r.ok) throw new Error(`Could not load instant artifacts (${r.status})`);
                    return r.json();
                }),
            ]);
            const merged: ArtifactEntry[] = [
                ...(dynamicRes.artifacts || []).map((a: ArtifactEntry) => ({ ...a, source: 'dynamic' as const })),
                ...(staticRes.artifacts || []).map((a: ArtifactEntry) => ({ ...a, source: 'static' as const })),
            ].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
            setArtifacts(merged);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Could not load artifacts');
        } finally {
            setLoading(false);
        }
    }, [api, fullAccess]);

    useEffect(() => { void load(); }, [load]);
    return { artifacts, setArtifacts, loading, error, reload: load };
}

/** The drop target used both to pick a new upload and to replace an existing file. */
export function DropZone({ file, onFile, compact, label }: { file: globalThis.File | null; onFile: (f: globalThis.File | null) => void; compact?: boolean; label: string }) {
    const [dragging, setDragging] = useState(false);
    const depth = useRef(0);
    const input = useRef<HTMLInputElement>(null);
    return (
        <div
            role="button"
            tabIndex={0}
            onClick={() => input.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
            onDragEnter={(e) => { e.preventDefault(); depth.current++; setDragging(true); }}
            onDragLeave={(e) => { e.preventDefault(); if (--depth.current === 0) setDragging(false); }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                depth.current = 0;
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) onFile(f);
            }}
            className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                compact ? 'p-4' : 'p-10',
                dragging ? 'border-foreground/50 bg-foreground/[0.04]' : file ? 'border-foreground/30' : 'border-border/60 hover:border-foreground/30 hover:bg-muted/30',
            )}
        >
            <input ref={input} type="file" aria-label="Choose a file" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
            {file
                ? <FileGlyph type={file.type} className={cn(compact ? 'h-5 w-5' : 'h-8 w-8', 'text-muted-foreground')} />
                : <UploadCloud className={cn(compact ? 'h-5 w-5' : 'h-8 w-8', 'text-muted-foreground')} />}
            {file ? (
                <>
                    <span className="text-sm font-medium">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{formatFileSize(file.size)}</span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); onFile(null); if (input.current) input.current.value = ''; }} className="text-xs text-muted-foreground hover:text-red-600">
                        Remove
                    </button>
                </>
            ) : (
                <>
                    <span className="text-sm font-medium">{dragging ? 'Drop it here' : label}</span>
                    {!compact && <span className="text-xs text-muted-foreground">HTML, PDF, images, or any other file</span>}
                </>
            )}
        </div>
    );
}

/** Renders a file: the live artifact, a local file before upload, or a download card for anything a browser cannot show. */
export function FileFrame({ src, type, title, sameOrigin }: { src: string; type: string; title: string; sameOrigin?: boolean }) {
    const k = kindOf(type);
    if (k === 'image') {
        return (
            <div className="flex h-full items-center justify-center overflow-auto bg-[repeating-conic-gradient(hsl(var(--muted))_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-6" data-lenis-prevent>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={title} className="max-h-full max-w-full rounded shadow-lg" />
            </div>
        );
    }
    if (k === 'html' || k === 'pdf') {
        return (
            <iframe
                src={src}
                title={title}
                className="h-full w-full border-0 bg-white"
                // Same-origin static HTML gets an opaque origin, or it could read the admin's session token.
                sandbox={k === 'html' ? (sameOrigin ? 'allow-scripts allow-popups allow-forms' : 'allow-scripts allow-same-origin allow-popups allow-forms') : undefined}
            />
        );
    }
    return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
            <File className="h-8 w-8" />
            No preview for this file type.
            <a href={src} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-foreground underline underline-offset-4"><ExternalLink size={12} /> Open the file</a>
        </div>
    );
}

export function BrowserBar({ url, badge, href, onOpen }: { url: string; badge?: string; href?: string; onOpen?: () => void }) {
    return (
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border/60 bg-muted/35 px-3 text-xs">
            <span className="hidden gap-1.5 sm:flex" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
            </span>
            <span className="min-w-0 flex-1 truncate rounded bg-muted/60 px-2 py-0.5 text-muted-foreground">{url.replace(/^https?:\/\//, '')}</span>
            {badge && <span className="shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">{badge}</span>}
            {/* href differs from the shown url for local copies: the shown text is the file
                name or live address, but only the blob URL actually opens before the upload or build. */}
            <a href={href ?? url} target="_blank" rel="noopener noreferrer" onClick={onOpen ? (e) => { e.preventDefault(); onOpen(); } : undefined} className="shrink-0 text-muted-foreground hover:text-foreground" title="Open in a new tab" aria-label="Open in a new tab"><ExternalLink size={12} /></a>
        </div>
    );
}

/**
 * A static artifact is a commit, so until the next Pages build lands its address 404s
 * (new) or still serves the old file (replaced). This finds something to preview in the
 * meantime: the copy this browser just uploaded (lib/artifact-drafts.ts), as long as it
 * is newer than the live build; otherwise, when the live address 404s, the committed file
 * straight from GitHub, which has it the moment the commit lands.
 */
export function useNotYetLive(a: ArtifactEntry, enabled: boolean, refresh: number) {
    const [local, setLocal] = useState<{ url: string; from: 'this browser' | 'GitHub' } | null>(null);
    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        let made: string | null = null;
        const use = (blob: Blob, from: 'this browser' | 'GitHub') => {
            if (cancelled) return;
            made = URL.createObjectURL(blob);
            setLocal({ url: made, from });
        };
        (async () => {
            const draft = await getDraft(a.filename);
            if (draft) {
                const built = await fetch('/data/site-content.json', { cache: 'no-store' })
                    .then((r) => (r.ok ? r.json() : null))
                    .then((j) => (j ? Date.parse(j.generatedAt) || 0 : 0))
                    .catch(() => 0);
                if (draft.savedAt > built) return use(draft.blob, 'this browser');
                void deleteDraft(a.filename); // the build has it now
            }
            const live = await fetch(viewUrl(a), { method: 'HEAD', cache: 'no-store' }).catch(() => null);
            if (!live || live.ok) return;
            const raw = await fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/public/artifacts/${encodeURIComponent(a.filename)}`, { cache: 'no-store' }).catch(() => null);
            if (!raw?.ok) return;
            // raw.githubusercontent serves text/plain; re-type it so HTML renders.
            use(new Blob([await raw.arrayBuffer()], { type: a.type || 'application/octet-stream' }), 'GitHub');
        })();
        return () => {
            cancelled = true;
            if (made) URL.revokeObjectURL(made);
            setLocal(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [a, enabled, refresh]);
    return local;
}

const SEED_KEY = 'mnc-artifact-seed';

/** The artifact the server just returned from an upload, so its detail page can open before the list shows it (a static one is a commit and the list lags). */
export function saveSeed(a: ArtifactEntry) {
    try { sessionStorage.setItem(SEED_KEY, JSON.stringify(a)); } catch { /* the page just waits for the list */ }
}

export function readSeed(slug?: string, file?: string): ArtifactEntry | null {
    try {
        const a = JSON.parse(sessionStorage.getItem(SEED_KEY) || 'null') as ArtifactEntry | null;
        if (!a) return null;
        return (slug ? a.source === 'dynamic' && a.slug === slug : a.source !== 'dynamic' && a.filename === file) ? a : null;
    } catch {
        return null;
    }
}
