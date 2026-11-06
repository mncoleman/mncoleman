import { CornerUpLeft } from 'lucide-react';
import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { firstUrl, isSafeHref, parseDefinitionLines, richSegments } from '@/lib/citations';
import { isMermaidClass, isSafeImageSrc, parseEmbedTitle, parseFigureSrc, resolveEmbedHref, type EmbedArtifact } from '@/lib/post-media';
import { ArtifactEmbed } from './ArtifactEmbed';
import { CitationsDisclosure } from './CitationsDisclosure';
import { MermaidDiagram } from './MermaidDiagram';
import { PostFigure } from './PostFigure';

/**
 * The post renderer proper. It imports nothing that touches `fs`, so the admin's Preview can use
 * it in the browser; what differs between the built site and the preview comes in as `env`:
 * the artifact list (embeds), image sizes (reserved boxes) and the link renderer (verse cards).
 */
export interface PostMarkdownEnv {
    artifacts: EmbedArtifact[];
    /** Intrinsic size of a local image, when known (build time only). */
    imageSize?: (src: string) => { width: number; height: number } | null | undefined;
    /** Renders every link that is not a footnote marker or back-arrow: verse cards, plain links. */
    anchor: (props: ComponentProps<'a'> & { node?: unknown }) => ReactNode;
    // A component, not a render callback: it may use hooks (the preview's verse card does).
}

/** Minimal hast shapes we inspect (react-markdown hands components their `node`). */
interface HNode {
    type: string;
    tagName?: string;
    value?: string;
    properties?: Record<string, unknown>;
    children?: HNode[];
}

function textOf(n: HNode): string {
    if (n.type === 'text') return n.value || '';
    return (n.children || []).map(textOf).join('');
}

/** The one meaningful child of a paragraph (whitespace-only text ignored), if there is exactly one. */
function soleElement(node: HNode | undefined): HNode | null {
    const kids = (node?.children || []).filter((c) => !(c.type === 'text' && !(c.value || '').trim()));
    return kids.length === 1 && kids[0].type === 'element' ? kids[0] : null;
}

function makeP(env: PostMarkdownEnv) {
  return function P({ node, children, ...props }: ComponentProps<'p'> & { node?: HNode }) {
    const only = soleElement(node);
    if (only?.tagName === 'img') {
        const rawSrc = String(only.properties?.src || '');
        if (isSafeImageSrc(rawSrc)) {
            const { src, paper } = parseFigureSrc(rawSrc);
            const size = env.imageSize?.(src);
            const title = only.properties?.title;
            return (
                <PostFigure
                    src={src}
                    alt={String(only.properties?.alt || '')}
                    caption={typeof title === 'string' && title.trim() ? title.trim() : undefined}
                    width={size?.width}
                    height={size?.height}
                    paper={paper}
                />
            );
        }
    }
    if (only?.tagName === 'a') {
        const spec = parseEmbedTitle(typeof only.properties?.title === 'string' ? only.properties.title : null);
        const embed = spec ? resolveEmbedHref(String(only.properties?.href || ''), env.artifacts) : null;
        if (spec && embed) return <ArtifactEmbed embed={embed} spec={spec} title={textOf(only).trim()} />;
    }
    return <p {...props}>{children}</p>;
  };
}

function Pre({ node: _node, children, ...props }: ComponentProps<'pre'> & { node?: HNode }) {
    void _node;
    const code = Children.toArray(children as ReactNode)[0];
    if (isValidElement<{ className?: string; children?: ReactNode }>(code) && isMermaidClass(code.props.className)) {
        const source = String(code.props.children ?? '').replace(/\n$/, '');
        return <MermaidDiagram source={source} fallback={<pre {...props}>{children}</pre>} />;
    }
    return <pre {...props}>{children}</pre>;
}

type FootnoteProps = { 'data-footnote-ref'?: unknown; 'data-footnote-backref'?: unknown };

/** Definition text by lower-cased label, read from the Markdown itself, so a marker knows its address and text. */
function definitionsOf(content: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const d of parseDefinitionLines(content)) if (!map.has(d.label.toLowerCase())) map.set(d.label.toLowerCase(), d.text);
    return map;
}

function EntryText({ md }: { md: string }) {
    return (
        <>
            {richSegments(md).map((s, i) => {
                let node: ReactNode = s.t;
                if (s.href && isSafeHref(s.href)) node = <a href={s.href} target="_blank" rel="noopener noreferrer">{s.t}</a>;
                if (s.i) node = <em>{node}</em>;
                else if (s.b) node = <strong>{node}</strong>;
                return <span key={i}>{node}</span>;
            })}
        </>
    );
}

