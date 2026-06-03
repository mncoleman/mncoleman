'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Trash2, FileText, File, Image, Code, FileType, UploadCloud, Pencil, X, Check, RefreshCw, Zap, Globe, Copy, ExternalLink, Lock, Eye, EyeOff, AlertTriangle, Search } from 'lucide-react';
import { authHeaders } from '@/lib/admin-auth';

type SourceFilter = 'all' | 'dynamic' | 'static';
type VisibilityFilter = 'all' | 'public' | 'private';

interface ArtifactUploaderProps {
    workerUrl: string;
}

type Destination = 'instant' | 'github';
type Visibility = 'public' | 'private';

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

const ARTIFACTS_API = process.env.NEXT_PUBLIC_ARTIFACTS_API_URL || 'https://artifacts.mncoleman.com';

function suggestSlug(name: string): string {
    return name
        .replace(/\.[^.]+$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

function isValidSlug(slug: string): boolean {
    return /^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(slug);
}

function getFileIcon(type: string) {
    if (type.startsWith('image/')) return Image;
    if (type === 'text/html') return Code;
    if (type === 'application/pdf') return FileType;
    if (type.startsWith('text/')) return FileText;
    return File;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getApiUrl(workerUrl: string, path: string) {
    return `${workerUrl}/api/artifacts${path}`;
}

/** Public, shareable URL for an artifact (absolute, copy-paste ready). */
function artifactPublicUrl(a: ArtifactEntry): string {
    if (a.url) return a.url; // dynamic artifacts carry their absolute share URL
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://mncoleman.com';
    return `${origin}/artifacts/${a.filename}`;
}

function apiHeaders(extra?: Record<string, string>) {
    return authHeaders({ 'Content-Type': 'application/json', ...extra });
}

function FilterPill({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                active
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground'
            }`}
        >
            {label}
            <span className={`text-[10px] tabular-nums ${active ? 'text-primary/70' : 'text-muted-foreground/60'}`}>{count}</span>
        </button>
    );
}

export function ArtifactUploader({ workerUrl }: ArtifactUploaderProps) {
    const [file, setFile] = useState<globalThis.File | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [destination, setDestination] = useState<Destination>('instant');
    const [visibility, setVisibility] = useState<Visibility>('public');
    const [password, setPassword] = useState('');
    const [slug, setSlug] = useState('');
    const [lastShareUrl, setLastShareUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [artifacts, setArtifacts] = useState<ArtifactEntry[]>([]);
    const [loadingList, setLoadingList] = useState(true);
    const [isDragging, setIsDragging] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editFile, setEditFile] = useState<globalThis.File | null>(null);
    const [editVisibility, setEditVisibility] = useState<Visibility>('public');
    const [editPassword, setEditPassword] = useState('');
    const [editClearPassword, setEditClearPassword] = useState(false);
    const [saving, setSaving] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<ArtifactEntry | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
    const [visibilityFilter, setVisibilityFilter] = useState<VisibilityFilter>('all');
    const [revealedPasswords, setRevealedPasswords] = useState<Set<string>>(new Set());
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const togglePasswordReveal = (id: string) => {
        setRevealedPasswords(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const copyToClipboard = async (text: string, key: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1500);
        } catch {
            window.prompt('Copy:', text);
        }
    };

    const filteredArtifacts = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return artifacts.filter(a => {
            if (sourceFilter !== 'all' && (a.source || 'static') !== sourceFilter) return false;
            if (visibilityFilter !== 'all' && (a.visibility || 'public') !== visibilityFilter) return false;
            if (q) {
                const matches = a.name.toLowerCase().includes(q)
                    || (a.slug || '').toLowerCase().includes(q)
                    || a.filename.toLowerCase().includes(q)
                    || (a.description || '').toLowerCase().includes(q);
                if (!matches) return false;
            }
            return true;
        });
    }, [artifacts, searchQuery, sourceFilter, visibilityFilter]);

    const counts = useMemo(() => ({
        all: artifacts.length,
        dynamic: artifacts.filter(a => a.source === 'dynamic').length,
        static: artifacts.filter(a => (a.source || 'static') === 'static').length,
        public: artifacts.filter(a => (a.visibility || 'public') === 'public').length,
        private: artifacts.filter(a => a.visibility === 'private').length,
    }), [artifacts]);

    const filtersActive = sourceFilter !== 'all' || visibilityFilter !== 'all' || searchQuery.trim().length > 0;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editFileInputRef = useRef<HTMLInputElement>(null);
    const dragCounterRef = useRef(0);

    useEffect(() => {
        fetchArtifacts();
    }, []);

    const fetchArtifacts = async () => {
        setLoadingList(true);
        try {
            const [staticRes, dynamicRes] = await Promise.all([
                fetch(getApiUrl(workerUrl, ''), {
                    headers: authHeaders(),
                    credentials: 'include',
                }).then(r => (r.ok ? r.json() : { artifacts: [] })).catch(() => ({ artifacts: [] })),
                // Admin list — includes private artifacts (proxied through the Worker for auth).
                fetch(`${workerUrl.replace(/\/$/, '')}/api/artifacts/instant/list`, {
                    headers: authHeaders(),
                    credentials: 'include',
                }).then(r => (r.ok ? r.json() : { artifacts: [] })).catch(() => ({ artifacts: [] })),
            ]);

            const staticArtifacts: ArtifactEntry[] = (staticRes.artifacts || []).map((a: ArtifactEntry) => ({
                ...a,
                source: 'static' as const,
            }));
            const dynamicArtifacts: ArtifactEntry[] = (dynamicRes.artifacts || []).map((a: ArtifactEntry) => ({
                ...a,
                source: 'dynamic' as const,
            }));

            const merged = [...dynamicArtifacts, ...staticArtifacts]
                .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
            setArtifacts(merged);
        } finally {
            setLoadingList(false);
        }
    };

    const handleFileSelect = useCallback((selectedFile: globalThis.File) => {
        setFile(selectedFile);
        setMessage(null);
        setLastShareUrl(null);
        if (!name) {
            setName(selectedFile.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '));
        }
        if (!slug) {
            setSlug(suggestSlug(selectedFile.name));
        }
    }, [name, slug]);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragging(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounterRef.current--;
        if (dragCounterRef.current === 0) {
            setIsDragging(false);
        }
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounterRef.current = 0;

        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    }, [handleFileSelect]);

    const fileToBase64 = async (f: globalThis.File): Promise<string> => {
        const arrayBuffer = await f.arrayBuffer();
        return btoa(
            new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return;

        if (destination === 'instant' && slug && !isValidSlug(slug)) {
            setMessage({ type: 'error', text: 'Slug must be 3-60 chars of [a-z0-9-], starting and ending with alphanumeric.' });
            return;
        }
        if (destination === 'instant' && visibility === 'private' && password.length < 4) {
            setMessage({ type: 'error', text: 'Private artifacts require a password of at least 4 characters.' });
            return;
        }

        setUploading(true);
        setMessage(null);
        setLastShareUrl(null);

        try {
            let res: Response;
            if (destination === 'instant') {
                // Stream the file as multipart so the Worker can pipe it through to Oracle
                // without buffering the full payload in memory.
                const fd = new FormData();
                fd.append('file', file);
                if (name) fd.append('name', name);
                if (description) fd.append('description', description);
                if (slug) fd.append('slug', slug);
                fd.append('visibility', visibility);
                if (visibility === 'private') fd.append('password', password);
                res = await fetch(getApiUrl(workerUrl, ''), {
                    method: 'POST',
                    headers: authHeaders(),
                    credentials: 'include',
                    body: fd,
                });
            } else {
                const base64 = await fileToBase64(file);
                res = await fetch(getApiUrl(workerUrl, ''), {
                    method: 'POST',
                    headers: apiHeaders(),
                    credentials: 'include',
                    body: JSON.stringify({
                        filename: file.name,
                        name: name || undefined,
                        content: base64,
                        type: file.type || 'application/octet-stream',
                        size: file.size,
                        description,
                        destination: 'github',
                    }),
                });
            }

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || 'Upload failed');
            }

            const resData = await res.json();
            const uploaded: ArtifactEntry = {
                ...resData.artifact,
                source: destination === 'instant' ? 'dynamic' : 'static',
            };
            setArtifacts(prev => [uploaded, ...prev.filter(a => a.id !== uploaded.id)]);

            if (destination === 'instant' && uploaded.url) {
                setLastShareUrl(uploaded.url);
                setMessage({ type: 'success', text: `"${file.name}" published instantly. Share URL ready below.` });
            } else {
                setMessage({ type: 'success', text: `"${file.name}" uploaded. A rebuild will be triggered.` });
            }

            setFile(null);
            setName('');
            setDescription('');
            setSlug('');
            setPassword('');
            setVisibility('public');
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setUploading(false);
        }
    };

    const deleteKey = (a: ArtifactEntry) => `${a.source || 'static'}:${a.slug || a.filename}`;

    const handleDelete = async (artifact: ArtifactEntry) => {
        const key = deleteKey(artifact);
        setDeleting(key);
        setMessage(null);

        try {
            let res: Response;
            if (artifact.source === 'dynamic' && artifact.slug) {
                res = await fetch(`${workerUrl.replace(/\/$/, '')}/api/artifacts/instant/${encodeURIComponent(artifact.slug)}`, {
                    method: 'DELETE',
                    headers: authHeaders(),
                    credentials: 'include',
                });
            } else {
                res = await fetch(getApiUrl(workerUrl, `?file=${encodeURIComponent(artifact.filename)}`), {
                    method: 'DELETE',
                    headers: authHeaders(),
                    credentials: 'include',
                });
            }

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || 'Delete failed');
            }

            setMessage({
                type: 'success',
                text: artifact.source === 'dynamic'
                    ? `"${artifact.name}" removed.`
                    : `"${artifact.filename}" deleted. A rebuild will be triggered.`,
            });
            setArtifacts(prev => prev.filter(a => a.id !== artifact.id));
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setDeleting(null);
        }
    };

    const startEdit = (artifact: ArtifactEntry) => {
        setEditingId(artifact.id);
        setEditName(artifact.name);
        setEditDesc(artifact.description);
        setEditFile(null);
        setEditVisibility(artifact.visibility || 'public');
        setEditPassword('');
        setEditClearPassword(false);
        setMessage(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditName('');
        setEditDesc('');
        setEditFile(null);
        setEditPassword('');
        setEditClearPassword(false);
        if (editFileInputRef.current) editFileInputRef.current.value = '';
    };

    const handleSaveEdit = async (artifact: ArtifactEntry) => {
        if (artifact.source === 'dynamic' && editVisibility === 'private') {
            // Going private (or staying private with a rotation) requires either a new password
            // OR the artifact must already have one stored.
            if (editPassword && editPassword.length < 4) {
                setMessage({ type: 'error', text: 'Password must be at least 4 characters.' });
                return;
            }
            if (artifact.visibility !== 'private' && !editPassword) {
                setMessage({ type: 'error', text: 'Set a password to make this artifact private.' });
                return;
            }
        }

        setSaving(true);
        setMessage(null);

        try {
            let res: Response;
            if (artifact.source === 'dynamic' && artifact.slug) {
                const fd = new FormData();
                if (editName !== artifact.name) fd.append('name', editName);
                if (editDesc !== artifact.description) fd.append('description', editDesc);
                if (editVisibility !== (artifact.visibility || 'public')) fd.append('visibility', editVisibility);
                if (editPassword) fd.append('password', editPassword);
                if (editVisibility === 'public' && artifact.visibility === 'private') fd.append('clearPassword', 'true');
                if (editFile) fd.append('file', editFile);

                res = await fetch(`${workerUrl.replace(/\/$/, '')}/api/artifacts/instant/${encodeURIComponent(artifact.slug)}`, {
                    method: 'PATCH',
                    headers: authHeaders(),
                    credentials: 'include',
                    body: fd,
                });
            } else {
                const body: any = {
                    filename: artifact.filename,
                    name: editName,
                    description: editDesc,
                };
                if (editFile) {
                    body.content = await fileToBase64(editFile);
                    body.type = editFile.type || 'application/octet-stream';
                    body.size = editFile.size;
                }
                res = await fetch(getApiUrl(workerUrl, ''), {
                    method: 'PATCH',
                    headers: apiHeaders(),
                    credentials: 'include',
                    body: JSON.stringify(body),
                });
            }

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || 'Update failed');
            }

            const resData = await res.json();
            const updated = (resData.artifact ?? resData) as ArtifactEntry;
            setMessage({
                type: 'success',
                text: artifact.source === 'dynamic'
                    ? `"${artifact.name}" updated.`
                    : `"${artifact.filename}" updated. A rebuild will be triggered.`,
            });
            setArtifacts(prev => prev.map(a => a.id === artifact.id ? {
                ...a,
                name: editName,
                description: editDesc,
                ...(artifact.source === 'dynamic' ? {
                    visibility: editVisibility,
                    hasPassword: editVisibility === 'private',
                    ...(updated && typeof updated === 'object' ? updated : {}),
                } : {}),
                ...(editFile ? { type: editFile.type || a.type, size: editFile.size, uploadedAt: new Date().toISOString() } : {}),
            } : a));
            cancelEdit();
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        const target = pendingDelete;
        setPendingDelete(null);
        await handleDelete(target);
    };

    return (
        <>
        <Card>
            <CardHeader>
                <CardTitle>Artifacts</CardTitle>
                <CardDescription>Upload files to the artifacts page. Files are committed to the repo and served statically.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Upload Form */}
                <form onSubmit={handleUpload} className="space-y-4">
                    {/* Drop Zone */}
                    <div
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDragOver={handleDragOver}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`relative flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 ${
                            isDragging
                                ? 'border-primary bg-primary/5 scale-[1.02]'
                                : file
                                    ? 'border-primary/50 bg-primary/5'
                                    : 'border-border/50 hover:border-primary/30 hover:bg-accent/30'
                        }`}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            onChange={(e) => {
                                const selected = e.target.files?.[0];
                                if (selected) handleFileSelect(selected);
                            }}
                            className="hidden"
                        />

                        {file ? (
                            <>
                                {(() => {
                                    const IconComponent = getFileIcon(file.type);
                                    return <IconComponent className="h-8 w-8 text-primary" />;
                                })()}
                                <div className="text-center">
                                    <p className="text-sm font-medium">{file.name}</p>
                                    <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setFile(null);
                                        if (fileInputRef.current) fileInputRef.current.value = '';
                                    }}
                                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                                >
                                    Remove
                                </button>
                            </>
                        ) : (
                            <>
                                <UploadCloud className={`h-8 w-8 transition-colors ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                                <div className="text-center">
                                    <p className="text-sm font-medium">
                                        {isDragging ? 'Drop file here' : 'Drop a file here or click to browse'}
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-1">Any file type supported</p>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Destination</Label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setDestination('instant')}
                                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                                    destination === 'instant'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border/50 hover:border-primary/30'
                                }`}
                            >
                                <Zap className={`h-4 w-4 mt-0.5 shrink-0 ${destination === 'instant' ? 'text-primary' : 'text-muted-foreground'}`} />
                                <div>
                                    <p className="text-sm font-medium">Instant (server)</p>
                                    <p className="text-xs text-muted-foreground">Live in seconds. Auto OG image.</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setDestination('github')}
                                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                                    destination === 'github'
                                        ? 'border-primary bg-primary/5'
                                        : 'border-border/50 hover:border-primary/30'
                                }`}
                            >
                                <Globe className={`h-4 w-4 mt-0.5 shrink-0 ${destination === 'github' ? 'text-primary' : 'text-muted-foreground'}`} />
                                <div>
                                    <p className="text-sm font-medium">Static (GitHub)</p>
                                    <p className="text-xs text-muted-foreground">Triggers a rebuild (~1 min).</p>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="artifact-name">Name (optional)</Label>
                        <Input
                            id="artifact-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Display name (defaults to filename)"
                        />
                    </div>

                    {destination === 'instant' && (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="artifact-slug">
                                    Slug
                                    <span className="ml-2 text-xs text-muted-foreground font-normal">
                                        URL: artifacts.mncoleman.com/a/<span className="font-mono">{slug || 'your-slug'}</span>
                                    </span>
                                </Label>
                                <Input
                                    id="artifact-slug"
                                    value={slug}
                                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                                    placeholder="my-artifact-name"
                                    className="font-mono"
                                    maxLength={60}
                                />
                                {slug && !isValidSlug(slug) && (
                                    <p className="text-xs text-destructive">3-60 chars, [a-z0-9-], starting and ending alphanumeric.</p>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs uppercase tracking-wider text-muted-foreground">Visibility</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setVisibility('public')}
                                        className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                                            visibility === 'public'
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border/50 hover:border-primary/30'
                                        }`}
                                    >
                                        <Eye className={`h-4 w-4 mt-0.5 shrink-0 ${visibility === 'public' ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <div>
                                            <p className="text-sm font-medium">Public</p>
                                            <p className="text-xs text-muted-foreground">Listed on /artifacts.</p>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setVisibility('private')}
                                        className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                                            visibility === 'private'
                                                ? 'border-primary bg-primary/5'
                                                : 'border-border/50 hover:border-primary/30'
                                        }`}
                                    >
                                        <Lock className={`h-4 w-4 mt-0.5 shrink-0 ${visibility === 'private' ? 'text-primary' : 'text-muted-foreground'}`} />
                                        <div>
                                            <p className="text-sm font-medium">Private</p>
                                            <p className="text-xs text-muted-foreground">Hidden, password-gated.</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {visibility === 'private' && (
                                <div className="space-y-2">
                                    <Label htmlFor="artifact-password">Password</Label>
                                    <Input
                                        id="artifact-password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Min 4 characters"
                                        autoComplete="new-password"
                                    />
                                </div>
                            )}
                        </>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="artifact-desc">Description (optional)</Label>
                        <Input
                            id="artifact-desc"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Brief description of the file"
                        />
                    </div>

                    <Button type="submit" disabled={!file || uploading} className="w-full sm:w-auto">
                        {uploading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : destination === 'instant' ? (
                            <Zap className="mr-2 h-4 w-4" />
                        ) : (
                            <Upload className="mr-2 h-4 w-4" />
                        )}
                        {destination === 'instant' ? 'Publish Instantly' : 'Upload to Static'}
                    </Button>
                </form>

                {lastShareUrl && (
                    <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-2">
                        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-primary font-medium">
                            <Zap className="h-3 w-3" /> Live & shareable
                        </div>
                        <div className="flex items-center gap-2">
                            <Input value={lastShareUrl} readOnly className="font-mono text-xs h-8" />
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => navigator.clipboard.writeText(lastShareUrl)}
                                className="h-8 gap-1"
                            >
                                <Copy className="h-3 w-3" /> Copy
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                asChild
                                className="h-8 gap-1"
                            >
                                <a href={lastShareUrl} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3 w-3" /> Open
                                </a>
                            </Button>
                        </div>
                    </div>
                )}

                {message && (
                    <div className={`p-3 rounded text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {message.text}
                    </div>
                )}

                {/* Existing Artifacts List */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-medium text-muted-foreground shrink-0">
                            Uploaded Artifacts
                            {filtersActive && (
                                <span className="ml-2 text-xs">
                                    ({filteredArtifacts.length} of {artifacts.length})
                                </span>
                            )}
                        </h4>
                        <div className="relative flex-1 max-w-xs">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search artifacts…"
                                className="h-8 text-xs pl-8 pr-7"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    aria-label="Clear search"
                                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-3 w-3" />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filters */}
                    {artifacts.length > 0 && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 shrink-0">Source</span>
                                <div className="flex items-center gap-1">
                                    {([
                                        ['all', 'All', counts.all],
                                        ['dynamic', 'Live', counts.dynamic],
                                        ['static', 'Static', counts.static],
                                    ] as const).map(([value, label, count]) => (
                                        <FilterPill
                                            key={value}
                                            active={sourceFilter === value}
                                            label={label}
                                            count={count}
                                            onClick={() => setSourceFilter(value)}
                                        />
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 shrink-0">Visibility</span>
                                <div className="flex items-center gap-1">
                                    {([
                                        ['all', 'All', counts.all],
                                        ['public', 'Public', counts.public],
                                        ['private', 'Private', counts.private],
                                    ] as const).map(([value, label, count]) => (
                                        <FilterPill
                                            key={value}
                                            active={visibilityFilter === value}
                                            label={label}
                                            count={count}
                                            onClick={() => setVisibilityFilter(value)}
                                        />
                                    ))}
                                </div>
                            </div>
                            {(sourceFilter !== 'all' || visibilityFilter !== 'all') && (
                                <button
                                    type="button"
                                    onClick={() => { setSourceFilter('all'); setVisibilityFilter('all'); }}
                                    className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    )}
                    {loadingList ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                            <Loader2 className="animate-spin h-4 w-4" /> Loading...
                        </div>
                    ) : artifacts.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">No artifacts uploaded yet.</p>
                    ) : filteredArtifacts.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">
                            {searchQuery
                                ? <>No artifacts match &ldquo;{searchQuery}&rdquo;{(sourceFilter !== 'all' || visibilityFilter !== 'all') ? ' with these filters' : ''}.</>
                                : 'No artifacts match these filters.'}
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {filteredArtifacts.map((artifact) => {
                                const IconComponent = getFileIcon(artifact.type);
                                const isEditing = editingId === artifact.id;

                                if (isEditing) {
                                    return (
                                        <div
                                            key={artifact.id}
                                            className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3"
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-medium text-muted-foreground">Editing: {artifact.filename}</span>
                                                <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-7 w-7 p-0">
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">Name</Label>
                                                <Input
                                                    value={editName}
                                                    onChange={(e) => setEditName(e.target.value)}
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">Description</Label>
                                                <Input
                                                    value={editDesc}
                                                    onChange={(e) => setEditDesc(e.target.value)}
                                                    placeholder="Brief description"
                                                    className="h-8 text-sm"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">Replace file (optional)</Label>
                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        ref={editFileInputRef}
                                                        type="file"
                                                        onChange={(e) => setEditFile(e.target.files?.[0] || null)}
                                                        className="h-8 text-xs cursor-pointer"
                                                    />
                                                    {editFile && (
                                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                            {formatFileSize(editFile.size)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {artifact.source === 'dynamic' && (
                                                <>
                                                    <div className="space-y-2">
                                                        <Label className="text-xs">Visibility</Label>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditVisibility('public')}
                                                                className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
                                                                    editVisibility === 'public'
                                                                        ? 'border-primary bg-primary/5'
                                                                        : 'border-border/50 hover:border-primary/30'
                                                                }`}
                                                            >
                                                                <Eye className={`h-3.5 w-3.5 shrink-0 ${editVisibility === 'public' ? 'text-primary' : 'text-muted-foreground'}`} />
                                                                <span className="text-xs font-medium">Public</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditVisibility('private')}
                                                                className={`flex items-center gap-2 rounded-lg border p-2 text-left transition-colors ${
                                                                    editVisibility === 'private'
                                                                        ? 'border-primary bg-primary/5'
                                                                        : 'border-border/50 hover:border-primary/30'
                                                                }`}
                                                            >
                                                                <Lock className={`h-3.5 w-3.5 shrink-0 ${editVisibility === 'private' ? 'text-primary' : 'text-muted-foreground'}`} />
                                                                <span className="text-xs font-medium">Private</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {editVisibility === 'private' && (
                                                        <div className="space-y-2">
                                                            <Label className="text-xs">
                                                                Password
                                                                {artifact.hasPassword && (
                                                                    <span className="ml-2 text-[10px] text-muted-foreground font-normal">
                                                                        (leave blank to keep current)
                                                                    </span>
                                                                )}
                                                            </Label>
                                                            <Input
                                                                type="password"
                                                                value={editPassword}
                                                                onChange={(e) => setEditPassword(e.target.value)}
                                                                placeholder={artifact.hasPassword ? 'Enter new password to rotate' : 'Min 4 characters'}
                                                                className="h-8 text-sm"
                                                                autoComplete="new-password"
                                                            />
                                                        </div>
                                                    )}
                                                </>
                                            )}

                                            <div className="flex gap-2 pt-1">
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleSaveEdit(artifact)}
                                                    disabled={saving}
                                                    className="h-8 gap-1.5"
                                                >
                                                    {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                                    Save
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={cancelEdit} className="h-8">
                                                    Cancel
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={artifact.id}
                                        className="p-3 rounded-lg border border-border/50 bg-background/50 space-y-2"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-start gap-3 min-w-0">
                                                <IconComponent className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <p className="text-sm font-medium break-words">{artifact.name}</p>
                                                        {artifact.source === 'dynamic' && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary">
                                                                <Zap className="h-2.5 w-2.5" /> Live
                                                            </span>
                                                        )}
                                                        {artifact.visibility === 'private' && (
                                                            <span
                                                                title="Private — password protected"
                                                                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-500"
                                                            >
                                                                <Lock className="h-2.5 w-2.5" /> Private
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground break-words">
                                                        {artifact.description ? `${artifact.description} - ` : ''}{formatFileSize(artifact.size)}
                                                    </p>
                                                    <div className="flex items-center gap-1.5 mt-0.5 group/url">
                                                        <span className="text-xs text-muted-foreground break-all min-w-0">
                                                            {artifact.source === 'dynamic' && artifact.url
                                                                ? artifact.url
                                                                : artifact.filename}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => copyToClipboard(artifactPublicUrl(artifact), `url-${artifact.id}`)}
                                                            title="Copy URL"
                                                            aria-label="Copy URL"
                                                            className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                                        >
                                                            {copiedKey === `url-${artifact.id}`
                                                                ? <Check className="h-3 w-3 text-emerald-500" />
                                                                : <Copy className="h-3 w-3" />}
                                                        </button>
                                                        <a
                                                            href={artifactPublicUrl(artifact)}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            title="Open URL"
                                                            aria-label="Open URL"
                                                            className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                                        >
                                                            <ExternalLink className="h-3 w-3" />
                                                        </a>
                                                    </div>
                                                    {artifact.visibility === 'private' && artifact.hasPassword && (
                                                        <div className="flex items-center gap-1.5 mt-1.5 group/pw">
                                                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Password:</span>
                                                            {artifact.password ? (
                                                                <code className="text-xs font-mono bg-muted/50 px-1.5 py-0.5 rounded border border-border/40 select-all">
                                                                    {revealedPasswords.has(artifact.id)
                                                                        ? artifact.password
                                                                        : '•'.repeat(Math.min(artifact.password.length, 12))}
                                                                </code>
                                                            ) : (
                                                                <span className="text-xs italic text-muted-foreground">not recoverable (legacy)</span>
                                                            )}
                                                            {artifact.password && (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => togglePasswordReveal(artifact.id)}
                                                                        title={revealedPasswords.has(artifact.id) ? 'Hide' : 'Reveal'}
                                                                        className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                                                                    >
                                                                        {revealedPasswords.has(artifact.id)
                                                                            ? <EyeOff className="h-3 w-3" />
                                                                            : <Eye className="h-3 w-3" />}
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => copyToClipboard(artifact.password!, `pw-${artifact.id}`)}
                                                                        title="Copy password"
                                                                        className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                                                                    >
                                                                        {copiedKey === `pw-${artifact.id}`
                                                                            ? <Check className="h-3 w-3 text-emerald-500" />
                                                                            : <Copy className="h-3 w-3" />}
                                                                    </button>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => startEdit(artifact)}
                                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                                >
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setPendingDelete(artifact)}
                                                    disabled={deleting === deleteKey(artifact)}
                                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                >
                                                    {deleting === deleteKey(artifact) ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
        {pendingDelete && (
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-modal-title"
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150"
                onClick={() => setPendingDelete(null)}
                onKeyDown={(e) => { if (e.key === 'Escape') setPendingDelete(null); }}
            >
                <div
                    role="document"
                    onClick={(e) => e.stopPropagation()}
                    className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-150"
                >
                    <div className="flex items-start gap-3 mb-4">
                        <div className="p-2 rounded-full bg-destructive/10 text-destructive shrink-0">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h3 id="delete-modal-title" className="text-lg font-semibold leading-tight">
                                Delete artifact?
                            </h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                This cannot be undone.
                            </p>
                        </div>
                    </div>

                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 mb-4">
                        <p className="text-sm font-medium break-words">{pendingDelete.name}</p>
                        <p className="text-xs text-muted-foreground break-all mt-0.5">
                            {pendingDelete.source === 'dynamic' && pendingDelete.url
                                ? pendingDelete.url
                                : pendingDelete.filename}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2 text-[10px]">
                            {pendingDelete.source === 'dynamic' ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-primary/30 bg-primary/10 text-primary">
                                    <Zap className="h-2.5 w-2.5" /> Live (instant)
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border bg-muted/50 border-border text-muted-foreground">
                                    <Globe className="h-2.5 w-2.5" /> Static (GitHub)
                                </span>
                            )}
                            {pendingDelete.visibility === 'private' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-500">
                                    <Lock className="h-2.5 w-2.5" /> Private
                                </span>
                            )}
                        </div>
                    </div>

                    <p className="text-xs text-muted-foreground mb-5">
                        {pendingDelete.source === 'dynamic'
                            ? 'The file, OG image, and metadata will be removed from the server immediately. Anyone holding the share link will get a 404.'
                            : 'A commit will be created to remove the file from the repo, triggering a rebuild (~1 min).'}
                    </p>

                    <div className="flex justify-end gap-2">
                        <Button
                            variant="ghost"
                            onClick={() => setPendingDelete(null)}
                            autoFocus
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDelete}
                            className="gap-2"
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete
                        </Button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
