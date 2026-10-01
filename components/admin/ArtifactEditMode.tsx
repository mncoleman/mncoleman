'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    ArrowLeft, Bot, Check, Copy, ExternalLink, Link2, Link2Off, Loader2, MessageSquare,
    Maximize2, Minimize2, MousePointerClick, PanelRightClose, PanelRightOpen, Pencil, RotateCcw, Send, Trash2, X,
} from 'lucide-react';
import { authHeaders } from '@/lib/admin-auth';

const ARTIFACTS_API = (process.env.NEXT_PUBLIC_ARTIFACTS_API_URL || 'https://artifacts.mncoleman.com').replace(/\/$/, '');
const FRAME_ORIGIN = new URL(ARTIFACTS_API).origin;
/** Must match SELECT_MESSAGE_SOURCE in server/src/select-helper.ts. */
const SRC = 'mnc-artifact-select';
const POLL_MS = 4000;
const PICK_COLOR = '#2563eb';

interface Quote { prefix?: string; exact: string; suffix?: string }
interface PickItem { cssPath: string; tag: string; editable: boolean; quote: Quote }
interface Note {
    id: string;
    kind: 'comment' | 'claude';
    body: string;
    targets: { cssPath: string; tag: string; quote: Quote }[];
    authorName: string;
    status: 'open' | 'resolved';
    createdAt: number;
    deliveredAt: number | null;
    resolvedBy: string | null;
}
interface LinkState { userName: string; mine: boolean; expiresAt: number; lastSeenAt: number | null }

function ago(ms: number | null): string {
    if (!ms) return 'not yet';
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    return `${Math.round(s / 3600)}h ago`;
}

/**
 * Edit mode for one instant HTML artifact, after the Dovito hub's
 * ArtifactSelectMode. The artifact renders in a frame from
 * artifacts.mncoleman.com with `?select=1`, which adds a helper script that
 * reports clicks over postMessage; nothing here can touch the frame's DOM.
 *
 * Pick an element (shift-click for several), then:
 *   - Edit text: double-click, or the button, on a text-only element. Enter
 *     saves, Esc cancels. Saved straight to the file, sha-locked.
 *   - Note for Claude: delivered to whoever has linked their Claude session.
 *   - Comment: for people; Claude never sees it.
 *
 * The frame reloads by itself when the file's sha changes (a linked Claude
 * session landed an edit), keeping select mode on.
 */
