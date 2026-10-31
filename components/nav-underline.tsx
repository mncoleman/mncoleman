'use client';

import { useEffect, useRef } from 'react';
import { animate, motion, useMotionValue, useTransform, type AnimationPlaybackControls } from 'motion/react';

/**
 * One underline shared by every header nav link. It glides from word to word instead of
 * each link drawing its own, and the two ends move on different springs: the edge heading
 * towards the new word leads and the trailing edge catches up, so the bar stretches and
 * then contracts into place rather than sliding as a rigid block. Leaving the nav squishes
 * both ends into a dot at its centre, which then fades; coming back in grows out of a dot.
 *
 * Words are found by `[data-nav-word]` inside the hovered (or focused) link, so the bar
 * sits under the word only, not the keyboard hint beside it. Pure decoration:
 * pointer-events-none and aria-hidden.
 */

const BAR = 2; // thickness, px; also the dot's diameter when squished
const GAP = 3; // space between the word's baseline box and the bar

const LEAD = { type: 'spring', stiffness: 520, damping: 42, mass: 0.6 } as const;
const TRAIL = { type: 'spring', stiffness: 230, damping: 30, mass: 0.8 } as const;
const SQUISH = { type: 'spring', stiffness: 320, damping: 34 } as const;

export function NavUnderline({ children, className }: { children: React.ReactNode; className?: string }) {
    const navRef = useRef<HTMLElement>(null);
    const left = useMotionValue(0);
    const right = useMotionValue(0);
    const top = useMotionValue(0);
    const opacity = useMotionValue(0);
    const width = useTransform(() => Math.max(BAR, right.get() - left.get()));

    useEffect(() => {
        const nav = navRef.current;
        if (!nav) return;
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let visible = false;
        let running: AnimationPlaybackControls[] = [];
        let hideTimer = 0;

        const stop = () => {
            running.forEach((a) => a.stop());
            running = [];
        };

        const wordBox = (el: Element | null) => {
            const link = el?.closest('a');
            const word = link?.querySelector('[data-nav-word]');
            if (!link || !word || !nav.contains(link)) return null;
            const n = nav.getBoundingClientRect();
            const r = word.getBoundingClientRect();
            return { l: r.left - n.left, r: r.right - n.left, y: r.bottom - n.top + GAP };
        };

        const show = (target: Element | null) => {
            const box = wordBox(target);
            if (!box) return;
            window.clearTimeout(hideTimer);
            stop();
            top.set(box.y);
            if (reduced) {
                left.set(box.l);
                right.set(box.r);
                opacity.set(1);
                visible = true;
                return;
            }
            if (!visible) {
                // Grow out of a dot at the word's centre.
                const c = (box.l + box.r) / 2;
                left.set(c - BAR / 2);
                right.set(c + BAR / 2);
                running.push(animate(opacity, 1, { duration: 0.15 }));
                running.push(animate(left, box.l, SQUISH), animate(right, box.r, SQUISH));
            } else {
                // Moving right: the right edge leads. Moving left: the left edge leads.
                const goingRight = box.l > left.get();
                running.push(
                    animate(left, box.l, goingRight ? TRAIL : LEAD),
                    animate(right, box.r, goingRight ? LEAD : TRAIL)
                );
            }
            visible = true;
        };

        const hide = () => {
            if (!visible) return;
            visible = false;
            stop();
            if (reduced) {
                opacity.set(0);
                return;
            }
            // Squish both ends into a dot at the bar's centre, then let the dot fade.
            const c = (left.get() + right.get()) / 2;
            running.push(animate(left, c - BAR / 2, SQUISH), animate(right, c + BAR / 2, SQUISH));
            hideTimer = window.setTimeout(() => {
                running.push(animate(opacity, 0, { duration: 0.18 }));
            }, 220);
        };

        const onOver = (e: PointerEvent) => show(e.target as Element);
        // Moving between links crosses the gaps between them, and so the nav's own box;
        // only leaving the nav entirely hides the bar, so it never blinks out mid-glide.
        const onLeave = () => hide();
        const onFocusIn = (e: FocusEvent) => show(e.target as Element);
        const onFocusOut = (e: FocusEvent) => {
            if (!nav.contains(e.relatedTarget as Node | null)) hide();
        };

        nav.addEventListener('pointerover', onOver);
        nav.addEventListener('pointerleave', onLeave);
        nav.addEventListener('focusin', onFocusIn);
        nav.addEventListener('focusout', onFocusOut);
        return () => {
            stop();
            window.clearTimeout(hideTimer);
            nav.removeEventListener('pointerover', onOver);
            nav.removeEventListener('pointerleave', onLeave);
            nav.removeEventListener('focusin', onFocusIn);
            nav.removeEventListener('focusout', onFocusOut);
        };
    }, [left, right, top, opacity]);

    return (
        <nav ref={navRef} className={`relative ${className ?? ''}`.trim()}>
            {children}
            <motion.span
                aria-hidden="true"
                className="pointer-events-none absolute rounded-full bg-foreground"
                style={{ left, top, width, height: BAR, opacity }}
            />
        </nav>
    );
}
