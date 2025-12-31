import { getResume } from '@/lib/resume';
import ReactMarkdown from 'react-markdown';

export default async function ResumePage() {
    const resume = await getResume();

    if (!resume) {
        return (
            <div className="container mx-auto px-4 py-16 max-w-4xl">
                <h1 className="text-4xl font-bold mb-8">Resume</h1>
                <p className="text-muted-foreground">Resume not available.</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto px-4 py-16 max-w-4xl">
            <article className="prose prose-neutral dark:prose-invert max-w-none">
                <ReactMarkdown>{resume.content}</ReactMarkdown>
            </article>
        </div>
    );
}
