"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const CustomCursor = () => {
    const cursorDotRef = useRef<HTMLDivElement>(null);
    const cursorRingRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Hide on touch devices or devices without hover
        if (window.matchMedia("(any-hover: none)").matches) return;

        const dot = cursorDotRef.current;
        const ring = cursorRingRef.current;

        if (!dot || !ring) return;

        let requestRef: number;
        let mouseX = 0;
        let mouseY = 0;
        let ringX = 0;
        let ringY = 0;

        // Initial position off-screen until first move
        // We'll trust the isVisible state to handle initial show

        const onMouseMove = (e: MouseEvent) => {
            if (!isVisible) setIsVisible(true);
            mouseX = e.clientX;
            mouseY = e.clientY;

            // Dot follows immediately
            dot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
        };

        const onMouseDown = () => {
            ring.classList.add("scale-75");
        };

        const onMouseUp = () => {
            ring.classList.remove("scale-75");
        };

        const onMouseEnter = () => {
            setIsVisible(true);
        };

        const onMouseLeave = () => {
            setIsVisible(false);
        };

        const animate = () => {
            // Lerp for ring
            ringX += (mouseX - ringX) * 0.15;
            ringY += (mouseY - ringY) * 0.15;

            ring.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;

            requestRef = requestAnimationFrame(animate);
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mouseup", onMouseUp);
        document.addEventListener("mouseenter", onMouseEnter);
        document.addEventListener("mouseleave", onMouseLeave);

        requestRef = requestAnimationFrame(animate);

        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mousedown", onMouseDown);
            window.removeEventListener("mouseup", onMouseUp);
            document.removeEventListener("mouseenter", onMouseEnter);
            document.removeEventListener("mouseleave", onMouseLeave);
            cancelAnimationFrame(requestRef);
        };
    }, [isVisible]);

    return (
        <>
            {/* Inner Dot */}
            <div
                ref={cursorDotRef}
                className={cn(
                    "pointer-events-none fixed left-0 top-0 z-[9999] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white opacity-0 transition-opacity duration-300",
                    isVisible && "opacity-100"
                )}
            />
            {/* Outer Ring */}
            <div
                ref={cursorRingRef}
                className={cn(
                    "pointer-events-none fixed left-0 top-0 z-[9999] h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white opacity-0 transition-opacity duration-300 will-change-transform",
                    isVisible && "opacity-100"
                )}
            />
        </>
    );
};

export default CustomCursor;
