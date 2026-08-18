'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { LayoutPanelTopIcon, type LayoutPanelTopIconHandle } from '@/components/ui/layout-panel-top';
import { GithubIcon, type GithubIconHandle } from '@/components/ui/github';
import { CpuIcon, type CpuIconHandle } from '@/components/ui/cpu';
import { SoundToggle } from '@/components/sound-toggle';

const buttonClass =
    'group inline-flex items-center gap-2 px-4 py-2 rounded-full border border-border/50 bg-background/40 backdrop-blur-sm hover:border-primary/40 hover:bg-background/70 hover:text-foreground text-muted-foreground transition-all duration-200 text-sm font-medium';

export function FooterButtons() {
    const brandRef = useRef<LayoutPanelTopIconHandle>(null);
    const repoRef = useRef<GithubIconHandle>(null);
    const adminRef = useRef<CpuIconHandle>(null);

    return (
        <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
                href="/brand-kit"
                className={buttonClass}
                onMouseEnter={() => brandRef.current?.startAnimation()}
                onMouseLeave={() => brandRef.current?.stopAnimation()}
            >
                <LayoutPanelTopIcon ref={brandRef} size={16} />
                Brand Kit
            </Link>
            <a
                href="https://github.com/mncoleman/mncoleman"
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClass}
                onMouseEnter={() => repoRef.current?.startAnimation()}
                onMouseLeave={() => repoRef.current?.stopAnimation()}
            >
                <GithubIcon ref={repoRef} size={16} />
                Repository
            </a>
            <Link
                href="/admin"
                className={buttonClass}
                onMouseEnter={() => adminRef.current?.startAnimation()}
                onMouseLeave={() => adminRef.current?.stopAnimation()}
            >
                <CpuIcon ref={adminRef} size={16} />
                Admin
            </Link>
            <SoundToggle className={buttonClass} />
        </div>
    );
}
