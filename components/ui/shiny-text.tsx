'use client';

import React, { useState, useCallback } from 'react';

interface ShinyTextProps {
  text?: string;
  children?: React.ReactNode;
  disabled?: boolean;
  /** Seconds for one sweep across the text. */
  speed?: number;
  className?: string;
  color?: string;
  shineColor?: string;
  spread?: number;
  pauseOnHover?: boolean;
  direction?: 'left' | 'right';
  /** Seconds to hold between sweeps. */
  delay?: number;
}

/**
 * The shimmering wordmark.
 *
 * Driven by a CSS keyframe (`shiny-sweep` in globals.css), not JavaScript. The
 * previous version ran a `useAnimationFrame` loop that wrote `background-position`
 * through a motion value sixty times a second — on every page, forever, since it
 * lives in the header. The browser's own animation does the same paint without
 * any main-thread work, and pauses itself in a background tab.
 *
 * `delay` is a hold between sweeps. CSS `animation-delay` only applies once, so the
 * hold is expressed inside the keyframe instead: the sweep occupies the first
 * `--shine-sweep` fraction of the cycle and the rest holds still.
 */
const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  children,
  disabled = false,
  speed = 2,
  className = '',
  color = '#b5b5b5',
  shineColor = '#ffffff',
  spread = 120,
  pauseOnHover = false,
  direction = 'left',
  delay = 0
}) => {
  const [isPaused, setIsPaused] = useState(false);

  const cycle = speed + delay;
  const sweep = cycle > 0 ? speed / cycle : 1;

  const handleMouseEnter = useCallback(() => {
    if (pauseOnHover) setIsPaused(true);
  }, [pauseOnHover]);

  const handleMouseLeave = useCallback(() => {
    if (pauseOnHover) setIsPaused(false);
  }, [pauseOnHover]);

  const style = {
    backgroundImage: `linear-gradient(${spread}deg, ${color} 0%, ${color} 35%, ${shineColor} 50%, ${color} 65%, ${color} 100%)`,
    backgroundSize: '200% auto',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    // The keyframe reads this to know where the sweep ends and the hold begins.
    '--shine-sweep': `${(sweep * 100).toFixed(2)}%`,
    animation: disabled ? 'none' : `shiny-sweep ${cycle}s linear infinite`,
    animationDirection: direction === 'left' ? 'normal' : 'reverse',
    animationPlayState: isPaused ? 'paused' : 'running',
  } as React.CSSProperties;

  return (
    <span
      className={`inline-block shiny-text ${className}`}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children ?? text}
    </span>
  );
};

export default ShinyText;
