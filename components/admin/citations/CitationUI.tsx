'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { ChevronRight, Loader2, X } from 'lucide-react';
import { authHeaders } from '@/lib/admin-auth';
import {
    cleanField,
    fallbackDisplay,
    isSafeHref,
    isUrl,
    mlaDate,
    parseTypedDate,
    richSegments,
    sourceHref,
    sanitizeLookup,
    sourceKind,
    todayIso,
    toMarkdown,
    type Source,
} from '@/lib/citations';
import { useAdmin } from '../admin-context';
import { Floating } from '../verse/VerseUI';
import { DatePicker } from '../fields/DatePicker';
import { findSameSource } from './citation-doc';
import type { CitationStore } from './citation-store';
import { ModeChips } from './ModeChips';

/**
 * The floating pieces of the citation feature: the "new citation" form (the `@` popup's Citation
 * mode), the edit-source panel and the marker hover card. Portalled to <body> like VerseUI.
 */

function useStore(store: CitationStore) {
    return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

type DetailKey = 'author' | 'title' | 'site' | 'publisher' | 'date' | 'accessed';
const DETAILS: [DetailKey, string, string][] = [
    ['author', 'Author', 'Last, First'],
    ['title', 'Page title', ''],
    ['site', 'Website', ''],
    ['publisher', 'Publisher', ''],
    ['date', 'Date published', ''],
];
type Details = Record<DetailKey, string>;
const EMPTY: Details = { author: '', title: '', site: '', publisher: '', date: '', accessed: '' };

const labelCls = 'mt-1.5 text-[11px] uppercase tracking-wide text-muted-foreground';
const fieldCls = 'w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-[13.5px] leading-snug outline-none focus:border-ring';

/** A Source from the typed source line and detail fields. Empty parts are left out. */
function buildSource(src: string, d: Details, accessed?: string): Source {
    const v = src.trim();
    const url = isUrl(v);
    const out: Source = url ? { url: v, accessed: parseTypedDate(d.accessed) || accessed || todayIso() } : { text: v };
    for (const k of ['author', 'title', 'site', 'publisher'] as const) {
        const c = cleanField(d[k]);
        if (c) out[k] = c;
    }
    const date = cleanField(d.date, 40);
    if (date) out.date = parseTypedDate(date) ?? date;
    return out;
}

function Entry({ source }: { source: Source }) {
    return (
        <>
            {richSegments(toMarkdown(source)).map((s, i) => {
                let node: ReactNode = s.t;
                if (s.href && isSafeHref(s.href)) node = <a href={s.href} target="_blank" rel="noopener noreferrer" className="underline">{s.t}</a>;
                if (s.i) node = <em>{node}</em>;
                else if (s.b) node = <strong>{node}</strong>;
                return <span key={i}>{node}</span>;
            })}
        </>
    );
}

function DetailFields({ prefix, value, onChange, url }: { prefix: string; value: Details; onChange: (k: DetailKey, v: string) => void; url: boolean }) {
    const picker = (k: 'date' | 'accessed', label: string, partial: boolean) => (
        <div key={k} className="grid justify-items-start">
            <span className={labelCls}>{label}</span>
            <DatePicker
                id={`${prefix}-${k}`}
                aria-label={label}
                value={value[k]}
                onChange={(v) => onChange(k, v)}
                allowPartial={partial}
                format={mlaDate}
                clearable
                className="mx-0 mt-0.5 rounded-md border border-input bg-background px-2 text-[13.5px]"
            />
        </div>
    );
    return (
        <>
            {DETAILS.map(([k, label, ph]) =>
                k === 'date' ? (
                    picker('date', label, true)
                ) : (
                    <div key={k} className="grid">
                        <label htmlFor={`${prefix}-${k}`} className={labelCls}>{label}</label>
                        <input
                            id={`${prefix}-${k}`}
                            value={value[k]}
                            placeholder={ph}
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(e) => onChange(k, e.target.value)}
                            className={fieldCls}
                        />
                    </div>
                ),
            )}
            {url && picker('accessed', 'Accessed', false)}
        </>
    );
}

// ------------------------------------------------------------------ new citation

