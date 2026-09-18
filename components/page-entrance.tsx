'use client';

import { ReactNode, useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface PageEntranceProps {
  children: ReactNode;
}

export function PageEntrance({ children }: PageEntranceProps) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }, []);

  if (reducedMotion) {
    return <>{children}</>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      // Short and un-delayed: this runs on every page switch, after the card
      // morph has already spent ~0.4s, and it used to be 0.5s + a 50ms delay
      // (then the page's own text effects started). Opacity + translate only —
      // the scale made the whole page re-raster on the way in.
      transition={{
        duration: 0.25,
        ease: [0.32, 0.72, 0, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
