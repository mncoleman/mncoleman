'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Newspaper } from 'lucide-react';

/**
 * The bar at the top of the home page that opens today's brief. Same shell as
 * the MCP address bar (`mcp-callout.tsx`, now in the footer) on purpose: one
 * glass pill, hugging its content.
 *
 * The headline is fetched after paint and is optional: the bar reads fine
 * without it, and a failed or empty request leaves the fallback line.
 */
export function BriefCallout() {
    const [latest, setLatest] = useState<{ date: string; headline: string } | null>(null);

    useEffect(() => {
        let live = true;
        fetch('/api/brief/index', { headers: { Accept: 'application/json' } })
            .then((r) => (r.ok && (r.headers.get('Content-Type') || '').includes('json') ? r.json() : null))
            .then((j) => { if (live && j?.briefs?.[0]) setLatest(j.briefs[0]); })
            .catch(() => { /* the fallback line stays */ });
        return () => { live = false; };
    }, []);

    const day = latest ? new Date(`${latest.date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : null;

    return (
        <div className="relative mx-auto w-fit max-w-full">
            <div
                className="flex items-center gap-2 rounded-xl border border-border/40 px-3 py-2.5 bg-background/40 backdrop-blur-xl"
                style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.12)' }}
            >
                <span className="hidden sm:flex items-center gap-1.5 shrink-0 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                    <Newspaper className="h-3 w-3" />
                    Today
                </span>
                <span className="min-w-0 truncate font-mono text-xs sm:text-sm text-foreground/90 mr-1 max-w-[46ch]">
                    {latest ? `${day} · ${latest.headline}` : 'The MNColeman Daily Brief'}
                </span>
                <Link
                    href="/brief"
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border/50 bg-background/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-foreground/10"
                >
                    Read <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            </div>
        </div>
    );
}
