'use client';

import { ReactNode, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import dynamic from 'next/dynamic';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, Globe, Linkedin, Mail, MapPin, Phone } from 'lucide-react';
import { BlurText } from '@/components/ui/blur-text';
import { FallInText } from '@/components/ui/fall-in-text';
import { TextType } from '@/components/ui/text-type';
import GlassCube from '@/components/ui/glass-cube';
import { DeferUntilIdle } from '@/components/defer';
import { cn } from '@/lib/utils';
import type { ContactType, ParsedResume, ResumeExperience } from '@/lib/resume-parse';

// WebGL and purely decorative — same treatment the home page gives it, so it
// never lands in this route's initial JS.
const DarkVeil = dynamic(() => import('@/components/ui/dark-veil'), { ssr: false });

/** The site-wide frosted-glass card (see CLAUDE.md → Patterns). */
const CARD =
    'rounded-2xl border border-border/30 bg-background/40 backdrop-blur-xl p-6 md:p-8 shadow-lg ' +
    'hover:shadow-xl hover:border-primary/30 transition-all duration-300';

/** Accent used for every coloured element on this page. */
const ACCENT = 'text-blue-700 dark:text-blue-400';

const CONTACT_ICONS: Record<ContactType, typeof Globe> = {
    email: Mail,
    linkedin: Linkedin,
    website: Globe,
    location: MapPin,
    phone: Phone,
};

function Reveal({
    children,
    delay = 0,
    className,
}: {
    children: ReactNode;
    delay?: number;
    className?: string;
}) {
    // Matches `page-entrance.tsx` / `smooth-scroll.tsx`: motion is opt-out here,
    // not decoration layered over content that would otherwise be missing.
    const reducedMotion = useReducedMotion();

    if (reducedMotion) {
        return <div className={className}>{children}</div>;
    }

    return (
        <motion.div
            className={className}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
        >
            {children}
        </motion.div>
    );
}

/**
 * Section heading with the typewriter reveal.
 *
 * `TextType` starts empty and fills in after hydration, so the animated copy is
 * `aria-hidden` and the real heading text ships alongside it in a visually
 * hidden span — otherwise this statically-exported page would render `<h2>`
 * elements with no text at all for crawlers and screen readers.
 */
function SectionHeading({ text, delay = 0 }: { text: string; delay?: number }) {
    const reducedMotion = useReducedMotion();

    return (
        <Reveal delay={delay}>
            <h2 className="text-2xl font-bold tracking-tight mb-6 min-h-[2rem]">
                {reducedMotion ? (
                    text
                ) : (
                    <>
                        <span aria-hidden="true">
                            <TextType text={text} delay={delay * 1000} />
                        </span>
                        <span className="sr-only">{text}</span>
                    </>
                )}
            </h2>
        </Reveal>
    );
}

/** Inline markdown (bold lead-ins, links) without the block-level `<p>` wrapper. */
function Inline({ children }: { children: string }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                p: ({ children: content }) => <>{content}</>,
                a: ({ href, children: content, ...props }) => (
                    <a
                        href={href}
                        target={href?.startsWith('http') ? '_blank' : undefined}
                        rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                        className="underline underline-offset-4 hover:text-foreground transition-colors"
                        {...props}
                    >
                        {content}
                    </a>
                ),
            }}
        >
            {children}
        </ReactMarkdown>
    );
}

