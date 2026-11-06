'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { Loader2, Search } from 'lucide-react';
import { authHeaders } from '@/lib/admin-auth';
import { artifactsOrigins, resolveEmbedHref } from '@/lib/post-media';
import { artifactSlug } from '@/lib/utils';
import { useAdmin } from '../admin-context';
import { embedPickerStore } from './embed-store';
import { cleanCaption, insertEmbed } from './insert';

/**
 * Floating pieces of the post-media editor features. Mount once next to the editor:
 *   <MediaUI editor={editor} />
 *  - caption/alt inputs under a selected image (writes the image's `title` / `alt`)
 *  - the "Embed artifact" picker opened by the "/" menu
 */
export function MediaUI({ editor }: { editor: Editor | null }) {
    return (
        <>
            <ImageCaptionBar editor={editor} />
            <EmbedPicker />
        </>
    );
}

// ------------------------------------------------------------------ image caption

interface Sel {
    pos: number;
    rect: { left: number; top: number; width: number };
    title: string;
    alt: string;
}

function readSelection(editor: Editor): Sel | null {
    const { selection } = editor.state;
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return null;
    const dom = editor.view.nodeDOM(selection.from);
    if (!(dom instanceof HTMLElement)) return null;
    const r = dom.getBoundingClientRect();
    return {
        pos: selection.from,
        rect: { left: r.left, top: r.bottom, width: r.width },
        title: String(selection.node.attrs.title || ''),
        alt: String(selection.node.attrs.alt || ''),
    };
}

function ImageCaptionBar({ editor }: { editor: Editor | null }) {
    const [sel, setSel] = useState<Sel | null>(null);

    useEffect(() => {
        if (!editor) return;
        const sync = () => setSel(readSelection(editor));
        sync();
        editor.on('selectionUpdate', sync);
        editor.on('transaction', sync);
        window.addEventListener('scroll', sync, true);
        window.addEventListener('resize', sync);
        return () => {
            editor.off('selectionUpdate', sync);
            editor.off('transaction', sync);
            window.removeEventListener('scroll', sync, true);
            window.removeEventListener('resize', sync);
        };
    }, [editor]);

    if (!editor || !sel) return null;
    // Keyed by position: the inputs are seeded once per selected image and typing is never overwritten.
    return <CaptionFields key={sel.pos} editor={editor} sel={sel} />;
}

function CaptionFields({ editor, sel }: { editor: Editor; sel: Sel }) {
    const [caption, setCaption] = useState(sel.title);
    const [alt, setAlt] = useState(sel.alt);
    const write = (attrs: { title?: string | null; alt?: string }) => {
        editor.chain().setNodeSelection(sel.pos).updateAttributes('image', attrs).run();
    };

    const left = Math.max(8, Math.min(sel.rect.left, window.innerWidth - 340));
    return createPortal(
        <div
            className="fixed z-50 w-[min(20rem,calc(100vw-1rem))] space-y-1 rounded-lg border border-border bg-popover p-2 text-xs text-popover-foreground shadow-lg"
            style={{ left, top: Math.min(sel.rect.top + 6, window.innerHeight - 110) }}
            role="group"
            aria-label="Image caption"
        >
            <label className="block">
                <span className="mb-0.5 block text-muted-foreground">Caption (shown under the image)</span>
                <input
                    value={caption}
                    placeholder="Add a caption"
                    maxLength={300}
                    onChange={(e) => {
                        const next = cleanCaption(e.target.value);
                        setCaption(next);
                        write({ title: next.trim() ? next : null });
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') {
                            e.preventDefault();
                            editor.commands.focus();
                        }
                    }}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
            </label>
            <label className="block">
                <span className="mb-0.5 block text-muted-foreground">Alt text (for screen readers)</span>
                <input
                    value={alt}
                    placeholder="Describe the image"
                    maxLength={300}
                    onChange={(e) => {
                        setAlt(e.target.value);
                        write({ alt: e.target.value });
                    }}
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-ring"
                />
            </label>
        </div>,
        document.body,
    );
}

// ------------------------------------------------------------------ embed picker

interface PickEntry {
    key: string;
    name: string;
    sub: string;
    href: string;
    kind: 'static' | 'dynamic';
    isPrivate: boolean;
}

interface RawArtifact {
    name?: string;
    filename?: string;
    slug?: string;
    url?: string;
    type?: string;
    visibility?: string;
}

