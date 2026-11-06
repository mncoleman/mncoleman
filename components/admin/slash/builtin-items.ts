import { Code, Heading1, Heading2, Heading3, ImagePlus, List, ListOrdered, Minus, Quote } from 'lucide-react';
import { registerSlashItems, type SlashItem } from '../slash-registry';

/** The blocks every post editor offers. Registered once, when the editor module loads. */
export const BUILTIN_SLASH_ITEMS: SlashItem[] = [
    { id: 'h1', title: 'Heading 1', description: 'Large section heading', keywords: 'h1 title section heading large', hint: '#', icon: Heading1, run: ({ editor }) => editor.chain().focus().setNode('heading', { level: 2 }).run() },
    { id: 'h2', title: 'Heading 2', description: 'Medium heading', keywords: 'h2 subheading medium', hint: '##', icon: Heading2, run: ({ editor }) => editor.chain().focus().setNode('heading', { level: 3 }).run() },
    { id: 'h3', title: 'Heading 3', description: 'Small heading', keywords: 'h3 small heading', hint: '###', icon: Heading3, run: ({ editor }) => editor.chain().focus().setNode('heading', { level: 4 }).run() },
    { id: 'bullets', title: 'Bulleted list', description: 'A simple list', keywords: 'ul bullets list', hint: '-', icon: List, run: ({ editor }) => editor.chain().focus().toggleBulletList().run() },
    { id: 'numbers', title: 'Numbered list', description: 'List with numbers', keywords: 'ol numbered ordered', hint: '1.', icon: ListOrdered, run: ({ editor }) => editor.chain().focus().toggleOrderedList().run() },
    { id: 'quote', title: 'Quote', description: 'Pull a passage out', keywords: 'blockquote quote callout', hint: '>', icon: Quote, run: ({ editor }) => editor.chain().focus().setBlockquote().run() },
    { id: 'code', title: 'Code block', description: 'Monospaced snippet', keywords: 'code pre snippet', hint: '```', icon: Code, run: ({ editor }) => editor.chain().focus().setCodeBlock().run() },
    { id: 'divider', title: 'Divider', description: 'A horizontal line', keywords: 'hr rule line separator', hint: '---', icon: Minus, run: ({ editor }) => editor.chain().focus().setHorizontalRule().run() },
    { id: 'image', title: 'Image upload', description: 'Upload from your computer', keywords: 'image photo picture upload', icon: ImagePlus, run: ({ pickImage }) => pickImage() },
];

registerSlashItems(BUILTIN_SLASH_ITEMS);
