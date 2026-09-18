'use client';

import { CollectionManager } from '@/components/admin/CollectionManager';
import { useAdmin } from '@/components/admin/admin-context';

export default function AdminContentPage() {
    const { workerUrl } = useAdmin();
    return <CollectionManager workerUrl={workerUrl} />;
}
