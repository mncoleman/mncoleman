'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface BlurTextProps {
    text: string;
    className?: string;
    delay?: number;
    duration?: number;
}

// 450ms, down from 1000: a paragraph that takes over a second to become readable
// is the reason a page switch reads as slow, and the blur-in still registers at
// this length. Callers that were passing 1200 have been brought in line.
export function BlurText({ text, className, delay = 0, duration = 450 }: BlurTextProps) {
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
                'inline-block transition-[filter,opacity]',
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
