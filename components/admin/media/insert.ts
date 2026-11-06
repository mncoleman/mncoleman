import type { Editor } from '@tiptap/react';

export const MERMAID_STARTER = `flowchart TD
  A[Start] --> B{Decision}
  B -- Yes --> C[Do the thing]
  B -- No --> D[Skip it]
  C --> E[Done]
  D --> E`;

/** A fenced ```mermaid block with a starter diagram, followed by an empty paragraph. */
export function insertMermaid(editor: Editor): void {
    editor
        .chain()
        .focus()
        .insertContent([
            { type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: MERMAID_STARTER }] },
            { type: 'paragraph' },
        ])
        .run();
}

/** A paragraph holding only `[name](href "embed")`, followed by an empty paragraph. */
export function insertEmbed(editor: Editor, name: string, href: string): void {
    editor
        .chain()
        .focus()
        .insertContent([
            { type: 'paragraph', content: [{ type: 'text', text: name || 'Artifact', marks: [{ type: 'link', attrs: { href, title: 'embed' } }] }] },
            { type: 'paragraph' },
        ])
        .run();
}

/** Straight double quotes would end the Markdown title early; use typographic ones, and keep it on one line. */
export function cleanCaption(raw: string): string {
    return raw
        .replace(/\s*\n+\s*/g, ' ')
        .replace(/(^|[\s([{])"/g, '$1“')
        .replace(/"/g, '”');
}
