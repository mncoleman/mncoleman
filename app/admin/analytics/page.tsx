'use client';

import { AnalyticsPanel } from '@/components/admin/AnalyticsPanel';
import { useAdmin } from '@/components/admin/admin-context';

export default function AdminAnalyticsPage() {
    const { workerUrl } = useAdmin();
    return <AnalyticsPanel workerUrl={workerUrl} />;
}
