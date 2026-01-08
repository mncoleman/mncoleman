import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { PWAInstall } from '@/components/pwa-install';
import Link from 'next/link';
import { GoogleAnalytics } from '@next/third-parties/google';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#18181b' },
  ],
};

const basePath = process.env.NODE_ENV === 'production' ? '/matthew-coleman' : '';

export const metadata: Metadata = {
  title: 'Matthew Coleman - Information Hub',
  description: 'Personal information hub with blog, resources, and resume by Matthew Coleman',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MC Blog',
  },
  icons: {
    icon: [
      { url: `${basePath}/icon-192.png`, sizes: '192x192', type: 'image/png' },
      { url: `${basePath}/icon-512.png`, sizes: '512x512', type: 'image/png' },
      { url: `${basePath}/icon.svg`, type: 'image/svg+xml' },
    ],
    apple: `${basePath}/apple-touch-icon.png`,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <PWAInstall />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="min-h-screen flex flex-col">
            <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
              <div className="container mx-auto px-4 py-4 flex justify-center items-center max-w-4xl">
                <nav className="flex gap-6 items-center">
                  <Link href="/" className="font-semibold text-lg hover:text-muted-foreground transition-colors">
                    Matthew Coleman
                  </Link>
                  <Link href="/blog" className="text-sm hover:text-muted-foreground transition-colors">
                    Blog
                  </Link>
                  <Link href="/projects" className="text-sm hover:text-muted-foreground transition-colors">
                    Projects
                  </Link>
                  <Link href="/resources" className="text-sm hover:text-muted-foreground transition-colors">
                    Resources
                  </Link>
                  <Link href="/resume" className="text-sm hover:text-muted-foreground transition-colors">
                    Resume
                  </Link>
                  <Link href="/about" className="text-sm hover:text-muted-foreground transition-colors">
                    About
                  </Link>
                </nav>
              </div>
            </header>
            <main className="flex-1">
              {children}
            </main>
            <footer className="border-t">
              <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground max-w-4xl">
                © {new Date().getFullYear()} Matthew Coleman. All rights reserved.
              </div>
            </footer>
          </div>
        </ThemeProvider>
        {process.env.NEXT_PUBLIC_GA_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
        )}
      </body>
    </html>
  );
}
