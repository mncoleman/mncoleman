'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Play, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/admin-auth';
import { Section, StatusPill, notify } from '@/components/admin/kit';
import { AGENT_MODELS, runLooksStuck, type BriefAgentConfig, type BriefAgentRun, type BriefAgentState } from '@/lib/brief-agent';

const MODEL_LABELS: Record<string, string> = {
    'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-opus-5-5': 'Opus 5.5', 'claude-haiku-5-5': 'Haiku 5.5',
};
const SECTOR_LABELS: Record<string, string> = { signal: 'Tech', local: 'Local', nation: 'Nation', world: 'World', field_notes: 'Notes' };
/** The box checks in every 5 minutes and writes the check-in at most every 10. */
const LATE_MS = 25 * 60_000;

function ago(iso: string | null): string {
    if (!iso) return 'never';
    const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min} min ago`;
    const h = Math.round(min / 60);
    return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

function when(iso: string): string {
    return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function timeLabel(hhmm: string): string {
    const [h, m] = hhmm.split(':').map(Number);
    return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/**
 * The brief agent on the ARM box (`brief-agent/`, `lib/brief-agent.ts`): its schedule,
 * standing instructions, a queue of one "run now" or "update", and its run history.
 * The box checks in every 5 minutes, so a queued request starts within about that.
 */
export function BriefAgentPanel({ workerUrl }: { workerUrl: string }) {
    const [state, setState] = useState<BriefAgentState | null>(null);
    const [failed, setFailed] = useState(false);
    const [draft, setDraft] = useState<BriefAgentConfig | null>(null);
    const [ask, setAsk] = useState('');
    const [busy, setBusy] = useState<string | null>(null);

    const call = useCallback((path: string, init?: RequestInit) => fetch(`${workerUrl}/api/briefs/agent${path}`, {
        ...init, credentials: 'include', headers: authHeaders(init?.body ? { 'Content-Type': 'application/json' } : undefined),
    }), [workerUrl]);

    const load = useCallback(async () => {
        try {
            const res = await call('');
            if (!res.ok) throw new Error(String(res.status));
            const j = await res.json() as BriefAgentState;
            setState(j);
            setDraft((d) => d ?? j.config);
            setFailed(false);
        } catch { setFailed(true); }
    }, [call]);

    useEffect(() => { load(); }, [load]);
    // Refresh while something is waiting or running, so the page shows it move.
    const active = !!state?.request || !!state?.runs.some((r) => r.status === 'running' && !runLooksStuck(r));
    useEffect(() => {
        if (!active) return;
        const t = setInterval(load, 30_000);
        return () => clearInterval(t);
    }, [active, load]);

    const send = async (key: string, path: string, init: RequestInit, ok: string, after?: () => void) => {
        setBusy(key);
        try {
            const res = await call(path, init);
            const j = await res.json().catch(() => null);
            if (!res.ok) throw new Error(j?.error || String(res.status));
            after?.();
            notify(ok);
            await load();
        } catch (e) {
            notify(`That did not go through: ${(e as Error).message}`);
        } finally { setBusy(null); }
    };

    if (failed && !state) return (
        <Section title="Automation" padded><p className="text-sm text-muted-foreground">Could not load the automation settings. Deploy the Worker with the brief agent routes.</p></Section>
    );
    if (!state || !draft) return (
        <Section title="Automation" padded><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Loading" /></Section>
    );

    const { config, request, runs, seen } = state;
    const late = !seen || Date.now() - Date.parse(seen) > LATE_MS;
    const dirty = JSON.stringify(draft) !== JSON.stringify(config);
    const field = 'h-9 min-w-0 rounded-md border border-border/60 bg-background px-2.5 text-sm';
    const latest = runs[0];

    return (
        <Section
            title="Automation"
            action={<StatusPill tone={late ? 'warn' : 'ok'}>{late ? `Server quiet (${ago(seen)})` : `Server checked in ${ago(seen)}`}</StatusPill>}
            padded
        >
            <p className="mb-4 text-sm text-muted-foreground">
                {config.enabled
                    ? <>A Claude on the server compiles and publishes the brief every day at <b className="font-medium text-foreground">{timeLabel(config.time)}</b> Mountain, using {MODEL_LABELS[config.model] || config.model}.</>
                    : <>The daily run is <b className="font-medium text-foreground">off</b>. Run now and updates still work.</>}
                {latest && <> Last run: {when(latest.startedAt)}, {latest.status === 'ok' ? 'published' : latest.status === 'failed' ? 'failed' : runLooksStuck(latest) ? 'never reported back' : 'running'}.</>}
            </p>

            <div className="mb-4 flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Daily run
                    <select className={`${field} w-24`} value={draft.enabled ? 'on' : 'off'} onChange={(e) => setDraft({ ...draft, enabled: e.target.value === 'on' })}>
                        <option value="on">On</option><option value="off">Off</option>
                    </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Time (Mountain)
                    <input type="time" className={`${field} w-32`} value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">Model
                    <select className={`${field} w-36`} value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value as BriefAgentConfig['model'] })}>
                        {AGENT_MODELS.map((m) => <option key={m} value={m}>{MODEL_LABELS[m] || m}</option>)}
                    </select>
                </label>
            </div>
            <label className="mb-2 flex flex-col gap-1 text-xs text-muted-foreground">Standing instructions (added to every run)
                <textarea
                    className="min-h-[88px] rounded-md border border-border/60 bg-background px-2.5 py-2 text-sm text-foreground" data-lenis-prevent
                    placeholder="For example: lead the local section with Berthoud town board news when there is any."
                    value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
                />
            </label>
            <div className="mb-6 flex items-center gap-3">
                <Button size="sm" className="h-8 text-[13px]" disabled={!dirty || busy === 'config'}
                    onClick={() => send('config', '/config', { method: 'PUT', body: JSON.stringify(draft) }, 'Automation settings saved.')}>
                    {busy === 'config' ? <Loader2 size={13} className="animate-spin" /> : 'Save settings'}
                </Button>
                {dirty && <Button variant="ghost" size="sm" className="h-8 text-[13px]" onClick={() => setDraft(config)}>Undo</Button>}
                {dirty && <span className="text-xs text-amber-700 dark:text-amber-400">Unsaved changes</span>}
            </div>

            <div className="mb-6 rounded-[10px] border border-border/60 p-4">
                {request ? (
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        <StatusPill tone="info">Waiting</StatusPill>
                        <span className="min-w-0 flex-1">
                            {request.mode === 'full' ? 'Compile a new edition' : `Update: ${request.instructions}`}
                            <span className="block text-xs text-muted-foreground">Queued {ago(request.requestedAt)} by {request.requestedBy}. The server picks it up within about 5 minutes.</span>
                        </span>
                        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[13px]" disabled={busy === 'cancel'}
                            onClick={() => send('cancel', '/request', { method: 'DELETE' }, 'Request cancelled.')}><X size={13} /> Cancel</Button>
                    </div>
                ) : (
                    <>
                        <div className="mb-3 flex flex-wrap items-center gap-3">
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[13px]" disabled={busy === 'full'}
                                onClick={() => send('full', '/request', { method: 'POST', body: JSON.stringify({ mode: 'full' }) }, 'Queued: a new edition for today.')}>
                                <Play size={13} /> Run now
                            </Button>
                            <span className="text-xs text-muted-foreground">Compiles today&apos;s edition from scratch and replaces the published one.</span>
                        </div>
                        <label className="flex flex-col gap-1 text-xs text-muted-foreground">Update today&apos;s edition
                            <textarea
                                className="min-h-[64px] rounded-md border border-border/60 bg-background px-2.5 py-2 text-sm text-foreground" data-lenis-prevent
                                placeholder="What to change, for example: the Exchange outage was resolved, update that item and check for anything newer in World."
                                value={ask} onChange={(e) => setAsk(e.target.value)}
                            />
                        </label>
                        <Button size="sm" className="mt-2 h-8 gap-1.5 text-[13px]" disabled={!ask.trim() || busy === 'update'}
                            onClick={() => send('update', '/request', { method: 'POST', body: JSON.stringify({ mode: 'update', instructions: ask }) }, 'Queued: update to today’s edition.', () => setAsk(''))}>
                            <RefreshCw size={13} /> Send update
                        </Button>
                        <p className="mt-2 text-xs text-muted-foreground">An update edits only what you ask and keeps the rest of the edition and its number.</p>
                    </>
                )}
            </div>

            <h3 className="mb-2 text-xs font-medium text-muted-foreground">Recent runs</h3>
            {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No runs reported yet.</p>
            ) : (
                <ul className="divide-y divide-border/60 rounded-[10px] border border-border/60">
                    {runs.slice(0, 15).map((r) => <RunRow key={r.id} run={r} />)}
                </ul>
            )}
        </Section>
    );
}

function RunRow({ run }: { run: BriefAgentRun }) {
    const stuck = runLooksStuck(run);
    const tone = run.status === 'ok' ? 'ok' : run.status === 'failed' || stuck ? 'danger' : 'info';
    const label = run.status === 'ok' ? 'Published' : run.status === 'failed' ? 'Failed' : stuck ? 'No report' : 'Running';
    const facts = [
        run.trigger === 'scheduled' ? 'Scheduled' : 'Manual',
        run.mode === 'update' ? 'update' : 'new edition',
        run.date,
        run.minutes !== undefined ? `${Math.round(run.minutes)} min` : null,
        run.costUsd !== undefined ? `$${run.costUsd.toFixed(2)} at API rates` : null,
        run.model ? (MODEL_LABELS[run.model] || run.model) : null,
    ].filter(Boolean).join(' · ');
    const counts = run.counts ? Object.entries(run.counts).map(([k, v]) => `${SECTOR_LABELS[k] || k} ${v}`).join(', ') : '';
    return (
        <li className="flex items-start gap-3 px-4 py-3 text-sm">
            <StatusPill tone={tone}>{label}</StatusPill>
            <div className="min-w-0 flex-1">
                <div>{when(run.startedAt)}</div>
                <div className="text-xs text-muted-foreground">{facts}</div>
                {counts && <div className="text-xs text-muted-foreground">Items: {counts}{run.warnings ? ` · ${run.warnings} warnings` : ''}</div>}
                {run.instructions && <div className="mt-1 text-xs text-muted-foreground">Asked: {run.instructions}</div>}
                {run.error && <div className="mt-1 break-words text-xs text-red-600 dark:text-red-400">{run.error}</div>}
            </div>
        </li>
    );
}
