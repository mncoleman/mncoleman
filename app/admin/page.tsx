'use client';

import { useEffect, useState } from 'react';
import { TelegramLoginButton } from '@/components/admin/TelegramLoginButton';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { Loader2 } from 'lucide-react';
import { setSessionToken, clearSessionToken, authHeaders } from '@/lib/admin-auth';

const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL || 'http://localhost:8787';

export default function AdminPage() {
    const [session, setSession] = useState<{ user: any } | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Check for session token from OIDC callback (URL fragment for mobile compatibility)
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
                    headers: authHeaders()
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
                headers: authHeaders()
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

    return (
        <div className="container mx-auto px-4 py-20 flex flex-col items-center min-h-[80vh]">
            {session ? (
                <AdminDashboard
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

                    <TelegramLoginButton workerUrl={WORKER_URL} />
                </div>
            )}
        </div>
    );
}
