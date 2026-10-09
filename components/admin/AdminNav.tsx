'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileUp, Library, BarChart3, Users, FolderKanban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { canUse, canSeeArtifacts, type AdminUser } from '@/components/admin/admin-context';

const LINKS: { href: string; label: string; icon: typeof Users; allowed: (u: AdminUser) => boolean }[] = [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard, allowed: () => true },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3, allowed: (u) => canUse(u, 'analytics') },
    { href: '/admin/content', label: 'Content', icon: FolderKanban, allowed: (u) => canUse(u, 'content') },
    { href: '/admin/artifacts', label: 'Artifacts', icon: FileUp, allowed: canSeeArtifacts },
    { href: '/admin/library', label: 'AI Library', icon: Library, allowed: (u) => canUse(u, 'library') },
    { href: '/admin/users', label: 'Users', icon: Users, allowed: (u) => u.role === 'super_admin' },
];

/** The admin routes and who may open them, for the layout's direct-URL guard. */
export const ADMIN_ROUTES = LINKS.map(({ href, allowed }) => ({ href, allowed }));

export function AdminNav({ user }: { user: AdminUser }) {
    const pathname = usePathname();
    // trailingSlash: true means pathname arrives as '/admin/' or '/admin/analytics/'.
    const current = pathname.replace(/\/$/, '') || '/admin';

    return (
        <nav className="mb-8 overflow-x-auto">
            <div className="flex gap-1 border-b border-border/40 min-w-max">
                {LINKS.filter((l) => l.allowed(user)).map(
                    ({ href, label, icon: Icon }) => {
                        const active = current === href;
                        return (
                            <Link
                                key={href}
                                href={href}
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                                    active
                                        ? 'border-foreground text-foreground'
                                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                                )}
                            >
                                <Icon size={16} />
                                {label}
                            </Link>
                        );
                    }
                )}
            </div>
        </nav>
    );
}
