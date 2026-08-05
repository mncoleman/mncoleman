'use client';

import { ReactNode, useState } from 'react';
import { motion } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChevronDown, Globe, Linkedin, Mail, MapPin, Phone } from 'lucide-react';
import { BlurText } from '@/components/ui/blur-text';
import { FallInText } from '@/components/ui/fall-in-text';
import { TextType } from '@/components/ui/text-type';
import { cn } from '@/lib/utils';
import type { ContactType, ParsedResume, ResumeExperience } from '@/lib/resume-parse';

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
    return (
        <Reveal delay={delay}>
            <h2 className="text-2xl font-bold tracking-tight mb-6 min-h-[2rem]">
                <span aria-hidden="true">
                    <TextType text={text} delay={delay * 1000} />
                </span>
                <span className="sr-only">{text}</span>
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

export function ResumePageClient({ resume }: { resume: ParsedResume }) {
    return (
        <div className="container mx-auto px-4 py-12 max-w-5xl">
            <div className="max-w-4xl mx-auto space-y-8">
                {/* ---- Hero ---------------------------------------------------- */}
                <Reveal>
                    <div className={cn(CARD, 'relative overflow-hidden !p-0')}>
                        <div className="bg-gradient-to-br from-blue-700 to-blue-950 dark:from-blue-900/90 dark:to-blue-950/80 text-white p-8 md:p-12 rounded-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-72 h-72 bg-white/5 rounded-full translate-x-[30%] -translate-y-[30%] pointer-events-none" />

                            <h1 className="text-4xl md:text-5xl font-bold mb-2 relative z-10">
                                <FallInText text={resume.name} />
                            </h1>

                            {resume.headline && (
                                <div className="text-lg text-blue-200 font-medium mb-6 relative z-10">
                                    <BlurText text={resume.headline} delay={300} />
                                </div>
                            )}

                            {resume.contacts.length > 0 && (
                                <div className="flex flex-wrap gap-x-6 gap-y-3 relative z-10">
                                    {resume.contacts.map((contact, index) => {
                                        const Icon = CONTACT_ICONS[contact.type];
                                        return (
                                            <a
                                                key={contact.href}
                                                href={contact.href}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-2 text-sm text-zinc-200 hover:text-blue-200 transition-all duration-300 hover:translate-x-0.5"
                                                style={{
                                                    opacity: 0,
                                                    animation: `fadeSlideIn 0.5s ease-out ${
                                                        600 + index * 100
                                                    }ms forwards`,
                                                }}
                                            >
                                                <Icon className="w-4 h-4" />
                                                {contact.label}
                                            </a>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
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
