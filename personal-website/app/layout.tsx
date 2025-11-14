import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { ThemeToggle } from '@/components/theme-toggle';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Matthew Coleman - Personal Website & Blog',
  description: 'Personal website and blog by Matthew Coleman',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="min-h-screen flex flex-col">
            <header className="border-b">
              <div className="container mx-auto px-4 py-4 flex justify-between items-center max-w-4xl">
                <nav className="flex gap-6 items-center">
                  <Link href="/" className="font-semibold text-lg hover:text-muted-foreground transition-colors">
                    Matthew Coleman
                  </Link>
                  <Link href="/blog" className="text-sm hover:text-muted-foreground transition-colors">
                    Blog
                  </Link>
                  <Link href="/about" className="text-sm hover:text-muted-foreground transition-colors">
                    About
                  </Link>
                </nav>
                <ThemeToggle />
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
      </body>
    </html>
  );
}
