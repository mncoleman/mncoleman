'use client';

import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState, useSyncExternalStore } from 'react';
import FolderFloat from '@/components/ui/FolderFloat';
import { SiteMetricsDialog } from '@/components/site-metrics-dialog';
import { MCP_URL } from '@/components/footer-mcp';
import { buildInfo } from '@/lib/build-info';

const REPO_URL = 'https://github.com/mncoleman/mncoleman';

/**
 * Each paper in the folder. `href` papers navigate; `action` papers run something
 * instead (copy the MCP URL, open the stats dialog). `key` is the pill's value.
 */
type Paper = { key: string; title: string; description: string; href?: string; external?: boolean; action?: 'mcp' | 'stats' };

const PAPERS: Paper[] = [
    { key: 'terms', title: 'Terms', description: 'Terms of Service', href: '/terms' },
    { key: 'privacy', title: 'Privacy', description: 'Privacy Policy', href: '/privacy' },
    { key: 'repo', title: 'Repository', description: 'Source on GitHub', href: REPO_URL, external: true },
    { key: 'brand', title: 'Brand Kit', description: 'Colours, type, components', href: '/brand-kit' },
    { key: 'mcp', title: 'MCP Server', description: 'Copy the MCP server URL', action: 'mcp' },
    { key: 'admin', title: 'Admin', description: 'Admin', href: '/admin' },
    ...(buildInfo.commit.short
        ? [{ key: 'commit', title: `Commit ${buildInfo.commit.short}`, description: `Commit ${buildInfo.commit.short}`, href: buildInfo.commit.url, external: true }]
        : []),
    ...(buildInfo.commits ? [{ key: 'stats', title: 'Site stats', description: 'Site stats', action: 'stats' as const }] : []),
];

// A real hover-capable pointer. Phones and tablets have neither, and Folder ignores
// touch pointers for hover, so there the folder opens on tap instead.
const HOVER_QUERY = '(hover: hover) and (pointer: fine)';
const subscribeHover = (cb: () => void) => {
    const mq = window.matchMedia(HOVER_QUERY);
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
};

/**
 * The footer's "Navigation" folder (ReactBits FolderFloat): opens on hover (on tap without a hover pointer)
 * and floats a pill per link above it. A pill navigates on click or tap; dragging one around does not.
 * The component lives in `components/ui/FolderFloat.tsx` with one local change, a short close delay so
 * crossing the gaps between pills does not collapse it.
 *
 * The folder is pointer-and-keyboard UI drawn by the component; the same
 * destinations are also plain links/buttons in an sr-only list, so a screen reader
 * or a crawler never depends on the animation.
 */
export function FooterFolder() {
    const router = useRouter();
    const { resolvedTheme } = useTheme();
    // resolvedTheme is undefined on the server and on the first client render.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const canHover = useSyncExternalStore(subscribeHover, () => window.matchMedia(HOVER_QUERY).matches, () => true);
    const [statsOpen, setStatsOpen] = useState(false);
    const [mcpCopied, setMcpCopied] = useState(false);
    useEffect(() => {
        if (!mcpCopied) return;
        const t = setTimeout(() => setMcpCopied(false), 1800);
        return () => clearTimeout(t);
    }, [mcpCopied]);

    const light = resolvedTheme === 'light';
    // Pill labels stay fixed (a label change re-lays the physics); "copied" shows in the sublabel.
    const items = PAPERS.map(({ key, title }) => ({ label: title, value: key }));

    const open = (p: Paper) => {
        if (p.action === 'mcp') {
            try {
                void navigator.clipboard?.writeText(MCP_URL);
            } catch {
                /* clipboard unavailable */
            }
            setMcpCopied(true);
        } else if (p.action === 'stats') setStatsOpen(true);
        else if (p.href && p.external) window.open(p.href, '_blank', 'noopener,noreferrer');
        else if (p.href) router.push(p.href);
    };

    return (
        <div className="relative isolate flex justify-center" data-print-hide>
            {/* A black folder on a near-black footer loses its outline, so in dark mode it
                gets a soft glow behind it and a faint rim (the drop-shadow below). Light
                mode needs neither: black on white already reads. */}
            <div
                aria-hidden="true"
                className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-32 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent blur-3xl dark:bg-sky-200/[0.14]"
            />
            {mounted && (
                // The rim lives on a wrapper, not the folder itself: a filter on the
                // folder's own root would flatten its 3D flap.
                <div className="dark:[filter:drop-shadow(0_0_1px_rgba(255,255,255,0.45))_drop-shadow(0_0_14px_rgba(186,230,253,0.18))]">
                <FolderFloat
                    items={items}
                    label="Navigation"
                    sublabel={mcpCopied ? 'MCP URL copied' : `${PAPERS.length} links`}
                    // Two rows of pills with a hover pointer; narrower on a phone so they fit the screen.
                    spread={canHover ? 220 : 150}
                    trigger={canHover ? 'hover' : 'click'}
                    tilt={0}
                    folderColor={light ? '#18181b' : '#000000'}
                    frontColor={light ? '#27272a' : '#0f0f11'}
                    labelColor="#f5f5f5"
                    itemColor={light ? '#18181b' : '#f5f5f5'}
                    itemTextColor={light ? '#fafafa' : '#18181b'}
                    onSelect={(key) => {
                        const p = PAPERS.find((x) => x.key === key);
                        if (p) open(p);
                    }}
                />
                </div>
            )}
            <ul className="sr-only">
                {PAPERS.map((p) => (
                    <li key={p.key}>
                        {p.href ? (
                            <a href={p.href} {...(p.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                                {p.description}
                            </a>
                        ) : (
                            <button type="button" onClick={() => open(p)}>{p.description}</button>
                        )}
                    </li>
                ))}
            </ul>
            <SiteMetricsDialog info={buildInfo} open={statsOpen} onClose={() => setStatsOpen(false)} />
        </div>
    );
}
