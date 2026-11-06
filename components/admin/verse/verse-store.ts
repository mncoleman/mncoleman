/**
 * Editor-side state for verse mentions: the `@` picker, the display-text composer, the
 * badge edit popover and the hover card. Plain TypeScript with no React, so the Tiptap
 * extension (and its headless markdown round-trip) never pulls in the DOM. The React layer
 * (VerseUI.tsx) subscribes through useSyncExternalStore.
 */
import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import {
    formatReference,
    getBook,
    getBookSync,
    getSearchSync,
    loadBook,
    loadIndex,
    loadSearch,
    onBibleData,
    searchPhrase,
    suggest,
    versesOf,
    versification,
    type PickGrid,
    type PickItem,
    type Translation,
    type VerseRef,
} from '../../../lib/bible';

export interface Rect {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export interface MentionAttrs {
    text: string;
    book: string;
    chapter: number;
    start: number | null;
    end: number | null;
}

export type PhraseStatus = 'none' | 'loading' | 'error' | 'ready';
export type PickAction = 'ref' | 'verse' | 'both' | 'quote';

export interface PickState {
    from: number;
    to: number;
    query: string;
    rect: Rect;
    /** Reference-shaped results first, then phrase hits. */
    items: PickItem[];
    recent: boolean;
    grid: PickGrid | null;
    message: string | null;
    phrase: PhraseStatus;
    sel: number;
}
export interface ComposeState {
    pos: number;
    ref: VerseRef;
    rect: Rect;
}
export interface EditState {
    pos: number;
    attrs: MentionAttrs;
    rect: Rect;
}
export interface HoverState {
    attrs: MentionAttrs;
    rect: Rect;
}
export interface VerseState {
    pick: PickState | null;
    compose: ComposeState | null;
    edit: EditState | null;
    hover: HoverState | null;
    translation: Translation;
    /** Short confirmation shown in the picker after a copy action. */
    notice: string | null;
    /** Bumps when lazily loaded data arrives, so previews repaint. */
    dataVersion: number;
}

export interface SuggestState {
    from: number;
    to: number;
    query: string;
}

const TR_KEY = 'verse-translation';
const RECENT_KEY = 'verse-recent';

export function refToAttrs(ref: VerseRef, text = formatReference(ref)): MentionAttrs {
    return {
        text,
        book: ref.book,
        chapter: ref.chapter,
        start: ref.start ?? null,
        end: ref.end ?? null,
    };
}
export function attrsToRef(a: MentionAttrs): VerseRef {
    const ref: VerseRef = { book: a.book, chapter: a.chapter };
    if (a.start != null) ref.start = a.start;
    if (a.end != null) ref.end = a.end;
    return ref;
}

function readStorage(key: string): string | null {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}
function writeStorage(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        /* private mode etc: remembering is a convenience only */
    }
}

function readRecent(): VerseRef[] {
    try {
        const raw = JSON.parse(readStorage(RECENT_KEY) || '[]') as VerseRef[];
        return raw.filter((r) => r && getBook(r.book) && Number.isInteger(r.chapter)).slice(0, 4);
    } catch {
        return [];
    }
}
function pushRecent(ref: VerseRef) {
    const key = JSON.stringify(ref);
    const next = [ref, ...readRecent().filter((r) => JSON.stringify(r) !== key)].slice(0, 4);
    writeStorage(RECENT_KEY, JSON.stringify(next));
}

/** Writes to the clipboard in a way that still counts as the click's gesture while text loads. */
async function copyToClipboard(text: Promise<string> | string): Promise<void> {
    const clip = navigator.clipboard;
    if (typeof ClipboardItem !== 'undefined' && clip?.write) {
        const blob = Promise.resolve(text).then((t) => new Blob([t], { type: 'text/plain' }));
        await clip.write([new ClipboardItem({ 'text/plain': blob })]);
        return;
    }
    await clip.writeText(await text);
}

function caretRect(view: EditorView, pos: number): Rect {
    const c = view.coordsAtPos(pos);
    return { left: c.left, right: c.right, top: c.top, bottom: c.bottom };
}

export class VerseStore {
    editor: Editor | null = null;
    private state: VerseState = {
        pick: null,
        compose: null,
        edit: null,
        hover: null,
        translation: 'kjv',
        notice: null,
        dataVersion: 0,
    };
    private listeners = new Set<() => void>();
    private offData: (() => void) | null = null;
    private noticeTimer: ReturnType<typeof setTimeout> | undefined;
    private suggestSeen: SuggestState | null = null;

