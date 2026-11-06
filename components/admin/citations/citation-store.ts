/**
 * Editor-side state for citations: the "new citation" form (opened from the `@` popup with Tab),
 * the edit-source panel, the marker hover card, and the open/closed state of the generated
 * Citations section. Plain TypeScript with no React, like verse-store.ts; the React layer
 * (CitationUI.tsx) subscribes through useSyncExternalStore and the section's NodeView subscribes
 * directly.
 */
import type { Editor } from '@tiptap/core';
import { TextSelection, type EditorState } from '@tiptap/pm/state';
import { cleanField, type Source } from '../../../lib/citations';
import { DEFS, REF, modelOf, readDoc, withSource, type CitationModel, type Entry } from './citation-doc';

export interface Rect {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export interface FormState {
    /** The "@query" range in the document; it stays there until the citation is inserted or cancelled. */
    from: number;
    to: number;
    /** What was typed after the `@`: the default display text. */
    q: string;
    rect: Rect;
}

export interface CiteUIState {
    form: FormState | null;
    edit: { label: string; rect: Rect } | null;
    hover: { label: string; rect: Rect } | null;
    /** Bumps whenever the numbering or any entry changes. */
    version: number;
}

const OPEN_KEY = 'pe-cites-open';

function readOpen(): boolean {
    try {
        return window.localStorage.getItem(OPEN_KEY) !== '0';
    } catch {
        return true;
    }
}
function writeOpen(open: boolean) {
    try {
        window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
    } catch {
        /* remembering is a convenience only */
    }
}

const toRect = (r: DOMRect | Rect): Rect => ({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });

export class CitationStore {
    editor: Editor | null = null;
    private state: CiteUIState = { form: null, edit: null, hover: null, version: 0 };
    private listeners = new Set<() => void>();
    private lastDoc: unknown = null;
    private lastSig = '';
    private modelCache: CitationModel | null = null;
    private open = true;
    private hoverShowT: ReturnType<typeof setTimeout> | undefined;
    private hoverHideT: ReturnType<typeof setTimeout> | undefined;

    subscribe = (fn: () => void) => {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    };
    getState = () => this.state;
    private set(patch: Partial<CiteUIState>) {
        this.state = { ...this.state, ...patch };
        this.listeners.forEach((fn) => fn());
    }

    attach(editor: Editor) {
        this.editor = editor;
        this.open = readOpen();
    }
    detach() {
        this.editor = null;
        clearTimeout(this.hoverShowT);
        clearTimeout(this.hoverHideT);
    }

    // ---------- model ----------
    model(): CitationModel {
        const doc = this.editor?.state.doc;
        if (!doc) return { order: [], sources: new Map(), uses: new Map(), refs: [], unused: [] };
        if (this.lastDoc !== doc || !this.modelCache) {
            this.modelCache = modelOf(doc);
            this.lastDoc = doc;
        }
        return this.modelCache;
    }
    isOpen = () => this.open;
    toggleOpen() {
        this.open = !this.open;
        writeOpen(this.open);
        this.set({ version: this.state.version + 1 });
    }

    /** Called after every editor update; notifies only when numbering or an entry changed. */
    sync(state: EditorState) {
        if (this.lastDoc !== state.doc) {
            this.modelCache = modelOf(state.doc);
            this.lastDoc = state.doc;
        }
        const m = this.modelCache!;
        const sig = [...m.order, ...m.unused].map((l) => `${l}\u0001${JSON.stringify(m.sources.get(l))}\u0001${m.uses.get(l)}`).join('\u0002');
        if (sig === this.lastSig) return;
        this.lastSig = sig;
        // The panels shown for a citation that no longer exists would be stale.
        const gone = (label: string) => !m.sources.has(label);
        this.set({
            version: this.state.version + 1,
            edit: this.state.edit && gone(this.state.edit.label) ? null : this.state.edit,
            hover: this.state.hover && gone(this.state.hover.label) ? null : this.state.hover,
        });
    }

    // ---------- new citation (from the @ popup) ----------
    /** Opens the form in place of the `@` picker. Returns false when the editor is not ready. */
    begin(range: { from: number; to: number }, q: string, rect: Rect): boolean {
        if (!this.editor) return false;
        this.set({ form: { from: range.from, to: range.to, q: q.trim(), rect }, hover: null, edit: null });
        return true;
    }
    closeForm() {
        if (this.state.form) this.set({ form: null });
    }
    /** Esc: drop the form and the "@query" text with it. */
    cancelForm() {
        const f = this.state.form;
        const ed = this.editor;
        this.set({ form: null });
        if (!f || !ed) return;
        const size = ed.state.doc.content.size;
        if (f.to <= size && f.from < f.to && ed.state.doc.textBetween(f.from, f.to).charAt(0) === '@') {
            ed.view.dispatch(ed.state.tr.delete(f.from, f.to));
        }
        ed.view.focus();
    }
    /** Tab / Verse chip: back to the verse picker, leaving the typed text where it is. */
    exitToVerse() {
        const f = this.state.form;
        const ed = this.editor;
        this.set({ form: null });
        if (!f || !ed) return;
        const verse = (ed.storage as unknown as { verseMention?: { store?: { dismissedFrom: number | null } } }).verseMention?.store;
        if (verse) verse.dismissedFrom = null;
        const at = Math.min(f.to, ed.state.doc.content.size);
        ed.view.focus();
        // A selection-only transaction makes the `@` trigger plugin look again.
        ed.view.dispatch(ed.state.tr.setSelection(TextSelection.near(ed.state.doc.resolve(at))));
    }

