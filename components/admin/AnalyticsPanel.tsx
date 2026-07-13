'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, RefreshCw, ExternalLink, ArrowUp, ArrowDown, Minus, AlertTriangle } from 'lucide-react';
import { authHeaders } from '@/lib/admin-auth';
import { cn } from '@/lib/utils';

const GA4_DASHBOARD_URL =
    'https://analytics.google.com/analytics/web/#/a377056471p515551096/reports/intelligenthome?params=_u..nav%3Dmaui';

const RANGES = [7, 28, 90] as const;

interface Totals {
    activeUsers: number;
    sessions: number;
    pageViews: number;
    avgSessionDuration: number;
    bounceRate: number;
}

interface Summary {
    days: number;
    updatedAt: string;
    totals: Totals;
    previous: Totals;
    trend: { date: string; activeUsers: number; sessions: number }[];
    topPages: { path: string; views: number }[];
    sources: { channel: string; source: string; sessions: number }[];
    countries: { country: string; users: number }[];
}

const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}m ${s.toString().padStart(2, '0')}s`;
};

const formatNumber = (n: number) => n.toLocaleString();

/** Percentage change vs the preceding window of equal length. Null when there is no baseline to compare against. */
function delta(current: number, previous: number): number | null {
    if (!previous) return null;
    return ((current - previous) / previous) * 100;
}

function StatTile({
    label,
    value,
    change,
    invertColor = false,
}: {
    label: string;
    value: string;
    change: number | null;
    // For bounce rate, down is good.
    invertColor?: boolean;
}) {
    const flat = change === null || Math.abs(change) < 0.5;
    const up = (change ?? 0) > 0;
    const good = invertColor ? !up : up;
    const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;

    return (
        <Card>
            <CardContent className="pt-6">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
                <p
                    className={cn(
                        'mt-1 flex items-center gap-1 text-xs',
                        flat ? 'text-muted-foreground' : good ? 'text-green-600' : 'text-red-600'
                    )}
                >
                    <Icon size={12} />
                    {change === null ? 'no prior data' : `${Math.abs(change).toFixed(1)}% vs prev.`}
                </p>
            </CardContent>
        </Card>
    );
}

/** Horizontal bar list — scaled to the top row so the shape is readable at a glance. */
function BarList({
    title,
    description,
    rows,
}: {
    title: string;
    description: string;
    rows: { label: string; sub?: string; value: number }[];
}) {
    const max = Math.max(...rows.map((r) => r.value), 1);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-lg">{title}</CardTitle>
                <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent>
                {rows.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No data for this period.</p>
                ) : (
                    <ul className="space-y-2">
                        {rows.map((r, i) => (
                            <li key={`${r.label}-${i}`} className="relative">
                                <div
                                    className="absolute inset-y-0 left-0 rounded-sm bg-foreground/[0.07]"
                                    style={{ width: `${(r.value / max) * 100}%` }}
                                    aria-hidden
                                />
                                <div className="relative flex items-center justify-between gap-4 px-2 py-1.5 text-sm">
                                    <span className="truncate">
                                        {r.label}
                                        {r.sub && (
                                            <span className="ml-2 text-xs text-muted-foreground">{r.sub}</span>
                                        )}
                                    </span>
                                    <span className="tabular-nums font-medium shrink-0">
                                        {formatNumber(r.value)}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </CardContent>
        </Card>
    );
}

/** Minimal inline sparkline — avoids pulling a charting library into the admin bundle. */
function Sparkline({ points }: { points: { date: string; activeUsers: number }[] }) {
    if (points.length < 2) return null;

    const values = points.map((p) => p.activeUsers);
    const max = Math.max(...values, 1);
    const w = 100;
    const h = 28;
    const path = values
        .map((v, i) => {
            const x = (i / (values.length - 1)) * w;
            const y = h - (v / max) * h;
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');

    return (
        <svg
            viewBox={`0 0 ${w} ${h}`}
            preserveAspectRatio="none"
            className="h-16 w-full"
            role="img"
            aria-label={`Daily active users, peaking at ${max}`}
        >
            <path d={path} fill="none" stroke="currentColor" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

export function AnalyticsPanel({ workerUrl }: { workerUrl: string }) {
    const [days, setDays] = useState<number>(28);
    const [data, setData] = useState<Summary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<{ kind: string; message: string } | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${workerUrl}/api/analytics/summary?days=${days}`, {
                headers: authHeaders(),
                credentials: 'include',
            });
            const json = await res.json();
            if (!res.ok) {
                setError({ kind: json.error || 'error', message: json.message || `Request failed (${res.status})` });
                setData(null);
            } else {
                setData(json);
            }
        } catch (e: unknown) {
            setError({ kind: 'network', message: e instanceof Error ? e.message : 'Network error' });
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [workerUrl, days]);

    useEffect(() => {
        load();
    }, [load]);

    const t = data?.totals;
    const p = data?.previous;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1 rounded-md border border-border/50 p-1">
                    {RANGES.map((r) => (
                        <button
                            key={r}
                            onClick={() => setDays(r)}
                            className={cn(
                                'rounded px-3 py-1 text-sm transition-colors',
                                days === r
                                    ? 'bg-foreground text-background'
                                    : 'text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {r}d
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Refresh
                    </Button>
                    <Button asChild variant="outline" size="sm" className="gap-2">
                        <a href={GA4_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
                            Open GA4
                            <ExternalLink size={14} />
                        </a>
                    </Button>
                </div>
            </div>

            {error && (
                <Card className="border-amber-500/30 bg-amber-500/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                            <AlertTriangle size={18} className="text-amber-600" />
                            {error.kind === 'not_configured' ? 'GA4 API not connected yet' : 'Could not load analytics'}
                        </CardTitle>
                        <CardDescription>{error.message}</CardDescription>
                    </CardHeader>
                    {error.kind === 'not_configured' && (
                        <CardContent className="text-sm text-muted-foreground space-y-2">
                            <p>To connect it, set these Worker secrets and redeploy:</p>
                            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`cd worker
npx wrangler secret put GA_SA_CLIENT_EMAIL
npx wrangler secret put GA_SA_PRIVATE_KEY
npx wrangler deploy`}
                            </pre>
                            <p>
                                The service account also needs Viewer access on the GA4 property, and the
                                Google Analytics Data API must be enabled on its Cloud project.
                            </p>
                        </CardContent>
                    )}
                </Card>
            )}

            {loading && !data && (
                <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            )}

            {t && p && (
                <>
                    <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
                        <StatTile label="Users" value={formatNumber(t.activeUsers)} change={delta(t.activeUsers, p.activeUsers)} />
                        <StatTile label="Sessions" value={formatNumber(t.sessions)} change={delta(t.sessions, p.sessions)} />
                        <StatTile label="Page views" value={formatNumber(t.pageViews)} change={delta(t.pageViews, p.pageViews)} />
                        <StatTile label="Avg. session" value={formatDuration(t.avgSessionDuration)} change={delta(t.avgSessionDuration, p.avgSessionDuration)} />
                        <StatTile label="Bounce rate" value={`${(t.bounceRate * 100).toFixed(1)}%`} change={delta(t.bounceRate, p.bounceRate)} invertColor />
                    </div>

                    {data.trend.length > 1 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Daily users</CardTitle>
                                <CardDescription>Active users per day over the last {days} days.</CardDescription>
                            </CardHeader>
                            <CardContent className="text-foreground/60">
                                <Sparkline points={data.trend} />
                            </CardContent>
                        </Card>
                    )}

                    <div className="grid gap-4 lg:grid-cols-2">
                        <BarList
                            title="Top pages"
                            description="By page views."
                            rows={data.topPages.map((r) => ({ label: r.path, value: r.views }))}
                        />
                        <BarList
                            title="Traffic sources"
                            description="Sessions by channel and source."
                            rows={data.sources.map((r) => ({ label: r.channel, sub: r.source, value: r.sessions }))}
                        />
                        <BarList
                            title="Countries"
                            description="Active users by country."
                            rows={data.countries.map((r) => ({ label: r.country, value: r.users }))}
                        />
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Full dashboard</CardTitle>
                                <CardDescription>
                                    Everything here is a summary. For funnels, events, realtime and custom
                                    explorations, use GA4 itself.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <Button asChild className="gap-2">
                                    <a href={GA4_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
                                        Open GA4 dashboard
                                        <ExternalLink size={16} />
                                    </a>
                                </Button>
                                <p className="text-xs text-muted-foreground">
                                    Data cached for 10 minutes. Last fetched{' '}
                                    {new Date(data.updatedAt).toLocaleString()}.
                                </p>
                            </CardContent>
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
}
