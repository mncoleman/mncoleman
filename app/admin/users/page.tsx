'use client';

import { UserManagement } from '@/components/admin/UserManagement';
import { useAdmin } from '@/components/admin/admin-context';

export default function AdminUsersPage() {
    const { user, workerUrl } = useAdmin();

    // The nav hides this tab for non-super-admins; this guards a direct URL hit.
    // It is a UX guard only — the Worker is the real gate on every /api/users call.
    if (user?.role !== 'super_admin') {
        return (
            <p className="text-muted-foreground">
                You need super-admin access to manage users.
            </p>
        );
    }

    return <UserManagement workerUrl={workerUrl} />;
}
