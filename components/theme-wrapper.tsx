'use client';

import { usePathname } from 'next/navigation';
import { ReactNode } from 'react';

export function ThemeWrapper({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const isAlwaysDark = pathname === '/' || pathname === '/brand-kit';

    return (
        <div className={isAlwaysDark ? 'dark' : ''}>
            <div className={`${isAlwaysDark ? 'bg-transparent' : 'bg-background'} text-foreground transition-colors duration-300`}>
                {children}
            </div>
        </div>
    );

}
