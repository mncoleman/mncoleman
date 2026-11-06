import { Extension, Node, mergeAttributes } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { sourceHref, startsBlock, toMarkdown, type Source } from '../../../lib/citations';
import { DEFS, REF, modelOf, normalizeTr, type CitationModel, type Entry } from './citation-doc';
import { CitationStore } from './citation-store';
import { createSectionView } from './citation-section';

/**
 * Citations as standard GFM footnotes: `text[^1]` in the body, `[^1]: MLA entry` at the end.
 * See citation-doc.ts for the document model. Markdown goes in and out through custom marked
 * tokenizers (an inline `[^label]`, and a block of consecutive definition lines), so hand-written
 * footnotes load too: any label, definitions in any order, one definition cited many times.
 */

const LABEL = '[^\\s\\]^[]+';
const DEF_LINE = new RegExp(`^ {0,3}\\[\\^(${LABEL})\\]:[ \\t]*(.*)$`);
// Not followed by `(`: `[^caret](https://…)` is an ordinary link whose text starts with a caret.
const REF_RE = new RegExp(`^\\[\\^(${LABEL})\\](?!\\()`);

/**
 * Consecutive `[^label]: text` lines, with continuation lines (indented 2+ spaces or a tab) and
 * further paragraphs (blank line, then a 4-space or tab indent) kept inside their definition.
 * `text` is the readable one-line form; `raw` is the body exactly as written (only set when it
 * spans more than one line) so a definition the editor cannot model goes back out unchanged.
 */
export function takeDefinitions(src: string): { raw: string; defs: { label: string; text: string; raw?: string }[] } | null {
    const lines = src.split('\n');
    const defs: { label: string; text: string; raw?: string; rawLines: string[] }[] = [];
    let end = 0; // number of lines consumed
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const m = DEF_LINE.exec(line);
        if (m) {
            defs.push({ label: m[1], text: m[2].trim(), rawLines: [m[2].trim()] });
            i++;
            end = i;
        } else if (defs.length && /^(?: {2,}|\t)\S/.test(line)) {
            const d = defs[defs.length - 1];
            d.text += ' ' + line.trim();
            d.rawLines.push(line.replace(/\s+$/, ''));
            i++;
            end = i;
        } else if (defs.length && line.trim() !== '' && !startsBlock(line)) {
            // Lazy continuation (GFM): an unindented line straight after the definition's text belongs to it.
            const d = defs[defs.length - 1];
            d.text += ' ' + line.trim();
            d.rawLines.push(line.replace(/\s+$/, ''));
            i++;
            end = i;
        } else if (defs.length && line.trim() === '') {
            let j = i;
            while (j < lines.length && lines[j].trim() === '') j++;
            if (j < lines.length && DEF_LINE.test(lines[j])) i = j;
            else if (j < lines.length && /^(?: {4,}|\t)\S/.test(lines[j])) {
                // Another paragraph of the same definition.
                const d = defs[defs.length - 1];
                for (let k = i; k < j; k++) d.rawLines.push('');
                i = j;
            } else break;
        } else break;
    }
    if (!defs.length) return null;
    const consumed = lines.slice(0, end);
    const raw = consumed.join('\n') + (end < lines.length ? '\n' : '');
    return { raw, defs: defs.map(({ rawLines, ...d }) => (rawLines.length > 1 ? { ...d, raw: rawLines.join('\n') } : d)) };
}

export const CitationRef = Node.create({
    name: REF,
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    draggable: false,

    addAttributes() {
        return { label: { default: '', rendered: false } };
    },

    parseHTML() {
        return [{ tag: 'sup[data-citation-ref]', getAttrs: (el) => ({ label: (el as HTMLElement).getAttribute('data-citation-ref') || '' }) }];
    },
    renderHTML({ node, HTMLAttributes }) {
        return ['sup', mergeAttributes(HTMLAttributes, { 'data-citation-ref': node.attrs.label, class: 'cm', role: 'doc-noteref' })];
    },
    // The number is not part of the text; a plain-text copy keeps the display text only.
    renderText: () => '',

    markdownTokenName: 'citationRef',
    markdownTokenizer: {
        name: 'citationRef',
        level: 'inline',
        start: (src: string) => src.indexOf('[^'),
        tokenize: (src: string) => {
            const m = REF_RE.exec(src);
            return m ? { type: 'citationRef', raw: m[0], label: m[1] } : undefined;
        },
    },
    parseMarkdown(token) {
        return { type: REF, attrs: { label: String((token as unknown as { label: string }).label) } };
    },
    renderMarkdown(node) {
        return `[^${node.attrs?.label}]`;
    },
});

