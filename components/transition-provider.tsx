'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';

interface CardRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface TransitionContextValue {
  startTransition: (cardId: string, rect: CardRect, href: string) => void;
  activeCardId: string | null;
}

const TransitionContext = createContext<TransitionContextValue>({
  startTransition: () => {},
  activeCardId: null,
});

export function usePageTransition() {
  return useContext(TransitionContext);
}

export function TransitionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [transitioning, setTransitioning] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [cardRect, setCardRect] = useState<CardRect | null>(null);
  // Measured once per transition, alongside the card, so the clone's box and its
  // scale math agree and nothing reads `window` during render.
  const [viewport, setViewport] = useState<{ w: number; h: number } | null>(null);
  const [targetHref, setTargetHref] = useState<string | null>(null);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Check reduced motion preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Reset on pathname change (handles browser back)
  useEffect(() => {
    setTransitioning(false);
    setActiveCardId(null);
    setCardRect(null);
    setViewport(null);
    setTargetHref(null);
  }, [pathname]);

  const startTransition = useCallback(
    (cardId: string, rect: CardRect, href: string) => {
      // Guard against double-clicks
      if (transitioning) return;

      if (prefersReducedMotion) {
        router.push(href);
        return;
      }

      setActiveCardId(cardId);
      setCardRect(rect);
      setViewport({ w: window.innerWidth, h: window.innerHeight });
      setTargetHref(href);
      setTransitioning(true);
    },
    [transitioning, prefersReducedMotion, router]
  );

  // Navigate early — as soon as the bg-mask starts fading in,
  // the screen is about to be opaque so we can push underneath it.
  const hasPushed = useRef(false);
  useEffect(() => {
    if (!transitioning || !targetHref) return;
    hasPushed.current = false;
    const timer = setTimeout(() => {
      if (!hasPushed.current) {
        hasPushed.current = true;
        router.push(targetHref);
      }
    }, 250); // push while bg-mask is fading in
    return () => clearTimeout(timer);
  }, [transitioning, targetHref, router]);

  return (
    <TransitionContext.Provider value={{ startTransition, activeCardId }}>
      {children}

      <AnimatePresence>
        {transitioning && cardRect && viewport && (
          <>
            {/* Dark backdrop — fades in to hide sibling cards */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9998,
                // The page's own background, not black: in light mode a black
                // sheet fading in over a white page read as a flash before the
                // white mask covered it.
                backgroundColor: 'hsl(var(--background))',
              }}
            />

            {/* Expanding card clone.

                Transform-only: the clone is laid out at full viewport size once and
                scaled/translated from the card's measured rect, so every frame is a
                compositor move. It used to animate top/left/width/height — layout
                properties — with a backdrop blur on top, which meant a layout, a
                paint and a re-blur of the WebGL canvas behind it on every frame:
                that was the visible stutter under CPU pressure. The blur is gone
                too; the black backdrop is fading in underneath at the same time, so
                nothing behind the clone is visible long enough to need it. */}
            <motion.div
              key="card-clone"
              initial={{
                x: cardRect.left,
                y: cardRect.top,
                scaleX: cardRect.width / viewport.w,
                scaleY: cardRect.height / viewport.h,
                // The element is scaled non-uniformly, so a plain 16px radius would
                // render as a ~4px ellipse on frame one and pop as it grew. An
                // elliptical radius pre-divided by each axis' scale lands at exactly
                // the card's own 16px corner at frame zero.
                borderRadius: `${16 / (cardRect.width / viewport.w)}px / ${16 / (cardRect.height / viewport.h)}px`,
              }}
              animate={{
                x: 0,
                y: 0,
                scaleX: 1,
                scaleY: 1,
                borderRadius: '0px / 0px',
              }}
              // Motion applies the same `transition` to exit unless the exit
              // variant carries its own — so without this the clone spent a
              // further 0.4s fading after the destination had already mounted,
              // and the mask below held opaque for 0.2s before even starting.
              // Between them the new page was revealed a third to two thirds of
              // a second late, with its own entrance animations already burning
              // frames behind the cover. Both exits now leave promptly.
              exit={{ opacity: 0, transition: { duration: 0.15, ease: 'easeOut' } }}
              transition={{
                duration: 0.4,
                ease: [0.32, 0.72, 0, 1], // ease-out cubic
              }}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                // Pixels, not 100vh: on iOS Safari 100vh is the large viewport, so a
                // vh-sized clone would be taller than the scale math assumes and the
                // morph would start visibly below the card on phones.
                width: viewport.w,
                height: viewport.h,
                transformOrigin: '0 0',
                willChange: 'transform',
                zIndex: 9999,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                overflow: 'hidden',
              }}
            />

            {/* Final bg-background overlay — fades in at end to mask the page swap */}
            <motion.div
              key="bg-mask"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.22, delay: 0, ease: 'easeOut' } }}
              transition={{
                duration: 0.15,
                delay: 0.2,
                ease: 'easeIn',
              }}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10000,
                backgroundColor: 'hsl(var(--background))',
              }}
            />
          </>
        )}
      </AnimatePresence>
    </TransitionContext.Provider>
  );
}
