"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCursorPreference } from "@/components/cursor-preference";

const CustomCursor = () => {
    const cursorDotRef = useRef<HTMLDivElement>(null);
    const cursorRingRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    // Only mount on hover-capable pointers AND when motion is allowed. Under
    // prefers-reduced-motion we render nothing and let the native cursor show
    // (the `cursor: none` override in globals.css is gated on no-preference).
    const [supported, setSupported] = useState(false);
    // ...and only when the visitor hasn't turned the fancy mouse off in the header.
    // globals.css keys `cursor: none` off the same preference, so the native cursor
    // comes back in the same render that this unmounts — never both, never neither.
    const { fancy } = useCursorPreference();
    const enabled = supported && fancy;

    useEffect(() => {
        const hoverMq = window.matchMedia("(hover: hover) and (pointer: fine)");
        const motionMq = window.matchMedia("(prefers-reduced-motion: reduce)");
        const update = () => setSupported(hoverMq.matches && !motionMq.matches);
        update();
        hoverMq.addEventListener("change", update);
        motionMq.addEventListener("change", update);
        return () => {
            hoverMq.removeEventListener("change", update);
            motionMq.removeEventListener("change", update);
        };
    }, []);

    useEffect(() => {
        if (!enabled) return;

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
    }, [isVisible, enabled]);

    if (!enabled) return null;

    return (
        <>
            {/* Inner Dot */}
            <div
                ref={cursorDotRef}
                className={cn(
                    "pointer-events-none fixed left-0 top-0 z-[9999] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground opacity-0 transition-opacity duration-300",
                    isVisible && "opacity-100"
                )}
            />
            {/* Outer Ring */}
            <div
                ref={cursorRingRef}
                className={cn(
                    "pointer-events-none fixed left-0 top-0 z-[9999] h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground opacity-0 transition-opacity duration-300 will-change-transform",
                    isVisible && "opacity-100"
                )}
            />
        </>
    );
};

export default CustomCursor;
