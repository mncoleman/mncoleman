'use client';

import { createContext, useContext } from 'react';

export interface AdminUser {
    id?: string;
    username?: string;
    name?: string;
    role?: string;
}

interface AdminContextValue {
    user: AdminUser;
    workerUrl: string;
    logout: () => void;
}

const AdminContext = createContext<AdminContextValue | null>(null);

export const AdminProvider = AdminContext.Provider;

/**
 * Session state lives in `app/admin/layout.tsx`, which App Router keeps mounted
 * across navigations between admin subpages — so this never re-checks the session
 * or flashes the login gate when you switch tabs.
 */
export function useAdmin(): AdminContextValue {
    const ctx = useContext(AdminContext);
    if (!ctx) throw new Error('useAdmin must be used inside the admin layout');
    return ctx;
}