const isHtml = (a: RawArtifact) => (a.type || '').split(';')[0].trim().toLowerCase() === 'text/html';

function toEntries(statics: RawArtifact[], dynamics: RawArtifact[]): PickEntry[] {
    const out: PickEntry[] = [];
    for (const a of dynamics) {
        if (!a.slug || !isHtml(a)) continue;
        const wanted = `${artifactsOrigins()[0]}/a/${a.slug}`;
        const href = a.url && resolveEmbedHref(a.url, []) ? a.url.replace(/\/$/, '') : wanted;
        out.push({ key: `d:${a.slug}`, name: a.name || a.slug, sub: `instant · ${a.slug}`, href, kind: 'dynamic', isPrivate: a.visibility === 'private' });
    }
    for (const a of statics) {
        if (!a.filename || !isHtml(a)) continue;
        out.push({ key: `s:${a.filename}`, name: a.name || a.filename, sub: `static · ${artifactSlug(a)}`, href: `/artifacts/${encodeURIComponent(a.filename)}`, kind: 'static', isPrivate: false });
    }
    return out;
}

function EmbedPicker() {
    const editor = useSyncExternalStore(embedPickerStore.subscribe, embedPickerStore.getState, embedPickerStore.getState);
    if (!editor) return null;
    return <EmbedPickerBody editor={editor} />;
}

function EmbedPickerBody({ editor }: { editor: Editor }) {
    const { workerUrl } = useAdmin();
    const api = workerUrl.replace(/\/$/, '');
    const [entries, setEntries] = useState<PickEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    useEffect(() => {
        let alive = true;
        const get = (path: string) => fetch(`${api}${path}`, { headers: authHeaders(), credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        Promise.all([get('/api/artifacts'), get('/api/artifacts/instant/list')]).then(([s, d]) => {
            if (!alive) return;
            if (!s && !d) setError('Could not load artifacts.');
            setEntries(toEntries(s?.artifacts || [], d?.artifacts || []));
        });
        return () => {
            alive = false;
        };
    }, [api]);

    useLayoutEffect(() => inputRef.current?.focus(), []);

    const q = query.trim().toLowerCase();
    const shown = (entries || []).filter((e) => !q || `${e.name} ${e.sub}`.toLowerCase().includes(q));
    const clamped = Math.min(active, Math.max(0, shown.length - 1));

    const close = () => {
        embedPickerStore.close();
        editor.commands.focus();
    };
    const pick = (e: PickEntry) => {
        embedPickerStore.close();
        insertEmbed(editor, e.name, e.href);
    };

    return createPortal(
        <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/50 p-4 pt-[12vh]" onMouseDown={close}>
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Embed an artifact"
                className="w-full max-w-md overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        close();
                    } else if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setActive(Math.min(shown.length - 1, clamped + 1));
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setActive(Math.max(0, clamped - 1));
                    } else if (e.key === 'Enter' && shown[clamped]) {
                        e.preventDefault();
                        pick(shown[clamped]);
                    }
                }}
            >
                <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                    <Search size={14} className="text-muted-foreground" />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setActive(0);
                        }}
                        placeholder="Search artifacts to embed"
                        className="w-full bg-transparent text-sm outline-none"
                        aria-label="Search artifacts"
                    />
                </div>
                <ul ref={listRef} className="max-h-72 overflow-y-auto p-1" role="listbox">
                    {entries === null && (
                        <li className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
                            <Loader2 size={14} className="animate-spin" /> Loading artifacts…
                        </li>
                    )}
                    {entries !== null && shown.length === 0 && (
                        <li className="px-3 py-3 text-sm text-muted-foreground">{error || 'No HTML artifacts match.'}</li>
                    )}
                    {shown.map((e, i) => (
                        <li key={e.key} role="option" aria-selected={i === clamped}>
                            <button
                                type="button"
                                onMouseEnter={() => setActive(i)}
                                onClick={() => pick(e)}
                                className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-1.5 text-left text-sm ${i === clamped ? 'bg-accent' : ''}`}
                            >
                                <span className="min-w-0 truncate">{e.name}</span>
                                <span className="shrink-0 text-xs text-muted-foreground">{e.isPrivate ? 'private · ' : ''}{e.sub}</span>
                            </button>
                        </li>
                    ))}
                </ul>
                <p className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                    Inserts <code>[Name](link &quot;embed&quot;)</code>. Private artifacts ask visitors for the password inside the frame.
                </p>
            </div>
        </div>,
        document.body,
    );
}
