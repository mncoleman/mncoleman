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
        if (currentIndex >= text.length) return;

        // `delay` is a lead-in, not a per-character cost. The effect re-runs on
        // every character, so adding it to each tick made a heading with
        // `delay={100}` type at 150ms/char — "Professional Experience" took four
        // seconds to appear. It applies to the first character only now, and the
        // inner cleanup that used to be returned from the setTimeout callback
        // (where nothing could ever call it) is a real effect cleanup.
        const wait = speed + (currentIndex === 0 ? delay : 0);
        const timeout = setTimeout(() => {
            setDisplayedText((prev) => prev + text[currentIndex]);
            setCurrentIndex((prev) => prev + 1);
        }, wait);

        return () => clearTimeout(timeout);
    }, [currentIndex, text, delay, speed]);

    // A changed `text` has to restart, or the new string types on top of the old.
    useEffect(() => {
        setDisplayedText('');
        setCurrentIndex(0);
    }, [text]);

    // The typed copy starts empty and only fills in after hydration, so on its own
    // this renders headings with no text at all in the statically exported HTML —
    // for crawlers, for screen readers, and for the print stylesheet. The real
    // string ships alongside it, visually hidden. Callers get both from one
    // component rather than each remembering to pair them.
    return (
        <>
            <span aria-hidden="true" className={cn(className)}>
                {displayedText}
                {currentIndex < text.length && <span className="animate-pulse">|</span>}
            </span>
            <span className="sr-only">{text}</span>
        </>
    );
}
