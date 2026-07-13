'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';

// Both backdrops are WebGL and heavy (OGL / three.js). Keep them off the initial JS —
// only the one matching the active theme is ever fetched.
const DarkVeil = dynamic(() => import('@/components/ui/dark-veil'), { ssr: false });
const Waves = dynamic(() => import('@/components/Waves'), { ssr: false });

/**
 * Dark Veil is built for a dark surface and reads as muddy noise on a light one, so the
 * home page swaps to Waves — thin black strokes on the light ground — when the theme is
 * light. Only the backdrop for the active theme is ever fetched.
 *
 * Renders nothing until mounted: `resolvedTheme` is undefined on the server and during
 * the first client render, and guessing would mean briefly painting the wrong backdrop.
 */
export function HomeBackdrop() {
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    if (resolvedTheme === 'light') {
        return (
            <div className="fixed inset-0 -z-10 h-screen w-screen" aria-hidden>
                <Waves
                    lineColor="#000000"
                    backgroundColor="transparent"
                    waveAmpX={15}
                    waveAmpY={15}
                />
            </div>
        );
    }

    return <DarkVeil hueShift={40} speed={0.5} resolutionScale={0.8} />;
}