    subscribe = (fn: () => void) => {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    };
    getState = () => this.state;
    private set(patch: Partial<VerseState>) {
        this.state = { ...this.state, ...patch };
        this.listeners.forEach((fn) => fn());
    }

    attach(editor: Editor) {
        this.editor = editor;
        const saved = readStorage(TR_KEY);
        if (saved === 'kjv' || saved === 'web') this.state = { ...this.state, translation: saved };
        // Warm the small index so ranges and verse grids are exact; failure just keeps built-in counts.
        loadIndex().catch(() => undefined);
        this.offData = onBibleData(() => {
            this.set({ dataVersion: this.state.dataVersion + 1 });
            if (this.state.pick && this.suggestSeen) this.recompute(true);
        });
    }
    detach() {
        this.offData?.();
        this.offData = null;
        this.editor = null;
        clearTimeout(this.noticeTimer);
    }

    // ---------- translation ----------
    setTranslation(tr: Translation) {
        writeStorage(TR_KEY, tr);
        this.set({ translation: tr });
        this.prefetchPreviews();
    }

    // ---------- picker ----------
    /** Called by the suggestion plugin after every editor update. */
    syncSuggest(view: EditorView, s: SuggestState | null) {
        if (!s) {
            this.suggestSeen = null;
            if (this.state.pick) this.set({ pick: null });
            return;
        }
        const prev = this.suggestSeen;
        this.suggestSeen = s;
        const moved = !prev || prev.from !== s.from || prev.query !== s.query;
        if (!moved && this.state.pick) {
            // Caret moved within the same query; just keep the popup anchored.
            this.set({ pick: { ...this.state.pick, from: s.from, to: s.to, rect: caretRect(view, s.to) } });
            return;
        }
        this.recompute(false);
    }

    /** Editor blurred or destroyed: close the picker without suppressing a later reopen. */
    syncSuggestClose() {
        this.suggestSeen = null;
        if (this.state.pick) this.set({ pick: null });
    }

    private recompute(keepSel: boolean) {
        const s = this.suggestSeen;
        const view = this.editor?.view;
        if (!s || !view) return;
        const sug = suggest(s.query, versification);
        let items: PickItem[] = sug.items;
        let recent = false;
        let phrase: PhraseStatus = 'none';
        if (!s.query.trim()) {
            items = readRecent().map((ref) => ({ kind: 'ref' as const, ref }));
            recent = items.length > 0;
        } else if (sug.phrase) {
            const data = getSearchSync();
            if (data) {
                items = [...items, ...searchPhrase(sug.phrase, data)];
                phrase = 'ready';
            } else {
                phrase = 'loading';
                loadSearch().then(
                    () => this.suggestSeen && this.recompute(true),
                    () => this.state.pick && this.set({ pick: { ...this.state.pick, phrase: 'error' } }),
                );
            }
        }
        const prevSel = this.state.pick?.sel ?? 0;
        this.set({
            pick: {
                from: s.from,
                to: s.to,
                query: s.query,
                rect: caretRect(view, s.to),
                items,
                recent,
                grid: sug.grid,
                message: sug.message,
                phrase,
                sel: keepSel ? Math.min(prevSel, Math.max(0, items.length - 1)) : 0,
            },
        });
        this.prefetchPreviews();
    }

    private prefetchPreviews() {
        const pick = this.state.pick;
        if (!pick) return;
        const seen = new Set<string>();
        for (const it of pick.items) {
            if (it.kind === 'book' || seen.has(it.ref.book)) continue;
            seen.add(it.ref.book);
            if (!getBookSync(this.state.translation, it.ref.book)) {
                loadBook(this.state.translation, it.ref.book).catch(() => undefined);
            }
        }
    }

    setSel(i: number) {
        if (this.state.pick && this.state.pick.sel !== i) this.set({ pick: { ...this.state.pick, sel: i } });
    }

