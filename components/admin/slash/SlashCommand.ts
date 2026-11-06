import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { listSlashItems, matchSlashItems, type SlashItem } from '../slash-registry';

/**
 * The "/" block menu's trigger. Same shape as the verse picker (components/admin/verse):
 * a ProseMirror plugin finds a `/query` ending at the caret, a small external store
 * carries it to React, and the plugin owns the keyboard while the menu is open.
 * @tiptap/suggestion is not a dependency, so this is the whole mechanism.
 */

export interface SlashState {
    from: number;
    to: number;
    query: string;
    rect: { left: number; right: number; top: number; bottom: number };
    sel: number;
}

const key = new PluginKey<{ from: number; to: number; query: string } | null>('slashMenu');
const TRIGGER = /(^|[\s￼])\/([A-Za-z0-9 ]{0,20})$/;

export function findSlash(state: EditorState): { from: number; to: number; query: string } | null {
    const { selection } = state;
    if (!selection.empty) return null;
    const $from = selection.$from;
    if ($from.parent.type.spec.code || $from.marks().some((m) => m.type.spec.code)) return null;
    const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼');
    const m = TRIGGER.exec(before);
    if (!m || m[2].startsWith(' ')) return null;
    return { from: $from.start() + m.index + m[1].length, to: $from.pos, query: m[2] };
}

export class SlashStore {
    private state: SlashState | null = null;
    private listeners = new Set<() => void>();
    private editor: Editor | null = null;
    private dismissedFrom: number | null = null;
    pickImage: () => void = () => undefined;
    setPickImage(fn: () => void) { this.pickImage = fn; }

    subscribe = (fn: () => void) => {
        this.listeners.add(fn);
        return () => { this.listeners.delete(fn); };
    };
    getState = () => this.state;
    private emit() { this.listeners.forEach((l) => l()); }

    attach(editor: Editor) { this.editor = editor; }
    detach() { this.editor = null; this.set(null); }

    private set(next: SlashState | null) {
        if (next === this.state) return;
        this.state = next;
        this.emit();
    }

    items(): SlashItem[] {
        return this.state ? matchSlashItems(listSlashItems(), this.state.query) : [];
    }

    setSel(sel: number) {
        if (this.state && sel !== this.state.sel) this.set({ ...this.state, sel });
    }

    sync(view: EditorView, found: { from: number; to: number; query: string } | null) {
        if (found && this.dismissedFrom === found.from) found = null;
        else if (!found) this.dismissedFrom = null;
        if (!found || !view.hasFocus()) { this.set(null); return; }
        // A query that matches nothing for a while means "/" was just a slash.
        if (found.query.length > 2 && matchSlashItems(listSlashItems(), found.query).length === 0) { this.set(null); return; }
        const rect = view.coordsAtPos(found.to);
        const prev = this.state;
        const sameQuery = prev && prev.from === found.from && prev.query === found.query;
        this.set({
            ...found,
            rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
            sel: sameQuery ? prev.sel : 0,
        });
    }

    close() { this.set(null); }

    run(item: SlashItem) {
        const s = this.state;
        const editor = this.editor;
        if (!s || !editor) return;
        this.set(null);
        editor.chain().focus().deleteRange({ from: s.from, to: s.to }).run();
        item.run({ editor, range: { from: s.from, to: s.from }, pickImage: this.pickImage });
    }

    handleKey(event: KeyboardEvent): boolean {
        const s = this.state;
        if (!s) return false;
        const list = this.items();
        if (event.key === 'ArrowDown') { this.setSel(list.length ? (s.sel + 1) % list.length : 0); return true; }
        if (event.key === 'ArrowUp') { this.setSel(list.length ? (s.sel - 1 + list.length) % list.length : 0); return true; }
        if (event.key === 'Escape') { this.dismissedFrom = s.from; this.set(null); return true; }
        if (event.key === 'Enter' || event.key === 'Tab') {
            if (!list.length) { this.dismissedFrom = s.from; this.set(null); return false; }
            this.run(list[Math.min(s.sel, list.length - 1)]);
            return true;
        }
        return false;
    }
}

declare module '@tiptap/core' {
    interface Storage {
        slashCommand: { store: SlashStore };
    }
}

export const SlashCommand = Extension.create<Record<string, never>, { store: SlashStore }>({
    name: 'slashCommand',

    addStorage() {
        return { store: new SlashStore() };
    },
    onCreate() { this.storage.store.attach(this.editor); },
    onDestroy() { this.storage.store.detach(); },

    addProseMirrorPlugins() {
        const store = this.storage.store;
        return [
            new Plugin({
                key,
                state: {
                    init: (): { from: number; to: number; query: string } | null => null,
                    apply: (_tr, _prev, _old, state) => findSlash(state),
                },
                view: () => ({
                    update: (view) => store.sync(view, key.getState(view.state) ?? null),
                    destroy: () => store.close(),
                }),
                props: {
                    handleKeyDown: (_view, event) => store.handleKey(event),
                    handleDOMEvents: {
                        blur: () => { store.close(); return false; },
                    },
                },
            }),
        ];
    },
});
