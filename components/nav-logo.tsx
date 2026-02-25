'use client';

import Link from 'next/link';
import ShinyText from '@/components/ui/shiny-text';

export function NavLogo() {
  return (
    <Link
      href="/"
      className="font-bold text-lg hover:opacity-80 transition-opacity group flex items-center"
    >
      <ShinyText
        text="Matthew Coleman"
        speed={3}
        spread={120}
        pauseOnHover
      />
    </Link>
  );
}
