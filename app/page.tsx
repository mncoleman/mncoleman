'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowRight, FileText, BookOpen, Link2, User, Code2 } from 'lucide-react';
import DarkVeil from '@/components/ui/dark-veil';
import GlassCube from '@/components/ui/glass-cube';
import ScrollFloat from '@/components/ScrollFloat';

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
    icon: BookOpen,
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
    icon: FileText,
    span: 'md:col-span-1 md:row-span-1',
    link: '/resume',
    col: 2,
  },
];

function CardContent({ card }: { card: (typeof bentoCards)[number] }) {
  return (
    <Link href={card.link} className="group relative block p-8 h-full">
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
      <card.icon className="absolute bottom-8 right-8 h-16 w-16 text-muted-foreground/10 group-hover:text-primary/20 transition-colors" />
    </Link>
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
      {bentoCards.map((card, i) => (
        <div
          key={card.id}
          className="sticky mb-6"
          style={{
            top: `${baseTop + i * cardStep}px`,
            zIndex: i + 1,
          }}
        >
          <Link
            href={card.link}
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
            <card.icon className="absolute bottom-6 right-6 h-12 w-12 text-muted-foreground/10" />
          </Link>
        </div>
      ))}

      {/* Scroll area for the ending text */}
      <div className="h-[80vh]">
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
              containerClassName="text-center"
              textClassName="text-4xl md:text-5xl font-bold tracking-tight text-primary leading-tight"
              scrollStart="top-=20% bottom"
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
