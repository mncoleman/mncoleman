'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { FileText, Filter, X, ExternalLink, Download, File, Image, Code, FileType, Palette, Zap, Lock, Copy, Check, Eye, EyeOff } from 'lucide-react';
import { PageEntrance } from '@/components/page-entrance';
import { ArtifactDesignPopup } from '@/components/artifact-design-popup';
import { formatDistanceToNow } from 'date-fns';
import { authHeaders } from '@/lib/admin-auth';
import { artifactSlug } from '@/lib/utils';
import { trackContentAction } from '@/lib/analytics';

interface Artifact {
    id: string;
    name: string;
    filename: string;
    description: string;
    type: string;
    size: number;
    uploadedAt: string;
    url?: string;
    downloadUrl?: string;
    source?: 'static' | 'dynamic';
    visibility?: 'public' | 'private';
    /** Plaintext password — only present in admin-mode listing for private artifacts. */
    password?: string | null;
}

const ARTIFACTS_API = process.env.NEXT_PUBLIC_ARTIFACTS_API_URL || 'https://artifacts.mncoleman.com';
const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:8787';

function normalizeType(type: string): string {
    return (type || '').split(';')[0].trim().toLowerCase();
}

function getFileTypeLabel(type: string): string {
    const t = normalizeType(type);
    const labels: Record<string, string> = {
        'text/html': 'HTML',
        'application/pdf': 'PDF',
        'image/png': 'PNG',
        'image/jpeg': 'JPEG',
        'image/gif': 'GIF',
        'image/svg+xml': 'SVG',
        'application/json': 'JSON',
        'text/plain': 'Text',
        'text/css': 'CSS',
        'text/javascript': 'JavaScript',
    };
    return labels[t] || t.split('/').pop()?.toUpperCase() || 'File';
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
    const t = normalizeType(type);
    if (t.startsWith('image/')) return Image;
    if (t === 'text/html') return Code;
    if (t === 'application/pdf') return FileType;
    if (t.startsWith('text/')) return FileText;
    return File;
}

function isViewableInBrowser(type: string): boolean {
    const t = normalizeType(type);
    return t === 'text/html' || t === 'application/pdf' || t.startsWith('image/');
}

interface ArtifactsPageClientProps {
    initialArtifacts: Artifact[];
}

