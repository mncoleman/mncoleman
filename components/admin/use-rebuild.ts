'use client';

import { useCallback, useState } from 'react';
import { authHeaders } from '@/lib/admin-auth';
import { useAdmin } from '@/components/admin/admin-context';
import { useDeploy } from '@/components/admin/deploy-status';

/**
 * Fires the Pages deploy hook through the Worker, for content that only arrives
 * at build time (blog posts and the resume, from Notion). The deploy pill then
 * tracks it like a publish.
 */
export function useRebuild() {
    const { workerUrl } = useAdmin();
    const { run, start } = useDeploy();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const trigger = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`${workerUrl}/api/trigger`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'include',
                body: JSON.stringify({ action: 'github_dispatch', data: { event_type: 'rebuild_site' } }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(json.error || res.statusText);
            start('rebuild');
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Rebuild failed');
        } finally {
            setBusy(false);
        }
    }, [workerUrl, start]);

    const deploying = run?.state === 'running' || run?.state === 'slow';
    return { trigger, busy: busy || deploying, error };
}
