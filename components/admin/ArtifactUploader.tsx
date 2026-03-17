'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, Trash2, FileText, File, Image, Code, FileType, UploadCloud } from 'lucide-react';

const IS_DEV = process.env.NODE_ENV === 'development';

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
    // In dev mode, use the standalone dev artifacts server
    if (IS_DEV) return `http://localhost:3001/api/artifacts${path}`;
    return `${workerUrl}/api/artifacts${path}`;
}

export function ArtifactUploader({ workerUrl }: ArtifactUploaderProps) {
    const [file, setFile] = useState<File | null>(null);
    const [description, setDescription] = useState('');
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [artifacts, setArtifacts] = useState<ArtifactEntry[]>([]);
    const [loadingList, setLoadingList] = useState(true);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const dragCounterRef = useRef(0);

    useEffect(() => {
        fetchArtifacts();
    }, []);

    const fetchArtifacts = async () => {
        setLoadingList(true);
        try {
            const res = await fetch(getApiUrl(workerUrl, ''), {
                headers: IS_DEV ? {} : { 'X-Requested-With': 'mncoleman-admin' },
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

    const handleFileSelect = useCallback((selectedFile: File) => {
        setFile(selectedFile);
        setMessage(null);
    }, []);

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

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) return;

        setUploading(true);
        setMessage(null);

        try {
            const arrayBuffer = await file.arrayBuffer();
            const base64 = btoa(
                new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
            );

            const res = await fetch(getApiUrl(workerUrl, ''), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(IS_DEV ? {} : { 'X-Requested-With': 'mncoleman-admin' }),
                },
                credentials: 'include',
                body: JSON.stringify({
                    filename: file.name,
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

            setMessage({ type: 'success', text: `"${file.name}" uploaded successfully!${IS_DEV ? '' : ' A rebuild will be triggered.'}` });
            setFile(null);
            setDescription('');
            if (fileInputRef.current) fileInputRef.current.value = '';
            await fetchArtifacts();
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
                headers: IS_DEV ? {} : { 'X-Requested-With': 'mncoleman-admin' },
                credentials: 'include',
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || 'Delete failed');
            }

            setMessage({ type: 'success', text: `"${filename}" deleted.${IS_DEV ? '' : ' A rebuild will be triggered.'}` });
            await fetchArtifacts();
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setDeleting(null);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Artifacts</CardTitle>
                <CardDescription>Upload files to the artifacts page. {IS_DEV ? 'Dev mode: files saved locally.' : 'Files are committed to the repo and served statically.'}</CardDescription>
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
                                return (
                                    <div
                                        key={artifact.id}
                                        className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <IconComponent className="h-4 w-4 text-muted-foreground shrink-0" />
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">{artifact.name}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {formatFileSize(artifact.size)} - {artifact.filename}
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(artifact.filename)}
                                            disabled={deleting === artifact.filename}
                                            className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                                        >
                                            {deleting === artifact.filename ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Trash2 className="h-4 w-4" />
                                            )}
                                        </Button>
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
