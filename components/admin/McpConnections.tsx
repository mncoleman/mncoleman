'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Loader2, Plug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { authHeaders } from '@/lib/admin-auth';
import { useAdmin } from '@/components/admin/admin-context';
import { Section, SectionRow, notify } from '@/components/admin/kit';
import { relativeTime } from '@/components/admin/artifacts/artifact-logic';

/** The signed-in MCP endpoint. Adding it to a Claude client starts the sign-in that creates a row here. */
const ADMIN_MCP_URL = 'https://mncoleman.com/mcp/admin';

interface Connection {
    id: string;
    who: string;
    app: string;
    createdAt: string;
    lastUsedAt: string;
    mine: boolean;
}

/**
 * Connected apps: the Claude clients a person has let act as them through the
 * MCP server (`worker/mcp-oauth.ts`). Disconnect removes the grant in the
 * Worker, which kills that client's tokens on its next call. The owner sees
 * everyone's connections; everyone else sees their own.
 */
export function McpConnections() {
    const { workerUrl } = useAdmin();
    const [rows, setRows] = useState<Connection[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`${workerUrl}/api/mcp/grants`, { headers: authHeaders(), credentials: 'include' });
            if (!res.ok) throw new Error(String(res.status));
            setRows(((await res.json()).connections || []) as Connection[]);
            setFailed(false);
        } catch {
            setFailed(true);
        }
    }, [workerUrl]);

    useEffect(() => { void load(); }, [load]);

    const disconnect = async (c: Connection) => {
        setBusy(c.id);
        try {
            const res = await fetch(`${workerUrl}/api/mcp/grants/${encodeURIComponent(c.id)}`, { method: 'DELETE', headers: authHeaders(), credentials: 'include' });
            if (!res.ok && res.status !== 404) throw new Error(String(res.status));
            setRows((prev) => (prev || []).filter((r) => r.id !== c.id));
            notify(`${c.app} disconnected.`);
        } catch {
            notify('Could not disconnect it. Try again.');
        } finally {
            setBusy(null);
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(ADMIN_MCP_URL);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* the address is on screen to copy by hand */ }
    };

    return (
        <Section
            title="Connected apps"
            action={
                <button type="button" onClick={copy} className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground" aria-label="Copy the admin MCP address">
                    {ADMIN_MCP_URL.replace('https://', '')} {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
            }
        >
            {failed ? (
                <div className="px-5 py-6 text-sm text-muted-foreground">Could not load connections right now.</div>
            ) : rows === null ? (
                <div className="flex h-20 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" /></div>
            ) : rows.length === 0 ? (
                <div className="px-5 py-6 text-sm text-muted-foreground">
                    Nothing is connected. Add the address above as a connector in Claude, sign in, and it can upload artifacts, edit the AI library and save post drafts as you.
                </div>
            ) : (
                rows.map((c) => (
                    <SectionRow
                        key={c.id}
                        icon={<Plug size={15} />}
                        title={c.app}
                        subtitle={`${c.mine ? '' : `${c.who} · `}Connected ${relativeTime(c.createdAt) || 'recently'} · last used ${relativeTime(c.lastUsedAt) || 'recently'}`}
                        right={
                            <Button variant="outline" size="sm" className="h-8 text-[13px]" disabled={busy === c.id} onClick={() => disconnect(c)}>
                                {busy === c.id ? <Loader2 size={13} className="animate-spin" /> : 'Disconnect'}
                            </Button>
                        }
                    />
                ))
            )}
        </Section>
    );
}
