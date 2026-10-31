'use client';

import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Folder, { type FolderEntry } from '@/components/ui/folder';

const REPO_URL = 'https://github.com/mncoleman/mncoleman';

/** Each paper in the folder, and where it goes. */
const PAPERS: { title: string; description: string; href: string; external?: boolean }[] = [
    { title: 'Terms', description: 'Terms of Service', href: '/terms' },
    { title: 'Privacy', description: 'Privacy Policy', href: '/privacy' },
    { title: 'Repository', description: 'Source on GitHub', href: REPO_URL, external: true },
    { title: 'Brand Kit', description: 'Colours, type, components', href: '/brand-kit' },
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
 * The footer's "Other" folder: opens on hover (on tap without a hover pointer) and fans out a paper per link. Settings
 * come from the ReactBits demo link Matthew picked (black, hover, size 1, speed 0.75,
 * bounce 0.25, tilt 1.5, no intro). Papers navigate on a click or tap rather than zoom,
 * since every one of them is a link; they can still be dragged out of the folder, and
 * Folder suppresses the click that ends a drag, so a drag never navigates.
 *
 * The folder is pointer-and-keyboard UI drawn by the component; the same four
 * destinations are also plain links in an sr-only list, so a screen reader or a
 * crawler never depends on the animation.
 */
export function FooterFolder() {
    const router = useRouter();
    const { resolvedTheme } = useTheme();
    // resolvedTheme is undefined on the server and on the first client render.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const canHover = useSyncExternalStore(subscribeHover, () => window.matchMedia(HOVER_QUERY).matches, () => true);

    const items: FolderEntry[] = PAPERS.map(({ title, description }) => ({ title, description }));

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
                <Folder
                    items={items}
                    label="Other"
                    color="#000000"
                    openOn={canHover ? 'hover' : 'click'}
                    size={0.75}
                    speed={0.75}
                    bounce={0.25}
                    tilt={1.5}
                    intro={false}
                    zoomOnClick={false}
                    theme={resolvedTheme === 'light' ? 'light' : 'dark'}
                    onItemClick={(_, i) => {
                        const p = PAPERS[i];
                        if (!p) return;
                        if (p.external) window.open(p.href, '_blank', 'noopener,noreferrer');
                        else router.push(p.href);
                    }}
                />
                </div>
            )}
            <ul className="sr-only">
                {PAPERS.map((p) => (
                    <li key={p.href}>
                        <a href={p.href} {...(p.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                            {p.description}
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
}
