import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { PWAInstall } from '@/components/pwa-install';
import Link from 'next/link';
import { GoogleAnalytics } from '@next/third-parties/google';
import { MobileNav } from '@/components/mobile-nav';
import { HamburgerButton } from '@/components/hamburger-button';
import CustomCursor from '@/components/ui/CustomCursor';
import { ThemeWrapper } from '@/components/theme-wrapper';
import { KeyBindings } from '@/components/key-bindings';
import { Search, SearchItem } from '@/components/search';
import { getPublishedPostsWithContent } from '@/lib/notion';
import { getPublishedProjects } from '@/lib/projects';
import { getPublishedResources } from '@/lib/resources';
import { getResume } from '@/lib/resume';


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

// No basePath needed for custom domain
const basePath = '';

export const metadata: Metadata = {
  title: 'Matthew Coleman',
  description: 'Personal website with blog, resources, and resume by Matthew Coleman',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'mncoleman',
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Fetch data for search
  const [posts, projects, resources, resume] = await Promise.all([
    getPublishedPostsWithContent(),
    getPublishedProjects(),
    getPublishedResources(),
    getResume(),
  ]);

  const searchItems: SearchItem[] = [
    ...posts.map(p => ({
      id: p.id,
      title: p.title,
      description: p.excerpt,
      content: p.content,
      url: `/blog/${p.slug}`,
      type: 'blog' as const,
      metadata: p.tags,
    })),
    ...projects.map(p => ({
      id: p.id,
      title: p.name,
      description: p.description,
      url: p.url || '/projects',
      type: 'project' as const,
      metadata: p.tech,
    })),
    ...resources.map(r => ({
      id: r.id,
      title: r.name,
      description: r.description,
      url: r.url || '/resources',
      type: 'resource' as const,
      metadata: r.categories,
    })),
  ];

  if (resume) {
    searchItems.push({
      id: 'resume',
      title: 'Resume',
      description: 'Matthew Coleman\'s Professional Resume',
      url: '/resume',
      type: 'resume' as const,
    });
  }

  const Kbd = ({ children }: { children: React.ReactNode }) => (
    <kbd className="ml-2 hidden lg:inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold border rounded bg-muted/50 text-muted-foreground transition-all group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary">
      {children}
    </kbd>
  );

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
          <ThemeWrapper>
            <div className="min-h-screen flex flex-col">
              <KeyBindings />
              {/* Mobile Navigation - Rendered at root for proper overlay */}
              <MobileNav />

              <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
                <div className="container mx-auto px-4 py-4 flex justify-between items-center max-w-4xl">
                  {/* Logo / Brand */}
                  <Link href="/" className="font-semibold text-lg hover:text-muted-foreground transition-colors group flex items-center">
                    Matthew Coleman
                  </Link>

                  {/* Desktop Navigation - Hidden on mobile */}
                  <nav className="hidden md:flex gap-6 items-center">
                    <Link href="/blog" className="text-sm hover:text-muted-foreground transition-colors group flex items-center">
                      Blog <Kbd>B</Kbd>
                    </Link>
                    <Link href="/projects" className="text-sm hover:text-muted-foreground transition-colors group flex items-center">
                      Projects <Kbd>P</Kbd>
                    </Link>
                    <Link href="/resources" className="text-sm hover:text-muted-foreground transition-colors group flex items-center">
                      Resources <Kbd>R</Kbd>
                    </Link>
                    <Link href="/resume" className="text-sm hover:text-muted-foreground transition-colors group flex items-center">
                      Resume <Kbd>M</Kbd>
                    </Link>
                    <Link href="/about" className="text-sm hover:text-muted-foreground transition-colors group flex items-center">
                      About <Kbd>A</Kbd>
                    </Link>
                    <div className="h-4 w-[1px] bg-border mx-2" />
                    <Search items={searchItems} />
                  </nav>

                  {/* Mobile Hamburger Button */}
                  <HamburgerButton />
                </div>
              </header>
              <main className="flex-1">
                {children}
              </main>
              <footer className="border-t relative z-10">

                <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground max-w-4xl space-y-2">
                  <div>
                    © 2003-{new Date().getFullYear()} Matthew Coleman (aka Teo: pronounced 'Tay-oh'). All rights reserved - and I mean all of them.
                  </div>
                  <div>
                    <Link href="/brand-kit" className="hover:text-primary transition-colors hover:underline underline-offset-4">
                      Brand Kit
                    </Link>
                    <span className="mx-2">•</span>
                    <Link href="/admin" className="hover:text-primary transition-colors hover:underline underline-offset-4 opacity-50 text-xs">
                      Admin
                    </Link>
                  </div>
                </div>
              </footer>
            </div>
            <CustomCursor />
          </ThemeWrapper>
        </ThemeProvider>
        {process.env.NEXT_PUBLIC_GA_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
        )}
      </body>
    </html>
  );
}
