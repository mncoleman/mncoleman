'use client';

import Link from 'next/link';
import localFont from 'next/font/local';
import ShinyText from '@/components/ui/shiny-text';

const roboto = localFont({
  src: '../public/fonts/Roboto-Bold.woff2',
  weight: '700',
  display: 'swap',
});

export function NavLogo() {
  return (
    <Link
      href="/"
      className={`${roboto.className} font-bold text-lg hover:opacity-80 transition-opacity group flex items-center`}
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