function ExperienceCard({ entry, delay }: { entry: ResumeExperience; delay: number }) {
    const [expanded, setExpanded] = useState(false);
    const collapsible = entry.bullets.length > 0;
    const meta = [entry.dates, entry.location].filter(Boolean).join(' | ');

    return (
        <Reveal delay={delay}>
            <div className={cn(CARD, collapsible && 'group cursor-pointer')}>
                <div
                    onClick={collapsible ? () => setExpanded((open) => !open) : undefined}
                    role={collapsible ? 'button' : undefined}
                    tabIndex={collapsible ? 0 : undefined}
                    aria-expanded={collapsible ? expanded : undefined}
                    onKeyDown={
                        collapsible
                            ? (event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      setExpanded((open) => !open);
                                  }
                              }
                            : undefined
                    }
                >
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                            <div className="text-lg font-semibold text-foreground mb-1">
                                <span className={cn(ACCENT, 'font-bold')}>{entry.company}</span>
                                {entry.role && (
                                    <span className="text-muted-foreground font-normal">
                                        {' '}
                                        — {entry.role}
                                    </span>
                                )}
                            </div>
                            {meta && (
                                <div className="text-sm text-muted-foreground/70 italic">{meta}</div>
                            )}
                        </div>
                        {collapsible && (
                            <div
                                className={cn(
                                    'p-1.5 rounded-full bg-muted/50 transition-transform duration-300',
                                    expanded && 'rotate-180'
                                )}
                            >
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            </div>
                        )}
                    </div>

                    {entry.summary.map((paragraph, index) => (
                        <p key={index} className="text-muted-foreground leading-relaxed mt-3">
                            <Inline>{paragraph}</Inline>
                        </p>
                    ))}
                </div>

                {collapsible && (
                    <div
                        className="grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                        style={{
                            gridTemplateRows: expanded ? '1fr' : '0fr',
                            opacity: expanded ? 1 : 0,
                        }}
                    >
                        <div className="overflow-hidden">
                            <div className="h-px bg-border/50 my-4" />
                            <ul className="space-y-3">
                                {entry.bullets.map((bullet, index) => (
                                    <li
                                        key={index}
                                        className="relative pl-5 text-muted-foreground leading-relaxed text-sm before:content-[''] before:absolute before:left-0 before:top-[9px] before:w-1.5 before:h-1.5 before:bg-blue-600 dark:before:bg-blue-400 before:rounded-full"
                                    >
                                        <Inline>{bullet}</Inline>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}
            </div>
        </Reveal>
    );
}

/**
 * The one piece of this page that isn't plain black-or-white: the home page's
 * `GlassCube` (3D tilt on hover, load wobble, depth slices) wrapping a blue
 * Dark Veil canvas with a frosted pane over it.
 *
 * The veil lives *inside* the cube's front face, so the cube's own
 * `backdrop-filter` — which only sees the page behind it — can't blur it.
 * The frosting is therefore its own layer stacked between the canvas and the
 * text.
 */
function ResumeHero({ resume }: { resume: ParsedResume }) {
    const reducedMotion = useReducedMotion();

    const content = (
        <div className="relative overflow-hidden rounded-2xl">
            {/* Dark Veil, contained to the card rather than the viewport. Waits
                for idle like the home page backdrop does — it is decoration
                sitting behind the page's LCP text, so it should not compete
                with it. The shader fades in, so arriving late reads as
                intentional rather than as a pop. */}
            <DeferUntilIdle>
                <div className="absolute inset-0 pointer-events-none" aria-hidden>
                    {/* hueShift/speed match `home-backdrop.tsx` exactly — that
                        40 is what produces the blue on the home page. The
                        shader's palette does not map to hue degrees in any way
                        you can reason about, so this number is copied, not
                        derived. */}
                    <DarkVeil contained hueShift={40} speed={0.5} resolutionScale={0.8} />
                </div>
            </DeferUntilIdle>

            {/* Frosted pane over the veil. Heavier in light mode: the shader is
                built for a dark surface and reads muddy under thin frosting. */}
            <div
                className="absolute inset-0 bg-background/65 dark:bg-background/25 backdrop-blur-[8px] pointer-events-none"
                aria-hidden
            />

            <div className="relative z-10 p-8 md:p-12">
                <h1 className="text-4xl md:text-5xl font-bold mb-2 text-foreground">
                    <FallInText text={resume.name} />
                </h1>

                {resume.headline && (
                    <div className={cn('text-lg font-medium mb-6', ACCENT)}>
                        <BlurText text={resume.headline} delay={300} />
                    </div>
                )}

                {resume.contacts.length > 0 && (
                    <div className="flex flex-wrap gap-x-6 gap-y-3">
                        {resume.contacts.map((contact, index) => {
                            const Icon = CONTACT_ICONS[contact.type];
                            return (
                                <a
                                    key={contact.href}
                                    href={contact.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    // `min-w-0 break-all` because a LinkedIn
                                    // vanity URL is one unbroken token —
                                    // flex-wrap can only wrap *between* chips,
                                    // so without this it runs past the card
                                    // edge on phones.
                                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-300 hover:translate-x-0.5 min-w-0 max-w-full break-all"
                                    style={{
                                        opacity: 0,
                                        animation: `fadeSlideIn 0.5s ease-out ${
                                            600 + index * 100
                                        }ms forwards`,
                                    }}
                                >
                                    <Icon className="w-4 h-4 shrink-0" />
                                    {contact.label}
                                </a>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );

    // GlassCube's tilt is mouse-driven and pointless without a pointer; under
    // reduced motion it already renders flat, but skipping the wrapper entirely
    // also drops the 3D context and its rAF loop.
    if (reducedMotion) {
        return (
            <div className="rounded-2xl border border-border/30 overflow-hidden shadow-lg">{content}</div>
        );
    }

    // Gentler than the home page's cards: this one is a wide banner, where 25°
    // of tilt swings the far corner much further than it does on a square.
    return (
        <GlassCube depth={24} tiltMax={9} wobbleAngle={Math.PI / 5}>
            {content}
        </GlassCube>
    );
}

export function ResumePageClient({ resume }: { resume: ParsedResume }) {
    return (
        <div className="container mx-auto px-4 py-12 max-w-5xl">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* ---- Hero ---------------------------------------------------- */}
                <Reveal>
                    <ResumeHero resume={resume} />
                </Reveal>

                {/* ---- Summary ------------------------------------------------- */}
                {resume.summary.length > 0 && (
                    <section>
                        <SectionHeading text={resume.summaryHeading} />
                        <Reveal delay={0.1}>
                            <div className={CARD}>
                                <div className="space-y-4">
                                    {resume.summary.map((paragraph, index) => (
                                        <p
                                            key={index}
                                            className="text-muted-foreground leading-relaxed text-[1.05rem]"
                                        >
                                            <BlurText text={paragraph} delay={200 + index * 150} duration={1200} />
                                        </p>
                                    ))}
                                </div>
                            </div>
                        </Reveal>
                    </section>
                )}

                {/* ---- Top skills ---------------------------------------------- */}
                {resume.skills.length > 0 && (
                    <section>
                        <SectionHeading text={resume.skillsHeading} delay={0.1} />
                        <Reveal delay={0.15}>
                            <div className={CARD}>
                                <ul className="space-y-4">
                                    {resume.skills.map((skill, index) => (
                                        <li
                                            key={index}
                                            className="relative pl-8 text-muted-foreground leading-relaxed before:content-['✓'] before:absolute before:left-0 before:text-blue-600 dark:before:text-blue-400 before:font-bold before:text-lg hover:pl-9 hover:text-foreground transition-all duration-300"
                                        >
                                            <Inline>{skill}</Inline>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </Reveal>
                    </section>
                )}

                {/* ---- Certifications ------------------------------------------ */}
                {resume.certifications.length > 0 && (
                    <section>
                        <SectionHeading text={resume.certificationsHeading} delay={0.1} />
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {resume.certifications.map((certification, index) => (
                                <Reveal key={index} delay={index * 0.08}>
                                    <div className="h-full rounded-2xl border border-border/30 bg-background/40 backdrop-blur-xl p-5 hover:border-primary/40 hover:bg-background/60 hover:scale-[1.02] transition-all duration-300 cursor-default">
                                        <div className="font-semibold text-foreground leading-relaxed">
                                            <Inline>{certification}</Inline>
                                        </div>
                                    </div>
                                </Reveal>
                            ))}
                        </div>
                    </section>
                )}

                {/* ---- Experience ---------------------------------------------- */}
                {resume.experience.length > 0 && (
                    <section>
                        <SectionHeading text={resume.experienceHeading} delay={0.1} />
                        <div className="space-y-6">
                            {resume.experience.map((entry, index) => (
                                <ExperienceCard
                                    key={`${entry.company}-${index}`}
                                    entry={entry}
                                    delay={index * 0.1}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* ---- Education ----------------------------------------------- */}
                {resume.education.length > 0 && (
                    <section>
                        <SectionHeading text={resume.educationHeading} delay={0.1} />
                        <Reveal delay={0.15}>
                            <div className={CARD}>
                                <div className="space-y-4">
                                    {resume.education.map((entry, index) => (
                                        <div
                                            key={index}
                                            className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3"
                                        >
                                            <span className="font-semibold text-foreground">
                                                {entry.title}
                                            </span>
                                            {entry.meta && (
                                                <span className="text-sm text-muted-foreground">
                                                    {entry.meta}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </Reveal>
                    </section>
                )}

                {/* ---- Anything the parser didn't recognise -------------------- */}
                {resume.extra.map((section) => (
                    <section key={section.heading}>
                        <SectionHeading text={section.heading} delay={0.1} />
                        <Reveal delay={0.15}>
                            <div className={CARD}>
                                <article className="prose prose-neutral dark:prose-invert max-w-none prose-headings:tracking-tight">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {section.markdown}
                                    </ReactMarkdown>
                                </article>
                            </div>
                        </Reveal>
                    </section>
                ))}
            </div>
        </div>
    );
}
