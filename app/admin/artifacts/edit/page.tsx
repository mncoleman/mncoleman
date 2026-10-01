'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArtifactEditMode } from '@/components/admin/ArtifactEditMode';
import { useAdmin } from '@/components/admin/admin-context';

// The slug rides in the query string: the site is a static export and
// instant artifacts do not exist at build time, so there is nothing for
// generateStaticParams to enumerate.
function EditModeForSlug() {
    const { workerUrl } = useAdmin();
    const slug = useSearchParams().get('slug') || '';
    if (!/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(slug)) {
        return <p className="text-muted-foreground">No artifact selected.</p>;
    }
    return <ArtifactEditMode workerUrl={workerUrl} slug={slug} />;
}

export default function AdminArtifactEditPage() {
    return (
        <Suspense fallback={null}>
            <EditModeForSlug />
        </Suspense>
    );
}
