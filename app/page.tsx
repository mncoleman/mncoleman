'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { UserIcon } from '@/components/ui/user';
import { FolderCodeIcon } from '@/components/ui/folder-code';
import { SquarePenIcon } from '@/components/ui/square-pen';
import { BookmarkIcon } from '@/components/ui/bookmark';
import { ResumeIcon } from '@/components/ui/resume-icon';

interface AnimatedIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}

import { motion } from 'motion/react';
import dynamic from 'next/dynamic';
import GlassCube from '@/components/ui/glass-cube';
import { HomeBackdrop } from '@/components/home-backdrop';
import { DeferUntilVisible } from '@/components/defer';
import { TransitionLink } from '@/components/transition-link';
import { usePageTransition } from '@/components/transition-provider';

// Heavy, purely-decorative libraries (OGL for Dark Veil) load after first paint
// and stay off the homepage's initial JS chunk. The content cards remain
// server-rendered (see Home), so LCP is unaffected.
// The visitor globe holds its own WebGL context (cobe) + fetches live pins, so it
// is client-only and lazy — it never touches the homepage's initial JS or LCP.
const VisitorSection = dynamic(() => import('@/components/visitor-globe/VisitorSection'), {
  ssr: false,
});

const bentoCards = [
  {
    id: 'hero',
    title: 'Matthew Coleman',
    description:
      'Welcome to my personal website. I write about technology, share resources, and document my life journey.',
    label: 'Introduction',
    span: 'md:col-span-2 md:row-span-1',
    link: '/about',
    icon: UserIcon,
    col: 0, // grid column for pulse sweep
  },
  {
    id: 'projects',
    title: "Things I've Made",
    description:
      'A collection of projects, experiments, and tools (mostly built with AI).',
    label: 'Portfolio',
    icon: FolderCodeIcon,
    span: 'md:col-span-1 md:row-span-1',
    link: '/projects',
    col: 2,
  },
  {
    id: 'blog',
    title: 'Blog',
    description:
      'Thoughts on technology, life, and sometimes just random things.',
    label: 'Articles',
    icon: SquarePenIcon,
    span: 'md:col-span-1 md:row-span-1',
    link: '/blog',
    col: 0,
  },
  {
    id: 'resources',
    title: 'Resources',
    description: 'Curated collection of useful websites and tools.',
    label: 'Library',
    icon: BookmarkIcon,
    span: 'md:col-span-1 md:row-span-1',
    link: '/resources',
    col: 1,
  },
  {
    id: 'resume',
    title: 'Resume',
    description: 'Professional experience and qualifications.',
    label: 'Career',
    icon: ResumeIcon,
    span: 'md:col-span-1 md:row-span-1',
    link: '/resume',
    col: 2,
  },
];

