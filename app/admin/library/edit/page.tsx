'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { LibraryEditor } from '@/components/admin/LibraryEditor';
import { useAdmin } from '@/components/admin/admin-context';

// The item's slug rides in the query string (a static export has no per-item routes); no slug starts a new one.
function EditorForSlug() {
    const { workerUrl } = useAdmin();
    const slug = useSearchParams().get('slug') || undefined;
    return <LibraryEditor key={slug || 'new'} workerUrl={workerUrl} slug={slug} />;
}

export default function AdminLibraryEditPage() {
    return (
        <Suspense fallback={null}>
            <EditorForSlug />
        </Suspense>
    );
}
