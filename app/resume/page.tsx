import type { Metadata } from 'next';
import { getResume } from '@/lib/resume';
import { hasStructure, parseResume } from '@/lib/resume-parse';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PageEntrance } from '@/components/page-entrance';
import { ResumePageClient, type ResumeMarkdown } from './ResumePageClient';
import type { ParsedResume } from '@/lib/resume-parse';

/**
 * Inline markdown (bold lead-ins, links) without the block-level `<p>` wrapper.
 * Rendered here, on the server, so react-markdown never reaches the browser —
 * `ResumePageClient` looks each fragment up by its source string.
 */
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

function renderResumeMarkdown(resume: ParsedResume): ResumeMarkdown {
    const inline: Record<string, React.ReactNode> = {};
    const sources = [
        ...resume.skills,
        ...resume.certifications,
        ...resume.experience.flatMap((entry) => [...entry.summary, ...entry.bullets]),
    ];
    for (const source of sources) {
        if (!Object.prototype.hasOwnProperty.call(inline, source)) {
            inline[source] = <Inline>{source}</Inline>;
        }
    }
    const extra = resume.extra.map((section) => (
        <ReactMarkdown key={section.heading} remarkPlugins={[remarkGfm]}>{section.markdown}</ReactMarkdown>
    ));
    return { inline, extra };
}

// Explicit, because the Share button exists to get this link pasted somewhere —
// `opengraph-image.tsx` supplies the picture, this supplies the words beside it.
export const metadata: Metadata = {
    title: 'Resume',
    description: 'Matthew Coleman — professional experience, skills and qualifications.',
    openGraph: {
        title: 'Matthew Coleman — Resume',
        description: 'Professional experience, skills and qualifications.',
        url: 'https://mncoleman.com/resume/',
        type: 'profile',
    },
};

export default async function ResumePage() {
    const resume = await getResume();

    if (!resume) {
        return (
            <PageEntrance>
            <div className="container mx-auto px-4 py-16 max-w-4xl">
                <h1 className="text-4xl font-bold mb-8">Resume</h1>
                <p className="text-muted-foreground">Resume not available.</p>
            </div>
            </PageEntrance>
        );
    }

    const parsed = parseResume(resume.content);

    // The structured layout needs the Notion page's heading shape. If the markdown
    // is a stub (missing credentials at build time) or has been restructured past
    // recognition, fall back to plain prose rather than rendering empty cards.
    if (!hasStructure(parsed)) {
        return (
            <PageEntrance>
            <div className="container mx-auto px-4 py-16 max-w-4xl">
                <article className="prose prose-neutral dark:prose-invert max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            a: ({ href, children, ...props }) => {
                                const isExternal = href?.startsWith('http');
                                return isExternal ? (
                                    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
                                ) : (
                                    <a href={href} {...props}>{children}</a>
                                );
                            },
                        }}
                    >{resume.content}</ReactMarkdown>
                </article>
            </div>
            </PageEntrance>
        );
    }

    return (
        <PageEntrance>
            <ResumePageClient resume={parsed} markdown={renderResumeMarkdown(parsed)} />
        </PageEntrance>
    );
}