function CardContent({ card }: { card: (typeof bentoCards)[number] }) {
  const { activeCardId } = usePageTransition();
  const isActive = activeCardId === card.id;
  const isSibling = activeCardId !== null && !isActive;
  const iconRef = useRef<AnimatedIconHandle>(null);
  const Icon = card.icon as React.ForwardRefExoticComponent<
    { className?: string; size?: number } & React.RefAttributes<AnimatedIconHandle>
  >;
  const isResume = card.id === 'resume';

  return (
    <motion.div
      animate={isSibling ? { opacity: 0, scale: 0.95 } : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <TransitionLink
        href={card.link}
        cardId={card.id}
        className="group relative block p-8 h-full"
        onMouseEnter={() => iconRef.current?.startAnimation()}
        onMouseLeave={() => iconRef.current?.stopAnimation()}
      >
        <div className="flex flex-col h-full justify-between min-h-[180px]">
          <div>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 block">
              {card.label}
            </span>
            <h2 className="text-3xl font-bold mb-3 group-hover:text-primary transition-colors">
              {card.title}
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              {card.description}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-6 text-sm font-medium text-primary">
            Explore
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
        {isResume ? (
          <ResumeIcon className="absolute bottom-8 right-8 text-muted-foreground/10 group-hover:text-primary/20 transition-colors" size={40} strokeWidth={1.5} />
        ) : (
          <Icon ref={iconRef} className="absolute bottom-8 right-8 text-muted-foreground/10 group-hover:text-primary/20 transition-colors" size={40} />
        )}
      </TransitionLink>
    </motion.div>
  );
}

// ── Desktop: 3D glass cubes in bento grid with idle pulse ──
function DesktopGrid() {
  // Pulse sweeps left-to-right by column (0, 1, 2)
  const [pulseCol, setPulseCol] = useState(-1);
  const lastInteraction = useRef(Date.now());

  const handleGridInteraction = useCallback(() => {
    lastInteraction.current = Date.now();
    setPulseCol(-1);
  }, []);

  useEffect(() => {
    // Only the desktop breakpoint shows this grid; skip the idle-pulse churn
    // (and re-render storm) entirely on mobile / when motion is reduced / when
    // the tab is hidden.
    const desktopMq = window.matchMedia('(min-width: 768px) and (hover: hover) and (pointer: fine)');
    const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!desktopMq.matches || reduceMq.matches) return;

    const interval = setInterval(() => {
      if (document.hidden) return;
      const idle = Date.now() - lastInteraction.current;
      if (idle >= 3000) {
        setPulseCol(prev => {
          const next = prev + 1;
          if (next > 2) {
            // Finished sweep, pause before next
            lastInteraction.current = Date.now();
            return -1;
          }
          return next;
        });
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="home-desktop flex-1 flex items-center justify-center px-4 relative"
      style={{ minHeight: 'calc(100dvh - 8rem)' }}
      onMouseMove={handleGridInteraction}
      onMouseDown={handleGridInteraction}
    >
      <div className="w-full max-w-5xl relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 auto-rows-fr">
          {bentoCards.map((card, i) => (
            <GlassCube
              key={card.id}
              className={card.span}
              pulse={pulseCol === card.col}
              wobbleAngle={(i / bentoCards.length) * Math.PI * 2}
            >
              <CardContent card={card} />
            </GlassCube>
          ))}
        </div>
      </div>

      {/* Gentle scroll cue hinting at the visitor globe below the cards. */}
      <button
        type="button"
        onClick={() => document.getElementById('visitor-globe')?.scrollIntoView({ behavior: 'smooth' })}
        aria-label="Scroll down to the visitor globe"
        className="vg-scroll-cue absolute bottom-8 left-1/2 z-10 text-muted-foreground/50 hover:text-foreground transition-colors"
      >
        <ChevronDown className="h-8 w-8" strokeWidth={1.5} />
      </button>
    </div>
  );
}

// ── Mobile: sticky cards that stack on top of each other as you scroll ──
function MobileStack() {
  const [headerH, setHeaderH] = useState(64);
  const { activeCardId } = usePageTransition();

  useEffect(() => {
    const header = document.querySelector('header');
    if (header) setHeaderH(header.offsetHeight);
  }, []);

  const baseTop = headerH + 24;
  const cardStep = 16;

  return (
    <div
      className="home-mobile flex-1 relative px-4 pb-16"
      style={{ paddingTop: `${24}px` }}
    >
      {bentoCards.map((card, i) => {
        const isSibling = activeCardId !== null && activeCardId !== card.id;
        return (
          <motion.div
            key={card.id}
            className="sticky mb-6"
            style={{
              top: `${baseTop + i * cardStep}px`,
              zIndex: i + 1,
            }}
            animate={isSibling ? { opacity: 0, scale: 0.95 } : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <TransitionLink
              href={card.link}
              cardId={card.id}
              className="group relative block p-8 rounded-2xl overflow-hidden
                border border-border/30"
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                backdropFilter: 'blur(12px) saturate(1.4)',
                WebkitBackdropFilter: 'blur(12px) saturate(1.4)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)',
              }}
            >
              <div className="flex flex-col justify-between min-h-[160px]">
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                    {card.label}
                  </span>
                  <h2 className="text-2xl font-bold mb-2">
                    {card.title}
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {card.description}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-4 text-sm font-medium text-primary">
                  Explore
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
              {card.id === 'resume' ? (
                <ResumeIcon className="absolute bottom-6 right-6 text-muted-foreground/10" size={32} strokeWidth={1.5} />
              ) : (
                <card.icon className="absolute bottom-6 right-6 text-muted-foreground/10" size={32} />
              )}
            </TransitionLink>
          </motion.div>
        );
      })}
    </div>
  );
}

export default function Home() {
  // Both layouts are server-rendered and toggled by CSS (.home-desktop /
  // .home-mobile in globals.css) so the hero card text is in the static HTML —
  // no blank first paint, no JS-driven layout flash. The heavy client behaviour
  // of the hidden layout stays inert (GlassCube rAF is IntersectionObserver-gated;
  // the idle-pulse interval only runs on the desktop breakpoint).
  return (
    <>
      <HomeBackdrop />
      <DesktopGrid />
      <MobileStack />
      {/* The globe is well below the fold, but `dynamic(ssr:false)` still downloaded cobe,
          booted a WebGL canvas and hit the visitors API during hydration — inside the LCP
          window, for a section many visitors never scroll to. Gate it on the viewport.
          minHeight reserves the space so revealing it can't shift layout. */}
      <DeferUntilVisible rootMargin="300px" minHeight={600}>
        <VisitorSection />
      </DeferUntilVisible>
    </>
  );
}
