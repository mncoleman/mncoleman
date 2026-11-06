'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import {
    ChartContainer,
    ChartTooltip,
    type ChartConfig,
} from '@/components/ui/chart';
import { Loader2, RefreshCw, ExternalLink, ArrowUp, ArrowDown, Minus, AlertTriangle } from 'lucide-react';
import { authHeaders } from '@/lib/admin-auth';
import { AdminPage, HeaderSpacer, PageHeader, Section, SegmentedFilter, StatGrid, StatTile } from '@/components/admin/kit';

const GA4_DASHBOARD_URL =
    'https://analytics.google.com/analytics/web/#/a377056471p515551096/reports/intelligenthome?params=_u..nav%3Dmaui';

const RANGES = [7, 28, 90] as const;
const RANGE_OPTIONS = RANGES.map((r) => ({ value: String(r), label: `${r} days` }));

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
    // Absent on a payload cached by an older Worker, hence optional.
    cities?: { city: string; region: string; country: string; users: number; sessions: number }[];
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

/** The detail line under a number: the change against the previous period of the same length. */
function changeDetail({ change, invertColor = false }: { change: number | null; invertColor?: boolean }) {
    const flat = change === null || Math.abs(change) < 0.5;
    const up = (change ?? 0) > 0;
    const good = invertColor ? !up : up;
    const Icon = flat ? Minus : up ? ArrowUp : ArrowDown;
    return {
        tone: flat ? undefined : good ? ('up' as const) : ('down' as const),
        detail: <><Icon size={12} />{change === null ? 'no prior data' : `${Math.abs(change).toFixed(1)}% vs previous`}</>,
    };
}

function Tile({ label, value, change, invertColor }: { label: string; value: string; change: number | null; invertColor?: boolean }) {
    const c = changeDetail({ change, invertColor });
    return <StatTile label={label} value={value} detail={c.detail} tone={c.tone} />;
}

/** Horizontal bar list: scaled to the top row so the shape is readable at a glance. */
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
        <Section title={title} padded>
            <p className="mb-3 text-xs text-muted-foreground">{description}</p>
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
                                    {r.sub && <span className="ml-2 text-xs text-muted-foreground">{r.sub}</span>}
                                </span>
                                <span className="shrink-0 font-medium tabular-nums">{formatNumber(r.value)}</span>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </Section>
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
        <AdminPage>
            <PageHeader title="Analytics">
                <SegmentedFilter label="Range" value={String(days)} onChange={(v) => setDays(Number(v))} options={RANGE_OPTIONS} />
                <HeaderSpacer />
                <Button variant="outline" onClick={refresh} disabled={pending} className="h-10 gap-2 rounded-lg px-4 text-sm">
                    {pending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    Refresh
                </Button>
                <Button asChild variant="outline" className="h-10 gap-2 rounded-lg px-4 text-sm">
                    <a href={GA4_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
                        Open GA4
                        <ExternalLink size={14} />
                    </a>
                </Button>
            </PageHeader>

            {error && (
                <Section title={error.kind === 'not_configured' ? 'GA4 API not connected yet' : 'Could not load analytics'} padded className="border-amber-500/30">
                    <p className="flex items-start gap-2 text-sm"><AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" /> {error.message}</p>
                    {error.kind === 'not_configured' && (
                        <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                            <p>To connect it, set these Worker secrets and redeploy:</p>
                            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs" data-lenis-prevent>
{`cd worker
npx wrangler secret put GA_SA_CLIENT_EMAIL
npx wrangler secret put GA_SA_PRIVATE_KEY
npx wrangler deploy`}
                            </pre>
                            <p>
                                The service account also needs Viewer access on the GA4 property, and the
                                Google Analytics Data API must be enabled on its Cloud project.
                            </p>
                        </div>
                    )}
                </Section>
            )}

            {loading && !data && (
                <div className="flex h-40 items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Loading" />
                </div>
            )}

            {t && p && data && (
                <>
                    <StatGrid cols={5}>
                        <Tile label="Users" value={formatNumber(t.activeUsers)} change={delta(t.activeUsers, p.activeUsers)} />
                        <Tile label="Sessions" value={formatNumber(t.sessions)} change={delta(t.sessions, p.sessions)} />
                        <Tile label="Page views" value={formatNumber(t.pageViews)} change={delta(t.pageViews, p.pageViews)} />
                        <Tile label="Avg. session" value={formatDuration(t.avgSessionDuration)} change={delta(t.avgSessionDuration, p.avgSessionDuration)} />
                        <Tile label="Bounce rate" value={`${(t.bounceRate * 100).toFixed(1)}%`} change={delta(t.bounceRate, p.bounceRate)} invertColor />
                    </StatGrid>

                    {data.trend.length > 1 && (
                        <Section title="Daily users and sessions" padded>
                            <p className="mb-3 text-xs text-muted-foreground">Hover the chart for a per-day breakdown. Last {days} days.</p>
                            <TrendChart points={data.trend} days={days} />
                        </Section>
                    )}

                    <div className="grid items-start gap-5 lg:grid-cols-2">
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
                        <BarList
                            title="Cities"
                            description="Active users by city. GA4 reports a city only when it can resolve one, so small towns show as (not set)."
                            rows={(data.cities || []).map((r) => ({
                                label: r.city,
                                sub: [r.region, r.country].filter(Boolean).join(', '),
                                value: r.users,
                            }))}
                        />
                        <Section title="Full dashboard" padded>
                            <p className="mb-3 text-sm text-muted-foreground">
                                Everything here is a summary. For funnels, events, realtime and custom explorations, use GA4 itself.
                            </p>
                            <Button asChild className="gap-2">
                                <a href={GA4_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
                                    Open GA4 dashboard
                                    <ExternalLink size={16} />
                                </a>
                            </Button>
                            <p className="mt-3 text-xs text-muted-foreground">
                                Data cached for 10 minutes. Last fetched {new Date(data.updatedAt).toLocaleString()}.
                            </p>
                        </Section>
                    </div>
                </>
            )}
        </AdminPage>
    );
}
