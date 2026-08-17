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
        {transitioning && cardRect && (
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
                backgroundColor: 'black',
              }}
            />

            {/* Expanding card clone */}
            <motion.div
              key="card-clone"
              initial={{
                position: 'fixed',
                top: cardRect.top,
                left: cardRect.left,
                width: cardRect.width,
                height: cardRect.height,
                borderRadius: 16,
                zIndex: 9999,
              }}
              animate={{
                top: 0,
                left: 0,
                width: '100vw',
                height: '100vh',
                borderRadius: 0,
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
                zIndex: 9999,
                background: 'rgba(255, 255, 255, 0.03)',
                backdropFilter: 'blur(12px) saturate(1.4)',
                WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
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
