'use client';

import { useRef, useCallback, ReactNode, KeyboardEvent } from 'react';
import { usePageTransition } from './transition-provider';

interface TransitionLinkProps {
  href: string;
  cardId: string;
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function TransitionLink({ href, cardId, children, className, style }: TransitionLinkProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { startTransition } = usePageTransition();

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
      className={className}
      style={{ cursor: 'pointer', ...style }}
    >
      {children}
    </div>
  );
}
