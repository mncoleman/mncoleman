'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, LogOut } from 'lucide-react';
import { ArtifactUploader } from './ArtifactUploader';
import { LibraryManager } from './LibraryManager';
import { VisitorManager } from './VisitorManager';
import { UserManagement } from './UserManagement';
import { authHeaders } from '@/lib/admin-auth';

interface AdminDashboardProps {
    user: any;
    workerUrl: string;
    onLogout: () => void;
}

export function AdminDashboard({ user, workerUrl, onLogout }: AdminDashboardProps) {
    const [loading, setLoading] = useState<string | null>(null);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    const triggerAction = async (action: string, data: any = {}) => {
        setLoading(action);
        setResult(null);
        try {
            const res = await fetch(`${workerUrl}/api/trigger`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'include',
                body: JSON.stringify({ action, data })
            });

            const json = await res.json();

            if (res.ok) {
                setResult({ success: true, message: 'Action triggered successfully' });
            } else {
                setResult({ success: false, message: `Error: ${json.error || res.statusText}` });
            }
        } catch (e: any) {
            setResult({ success: false, message: `Network Error: ${e.message}` });
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className="w-full max-w-4xl lg:max-w-6xl mx-auto p-4">
            <div className="mb-8 space-y-4">
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
                        <p className="text-muted-foreground">Welcome back, {user?.name || 'Admin'}</p>
                    </div>
                    <Button variant="outline" onClick={onLogout} className="gap-2 shrink-0 ml-4">
                        <LogOut size={16} />
                        Logout
                    </Button>
                </div>
                <Button
                    variant="outline"
                    onClick={() => triggerAction('github_dispatch', { event_type: 'rebuild_site' })}
                    disabled={loading !== null}
                    className="gap-2 w-full sm:w-auto"
                >
                    {loading === 'github_dispatch' ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                    Rebuild Site
                </Button>
            </div>

            {result && (
                <div className={`mb-6 p-4 rounded-md border ${result.success ? 'bg-green-500/10 border-green-500/20 text-green-600' : 'bg-red-500/10 border-red-500/20 text-red-600'}`}>
                    {result.message}
                </div>
            )}

            <ArtifactUploader workerUrl={workerUrl} />
            <LibraryManager workerUrl={workerUrl} />
            <VisitorManager workerUrl={workerUrl} />

            {user?.role === 'super_admin' && (
                <div className="mt-6">
                    <UserManagement workerUrl={workerUrl} />
                </div>
            )}
        </div>
    );
}
