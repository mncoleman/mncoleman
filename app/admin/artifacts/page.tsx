'use client';

import { ArtifactUploader } from '@/components/admin/ArtifactUploader';
import { useAdmin } from '@/components/admin/admin-context';

export default function AdminArtifactsPage() {
    const { workerUrl, user } = useAdmin();
    return <ArtifactUploader workerUrl={workerUrl} user={user} />;
}
