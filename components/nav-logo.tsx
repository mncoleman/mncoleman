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
        speed={3}
        spread={120}
        pauseOnHover
      >
        <span className="font-extralight">Matthew</span>
        <span className="font-bold">Coleman</span>
      </ShinyText>
    </Link>
  );
}
