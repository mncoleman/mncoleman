'use client';

import { LayoutDashboard, FileUp, Library, BarChart3, Users, FolderKanban, BookMarked } from 'lucide-react';
import { canUse, canSeeArtifacts, type AdminUser } from '@/components/admin/admin-context';

export interface AdminLink {
    href: string;
    label: string;
    icon: typeof Users;
    group: 'Content' | 'Site';
    allowed: (u: AdminUser) => boolean;
}

/** Every admin section, who may open it, and where it sits in the sidebar. */
export const ADMIN_LINKS: AdminLink[] = [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard, group: 'Content', allowed: () => true },
    { href: '/admin/projects', label: 'Projects', icon: FolderKanban, group: 'Content', allowed: (u) => canUse(u, 'content') },
    { href: '/admin/resources', label: 'Resources', icon: BookMarked, group: 'Content', allowed: (u) => canUse(u, 'content') },
    { href: '/admin/artifacts', label: 'Artifacts', icon: FileUp, group: 'Content', allowed: canSeeArtifacts },
    { href: '/admin/library', label: 'AI Library', icon: Library, group: 'Content', allowed: (u) => canUse(u, 'library') },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, group: 'Site', allowed: (u) => canUse(u, 'analytics') },
    { href: '/admin/users', label: 'Users', icon: Users, group: 'Site', allowed: (u) => u.role === 'super_admin' },
];

/**
 * The admin routes and who may open them, for the layout's direct-URL guard.
 * `/admin/content` is the pre-split URL for projects + resources; it only redirects now.
 */
export const ADMIN_ROUTES = [
    ...ADMIN_LINKS.map(({ href, allowed }) => ({ href, allowed })),
    { href: '/admin/content', allowed: (u: AdminUser) => canUse(u, 'content') },
];

/** trailingSlash: true means pathname arrives as '/admin/' or '/admin/projects/'. */
export function normalizeAdminPath(pathname: string): string {
    return pathname.replace(/\/$/, '') || '/admin';
}

/** The sidebar entry a pathname belongs to; sub-routes (e.g. /admin/artifacts/edit) map to their parent. */
export function activeLink(pathname: string): AdminLink | undefined {
    const current = normalizeAdminPath(pathname);
    return ADMIN_LINKS
        .filter((l) => current === l.href || (l.href !== '/admin' && current.startsWith(`${l.href}/`)))
        .sort((a, b) => b.href.length - a.href.length)[0];
}
