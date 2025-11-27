'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface TextTypeProps {
    text: string;
    className?: string;
    delay?: number;
    speed?: number;
}

export function TextType({ text, className, delay = 0, speed = 50 }: TextTypeProps) {
    const [displayedText, setDisplayedText] = useState('');
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const startTimeout = setTimeout(() => {
            if (currentIndex < text.length) {
                const timeout = setTimeout(() => {
                    setDisplayedText((prev) => prev + text[currentIndex]);
                    setCurrentIndex((prev) => prev + 1);
                }, speed);

                return () => clearTimeout(timeout);
            }
        }, delay);

        return () => clearTimeout(startTimeout);
    }, [currentIndex, text, delay, speed]);

    return (
        <span className={cn(className)}>
            {displayedText}
            {currentIndex < text.length && (
                <span className="animate-pulse">|</span>
            )}
        </span>
    );
}
