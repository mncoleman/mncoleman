'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { ArrowRight, Pen, User, Code2, Link2 } from 'lucide-react';

function ResumeIcon({ className, strokeWidth = 1.5, ...props }: React.SVGProps<SVGSVGElement> & { strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Rounded portrait rectangle */}
      <rect x="4" y="2" width="16" height="20" rx="2.5" ry="2.5" />
      {/* MC initials */}
      <text
        x="12"
        y="8.5"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="5"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
      >
        MC
      </text>
      {/* Content lines */}
      <line x1="8" y1="12" x2="16" y2="12" />
      <line x1="8" y1="15" x2="16" y2="15" />
      <line x1="8" y1="18" x2="13" y2="18" />
    </svg>
  );
}
import { motion } from 'motion/react';
import DarkVeil from '@/components/ui/dark-veil';
import GlassCube from '@/components/ui/glass-cube';
import ScrollFloat from '@/components/ScrollFloat';
import { TransitionLink } from '@/components/transition-link';
import { usePageTransition } from '@/components/transition-provider';

const bentoCards = [
  {
    id: 'hero',
    title: 'Matthew Coleman',
    description:
      'Welcome to my personal website. I write about technology, share resources, and document my life journey.',
    label: 'Introduction',
    span: 'md:col-span-2 md:row-span-1',
    link: '/about',
    icon: User,
    col: 0, // grid column for pulse sweep
  },
  {
    id: 'projects',
    title: "Things I've Made",
    description:
      'A collection of projects, experiments, and tools (mostly built with AI).',
    label: 'Portfolio',
    icon: Code2,
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
    icon: Pen,
    span: 'md:col-span-1 md:row-span-1',
    link: '/blog',
    col: 0,
  },
  {
    id: 'resources',
    title: 'Resources',
    description: 'Curated collection of useful websites and tools.',
    label: 'Library',
    icon: Link2,
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

  return (
    <motion.div
      animate={isSibling ? { opacity: 0, scale: 0.95 } : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <TransitionLink href={card.link} cardId={card.id} className="group relative block p-8 h-full">
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
        <card.icon className="absolute bottom-8 right-8 h-10 w-10 text-muted-foreground/10 group-hover:text-primary/20 transition-colors" strokeWidth={1.5} />
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
    const interval = setInterval(() => {
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
      className="flex-1 flex items-center justify-center px-4 relative"
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
    </div>
  );
}

// ── Mobile: sticky cards that stack on top of each other as you scroll ──
function MobileStack() {
  const [headerH, setHeaderH] = useState(64);
  const scrollTriggerRef = useRef<HTMLDivElement>(null);
  const { activeCardId } = usePageTransition();

  useEffect(() => {
    const header = document.querySelector('header');
    if (header) setHeaderH(header.offsetHeight);
  }, []);

  const baseTop = headerH + 24;
  const cardStep = 16;

  return (
    <div
      className="flex-1 relative px-4 pb-16"
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
              <card.icon className="absolute bottom-6 right-6 h-8 w-8 text-muted-foreground/10" strokeWidth={1.5} />
            </TransitionLink>
          </motion.div>
        );
      })}

      {/* Scroll area for the ending text */}
      <div ref={scrollTriggerRef} className="h-[50vh]">
        {/* Sticky container: pins text in the center of the gap between cards and footer */}
        <div
          className="sticky flex items-center justify-center"
          style={{
            zIndex: bentoCards.length + 1,
            top: `calc(${baseTop + bentoCards.length * cardStep}px + (100vh - ${baseTop + bentoCards.length * cardStep}px) / 2 - 1.5rem)`,
          }}
        >
          <div
            style={{
              WebkitMaskImage: 'linear-gradient(to right, black 0%, rgba(0,0,0,0.5) 100%)',
              maskImage: 'linear-gradient(to right, black 0%, rgba(0,0,0,0.5) 100%)',
            }}
          >
            <ScrollFloat
              triggerRef={scrollTriggerRef as React.RefObject<HTMLElement>}
              containerClassName="text-center"
              textClassName="text-4xl md:text-5xl font-bold tracking-tight text-primary leading-tight"
            >
              That&apos;s all for now.
            </ScrollFloat>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<'desktop' | 'mobile' | null>(null);

  useEffect(() => {
    const check = () => {
      const hasHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      const isWide = window.innerWidth >= 768;
      setMode(hasHover && isWide ? 'desktop' : 'mobile');
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <>
      <DarkVeil hueShift={40} speed={0.5} resolutionScale={0.8} />
      {mode === 'desktop' && <DesktopGrid />}
      {mode === 'mobile' && <MobileStack />}
    </>
  );
}
