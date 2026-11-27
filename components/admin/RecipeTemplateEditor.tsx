'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { ArrowLeft, Check, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SelectMenu } from '@/components/admin/kit';
import { authHeaders } from '@/lib/admin-auth';
import { useArtifacts } from '@/components/admin/artifacts/shared';

/**
 * The recipe template: one HTML page (shell + stylesheet) every recipe renders through, so a
 * change here reaches all of them at once. The chart's markup is fixed in the service
 * (server/src/recipe.ts); the template places it with {{chart}} and styles it with the .rc-* classes.
 *
 * The preview is rendered by the service, the same renderer the live pages use, and shown in a
 * sandboxed srcdoc frame with no scripts. Only a site admin or the owner may save (the service checks).
 */

interface TemplateState {
    template: string;
    isDefault: boolean;
    defaultTemplate: string;
    placeholders: { name: string; what: string }[];
    canEdit: boolean;
}

const SAMPLE = '__sample__';

export function RecipeTemplateEditor({ workerUrl }: { workerUrl: string }) {
    const api = workerUrl.replace(/\/$/, '');
    const [state, setState] = useState<TemplateState | null>(null);
    const [draft, setDraft] = useState('');
    const [loadError, setLoadError] = useState<string | null>(null);
    const [html, setHtml] = useState('');
    const [busy, setBusy] = useState<'save' | 'reset' | null>(null);
    const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
    const [which, setWhich] = useState(SAMPLE);
    const { artifacts } = useArtifacts(api, true);
    const recipes = useMemo(() => artifacts.filter((a) => a.kind === 'recipe' && a.slug), [artifacts]);

    useEffect(() => {
        let live = true;
        fetch(`${api}/api/artifacts/recipe-template`, { headers: authHeaders(), credentials: 'include' })
            .then(async (r) => {
                const body = await r.json().catch(() => null);
                if (!r.ok) throw new Error(body?.error || `Could not load the template (${r.status})`);
                return body as TemplateState;
            })
            .then((s) => { if (live) { setState(s); setDraft(s.template); } })
            .catch((e: unknown) => { if (live) setLoadError(e instanceof Error ? e.message : 'Could not load the template'); });
        return () => { live = false; };
    }, [api]);

    // Re-render the preview half a second after typing stops.
    useEffect(() => {
        if (!state) return;
        const ctl = new AbortController();
        const t = setTimeout(() => {
            fetch(`${api}/api/artifacts/recipe-preview`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'include',
                body: JSON.stringify({ template: draft, ...(which !== SAMPLE ? { slug: which } : {}) }),
                signal: ctl.signal,
            })
                .then((r) => r.json())
                .then((b) => { if (typeof b?.html === 'string') setHtml(b.html); })
                .catch(() => {});
        }, 500);
        return () => { clearTimeout(t); ctl.abort(); };
    }, [api, draft, which, state]);

    const dirty = !!state && draft !== state.template;
    const missingChart = !draft.includes('{{chart}}');

    const save = async (reset = false) => {
        setBusy(reset ? 'reset' : 'save');
        setStatus(null);
        try {
            const r = await fetch(`${api}/api/artifacts/recipe-template`, {
                method: 'PUT',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'include',
                body: JSON.stringify(reset ? { reset: true } : { template: draft }),
            });
            const b = await r.json().catch(() => null);
            if (!r.ok) throw new Error(b?.error || `Save failed (${r.status})`);
            const template = reset ? state!.defaultTemplate : draft;
            setState((s) => (s ? { ...s, template, isDefault: reset } : s));
            setDraft(template);
            setStatus({ ok: true, text: reset ? 'Back to the default. Every recipe uses it now.' : 'Saved. Every recipe uses it within a minute.' });
        } catch (e: unknown) {
            setStatus({ ok: false, text: e instanceof Error ? e.message : 'Save failed' });
        } finally {
            setBusy(null);
        }
    };

    const canSave = dirty && !missingChart && !!state?.canEdit && busy === null;
    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            if (canSave) void save();
        }
    };

    if (loadError) return <div className="p-8 text-sm text-red-600">{loadError}</div>;
    if (!state) return <div className="flex h-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" /></div>;

    const options = [{ value: SAMPLE, label: 'Sample: tomato pesto pasta' }, ...recipes.map((r) => ({ value: r.slug!, label: r.name }))];

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-2.5">
                <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-[13px]"><Link href="/admin/artifacts"><ArrowLeft size={14} /> Artifacts</Link></Button>
                <h1 className="text-sm font-semibold">Recipe template</h1>
                <span className="text-xs text-muted-foreground">{state.isDefault && !dirty ? 'Default' : dirty ? 'Unsaved changes' : 'Customised'}</span>
                <div className="ml-auto flex items-center gap-2">
                    <SelectMenu label="Preview with" value={which} onChange={setWhich} options={options} />
                    {state.canEdit && !state.isDefault && (
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[13px]" disabled={busy !== null} onClick={() => void save(true)}>
                            {busy === 'reset' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Reset to default
                        </Button>
                    )}
                    {state.canEdit ? (
                        <Button size="sm" className="h-8 gap-1.5 text-[13px]" disabled={!dirty || missingChart || busy !== null} onClick={() => void save()} title="Save (⌘S)">
                            {busy === 'save' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
                        </Button>
                    ) : (
                        <span className="text-xs text-muted-foreground">Only a site admin can change the template.</span>
                    )}
                </div>
            </div>
            {(status || missingChart) && (
                <div className={`px-4 py-1.5 text-xs ${status && status.ok && !missingChart ? 'text-emerald-600' : 'text-red-600'}`} role="status">
                    {missingChart ? 'The template must include {{chart}}.' : status?.text}
                </div>
            )}
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
                <div className="flex min-h-0 flex-col border-b border-border/60 lg:border-b-0 lg:border-r">
                    <div className="min-h-[40vh] flex-1 overflow-hidden" onKeyDown={onKeyDown} data-lenis-prevent>
                        <CodeEditor value={draft} onChange={setDraft} readOnly={!state.canEdit} />
                    </div>
                    <details className="border-t border-border/60 px-4 py-2 text-xs">
                        <summary className="cursor-pointer select-none py-1 font-medium">Placeholders</summary>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 py-2">
                            {state.placeholders.map((p) => (
                                <div key={p.name} className="contents">
                                    <dt className="font-mono">{`{{${p.name}}}`}</dt>
                                    <dd className="text-muted-foreground">{p.what}</dd>
                                </div>
                            ))}
                            <dt className="font-mono">{'{{#name}}…{{/name}}'}</dt>
                            <dd className="text-muted-foreground">Shown only when that placeholder has content (e.g. wrap the Notes box in {'{{#notes}}'}).</dd>
                        </dl>
                    </details>
                </div>
                <iframe
                    title="Template preview"
                    srcDoc={html}
                    // Scripts (the toolbar buttons) but an opaque origin: no allow-same-origin, so the
                    // preview can never reach the admin page, its storage or its session.
                    sandbox="allow-scripts"
                    className="h-full min-h-[50vh] w-full border-0 bg-white"
                />
            </div>
        </div>
    );
}

