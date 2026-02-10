'use client';

import { useEffect, useState } from 'react';
import { TelegramLoginButton } from '@/components/admin/TelegramLoginButton';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { Loader2 } from 'lucide-react';

// Configuration - These should be in environment variables ideally
// But as this is a static site + worker, we can hardcode the worker URL if needed, 
// or use NEXT_PUBLIC_ env vars.
const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:8787';
const BOT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME || 'YOUR_BOT_NAME_HERE';

export default function AdminPage() {
    const [session, setSession] = useState<{ token: string; user: any } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Check for existing session via /auth/me check
        const checkSession = async () => {
            try {
                const res = await fetch(`${WORKER_URL}/auth/me`, {
                    credentials: 'include',
                    headers: { 'X-Requested-With': 'mncoleman-admin' }
                });
                if (res.ok) {
                    const data = await res.json();
                    setSession({ user: data.user, token: 'cookie-managed' });
                } else {
                    // Fallback to localStorage for user profile meta if any (optional)
                    const stored = localStorage.getItem('admin_user');
                    if (stored) {
                        try {
                            const user = JSON.parse(stored);
                            setSession({ user, token: 'cookie-managed' });
                        } catch (e) {
                            localStorage.removeItem('admin_user');
                        }
                    }
                }
            } catch (e) {
                console.error('Session check failed', e);
            } finally {
                setLoading(false);
            }
        };
        checkSession();
    }, []);

    const handleLogin = async (user: any) => {
        setLoading(true);
        setError(null);

        try {
            const res = await fetch(`${WORKER_URL}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'mncoleman-admin'
                },
                body: JSON.stringify(user),
                credentials: 'include', // Important for Set-Cookie
            });

            if (!res.ok) {
                throw new Error('Authentication failed');
            }

            const data = await res.json();
            // Store only non-sensitive user profile in localStorage for speed
            localStorage.setItem('admin_user', JSON.stringify(data.user));
            setSession({ user: data.user, token: 'cookie-managed' });
        } catch (err) {
            setError('Failed to log in. You may not be authorized.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await fetch(`${WORKER_URL}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'X-Requested-With': 'mncoleman-admin' }
            });
        } catch (e) {
            console.error('Logout failed', e);
        }
        localStorage.removeItem('admin_user');
        setSession(null);
    };

    if (loading) {
        return (
            <div className="flex h-[50vh] w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="container py-20 flex flex-col items-center min-h-[80vh]">
            {session ? (
                <AdminDashboard
                    token={session.token}
                    user={session.user}
                    workerUrl={WORKER_URL}
                    onLogout={handleLogout}
                />
            ) : (
                <div className="w-full max-w-md space-y-8">
                    <div className="text-center">
                        <h1 className="text-4xl font-bold tracking-tight">Admin Portal</h1>
                        <p className="mt-2 text-muted-foreground">Authorized personnel only.</p>
                    </div>

                    {error && (
                        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md text-center">
                            {error}
                        </div>
                    )}

                    <TelegramLoginButton
                        botName={BOT_NAME}
                        onAuth={handleLogin}
                    />
                </div>
            )}
        </div>
    );
}
