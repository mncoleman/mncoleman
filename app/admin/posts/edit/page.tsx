'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { PostEditor } from '@/components/admin/PostEditor';
import { useAdmin } from '@/components/admin/admin-context';

// The slug rides in the query string: posts are created at runtime, so a static
// export has nothing for generateStaticParams to list. No slug means a new post.
function EditorForSlug() {
    const { workerUrl } = useAdmin();
    const slug = useSearchParams().get('slug') || '';
    if (slug && !/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(slug)) {
        return <p className="text-muted-foreground">That is not a valid post slug.</p>;
    }
    // Keyed so moving between posts remounts the sync engine instead of reusing its refs.
    return <PostEditor key={slug || 'new'} workerUrl={workerUrl} slug={slug} />;
}

export default function AdminPostEditPage() {
    return (
        <Suspense fallback={null}>
            <EditorForSlug />
        </Suspense>
    );
}
