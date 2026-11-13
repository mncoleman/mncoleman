'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, ExternalLink, Eye, EyeOff, Loader2, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/admin-auth';
import { useAdmin } from '@/components/admin/admin-context';
import { AdminPage, HeaderSpacer, PageHeader, Section, SectionRow, StatusPill, notify } from '@/components/admin/kit';
import { BRIEF_LINK_SECTIONS, type BriefConfig, type BriefLink, type BriefLinkSection, type BriefSummary } from '@/lib/brief';

const SECTION_LABELS: Record<BriefLinkSection, string> = {
    general: 'Any part', weather: 'Weather', verse: 'Verses', devotional: 'Devotional',
    signal: 'Tech', local: 'Local', nation: 'Nation', world: 'World', field_notes: 'Notes',
};

/** The signed-in MCP endpoint the publishing agent connects to. */
const ADMIN_MCP_URL = 'https://mncoleman.com/mcp/admin';

/**
 * The admin's Brief page (`/admin/brief`). Editions are published by the
 * scheduled agent through the MCP server (`publish_brief`); this is where a
 * person takes one down, turns the whole section off, and keeps the source
 * library: the links the agent researches from (`list_brief_sources`), which
 * are also the External sources page that closes every edition. All of it is
 * KV, so a change shows within about a minute with no rebuild.
 */
