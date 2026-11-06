import type { Editor } from '@tiptap/react';

/** Tiny external store: the "/ Embed artifact" item opens the picker from outside React. */
type Listener = () => void;
let current: Editor | null = null;
const listeners = new Set<Listener>();

export const embedPickerStore = {
    subscribe(l: Listener) {
        listeners.add(l);
        return () => {
            listeners.delete(l);
        };
    },
    getState: () => current,
    open(editor: Editor) {
        current = editor;
        listeners.forEach((l) => l());
    },
    close() {
        current = null;
        listeners.forEach((l) => l());
    },
};
