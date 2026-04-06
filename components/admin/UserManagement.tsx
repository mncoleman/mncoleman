'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, UserPlus, Trash2, Shield, Clock } from 'lucide-react';
import { authHeaders } from '@/lib/admin-auth';

interface UserManagementProps {
    workerUrl: string;
}

interface AdminUser {
    username: string;
    sub: string | null;
    firstName: string | null;
    status: 'invited' | 'active';
    role: string;
    invitedAt: string;
    claimedAt: string | null;
}

export function UserManagement({ workerUrl }: UserManagementProps) {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [username, setUsername] = useState('');
    const [inviting, setInviting] = useState(false);
    const [removing, setRemoving] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${workerUrl}/api/users`, {
                headers: authHeaders(),
                credentials: 'include',
            });
            if (res.ok) {
                const data = await res.json();
                setUsers(data.users || []);
            }
        } catch {
            // Silently fail
        } finally {
            setLoading(false);
        }
    };

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) return;

        setInviting(true);
        setMessage(null);

        try {
            const res = await fetch(`${workerUrl}/api/users`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'include',
                body: JSON.stringify({ username: username.trim() }),
            });

            if (!res.ok) {
                const text = await res.text();
                throw new Error(text || 'Failed to invite user');
            }

            const data = await res.json();
            setUsers(prev => [...prev, data.user]);
            setUsername('');
            setMessage({ type: 'success', text: `Invited @${data.user.username}` });
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setInviting(false);
        }
    };

    const handleRemove = async (uname: string) => {
        setRemoving(uname);
        setMessage(null);

        try {
            const res = await fetch(`${workerUrl}/api/users?username=${encodeURIComponent(uname)}`, {
                method: 'DELETE',
                headers: authHeaders(),
                credentials: 'include',
            });

            if (!res.ok) {
                throw new Error('Failed to remove user');
            }

            setUsers(prev => prev.filter(u => u.username !== uname));
            setMessage({ type: 'success', text: `Removed @${uname}` });
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setRemoving(null);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>User Management</CardTitle>
                <CardDescription>Invite users by Telegram username. They can log in once invited.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <form onSubmit={handleInvite} className="flex gap-2">
                    <Input
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="@username"
                        className="flex-1"
                    />
                    <Button type="submit" disabled={inviting || !username.trim()} className="gap-2 shrink-0">
                        {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                        Invite
                    </Button>
                </form>

                {message && (
                    <div className={`p-3 rounded text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                        {message.text}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                        <Loader2 className="animate-spin h-4 w-4" /> Loading...
                    </div>
                ) : (
                    <div className="space-y-2">
                        {users.map((user) => (
                            <div
                                key={user.username}
                                className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-background/50"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    {user.role === 'super_admin' ? (
                                        <Shield className="h-4 w-4 text-primary shrink-0" />
                                    ) : user.status === 'invited' ? (
                                        <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                                    ) : (
                                        <div className="h-4 w-4 shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium">
                                            @{user.username}
                                            {user.firstName && <span className="text-muted-foreground font-normal ml-2">{user.firstName}</span>}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {user.role === 'super_admin' ? 'Owner' :
                                             user.status === 'invited' ? 'Invited' : 'Active'}
                                        </p>
                                    </div>
                                </div>
                                {user.role !== 'super_admin' && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleRemove(user.username)}
                                        disabled={removing === user.username}
                                        className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                                    >
                                        {removing === user.username ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-3.5 w-3.5" />
                                        )}
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
