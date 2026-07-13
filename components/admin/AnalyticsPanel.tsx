'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ChartContainer,
    ChartTooltip,
    type ChartConfig,
} from '@/components/ui/chart';
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

// GA4 returns dates as YYYYMMDD.
function parseGaDate(raw: string): Date {
    return new Date(
        Number(raw.slice(0, 4)),
        Number(raw.slice(4, 6)) - 1,
        Number(raw.slice(6, 8))
    );
}

const shortDate = (raw: string) =>
    parseGaDate(raw).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const longDate = (raw: string) =>
    parseGaDate(raw).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// Two series, so identity is never left to colour alone: a legend is always shown, and
// the tooltip names each series too. Colours come from the theme's chart ramp, which is
// defined for both light and dark in globals.css.
const CHART_CONFIG = {
    activeUsers: { label: 'Users', color: 'hsl(var(--chart-1))' },
    sessions: { label: 'Sessions', color: 'hsl(var(--chart-2))' },
} satisfies ChartConfig;

function ChartLegend() {
    return (
        <div className="mb-3 flex items-center justify-end gap-4 text-xs text-muted-foreground">
            {(['activeUsers', 'sessions'] as const).map((k) => (
                <span key={k} className="flex items-center gap-1.5">
                    <span
                        className="h-2 w-2 rounded-[2px]"
                        style={{ background: CHART_CONFIG[k].color }}
                    />
                    {CHART_CONFIG[k].label}
                </span>
            ))}
        </div>
    );
}

/** The count badge that tracks the cursor. */
function TrendTooltip({
    active,
    payload,
}: {
    active?: boolean;
    payload?: { payload: { date: string; activeUsers: number; sessions: number } }[];
}) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;

    return (
        <div className="rounded-lg border bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
            <p className="mb-1.5 font-medium text-foreground">{longDate(p.date)}</p>
            <div className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span
                            className="h-2 w-2 shrink-0 rounded-[2px]"
                            style={{ background: 'hsl(var(--chart-1))' }}
                        />
                        Users
                    </span>
                    <span className="font-mono font-medium tabular-nums text-foreground">
                        {p.activeUsers}
                    </span>
                </div>
                <div className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span
                            className="h-2 w-2 shrink-0 rounded-[2px]"
                            style={{ background: 'hsl(var(--chart-2))' }}
                        />
                        Sessions
                    </span>
                    <span className="font-mono font-medium tabular-nums text-foreground">
                        {p.sessions}
                    </span>
                </div>
            </div>
        </div>
    );
}

function TrendChart({ points, days }: { points: Summary['trend']; days: number }) {
    // On a 90-day window, a tick per day is unreadable — thin them out.
    const tickGap = days <= 7 ? 1 : days <= 28 ? 4 : 12;

    return (
        <>
        <ChartLegend />
        <ChartContainer config={CHART_CONFIG} className="h-[220px] w-full">
            <AreaChart data={points} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
                <defs>
                    <linearGradient id="fillUsers" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                    </linearGradient>
                </defs>

                {/* Recessive grid: horizontal only — vertical rules add noise without aiding reading. */}
                <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={tickGap * 6}
                    tickFormatter={shortDate}
                    className="text-xs"
                />
                <YAxis
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={28}
                    allowDecimals={false}
                    className="text-xs"
                />
                <ChartTooltip
                    content={<TrendTooltip />}
                    // The crosshair; the dot is the ≥8px hover marker.
                    cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Area
                    dataKey="sessions"
                    type="monotone"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={1.5}
                    strokeOpacity={0.6}
                    fill="none"
                    dot={false}
                    activeDot={{ r: 3.5, strokeWidth: 0 }}
                    isAnimationActive={false}
                />
                <Area
                    dataKey="activeUsers"
                    type="monotone"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    fill="url(#fillUsers)"
                    dot={false}
                    activeDot={{ r: 4.5, strokeWidth: 2, className: 'stroke-background' }}
                    isAnimationActive={false}
                />
            </AreaChart>
        </ChartContainer>
        </>
    );
}

export function AnalyticsPanel({ workerUrl }: { workerUrl: string }) {
    const [days, setDays] = useState<number>(28);
    // Every range that has been fetched, kept so switching tabs is instant rather than
    // a spinner + round trip. The Worker caches for 10 minutes anyway, so a refetch on
    // every toggle would usually just re-download an identical payload.
    const [cache, setCache] = useState<Record<number, Summary>>({});
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<{ kind: string; message: string } | null>(null);
    const inFlight = useRef<Set<number>>(new Set());

    const data = cache[days] ?? null;

    const fetchRange = useCallback(
        async (range: number, { force = false, background = false } = {}) => {
            if (inFlight.current.has(range)) return;
            if (!force && cache[range]) return;

            inFlight.current.add(range);
            if (!background) {
                setPending(true);
                setError(null);
            }
            try {
                const res = await fetch(`${workerUrl}/api/analytics/summary?days=${range}`, {
                    headers: authHeaders(),
                    credentials: 'include',
                });
                const json = await res.json();
                if (!res.ok) {
                    // A background prefetch failing shouldn't blow away the view the
                    // admin is currently looking at.
                    if (!background) {
                        setError({
                            kind: json.error || 'error',
                            message: json.message || `Request failed (${res.status})`,
                        });
                    }
                    return;
                }
                setCache((prev) => ({ ...prev, [range]: json }));
            } catch (e: unknown) {
                if (!background) {
                    setError({ kind: 'network', message: e instanceof Error ? e.message : 'Network error' });
                }
            } finally {
                inFlight.current.delete(range);
                if (!background) setPending(false);
            }
        },
        [workerUrl, cache]
    );

    // Fetch the visible range, then quietly warm the other two so the toggle is instant.
    useEffect(() => {
        if (cache[days]) return;
        fetchRange(days);
    }, [days, cache, fetchRange]);

    useEffect(() => {
        if (!cache[days]) return;
        const idle = window.setTimeout(() => {
            RANGES.filter((r) => r !== days && !cache[r]).forEach((r) =>
                fetchRange(r, { background: true })
            );
        }, 300);
        return () => window.clearTimeout(idle);
    }, [days, cache, fetchRange]);

    const refresh = useCallback(() => {
        // Explicit refresh busts every range, not just the visible one.
        setCache({});
        setError(null);
        fetchRange(days, { force: true });
    }, [days, fetchRange]);

    const loading = pending && !data;

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
                    <Button variant="outline" size="sm" onClick={refresh} disabled={pending} className="gap-2">
                        {pending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
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
                                <CardTitle className="text-lg">Daily users &amp; sessions</CardTitle>
                                <CardDescription>
                                    Hover the chart for a per-day breakdown. Last {days} days.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <TrendChart points={data.trend} days={days} />
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