const plainOf = (md: string) => richSegments(md).map((s) => s.t).join('');

/**
 * Links. A footnote marker is `[n]`: it opens the source's address in a new tab when the definition
 * holds an http(s) address, and jumps to its entry in the Citations list otherwise. A CSS-only card
 * (hover or keyboard focus) shows the entry with "Open source" and "Go to citation". The default
 * back-arrow becomes "Back to text". Everything else is as before.
 */
function makeLink(defs: Map<string, string>, env: PostMarkdownEnv) {
    return function A({ node, children, ...props }: ComponentProps<'a'> & FootnoteProps & { node?: HNode }) {
        if (props['data-footnote-ref'] !== undefined) {
            const { 'aria-describedby': _d, 'data-footnote-ref': _r, ...rest } = props as ComponentProps<'a'> & FootnoteProps;
            void _d;
            void _r;
            const entry = String(rest.href || '');
            const label = (() => {
                try {
                    return decodeURIComponent(entry.replace(/^#user-content-fn-/, '')).toLowerCase();
                } catch {
                    return '';
                }
            })();
            const text = defs.get(label) ?? '';
            const url = text ? firstUrl(text) : null;
            const n = textOf(node as HNode);
            return (
                <span className="cite-wrap">
                    <a
                        {...rest}
                        href={url ?? entry}
                        {...(url ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                        data-footnote-ref=""
                        className="cite-ref"
                        title={text ? plainOf(text) : undefined}
                        aria-label={`Citation ${n}${url ? ', opens the source in a new tab' : ''}`}
                    >
                        [{children}]
                    </a>
                    {text && (
                        <span className="cite-card" role="dialog" aria-label={`Source ${n}`}>
                            <span className="cite-card-n">Source [{children}]</span>
                            <span className="cite-card-text"><EntryText md={text} /></span>
                            <span className="cite-card-actions">
                                {url && <a href={url} target="_blank" rel="noopener noreferrer">Open source</a>}
                                <a href={entry} data-cite-go="">Go to citation</a>
                            </span>
                        </span>
                    )}
                </span>
            );
        }
        if (props['data-footnote-backref'] !== undefined) {
            // The default content is "↩" (plus a superscript count when a source is cited more than once).
            const count = node?.children?.find((c) => c.tagName === 'sup');
            const { 'data-footnote-backref': _b, className: _c, ...rest } = props as ComponentProps<'a'> & FootnoteProps;
            void _b;
            void _c;
            return (
                <a {...rest} data-footnote-backref="" className="cite-back" title="Back to text">
                    <CornerUpLeft size={14} aria-hidden="true" />
                    {count ? <sup>{textOf(count)}</sup> : null}
                </a>
            );
        }
        const Anchor = env.anchor;
        return <Anchor node={node} {...props}>{children}</Anchor>;
    };
}

function Sup({ node, children, ...props }: ComponentProps<'sup'> & { node?: HNode }) {
    const marker = node?.children?.[0]?.properties?.dataFootnoteRef !== undefined;
    return <sup {...props} className={marker ? 'cite-sup' : props.className}>{children}</sup>;
}

/** remark-gfm's footnote section becomes the "Citations (N)" toggle list; its sr-only heading is dropped. */
function Section({ node, children, ...props }: ComponentProps<'section'> & { node?: HNode }) {
    if (node?.properties?.dataFootnotes === undefined) return <section {...props}>{children}</section>;
    const list = node.children?.find((c) => c.tagName === 'ol');
    const count = (list?.children || []).filter((c) => c.tagName === 'li').length;
    return <CitationsDisclosure count={count}>{children}</CitationsDisclosure>;
}

function H2({ node: _node, children, ...props }: ComponentProps<'h2'> & { node?: HNode }) {
    void _node;
    if (props.id === 'footnote-label') return null;
    return <h2 {...props}>{children}</h2>;
}

/** Post body renderer: Markdown plus figures, artifact embeds, Mermaid and citations (GFM footnotes). Verse links as `env.anchor` draws them. */
export function PostMarkdownView({ content, env }: { content: string; env: PostMarkdownEnv }) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            remarkRehypeOptions={{
                footnoteLabel: 'Citations',
                footnoteBackLabel: (_ref: number, reref: number) => (reref > 1 ? `Back to text (${reref})` : 'Back to text'),
            }}
            components={{ a: makeLink(definitionsOf(content), env), p: makeP(env), pre: Pre, sup: Sup, section: Section, h2: H2 }}
        >
            {content}
        </ReactMarkdown>
    );
}
