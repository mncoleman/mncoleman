'use client';

import { useState, useCallback, useEffect } from 'react';

export function useToast() {
    const [toast, setToast] = useState<{ message: string; show: boolean }>({ message: '', show: false });

    const showToast = useCallback((message: string) => {
        setToast({ message, show: true });
    }, []);

    useEffect(() => {
        if (toast.show) {
            const timer = setTimeout(() => {
                setToast(prev => ({ ...prev, show: false }));
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [toast.show]);

    const ToastComponent = toast.show ? (
        <div className="fixed bottom-8 right-8 bg-primary text-primary-foreground px-6 py-3 rounded-lg shadow-lg animate-in fade-in slide-in-from-bottom-5 duration-300 z-50">
            {toast.message}
        </div>
    ) : null;

    return { showToast, ToastComponent };
}
