'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { usePathname } from 'next/navigation';

const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/blog', label: 'Blog' },
    { href: '/projects', label: 'Projects' },
    { href: '/resources', label: 'Resources' },
    { href: '/resume', label: 'Resume' },
    { href: '/about', label: 'About' },
];

export function MobileNav() {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();

    const toggleMenu = () => setIsOpen(!isOpen);
    const closeMenu = () => setIsOpen(false);

    // Listen for toggle event from external button
    useEffect(() => {
        const handleToggle = () => toggleMenu();
        window.addEventListener('toggle-mobile-nav', handleToggle);
        return () => window.removeEventListener('toggle-mobile-nav', handleToggle);
    }, []);

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[60] md:hidden transition-opacity duration-300"
                    onClick={closeMenu}
                />
            )}

            {/* Close Button - Positioned over hamburger */}
            {isOpen && (
                <button
                    onClick={closeMenu}
                    className="fixed top-4 right-4 z-[70] p-3 rounded-full bg-background/90 backdrop-blur-xl border border-border/50 shadow-2xl hover:scale-110 transition-all duration-300 animate-[slideIn_0.3s_ease-out] md:hidden"
                    aria-label="Close menu"
                >
                    <X className="h-5 w-5" />
                </button>
            )}

            {/* Floating Pills Container */}
            {isOpen && (
                <div className="fixed inset-0 z-[65] md:hidden flex items-center justify-center pointer-events-none">
                    <div className="flex flex-col gap-3 items-center pointer-events-auto">
                        {/* Navigation Pills */}
                        {navLinks.map((link, index) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={closeMenu}
                                className={`w-40 px-6 py-3 rounded-full backdrop-blur-xl border shadow-xl hover:scale-105 transition-all duration-300 animate-[slideIn_0.4s_ease-out] text-center ${pathname === link.href
                                    ? 'bg-primary/90 border-primary/50 text-primary-foreground shadow-primary/30'
                                    : 'bg-background/90 border-border/50 hover:border-primary/30 hover:shadow-primary/20'
                                    }`}
                                style={{ animationDelay: `${(index + 1) * 80}ms` }}
                            >
                                <span className="font-medium whitespace-nowrap">{link.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

                    <style jsx global>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(100px) scale(0.8);
          }
          to {
            opacity: 1;
            transform: translateX(0) scale(1);
          }
        }
      `}</style>
                </>
            );
}
