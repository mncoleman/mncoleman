'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, RefreshCw, GitCommit, Database, LogOut } from 'lucide-react';

interface AdminDashboardProps {
    token: string;
    user: any;
    workerUrl: string;
    onLogout: () => void;
}

export function AdminDashboard({ token, user, workerUrl, onLogout }: AdminDashboardProps) {
    const [loading, setLoading] = useState<string | null>(null);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    const triggerAction = async (action: string, data: any = {}) => {
        setLoading(action);
        setResult(null);
        try {
            const res = await fetch(`${workerUrl}/api/trigger`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
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
        <div className="space-y-6 w-full max-w-4xl mx-auto p-4">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold">Admin Dashboard</h1>
                    <p className="text-muted-foreground">Welcome back, {user?.name || 'Admin'}</p>
                </div>
                <Button variant="outline" onClick={onLogout} className="gap-2">
                    <LogOut size={16} />
                    Logout
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Helper Cards */}
                <Card>
                    <CardHeader>
                        <CardTitle>Site Management</CardTitle>
                        <CardDescription>Control build and deployment</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Button
                            className="w-full justify-start gap-3"
                            onClick={() => triggerAction('github_dispatch', { event_type: 'rebuild_site' })}
                            disabled={loading !== null}
                        >
                            {loading === 'github_dispatch' ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                            Trigger Full Rebuild
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            Triggers a GitHub Actions workflow to rebuild and deploy the site.
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Content Sync</CardTitle>
                        <CardDescription>Update content from Notion</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Button
                            variant="secondary"
                            className="w-full justify-start gap-3"
                            onClick={() => triggerAction('github_dispatch', { event_type: 'sync_notion' })}
                            disabled={loading !== null}
                        >
                            {loading === 'sync_notion' ? <Loader2 className="animate-spin" /> : <Database />}
                            Sync & Deploy
                        </Button>
                        <p className="text-xs text-muted-foreground">
                            Fetches latest data from Notion and triggers a deploy.
                        </p>
                    </CardContent>
                </Card>
            </div>

            {result && (
                <div className={`p-4 rounded-md border ${result.success ? 'bg-green-500/10 border-green-500/20 text-green-600' : 'bg-red-500/10 border-red-500/20 text-red-600'}`}>
                    {result.message}
                </div>
            )}
        </div>
    );
}
