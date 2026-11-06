import { Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { buildVerseHref, formatReference, parseVerseHref } from '../../../lib/bible';
import { VerseStore, attrsToRef, type MentionAttrs, type SuggestState } from './verse-store';

/**
 * A Bible verse mention: an inline atom shown as a badge, stored in Markdown as an ordinary
 * link with a relative href, `[display text](/bible/Matt/6#v23-25)`.
 *
 * Markdown: the built-in Link mark claims the `link` token too. This node registers for the
 * same token at a higher priority and only claims hrefs of exactly the verse shape; every
 * other link is re-emitted as the same link mark (see parseMarkdown for why it cannot just
 * decline).
 */

export const BADGE_CLASS =
    'verse-mention cursor-pointer rounded bg-sky-100 px-1 text-sky-800 no-underline hover:underline dark:bg-sky-950 dark:text-sky-300';

const triggerKey = new PluginKey<SuggestState | null>('verseSuggest');
const TRIGGER = /(^|[\s￼])@([^@\n]{0,40})$/;

/** The `@query` the caret is at the end of, if any. */
export function findTrigger(state: EditorState): SuggestState | null {
    const { selection } = state;
    if (!selection.empty) return null;
    const $from = selection.$from;
    if ($from.parent.type.spec.code || $from.marks().some((m) => m.type.spec.code)) return null;
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
    const m = TRIGGER.exec(before);
    if (!m || m[2].startsWith(' ')) return null;
    return { from: $from.start() + m.index + m[1].length, to: $from.pos, query: m[2] };
}

/** Backslash-escapes what would change meaning inside link text. The spec requires `]` and backslash; the rest keep the label literal for any renderer. */
function escapeLinkText(text: string): string {
    return text.replace(/[\\[\]<*_`]/g, (c) => `\\${c}`);
}

/** marked hands back inline text HTML-escaped. */
function unescapeHtml(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

declare module '@tiptap/core' {
    interface Storage {
        verseMention: { store: VerseStore };
    }
}

export const VerseMention = Node.create<Record<string, never>, { store: VerseStore }>({
    name: 'verseMention',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: true,
    // Above Link (1000) so this node's markdown handler is asked first.
    priority: 1100,

    addAttributes() {
        return {
            text: { default: '' },
            book: { default: '' },
            chapter: { default: 1 },
            start: { default: null },
            end: { default: null },
        };
    },

    addStorage() {
        return { store: new VerseStore() };
    },

    onCreate() {
        this.storage.store.attach(this.editor);
    },
    onDestroy() {
        this.storage.store.detach();
    },

    parseHTML() {
        return [
            {
                tag: 'a[data-verse]',
                getAttrs: (el) => {
                    const ref = parseVerseHref((el as HTMLElement).getAttribute('href') || '');
                    if (!ref) return false;
                    return {
                        text: (el as HTMLElement).textContent || formatReference(ref),
                        book: ref.book,
                        chapter: ref.chapter,
                        start: ref.start ?? null,
                        end: ref.end ?? null,
                    };
                },
            },
        ];
    },

    renderHTML({ node, HTMLAttributes }) {
        const a = node.attrs as MentionAttrs;
        return [
            'a',
            mergeAttributes(HTMLAttributes, {
                'data-verse': '',
                href: buildVerseHref(attrsToRef(a)),
                class: BADGE_CLASS,
            }),
            a.text,
        ];
    },

    renderText({ node }) {
        return (node.attrs as MentionAttrs).text;
    },

    markdownTokenName: 'link',

    parseMarkdown(token, helpers) {
        // Tiptap's block-level token loop tries every handler for a token until one returns
        // content, but the inline loop uses only the FIRST handler for the token. Since this
        // node outranks Link, it is that first handler for every link in the document, so
        // returning nothing would silently drop ordinary links. Anything that is not a plain
        // verse link is therefore handed to the same mark Link would have applied.
        const href = typeof token.href === 'string' ? token.href : '';
        const ref = !token.title && href.startsWith('/bible/') ? parseVerseHref(href) : null;
        const inner = (token.tokens ?? []) as { type: string; text?: string; raw?: string }[];
        // Formatting inside the label (bold, code, images) cannot live in a badge; leave those to Link.
        if (!ref || !inner.every((t) => t.type === 'text' || t.type === 'escape')) {
            return helpers.applyMark('link', helpers.parseInline(token.tokens || []), {
                href: token.href,
                title: token.title || null,
            });
        }
        const text = unescapeHtml(inner.map((t) => t.text ?? t.raw ?? '').join('')) || formatReference(ref);
        return {
            type: 'verseMention',
            attrs: { text, book: ref.book, chapter: ref.chapter, start: ref.start ?? null, end: ref.end ?? null },
        };
    },

    renderMarkdown(node) {
        const a = node.attrs as MentionAttrs;
        return `[${escapeLinkText(a.text || formatReference(attrsToRef(a)))}](${buildVerseHref(attrsToRef(a))})`;
    },

    addNodeView() {
        const store = this.storage.store;
        return ({ node, getPos }) => {
            let current = node;
            const dom = document.createElement('a');
            dom.setAttribute('data-verse', '');
            dom.className = BADGE_CLASS;
            const paint = () => {
                const a = current.attrs as MentionAttrs;
                dom.textContent = a.text;
                dom.setAttribute('href', buildVerseHref(attrsToRef(a)));
            };
            paint();
            dom.addEventListener('click', (e) => {
                e.preventDefault();
                const pos = getPos();
                if (typeof pos === 'number') store.openEdit(pos, dom);
            });
            dom.addEventListener('mouseenter', () => store.hoverShow(dom, current.attrs as MentionAttrs));
            dom.addEventListener('mouseleave', () => store.hoverHide());
            return {
                dom,
                update: (next) => {
                    if (next.type !== current.type) return false;
                    current = next;
                    paint();
                    return true;
                },
                destroy: () => store.hoverHide(0),
            };
        };
    },

    addProseMirrorPlugins() {
        const store = this.storage.store;
        return [
            new Plugin<SuggestState | null>({
                key: triggerKey,
                state: {
                    init: () => null,
                    apply: (_tr, _prev, _old, state) => findTrigger(state),
                },
                view: () => ({
                    update: (view) => {
                        let s = triggerKey.getState(view.state) ?? null;
                        if (s && store.dismissedFrom === s.from) s = null;
                        else if (!s) store.dismissedFrom = null;
                        // Only follow the caret while the editor has it; the composer owns focus otherwise.
                        if (!s || view.hasFocus()) store.syncSuggest(view, s);
                    },
                    destroy: () => store.syncSuggestClose(),
                }),
                props: {
                    handleKeyDown: (_view, event) => store.handleKey(event),
                    handleDOMEvents: {
                        blur: () => {
                            store.syncSuggestClose();
                            return false;
                        },
                    },
                },
            }),
        ];
    },
});
