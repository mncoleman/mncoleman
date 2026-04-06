import { getResume } from '@/lib/resume';
import ReactMarkdown from 'react-markdown';
import { PageEntrance } from '@/components/page-entrance';

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

    return (
        <PageEntrance>
        <div className="container mx-auto px-4 py-16 max-w-4xl">
            <article className="prose prose-neutral dark:prose-invert max-w-none">
                <ReactMarkdown
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
