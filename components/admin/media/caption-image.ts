import Image from '@tiptap/extension-image';

/**
 * Tiptap's Image, with a title that survives Markdown: stock serialization writes a raw `"`
 * inside the title, which ends it early. Use this in place of `Image` in the editor.
 */
export const CaptionImage = Image.extend({
    renderMarkdown(node: { attrs?: { src?: string; alt?: string; title?: string | null } }) {
        const { src = '', alt = '', title } = node.attrs || {};
        // Alt text sits inside [...]: an unescaped [ or ] ends it early. A backslash is doubled only where it
        // would otherwise escape the next bracket (marked reads \\[ and \\] back as plain brackets, but not \\\\ elsewhere).
        const a = alt.replace(/\\(?=[[\]]|$)/g, '\\\\').replace(/[[\]]/g, (c) => `\\${c}`).replace(/\s*\n+\s*/g, ' ');
        const t = (title || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s*\n+\s*/g, ' ');
        return t ? `![${a}](${src} "${t}")` : `![${a}](${src})`;
    },
});
