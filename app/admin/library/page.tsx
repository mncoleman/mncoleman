'use client';

import { LibraryManager } from '@/components/admin/LibraryManager';
import { useAdmin } from '@/components/admin/admin-context';

export default function AdminLibraryPage() {
    const { workerUrl } = useAdmin();
    return <LibraryManager workerUrl={workerUrl} />;
}
