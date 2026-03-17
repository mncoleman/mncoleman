import { getArtifacts } from '@/lib/artifacts';
import ArtifactsPageClient from './ArtifactsPageClient';

export const metadata = {
    title: "Artifacts | Matthew Coleman",
    description: "Uploaded files, documents, and artifacts.",
};

export default function ArtifactsPage() {
    const artifacts = getArtifacts();
    return <ArtifactsPageClient initialArtifacts={artifacts} />;
}
