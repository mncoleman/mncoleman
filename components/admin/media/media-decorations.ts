import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { parseEmbedTitle } from '../../../lib/post-media';

/**
 * Editor-only chrome for post media; adds no nodes and changes no Markdown:
 *  - a live (lazy) Mermaid preview under every ```mermaid code block
 *  - the caption (image title) shown under an image
 *  - a frame + label on a paragraph that is only a `[name](href "embed")` link
 */

const key = new PluginKey('postMediaDecorations');
const svgCache = new Map<string, string>();
const timers = new WeakMap<Node, number>();

const isDark = () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

function previewWidget(source: string): () => HTMLElement {
    return () => {
        const el = document.createElement('div');
        el.className = 'media-mermaid-preview';
        el.contentEditable = 'false';
        const dark = isDark();
        const cacheKey = `${dark ? 'd' : 'l'}:${source}`;
        const cached = svgCache.get(cacheKey);
        if (cached) {
            el.innerHTML = cached;
            return el;
        }
        el.textContent = source.trim() ? 'Rendering diagram…' : 'Type a diagram above.';
        if (!source.trim()) return el;
        // Debounced: the widget is re-created on every keystroke, only the last one renders.
        const timer = window.setTimeout(() => {
            import('../../blog-media/mermaid-engine')
                .then((m) => m.renderMermaid(source, dark))
                .then((svg) => {
                    svgCache.set(cacheKey, svg);
                    if (svgCache.size > 40) svgCache.delete(svgCache.keys().next().value as string);
                    el.dataset.state = 'ok';
                    el.innerHTML = svg;
                })
                .catch((e: unknown) => {
                    el.dataset.state = 'error';
                    el.textContent = e instanceof Error ? e.message : String(e);
                });
        }, 450);
        timers.set(el, timer);
        return el;
    };
}

function captionWidget(text: string): () => HTMLElement {
    return () => {
        const el = document.createElement('div');
        el.className = 'media-image-caption';
        el.contentEditable = 'false';
        el.textContent = text;
        return el;
    };
}

/** True for a paragraph whose only content is one run of text carrying a link mark titled `embed…`. */
export function isEmbedParagraph(node: PMNode): boolean {
    if (node.type.name !== 'paragraph' || node.childCount === 0) return false;
    let ok = true;
    let href = false;
    node.forEach((child) => {
        const link = child.marks.find((m) => m.type.name === 'link');
        if (!child.isText || !link || !parseEmbedTitle(link.attrs.title)) ok = false;
        else href = true;
    });
    return ok && href;
}

export const MediaDecorations = Extension.create({
    name: 'postMediaDecorations',
    addProseMirrorPlugins() {
        return [
            new Plugin({
                key,
                props: {
                    decorations(state) {
                        const decos: Decoration[] = [];
                        state.doc.descendants((node, pos) => {
                            if (node.type.name === 'codeBlock' && node.attrs.language === 'mermaid') {
                                const source = node.textContent;
                                decos.push(
                                    Decoration.widget(pos + node.nodeSize, previewWidget(source), {
                                        key: `mermaid:${isDark() ? 'd' : 'l'}:${source}`,
                                        side: 1,
                                        ignoreSelection: true,
                                        stopEvent: () => true,
                                        destroy: (dom: Node) => {
                                            const t = timers.get(dom);
                                            if (t) window.clearTimeout(t);
                                        },
                                    }),
                                );
                                return false;
                            }
                            if (node.type.name === 'image' && typeof node.attrs.title === 'string' && node.attrs.title.trim()) {
                                decos.push(
                                    Decoration.widget(pos + node.nodeSize, captionWidget(node.attrs.title), {
                                        key: `caption:${node.attrs.title}`,
                                        side: 1,
                                        ignoreSelection: true,
                                    }),
                                );
                            }
                            if (isEmbedParagraph(node)) {
                                decos.push(Decoration.node(pos, pos + node.nodeSize, { class: 'media-embed-para' }));
                                return false;
                            }
                            return true;
                        });
                        return DecorationSet.create(state.doc, decos);
                    },
                },
            }),
        ];
    },
});
