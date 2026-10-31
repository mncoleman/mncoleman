'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LineSidebar from '@/components/ui/line-sidebar';
import { SiteMetricsDialog } from '@/components/site-metrics-dialog';
import { MCP_URL } from '@/components/footer-mcp';
import { buildInfo } from '@/lib/build-info';

const BRAND_BLUE = '#3b82f6';

type Entry = { label: string; run: () => void; href?: string; external?: boolean };

/**
 * The footer's small links as a ReactBits LineSidebar on the left: ticks and labels
 * lean towards the pointer and light up in brand blue. Each entry is an action, not
 * just a route — the MCP one copies its URL, the stats one opens the metrics dialog.
 *
 * LineSidebar's items are clickable list items, not links, so they cannot be tabbed
 * to. The same entries are repeated as real links/buttons in an sr-only list, which
 * is what keyboards, screen readers and crawlers use.
 */
export function FooterLinks() {
    const router = useRouter();
    const [statsOpen, setStatsOpen] = useState(false);
    const [mcpCopied, setMcpCopied] = useState(false);
    // Reset the "copied" label after a beat; an effect rather than a stored timer ref.
    useEffect(() => {
        if (!mcpCopied) return;
        const t = setTimeout(() => setMcpCopied(false), 1800);
        return () => clearTimeout(t);
    }, [mcpCopied]);

    const copyMcp = () => {
        try {
            void navigator.clipboard?.writeText(MCP_URL);
        } catch {
            /* clipboard unavailable: the URL is still in the title */
        }
        setMcpCopied(true);
    };

    const entries: Entry[] = [
        { label: 'Privacy Policy', href: '/privacy', run: () => router.push('/privacy') },
        { label: 'Terms of Service', href: '/terms', run: () => router.push('/terms') },
        { label: mcpCopied ? 'MCP URL copied' : 'MCP Server', run: copyMcp },
        { label: 'Admin', href: '/admin', run: () => router.push('/admin') },
        ...(buildInfo.commit.short
            ? [{
                  label: `Commit ${buildInfo.commit.short}`,
                  href: buildInfo.commit.url,
                  external: true,
                  run: () => window.open(buildInfo.commit.url, '_blank', 'noopener,noreferrer'),
              }]
            : []),
        ...(buildInfo.commits ? [{ label: 'Site stats', run: () => setStatsOpen(true) }] : []),
    ];

    return (
        <div data-print-hide className="text-left">
            <div aria-hidden="true">
                <LineSidebar
                    items={entries.map((e) => e.label)}
                    accentColor={BRAND_BLUE}
                    textColor="hsl(var(--muted-foreground))"
                    markerColor="hsl(var(--muted-foreground))"
                    fontSize={0.8}
                    itemGap={8}
                    markerLength={28}
                    maxShift={12}
                    proximityRadius={56}
                    onItemClick={(i) => entries[i]?.run()}
                />
            </div>
            <ul className="sr-only">
                {entries.map((e) => (
                    <li key={e.label}>
                        {e.href ? (
                            <a href={e.href} {...(e.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>{e.label}</a>
                        ) : (
                            <button type="button" onClick={e.run}>{e.label}</button>
                        )}
                    </li>
                ))}
            </ul>
            <SiteMetricsDialog info={buildInfo} open={statsOpen} onClose={() => setStatsOpen(false)} />
        </div>
    );
}
