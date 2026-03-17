import { readFileSync } from 'fs';
import { join } from 'path';

export interface Artifact {
    id: string;
    name: string;
    filename: string;
    description: string;
    type: string;
    size: number;
    uploadedAt: string;
}

export function getArtifacts(): Artifact[] {
    try {
        const filePath = join(process.cwd(), 'data', 'artifacts.json');
        const raw = readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as Artifact[];
    } catch {
        return [];
    }
}

export function getArtifactFileTypes(artifacts: Artifact[]): string[] {
    const types = new Set<string>();
    artifacts.forEach(a => types.add(a.type));
    return Array.from(types).sort();
}

export function getFileTypeLabel(type: string): string {
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

export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