/**
 * HTML editor with syntax colouring (CodeMirror 6, HTML mode, which also colours the CSS
 * inside <style>). Loaded on demand so the library never reaches any other page. Controlled:
 * typing reports through onChange, and a value changed from outside (Reset) is pushed in.
 */
function CodeEditor({ value, onChange, readOnly }: { value: string; onChange: (v: string) => void; readOnly: boolean }) {
    const host = useRef<HTMLDivElement>(null);
    const view = useRef<import('@codemirror/view').EditorView | null>(null);
    const themeSlot = useRef<import('@codemirror/state').Compartment | null>(null);
    const darkTheme = useRef<import('@codemirror/state').Extension>([]);
    const latest = useRef(onChange);
    latest.current = onChange;
    const { resolvedTheme } = useTheme();
    const dark = resolvedTheme !== 'light';
    const darkRef = useRef(dark);
    darkRef.current = dark;
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const [{ basicSetup }, { EditorView, keymap }, { EditorState, Compartment }, { html }, { oneDark }, { indentWithTab }] = await Promise.all([
                import('codemirror'), import('@codemirror/view'), import('@codemirror/state'), import('@codemirror/lang-html'),
                import('@codemirror/theme-one-dark'), import('@codemirror/commands'),
            ]);
            if (cancelled || !host.current) return;
            darkTheme.current = oneDark;
            const themeC = new Compartment();
            themeSlot.current = themeC;
            const base = EditorView.theme({
                '&': { height: '100%', fontSize: '12.5px', backgroundColor: 'transparent' },
                '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: '1.6' },
                '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
                '&.cm-focused': { outline: 'none' },
            });
            view.current = new EditorView({
                parent: host.current,
                state: EditorState.create({
                    doc: value,
                    extensions: [
                        basicSetup,
                        keymap.of([indentWithTab]),
                        html(),
                        EditorView.lineWrapping,
                        base,
                        themeC.of(darkRef.current ? oneDark : []),
                        EditorState.readOnly.of(readOnly),
                        EditorView.updateListener.of((u) => { if (u.docChanged) latest.current(u.state.doc.toString()); }),
                    ],
                }),
            });
            setReady(true);
        })();
        return () => { cancelled = true; view.current?.destroy(); view.current = null; };
        // Built once; later changes arrive through the effects below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Follow the site's light/dark switch.
    useEffect(() => {
        const v = view.current;
        if (!v || !themeSlot.current) return;
        v.dispatch({ effects: themeSlot.current.reconfigure(dark ? darkTheme.current : []) });
    }, [dark, ready]);

    // A value set from outside (Reset to default) replaces the document.
    useEffect(() => {
        const v = view.current;
        if (v && v.state.doc.toString() !== value) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }, [value, ready]);

    return (
        <div ref={host} className="h-full" aria-label="Template HTML">
            {!ready && <pre className="h-full overflow-auto whitespace-pre-wrap p-4 font-mono text-[12.5px] leading-relaxed text-muted-foreground">{value}</pre>}
        </div>
    );
}
