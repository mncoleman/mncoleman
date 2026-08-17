'use client';

import { useRef, useCallback, useEffect, ReactNode, KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { usePageTransition } from './transition-provider';

interface TransitionLinkProps {
  href: string;
  cardId: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseLeave?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function TransitionLink({ href, cardId, children, className, style, onMouseEnter, onMouseLeave }: TransitionLinkProps) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { startTransition } = usePageTransition();

  /**
   * This is a `div` with an `onClick`, not a `<Link>` — the card has to be
   * measured before it can morph — which means Next never prefetches it. The
   * transition then runs on a fixed 400ms timeline while the destination's RSC
   * payload and route chunks are still being fetched, so on a cold visit the
   * screen goes black and waits: the "glitchy load" on the animation-heavy
   * pages. Warming the route ourselves restores what a real Link would do.
   *
   * On hover rather than on mount: five cards prefetching at once during
   * hydration is exactly the contention this is meant to avoid, and a pointer
   * arriving is a much better signal than a card existing. `focus` covers the
   * keyboard path, which reaches the same handler.
   */
  const warm = useCallback(() => router.prefetch(href), [router, href]);

  // Touch has no hover, so nothing above ever fires there. Prefetch once the
  // page has settled instead — by then it is competing with nothing.
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(hover: hover)').matches) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        router.prefetch(href);
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [router, href]);

  const handleClick = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    startTransition(cardId, {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    }, href);
  }, [cardId, href, startTransition]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleClick();
      }
    },
    [handleClick]
  );

  return (
    <div
      ref={ref}
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onPointerEnter={warm}
      onFocus={warm}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={className}
      style={{ cursor: 'pointer', ...style }}
    >
      {children}
    </div>
  );
}
