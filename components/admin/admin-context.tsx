'use client';

import { createContext, useContext } from 'react';

export type AdminFeature = 'artifacts' | 'content' | 'library' | 'visitors' | 'analytics' | 'rebuild';

export const FEATURE_LABELS: Record<AdminFeature, string> = {
    artifacts: 'Artifacts (all, incl. upload/delete)',
    content: 'Content (resources + projects)',
    library: 'AI Library',
    visitors: 'Visitors',
    analytics: 'Analytics',
    rebuild: 'Rebuild site',
};

export interface AdminUser {
    id?: string;
    username?: string;
    name?: string;
    /** super_admin (owner) · site_admin (everything) · editor (ticked features + granted artifacts) */
    role?: string;
    email?: string | null;
    provider?: 'telegram' | 'google';
    features?: AdminFeature[];
    artifactGrants?: string[];
}

/**
 * Mirrors the Worker's hasFeature(). A UX guard only — the Worker and the
 * artifact service are the real gates.
 */
export function canUse(user: AdminUser | null | undefined, feature: AdminFeature): boolean {
    if (!user) return false;
    if (user.role === 'super_admin' || user.role === 'site_admin' || user.role === 'admin') return true;
    return !!user.features?.includes(feature);
}

/** Sees the Artifacts tab: every artifact, or at least one granted one. */
export function canSeeArtifacts(user: AdminUser | null | undefined): boolean {
    return canUse(user, 'artifacts') || (user?.artifactGrants?.length ?? 0) > 0;
}

/** May set an artifact's visibility or password. */
export function canManageSecrets(user: AdminUser | null | undefined): boolean {
    return user?.role === 'super_admin' || user?.role === 'site_admin' || user?.role === 'admin';
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
