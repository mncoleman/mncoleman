'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface BlurTextProps {
    text: string;
    className?: string;
    delay?: number;
    duration?: number;
}

export function BlurText({ text, className, delay = 0, duration = 1000 }: BlurTextProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setIsVisible(true);
        }, delay);

        return () => clearTimeout(timeout);
    }, [delay]);

    return (
        <span
            className={cn(
                'inline-block transition-all',
                isVisible ? 'blur-0 opacity-100' : 'blur-md opacity-0',
                className
            )}
            style={{
                transitionDuration: `${duration}ms`,
            }}
        >
            {text}
        </span>
    );
}
