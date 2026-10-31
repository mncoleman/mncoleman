'use client';

import { CollectionManager } from '@/components/admin/CollectionManager';
import { useAdmin } from '@/components/admin/admin-context';

export default function AdminResourcesPage() {
    const { workerUrl } = useAdmin();
    return <CollectionManager name="resources" workerUrl={workerUrl} />;
}
