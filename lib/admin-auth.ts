const TOKEN_KEY = 'admin_session_token';

export function getSessionToken(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(TOKEN_KEY);
}

export function setSessionToken(token: string): void {
    sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearSessionToken(): void {
    sessionStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = {
        'X-Requested-With': 'mncoleman-admin',
        ...extra,
    };
    const token = getSessionToken();
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}
