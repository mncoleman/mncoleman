import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, File, Image as ImageIcon, Code, FileType, Zap } from 'lucide-react';
import {
    getArtifacts,
    getStaticArtifactBySlug,
    getFileTypeLabel,
    formatFileSize,
    isViewableInBrowser,
} from '@/lib/artifacts';
import { artifactSlug } from '@/lib/utils';
import { ShareActions } from '@/components/ShareActions';
import { PageEntrance } from '@/components/page-entrance';

// Every static artifact is known at build time → pre-render each details page.
export const dynamicParams = false;

export async function generateStaticParams() {
    const seen = new Set<string>();
    const params: { slug: string }[] = [];
    for (const a of getArtifacts()) {
        const slug = artifactSlug(a);
        if (seen.has(slug)) {
            // Two static artifacts derive the same slug — the second is unreachable.
            // Surface it at build time instead of failing silently with a 404.
            console.warn(`[artifacts] Duplicate details slug "${slug}" (${a.filename}) — only the first is reachable. Rename the file to disambiguate.`);
            continue;
        }
        seen.add(slug);
        params.push({ slug });
    }
    return params;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params;
    const artifact = getStaticArtifactBySlug(slug);
    if (!artifact) return { title: 'Artifact not found | Matthew Coleman' };

    const description = artifact.description || `Artifact: ${artifact.name}`;
    const url = `/artifacts/${slug}/details/`;
    return {
        title: `${artifact.name} | Matthew Coleman`,
        description,
        openGraph: {
            title: artifact.name,
            description,
            url,
            type: 'article',
            images: ['/icon-512.png'],
        },
        twitter: {
            card: 'summary',
            title: artifact.name,
            description,
            images: ['/icon-512.png'],
        },
    };
}

function getFileIcon(type: string) {
    const t = (type || '').split(';')[0].trim().toLowerCase();
    if (t.startsWith('image/')) return ImageIcon;
    if (t === 'text/html') return Code;
    if (t === 'application/pdf') return FileType;
    if (t.startsWith('text/')) return FileText;
    return File;
}

export default async function ArtifactDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params;
    const artifact = getStaticArtifactBySlug(slug);
    if (!artifact) notFound();

    const artifactUrl = artifact.url || `/artifacts/${artifact.filename}`;
    const downloadUrl = artifact.downloadUrl || artifactUrl;
    const viewable = isViewableInBrowser(artifact.type);
    const detailsPath = `/artifacts/${slug}/details/`;
    const Icon = getFileIcon(artifact.type);
    const uploaded = new Date(artifact.uploadedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    return (
        <PageEntrance>
            <div className="container mx-auto px-4 py-16 max-w-2xl">
                <Link
                    href="/artifacts"
                    className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
                >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to artifacts
                </Link>

                <div className="rounded-2xl border border-border/50 bg-background/50 backdrop-blur-sm p-8 shadow-sm">
                    <div className="flex justify-between items-start mb-6">
                        <div className="p-3 rounded-xl bg-primary/10 text-primary">
                            <Icon className="h-6 w-6" />
                        </div>
                        <span className="text-[11px] px-2.5 py-0.5 rounded-full border bg-muted/50 border-border text-muted-foreground">
                            {getFileTypeLabel(artifact.type)}
                        </span>
                    </div>

                    <h1 className="text-3xl font-bold tracking-tight mb-3">{artifact.name}</h1>

                    {artifact.description && (
                        <p className="text-muted-foreground leading-relaxed mb-6">{artifact.description}</p>
                    )}

                    <div className="flex items-center gap-3 text-sm text-muted-foreground mb-8">
                        <span>{formatFileSize(artifact.size)}</span>
                        <span>-</span>
                        <span>Added {uploaded}</span>
                    </div>

                    <ShareActions
                        openUrl={viewable ? artifactUrl : undefined}
                        openLabel="View"
                        downloadUrl={downloadUrl}
                        downloadFilename={artifact.filename}
                        copyUrl={artifactUrl}
                        shareUrl={detailsPath}
                        className="pt-6 border-t border-border/30"
                    />
                </div>

                <p className="text-xs text-muted-foreground/70 mt-4 flex items-center gap-1.5">
                    <Zap className="h-3 w-3" />
                    <span>
                        <strong className="font-medium text-muted-foreground">Copy link</strong> copies the artifact
                        itself; <strong className="font-medium text-muted-foreground">Share Page</strong> copies this
                        details page.
                    </span>
                </p>
            </div>
        </PageEntrance>
    );
}