    /** Keyboard while the picker is open. Returns true when the key was handled. */
    handleKey(event: KeyboardEvent): boolean {
        const pick = this.state.pick;
        if (!pick || event.isComposing) return false;
        const n = pick.items.length;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (n === 0) return false;
            const d = event.key === 'ArrowDown' ? 1 : -1;
            this.setSel((pick.sel + d + n) % n);
            return true;
        }
        if (event.key === 'Escape') {
            this.dismiss();
            return true;
        }
        if (event.altKey && !event.metaKey && !event.ctrlKey) {
            const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(event.code);
            if (idx >= 0) {
                const item = pick.items[pick.sel];
                if (item && item.kind !== 'book') void this.runAction(['ref', 'verse', 'both', 'quote'][idx] as PickAction, item);
                return true;
            }
        }
        if (event.key === 'Tab' && !event.shiftKey && this.toCitation()) return true;
        if (event.key === 'Enter' || event.key === 'Tab') {
            if (event.shiftKey) return false;
            const item = pick.items[pick.sel];
            if (!item) return pick.grid !== null; // swallow Enter while only a grid is showing
            this.choose(item, event.metaKey || event.ctrlKey);
            return true;
        }
        return false;
    }

    citationAvailable(): boolean {
        return !!(this.editor?.storage as unknown as { citation?: unknown } | undefined)?.citation;
    }

    /** Tab (or the Citation chip): the same `@query` becomes a citation. The text stays in the document until the citation is inserted or cancelled. */
    toCitation(): boolean {
        const pick = this.state.pick;
        const cite = (this.editor?.storage as unknown as { citation?: { store?: { begin: (r: { from: number; to: number }, q: string, rect: Rect) => boolean } } } | undefined)?.citation?.store;
        if (!pick || !cite) return false;
        this.dismissedFrom = pick.from;
        this.set({ pick: null });
        return cite.begin({ from: pick.from, to: pick.to }, pick.query, pick.rect);
    }

    /** Esc: close and do not reopen for this same `@`. */
    dismiss() {
        const pick = this.state.pick;
        if (pick) this.dismissedFrom = pick.from;
        this.set({ pick: null });
    }
    dismissedFrom: number | null = null;

    choose(item: PickItem, quick: boolean) {
        const pick = this.state.pick;
        const editor = this.editor;
        if (!pick || !editor) return;
        if (item.kind === 'book') {
            // Complete the book name and keep typing; a book alone is not a link target.
            this.replaceQuery(`${item.book.referenceName} `);
            return;
        }
        const ref = item.ref;
        const rect = pick.rect;
        pushRecent(ref);
        // Remove "@query" now; the mention goes in where it stood.
        editor.view.dispatch(editor.state.tr.delete(pick.from, pick.to));
        this.set({ pick: null });
        if (quick) {
            this.insertMention(pick.from, ref, formatReference(ref));
        } else {
            this.set({ compose: { pos: pick.from, ref, rect } });
        }
    }

    /** Chapter/verse grid click. */
    pickGrid(n: number) {
        const pick = this.state.pick;
        if (!pick?.grid) return;
        const g = pick.grid;
        const name = g.book.referenceName;
        if (g.type === 'chapter') {
            this.replaceQuery(`${name} ${n}:`);
        } else {
            this.choose({ kind: 'ref', ref: { book: g.book.id, chapter: g.chapter, start: n } }, false);
        }
    }

    private replaceQuery(text: string) {
        const pick = this.state.pick;
        const editor = this.editor;
        if (!pick || !editor) return;
        const tr = editor.state.tr.insertText(text, pick.from + 1, pick.to);
        editor.view.dispatch(tr);
        editor.view.focus();
    }

    // ---------- insertion ----------
    insertMention(pos: number, ref: VerseRef, text: string) {
        const editor = this.editor;
        if (!editor) return;
        const doc = editor.state.doc;
        const at = Math.min(pos, doc.content.size);
        const after = doc.textBetween(at, Math.min(at + 1, doc.content.size), '', '￼');
        const space = !/^[\s.,;:!?)\]'"’”]/.test(after);
        editor
            .chain()
            .focus()
            .insertContentAt(at, [
                { type: 'verseMention', attrs: refToAttrs(ref, text) },
                ...(space ? [{ type: 'text', text: ' ' }] : []),
            ])
            .run();
    }

    commitCompose(text: string | null) {
        const c = this.state.compose;
        if (!c) return;
        this.set({ compose: null });
        if (text === null) {
            this.editor?.commands.focus();
            return;
        }
        this.insertMention(c.pos, c.ref, text.replace(/\s+/g, ' ').trim() || formatReference(c.ref));
    }

    // ---------- copy / quote actions ----------
    private async textOf(ref: VerseRef): Promise<string> {
        const file = await loadBook(this.state.translation, ref.book);
        return versesOf(file, ref)
            .map(([, t]) => t)
            .join(' ');
    }

    private flash(message: string) {
        clearTimeout(this.noticeTimer);
        this.set({ notice: message });
        this.noticeTimer = setTimeout(() => this.set({ notice: null }), 1400);
    }

    async runAction(action: PickAction, item: PickItem) {
        if (item.kind === 'book') return;
        const ref = item.ref;
        const label = formatReference(ref);
        const chapterOnly = ref.start === undefined;
        try {
            if (action === 'ref') {
                await copyToClipboard(label);
                this.flash('Copied reference');
            } else if (chapterOnly) {
                return; // verse actions need a verse
            } else if (action === 'verse') {
                await copyToClipboard(this.textOf(ref));
                this.flash('Copied verse');
            } else if (action === 'both') {
                await copyToClipboard(this.textOf(ref).then((t) => `${label} – "${t}"`));
                this.flash('Copied reference and verse');
            } else {
                await this.pasteQuote(ref);
            }
        } catch {
            this.flash(action === 'quote' ? 'Could not load the verse' : 'Copy blocked by the browser');
        }
    }

    /** Removes "@query" and puts the verse in a blockquote below the current paragraph. */
    private async pasteQuote(ref: VerseRef) {
        const editor = this.editor;
        const pick = this.state.pick;
        if (!editor || !pick) return;
        const tr0 = this.state.translation;
        const verse = await this.textOf(ref);
        if (!verse) throw new Error('empty');
        // The editor may have moved while the book loaded; re-read the picker.
        const live = this.state.pick;
        if (!live) return;
        const { schema } = editor.state;
        const t = schema.nodes;
        const mention = t.verseMention.create(refToAttrs(ref));
        const bq = t.blockquote.create(null, [
            t.paragraph.create(null, schema.text(verse)),
            t.paragraph.create(null, [schema.text('— '), mention, schema.text(` (${tr0.toUpperCase()})`)]),
        ]);
        let tr = editor.state.tr.delete(live.from, live.to);
        const $p = tr.doc.resolve(live.from);
        const emptyBlock = $p.parent.isTextblock && $p.parent.content.size === 0;
        let end: number;
        if (emptyBlock) {
            tr = tr.replaceWith($p.before(), $p.after(), bq);
            end = $p.before() + bq.nodeSize;
        } else {
            tr = tr.insert($p.after(), bq);
            end = $p.after() + bq.nodeSize;
        }
        const next: PMNode | null | undefined = tr.doc.resolve(end).nodeAfter;
        if (!next || !next.isTextblock) {
            tr = tr.insert(end, t.paragraph.create());
        }
        tr = tr.setSelection(TextSelection.near(tr.doc.resolve(end + 1), 1)).scrollIntoView();
        pushRecent(ref);
        this.set({ pick: null });
        editor.view.dispatch(tr);
        editor.view.focus();
    }

    // ---------- badge edit ----------
    openEdit(pos: number, el: HTMLElement) {
        const editor = this.editor;
        const node = editor?.state.doc.nodeAt(pos);
        if (!editor || !node || node.type.name !== 'verseMention') return;
        const b = el.getBoundingClientRect();
        this.set({
            hover: null,
            edit: { pos, attrs: node.attrs as MentionAttrs, rect: { left: b.left, right: b.right, top: b.top, bottom: b.bottom } },
        });
    }
    saveEdit(text: string) {
        const e = this.state.edit;
        const editor = this.editor;
        this.set({ edit: null });
        if (!e || !editor) return;
        const node = editor.state.doc.nodeAt(e.pos);
        const clean = text.replace(/\s+/g, ' ').trim() || formatReference(attrsToRef(e.attrs));
        if (!node || node.type.name !== 'verseMention' || node.attrs.text === clean) return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(e.pos, undefined, { ...node.attrs, text: clean }));
    }
    removeEdit() {
        const e = this.state.edit;
        const editor = this.editor;
        this.set({ edit: null });
        if (!e || !editor) return;
        const node = editor.state.doc.nodeAt(e.pos);
        if (node?.type.name === 'verseMention') {
            editor.view.dispatch(editor.state.tr.delete(e.pos, e.pos + node.nodeSize));
        }
        editor.commands.focus();
    }
    closeEdit() {
        if (this.state.edit) this.set({ edit: null });
    }

    // ---------- hover ----------
    private hoverShowT: ReturnType<typeof setTimeout> | undefined;
    private hoverHideT: ReturnType<typeof setTimeout> | undefined;
    hoverShow(el: HTMLElement, attrs: MentionAttrs) {
        clearTimeout(this.hoverHideT);
        clearTimeout(this.hoverShowT);
        this.hoverShowT = setTimeout(() => {
            if (this.state.edit) return;
            const b = el.getBoundingClientRect();
            this.set({ hover: { attrs, rect: { left: b.left, right: b.right, top: b.top, bottom: b.bottom } } });
            loadBook(this.state.translation, attrs.book).catch(() => undefined);
        }, 150);
    }
    hoverHide(delay = 200) {
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

