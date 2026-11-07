'use client';

import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Check, ChevronDown, Code, Heading1, Heading2, Heading3, List, ListOrdered, Pilcrow, Quote } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BlockKind = 'text' | 'h1' | 'h2' | 'h3' | 'bullets' | 'numbers' | 'quote' | 'code';

/** h1/h2/h3 are the post's three heading sizes, stored as h2/h3/h4 (the page title owns h1). */
export const BLOCK_KINDS: { id: BlockKind; label: string; icon: typeof Pilcrow }[] = [
    { id: 'text', label: 'Text', icon: Pilcrow },
    { id: 'h1', label: 'Heading 1', icon: Heading1 },
    { id: 'h2', label: 'Heading 2', icon: Heading2 },
    { id: 'h3', label: 'Heading 3', icon: Heading3 },
    { id: 'bullets', label: 'Bulleted list', icon: List },
    { id: 'numbers', label: 'Numbered list', icon: ListOrdered },
    { id: 'quote', label: 'Quote', icon: Quote },
    { id: 'code', label: 'Code block', icon: Code },
];

const LEVEL: Record<'h1' | 'h2' | 'h3', 2 | 3 | 4> = { h1: 2, h2: 3, h3: 4 };

export function currentBlock(editor: Editor): BlockKind {
    if (editor.isActive('codeBlock')) return 'code';
    if (editor.isActive('bulletList')) return 'bullets';
    if (editor.isActive('orderedList')) return 'numbers';
    if (editor.isActive('blockquote')) return 'quote';
    if (editor.isActive('heading', { level: 2 })) return 'h1';
    if (editor.isActive('heading', { level: 3 })) return 'h2';
    if (editor.isActive('heading', { level: 4 })) return 'h3';
    return 'text';
}

/** Converts the block(s) holding the selection. Unwraps any list or quote first so kinds never stack. */
export function turnInto(editor: Editor, kind: BlockKind) {
    if (currentBlock(editor) === kind && kind !== 'text') return;
    const chain = () => editor.chain().focus();
    if (editor.isActive('bulletList')) chain().toggleBulletList().run();
    else if (editor.isActive('orderedList')) chain().toggleOrderedList().run();
    if (editor.isActive('blockquote')) chain().lift('blockquote').run();
    if (editor.isActive('codeBlock') || editor.isActive('heading')) chain().setParagraph().run();
    switch (kind) {
        case 'h1': case 'h2': case 'h3': chain().setNode('heading', { level: LEVEL[kind] }).run(); break;
        case 'bullets': chain().toggleBulletList().run(); break;
        case 'numbers': chain().toggleOrderedList().run(); break;
        case 'quote': chain().setBlockquote().run(); break;
        case 'code': chain().setCodeBlock().run(); break;
        default: chain().setParagraph().run();
    }
}

/**
 * "Turn into" menu: shows the current block type and converts it. Rendered inside both the
 * floating toolbar and the classic fixed one. mousedown handlers keep the selection in the editor.
 */
export function TurnInto({ editor, className }: { editor: Editor; className?: string }) {
    const [open, setOpen] = useState(false);
    const [up, setUp] = useState(false);
    const root = useRef<HTMLDivElement>(null);
    const kind = currentBlock(editor);
    const active = BLOCK_KINDS.find((k) => k.id === kind)!;
    const Icon = active.icon;

    useEffect(() => {
        if (!open) return;
        const el = root.current;
        if (el) setUp(el.getBoundingClientRect().bottom + 280 > window.innerHeight);
        const off = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
        const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
        document.addEventListener('mousedown', off);
        document.addEventListener('keydown', esc, true);
        return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc, true); };
    }, [open]);

    return (
        <div ref={root} className={cn('relative', className)}>
            <button
                type="button"
                title="Turn into"
                aria-label="Turn into"
                aria-haspopup="menu"
                aria-expanded={open}
                onMouseDown={(e) => { e.preventDefault(); setOpen((o) => !o); }}
                className="flex h-7 items-center gap-1 rounded-md px-1.5 text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
                <Icon size={15} />
                <span className="hidden sm:inline">{active.label}</span>
                <ChevronDown size={12} className="opacity-60" />
            </button>
            {open && (
                <div
                    role="menu"
                    aria-label="Turn into"
                    onMouseDown={(e) => e.preventDefault()}
                    className={cn(
                        'absolute left-0 z-[60] w-[190px] rounded-[10px] border border-border bg-popover p-1 text-sm text-popover-foreground shadow-xl',
                        up ? 'bottom-full mb-1' : 'top-full mt-1',
                    )}
                >
                    <div className="px-2 pb-0.5 pt-1 text-[11px] uppercase tracking-wider text-muted-foreground">Turn into</div>
                    {BLOCK_KINDS.map(({ id, label, icon: I }) => (
                        <button
                            key={id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={id === kind}
                            onMouseDown={(e) => { e.preventDefault(); turnInto(editor, id); setOpen(false); }}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                        >
                            <I size={15} />
                            <span className="flex-1">{label}</span>
                            {id === kind && <Check size={13} />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
