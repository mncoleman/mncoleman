'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileUp, Library, MapPin, BarChart3, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const LINKS = [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/admin/artifacts', label: 'Artifacts', icon: FileUp },
    { href: '/admin/library', label: '"A"I Library', icon: Library },
    { href: '/admin/visitors', label: 'Visitors', icon: MapPin },
    { href: '/admin/users', label: 'Users', icon: Users, superAdminOnly: true },
];

export function AdminNav({ role }: { role?: string }) {
    const pathname = usePathname();
    // trailingSlash: true means pathname arrives as '/admin/' or '/admin/analytics/'.
    const current = pathname.replace(/\/$/, '') || '/admin';

    return (
        <nav className="mb-8 overflow-x-auto">
            <div className="flex gap-1 border-b border-border/40 min-w-max">
                {LINKS.filter((l) => !l.superAdminOnly || role === 'super_admin').map(
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
