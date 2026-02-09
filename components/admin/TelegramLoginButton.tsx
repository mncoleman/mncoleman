'use client';

import { useEffect, useRef } from 'react';

interface TelegramUser {
    id: number;
    first_name: string;
    username?: string;
    photo_url?: string;
    auth_date: number;
    hash: string;
}

interface TelegramLoginButtonProps {
    botName: string;
    onAuth: (user: TelegramUser) => void;
}

export function TelegramLoginButton({ botName, onAuth }: TelegramLoginButtonProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Check if script already exists to prevent duplicates
        if (containerRef.current.querySelector('script')) return;

        // Create script element
        const script = document.createElement('script');
        script.src = 'https://telegram.org/js/telegram-widget.js?22';
        script.setAttribute('data-telegram-login', botName);
        script.setAttribute('data-size', 'large');
        script.setAttribute('data-radius', '10');
        script.setAttribute('data-request-access', 'write');
        script.setAttribute('data-userpic', 'false');
        script.setAttribute('data-onauth', 'onTelegramAuth(user)');
        script.async = true;

        // Define the global callback
        // @ts-ignore
        window.onTelegramAuth = (user: TelegramUser) => {
            onAuth(user);
        };

        containerRef.current.appendChild(script);

        return () => {
            // Cleanup global callback
            // @ts-ignore
            delete window.onTelegramAuth;
        };
    }, [botName, onAuth]);

    return (
        <div className="flex flex-col items-center justify-center p-8 space-y-4 bg-card rounded-xl border shadow-sm">
            <h2 className="text-2xl font-semibold mb-2">Admin Access</h2>
            <p className="text-muted-foreground text-center mb-6 max-w-xs">
                Please log in with Telegram to verify your identity.
            </p>
            <div ref={containerRef} className="min-h-[50px]" />
        </div>
    );
}
