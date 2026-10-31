'use client';

import { CollectionManager } from '@/components/admin/CollectionManager';
import { useAdmin } from '@/components/admin/admin-context';

export default function AdminProjectsPage() {
    const { workerUrl } = useAdmin();
    return <CollectionManager name="projects" workerUrl={workerUrl} />;
}