function CitationForm({ store }: { store: CitationStore }) {
    const { form } = useStore(store);
    if (!form) return null;
    // Remount per opening so every field starts clean.
    return <CitationFormBody key={`${form.from}:${form.q}`} store={store} />;
}

function CitationFormBody({ store }: { store: CitationStore }) {
    const form = store.getState().form!;
    const { workerUrl } = useAdmin();
    const api = workerUrl.replace(/\/$/, '');
    const [src, setSrc] = useState('');
    const [disp, setDisp] = useState(form.q);
    const [details, setDetails] = useState<Details>({ ...EMPTY, accessed: todayIso() });
    const [more, setMore] = useState(false);
    const [status, setStatus] = useState<ReactNode>('');
    const touched = useRef(new Set<DetailKey>());
    const root = useRef<HTMLDivElement>(null);
    const srcRef = useRef<HTMLTextAreaElement>(null);
    const dispRef = useRef<HTMLInputElement>(null);
    const lookedUp = useRef('');

    useLayoutEffect(() => {
        srcRef.current?.focus();
    }, []);

    // Click anywhere else cancels, like Esc.
    useEffect(() => {
        const down = (e: MouseEvent) => {
            if (root.current && !root.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('[data-radix-popper-content-wrapper]')) store.cancelForm();
        };
        document.addEventListener('mousedown', down);
        return () => document.removeEventListener('mousedown', down);
    }, [store]);

    const value = src.trim();
    const same = value ? findSameSource(store.model(), isUrl(value) ? { url: value } : { text: value }) : null;

    // Look up a pasted address (once per address), unless this source is already cited.
    useEffect(() => {
        if (!value || !isUrl(value) || same !== null || lookedUp.current === value) return;
        const ctl = new AbortController();
        const t = window.setTimeout(async () => {
            lookedUp.current = value;
            setStatus(<><Loader2 size={12} className="animate-spin" /> Looking up details{'…'}</>);
            try {
                const r = await fetch(`${api}/api/citations/lookup`, {
                    method: 'POST',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ url: value }),
                    credentials: 'include',
                    signal: ctl.signal,
                });
                if (!r.ok) throw new Error('lookup');
                const d = sanitizeLookup(await r.json());
                if (!Object.keys(d).length) throw new Error('empty');
                setDetails((cur) => {
                    const next = { ...cur };
                    const put = (k: DetailKey, v: string | undefined) => {
                        if (v && !touched.current.has(k)) next[k] = v;
                    };
                    put('title', d.title);
                    put('author', d.author);
                    put('site', d.website);
                    put('publisher', d.publisher);
                    put('date', d.datePublished ? parseTypedDate(d.datePublished) ?? undefined : undefined);
                    return next;
                });
                setStatus(d.title ? <>Found {'“'}{d.title}{'”'}{d.website ? ` on ${d.website}` : ''}. Open Details to check it.</> : 'Found some details. Open Details to check them.');
            } catch (e) {
                if ((e as Error).name === 'AbortError') return;
                setStatus('Couldn’t read that page. You can fill in the details yourself.');
            }
        }, 400);
        return () => {
            window.clearTimeout(t);
            ctl.abort();
        };
    }, [value, same, api]);

    const sameStatus = same !== null ? (() => {
        const n = store.model().order.indexOf(same);
        return `Already cited${n >= 0 ? ` as [${n + 1}]` : ''}. This will reuse that number.`;
    })() : null;

    const insert = (defaults: boolean) => {
        if (!value) {
            setStatus('Paste a link or type the source first.');
            srcRef.current?.focus();
            return;
        }
        const source = buildSource(value, details);
        const shown = (defaults ? form.q : disp.trim()) || form.q || fallbackDisplay(source);
        store.commit(source, shown);
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        // Keys inside the date picker's popup belong to it (React bubbles portalled events up to here).
        if ((e.target as HTMLElement).closest?.('[role="dialog"]') && (e.target as HTMLElement).closest?.('[data-radix-popper-content-wrapper]')) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            store.cancelForm();
        } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            insert(e.metaKey || e.ctrlKey);
        } else if (e.key === 'Tab' && (e.target as HTMLElement).id === 'cite-src' && (e.shiftKey || !(e.target as HTMLTextAreaElement).value.trim())) {
            e.preventDefault();
            store.exitToVerse();
        }
    };

    return (
        <Floating rect={form.rect} className="w-[420px] max-w-[94vw]">
            <div ref={root} onKeyDown={onKeyDown}>
                <ModeChips mode="cite" onVerse={() => store.exitToVerse()} />
                <div className="grid gap-1 px-3 pb-2.5 pt-2">
                    <label htmlFor="cite-src" className={labelCls.replace('mt-1.5', 'mt-0')}>Source</label>
                    <textarea
                        id="cite-src"
                        ref={srcRef}
                        rows={2}
                        value={src}
                        spellCheck={false}
                        placeholder="Paste a web address, or type the source as it would appear in a bibliography (MLA)"
                        onChange={(e) => setSrc(e.target.value)}
                        onPaste={(e) => {
                            const pasted = e.clipboardData.getData('text').trim();
                            if (isUrl(pasted)) {
                                // The address is the whole point of this field; move on to the display text.
                                window.setTimeout(() => {
                                    dispRef.current?.focus();
                                    dispRef.current?.select();
                                }, 0);
                            }
                        }}
                        className={fieldCls}
                    />
                    <div aria-live="polite" className="flex min-h-0 items-center gap-1.5 text-xs text-muted-foreground empty:hidden">
                        {sameStatus ?? status}
                    </div>
                    <label htmlFor="cite-disp" className={labelCls}>Display text</label>
                    <input
                        id="cite-disp"
                        ref={dispRef}
                        value={disp}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) => setDisp(e.target.value)}
                        className={fieldCls}
                    />
                    <button
                        type="button"
                        aria-expanded={more}
                        onClick={() => setMore((m) => !m)}
                        className="mt-1 inline-flex items-center gap-1 justify-self-start py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                        <ChevronRight size={14} className={more ? 'rotate-90 transition-transform' : 'transition-transform'} />
                        Details
                    </button>
                    {more && (
                        <DetailFields
                            prefix="cite"
                            url={isUrl(value)}
                            value={details}
                            onChange={(k, v) => {
                                touched.current.add(k);
                                setDetails((d) => ({ ...d, [k]: v }));
                            }}
                        />
                    )}
                </div>
                <div className="border-t border-border px-3 py-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    Enter: insert {'·'} Cmd+Enter: insert with defaults {'·'} Esc: cancel
                    <br />
                    Tab: Verse / Citation (on an empty Source)
                </div>
            </div>
        </Floating>
    );
}

