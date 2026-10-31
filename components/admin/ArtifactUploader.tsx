'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
    AlertTriangle, Check, ChevronDown, Circle, Code, Copy, ExternalLink, Eye, EyeOff, File, FileText, FileType,
    Globe, Image as ImageIcon, Loader2, Lock, MousePointerClick, RefreshCw, Search, Trash2, UploadCloud, X, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { PasteInput } from '@/components/admin/PasteField';
import { canUse, canManageSecrets, type AdminUser } from '@/components/admin/admin-context';
import { useDeploy } from '@/components/admin/deploy-status';
import { authHeaders } from '@/lib/admin-auth';
import { artifactSlug, cn } from '@/lib/utils';

/**
 * Artifacts in the admin's list + side-pane pattern (see CollectionManager).
 *
 * Two kinds live side by side: instant artifacts on the artifact service (live
 * the moment they save) and static ones committed to the repo (live after a
 * Pages build). Unlike projects and resources nothing is staged — every save
 * and upload goes straight through the Worker, as it always has.
 *
 * Access: editors without the Artifacts feature see only their granted instant
 * artifacts, with no upload, delete or static manifest. Only site admins and
 * the owner change visibility or passwords. The service enforces all of it.
 */

const ARTIFACTS_API = process.env.NEXT_PUBLIC_ARTIFACTS_API_URL || 'https://artifacts.mncoleman.com';

type Visibility = 'public' | 'private';
type Destination = 'instant' | 'github';

interface ArtifactEntry {
    id: string;
    name: string;
    filename: string;
    description: string;
    type: string;
    size: number;
    uploadedAt: string;
    slug?: string;
    url?: string;
    downloadUrl?: string;
    source?: 'static' | 'dynamic';
    visibility?: Visibility;
    hasPassword?: boolean;
    /** Plaintext password — only present on admin-fetched dynamic artifacts. */
    password?: string | null;
}

const NEW = '__new__';

function suggestSlug(name: string): string {
    return name.replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function isValidSlug(slug: string): boolean {
    return /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(slug);
}

function mime(type: string) {
    return (type || '').split(';')[0].trim().toLowerCase();
}

function kindOf(type: string): 'html' | 'pdf' | 'image' | 'other' {
    const t = mime(type);
    if (t === 'text/html') return 'html';
    if (t === 'application/pdf') return 'pdf';
    if (t.startsWith('image/')) return 'image';
    return 'other';
}

function FileGlyph({ type, size, className }: { type: string; size?: number; className?: string }) {
    const k = kindOf(type);
    if (k === 'image') return <ImageIcon size={size} className={className} />;
    if (k === 'html') return <Code size={size} className={className} />;
    if (k === 'pdf') return <FileType size={size} className={className} />;
    if (mime(type).startsWith('text/')) return <FileText size={size} className={className} />;
    return <File size={size} className={className} />;
}

function typeLabel(a: { type: string; filename?: string }) {
    const ext = a.filename?.split('.').pop();
    const k = kindOf(a.type);
    if (k === 'html') return 'HTML';
    if (k === 'pdf') return 'PDF';
    return (ext || mime(a.type).split('/')[1] || 'File').toUpperCase().slice(0, 5);
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const isDynamic = (a: ArtifactEntry) => a.source === 'dynamic';

/** Where the artifact itself is served. */
function viewUrl(a: ArtifactEntry): string {
    if (isDynamic(a)) return a.url || `${ARTIFACTS_API}/a/${encodeURIComponent(a.slug || '')}`;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://mncoleman.com';
    return `${origin}/artifacts/${a.filename}`;
}

/** The public details (share) page, as /artifacts links it. */
function detailsUrl(a: ArtifactEntry): string {
    return isDynamic(a) ? `${viewUrl(a).replace(/\/$/, '')}/details` : `/artifacts/${artifactSlug(a)}/details/`;
}

async function fileToBase64(f: globalThis.File): Promise<string> {
    const bytes = new Uint8Array(await f.arrayBuffer());
    let out = '';
    for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(out);
}

async function errorText(res: Response, fallback: string) {
    const text = await res.text().catch(() => '');
    try {
        const json = JSON.parse(text);
        return json.message || json.error || fallback;
    } catch {
        return text || fallback;
    }
}

function useCopy() {
    const [copied, setCopied] = useState<string | null>(null);
    const copy = async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied((k) => (k === key ? null : k)), 1500);
        } catch {
            window.prompt('Copy:', text);
        }
    };
    return { copied, copy };
}

