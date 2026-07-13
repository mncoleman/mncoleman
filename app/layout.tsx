import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { PWAInstall } from '@/components/pwa-install';
import Link from 'next/link';
import Script from 'next/script';
import { MobileNav } from '@/components/mobile-nav';
import { HamburgerButton } from '@/components/hamburger-button';
import CustomCursor from '@/components/ui/CustomCursor';
import { ThemeWrapper } from '@/components/theme-wrapper';
import { KeyBindings } from '@/components/key-bindings';
import { Search, SearchItem } from '@/components/search';
import { NavLogo } from '@/components/nav-logo';
import { TransitionProvider } from '@/components/transition-provider';
import { FooterButtons } from '@/components/footer-buttons';
import { Analytics } from '@/components/analytics';
import { FancyCursorToggle } from '@/components/fancy-cursor-toggle';
import { PullChainToggle } from '@/components/pull-chain-toggle';
import { CursorPreferenceProvider, cursorPreferenceScript } from '@/components/cursor-preference';
import searchIndex from '@/data/search-index.json';

const roboto = localFont({
  src: [
    { path: '../public/fonts/Roboto-ExtraLight.woff2', weight: '200', style: 'normal' },
    { path: '../public/fonts/Roboto-Regular.woff2', weight: '400', style: 'normal' },
    { path: '../public/fonts/Roboto-Medium.woff2', weight: '500', style: 'normal' },
    { path: '../public/fonts/Roboto-Bold.woff2', weight: '700', style: 'normal' },
  ],
  display: 'swap',
  // Don't High-priority-preload all 4 weights — they competed with FCP/LCP on
  // slow connections. display:swap + next/font's size-adjusted fallback keep CLS ~0.
  preload: false,
  variable: '--font-roboto',
});

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
  metadataBase: new URL('https://mncoleman.com'),
  title: 'Matthew Coleman',
  description: 'Personal website with blog, resources, and resume by Matthew Coleman',
  openGraph: {
    type: 'website',
    siteName: 'Matthew Coleman',
    title: 'Matthew Coleman',
    description: 'Personal website with blog, resources, and resume by Matthew Coleman',
    url: '/',
    // Default card comes from app/opengraph-image.tsx; per-page routes override it.
  },
  twitter: {
    card: 'summary_large_image',
  },
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
  const searchItems = searchIndex as SearchItem[];

  const Kbd = ({ children }: { children: React.ReactNode }) => (
    <kbd className="ml-2 hidden lg:inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold border rounded bg-muted/50 text-muted-foreground transition-all group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary">
      {children}
    </kbd>
  );

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs before first paint so a visitor who turned the fancy mouse off never
            sees it flash back on during hydration. Pairs with the `data-fancy-cursor`
            selector that gates `cursor: none` in globals.css. */}
        <script dangerouslySetInnerHTML={{ __html: cursorPreferenceScript }} />
      </head>
      <body className={`${roboto.className} antialiased`}>
        <PWAInstall />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <CursorPreferenceProvider>
          <ThemeWrapper>
            <TransitionProvider>
            <div className="min-h-screen flex flex-col">
              <KeyBindings />
              {/* Mobile Navigation - Rendered at root for proper overlay */}
              <MobileNav />

              <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md pwa-safe-top">
                {/* Wider than the 5xl content column: the nav links plus search, the
                    fancy-mouse toggle and the pull chain don't fit in 5xl and collide
                    with the logo. */}
                <div className="container mx-auto px-4 py-4 flex justify-between items-center max-w-7xl gap-4">
                  {/* Logo / Brand */}
                  <NavLogo />

                  {/* Desktop Navigation - Hidden on mobile */}
                  <div className="flex items-center gap-2">
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
                      <Link href="/artifacts" className="text-sm hover:text-muted-foreground transition-colors group flex items-center">
                        Artifacts <Kbd>T</Kbd>
                      </Link>
                      <Link href="/ai" className="text-sm hover:text-muted-foreground transition-colors group flex items-center">
                        &quot;A&quot;I <Kbd>I</Kbd>
                      </Link>
                      <Link href="/resume" className="text-sm hover:text-muted-foreground transition-colors group flex items-center">
                        Resume <Kbd>M</Kbd>
                      </Link>
                      <Link href="/about" className="text-sm hover:text-muted-foreground transition-colors group flex items-center">
                        About <Kbd>A</Kbd>
                      </Link>
                      <div className="h-4 w-[1px] bg-border mx-2" />
                    </nav>
                    {/* Search - visible on both mobile and desktop */}
                    <Search items={searchItems} />
                    {/* Light/dark. The chain hangs below the header — its SVG box is
                        pointer-events:none so it can't swallow clicks on the page. */}
                    <div className="ml-3">
                      <PullChainToggle />
                    </div>
                    {/* Mobile Hamburger Button */}
                    <HamburgerButton />
                  </div>
                </div>
              </header>
              <main className="flex-1">
                {children}
              </main>
              {/* Frosted, not transparent: on the home page the footer sits directly over
                  the WebGL backdrop, and in light mode the Waves strokes ran straight
                  through the text. */}
              <footer className="border-t relative z-10 pwa-safe-bottom bg-background/70 backdrop-blur-xl">

                <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground max-w-4xl space-y-3">
                  <div>
                    © 2003-{new Date().getFullYear()} Matthew Coleman. All rights reserved.
                  </div>
                  <FooterButtons />
                  <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground/70">
                    <Link href="/privacy" className="hover:text-foreground underline-offset-4 hover:underline transition-colors">
                      Privacy Policy
                    </Link>
                    <span aria-hidden="true">·</span>
                    <Link href="/terms" className="hover:text-foreground underline-offset-4 hover:underline transition-colors">
                      Terms of Service
                    </Link>
                  </div>
                </div>
              </footer>
            </div>
            <CustomCursor />
            {/* Floating, bottom-right. Desktop only: the custom cursor never mounts on
                touch, so on a phone this would control nothing. */}
            <FancyCursorToggle />
            </TransitionProvider>
          </ThemeWrapper>
          </CursorPreferenceProvider>
        </ThemeProvider>
        {process.env.NEXT_PUBLIC_GA_ID && (
          <>
            {/* `afterInteractive`, not `lazyOnload`: lazyOnload waits for window load
                + idle, so anyone who bounced before that never fired a page_view and
                the session went uncounted. afterInteractive still loads after
                hydration, so it stays off the critical path for FCP/LCP.

                `send_page_view: false` hands page_view duty to <Analytics/>, which
                fires one per App Router navigation (soft navs included). Enhanced
                Measurement's history-event tracking must stay OFF in the GA property
                or every soft nav is double-counted. */}
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${process.env.NEXT_PUBLIC_GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${process.env.NEXT_PUBLIC_GA_ID}', { send_page_view: false });`}
            </Script>
            <Analytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
          </>
        )}
      </body>
    </html>
  );
}