export function BriefAdmin() {
    const { workerUrl } = useAdmin();
    const [rows, setRows] = useState<BriefSummary[] | null>(null);
    const [config, setConfig] = useState<BriefConfig>({ visibility: 'public', links: [] });
    const [links, setLinks] = useState<BriefLink[]>([]);
    const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'failed'>('loading');
    const [busy, setBusy] = useState<string | null>(null);
    const [confirming, setConfirming] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const copyAddress = async () => {
        try {
            await navigator.clipboard.writeText(ADMIN_MCP_URL);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            notify('Admin MCP address copied.');
        } catch { /* the address is on screen, and one click selects all of it */ }
    };

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

    const visible = (rows || []).filter((r) => !r.hidden).length;
    return (
        <AdminPage>
            <PageHeader title="Brief">
                {state === 'ready' && <StatusPill tone={isPublic ? 'ok' : 'warn'}>{isPublic ? 'Public' : 'Private'}</StatusPill>}
                <HeaderSpacer />
                <Button asChild variant="outline" className="h-10 gap-1.5 rounded-lg px-4 text-sm">
                    <Link href="/brief" target="_blank"><ExternalLink size={15} /> Open the brief</Link>
                </Button>
                {state === 'ready' && (
                    <Button
                        variant="outline" className="h-10 gap-1.5 rounded-lg px-4 text-sm" disabled={busy === 'vis'}
                        onClick={() => run('vis', () => call('/config', { method: 'PUT', body: JSON.stringify({ visibility: isPublic ? 'private' : 'public' }) }),
                            () => setConfig((c) => ({ ...c, visibility: isPublic ? 'private' : 'public' })), isPublic ? 'The brief is now private.' : 'The brief is now public.')}
                    >
                        {isPublic ? <EyeOff size={15} /> : <Eye size={15} />} {isPublic ? 'Make private' : 'Make public'}
                    </Button>
                )}
            </PageHeader>

            {state === 'loading' ? (
                <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" /></div>
            ) : state === 'unavailable' ? (
                <p className="text-sm text-muted-foreground">Brief storage is not set up: the Worker has no BRIEFS namespace. See <code>docs/daily-brief.md</code>.</p>
            ) : state === 'failed' ? (
                <p className="text-sm text-muted-foreground">Could not load the brief right now.</p>
            ) : (
                <>
                    {!isPublic && (
                        <p className="mb-5 rounded-[10px] border border-amber-500/40 px-5 py-3 text-sm text-amber-700 dark:text-amber-400">
                            Private: the pages, the archive, the feed and the public MCP tools show nothing until you make it public again. Nothing is deleted.
                        </p>
                    )}

                    <Section
                        title={rows && rows.length ? `Editions (${rows.length}${visible !== rows.length ? `, ${rows.length - visible} hidden` : ''})` : 'Editions'}
                        action={<Link href="/brief/archive" target="_blank" className="text-[13px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Archive</Link>}
                    >
                        {(rows || []).length === 0 ? (
                            <div className="px-5 py-6 text-sm text-muted-foreground">No edition has been published yet.</div>
                        ) : (rows || []).map((r) => (
                            <SectionRow
                                key={r.date}
                                title={<Link href={`/brief/${r.date}`} target="_blank" className="hover:underline">{r.date} · Brief {String(r.edition_number).padStart(3, '0')}</Link>}
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
                    </Section>

                    <Section
                        title={`Source library${links.length ? ` (${links.length})` : ''}`}
                        action={linksDirty && (
                            <Button size="sm" className="h-8 text-[13px]" disabled={busy === 'links'}
                                onClick={() => run('links', () => call('/config', { method: 'PUT', body: JSON.stringify({ links }) }), () => setConfig((c) => ({ ...c, links })), 'Links saved.')}>
                                {busy === 'links' ? <Loader2 size={13} className="animate-spin" /> : 'Save links'}
                            </Button>
                        )}
                        padded
                    >
                        <p className="mb-3 text-xs text-muted-foreground">
                            The links the publishing agent researches from (its <code>list_brief_sources</code> tool), also shown as the External sources page that closes every edition.
                            &quot;Feeds&quot; and the note tell the agent what each link is for. Leave the list empty to drop the page.
                        </p>
                        <div className="flex flex-col gap-2">
                            {links.map((l, i) => (
                                <div key={i} className="flex flex-wrap gap-2">
                                    <input className={`${field} w-44`} aria-label={`Name of link ${i + 1}`} placeholder="Name" value={l.label} onChange={(e) => setLinks(links.map((x, n) => (n === i ? { ...x, label: e.target.value } : x)))} />
                                    <input className={`${field} flex-1 basis-60`} aria-label={`Address of link ${i + 1}`} placeholder="https://" inputMode="url" value={l.url} onChange={(e) => setLinks(links.map((x, n) => (n === i ? { ...x, url: e.target.value } : x)))} />
                                    <select className={`${field} w-32`} aria-label={`What link ${i + 1} feeds`} value={l.section || 'general'} onChange={(e) => setLinks(links.map((x, n) => (n === i ? { ...x, section: e.target.value as BriefLinkSection } : x)))}>
                                        {BRIEF_LINK_SECTIONS.map((s) => <option key={s} value={s}>{SECTION_LABELS[s]}</option>)}
                                    </select>
                                    <input className={`${field} flex-1 basis-60`} aria-label={`Note for link ${i + 1}`} placeholder="Note for the agent (optional)" value={l.note || ''} onChange={(e) => setLinks(links.map((x, n) => (n === i ? { ...x, note: e.target.value } : x)))} />
                                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0" aria-label={`Remove link ${i + 1}`} onClick={() => setLinks(links.filter((_, n) => n !== i))}><X size={14} /></Button>
                                </div>
                            ))}
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[13px]" onClick={() => setLinks([...links, { label: '', url: '' }])}><Plus size={13} /> Add link</Button>
                            {linksDirty && <span className="text-xs text-amber-700 dark:text-amber-400">Unsaved changes</span>}
                        </div>
                    </Section>

                    <Section title="Publishing" padded>
                        <p className="mb-3 text-sm text-muted-foreground">
                            Editions are published by a Claude connected to the admin MCP address below, with the <code>publish_brief</code> tool. Which apps are connected, and disconnecting one, is on the <Link href="/admin" className="underline underline-offset-4 hover:text-foreground">Overview</Link>.
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <span className="shrink-0 text-xs text-muted-foreground">Admin MCP address</span>
                            <code className="min-w-0 flex-1 basis-56 select-all truncate rounded-md border border-border/60 bg-muted/35 px-2.5 py-1.5 font-mono text-[13px]">{ADMIN_MCP_URL}</code>
                            <Button variant="outline" size="sm" className="h-8 shrink-0 gap-1.5 text-[13px]" onClick={copyAddress}>
                                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
                            </Button>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">Public feed: <a href="/api/brief/rss" target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">/api/brief/rss</a>. Hiding or deleting an edition takes up to about a minute to show.</p>
                    </Section>
                </>
            )}
        </AdminPage>
    );
}