export const CitationDefs = Node.create({
    name: DEFS,
    group: 'block',
    atom: true,
    selectable: false,
    draggable: false,
    isolating: true,

    addAttributes() {
        return { entries: { default: [] as Entry[], rendered: false } };
    },

    parseHTML() {
        return [];
    },
    renderHTML({ HTMLAttributes }) {
        return ['section', mergeAttributes(HTMLAttributes, { 'data-citation-defs': '' })];
    },
    renderText: () => '',

    markdownTokenName: 'citationDefs',
    markdownTokenizer: {
        name: 'citationDefs',
        level: 'block',
        start: (src: string) => {
            const m = new RegExp(`(^|\\n) {0,3}\\[\\^${LABEL}\\]:`).exec(src);
            return m ? m.index + (m[1] ? 1 : 0) : -1;
        },
        tokenize: (src: string) => {
            const got = takeDefinitions(src);
            return got ? { type: 'citationDefs', raw: got.raw, defs: got.defs } : undefined;
        },
    },
    parseMarkdown(token) {
        const defs = (token as unknown as { defs: { label: string; text: string; raw?: string }[] }).defs;
        const entries: Entry[] = defs.map((d) => ({ label: d.label, source: { text: d.text } satisfies Source, ...(d.raw !== undefined ? { raw: d.raw } : {}) }));
        return { type: DEFS, attrs: { entries } };
    },
    renderMarkdown(node) {
        const entries = (node.attrs?.entries as Entry[]) || [];
        // `raw` is a multi-line body as written; editing the entry drops it.
        return entries
            .map((e) => (e.raw !== undefined ? `[^${e.label}]:${e.raw.startsWith('\n') ? '' : ' '}${e.raw}` : `[^${e.label}]: ${toMarkdown(e.source)}`))
            .join('\n');
    },

    addNodeView() {
        const editor = this.editor;
        return ({ node }) => createSectionView(editor, (editor.storage as unknown as { citation: { store: CitationStore } }).citation.store, node);
    },
});

export const citationNodes = [CitationRef, CitationDefs];

interface PluginData {
    model: CitationModel;
    decos: DecorationSet;
}
export const citationKey = new PluginKey<PluginData>('citations');

function build(state: EditorState): PluginData {
    const model = modelOf(state.doc);
    const decos = model.refs.map((r) => {
        const n = model.order.indexOf(r.label) + 1;
        return Decoration.node(r.pos, r.pos + 1, { 'data-n': String(n), 'aria-label': `Citation ${n}` });
    });
    return { model, decos: DecorationSet.create(state.doc, decos) };
}

declare module '@tiptap/core' {
    interface Storage {
        citation: { store: CitationStore };
    }
}

/** Numbering + invariants + hover/click on markers. Use `citationExtensions` (nodes + this). */
export const Citation = Extension.create<Record<string, never>, { store: CitationStore }>({
    name: 'citation',

    addStorage() {
        return { store: new CitationStore() };
    },
    onCreate() {
        const store = this.storage.store;
        store.attach(this.editor);
        // Loaded Markdown may hold definitions in the middle, unused ones, or markers with no definition.
        const tr = normalizeTr(this.editor.state);
        if (tr) this.editor.view.dispatch(tr.setMeta('addToHistory', false).setMeta('preventUpdate', true));
        // The section's view is built before the editor has a state to read; paint it from the loaded document.
        store.sync(this.editor.state);
    },
    onDestroy() {
        this.storage.store.detach();
    },

    addProseMirrorPlugins() {
        const store = this.storage.store;
        const refEl = (e: Event) => (e.target as HTMLElement | null)?.closest?.('sup[data-citation-ref]') as HTMLElement | null;
        return [
            new Plugin<PluginData>({
                key: citationKey,
                state: {
                    init: (_c, state) => build(state),
                    apply: (tr, prev, _o, state) => (tr.docChanged ? build(state) : prev),
                },
                appendTransaction: (trs, _old, state) => (trs.some((t) => t.docChanged) ? normalizeTr(state) : null),
                props: {
                    decorations: (state) => citationKey.getState(state)?.decos ?? null,
                    handleDOMEvents: {
                        mouseover: (_v, e) => {
                            const el = refEl(e);
                            if (el) store.hoverShow(el, el.getAttribute('data-citation-ref') || '');
                            return false;
                        },
                        mouseout: (_v, e) => {
                            if (refEl(e)) store.hoverHide();
                            return false;
                        },
                        click: (_v, e) => {
                            const el = refEl(e);
                            if (!el) return false;
                            e.preventDefault();
                            const label = el.getAttribute('data-citation-ref') || '';
                            // Cmd/Ctrl+click opens the source's address. A plain click stays "go to the entry":
                            // clicking a marker also selects it (to delete or drag it), so it cannot also navigate away.
                            const source = store.model().sources.get(label);
                            const href = source && (e as MouseEvent).metaKey !== (e as MouseEvent).ctrlKey ? sourceHref(source) : null;
                            if (href) window.open(href, '_blank', 'noopener,noreferrer');
                            else store.goCite(label);
                            return true;
                        },
                    },
                    handleKeyDown: (view, e) => {
                        const sel = view.state.selection;
                        if (e.key === 'Enter' && sel instanceof NodeSelection && sel.node.type.name === REF) {
                            const dom = view.nodeDOM(sel.from) as HTMLElement | null;
                            if (dom) {
                                e.preventDefault();
                                store.openEdit(String(sel.node.attrs.label), dom);
                                return true;
                            }
                        }
                        return false;
                    },
                },
                view: () => ({
                    update: (view) => store.sync(view.state),
                }),
            }),
        ];
    },
});

/** What to add to the editor's extension list. */
export const citationExtensions = [...citationNodes, Citation];
