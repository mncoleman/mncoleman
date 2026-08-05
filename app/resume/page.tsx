import { getResume } from '@/lib/resume';
import { hasStructure, parseResume } from '@/lib/resume-parse';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PageEntrance } from '@/components/page-entrance';
import { ResumePageClient } from './ResumePageClient';

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
            <ResumePageClient resume={parsed} />
        </PageEntrance>
    );
}