    /** Puts "display text" + marker where the `@query` was, adding the source (or reusing an identical one). */
    commit(source: Source, display: string) {
        const f = this.state.form;
        const ed = this.editor;
        if (!f || !ed) return;
        this.set({ form: null });
        const { doc, schema } = ed.state;
        const model = this.model();
        const defs = readDoc(doc).defs;
        const entriesNow: Entry[] = defs.flatMap((d) => d.entries);
        const { label, entries } = withSource(model, entriesNow, source);
        const tr = ed.state.tr;
        if (entries !== entriesNow) {
            const last = defs[defs.length - 1];
            if (last) tr.setNodeMarkup(last.pos, undefined, { entries });
            else tr.insert(doc.content.size, schema.nodes[DEFS].create({ entries }));
        }
        let { from, to } = f;
        const size = doc.content.size;
        if (to > size || from > to || doc.textBetween(from, to).charAt(0) !== '@') {
            from = to = ed.state.selection.from;
        }
        const text = cleanField(display) || 'source';
        const start = tr.mapping.map(from);
        tr.replaceWith(start, tr.mapping.map(to), [schema.text(text), schema.nodes[REF].create({ label })]);
        tr.setSelection(TextSelection.near(tr.doc.resolve(start + text.length + 1), -1));
        ed.view.dispatch(tr.scrollIntoView());
        ed.view.focus();
    }

    // ---------- editing an existing source ----------
    openEdit(label: string, el: HTMLElement) {
        if (!this.model().sources.has(label)) return;
        this.set({ edit: { label, rect: toRect(el.getBoundingClientRect()) }, hover: null, form: null });
    }
    closeEdit(refocus = false) {
        if (this.state.edit) this.set({ edit: null });
        if (refocus) this.editor?.view.focus();
    }
    /** Replaces an entry's source. Every marker pointing at the label shows the new text. */
    updateSource(label: string, source: Source) {
        const ed = this.editor;
        if (!ed) return;
        for (const d of readDoc(ed.state.doc).defs) {
            if (d.entries.some((e) => e.label === label)) {
                const entries = d.entries.map((e) => (e.label === label ? { label, source } : e));
                ed.view.dispatch(ed.state.tr.setNodeMarkup(d.pos, undefined, { entries }));
                return;
            }
        }
    }

    /** Removes a definition nothing cites (the "Not cited yet" list). Cited entries go when their last marker does. */
    removeUnused(label: string) {
        const ed = this.editor;
        if (!ed || this.model().uses.has(label)) return;
        for (const d of readDoc(ed.state.doc).defs) {
            if (d.entries.some((e) => e.label === label)) {
                const entries = d.entries.filter((e) => e.label !== label);
                const tr = entries.length
                    ? ed.state.tr.setNodeMarkup(d.pos, undefined, { entries })
                    : ed.state.tr.delete(d.pos, d.pos + d.size);
                ed.view.dispatch(tr);
                return;
            }
        }
    }

    // ---------- navigation ----------
    private flash(el: Element | null) {
        if (!el) return;
        el.classList.remove('flash');
        void (el as HTMLElement).offsetWidth;
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 1400);
    }
    goCite(label: string) {
        const ed = this.editor;
        if (!ed) return;
        if (!this.open) this.toggleOpen();
        const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        const find = () => Array.from(ed.view.dom.querySelectorAll('section.pe-cites li.ce')).find((li) => li.getAttribute('data-label') === label) ?? null;
        // The list repaints after the toggle; look on the next frame when it was closed.
        requestAnimationFrame(() => {
            const li = find();
            if (!li) return;
            li.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
            this.flash(li);
        });
    }
    backToText(label: string) {
        const ed = this.editor;
        if (!ed) return;
        const ref = this.model().refs.find((r) => r.label === label);
        const dom = ref ? (ed.view.nodeDOM(ref.pos) as HTMLElement | null) : null;
        if (!dom) return;
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        dom.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
        this.flash(dom);
    }

    // ---------- hover card ----------
    hoverShow(el: HTMLElement, label: string) {
        clearTimeout(this.hoverHideT);
        clearTimeout(this.hoverShowT);
        this.hoverShowT = setTimeout(() => {
            if (this.state.edit || this.state.form || !this.model().sources.has(label)) return;
            this.set({ hover: { label, rect: toRect(el.getBoundingClientRect()) } });
        }, 120);
    }
    hoverHide(delay = 220) {
        clearTimeout(this.hoverShowT);
        clearTimeout(this.hoverHideT);
        this.hoverHideT = setTimeout(() => {
            if (this.state.hover) this.set({ hover: null });
        }, delay);
    }
    hoverKeep() {
        clearTimeout(this.hoverHideT);
    }
}