export function ArtifactUploader({ workerUrl, user }: { workerUrl: string; user: AdminUser }) {
    const fullAccess = canUse(user, 'artifacts');
    const secrets = canManageSecrets(user);
    const api = workerUrl.replace(/\/$/, '');
    const { start } = useDeploy();

    const [artifacts, setArtifacts] = useState<ArtifactEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [source, setSource] = useState<'all' | 'dynamic' | 'static'>('all');
    const [visibility, setVisibility] = useState<'all' | Visibility>('all');
    const searchRef = useRef<HTMLInputElement>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const [staticRes, dynamicRes] = await Promise.all([
                fullAccess
                    ? fetch(`${api}/api/artifacts`, { headers: authHeaders(), credentials: 'include' }).then((r) => (r.ok ? r.json() : { artifacts: [] }))
                    : Promise.resolve({ artifacts: [] }),
                // Admin list — includes private artifacts (proxied through the Worker for auth).
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
            setLoadError(e instanceof Error ? e.message : 'Could not load artifacts');
        } finally {
            setLoading(false);
        }
    }, [api, fullAccess]);

    useEffect(() => { load(); }, [load]);

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return artifacts.filter((a) => {
            if (source !== 'all' && (a.source || 'static') !== source) return false;
            if (visibility !== 'all' && (a.visibility || 'public') !== visibility) return false;
            if (!q) return true;
            return [a.name, a.slug || '', a.filename, a.description || ''].join('\n').toLowerCase().includes(q);
        });
    }, [artifacts, query, source, visibility]);

    const selected = selectedId && selectedId !== NEW ? artifacts.find((a) => a.id === selectedId) || null : null;
    const paneOpen = selectedId === NEW || !!selected;

    // Keyboard: / search, N upload, ↑/↓ or J/K through the list, Esc closes the pane.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
            if (document.querySelector('[role="dialog"]')) return;
            const t = e.target as HTMLElement | null;
            const typing = !!t && typeof t.closest === 'function' && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
            if (e.key === 'Escape') {
                if (typing) t?.blur();
                else if (selectedId) setSelectedId(null);
                return;
            }
            if (typing) return;
            if (e.key === '/') { e.preventDefault(); searchRef.current?.focus(); }
            else if (e.key.toLowerCase() === 'n' && fullAccess) { e.preventDefault(); setSelectedId(NEW); }
            else if (['ArrowDown', 'ArrowUp', 'j', 'k'].includes(e.key) && visible.length) {
                e.preventDefault();
                const idx = visible.findIndex((a) => a.id === selectedId);
                const step = e.key === 'ArrowDown' || e.key === 'j' ? 1 : -1;
                setSelectedId(visible[idx === -1 ? 0 : Math.max(0, Math.min(visible.length - 1, idx + step))].id);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [visible, selectedId, fullAccess]);

    const onUploaded = (a: ArtifactEntry) => {
        setArtifacts((prev) => [a, ...prev.filter((x) => x.id !== a.id)]);
        setSelectedId(a.id);
        if (!isDynamic(a)) start('static');
    };
    const onUpdated = (a: ArtifactEntry) => {
        setArtifacts((prev) => prev.map((x) => (x.id === a.id ? a : x)));
        if (!isDynamic(a)) start('static');
    };
    const onDeleted = (a: ArtifactEntry) => {
        setArtifacts((prev) => prev.filter((x) => x.id !== a.id));
        setSelectedId(null);
        if (!isDynamic(a)) start('static');
    };

    if (loading && artifacts.length === 0) {
        return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
    }

    const narrow = paneOpen;

    return (
        <div className="flex h-full">
            <div className={cn('flex h-full min-w-0 flex-col border-r border-border/60 transition-[width] duration-200', narrow ? 'hidden w-[360px] shrink-0 md:flex xl:w-[400px]' : 'w-full')}>
                <div className="flex items-center gap-2 border-b border-border/60 px-4 py-3 md:px-6">
                    {!narrow && <h1 className="mr-2 hidden text-lg font-semibold tracking-tight sm:block">Artifacts</h1>}
                    <div className="relative min-w-0 flex-1">
                        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                            ref={searchRef}
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Search artifacts…"
                            aria-label="Search artifacts"
                            className="h-8 w-full rounded-md border border-border/60 bg-transparent pl-8 pr-8 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/40"
                        />
                        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border/60 px-1 font-mono text-[10px] text-muted-foreground sm:block">/</kbd>
                    </div>
                    {fullAccess && <Segmented value={source} onChange={setSource} options={[['all', 'All'], ['dynamic', 'Instant'], ['static', 'Static']]} />}
                    {!narrow && (
                        <Popover>
                            <PopoverTrigger asChild>
                                <button type="button" className={cn('hidden h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs md:flex', visibility !== 'all' ? 'border-foreground/40 text-foreground' : 'border-border/60 text-muted-foreground hover:text-foreground')}>
                                    {visibility === 'all' ? 'Visibility' : visibility === 'public' ? 'Public' : 'Private'}
                                    {visibility !== 'all'
                                        ? <X size={12} onClick={(e) => { e.stopPropagation(); setVisibility('all'); }} />
                                        : <ChevronDown size={12} />}
                                </button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-44 p-1">
                                {(['public', 'private'] as const).map((v) => (
                                    <button key={v} type="button" onClick={() => setVisibility(v)} className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm capitalize hover:bg-muted">
                                        {v} {visibility === v && <Check size={13} />}
                                    </button>
                                ))}
                            </PopoverContent>
                        </Popover>
                    )}
                    {fullAccess && (
                        <Button
                            size="sm"
                            onClick={() => setSelectedId(NEW)}
                            className={cn('h-8 shrink-0 gap-1.5', narrow && 'w-8 px-0')}
                            title="Upload (N)"
                            aria-label="Upload artifact"
                        >
                            <UploadCloud size={14} /> {!narrow && <span className="hidden sm:inline">Upload</span>}
                        </Button>
                    )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto" data-lenis-prevent>
                    {loadError && (
                        <div className="flex items-center justify-between gap-3 border-b border-red-500/20 bg-red-500/5 px-4 py-2 text-xs text-red-700 dark:text-red-300 md:px-6">
                            {loadError}
                            <button type="button" onClick={load} className="inline-flex items-center gap-1 underline underline-offset-4"><RefreshCw size={11} /> Retry</button>
                        </div>
                    )}
                    {visible.length === 0 ? (
                        <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
                            {artifacts.length === 0 ? (fullAccess ? 'No artifacts yet.' : 'No artifacts have been shared with you yet.') : 'Nothing matches.'}
                            {artifacts.length > 0 && (
                                <button type="button" className="text-foreground underline underline-offset-4" onClick={() => { setQuery(''); setSource('all'); setVisibility('all'); }}>Clear filters</button>
                            )}
                        </div>
                    ) : (
                        <table className="w-full table-fixed text-sm">
                            {!narrow && (
                                <thead className="sticky top-0 z-10 bg-background text-left text-xs text-muted-foreground">
                                    <tr className="border-b border-border/60">
                                        <th className="px-4 py-2 font-medium md:px-6">Name</th>
                                        <th className="hidden w-20 px-3 py-2 font-medium md:table-cell">Type</th>
                                        <th className="hidden w-20 px-3 py-2 text-right font-medium lg:table-cell">Size</th>
                                        <th className="hidden w-28 px-3 py-2 font-medium xl:table-cell">Updated</th>
                                        <th className="w-28 px-4 py-2 text-right font-medium md:px-6">Status</th>
                                    </tr>
                                </thead>
                            )}
                            <tbody>
                                {visible.map((a) => {
                                    const active = a.id === selectedId;
                                    return (
                                        <tr
                                            key={a.id}
                                            onClick={() => setSelectedId(a.id)}
                                            className={cn('cursor-pointer border-b border-border/40 transition-colors', active ? 'bg-foreground/[0.06]' : 'hover:bg-muted/40')}
                                        >
                                            <td className="px-4 py-2.5 md:px-6">
                                                <div className="flex items-center gap-2">
                                                    <FileGlyph type={a.type} size={14} className="shrink-0 text-muted-foreground" />
                                                    <span className={cn('truncate', active && 'font-medium')}>{a.name}</span>
                                                </div>
                                                <div className="mt-0.5 truncate pl-[22px] text-xs text-muted-foreground">
                                                    {a.description || (isDynamic(a) ? `/a/${a.slug}` : a.filename)}
                                                </div>
                                            </td>
                                            {!narrow && <td className="hidden px-3 py-2.5 text-xs text-muted-foreground md:table-cell">{typeLabel(a)}</td>}
                                            {!narrow && <td className="hidden px-3 py-2.5 text-right text-xs tabular-nums text-muted-foreground lg:table-cell">{formatFileSize(a.size)}</td>}
                                            {!narrow && <td className="hidden px-3 py-2.5 text-xs tabular-nums text-muted-foreground xl:table-cell">{a.uploadedAt?.slice(0, 10)}</td>}
                                            <td className="w-28 px-4 py-2.5 text-right md:px-6"><ArtifactStatus a={a} /></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
                <div className="hidden border-t border-border/60 px-4 py-1.5 text-[11px] text-muted-foreground md:block md:px-6">
                    {visible.length} of {artifacts.length} · <kbd className="font-mono">↑↓</kbd> move{fullAccess && <> · <kbd className="font-mono">N</kbd> upload</>} · <kbd className="font-mono">Esc</kbd> close
                </div>
            </div>

            {selectedId === NEW && fullAccess && (
                <div className="h-full min-w-0 flex-1">
                    <UploadPane api={api} taken={artifacts.map((a) => a.slug).filter(Boolean) as string[]} onClose={() => setSelectedId(null)} onUploaded={onUploaded} />
                </div>
            )}
            {selected && (
                <div className="h-full min-w-0 flex-1">
                    <ArtifactEditor
                        key={selected.id}
                        api={api}
                        artifact={selected}
                        fullAccess={fullAccess}
                        secrets={secrets}
                        onClose={() => setSelectedId(null)}
                        onUpdated={onUpdated}
                        onDeleted={onDeleted}
                    />
                </div>
            )}
        </div>
    );
}

/* ------------------------------- pieces --------------------------------- */

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
    return (
        <div className="flex h-8 shrink-0 items-center rounded-md border border-border/60 p-0.5">
            {options.map(([v, label]) => (
                <button
                    key={v}
                    type="button"
                    onClick={() => onChange(v)}
                    aria-pressed={value === v}
                    className={cn('h-full rounded px-2 text-xs transition-colors', value === v ? 'bg-foreground/[0.08] font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

function ArtifactStatus({ a }: { a: ArtifactEntry }) {
    if (a.visibility === 'private') {
        return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-amber-600 dark:text-amber-400"><Lock size={11} /> Private</span>;
    }
    return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs text-emerald-600 dark:text-emerald-400">
            {isDynamic(a) ? <Zap size={11} /> : <Circle size={7} className="fill-current" />}
            {isDynamic(a) ? 'Instant' : 'Static'}
        </span>
    );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">{label}</div>
            {children}
            {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
        </div>
    );
}

function Choice({ active, onClick, icon: Icon, title, sub }: { active: boolean; onClick: () => void; icon: typeof Lock; title: string; sub: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn('flex w-full items-start gap-2.5 rounded-md border px-3 py-2 text-left transition-colors', active ? 'border-foreground/40 bg-foreground/[0.04]' : 'border-border/60 hover:bg-muted/40')}
        >
            <Icon size={14} className={cn('mt-0.5 shrink-0', active ? 'text-foreground' : 'text-muted-foreground')} />
            <span>
                <span className="block text-sm">{title}</span>
                <span className="block text-[11px] text-muted-foreground">{sub}</span>
            </span>
        </button>
    );
}

/** The drop target used both to pick a new upload and to replace an existing file. */
function DropZone({ file, onFile, compact, label }: { file: globalThis.File | null; onFile: (f: globalThis.File | null) => void; compact?: boolean; label: string }) {
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
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed text-center transition-colors',
                compact ? 'p-4' : 'p-10',
                dragging ? 'border-foreground/50 bg-foreground/[0.04]' : file ? 'border-foreground/30' : 'border-border/60 hover:border-foreground/30 hover:bg-muted/30'
            )}
        >
            <input ref={input} type="file" className="hidden" onChange={(e) => onFile(e.target.files?.[0] || null)} />
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
function FileFrame({ src, type, title, sameOrigin }: { src: string; type: string; title: string; sameOrigin?: boolean }) {
    const k = kindOf(type);
    if (k === 'image') {
        return (
            <div className="flex h-full items-center justify-center overflow-auto bg-[repeating-conic-gradient(hsl(var(--muted))_0_25%,transparent_0_50%)] bg-[length:16px_16px] p-6">
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

function BrowserBar({ url, badge }: { url: string; badge?: string }) {
    return (
        <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border/60 bg-background px-3 text-xs">
            <span className="hidden gap-1.5 sm:flex" aria-hidden="true">
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/25" />
            </span>
            <span className="min-w-0 flex-1 truncate rounded bg-muted/60 px-2 py-0.5 text-muted-foreground">{url.replace(/^https?:\/\//, '')}</span>
            {badge && <span className="shrink-0 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-700 dark:text-amber-300">{badge}</span>}
            <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-muted-foreground hover:text-foreground" title="Open in a new tab" aria-label="Open in a new tab"><ExternalLink size={12} /></a>
        </div>
    );
}

/* ------------------------------- upload --------------------------------- */

function UploadPane({ api, taken, onClose, onUploaded }: { api: string; taken: string[]; onClose: () => void; onUploaded: (a: ArtifactEntry) => void }) {
    const [file, setFile] = useState<globalThis.File | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [destination, setDestination] = useState<Destination>('instant');
    const [visibility, setVisibility] = useState<Visibility>('public');
    const [password, setPassword] = useState('');
    const [slug, setSlug] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const localUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
    useEffect(() => () => { if (localUrl) URL.revokeObjectURL(localUrl); }, [localUrl]);

    const pick = (f: globalThis.File | null) => {
        setFile(f);
        setError(null);
        if (f && !name) setName(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
        if (f && !slug) setSlug(suggestSlug(f.name));
    };

    const slugProblem = destination === 'instant' && slug
        ? !isValidSlug(slug) ? '3-60 characters of a-z, 0-9 and -, starting and ending with a letter or digit.'
        : taken.includes(slug) ? 'Already used by another artifact.' : null
        : null;
    const passwordProblem = destination === 'instant' && visibility === 'private' && password.length < 4 ? 'Private artifacts need a password of at least 4 characters.' : null;

    const upload = async () => {
        if (!file || slugProblem || passwordProblem) return;
        setBusy(true);
        setError(null);
        try {
            let res: Response;
            if (destination === 'instant') {
                // Streamed as multipart so the Worker can pipe it to the service without buffering it.
                const fd = new FormData();
                fd.append('file', file);
                if (name) fd.append('name', name);
                if (description) fd.append('description', description);
                if (slug) fd.append('slug', slug);
                fd.append('visibility', visibility);
                if (visibility === 'private') fd.append('password', password);
                res = await fetch(`${api}/api/artifacts`, { method: 'POST', headers: authHeaders(), credentials: 'include', body: fd });
            } else {
                res = await fetch(`${api}/api/artifacts`, {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    credentials: 'include',
                    body: JSON.stringify({
                        filename: file.name,
                        name: name || undefined,
                        content: await fileToBase64(file),
                        type: file.type || 'application/octet-stream',
                        size: file.size,
                        description,
                        destination: 'github',
                    }),
                });
            }
            if (!res.ok) throw new Error(await errorText(res, 'Upload failed'));
            const data = await res.json();
            onUploaded({ ...data.artifact, source: destination === 'instant' ? 'dynamic' : 'static' });
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Upload failed');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="flex h-full flex-col">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-3 md:px-4">
                <span className="flex-1 truncate text-xs text-muted-foreground">New artifact</span>
                <Button size="sm" onClick={upload} disabled={!file || busy || !!slugProblem || !!passwordProblem} className="h-7 gap-1.5 text-xs">
                    {busy ? <Loader2 size={12} className="animate-spin" /> : destination === 'instant' ? <Zap size={12} /> : <UploadCloud size={12} />}
                    {destination === 'instant' ? 'Publish instantly' : 'Upload to static'}
                </Button>
                <button type="button" onClick={onClose} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Close (Esc)" aria-label="Close">
                    <X size={14} />
                </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden" data-lenis-prevent>
                <div className="flex min-w-0 flex-col md:flex-1 md:overflow-y-auto" data-lenis-prevent>
                    <div className="mx-auto w-full max-w-3xl space-y-5 px-5 py-8 md:px-8">
                        {error && <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
                        <DropZone file={file} onFile={pick} label="Drop a file here or click to browse" />
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Name (defaults to the file name)"
                            aria-label="Name"
                            className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/40"
                        />
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="A line about what this is, for the list and the share card…"
                            aria-label="Description"
                            rows={1}
                            className="w-full resize-none bg-transparent text-base text-muted-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground/40"
                        />
                    </div>
                    {file && localUrl && (
                        <div className="mx-5 mb-8 flex h-[60vh] min-h-[320px] flex-col overflow-hidden rounded-lg border border-border/60 md:mx-8">
                            <BrowserBar url={file.name} badge="Not uploaded yet" />
                            <div className="min-h-0 flex-1">
                                {/* A blob: URL inherits this origin, so it gets the same opaque sandbox as static HTML. */}
                                <FileFrame src={localUrl} type={file.type} title="Upload preview" sameOrigin />
                            </div>
                        </div>
                    )}
                </div>
                <aside className="shrink-0 space-y-6 border-t border-border/60 bg-muted/10 p-4 md:w-72 md:overflow-y-auto md:border-l md:border-t-0" data-lenis-prevent>
                    <Field label="Where it lives">
                        <div className="space-y-2">
                            <Choice active={destination === 'instant'} onClick={() => setDestination('instant')} icon={Zap} title="Instant" sub="On the artifact server, live in seconds" />
                            <Choice active={destination === 'github'} onClick={() => setDestination('github')} icon={Globe} title="Static" sub="Committed to the site, live after a build (~1½ min)" />
                        </div>
                    </Field>
                    {destination === 'instant' && (
                        <>
                            <Field label="Address" hint={slugProblem ? <span className="text-red-600">{slugProblem}</span> : <>artifacts.mncoleman.com/a/<span className="font-mono">{slug || 'your-slug'}</span></>}>
                                <PasteInput
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                    placeholder="my-artifact"
                                    aria-label="Slug"
                                    maxLength={60}
                                    className="h-8 font-mono text-sm"
                                />
                            </Field>
                            <Field label="Visibility">
                                <div className="space-y-2">
                                    <Choice active={visibility === 'public'} onClick={() => setVisibility('public')} icon={Eye} title="Public" sub="Listed on /artifacts" />
                                    <Choice active={visibility === 'private'} onClick={() => setVisibility('private')} icon={Lock} title="Private" sub="Hidden, password-gated" />
                                </div>
                            </Field>
                            {visibility === 'private' && (
                                <Field label="Password" hint={passwordProblem}>
                                    <PasteInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 4 characters" aria-label="Password" autoComplete="new-password" className="h-8 text-sm" />
                                </Field>
                            )}
                        </>
                    )}
                </aside>
            </div>
        </div>
    );
}

/* ------------------------------- editor --------------------------------- */

function ArtifactEditor({
    api, artifact: a, fullAccess, secrets, onClose, onUpdated, onDeleted,
}: {
    api: string;
    artifact: ArtifactEntry;
    fullAccess: boolean;
    secrets: boolean;
    onClose: () => void;
    onUpdated: (a: ArtifactEntry) => void;
    onDeleted: (a: ArtifactEntry) => void;
}) {
    const dynamic = isDynamic(a);
    const [view, setView] = useState<'edit' | 'preview' | 'page'>('preview');
    const [name, setName] = useState(a.name);
    const [description, setDescription] = useState(a.description || '');
    const [file, setFile] = useState<globalThis.File | null>(null);
    const [vis, setVis] = useState<Visibility>(a.visibility || 'public');
    const [password, setPassword] = useState('');
    const [reveal, setReveal] = useState(false);
    const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [frameKey, setFrameKey] = useState(0);
    const { copied, copy } = useCopy();

    const dirty = name !== a.name || description !== (a.description || '') || !!file || vis !== (a.visibility || 'public') || !!password;
    const goingPrivate = dynamic && vis === 'private' && a.visibility !== 'private';
    const problem = dynamic && vis === 'private'
        ? password && password.length < 4 ? 'Passwords need at least 4 characters.'
        : goingPrivate && !password ? 'Set a password to make this private.' : null
        : null;
    const url = viewUrl(a);
    const html = kindOf(a.type) === 'html';
    // The service caches public artifacts for 5 minutes; a replaced file or a visibility
    // change must not show the browser's stale copy.
    const fresh = (u: string) => `${u}${u.includes('?') ? '&' : '?'}v=${encodeURIComponent(`${a.uploadedAt}-${frameKey}`)}`;

    const save = async () => {
        if (!dirty || problem) return;
        setBusy('save');
        setError(null);
        try {
            let res: Response;
            if (dynamic && a.slug) {
                const fd = new FormData();
                if (name !== a.name) fd.append('name', name);
                if (description !== (a.description || '')) fd.append('description', description);
                if (secrets && vis !== (a.visibility || 'public')) fd.append('visibility', vis);
                if (secrets && password) fd.append('password', password);
                if (secrets && vis === 'public' && a.visibility === 'private') fd.append('clearPassword', 'true');
                if (file) fd.append('file', file);
                res = await fetch(`${api}/api/artifacts/instant/${encodeURIComponent(a.slug)}`, { method: 'PATCH', headers: authHeaders(), credentials: 'include', body: fd });
            } else {
                const body: Record<string, unknown> = { filename: a.filename, name, description };
                if (file) {
                    body.content = await fileToBase64(file);
                    body.type = file.type || 'application/octet-stream';
                    body.size = file.size;
                }
                res = await fetch(`${api}/api/artifacts`, {
                    method: 'PATCH',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    credentials: 'include',
                    body: JSON.stringify(body),
                });
            }
            if (!res.ok) throw new Error(await errorText(res, 'Save failed'));
            const data = await res.json().catch(() => ({}));
            const returned = data && typeof data === 'object' ? (data.artifact ?? data) : {};
            const next: ArtifactEntry = {
                ...a,
                name,
                description,
                ...(dynamic && secrets ? { visibility: vis, hasPassword: vis === 'private', password: vis === 'private' ? (password || a.password) : null } : {}),
                ...(file ? { type: file.type || a.type, size: file.size, uploadedAt: new Date().toISOString() } : {}),
                ...(dynamic && returned && typeof returned === 'object' && 'slug' in returned ? returned : {}),
                source: a.source,
            };
            onUpdated(next);
            setFile(null);
            setPassword('');
            setFrameKey((k) => k + 1);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Save failed');
        } finally {
            setBusy(null);
        }
    };

    const remove = async () => {
        setBusy('delete');
        setError(null);
        try {
            const res = dynamic && a.slug
                ? await fetch(`${api}/api/artifacts/instant/${encodeURIComponent(a.slug)}`, { method: 'DELETE', headers: authHeaders(), credentials: 'include' })
                : await fetch(`${api}/api/artifacts?file=${encodeURIComponent(a.filename)}`, { method: 'DELETE', headers: authHeaders(), credentials: 'include' });
            if (!res.ok) throw new Error(await errorText(res, 'Delete failed'));
            onDeleted(a);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Delete failed');
            setBusy(null);
        }
    };

    const status = dirty
        ? <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Unsaved changes</span>
        : saved
            ? <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><Check size={12} /> {dynamic ? 'Saved · live now' : 'Saved · live after the build'}</span>
            : <span className="flex items-center gap-1.5">{dynamic ? <Zap size={12} /> : <Globe size={12} />} {dynamic ? 'Instant · changes go live on save' : 'Static · changes go live after a build'}</span>;

    return (
        <div className="flex h-full flex-col">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/60 px-3 md:px-4">
                <div className="flex min-w-0 flex-1 items-center gap-2 truncate text-xs text-muted-foreground">{status}</div>
                <Segmented value={view} onChange={setView} options={[['edit', 'Edit'], ['preview', 'Preview'], ['page', 'Share page']]} />
                {dirty && (
                    <Button size="sm" onClick={save} disabled={busy !== null || !!problem} className="h-7 gap-1.5 text-xs" title={problem || 'Save'}>
                        {busy === 'save' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save
                    </Button>
                )}
                <button type="button" onClick={onClose} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Close (Esc)" aria-label="Close editor">
                    <X size={14} />
                </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden" data-lenis-prevent>
                <div className="flex min-h-[70vh] min-w-0 flex-col md:min-h-0 md:flex-1">
                    {view === 'edit' && (
                        <div className="min-h-0 flex-1 md:overflow-y-auto" data-lenis-prevent>
                            <div className="mx-auto max-w-3xl space-y-5 px-5 py-8 md:px-8 md:py-10">
                                {error && <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}
                                <div>
                                    <input
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Name"
                                        aria-label="Name"
                                        className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/40 md:text-3xl"
                                    />
                                    <div className="mt-1 truncate text-xs text-muted-foreground">{dynamic ? `/a/${a.slug}` : a.filename}</div>
                                </div>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="A line about what this is, for the list and the share card…"
                                    aria-label="Description"
                                    rows={1}
                                    className="w-full resize-none bg-transparent text-base text-muted-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground/40"
                                />
                                <div className="border-t border-border/40 pt-5">
                                    <div className="mb-2 text-xs font-medium text-muted-foreground">Replace the file</div>
                                    <DropZone file={file} onFile={setFile} compact label="Drop a new version here or click to browse" />
                                    <p className="mt-2 text-[11px] text-muted-foreground">Keeps the same address{dynamic ? ' and share card' : ''}. {dynamic && html ? 'For a small text change, edit mode is quicker.' : ''}</p>
                                </div>
                                {dynamic && html && a.slug && (
                                    <Link href={`/admin/artifacts/edit?slug=${encodeURIComponent(a.slug)}`} className="flex items-center gap-3 rounded-lg border border-border/60 p-4 hover:bg-muted/40">
                                        <MousePointerClick size={18} className="shrink-0 text-muted-foreground" />
                                        <span>
                                            <span className="block text-sm font-medium">Open edit mode</span>
                                            <span className="block text-xs text-muted-foreground">Click text on the page to change it, leave notes, or link your Claude to work through them.</span>
                                        </span>
                                    </Link>
                                )}
                            </div>
                        </div>
                    )}
                    {view === 'preview' && (
                        <div className="flex min-h-0 flex-1 flex-col bg-muted/30">
                            <BrowserBar url={url} badge={a.visibility === 'private' ? 'Private · password-gated' : undefined} />
                            <div className="min-h-0 flex-1">
                                <FileFrame key={frameKey} src={fresh(url)} type={a.type} title={a.name} sameOrigin={!dynamic} />
                            </div>
                        </div>
                    )}
                    {view === 'page' && (
                        <div className="flex min-h-0 flex-1 flex-col bg-muted/30">
                            <BrowserBar url={dynamic ? detailsUrl(a) : `${typeof window !== 'undefined' ? window.location.origin : ''}${detailsUrl(a)}`} badge={dynamic ? undefined : 'As of the last build'} />
                            {/* The share page is this site's own page (static) or the service's own template
                                (instant), not uploaded content, so it runs unsandboxed with its fonts and scripts. */}
                            <iframe key={frameKey} src={fresh(detailsUrl(a))} title={`${a.name} share page`} className="min-h-0 w-full flex-1 border-0 bg-background" />
                        </div>
                    )}
                </div>

                <aside className="shrink-0 space-y-6 border-t border-border/60 bg-muted/10 p-4 md:w-72 md:overflow-y-auto md:border-l md:border-t-0" data-lenis-prevent>
                    {error && view !== 'edit' && <div className="rounded-md border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-300">{error}</div>}
                    <Field label="Link">
                        <div className="flex items-center gap-1 rounded-md border border-border/60 px-2 py-1.5">
                            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{url.replace(/^https?:\/\//, '')}</span>
                            <button type="button" onClick={() => copy(url, 'url')} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Copy link" aria-label="Copy link">
                                {copied === 'url' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                            </button>
                            <a href={url} target="_blank" rel="noopener noreferrer" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Open" aria-label="Open">
                                <ExternalLink size={12} />
                            </a>
                        </div>
                    </Field>

                    {dynamic && secrets && (
                        <Field label="Visibility">
                            <div className="space-y-2">
                                <Choice active={vis === 'public'} onClick={() => setVis('public')} icon={Eye} title="Public" sub="Listed on /artifacts" />
                                <Choice active={vis === 'private'} onClick={() => setVis('private')} icon={Lock} title="Private" sub="Hidden, password-gated" />
                            </div>
                        </Field>
                    )}
                    {dynamic && !secrets && a.visibility === 'private' && (
                        <Field label="Visibility" hint="Only a site admin can change visibility or the password.">
                            <div className="flex items-center gap-1.5 text-sm"><Lock size={13} /> Private</div>
                        </Field>
                    )}

                    {dynamic && secrets && vis === 'private' && (
                        <Field label="Password" hint={problem ? <span className="text-red-600">{problem}</span> : a.hasPassword ? 'Leave blank to keep the current one.' : undefined}>
                            {a.visibility === 'private' && a.hasPassword && (
                                <div className="mb-2 flex items-center gap-1 rounded-md border border-border/60 px-2 py-1.5">
                                    {a.password ? (
                                        <code className="min-w-0 flex-1 truncate font-mono text-xs">{reveal ? a.password : '•'.repeat(Math.min(a.password.length, 12))}</code>
                                    ) : (
                                        <span className="flex-1 text-xs italic text-muted-foreground">Not recoverable (set before passwords were stored)</span>
                                    )}
                                    {a.password && (
                                        <>
                                            <button type="button" onClick={() => setReveal((r) => !r)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title={reveal ? 'Hide' : 'Reveal'} aria-label={reveal ? 'Hide password' : 'Reveal password'}>
                                                {reveal ? <EyeOff size={12} /> : <Eye size={12} />}
                                            </button>
                                            <button type="button" onClick={() => copy(a.password!, 'pw')} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Copy password" aria-label="Copy password">
                                                {copied === 'pw' ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                            <PasteInput
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={a.hasPassword ? 'New password to rotate' : 'At least 4 characters'}
                                aria-label="New password"
                                autoComplete="new-password"
                                className="h-8 text-sm"
                            />
                        </Field>
                    )}

                    <Field label="File">
                        <dl className="space-y-1 text-xs">
                            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Name</dt><dd className="truncate">{a.filename}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Type</dt><dd>{typeLabel(a)}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Size</dt><dd className="tabular-nums">{formatFileSize(a.size)}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Updated</dt><dd className="tabular-nums">{a.uploadedAt?.slice(0, 10)}</dd></div>
                            <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Lives</dt><dd>{dynamic ? 'Artifact server' : 'Site repo'}</dd></div>
                        </dl>
                    </Field>

                    {dynamic && html && a.slug && (
                        <Button asChild variant="outline" size="sm" className="h-8 w-full gap-1.5 text-xs">
                            <Link href={`/admin/artifacts/edit?slug=${encodeURIComponent(a.slug)}`}><MousePointerClick size={13} /> Edit mode &amp; Link my Claude</Link>
                        </Button>
                    )}

                    {fullAccess && (
                        <div className="border-t border-border/60 pt-4">
                            {confirmDelete ? (
                                <div className="space-y-2">
                                    <p className="flex gap-1.5 text-[11px] text-muted-foreground">
                                        <AlertTriangle size={12} className="mt-0.5 shrink-0 text-red-600" />
                                        {dynamic
                                            ? 'Removes the file, share card and metadata now. Anyone with the link gets a 404. This cannot be undone.'
                                            : 'Commits the removal from the repo; it leaves the site after the next build.'}
                                    </p>
                                    <div className="flex gap-2">
                                        <Button size="sm" variant="destructive" onClick={remove} disabled={busy !== null} className="h-7 flex-1 gap-1 text-xs">
                                            {busy === 'delete' ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Delete
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)} className="h-7 text-xs">Keep</Button>
                                    </div>
                                </div>
                            ) : (
                                <button type="button" onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-600">
                                    <Trash2 size={12} /> Delete artifact
                                </button>
                            )}
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
