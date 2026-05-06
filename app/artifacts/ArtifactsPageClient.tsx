'use client';

import { useState, useMemo, useEffect } from 'react';
import { FileText, Filter, X, ExternalLink, Download, File, Image, Code, FileType, Palette, Zap } from 'lucide-react';
import { PageEntrance } from '@/components/page-entrance';
import { ArtifactDesignPopup } from '@/components/artifact-design-popup';
import { formatDistanceToNow } from 'date-fns';

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
}

const ARTIFACTS_API = process.env.NEXT_PUBLIC_ARTIFACTS_API_URL || 'https://artifacts.mncoleman.com';

function getFileTypeLabel(type: string): string {
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
    return labels[type] || type.split('/').pop()?.toUpperCase() || 'File';
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(type: string) {
    if (type.startsWith('image/')) return Image;
    if (type === 'text/html') return Code;
    if (type === 'application/pdf') return FileType;
    if (type.startsWith('text/')) return FileText;
    return File;
}

function isViewableInBrowser(type: string): boolean {
    return type === 'text/html' || type === 'application/pdf' || type.startsWith('image/');
}

interface ArtifactsPageClientProps {
    initialArtifacts: Artifact[];
}

export default function ArtifactsPageClient({ initialArtifacts }: ArtifactsPageClientProps) {
    const [selectedType, setSelectedType] = useState<string | null>(null);
    const [dynamicArtifacts, setDynamicArtifacts] = useState<Artifact[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetch(`${ARTIFACTS_API}/api/list`, { cache: 'no-store' })
            .then(r => (r.ok ? r.json() : { artifacts: [] }))
            .then(data => {
                if (cancelled) return;
                const items: Artifact[] = (data?.artifacts || []).map((a: Artifact) => ({
                    ...a,
                    source: 'dynamic' as const,
                }));
                setDynamicArtifacts(items);
            })
            .catch(() => {});
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
        merged.forEach(a => types.add(a.type));
        return Array.from(types).sort();
    }, [merged]);

    const filteredArtifacts = useMemo(() => {
        let items = merged;
        if (selectedType) {
            items = items.filter(a => a.type === selectedType);
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

                        return (
                            <article
                                key={artifact.id}
                                className="group relative flex flex-col h-full p-6 rounded-2xl border border-border/50 bg-background/50 backdrop-blur-sm hover:border-primary/50 hover:bg-background/80 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-primary/5 animate-in fade-in slide-in-from-bottom-4 duration-500 fill-mode-both overflow-hidden"
                            >
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

                                <div className="flex gap-2 pt-4 mt-auto border-t border-border/30">
                                    {viewable && (
                                        <a
                                            href={artifactUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
                                        >
                                            <ExternalLink className="h-4 w-4" />
                                            View
                                        </a>
                                    )}
                                    <a
                                        href={downloadUrl}
                                        download={artifact.filename}
                                        className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${viewable
                                            ? 'bg-accent text-accent-foreground hover:bg-accent/80'
                                            : 'flex-1 bg-primary text-primary-foreground hover:bg-primary/90'
                                        }`}
                                    >
                                        <Download className="h-4 w-4" />
                                        Download
                                    </a>
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
