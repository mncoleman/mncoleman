'use client';

import { useEffect, useRef, useState } from 'react';
import { subscribeToasts } from './toast';

/** Renders the latest `notify()` message at the bottom centre for 3.2s. Mounted once, in AdminShell. */
export function Toaster() {
    const [message, setMessage] = useState('');
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => {
        const off = subscribeToasts((m) => {
            setMessage(m);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setMessage(''), 3200);
        });
        return () => { off(); clearTimeout(timer.current); };
    }, []);
    if (!message) return null;
    return (
        <div role="status" className="fixed bottom-6 left-1/2 z-[120] max-w-[90vw] -translate-x-1/2 rounded-lg bg-primary px-3.5 py-2 text-[13px] text-primary-foreground shadow-lg">
            {message}
        </div>
    );
}
