'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Trash2, FileText, File, Image, Code, FileType, UploadCloud, Pencil, X, Check, RefreshCw } from 'lucide-react';
import { authHeaders } from '@/lib/admin-auth';

interface ArtifactUploaderProps {
    workerUrl: string;
}

interface ArtifactEntry {
    id: string;
    name: string;
    filename: string;
    description: string;
    type: string;
    size: number;
    uploadedAt: string;
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

function apiHeaders(extra?: Record<string, string>) {
    return authHeaders({ 'Content-Type': 'application/json', ...extra });
}

export function ArtifactUploader({ workerUrl }: ArtifactUploaderProps) {
    const [file, setFile] = useState<globalThis.File | null>(null);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
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
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const editFileInputRef = useRef<HTMLInputElement>(null);
    const dragCounterRef = useRef(0);

    useEffect(() => {
        fetchArtifacts();
    }, []);

    const fetchArtifacts = async () => {
        setLoadingList(true);
        try {
            const res = await fetch(getApiUrl(workerUrl, ''), {
                headers: authHeaders(),
                credentials: 'include',
            });
            if (res.ok) {
                const data = await res.json();
                setArtifacts(data.artifacts || []);
            }
        } catch {
            // Silently fail
        } finally {
            setLoadingList(false);
        }
    };

    const handleFileSelect = useCallback((selectedFile: globalThis.File) => {
        setFile(selectedFile);
        setMessage(null);
        // Auto-fill name from filename if name is empty
        if (!name) {
            setName(selectedFile.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' '));
        }
    }, [name]);

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

        setUploading(true);
        setMessage(null);

        try {
            const base64 = await fileToBase64(file);

            const res = await fetch(getApiUrl(workerUrl, ''), {
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
                }),
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || 'Upload failed');
            }

            const resData = await res.json();
            setArtifacts(prev => [...prev, resData.artifact]);
            setMessage({ type: 'success', text: `"${file.name}" uploaded successfully! A rebuild will be triggered.` });
            setFile(null);
            setName('');
            setDescription('');
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (filename: string) => {
        setDeleting(filename);
        setMessage(null);

        try {
            const res = await fetch(getApiUrl(workerUrl, `?file=${encodeURIComponent(filename)}`), {
                method: 'DELETE',
                headers: authHeaders(),
                credentials: 'include',
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || 'Delete failed');
            }

            setMessage({ type: 'success', text: `"${filename}" deleted. A rebuild will be triggered.` });
            setArtifacts(prev => prev.filter(a => a.filename !== filename));
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
        setMessage(null);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditName('');
        setEditDesc('');
        setEditFile(null);
        if (editFileInputRef.current) editFileInputRef.current.value = '';
    };

    const handleSaveEdit = async (artifact: ArtifactEntry) => {
        setSaving(true);
        setMessage(null);

        try {
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

            const res = await fetch(getApiUrl(workerUrl, ''), {
                method: 'PATCH',
                headers: apiHeaders(),
                credentials: 'include',
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || 'Update failed');
            }

            const resData = await res.json();
            setMessage({ type: 'success', text: `"${artifact.filename}" updated. A rebuild will be triggered.` });
            setArtifacts(prev => prev.map(a => a.id === artifact.id ? { ...a, name: editName, description: editDesc, ...(editFile ? { type: editFile.type || a.type, size: editFile.size, uploadedAt: new Date().toISOString() } : {}) } : a));
            cancelEdit();
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setSaving(false);
        }
    };

    return (
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
                        <Label htmlFor="artifact-name">Name (optional)</Label>
                        <Input
                            id="artifact-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Display name (defaults to filename)"
                        />
                    </div>

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
                        {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        Upload Artifact
                    </Button>
                </form>

                {message && (
                    <div className={`p-3 rounded text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {message.text}
                    </div>
                )}

                {/* Existing Artifacts List */}
                <div className="space-y-2">
                    <h4 className="text-sm font-medium text-muted-foreground">Uploaded Artifacts</h4>
                    {loadingList ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                            <Loader2 className="animate-spin h-4 w-4" /> Loading...
                        </div>
                    ) : artifacts.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-4">No artifacts uploaded yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {artifacts.map((artifact) => {
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
                                                    <p className="text-sm font-medium break-words">{artifact.name}</p>
                                                    <p className="text-xs text-muted-foreground break-words">
                                                        {artifact.description ? `${artifact.description} - ` : ''}{formatFileSize(artifact.size)}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground break-all">{artifact.filename}</p>
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
                                                    onClick={() => handleDelete(artifact.filename)}
                                                    disabled={deleting === artifact.filename}
                                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                >
                                                    {deleting === artifact.filename ? (
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
    );
}
