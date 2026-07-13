'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, RefreshCw, FileUp, Library, MapPin, BarChart3 } from 'lucide-react';
import { useAdmin } from '@/components/admin/admin-context';
import { authHeaders } from '@/lib/admin-auth';

const SHORTCUTS = [
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, description: 'Traffic, top pages and referrers from GA4.' },
    { href: '/admin/artifacts', label: 'Artifacts', icon: FileUp, description: 'Upload and manage hosted artifacts.' },
    { href: '/admin/library', label: '"A"I Library', icon: Library, description: 'Publish prompts and skills.' },
    { href: '/admin/visitors', label: 'Visitors', icon: MapPin, description: 'Moderate the visitor globe guestbook.' },
];

export default function AdminOverviewPage() {
    const { workerUrl } = useAdmin();
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    const rebuild = async () => {
        setLoading(true);
        setResult(null);
        try {
            const res = await fetch(`${workerUrl}/api/trigger`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'include',
                body: JSON.stringify({ action: 'github_dispatch', data: { event_type: 'rebuild_site' } }),
            });
            const json = await res.json();
            if (res.ok) {
                setResult({ success: true, message: 'Rebuild triggered. The site updates in a few minutes.' });
            } else {
                setResult({ success: false, message: `Error: ${json.error || res.statusText}` });
            }
        } catch (e: unknown) {
            setResult({ success: false, message: `Network Error: ${e instanceof Error ? e.message : 'unknown'}` });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Rebuild Site</CardTitle>
                    <CardDescription>
                        Notion content is pulled at build time, so new posts, resources and projects
                        only appear after a rebuild.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Button variant="outline" onClick={rebuild} disabled={loading} className="gap-2 w-full sm:w-auto">
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Rebuild Site
                    </Button>

                    {result && (
                        <div
                            className={`p-4 rounded-md border text-sm ${
                                result.success
                                    ? 'bg-green-500/10 border-green-500/20 text-green-600'
                                    : 'bg-red-500/10 border-red-500/20 text-red-600'
                            }`}
                        >
                            {result.message}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
                {SHORTCUTS.map(({ href, label, icon: Icon, description }) => (
                    <Link key={href} href={href}>
                        <Card className="h-full transition-colors hover:border-foreground/30">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg">
                                    <Icon size={18} />
                                    {label}
                                </CardTitle>
                                <CardDescription>{description}</CardDescription>
                            </CardHeader>
                        </Card>
                    </Link>
                ))}
            </div>
        </div>
    );
}