export default function ArtifactsPageClient({ initialArtifacts }: ArtifactsPageClientProps) {
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [dynamicArtifacts, setDynamicArtifacts] = useState<Artifact[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(new Set());

    const togglePasswordReveal = (id: string) => {
        setRevealedPasswords(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const copyLink = async (artifact: Artifact, artifactUrl: string) => {
        const absoluteUrl = /^https?:\/\//.test(artifactUrl)
            ? artifactUrl
            : `${typeof window !== 'undefined' ? window.location.origin : ''}${artifactUrl}`;
        try {
            await navigator.clipboard.writeText(absoluteUrl);
            setCopiedId(artifact.id);
            trackContentAction('copy', 'artifact', artifact.name, { link_url: absoluteUrl });
            setTimeout(() => setCopiedId(prev => (prev === artifact.id ? null : prev)), 1500);
        } catch {
            // Older browsers without clipboard permissions — fall back to prompt.
            window.prompt('Copy link:', absoluteUrl);
        }
    };

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            // Determine admin status the same robust way the /admin page does:
            // /auth/me succeeds for EITHER a stored bearer token (sessionStorage)
            // OR the admin_token cookie. The old check only read sessionStorage,
            // which is tab-scoped — so opening /artifacts in a new tab (or after a
            // browser restart) silently fell back to the public, private-less list.
            let isAdminView = false;
            try {
                const meRes = await fetch(`${WORKER_URL.replace(/\/$/, '')}/auth/me`, {
                    credentials: 'include',
                    headers: authHeaders(),
                });
                isAdminView = meRes.ok;
            } catch {
                isAdminView = false;
            }
            if (cancelled) return;
            setIsAdmin(isAdminView);

            try {
                const res = isAdminView
                    ? await fetch(`${WORKER_URL.replace(/\/$/, '')}/api/artifacts/instant/list`, {
                          headers: authHeaders(),
                          credentials: 'include',
                      })
                    : await fetch(`${ARTIFACTS_API}/api/list`, { cache: 'no-store' });
                const data = res.ok ? await res.json() : { artifacts: [] };
                if (cancelled) return;
                const items: Artifact[] = (data?.artifacts || []).map((a: Artifact) => ({
                    ...a,
                    source: 'dynamic' as const,
                }));
                setDynamicArtifacts(items);
            } catch {
                // Network error — leave the (static) list as-is.
            }
        };

        load();
        return () => {
            cancelled = true;
        };
    }, []);

    const merged = useMemo(() => {
        const staticItems: Artifact[] = initialArtifacts.map(a => ({ ...a, source: 'static' as const }));
        // Dedup by filename — static artifacts use UUID ids, dynamic ones use slugs,
        // so id-based dedup never matched. Filename is the stable identity.
        const dynamicFilenames = new Set(dynamicArtifacts.map(a => a.filename));
        return [...dynamicArtifacts, ...staticItems.filter(a => !dynamicFilenames.has(a.filename))];
    }, [initialArtifacts, dynamicArtifacts]);

    const allTypes = useMemo(() => {
        const types = new Set<string>();
        merged.forEach(a => types.add(normalizeType(a.type)));
        return Array.from(types).sort();
    }, [merged]);

    const filteredArtifacts = useMemo(() => {
        let items = merged;
        if (selectedType) {
            items = items.filter(a => normalizeType(a.type) === selectedType);
        }
        return items.sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
    }, [merged, selectedType]);

    return (
        <PageEntrance>
            <div className="container mx-auto px-4 py-16 max-w-5xl">
                <header className="mb-12 text-center text-balance">
                    <h1 className="text-4xl md:text-5xl font-bold mb-6 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-primary/60 leading-tight">
                        Artifacts
                        <span className="block text-xl md:text-2xl font-medium text-muted-foreground mt-2">
                            Files, Documents & Uploads
                        </span>
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
                        A collection of uploaded files and documents available for viewing and download.
                    </p>
                    {isAdmin && (
                        <p className="text-xs italic text-muted-foreground/80 mb-4 flex items-center justify-center gap-1.5">
                            <Lock className="h-3 w-3" />
                            Admin view — private artifacts are visible to you.
                        </p>
                    )}
                    <ArtifactDesignPopup
                        trigger={
                            <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-border/50 bg-background/50 backdrop-blur-sm hover:border-[#016b72]/50 hover:bg-background/80 transition-all duration-300 group">
                                <Palette className="h-4 w-4 text-[#016b72] group-hover:scale-110 transition-transform" />
                                <span className="text-sm font-medium">Artifact Design System</span>
                            </button>
                        }
                    />
                </header>

                {/* Filter Bar */}
                {allTypes.length > 1 && (
                    <div className="mb-12 flex flex-wrap items-center justify-center gap-2">
                        <div className="flex items-center gap-2 mr-2 text-muted-foreground text-sm font-medium">
                            <Filter className="h-4 w-4" />
                            <span>Filter:</span>
                        </div>
                        <button
                            onClick={() => setSelectedType(null)}
                            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${selectedType === null
                                ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                                : 'bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground'
                            }`}
                        >
                            All
                        </button>
                        {allTypes.map(type => (
                            <button
                                key={type}
                                onClick={() => setSelectedType(type)}
                                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${selectedType === type
                                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20'
                                    : 'bg-accent/50 text-muted-foreground hover:bg-accent hover:text-foreground'
                                }`}
                            >
                                {getFileTypeLabel(type)}
                            </button>
                        ))}
                        {selectedType && (
                            <button
                                onClick={() => setSelectedType(null)}
                                className="p-1.5 rounded-full bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all ml-2"
                                title="Clear filter"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {filteredArtifacts.map((artifact) => {
                        const IconComponent = getFileIcon(artifact.type);
                        const viewable = isViewableInBrowser(artifact.type);
                        const artifactUrl = artifact.url || `/artifacts/${artifact.filename}`;
                        const downloadUrl = artifact.downloadUrl || artifactUrl;
                        const isDynamic = artifact.source === 'dynamic';
                        // Whole-card click → details page. Instant artifacts get a live,
                        // OG-correct details page on the artifact server; static ones get a
                        // pre-built page on this site. The action buttons below sit above this
                        // overlay (z-10) so they keep their own behaviour.
                        const detailsHref = isDynamic
                            ? `${(artifact.url || `${ARTIFACTS_API}/a/${artifact.id}`).replace(/\/$/, '')}/details`
                            : `/artifacts/${artifactSlug(artifact)}/details/`;

                        return (
                            <article
                                key={artifact.id}
                                className="group relative flex flex-col h-full p-6 rounded-2xl border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 hover:bg-background/80 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-primary/5 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both overflow-hidden cursor-pointer"
                            >
                                {isDynamic ? (
                                    <a
                                        href={detailsHref}
                                        aria-label={`View details for ${artifact.name}`}
                                        className="absolute inset-0 z-[1] rounded-2xl"
                                    />
                                ) : (
                                    <Link
                                        href={detailsHref}
                                        aria-label={`View details for ${artifact.name}`}
                                        className="absolute inset-0 z-[1] rounded-2xl"
                                    />
                                )}
                                <div className="flex justify-between items-start mb-4">
                                    <div className="p-2 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                                        <IconComponent className="h-5 w-5" />
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        {isDynamic && (
                                            <span
                                                title="Instant artifact"
                                                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-[#016b72]/40 bg-[#016b72]/10 text-[#016b72]"
                                            >
                                                <Zap className="h-2.5 w-2.5" />
                                                Live
                                            </span>
                                        )}
                                        {artifact.visibility === 'private' && (
                                            <span
                                                title="Password-protected artifact (admin-visible only)"
                                                className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-500"
                                            >
                                                <Lock className="h-2.5 w-2.5" />
                                                Private
                                            </span>
                                        )}
                                        <span className="text-[10px] px-2 py-0.5 rounded-full border bg-muted/50 border-border text-muted-foreground">
                                            {getFileTypeLabel(artifact.type)}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex-1">
                                    <h3 className="text-xl font-bold mb-2 group-hover:text-primary transition-colors duration-300">
                                        {artifact.name}
                                    </h3>
                                    {artifact.description && (
                                        <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                                            {artifact.description}
                                        </p>
                                    )}
                                </div>

                                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4">
                                    <span>{formatFileSize(artifact.size)}</span>
                                    <span>-</span>
                                    <span>{formatDistanceToNow(new Date(artifact.uploadedAt), { addSuffix: true })}</span>
                                </div>

                                {isAdmin && artifact.visibility === 'private' && (
                                    <div className="relative z-10 flex items-center gap-1.5 mb-4 text-xs">
                                        <Lock className="h-3 w-3 text-amber-500 shrink-0" />
                                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">PW:</span>
                                        {artifact.password ? (
                                            <>
                                                <code className="font-mono bg-muted/50 px-1.5 py-0.5 rounded border border-border/40 select-all break-all">
                                                    {revealedPasswords.has(artifact.id)
                                                        ? artifact.password
                                                        : '•'.repeat(Math.min(artifact.password.length, 12))}
                                                </code>
                                                <button
                                                    type="button"
                                                    onClick={() => togglePasswordReveal(artifact.id)}
                                                    aria-label={revealedPasswords.has(artifact.id) ? 'Hide password' : 'Reveal password'}
                                                    className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                                                >
                                                    {revealedPasswords.has(artifact.id)
                                                        ? <EyeOff className="h-3 w-3" />
                                                        : <Eye className="h-3 w-3" />}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={async () => {
                                                        try {
                                                            await navigator.clipboard.writeText(artifact.password!);
                                                            setCopiedId(`pw-${artifact.id}`);
                                                            setTimeout(() => setCopiedId(prev => (prev === `pw-${artifact.id}` ? null : prev)), 1500);
                                                        } catch {
                                                            window.prompt('Copy password:', artifact.password!);
                                                        }
                                                    }}
                                                    aria-label="Copy password"
                                                    className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                                                >
                                                    {copiedId === `pw-${artifact.id}`
                                                        ? <Check className="h-3 w-3 text-emerald-500" />
                                                        : <Copy className="h-3 w-3" />}
                                                </button>
                                            </>
                                        ) : (
                                            <span className="italic">not recoverable (legacy)</span>
                                        )}
                                    </div>
                                )}

                                <div className="relative z-10 flex gap-2 pt-4 mt-auto border-t border-border/30">
                                    {viewable && (
                                        <a
                                            href={artifactUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={() => trackContentAction('open', 'artifact', artifact.name, { link_url: artifactUrl })}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
                                        >
                                            <ExternalLink className="h-4 w-4" />
                                            View
                                        </a>
                                    )}
                                    <a
                                        href={downloadUrl}
                                        download={artifact.filename}
                                        onClick={() => trackContentAction('download', 'artifact', artifact.name, { file_name: artifact.filename })}
                                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${viewable
                                            ? 'bg-accent text-accent-foreground hover:bg-accent/80'
                                            : 'flex-1 bg-primary text-primary-foreground hover:bg-primary/90'
                                        }`}
                                    >
                                        <Download className="h-4 w-4" />
                                        Download
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => copyLink(artifact, artifactUrl)}
                                        title="Copy share link"
                                        aria-label="Copy share link"
                                        className="flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/80 transition-colors"
                                    >
                                        {copiedId === artifact.id ? (
                                            <Check className="h-4 w-4 text-emerald-500" />
                                        ) : (
                                            <Copy className="h-4 w-4" />
                                        )}
                                    </button>
                                </div>

                                <div className="absolute bottom-0 left-0 right-0 h-1">
                                    <div className="h-full w-0 bg-primary group-hover:w-full transition-all duration-500 mx-auto" />
                                </div>
                            </article>
                        );
                    })}
                </div>

                {filteredArtifacts.length === 0 && (
                    <div className="text-center py-24 bg-accent/10 rounded-3xl border border-dashed border-border/50 animate-in zoom-in-95 duration-500">
                        <div className="p-4 rounded-full bg-accent/20 w-16 h-16 flex items-center justify-center mx-auto mb-6">
                            <FileText className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <h3 className="text-xl font-semibold mb-2">No artifacts found</h3>
                        <p className="text-muted-foreground max-w-md mx-auto">
                            {selectedType
                                ? "No artifacts match the selected type. Try clearing the filter."
                                : "No artifacts have been uploaded yet. Use the admin dashboard to upload files."
                            }
                        </p>
                        {selectedType && (
                            <button
                                onClick={() => setSelectedType(null)}
                                className="mt-8 px-6 py-2 bg-primary text-primary-foreground rounded-full font-medium hover:opacity-90 transition-opacity"
                            >
                                Clear All Filters
                            </button>
                        )}
                    </div>
                )}
            </div>
        </PageEntrance>
    );
}
