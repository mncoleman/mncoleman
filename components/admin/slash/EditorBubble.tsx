'use client';

import { useEffect, useRef } from 'react';
import { TextSelection } from '@tiptap/pm/state';
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/react';
import { Bold, Check, Code, Heading1, Heading2, Heading3, Italic, Link as LinkIcon, Quote, Strikethrough, X } from 'lucide-react';
import { cn } from '@/lib/utils';

function normalizeUrl(raw: string): string {
    const u = raw.trim();
    if (!u) return '';
    return /^(https?:|mailto:|\/|#)/i.test(u) ? u : `https://${u}`;
}

// Module-level on purpose: BubbleMenu re-registers its plugin whenever these change identity,
// and registering dispatches a transaction that re-renders us (an endless loop otherwise).
const BUBBLE_OPTIONS = { placement: 'top', offset: 8, flip: true, shift: { padding: 8 } } as const;
const shouldShowBubble: NonNullable<BubbleMenuProps['shouldShow']> = ({ editor: ed, element, view, state, from, to }) => {
    const sel = state.selection;
    if (sel.empty || !(sel instanceof TextSelection)) return false;
    if (!(view.hasFocus() || element.contains(document.activeElement))) return false;
    return ed.isEditable && !ed.isActive('codeBlock') && state.doc.textBetween(from, to).trim().length > 0;
};

/**
 * The toolbar that floats over a text selection: bold, italic, strike, code, link,
 * headings, quote. Link mode swaps the buttons for an address box.
 */
export function EditorBubble({ editor, linkMode, setLinkMode }: { editor: Editor; linkMode: boolean; setLinkMode: (on: boolean) => void }) {
    const inputRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!linkMode) return;
        const input = inputRef.current;
        if (input) {
            input.value = (editor.getAttributes('link').href as string | undefined) ?? '';
            input.focus();
            input.select();
        }
    }, [linkMode, editor]);

    const btn = (label: string, active: boolean, run: () => void, icon: React.ReactNode) => (
        <button
            key={label}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active}
            // mousedown, not click: a click would blur the editor and lose the selection first.
            onMouseDown={(e) => { e.preventDefault(); run(); }}
            className={cn(
                'grid h-7 w-[30px] place-items-center rounded-md text-xs font-bold outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
                active && 'bg-muted text-sky-600 dark:text-sky-300',
            )}
        >
            {icon}
        </button>
    );
    const chain = () => editor.chain().focus();

    const applyLink = () => {
        const href = normalizeUrl(inputRef.current?.value ?? '');
        if (href) chain().extendMarkRange('link').setLink({ href }).run();
        else chain().extendMarkRange('link').unsetLink().run();
        setLinkMode(false);
    };

    return (
        <BubbleMenu
            editor={editor}
            options={BUBBLE_OPTIONS}
            shouldShow={shouldShowBubble}
            role="toolbar"
            aria-label="Text formatting"
            className="z-50 flex items-center gap-px rounded-[10px] border border-border bg-popover p-[3px] text-popover-foreground shadow-xl"
        >
            {linkMode ? (
                <form
                    className="flex items-center gap-1 px-1"
                    onSubmit={(e) => { e.preventDefault(); applyLink(); }}
                >
                    <input
                        ref={inputRef}
                        type="text"
                        inputMode="url"
                        placeholder="Paste or type a link, then Enter"
                        aria-label="Link address"
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setLinkMode(false); editor.commands.focus(); }
                        }}
                        className="w-[220px] bg-transparent px-1 py-1 text-[13px] outline-none placeholder:text-muted-foreground"
                    />
                    <button type="submit" title="Apply" aria-label="Apply link" className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted"><Check size={15} /></button>
                    {editor.isActive('link') && (
                        <button type="button" title="Remove link" aria-label="Remove link" onClick={() => { chain().extendMarkRange('link').unsetLink().run(); setLinkMode(false); }} className="grid h-7 w-7 place-items-center rounded-md hover:bg-muted"><X size={15} /></button>
                    )}
                </form>
            ) : (
                <>
                    {btn('Bold (Cmd+B)', editor.isActive('bold'), () => chain().toggleBold().run(), <Bold size={15} />)}
                    {btn('Italic (Cmd+I)', editor.isActive('italic'), () => chain().toggleItalic().run(), <Italic size={15} />)}
                    {btn('Strikethrough', editor.isActive('strike'), () => chain().toggleStrike().run(), <Strikethrough size={15} />)}
                    {btn('Inline code', editor.isActive('code'), () => chain().toggleCode().run(), <Code size={15} />)}
                    {btn('Link (Cmd+K)', editor.isActive('link'), () => setLinkMode(true), <LinkIcon size={15} />)}
                    <span className="mx-[3px] h-[18px] w-px bg-border" />
                    {btn('Heading 1', editor.isActive('heading', { level: 2 }), () => chain().toggleHeading({ level: 2 }).run(), <Heading1 size={15} />)}
                    {btn('Heading 2', editor.isActive('heading', { level: 3 }), () => chain().toggleHeading({ level: 3 }).run(), <Heading2 size={15} />)}
                    {btn('Heading 3', editor.isActive('heading', { level: 4 }), () => chain().toggleHeading({ level: 4 }).run(), <Heading3 size={15} />)}
                    {btn('Quote', editor.isActive('blockquote'), () => chain().toggleBlockquote().run(), <Quote size={15} />)}
                </>
            )}
        </BubbleMenu>
    );
}