// ------------------------------------------------------------------ edit source

function EditPanel({ store }: { store: CitationStore }) {
    const { edit } = useStore(store);
    if (!edit) return null;
    return <EditPanelBody key={edit.label} store={store} label={edit.label} rect={edit.rect} />;
}

function EditPanelBody({ store, label, rect }: { store: CitationStore; label: string; rect: { left: number; right: number; top: number; bottom: number } }) {
    useStore(store);
    const model = store.model();
    const source = model.sources.get(label);
    const [initial] = useState<Source>(() => source ?? {});
    const kind = sourceKind(initial);
    const [src, setSrc] = useState(initial.url || initial.text || '');
    const [d, setD] = useState<Details>(() => ({
        author: initial.author || '',
        title: initial.title || '',
        site: initial.site || '',
        publisher: initial.publisher || '',
        date: initial.date || '',
        accessed: initial.accessed || todayIso(),
    }));
    const root = useRef<HTMLDivElement>(null);
    const n = model.order.indexOf(label) + 1;
    const uses = model.uses.get(label) ?? 0;
    // Free text with no details is kept as given; details would replace it, so they only appear for addresses and structured entries.
    const showDetails = kind !== 'free' || isUrl(src);

    useLayoutEffect(() => {
        root.current?.querySelector<HTMLElement>('#cite-edit-src')?.focus();
    }, []);
    useEffect(() => {
        const down = (e: MouseEvent) => {
            if (root.current && !root.current.contains(e.target as Node) && !(e.target as HTMLElement).closest('.ce, sup[data-citation-ref], [data-radix-popper-content-wrapper]')) store.closeEdit();
        };
        document.addEventListener('mousedown', down);
        return () => document.removeEventListener('mousedown', down);
    }, [store]);

    const push = (nextSrc: string, nextD: Details) => {
        const prev = store.model().sources.get(label);
        const built = buildSource(nextSrc, showDetails || isUrl(nextSrc) ? nextD : EMPTY, prev?.accessed);
        store.updateSource(label, built);
    };

    if (!source) return null;
    return (
        <Floating
            rect={rect}
            className="w-[380px] max-w-[94vw] border-sky-500"
            role="dialog"
            aria-label={`Edit source ${n}`}
        >
            <div
                ref={root}
                onKeyDown={(e) => {
                    if ((e.target as HTMLElement).closest?.('[data-radix-popper-content-wrapper]')) return;
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        store.closeEdit(true);
                    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
                        e.preventDefault();
                        store.closeEdit(true);
                    }
                }}
            >
                <div className="flex items-center justify-between pl-3.5 pr-2 pt-2 text-sm">
                    <strong>Edit source [{n}]</strong>
                    <button type="button" aria-label="Close" onClick={() => store.closeEdit(true)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
                        <X size={16} />
                    </button>
                </div>
                <div className="grid gap-1 px-3 pb-2 pt-1">
                    <label htmlFor="cite-edit-src" className="text-[11px] uppercase tracking-wide text-muted-foreground">Source</label>
                    <textarea
                        id="cite-edit-src"
                        rows={2}
                        value={src}
                        spellCheck={false}
                        onChange={(e) => {
                            setSrc(e.target.value);
                            push(e.target.value, d);
                        }}
                        className={fieldCls}
                    />
                    {showDetails && (
                        <DetailFields
                            prefix="cite-edit"
                            url={isUrl(src)}
                            value={d}
                            onChange={(k, v) => {
                                const next = { ...d, [k]: v };
                                setD(next);
                                push(src, next);
                            }}
                        />
                    )}
                </div>
                <div className="flex items-center justify-between px-3 pb-3 text-xs text-muted-foreground">
                    <span>Used {uses} {uses === 1 ? 'time' : 'times'} in this post</span>
                    <button type="button" onClick={() => store.closeEdit(true)} className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90">
                        Done
                    </button>
                </div>
            </div>
        </Floating>
    );
}

