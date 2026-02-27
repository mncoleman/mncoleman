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
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.5,
        delay: 0.05,
        ease: [0.32, 0.72, 0, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
