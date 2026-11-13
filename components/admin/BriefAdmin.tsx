'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/admin-auth';
import { useAdmin } from '@/components/admin/admin-context';
import { Section, SectionRow, StatusPill, notify } from '@/components/admin/kit';
import type { BriefConfig, BriefLink, BriefSummary } from '@/lib/brief';

/**
 * Daily brief controls. Editions are published by the scheduled agent through
 * the MCP server (`publish_brief`); this is where a person takes one down,
 * turns the whole section off, and keeps the "External sources" link list
 * that closes every edition. All of it is KV, so every change is live at once
 * with no rebuild.
 */
export function BriefAdmin() {
    const { workerUrl } = useAdmin();
    const [rows, setRows] = useState<BriefSummary[] | null>(null);
    const [config, setConfig] = useState<BriefConfig>({ visibility: 'public', links: [] });
    const [links, setLinks] = useState<BriefLink[]>([]);
    const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'failed'>('loading');
    const [busy, setBusy] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<string | null>(null);

    const call = useCallback((path: string, init?: RequestInit) => fetch(`${workerUrl}/api/briefs${path}`, {
        ...init, credentials: 'include', headers: authHeaders(init?.body ? { 'Content-Type': 'application/json' } : undefined),
    }), [workerUrl]);

    useEffect(() => {
        let live = true;
        call('').then(async (res) => {
            if (!live) return;
            if (res.status === 503) return setState('unavailable');
            if (!res.ok) return setState('failed');
            const j = await res.json() as { briefs: BriefSummary[]; config: BriefConfig };
            setRows(j.briefs); setConfig(j.config); setLinks(j.config.links || []); setState('ready');
        }).catch(() => { if (live) setState('failed'); });
        return () => { live = false; };
    }, [call]);

    const run = async (key: string, fn: () => Promise<Response>, done: () => void, ok: string) => {
        setBusy(key);
        try {
            const res = await fn();
            if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || String(res.status));
            done(); notify(ok);
        } catch (e) {
            notify(`That did not save: ${(e as Error).message}`);
        } finally {
            setBusy(null); setConfirming(null);
        }
    };

    const isPublic = config.visibility === 'public';
    const linksDirty = JSON.stringify(links) !== JSON.stringify(config.links || []);
    const field = 'h-9 min-w-0 rounded-md border border-border/60 bg-background px-2.5 text-sm';

    return (
        <Section
            title="Daily brief"
            action={state === 'ready' && (
                <Button
                    variant="outline" size="sm" className="h-8 gap-1.5 text-[13px]" disabled={busy === 'vis'}
                    onClick={() => run('vis', () => call('/config', { method: 'PUT', body: JSON.stringify({ visibility: isPublic ? 'private' : 'public' }) }),
                        () => setConfig((c) => ({ ...c, visibility: isPublic ? 'private' : 'public' })), isPublic ? 'The brief is now private.' : 'The brief is now public.')}
                >
                    {isPublic ? <Eye size={13} /> : <EyeOff size={13} />} {isPublic ? 'Public' : 'Private'}
                </Button>
            )}
        >
            {state === 'loading' ? (
                <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" /></div>
            ) : state === 'unavailable' ? (
                <div className="px-5 py-6 text-sm text-muted-foreground">Brief storage is not set up yet: the Worker has no BRIEFS namespace. See <code>docs/daily-brief.md</code>.</div>
            ) : state === 'failed' ? (
                <div className="px-5 py-6 text-sm text-muted-foreground">Could not load the brief right now.</div>
            ) : (
                <>
                    {!isPublic && <p className="border-b border-border/60 px-5 py-3 text-xs text-amber-700 dark:text-amber-400">Private: the pages, the archive and the public MCP tools show nothing until you switch it back. Nothing is deleted.</p>}
                    <div className="border-b border-border/60 px-5 py-4">
                        <h3 className="mb-1 text-sm font-medium">External sources</h3>
                        <p className="mb-3 text-xs text-muted-foreground">The last page of every edition. Leave it empty to drop the page.</p>
                        <div className="flex flex-col gap-2">
                            {links.map((l, i) => (
                                <div key={i} className="flex flex-wrap gap-2">
                                    <input className={`${field} w-44`} aria-label={`Name of link ${i + 1}`} placeholder="Name" value={l.label} onChange={(e) => setLinks(links.map((x, n) => (n === i ? { ...x, label: e.target.value } : x)))} />
                                    <input className={`${field} flex-1 basis-60`} aria-label={`Address of link ${i + 1}`} placeholder="https://" inputMode="url" value={l.url} onChange={(e) => setLinks(links.map((x, n) => (n === i ? { ...x, url: e.target.value } : x)))} />
                                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label={`Remove link ${i + 1}`} onClick={() => setLinks(links.filter((_, n) => n !== i))}><X size={14} /></Button>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 flex gap-2">
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[13px]" onClick={() => setLinks([...links, { label: '', url: '' }])}><Plus size={13} /> Add link</Button>
                            {linksDirty && (
                                <Button size="sm" className="h-8 text-[13px]" disabled={busy === 'links'}
                                    onClick={() => run('links', () => call('/config', { method: 'PUT', body: JSON.stringify({ links }) }), () => setConfig((c) => ({ ...c, links })), 'Links saved.')}>
                                    {busy === 'links' ? <Loader2 size={13} className="animate-spin" /> : 'Save links'}
                                </Button>
                            )}
                        </div>
                    </div>
                    {(rows || []).length === 0 ? (
                        <div className="px-5 py-6 text-sm text-muted-foreground">No edition has been published yet.</div>
                    ) : (rows || []).slice(0, 14).map((r) => (
                        <SectionRow
                            key={r.date}
                            title={<Link href={`/brief/${r.date}`} className="hover:underline">{r.date} · Brief {String(r.edition_number).padStart(3, '0')}</Link>}
                            subtitle={r.headline}
                            right={
                                <span className="flex shrink-0 items-center gap-2">
                                    {r.hidden && <StatusPill tone="warn">Hidden</StatusPill>}
                                    <Button variant="outline" size="sm" className="h-8 text-[13px]" disabled={busy === r.date}
                                        onClick={() => run(r.date, () => call(`/${r.date}`, { method: 'PATCH', body: JSON.stringify({ hidden: !r.hidden }) }),
                                            () => setRows((prev) => (prev || []).map((x) => (x.date === r.date ? { ...x, hidden: !r.hidden || undefined } : x))), r.hidden ? 'Edition is showing again.' : 'Edition hidden.')}>
                                        {r.hidden ? 'Show' : 'Hide'}
                                    </Button>
                                    {confirming === r.date ? (
                                        <Button variant="destructive" size="sm" className="h-8 text-[13px]" disabled={busy === r.date}
                                            onClick={() => run(r.date, () => call(`/${r.date}`, { method: 'DELETE' }), () => setRows((prev) => (prev || []).filter((x) => x.date !== r.date)), 'Edition deleted.')}>
                                            Delete for good
                                        </Button>
                                    ) : (
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Delete the ${r.date} edition`} onClick={() => setConfirming(r.date)}><Trash2 size={14} /></Button>
                                    )}
                                </span>
                            }
                        />
                    ))}
                </>
            )}
        </Section>
    );
}
