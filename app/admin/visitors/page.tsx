'use client';

import { VisitorManager } from '@/components/admin/VisitorManager';
import { useAdmin } from '@/components/admin/admin-context';

export default function AdminVisitorsPage() {
    const { workerUrl } = useAdmin();
    return <VisitorManager workerUrl={workerUrl} />;
}
