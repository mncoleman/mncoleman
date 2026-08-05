'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import ShinyText from '@/components/ui/shiny-text';

export function NavLogo() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ShinyText's defaults are built for a dark surface: light-grey text (#b5b5b5) with a
  // WHITE shine sweeping through it. On a light background the shine is invisible and
  // the base barely registers, so the wordmark reads as half-erased.
  //
  // Light mode therefore gets its own pair. The base sits near `--foreground`
  // (#0a0a0a) rather than a mid grey — zinc-600 was still washed out against white —
  // and the shine sweeps *lighter* through it, since a highlight on near-black text
  // is what actually reads as a sweep.
  const isLight = mounted && resolvedTheme === 'light';

  return (
    <Link
      href="/"
      className="text-lg hover:opacity-80 transition-opacity group flex items-center"
    >
      <ShinyText
        speed={3}
        spread={120}
        pauseOnHover
        color={isLight ? '#18181b' : '#b5b5b5'}
        shineColor={isLight ? '#71717a' : '#ffffff'}
      >
        <span className="font-extralight">Matthew</span>
        <span className="font-bold">Coleman</span>
      </ShinyText>
    </Link>
  );
}
