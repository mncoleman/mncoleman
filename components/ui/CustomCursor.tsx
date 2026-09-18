"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useCursorPreference } from "@/components/cursor-preference";

const CustomCursor = () => {
    const cursorDotRef = useRef<HTMLDivElement>(null);
    const cursorRingRef = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);
    // Mirrors `isVisible` for the listeners below, so the effect does not have to
    // depend on it. It used to: every mouse-leave/re-enter re-ran the effect, which
    // reset the ring to (0,0) — it visibly swept in from the top-left corner — and
    // leaked a fresh set of pointer listeners each time.
    const visibleRef = useRef(false);
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

        let requestRef = 0;
        let running = false;
        let mouseX = 0;
        let mouseY = 0;
        let ringX = 0;
        let ringY = 0;

        // Initial position off-screen until first move
        // We'll trust the isVisible state to handle initial show

        // The ring's catch-up loop only runs while it has somewhere to go. It used
        // to run every frame for the life of the page.
        const kick = () => {
            if (running) return;
            running = true;
            requestRef = requestAnimationFrame(animate);
        };

        const onMouseMove = (e: MouseEvent) => {
            if (!visibleRef.current) {
                visibleRef.current = true;
                setIsVisible(true);
            }
            mouseX = e.clientX;
            mouseY = e.clientY;

            // Dot follows immediately
            dot.style.transform = `translate(${mouseX}px, ${mouseY}px) translate(-50%, -50%)`;
            kick();
        };

        const onMouseDown = () => {
            ring.classList.add("scale-75");
        };

        const onMouseUp = () => {
            ring.classList.remove("scale-75");
        };

        const onMouseEnter = () => {
            visibleRef.current = true;
            setIsVisible(true);
        };

        const onMouseLeave = () => {
            visibleRef.current = false;
            setIsVisible(false);
        };

        const animate = () => {
            // Lerp for ring
            ringX += (mouseX - ringX) * 0.15;
            ringY += (mouseY - ringY) * 0.15;

            ring.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;

            if (Math.abs(mouseX - ringX) > 0.1 || Math.abs(mouseY - ringY) > 0.1) {
                requestRef = requestAnimationFrame(animate);
            } else {
                running = false;
            }
        };

        // Pointer events as well as mouse: a component that calls preventDefault()
        // on pointerdown to own a drag (the captcha slider) suppresses the
        // compatibility mouse events for the whole gesture, and the cursor would
        // sit frozen until the drag ended. Same coordinates either way, so the
        // duplicate updates are free.
        const onPointerMove = (e: PointerEvent) => {
            if (e.pointerType === "mouse") onMouseMove(e);
        };
        const onPointerDown = (e: PointerEvent) => {
            if (e.pointerType === "mouse") onMouseDown();
        };
        const onPointerUp = (e: PointerEvent) => {
            if (e.pointerType === "mouse") onMouseUp();
        };

        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mousedown", onMouseDown);
        window.addEventListener("mouseup", onMouseUp);
        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("pointerup", onPointerUp);
        document.addEventListener("mouseenter", onMouseEnter);
        document.addEventListener("mouseleave", onMouseLeave);

        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mousedown", onMouseDown);
            window.removeEventListener("mouseup", onMouseUp);
            // These three were never removed before.
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("pointerup", onPointerUp);
            document.removeEventListener("mouseenter", onMouseEnter);
            document.removeEventListener("mouseleave", onMouseLeave);
            cancelAnimationFrame(requestRef);
        };
    }, [enabled]);

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
