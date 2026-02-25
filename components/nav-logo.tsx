'use client';

import Link from 'next/link';
import ShinyText from '@/components/ui/shiny-text';

export function NavLogo() {
  return (
    <Link
      href="/"
      className="text-lg hover:opacity-80 transition-opacity group flex items-center"
    >
      <ShinyText
        text="Matthew"
        className="font-extralight"
        speed={3}
        spread={120}
        pauseOnHover
      />
      <ShinyText
        text="Coleman"
        className="font-bold"
        speed={3}
        spread={120}
        pauseOnHover
      />
    </Link>
  );
}
