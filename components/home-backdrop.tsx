'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { DeferUntilIdle } from '@/components/defer';
import { BackdropFade } from '@/components/backdrop-fade';

// Dark Veil is WebGL and heavy (OGL). Keep it off the initial JS, and off light mode
// entirely — a light visitor never downloads it.
const DarkVeil = dynamic(() => import('@/components/ui/dark-veil'), { ssr: false });
// Canvas 2D and small, but still only fetched for the theme that uses it.
const PaperBackdrop = dynamic(
    () => import('@/components/paper-backdrop').then((m) => m.PaperBackdrop),
    { ssr: false }
);

/**
 * Dark Veil is built for a dark surface and reads as muddy noise on a light one, so it
 * renders in dark mode only. Light mode used to get the Waves line art instead; that was
 * dropped because thin strokes on white read as noise behind the cards rather than as
 * atmosphere. Light mode is now plain paper, deliberately.
 *
 * Renders nothing until mounted: `resolvedTheme` is undefined on the server and during
 * the first client render, and guessing would mean briefly painting the wrong backdrop.
 */
export function HomeBackdrop() {
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    // Light mode gets paper you can draw on — see `paper-backdrop.tsx`. It replaced the
    // Waves line art, which read as noise on white and fought the cards sitting on it.
    if (resolvedTheme === 'light') {
        return (
            <DeferUntilIdle>
                <BackdropFade>
                    <PaperBackdrop />
                </BackdropFade>
            </DeferUntilIdle>
        );
    }

    // Purely decorative, and full-bleed behind the content — so it waits for load + idle
    // rather than competing with LCP. Dark Veil does not fade itself in, so `BackdropFade`
    // supplies the fade; arriving a beat late then reads as intentional rather than as the
    // backdrop snapping in over an already-painted page.
    return (
        <DeferUntilIdle>
            <BackdropFade>
                <DarkVeil hueShift={40} speed={0.5} resolutionScale={0.8} />
            </BackdropFade>
        </DeferUntilIdle>
    );
}
