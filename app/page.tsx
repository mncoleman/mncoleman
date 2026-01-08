'use client';

import Link from 'next/link';
import { ArrowRight, FileText, BookOpen, Link2, User, Code2 } from 'lucide-react';
import DarkVeil from '@/components/ui/dark-veil';

const bentoCards = [
  {
    id: 'hero',
    title: 'Matthew Coleman',
    description: 'Welcome to my personal information hub. I write about technology, share resources, and document my professional journey.',
    label: 'Introduction',
    span: 'md:col-span-2 md:row-span-1',
    link: '/about',
    icon: User
  },
  {
    id: 'projects',
    title: "Things I've Made",
    description: "A collection of projects, experiments, and tools (mostly built with AI).",
    label: 'Portfolio',
    icon: Code2,
    span: 'md:col-span-1 md:row-span-1',
    link: '/projects'
  },
  {
    id: 'blog',
    title: 'Blog',
    description: 'Thoughts on technology, AI, and software development.',
    label: 'Articles',
    icon: BookOpen,
    span: 'md:col-span-1 md:row-span-1',
    link: '/blog'
  },
  {
    id: 'resources',
    title: 'Resources',
    description: 'Curated collection of useful websites and tools.',
    label: 'Library',
    icon: Link2,
    span: 'md:col-span-1 md:row-span-1',
    link: '/resources'
  },
  {
    id: 'resume',
    title: 'Resume',
    description: 'Professional experience and qualifications.',
    label: 'Career',
    icon: FileText,
    span: 'md:col-span-1 md:row-span-1',
    link: '/resume'
  }
];

export default function Home() {
  return (
    <>
      {/* Dark Veil Background - Rendered directly with no wrapper */}
      <DarkVeil hueShift={40} speed={0.5} resolutionScale={0.8} />

      <div className="min-h-screen flex items-center justify-center py-16 px-4 relative">
        <div className="w-full max-w-5xl relative z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-fr">
            {bentoCards.map((card) => (
              <Link
                key={card.id}
                href={card.link}
                className={`${card.span} group relative overflow-hidden rounded-2xl border border-border/30 bg-background/40 backdrop-blur-xl p-8 transition-all hover:border-primary/50 hover:bg-background/50 hover:shadow-lg hover:shadow-primary/10`}
              >
                <div className="flex flex-col h-full justify-between min-h-[200px]">
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

                {/* Subtle gradient overlay on hover */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
