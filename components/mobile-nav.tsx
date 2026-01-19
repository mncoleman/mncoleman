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
    const [isClosing, setIsClosing] = useState(false);
    const pathname = usePathname();

    const toggleMenu = () => {
        if (isOpen) {
            closeMenu();
        } else {
            setIsOpen(true);
            setIsClosing(false);
        }
    };

    const closeMenu = () => {
        setIsClosing(true);
        // Wait for slide-out animation to complete (last item delay + animation duration)
        setTimeout(() => {
            setIsOpen(false);
            setIsClosing(false);
        }, 250 + (navLinks.length - 1) * 50); // Last item delay + animation duration
    };

    // Listen for toggle event from external button
    useEffect(() => {
        const handleToggle = () => {
            if (isOpen) {
                closeMenu();
            } else {
                setIsOpen(true);
                setIsClosing(false);
            }
        };
        window.addEventListener('toggle-mobile-nav', handleToggle);
        return () => window.removeEventListener('toggle-mobile-nav', handleToggle);
    }, [isOpen]);

    return (
        <>
            {/* Backdrop */}
            {isOpen && (
                <div
                    className={`fixed inset-0 bg-background/60 backdrop-blur-sm z-[60] md:hidden transition-opacity duration-300 ${
                        isClosing ? 'opacity-0' : 'opacity-100'
                    }`}
                    onClick={closeMenu}
                />
            )}

            {/* Close Button - Positioned over hamburger */}
            {isOpen && (
                <button
                    onClick={closeMenu}
                    className={`fixed top-4 right-4 z-[70] p-3 rounded-full bg-background/90 backdrop-blur-xl border border-border/50 shadow-2xl hover:scale-110 transition-all duration-300 md:hidden ${
                        isClosing ? 'animate-[slideOut_0.2s_ease-in_forwards]' : 'animate-[slideIn_0.2s_ease-out_forwards]'
                    }`}
                    aria-label="Close menu"
                    style={{ opacity: 0 }}
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
                                className={`w-40 px-6 py-3 rounded-full backdrop-blur-xl border shadow-xl hover:scale-105 transition-all duration-300 text-center ${
                                    isClosing
                                        ? 'animate-[slideOut_0.25s_ease-in_forwards]'
                                        : 'animate-[slideIn_0.25s_ease-out_forwards]'
                                } ${pathname === link.href
                                    ? 'bg-primary/90 border-primary/50 text-primary-foreground shadow-primary/30'
                                    : 'bg-background/90 border-border/50 hover:border-primary/30 hover:shadow-primary/20'
                                }`}
                                style={{
                                    animationDelay: `${index * 50}ms`,
                                    opacity: isClosing ? 1 : 0
                                }}
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
            transform: translateX(50px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slideOut {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(50px);
          }
        }
      `}</style>
                </>
            );
}
