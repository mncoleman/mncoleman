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
                    className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[60] md:hidden"
                    onClick={closeMenu}
                />
            )}

            {/* Slide-in Menu */}
            <div
                className={`fixed top-0 right-0 h-full w-64 bg-background/90 backdrop-blur-xl border-l shadow-2xl z-[70] transform transition-transform duration-300 ease-in-out md:hidden ${isOpen ? 'translate-x-0' : 'translate-x-full'
                    }`}
            >
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-border/50 bg-background/50 backdrop-blur-sm">
                        <span className="font-semibold text-lg">Menu</span>
                        <button
                            onClick={closeMenu}
                            className="p-2 hover:bg-accent/50 rounded-lg transition-colors"
                            aria-label="Close menu"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Navigation Links */}
                    <nav className="flex-1 overflow-y-auto py-4 bg-background/30">
                        {navLinks.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                onClick={closeMenu}
                                className={`block px-6 py-3 text-base font-medium transition-colors ${pathname === link.href
                                    ? 'text-primary bg-primary/20'
                                    : 'text-foreground hover:text-primary hover:bg-accent/30'
                                    }`}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>
                </div>
            </div>
        </>
    );
}
