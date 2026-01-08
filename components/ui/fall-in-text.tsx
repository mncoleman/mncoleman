'use client';

import { useEffect, useState } from 'react';

interface FallInTextProps {
    text: string;
    duration?: number;
    className?: string;
}

export function FallInText({ text, duration = 800, className = '' }: FallInTextProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Trigger animation after component mounts
        const timer = setTimeout(() => setIsVisible(true), 50);
        return () => clearTimeout(timer);
    }, []);

    return (
        <span
            className={className}
            style={{
                display: 'inline-block',
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(-50px)',
                transition: `opacity ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1), transform ${duration}ms cubic-bezier(0.34, 1.56, 0.64, 1)`,
            }}
        >
            {text}
        </span>
    );
}
