'use client';

import { forwardRef, useCallback, useRef, useState, type ComponentProps, type ForwardedRef } from 'react';
import { ClipboardPaste, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/**
 * Text fields with a hover-revealed Paste button.
 *
 * The field behaves exactly like a normal input: click to focus, type, etc. Hovering
 * it shows a small button in the corner that reads the clipboard and inserts the text
 * at the caret (replacing any selection), or appends it when the field is not focused.
 *
 * Insertion goes through the native value setter + an `input` event so React's
 * controlled `onChange` sees it the same way it sees typing — assigning `.value`
 * directly would be swallowed by React's value tracker.
 */

type Editable = HTMLInputElement | HTMLTextAreaElement;

function insertAtCaret(el: Editable, text: string, replace = false) {
    const focused = document.activeElement === el;
    // `replace` swaps the whole value: a month input cannot take text at a caret.
    const start = replace ? 0 : focused && el.selectionStart !== null ? el.selectionStart : el.value.length;
    const end = replace ? el.value.length : focused && el.selectionEnd !== null ? el.selectionEnd : el.value.length;
    const next = el.value.slice(0, start) + text + el.value.slice(end);

    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    setter ? setter.call(el, next) : (el.value = next);
    el.dispatchEvent(new Event('input', { bubbles: true }));

    el.focus();
    const caret = start + text.length;
    try {
        el.setSelectionRange(caret, caret);
    } catch {
        /* inputs of type month/number reject selection ranges — fine */
    }
}

/** Point both the internal ref and a forwarded one at the same element. */
function useMergedRef<T>(inner: React.MutableRefObject<T | null>, forwarded: ForwardedRef<T>) {
    return useCallback((el: T | null) => {
        inner.current = el;
        if (typeof forwarded === 'function') forwarded(el);
        else if (forwarded) forwarded.current = el;
    }, [inner, forwarded]);
}

function usePaste(ref: React.RefObject<Editable | null>, transform?: (text: string) => string, replace = false) {
    const [state, setState] = useState<'idle' | 'done' | 'denied'>('idle');
    const timer = useRef<number | null>(null);

    const paste = useCallback(async () => {
        const el = ref.current;
        if (!el) return;
        try {
            const raw = await navigator.clipboard.readText();
            const text = transform ? transform(raw) : raw;
            if (text) insertAtCaret(el, text, replace);
            setState('done');
        } catch {
            // Permission refused, or a browser without readText (Firefox): the
            // clipboard is still reachable with a normal keyboard paste.
            setState('denied');
        }
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setState('idle'), 1400);
    }, [ref, transform, replace]);

    return { state, paste };
}

function PasteButton({
    state,
    onPaste,
    className,
}: {
    state: 'idle' | 'done' | 'denied';
    onPaste: () => void;
    className?: string;
}) {
    return (
        <button
            type="button"
            // mousedown, not click, and prevented: a click would first blur the
            // field, which is exactly the caret position we want to paste at.
            onMouseDown={(e) => {
                e.preventDefault();
                onPaste();
            }}
            title={state === 'denied' ? 'Clipboard access was refused — use Cmd/Ctrl+V' : 'Paste clipboard here'}
            aria-label="Paste clipboard into this field"
            className={cn(
                'absolute right-1.5 top-1.5 z-10 flex items-center gap-1 rounded-md border border-border/60 bg-background/95 px-1.5 py-0.5 text-[11px] text-muted-foreground shadow-sm backdrop-blur',
                'opacity-0 transition-opacity group-hover/paste:opacity-100 focus-visible:opacity-100 hover:text-foreground',
                state === 'done' && 'text-green-600 opacity-100',
                state === 'denied' && 'text-red-600 opacity-100',
                className
            )}
        >
            {state === 'done' ? <Check size={12} /> : state === 'denied' ? <X size={12} /> : <ClipboardPaste size={12} />}
            {state === 'done' ? 'Pasted' : state === 'denied' ? 'Blocked' : 'Paste'}
        </button>
    );
}

type PasteInputProps = ComponentProps<typeof Input> & {
    /** Shape clipboard text before it lands (e.g. trim a date to YYYY-MM). */
    transform?: (text: string) => string;
    /** Replace the whole value instead of inserting at the caret (date-like inputs). */
    replace?: boolean;
    wrapperClassName?: string;
};

export const PasteInput = forwardRef<HTMLInputElement, PasteInputProps>(function PasteInput(
    { transform, replace, wrapperClassName, className, ...props },
    forwarded
) {
    const ref = useRef<HTMLInputElement>(null);
    const setRef = useMergedRef(ref, forwarded);
    const { state, paste } = usePaste(ref, transform, replace);
    return (
        <div className={cn('group/paste relative', wrapperClassName)}>
            <Input ref={setRef} className={cn('pr-16', className)} {...props} />
            <PasteButton state={state} onPaste={paste} />
        </div>
    );
});

type PasteTextareaProps = ComponentProps<typeof Textarea> & {
    transform?: (text: string) => string;
    wrapperClassName?: string;
    /** Rendered inside the wrapper, for overlays like an upload status. */
    children?: React.ReactNode;
};

export const PasteTextarea = forwardRef<HTMLTextAreaElement, PasteTextareaProps>(function PasteTextarea(
    { transform, wrapperClassName, className, children, ...props },
    forwarded
) {
    const ref = useRef<HTMLTextAreaElement>(null);
    const setRef = useMergedRef(ref, forwarded);
    const { state, paste } = usePaste(ref, transform);
    return (
        <div className={cn('group/paste relative', wrapperClassName)}>
            <Textarea ref={setRef} className={cn('pr-16', className)} {...props} />
            <PasteButton state={state} onPaste={paste} />
            {children}
        </div>
    );
});

/** Insert text at the caret of a textarea through the same React-aware path. */
export { insertAtCaret };
