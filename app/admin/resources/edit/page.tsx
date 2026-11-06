'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CollectionEditor } from '@/components/admin/CollectionEditor';
import { useAdmin } from '@/components/admin/admin-context';

// The record's key rides in the query string: a static export has no per-record routes to list.
function EditorForId() {
    const { workerUrl } = useAdmin();
    const id = useSearchParams().get('id') || '';
    // Keyed so moving between records remounts the editor instead of reusing its state.
    return <CollectionEditor key={id} name="resources" id={id} workerUrl={workerUrl} />;
}

export default function AdminResourcesEditPage() {
    return (
        <Suspense fallback={null}>
            <EditorForId />
        </Suspense>
    );
}
