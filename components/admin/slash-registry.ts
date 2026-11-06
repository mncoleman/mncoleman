import type { Editor } from '@tiptap/core';
import type { ComponentType } from 'react';

/**
 * The "/" menu's list of blocks. The editor registers the built-in ones; anything
 * else (diagrams, artifact embeds, figures) adds itself with `registerSlashItems`
 * and shows up in every open editor straight away. Plain TypeScript with no React
 * runtime, so a feature module can import it without pulling in the editor.
 *
 * INTEGRATION POINT for components/admin/media/*: call
 *   registerSlashItems([{ id: 'mermaid', title: 'Diagram', description: '...', keywords: 'mermaid chart', icon: Workflow, run: ({ editor, range }) => ... }])
 * at module load, and make sure that module is imported somewhere the editor
 * bundle includes (MarkdownEditor.tsx has a marked line for it).
 */

export interface SlashContext {
    editor: Editor;
    /** The "/query" text, already removed from the document when `run` is called. */
    range: { from: number; to: number };
    /** Opens the file picker and uploads the chosen image into the document. */
    pickImage: () => void;
}

export interface SlashItem {
    id: string;
    title: string;
    description: string;
    /** Extra words that should find this block ("hr rule line"). */
    keywords?: string;
    /** Markdown shortcut shown as a hint ("##"). */
    hint?: string;
    icon: ComponentType<{ size?: number | string; className?: string }> | string;
    run: (ctx: SlashContext) => void;
}

const items: SlashItem[] = [];
const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version += 1; listeners.forEach((l) => l()); };

export function subscribeSlashItems(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}
export const slashItemsVersion = () => version;

export function registerSlashItems(next: SlashItem[]): () => void {
    for (const item of next) {
        const at = items.findIndex((i) => i.id === item.id);
        if (at >= 0) items[at] = item; else items.push(item);
    }
    changed();
    return () => {
        for (const item of next) {
            const at = items.findIndex((i) => i.id === item.id);
            if (at >= 0) items.splice(at, 1);
        }
        changed();
    };
}

export function listSlashItems(): readonly SlashItem[] {
    return items;
}

export function matchSlashItems(all: readonly SlashItem[], query: string): SlashItem[] {
    const q = query.toLowerCase().trim();
    if (!q) return [...all];
    return all.filter((i) => `${i.title} ${i.keywords ?? ''}`.toLowerCase().includes(q));
}
