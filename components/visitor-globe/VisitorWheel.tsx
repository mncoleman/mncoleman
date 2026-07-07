'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { Pin } from './visitor-api';

/**
 * Vertical, scrollbar-less, INFINITE-looping list of visitor names that morphs
 * item size/opacity/tilt by distance from centre to feel 3D (like an iOS picker
 * wheel). Auto-scrolls slowly; pauses on interaction; click a name to fly the
 * globe there. Positions are computed from real layout each frame, so it stays
 * correct at any width. Gated on visibility + reduced-motion.
 */

const ITEM_H = 44;
const VISIBLE = 5;
const CONTAINER_H = ITEM_H * VISIBLE;
const COPIES = 3; // enough duplicates for a seamless wrap

interface Props {
    pins: Pin[];
    focusedId?: string | null;
    onSelect: (id: string) => void;
    className?: string;
}

export default function VisitorWheel({ pins, focusedId, onSelect, className }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const nRef = useRef(pins.length);
    nRef.current = pins.length;

    useEffect(() => {
        const el = scrollRef.current;
        if (!el || nRef.current === 0) return;
        const listH = nRef.current * ITEM_H;
        el.scrollTop = listH; // start in the middle copy

        let interacting = false;
        let lastInteract = 0;
        let autoRaf = 0;
        let scrollRaf = 0;
        let autoLooping = false;
        let onscreen = true;
        let pageVisible = true;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const AUTO = reduce ? 0 : 0.35; // px/frame

        const morph = () => {
            const rect = el.getBoundingClientRect();
            const cy = rect.top + rect.height / 2;
            const maxD = rect.height / 2 + ITEM_H;
            const items = el.querySelectorAll<HTMLElement>('.vg-wheel-item');
            items.forEach((it) => {
                const r = it.getBoundingClientRect();
                const d = Math.min(1, Math.abs(r.top + r.height / 2 - cy) / maxD);
                const scale = 1 - d * 0.42;
                const rot = ((r.top + r.height / 2 - cy) / maxD) * -24;
                it.style.transform = `perspective(340px) rotateX(${rot}deg) scale(${scale})`;
                it.style.opacity = String(Math.max(0.08, 1 - d * 0.85));
                it.style.zIndex = String(100 - Math.round(d * 100));
            });
        };

        const wrap = () => {
            if (el.scrollTop >= listH * 2) el.scrollTop -= listH;
            else if (el.scrollTop < listH) el.scrollTop += listH;
        };

        const onScroll = () => {
            if (scrollRaf) return;
            scrollRaf = requestAnimationFrame(() => {
                scrollRaf = 0;
                wrap();
                morph();
            });
        };
        el.addEventListener('scroll', onScroll, { passive: true });

        const auto = () => {
            if (!onscreen || !pageVisible || AUTO === 0) {
                autoLooping = false;
                return;
            }
            if (!interacting) el.scrollTop += AUTO; // fires onScroll → wrap + morph
            autoRaf = requestAnimationFrame(auto);
        };
        const startAuto = () => {
            if (autoLooping || AUTO === 0 || !onscreen || !pageVisible) return;
            autoLooping = true;
            autoRaf = requestAnimationFrame(auto);
        };

        const mark = () => {
            interacting = true;
            lastInteract = performance.now();
        };
        const idle = setInterval(() => {
            if (interacting && performance.now() - lastInteract > 1600) interacting = false;
        }, 400);
        el.addEventListener('wheel', mark, { passive: true });
        el.addEventListener('touchstart', mark, { passive: true });
        el.addEventListener('touchmove', mark, { passive: true });
        el.addEventListener('pointerdown', mark);
        const onEnter = () => {
            interacting = true;
        };
        const onLeave = () => {
            lastInteract = performance.now();
            interacting = false;
        };
        el.addEventListener('mouseenter', onEnter);
        el.addEventListener('mouseleave', onLeave);

        const io = new IntersectionObserver(
            (e) => {
                onscreen = e[0]?.isIntersecting ?? true;
                if (onscreen) {
                    morph();
                    startAuto();
                }
            },
            { threshold: 0.05 }
        );
        io.observe(el);
        const onVis = () => {
            pageVisible = !document.hidden;
            if (pageVisible) startAuto();
        };
        document.addEventListener('visibilitychange', onVis);

        morph();
        startAuto();

        return () => {
            cancelAnimationFrame(autoRaf);
            cancelAnimationFrame(scrollRaf);
            clearInterval(idle);
            el.removeEventListener('scroll', onScroll);
            el.removeEventListener('wheel', mark);
            el.removeEventListener('touchstart', mark);
            el.removeEventListener('touchmove', mark);
            el.removeEventListener('pointerdown', mark);
            el.removeEventListener('mouseenter', onEnter);
            el.removeEventListener('mouseleave', onLeave);
            io.disconnect();
            document.removeEventListener('visibilitychange', onVis);
        };
        // Re-init when the number of pins changes (list height depends on it).
    }, [pins.length]);

    if (pins.length === 0) return null;

    // Duplicate the list COPIES times for a seamless infinite wrap.
    const loop: { p: Pin; key: string }[] = [];
    for (let c = 0; c < COPIES; c++) for (const p of pins) loop.push({ p, key: `${c}-${p.id}` });

    return (
        <div className={className}>
            <div ref={scrollRef} className="vg-wheel" style={{ height: CONTAINER_H }} aria-label="Recent visitors">
                {loop.map(({ p, key }) => (
                    <button
                        key={key}
                        type="button"
                        className={cn('vg-wheel-item', p.id === focusedId && 'vg-wheel-item--focused')}
                        style={{ height: ITEM_H }}
                        onClick={() => onSelect(p.id)}
                        title={p.place_label}
                    >
                        <span className="vg-wheel-name">{p.name || 'Someone'}</span>
                        <span className="vg-wheel-place">{p.country || p.place_label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
