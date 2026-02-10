'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save } from 'lucide-react';

interface ContentEditorProps {
    token: string;
    workerUrl: string;
}

export function ContentEditor({ token, workerUrl }: ContentEditorProps) {
    const [content, setContent] = useState<any>(null);
    const [sha, setSha] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    useEffect(() => {
        fetchContent();
    }, []);

    const fetchContent = async () => {
        setLoading(true);
        try {
            const headers: Record<string, string> = {
                'X-Requested-With': 'mncoleman-admin'
            };
            if (token && token !== 'cookie-managed') {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const res = await fetch(`${workerUrl}/api/content`, {
                headers,
                credentials: 'include'
            });

            if (!res.ok) {
                try {
                    const errData = await res.json();
                    throw new Error(errData.error || 'Failed to fetch content');
                } catch (parseError) {
                    throw new Error('Failed to fetch content (Status: ' + res.status + ')');
                }
            }

            const data = await res.json();
            setContent(JSON.parse(data.content));
            setSha(data.sha);
        } catch (e: any) {
            console.error('Content fetch error:', e);
            setMessage({ type: 'error', text: e.message });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage(null);

        try {
            const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                'X-Requested-With': 'mncoleman-admin'
            };
            if (token && token !== 'cookie-managed') {
                headers['Authorization'] = `Bearer ${token}`;
            }

            const res = await fetch(`${workerUrl}/api/content`, {
                method: 'POST',
                headers,
                credentials: 'include',
                body: JSON.stringify({
                    content: JSON.stringify(content, null, 2),
                    sha,
                    message: 'Update About Me content via Admin Dashboard'
                })
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(errText || 'Failed to update');
            }

            setMessage({ type: 'success', text: 'Content updated successfully! A build will be triggered automatically.' });
            // Refresh to get new SHA
            await fetchContent();
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (key: string, value: string) => {
        setContent((prev: any) => ({ ...prev, [key]: value }));
    };


    if (loading) return <Card className="mt-8"><CardContent className="pt-6 flex items-center justify-center gap-2 text-muted-foreground"><Loader2 className="animate-spin h-4 w-4" /> Loading content...</CardContent></Card>;

    if (!content) {
        if (message) {
            return (
                <Card className="mt-8 border-destructive/20 bg-destructive/5">
                    <CardHeader>
                        <CardTitle className="text-destructive">Error Loading Content</CardTitle>
                        <CardDescription>{message.text}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={fetchContent} variant="outline" size="sm">Retry</Button>
                    </CardContent>
                </Card>
            );
        }
        return null;
    }

    return (
        <Card className="mt-8">
            <CardHeader>
                <CardTitle>Edit "About Me" Content</CardTitle>
                <CardDescription>Changes will trigger a site rebuild and take a few minutes to appear.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSave} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="intro">Introduction</Label>
                        <Textarea
                            id="intro"
                            value={content.introduction || ''}
                            onChange={(e) => handleChange('introduction', e.target.value)}
                            rows={3}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="whatIDo">What I Do</Label>
                        <Textarea
                            id="whatIDo"
                            value={content.whatIDo || ''}
                            onChange={(e) => handleChange('whatIDo', e.target.value)}
                            rows={3}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="website">This Website</Label>
                        <Textarea
                            id="website"
                            value={content.thisWebsite || ''}
                            onChange={(e) => handleChange('thisWebsite', e.target.value)}
                            rows={3}
                        />
                    </div>

                    {message && (
                        <div className={`p-3 rounded text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {message.text}
                        </div>
                    )}

                    <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Changes
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
