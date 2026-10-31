import { ArrowLeft, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ShareActions } from '@/components/ShareActions';

/**
 * The body of a project or resource detail page. Rendered by the static
 * `/projects/[slug]` and `/resources/[slug]` routes and by the admin editor's
 * preview, so the preview cannot drift from the page it previews.
 */

const KIND = {
    project: { back: 'projects', openLabel: 'View project', empty: 'No additional write-up for this project yet — use the buttons above to view or share it.' },
    resource: { back: 'resources', openLabel: 'Visit site', empty: 'No additional details for this resource yet — use the buttons above to visit or share it.' },
} as const;

/**
 * Reads `YYYY-MM[-DD]` as a local month. `new Date('2026-09-01')` is UTC midnight,
 * which is still August anywhere west of Greenwich — fine in the UTC build, wrong
 * in a browser preview.
 */
function monthLabel(date: string): string | null {
    const m = /^(\d{4})-(\d{2})/.exec(date);
    if (!m) return null;
    return format(new Date(Number(m[1]), Number(m[2]) - 1, 1), 'MMMM yyyy');
}

export function CollectionDetail({
    kind,
    name,
    description,
    date,
    tags,
    url,
    content,
    detailsPath,
    backLink,
}: {
    kind: keyof typeof KIND;
    name: string;
    description?: string;
    date?: string;
    tags: string[];
    url?: string;
    content?: string;
    detailsPath: string;
    /** The "Back to …" control; the page passes a Link, the preview a plain span. */
    backLink: (children: React.ReactNode, className: string) => React.ReactNode;
}) {
    const cfg = KIND[kind];
    const month = date ? monthLabel(date) : null;
    return (
        <>
            {backLink(
                <>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to {cfg.back}
                </>,
                'inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8'
            )}

            <header className="mb-8">
                <h1 className="text-4xl font-bold mb-4 tracking-tight">{name}</h1>
                {description && <p className="text-lg text-muted-foreground leading-relaxed">{description}</p>}
                {(month || tags.length > 0) && (
                    <div className="flex flex-wrap items-center gap-4 mt-4">
                        {month && (
                            <span className="inline-flex items-center text-sm text-muted-foreground">
                                <Calendar className="h-4 w-4 mr-2" />
                                {month}
                            </span>
                        )}
                        {tags.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                                {tags.map((tag) => (
                                    <span
                                        key={tag}
                                        className="px-3 py-1 bg-accent text-accent-foreground border border-border rounded-full text-xs font-medium whitespace-nowrap"
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </header>

            <ShareActions
                openUrl={url || undefined}
                openLabel={cfg.openLabel}
                copyUrl={url || detailsPath}
                copyLabel="Copy link"
                shareUrl={detailsPath}
                className="mb-10 pb-8 border-b border-border/30"
            />

            {content ? (
                <div className="prose prose-neutral dark:prose-invert max-w-none">
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
                    >{content}</ReactMarkdown>
                </div>
            ) : (
                <p className="text-muted-foreground">{cfg.empty}</p>
            )}
        </>
    );
}
