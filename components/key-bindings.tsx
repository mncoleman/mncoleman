'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function KeyBindings() {
    const router = useRouter();

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            // Don't trigger if user is typing in an input
            const activeElement = document.activeElement;
            const isInput = activeElement && (
                activeElement.tagName === 'INPUT' ||
                activeElement.tagName === 'TEXTAREA' ||
                (activeElement as HTMLElement).isContentEditable
            );

            if (isInput) return;

            // Ignore if modifier keys are pressed (except for cases like Shift+? for help, but we don't have that yet)
            if (event.ctrlKey || event.metaKey || event.altKey) return;

            const key = event.key.toUpperCase();

            switch (key) {
                case 'B':
                    router.push('/blog');
                    break;
                case 'P':
                    router.push('/projects');
                    break;
                case 'R':
                    router.push('/resources');
                    break;
                case 'M':
                    router.push('/resume');
                    break;
                case 'A':
                    router.push('/about');
                    break;
                case 'K':
                    router.push('/brand-kit');
                    break;
                case 'H':
                    router.push('/');
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [router]);

    return null; // This component doesn't render anything
}
