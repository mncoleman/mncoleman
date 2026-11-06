'use client';

import { PostsManager } from '@/components/admin/PostsManager';
import { useAdmin } from '@/components/admin/admin-context';

export default function AdminPostsPage() {
    const { workerUrl } = useAdmin();
    return <PostsManager workerUrl={workerUrl} />;
}