// ------------------------------------------------------------------ hover card

function HoverCard({ store }: { store: CitationStore }) {
    const { hover } = useStore(store);
    if (!hover) return null;
    const model = store.model();
    const source = model.sources.get(hover.label);
    if (!source) return null;
    const n = model.order.indexOf(hover.label) + 1;
    const href = sourceHref(source);
    return (
        <Floating
            rect={hover.rect}
            className="w-[360px] max-w-[94vw] p-3"
            onMouseEnter={() => store.hoverKeep()}
            onMouseLeave={() => store.hoverHide()}
        >
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Source [{n}]</div>
            <p className="mb-2.5 text-sm leading-relaxed [overflow-wrap:anywhere]"><Entry source={source} /></p>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {href && (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="rounded border border-border px-2 py-0.5 hover:bg-muted">
                        Open source
                    </a>
                )}
                <button
                    type="button"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        const el = store.editor?.view.dom.querySelector(`sup[data-citation-ref]`);
                        const target = Array.from(store.editor?.view.dom.querySelectorAll('sup[data-citation-ref]') ?? []).find((s) => s.getAttribute('data-citation-ref') === hover.label) ?? el;
                        if (target) store.openEdit(hover.label, target as HTMLElement);
                    }}
                    className="rounded border border-border px-2 py-0.5 hover:bg-muted"
                >
                    Edit source
                </button>
                <button
                    type="button"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        store.goCite(hover.label);
                        store.hoverHide(0);
                    }}
                    className="rounded border border-border px-2 py-0.5 hover:bg-muted"
                >
                    Go to citation
                </button>
            </div>
        </Floating>
    );
}

export function CitationUI({ editor }: { editor: Editor | null }) {
    if (!editor || typeof document === 'undefined') return null;
    const store = (editor.storage as unknown as { citation?: { store: CitationStore } }).citation?.store;
    if (!store) return null;
    return createPortal(
        <>
            <CitationForm store={store} />
            <EditPanel store={store} />
            <HoverCard store={store} />
        </>,
        document.body,
    );
}
