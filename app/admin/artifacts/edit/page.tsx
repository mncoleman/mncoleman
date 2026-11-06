'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArtifactDetail } from '@/components/admin/ArtifactDetail';
import { ArtifactEditMode } from '@/components/admin/ArtifactEditMode';
import { ArtifactUpload } from '@/components/admin/ArtifactUpload';
import { canUse, useAdmin } from '@/components/admin/admin-context';

// The key rides in the query string: the site is a static export and instant artifacts do not
// exist at build time, so there is nothing for generateStaticParams to enumerate.
//   ?slug=<slug>              detail page for an instant artifact
//   ?slug=<slug>&mode=edit    edit mode (click text, notes, Link my Claude), instant HTML only
//   ?file=<file name>         detail page for a static artifact
//   (nothing)                 upload a new artifact
function Route() {
    const { workerUrl, user } = useAdmin();
    const params = useSearchParams();
    const slug = params.get('slug') || '';
    const file = params.get('file') || '';
    if (slug && !/^[a-z0-9](?:[a-z0-9-]{1,58}[a-z0-9])?$/.test(slug)) {
        return <p className="p-6 text-muted-foreground">No artifact selected.</p>;
    }
    if (slug && params.get('mode') === 'edit') {
        return (
            <div className="h-full overflow-y-auto" data-lenis-prevent>
                <div className="mx-auto w-full max-w-6xl p-4 md:p-8"><ArtifactEditMode workerUrl={workerUrl} slug={slug} /></div>
            </div>
        );
    }
    if (slug || file) return <ArtifactDetail key={slug || file} workerUrl={workerUrl} user={user} slug={slug || undefined} file={file || undefined} />;
    return <ArtifactUpload api={workerUrl.replace(/\/$/, '')} canUpload={canUse(user, 'artifacts')} />;
}

export default function AdminArtifactEditPage() {
    return (
        <Suspense fallback={null}>
            <Route />
        </Suspense>
    );
}
