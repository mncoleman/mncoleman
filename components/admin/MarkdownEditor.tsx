'use client';

import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { textblockTypeInputRule } from '@tiptap/core';
import { Placeholder } from '@tiptap/extensions';
import Heading from '@tiptap/extension-heading';
import { Markdown } from '@tiptap/markdown';
import {
    Bold, Italic, Strikethrough, Heading2, Heading3, List, ListOrdered, Quote, Code, Link as LinkIcon,
    ImagePlus, Loader2, AlertTriangle, ClipboardPaste, Check, X, Undo2, Redo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { VerseMention } from './verse/VerseMention';
import { VerseUI } from './verse/VerseUI';
import { citationExtensions } from './citations/Citations';
import { CitationUI } from './citations/CitationUI';
import { SlashCommand } from './slash/SlashCommand';
import { SlashUI } from './slash/SlashUI';
import { EditorBubble } from './slash/EditorBubble';
import './slash/builtin-items';
// Importing './media' registers its "/" items (Diagram, Embed artifact) with ./slash-registry.
import { CaptionImage, MediaUI, mediaExtensions } from './media';
import { headingHint } from '@/lib/post-editor-logic';
import './page-editor.css';

/**
 * Three distinct heading sizes like Notion, shifted down one HTML level because the post title is the
 * page's h1: `# ` = Heading 1 (h2), `## ` = Heading 2 (h3), `### ` = Heading 3 (h4). Tiptap's own rule
 * maps by the number of hashes, so the page editor uses its own. Stored as `##` / `###` / `####`.
 */
const PageHeading = Heading.configure({ levels: [2, 3, 4] }).extend({
    addInputRules() {
        const type = this.type;
        return [
            textblockTypeInputRule({ find: /^#\s$/, type, getAttributes: { level: 2 } }),
            textblockTypeInputRule({ find: /^##\s$/, type, getAttributes: { level: 3 } }),
            textblockTypeInputRule({ find: /^###\s$/, type, getAttributes: { level: 4 } }),
        ];
    },
});

/**
 * Notion-style hints on the empty block holding the caret. The text is per node type here; the
 * nested cases (an empty list item, an empty quote) are told apart in page-editor.css by their
 * ancestor, because Placeholder computes decorations against the previous editor state, so the
 * document cannot be consulted from this callback.
 */
function pagePlaceholder(hint: string, { node }: { node: { type: { name: string }; attrs: Record<string, unknown> } }): string {
    const name = node.type.name;
    // h2/h3/h4 read Heading 1/2/3; a stray h1 (a `# ` loaded from Markdown) is the largest, so also Heading 1, never 0.
    if (name === 'heading') return headingHint(node.attrs.level);
    if (name === 'codeBlock') return 'Code';
    return name === 'paragraph' ? hint : '';
}

/**
 * Notion-style editor for the details-page body. What you see is what the page
 * shows; what gets stored is Markdown, so `data/*.json` stays readable and the
 * site keeps rendering it with react-markdown.
 *
 * Images dropped, pasted, or picked go through `onUpload`, which returns the
 * path to insert. The toolbar covers what the site's prose styles render.
 *
 * `variant="page"` is the blog post editor: borderless, no fixed toolbar, a 720px
 * measure at 17px/1.7, a floating toolbar over selected text and a "/" block menu.
 * The default `boxed` variant (projects, resources) is unchanged.
 */
export function MarkdownEditor({
    value,
    onChange,
    onUpload,
    placeholder = 'Write here. Type @ for a verse. Drop or paste an image to upload it.',
    className,
    variant = 'boxed',
    onEditor,
    onNotice,
}: {
    value: string;
    onChange: (markdown: string) => void;
    onUpload: (file: File) => Promise<string>;
    placeholder?: string;
    className?: string;
    variant?: 'boxed' | 'page';
    /** Hands the editor to the parent (to focus it from the title, say). Called with null on unmount. */
    onEditor?: (editor: Editor | null) => void;
    /** A short plain-language confirmation to show the writer ("Image added..."). */
    onNotice?: (text: string) => void;
}) {
    const page = variant === 'page';
    const [linkMode, setLinkMode] = useState(false);
    const [upload, setUpload] = useState<{ state: 'busy' | 'error'; text: string } | null>(null);
    const [pasteState, setPasteState] = useState<'idle' | 'done' | 'denied'>('idle');
    const fileInputRef = useRef<HTMLInputElement>(null);
    // The latest handlers, so the editor (created once) never calls a stale one.
    const uploadRef = useRef(onUpload);
    const changeRef = useRef(onChange);
    const noticeRef = useRef(onNotice);
    useEffect(() => {
        uploadRef.current = onUpload;
        changeRef.current = onChange;
        noticeRef.current = onNotice;
    });

    const editorRef = useRef<Editor | null>(null);

    const uploadFiles = async (files: File[]) => {
        const images = files.filter((f) => f.type.startsWith('image/'));
        const editor = editorRef.current;
        if (images.length === 0 || !editor) return;
        setUpload({ state: 'busy', text: `Uploading ${images.length === 1 ? images[0].name : `${images.length} images`}…` });
        try {
            for (const file of images) {
                const src = await uploadRef.current(file);
                const alt = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
                editor.chain().focus().setImage({ src, alt }).run();
            }
            setUpload(null);
            noticeRef.current?.('Image added. Images are saved as soon as you add them.');
        } catch (e: unknown) {
            setUpload({ state: 'error', text: e instanceof Error ? e.message : 'Upload failed' });
        }
    };

    const editor = useEditor({
        immediatelyRender: false,
        // v3 defaults this off; the toolbar's pressed states need it.
        shouldRerenderOnTransaction: true,
        extensions: [
            StarterKit.configure({
                heading: page ? false : { levels: [2, 3] },
                // The Citations section is always the last block, so no empty paragraph is forced after it.
                trailingNode: { node: 'paragraph', notAfter: ['paragraph', 'citationDefs'] },
                link: { openOnClick: false, autolink: true },
            }),
            CaptionImage.configure({ inline: false, allowBase64: false }),
            Placeholder.configure({ placeholder: page ? (p) => pagePlaceholder(placeholder, p) : placeholder, includeChildren: page }),
            ...(page ? [PageHeading] : []),
            VerseMention,
            ...mediaExtensions,
            ...(page ? citationExtensions : []),
            ...(page ? [SlashCommand] : []),
            Markdown,
        ],
        content: value,
        contentType: 'markdown',
        editorProps: {
            attributes: {
                class: page
                    ? 'pe-body focus:outline-none'
                    : 'prose prose-neutral dark:prose-invert prose-sm max-w-none min-h-[240px] px-4 py-3 focus:outline-none',
                ...(page ? { 'aria-label': 'Post body', spellcheck: 'true' } : {}),
            },
            handleKeyDown: page
                ? (view, event) => {
                    // Cmd/Ctrl+K on a selection opens the link box in the floating toolbar.
                    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'k' && !view.state.selection.empty) {
                        event.preventDefault();
                        setLinkMode(true);
                        return true;
                    }
                    return false;
                }
                : undefined,
            handleDrop: (_view, event) => {
                const files = Array.from(event.dataTransfer?.files || []);
                if (files.some((f) => f.type.startsWith('image/'))) {
                    event.preventDefault();
                    void uploadFiles(files);
                    return true;
                }
                return false;
            },
            handlePaste: (_view, event) => {
                const files = Array.from(event.clipboardData?.files || []);
                if (files.some((f) => f.type.startsWith('image/'))) {
                    event.preventDefault();
                    void uploadFiles(files);
                    return true;
                }
                return false;
            },
        },
        onUpdate: ({ editor }) => changeRef.current(editor.getMarkdown()),
        onSelectionUpdate: ({ editor }) => { if (editor.state.selection.empty) setLinkMode(false); },
    });
    const onEditorRef = useRef(onEditor);
    useEffect(() => { onEditorRef.current = onEditor; });
    useEffect(() => {
        editorRef.current = editor;
        onEditorRef.current?.(editor);
        if (editor && page) editor.storage.slashCommand.store.setPickImage(() => fileInputRef.current?.click());
        return () => onEditorRef.current?.(null);
    }, [editor, page]);

    const pasteClipboard = async () => {
        if (!editor) return;
        try {
            const text = await navigator.clipboard.readText();
            if (text) editor.chain().focus().insertContent(text, { contentType: 'markdown' }).run();
            setPasteState('done');
        } catch {
            setPasteState('denied');
        }
        window.setTimeout(() => setPasteState('idle'), 1400);
    };

    const setLink = () => {
        if (!editor) return;
        const previous = editor.getAttributes('link').href as string | undefined;
        const href = window.prompt('Link URL', previous || 'https://');
        if (href === null) return;
        if (!href) {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    };

    const Tool = ({ on, onClick, label, children }: { on?: boolean; onClick: () => void; label: string; children: React.ReactNode }) => (
        <button
            type="button"
            onMouseDown={(e) => {
                // Keep the selection in the editor; a click would blur it first.
                e.preventDefault();
                onClick();
            }}
            title={label}
            aria-label={label}
            aria-pressed={on}
            className={cn('rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground', on && 'bg-accent text-foreground')}
        >
            {children}
        </button>
    );

    return (
        <div className={cn(page ? 'relative' : 'group/paste relative rounded-md border border-input bg-transparent shadow-sm focus-within:ring-1 focus-within:ring-ring', className)}>
            {editor && !page && (
                <div className="flex flex-wrap items-center gap-0.5 border-b border-border/60 px-1.5 py-1">
                    <Tool label="Bold" on={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={14} /></Tool>
                    <Tool label="Italic" on={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} /></Tool>
                    <Tool label="Strikethrough" on={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={14} /></Tool>
                    <span className="mx-1 h-4 w-px bg-border" />
                    <Tool label="Heading" on={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 size={14} /></Tool>
                    <Tool label="Subheading" on={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 size={14} /></Tool>
                    <Tool label="Bullet list" on={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={14} /></Tool>
                    <Tool label="Numbered list" on={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={14} /></Tool>
                    <Tool label="Quote" on={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={14} /></Tool>
                    <Tool label="Code block" on={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code size={14} /></Tool>
                    <span className="mx-1 h-4 w-px bg-border" />
                    <Tool label="Link" on={editor.isActive('link')} onClick={setLink}><LinkIcon size={14} /></Tool>
                    <Tool label="Add image" onClick={() => fileInputRef.current?.click()}><ImagePlus size={14} /></Tool>
                    <span className="mx-1 h-4 w-px bg-border" />
                    <Tool label="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo2 size={14} /></Tool>
                    <Tool label="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo2 size={14} /></Tool>
                </div>
            )}

            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                    void uploadFiles(Array.from(e.target.files || []));
                    e.target.value = '';
                }}
            />

            <EditorContent editor={editor} />
            <VerseUI editor={editor} />
            <MediaUI editor={editor} />
            {page && <CitationUI editor={editor} />}
            {page && editor && <EditorBubble editor={editor} linkMode={linkMode} setLinkMode={setLinkMode} />}
            {page && <SlashUI editor={editor} />}

            {!page && (
                <>
            {/* Same hover-to-paste affordance as the plain fields; clipboard text lands as Markdown. */}
            <button
                type="button"
                onMouseDown={(e) => {
                    e.preventDefault();
                    void pasteClipboard();
                }}
                title={pasteState === 'denied' ? 'Clipboard access was refused — use Cmd/Ctrl+V' : 'Paste clipboard here'}
                aria-label="Paste clipboard into the body"
                className={cn(
                    'absolute right-1.5 top-10 z-10 flex items-center gap-1 rounded-md border border-border/60 bg-background/95 px-1.5 py-0.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur',
                    'opacity-0 transition-opacity group-hover/paste:opacity-100 focus-visible:opacity-100 hover:text-foreground',
                    pasteState === 'done' && 'text-green-600 opacity-100',
                    pasteState === 'denied' && 'text-red-600 opacity-100'
                )}
            >
                {pasteState === 'done' ? <Check size={12} /> : pasteState === 'denied' ? <X size={12} /> : <ClipboardPaste size={12} />}
                {pasteState === 'done' ? 'Pasted' : pasteState === 'denied' ? 'Blocked' : 'Paste'}
            </button>
                </>
            )}

            {upload && (
                <div
                    role="status"
                    className={cn(
                        page ? 'pointer-events-none fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-md border px-3 py-1.5 text-sm shadow-lg backdrop-blur'
                        : 'pointer-events-none absolute bottom-2 left-2 flex items-center gap-2 rounded-md border px-2 py-1 text-xs backdrop-blur',
                        upload.state === 'busy'
                            ? 'border-border bg-background/90 text-muted-foreground'
                            : 'border-red-500/30 bg-red-500/10 text-red-600'
                    )}
                >
                    {upload.state === 'busy' ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
                    {upload.text}
                </div>
            )}
        </div>
    );
}
