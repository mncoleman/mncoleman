'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, LogOut } from 'lucide-react';
import { TelegramLoginButton } from '@/components/admin/TelegramLoginButton';
import { AdminNav } from '@/components/admin/AdminNav';
import { AdminProvider, type AdminUser } from '@/components/admin/admin-context';
import { setSessionToken, clearSessionToken, authHeaders } from '@/lib/admin-auth';

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:8787';

/**
 * Owns admin session state for every /admin/* route. App Router does not remount a
 * layout when navigating between its children, so the session check below runs once
 * per hard load — switching tabs re-renders only the page, with no refetch and no
 * flash of the login gate.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<{ user: AdminUser } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Check for session token from OIDC callback (URL fragment for mobile compatibility).
        // The Worker always redirects back to /admin itself, but this lives in the layout so
        // it runs regardless of which admin route is mounted.
        const hash = window.location.hash;
        if (hash.includes('session_token=')) {
            const token = hash.split('session_token=')[1];
            if (token) {
                setSessionToken(token);
            }
            window.history.replaceState({}, '', window.location.pathname);
        }

        // Check for auth error from OIDC callback redirect
        const params = new URLSearchParams(window.location.search);
        const authError = params.get('auth_error');
        if (authError) {
            const messages: Record<string, string> = {
                missing_params: 'Authentication was interrupted.',
                expired_session: 'Login session expired. Please try again.',
                invalid_state: 'Invalid login session. Please try again.',
                token_exchange_failed: 'Authentication failed. Please try again.',
                invalid_token: 'Invalid authentication response.',
                unauthorized: 'You are not authorized to access this area.',
            };
            setError(messages[authError] || 'Authentication failed.');
            window.history.replaceState({}, '', window.location.pathname);
        }

        // Check for existing session via cookie or stored token
        const checkSession = async () => {
            try {
                const res = await fetch(`${WORKER_URL}/auth/me`, {
                    credentials: 'include',
                    headers: authHeaders(),
                });

                if (res.ok) {
                    const data = await res.json();
                    setSession({ user: data.user });
                    setError(null);
                }
            } catch (e) {
                console.error('Session check failed', e);
            } finally {
                setLoading(false);
            }
        };
        checkSession();
    }, []);

    const handleLogout = async () => {
        try {
            await fetch(`${WORKER_URL}/auth/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: authHeaders(),
            });
        } catch (e) {
            console.error('Logout failed', e);
        }
        clearSessionToken();
        setSession(null);
    };

    if (loading) {
        return (
            <div className="flex h-[50vh] w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!session) {
        return (
            <div className="container mx-auto px-4 py-20 flex flex-col items-center min-h-[80vh]">
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

                    <TelegramLoginButton workerUrl={WORKER_URL} />
                </div>
            </div>
        );
    }

    return (
        <AdminProvider value={{ user: session.user, workerUrl: WORKER_URL, logout: handleLogout }}>
            <div className="container mx-auto px-4 py-20 min-h-[80vh]">
                <div className="w-full max-w-4xl lg:max-w-6xl mx-auto">
                    <div className="mb-8 flex justify-between items-start">
                        <div>
                            <h1 className="text-3xl font-bold">Admin</h1>
                            <p className="text-muted-foreground">
                                Welcome back, {session.user?.name || 'Admin'}
                            </p>
                        </div>
                        <Button variant="outline" onClick={handleLogout} className="gap-2 shrink-0 ml-4">
                            <LogOut size={16} />
                            Logout
                        </Button>
                    </div>

                    <AdminNav role={session.user?.role} />

                    {children}
                </div>
            </div>
        </AdminProvider>
    );
}