export function ArtifactEditMode({ workerUrl, slug }: { workerUrl: string; slug: string }) {
    const frameRef = useRef<HTMLIFrameElement>(null);
    const [fullscreen, setFullscreen] = useState(false);
    const [panelOpen, setPanelOpen] = useState(true);
    const shaRef = useRef<string | null>(null);
    const [frameKey, setFrameKey] = useState(0);
    const [sha, setSha] = useState<string | null>(null);
    const [notes, setNotes] = useState<Note[]>([]);
    const [link, setLink] = useState<LinkState | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [selectOn, setSelectOn] = useState(true);
    const [picks, setPicks] = useState<PickItem[]>([]);
    const [editing, setEditing] = useState(false);
    const [kind, setKind] = useState<'claude' | 'comment'>('claude');
    const [draft, setDraft] = useState('');
    const [busy, setBusy] = useState<string | null>(null);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [linkPrompt, setLinkPrompt] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [showResolved, setShowResolved] = useState(false);

    const api = `${workerUrl.replace(/\/$/, '')}/api/artifacts/instant/${encodeURIComponent(slug)}`;
    const frameSrc = `${ARTIFACTS_API}/a/${encodeURIComponent(slug)}?select=1`;

    const post = useCallback((m: Record<string, unknown>) => {
        frameRef.current?.contentWindow?.postMessage({ ...m, source: SRC, v: 1, color: PICK_COLOR }, FRAME_ORIGIN);
    }, []);

    const call = useCallback(async (path: string, init?: RequestInit) => {
        const res = await fetch(`${api}${path}`, {
            ...init,
            credentials: 'include',
            headers: authHeaders(init?.body ? { 'Content-Type': 'application/json' } : undefined),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        return data;
    }, [api]);

    // Poll the file's sha, the notes and the link. A sha this page did not
    // write itself means someone else (usually Claude) changed the file.
    const refresh = useCallback(async () => {
        try {
            const data = await call('/state?all=1');
            setNotes(data.notes || []);
            setLink(data.link || null);
            if (shaRef.current && data.sha && data.sha !== shaRef.current) {
                setPicks([]);
                setEditing(false);
                setFrameKey((k) => k + 1);
            }
            shaRef.current = data.sha;
            setSha(data.sha);
            setLoadError(null);
        } catch (e: any) {
            setLoadError(e.message);
        }
    }, [call]);

    useEffect(() => {
        refresh();
        const t = setInterval(() => {
            if (document.visibilityState === 'visible') refresh();
        }, POLL_MS);
        return () => clearInterval(t);
    }, [refresh]);

    const saveText = useCallback(async (text: string) => {
        const target = picks[0];
        if (!target || !shaRef.current) return;
        setBusy('edit');
        try {
            const data = await call('/edit-text', {
                method: 'POST',
                body: JSON.stringify({ sha: shaRef.current, cssPath: target.cssPath, tag: target.tag, quote: target.quote, text }),
            });
            // The frame already shows the new text; adopt the sha so the poll does not reload it.
            shaRef.current = data.sha;
            setSha(data.sha);
            post({ type: 'saved' });
            setPicks([]);
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
            // The frame's text is now out of step with the file.
            setFrameKey((k) => k + 1);
        } finally {
            setBusy(null);
        }
    }, [call, picks, post]);

    useEffect(() => {
        const onMessage = (e: MessageEvent) => {
            if (e.origin !== FRAME_ORIGIN || e.source !== frameRef.current?.contentWindow) return;
            const m = e.data;
            if (!m || m.source !== SRC || m.v !== 1) return;
            switch (m.type) {
                case 'ready':
                    post({ type: selectOn ? 'select-mode:on' : 'select-mode:off' });
                    break;
                case 'pick': {
                    const items: PickItem[] = (m.items || []).map((i: PickItem) => ({
                        cssPath: i.cssPath, tag: i.tag, editable: i.editable, quote: i.quote,
                    }));
                    setPicks(items);
                    setEditing(false);
                    if (items.length) setPanelOpen(true);
                    if (m.startEdit && items.length === 1 && items[0].editable) {
                        post({ type: 'edit:start', cssPath: items[0].cssPath, tag: items[0].tag, quote: items[0].quote, caret: m.caret });
                    }
                    break;
                }
                case 'edit:started': setEditing(true); break;
                case 'edit:cancel': setEditing(false); break;
                case 'edit:save-request': post({ type: 'edit:commit' }); break;
                case 'edit:text': setEditing(false); saveText(String(m.text ?? '')); break;
                case 'edit:refused':
                    setMessage({ type: 'error', text: m.reason === 'children'
                        ? 'This part contains other elements; leave a note for Claude instead.'
                        : 'That element is no longer on the page.' });
                    break;
                case 'escape': post({ type: 'pick:clear' }); setPicks([]); break;
            }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
    }, [post, saveText, selectOn]);

    const toggleSelect = () => {
        const next = !selectOn;
        setSelectOn(next);
        post({ type: next ? 'select-mode:on' : 'select-mode:off' });
        if (!next) { setPicks([]); setEditing(false); }
    };

    const submitNote = async () => {
        if (!draft.trim() || picks.length === 0) return;
        setBusy('note');
        setMessage(null);
        try {
            await call('/notes', {
                method: 'POST',
                body: JSON.stringify({
                    kind,
                    body: draft.trim(),
                    targets: picks.map((p) => ({ cssPath: p.cssPath, tag: p.tag, quote: p.quote })),
                }),
            });
            setDraft('');
            setPicks([]);
            post({ type: 'pick:clear' });
            setMessage({
                type: 'success',
                text: kind === 'claude'
                    ? (link ? `Sent to ${link.userName}'s Claude.` : 'Saved. It goes to Claude as soon as someone links a session.')
                    : 'Comment saved.',
            });
            refresh();
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setBusy(null);
        }
    };

    const noteAction = async (n: Note, action: 'resolve' | 'reopen' | 'redeliver' | 'delete') => {
        setBusy(`${action}:${n.id}`);
        try {
            if (action === 'delete') await call(`/notes/${n.id}`, { method: 'DELETE' });
            else await call(`/notes/${n.id}/${action}`, { method: 'POST', body: '{}' });
            refresh();
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setBusy(null);
        }
    };

    const startLink = async () => {
        setBusy('link');
        setMessage(null);
        try {
            const data = await call('/link', { method: 'POST', body: '{}' });
            setLinkPrompt(data.prompt);
            refresh();
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setBusy(null);
        }
    };

    const endLink = async () => {
        setBusy('unlink');
        try {
            await call('/link', { method: 'DELETE' });
            setLinkPrompt(null);
            refresh();
        } catch (e: any) {
            setMessage({ type: 'error', text: e.message });
        } finally {
            setBusy(null);
        }
    };

    const copyPrompt = async () => {
        if (!linkPrompt) return;
        await navigator.clipboard.writeText(linkPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    // Expand fills the browser window (not the OS full screen, like the hub's
    // expanded artifact view) by re-styling the SAME stage element rather than
    // mounting a new frame, so the page, select mode, picks and an in-progress
    // text edit all survive the switch.
    const enterFullscreen = () => setFullscreen(true);
    const exitFullscreen = () => setFullscreen(false);

    // Esc collapses it. (Esc inside the frame belongs to the helper — it clears
    // the pick — and never reaches here.)
    useEffect(() => {
        if (!fullscreen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
        window.addEventListener('keydown', onKey);
        // The page behind must not scroll under the overlay.
        const prev = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.documentElement.style.overflow = prev;
        };
    }, [fullscreen]);

    const visibleNotes = notes.filter((n) => showResolved || n.status === 'open');
    const single = picks.length === 1 ? picks[0] : null;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 justify-between">
                <Button asChild variant="ghost" size="sm" className="gap-1.5">
                    <Link href="/admin/artifacts"><ArrowLeft className="h-3.5 w-3.5" /> Artifacts</Link>
                </Button>
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant={selectOn ? 'default' : 'outline'} onClick={toggleSelect} className="gap-1.5">
                        <MousePointerClick className="h-3.5 w-3.5" />
                        {selectOn ? 'Selecting' : 'Select'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={enterFullscreen} className="gap-1.5">
                        <Maximize2 className="h-3.5 w-3.5" /> Expand
                    </Button>
                    <Button asChild size="sm" variant="outline" className="gap-1.5">
                        <a href={`${ARTIFACTS_API}/a/${encodeURIComponent(slug)}`} target="_blank" rel="noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" /> Open
                        </a>
                    </Button>
                </div>
            </div>

            {loadError && (
                <div className="p-3 rounded text-sm bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{loadError}</div>
            )}

            <div
                className={fullscreen
                    ? `fixed inset-0 z-[100] bg-background p-3 grid gap-3 ${panelOpen ? 'grid-cols-[minmax(0,1fr)_22rem]' : 'grid-cols-1'}`
                    : 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]'}
            >
                <div className={`relative rounded-lg border border-border/60 overflow-hidden bg-white ${fullscreen ? 'h-full min-h-0' : ''}`}>
                    <iframe
                        key={frameKey}
                        ref={frameRef}
                        src={frameSrc}
                        title={`Artifact ${slug}`}
                        className={`w-full block ${fullscreen ? 'h-full' : 'h-[75vh]'}`}
                    />
                    {fullscreen && !panelOpen && (
                        <div className="absolute top-2 right-2 flex gap-1.5 rounded-lg bg-background/90 backdrop-blur border border-border/60 p-1 shadow-lg">
                            <Button size="sm" variant={selectOn ? 'default' : 'ghost'} onClick={toggleSelect} className="h-7 gap-1" title="Toggle select mode">
                                <MousePointerClick className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setPanelOpen(true)} className="h-7 gap-1" title="Show panel">
                                <PanelRightOpen className="h-3.5 w-3.5" />
                                {picks.length > 0 && <span className="text-xs">{picks.length}</span>}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={exitFullscreen} className="h-7" title="Collapse">
                                <Minimize2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    )}
                </div>

                <div className={`space-y-4 min-w-0 ${fullscreen ? (panelOpen ? 'overflow-y-auto min-h-0' : 'hidden') : ''}`} data-lenis-prevent>
                    {fullscreen && (
                        <div className="flex items-center gap-1.5">
                            <Button size="sm" variant={selectOn ? 'default' : 'outline'} onClick={toggleSelect} className="h-7 gap-1">
                                <MousePointerClick className="h-3.5 w-3.5" /> {selectOn ? 'Selecting' : 'Select'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setPanelOpen(false)} className="h-7 gap-1" title="Hide panel">
                                <PanelRightClose className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={exitFullscreen} className="h-7 gap-1 ml-auto">
                                <Minimize2 className="h-3.5 w-3.5" /> Collapse
                            </Button>
                        </div>
                    )}
                    {message && (
                        <div className={`p-3 rounded text-sm ${message.type === 'success' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                            {message.text}
                        </div>
                    )}

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Selection</CardTitle>
                            <CardDescription className="text-xs">
                                Click an element, shift-click for more. Double-click text to edit it in place.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {picks.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">Nothing picked.</p>
                            ) : (
                                <ul className="space-y-1">
                                    {picks.map((p) => (
                                        <li key={p.cssPath} className="text-xs truncate">
                                            <span className="font-mono text-muted-foreground">{p.tag}</span>{' '}
                                            {p.quote.exact || <span className="italic text-muted-foreground">(no text)</span>}
                                        </li>
                                    ))}
                                </ul>
                            )}

                            {single?.editable && (
                                editing ? (
                                    <div className="flex gap-2">
                                        <Button size="sm" className="h-7 gap-1" onClick={() => post({ type: 'edit:commit' })} disabled={busy === 'edit'}>
                                            {busy === 'edit' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Save text
                                        </Button>
                                        <Button size="sm" variant="ghost" className="h-7" onClick={() => { post({ type: 'edit:cancel' }); setEditing(false); }}>
                                            Cancel
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 gap-1"
                                        onClick={() => post({ type: 'edit:start', cssPath: single.cssPath, tag: single.tag, quote: single.quote })}
                                    >
                                        <Pencil className="h-3 w-3" /> Edit text
                                    </Button>
                                )
                            )}

                            {picks.length > 0 && !editing && (
                                <div className="space-y-2 border-t border-border/40 pt-3">
                                    <div className="flex gap-1">
                                        {(['claude', 'comment'] as const).map((k) => (
                                            <button
                                                key={k}
                                                type="button"
                                                onClick={() => setKind(k)}
                                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${kind === k ? 'bg-muted font-medium' : 'text-muted-foreground'}`}
                                            >
                                                {k === 'claude' ? <Bot className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                                                {k === 'claude' ? 'Note for Claude' : 'Comment'}
                                            </button>
                                        ))}
                                    </div>
                                    <textarea
                                        value={draft}
                                        onChange={(e) => setDraft(e.target.value)}
                                        rows={3}
                                        maxLength={4000}
                                        placeholder={kind === 'claude' ? 'What should Claude change here?' : 'Leave a comment for people'}
                                        className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                                        data-lenis-prevent
                                    />
                                    <Button size="sm" className="h-7 gap-1" onClick={submitNote} disabled={!draft.trim() || busy === 'note'}>
                                        {busy === 'note' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                                        {kind === 'claude' ? 'Send to Claude' : 'Comment'}
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2"><Link2 className="h-4 w-4" /> Claude link</CardTitle>
                            <CardDescription className="text-xs">
                                {link
                                    ? `Linked to ${link.mine ? 'your' : `${link.userName}'s`} Claude · last checked in ${ago(link.lastSeenAt)} · ends ${new Date(link.expiresAt).toLocaleTimeString()}`
                                    : 'Not linked. Link your Claude Code session and notes reach it live. Links last 2 hours.'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div className="flex gap-2">
                                <Button size="sm" className="h-7 gap-1" onClick={startLink} disabled={busy === 'link'}>
                                    {busy === 'link' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                                    {link?.mine ? 'New link' : 'Link my Claude'}
                                </Button>
                                {link && (
                                    <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={endLink} disabled={busy === 'unlink'}>
                                        <Link2Off className="h-3 w-3" /> Unlink
                                    </Button>
                                )}
                            </div>
                            {linkPrompt && (
                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">Paste this into Claude Code. It holds a token, so treat it like a password.</p>
                                    <textarea
                                        readOnly
                                        value={linkPrompt}
                                        rows={6}
                                        className="w-full rounded-md border border-input bg-muted/40 px-2 py-1.5 font-mono text-[11px]"
                                        data-lenis-prevent
                                    />
                                    <Button size="sm" variant="outline" className="h-7 gap-1" onClick={copyPrompt}>
                                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} {copied ? 'Copied' : 'Copy'}
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">Notes</CardTitle>
                                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
                                    Resolved
                                </label>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-2 max-h-[40vh] overflow-y-auto" data-lenis-prevent>
                            {visibleNotes.length === 0 && <p className="text-xs text-muted-foreground italic">No notes.</p>}
                            {visibleNotes.map((n) => (
                                <div
                                    key={n.id}
                                    className={`rounded-md border border-border/50 p-2 space-y-1 text-xs ${n.status === 'resolved' ? 'opacity-60' : ''}`}
                                >
                                    <button
                                        type="button"
                                        className="w-full text-left space-y-1"
                                        onClick={() => post({ type: 'highlight', targets: n.targets })}
                                        title="Show on the page"
                                    >
                                        <div className="flex items-center gap-1.5 text-muted-foreground">
                                            {n.kind === 'claude' ? <Bot className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                                            <span>{n.authorName}</span>
                                            <span>·</span>
                                            <span>{ago(n.createdAt)}</span>
                                            {n.kind === 'claude' && n.status === 'open' && (
                                                <span className="ml-auto">{n.deliveredAt ? 'with Claude' : 'waiting'}</span>
                                            )}
                                        </div>
                                        <p className="whitespace-pre-wrap text-foreground">{n.body}</p>
                                        <p className="truncate text-muted-foreground">on: {n.targets.map((t) => t.quote.exact || t.tag).join(' · ')}</p>
                                        {n.resolvedBy && <p className="text-muted-foreground">Resolved by {n.resolvedBy}</p>}
                                    </button>
                                    <div className="flex gap-1">
                                        {n.status === 'open' ? (
                                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => noteAction(n, 'resolve')}>
                                                <Check className="h-3 w-3" /> Resolve
                                            </Button>
                                        ) : (
                                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => noteAction(n, 'reopen')}>
                                                <RotateCcw className="h-3 w-3" /> Reopen
                                            </Button>
                                        )}
                                        {n.kind === 'claude' && n.status === 'open' && n.deliveredAt && (
                                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1" onClick={() => noteAction(n, 'redeliver')}>
                                                <Send className="h-3 w-3" /> Send again
                                            </Button>
                                        )}
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-6 px-2 text-xs gap-1 text-destructive hover:text-destructive ml-auto"
                                            onClick={() => noteAction(n, 'delete')}
                                            aria-label="Delete note"
                                        >
                                            {busy === `delete:${n.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {sha && <p className="text-[10px] text-muted-foreground font-mono truncate">sha {sha.slice(0, 12)}</p>}
                    {picks.length > 0 && (
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => { post({ type: 'pick:clear' }); setPicks([]); }}>
                            <X className="h-3 w-3" /> Clear selection
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
