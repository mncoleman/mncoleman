'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import { CountUp } from '@/components/ui/count-up';
import { cn } from '@/lib/utils';
import type { BuildInfo } from '@/lib/build-info';

/**
 * What this site is made of, as numbers.
 *
 * Everything git-derived is baked in at build time by
 * `scripts/generate-build-info.ts`; the visitor averages are fetched live from the
 * admin Worker's public stats endpoint, because they keep moving between deploys
 * and a number frozen at build time would quietly go stale. Elapsed days are
 * computed on render for the same reason — "days since the first commit" must not
 * be wrong for everyone who visits between two deploys.
 *
 * Every section renders only if its data arrived. The build script degrades each
 * one to null rather than failing a deploy over an ornament, so the dialog has to
 * be honest about a missing piece instead of printing a zero.
 */

type Visitors = {
    windowDays: number;
    totalVisitors: number;
    perDay: number;
    perWeek: number;
    perMonth: number;
    pageViews: number;
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function daysSince(iso: string): number {
    return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86400000));
}

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    });
}

/** One number with a label. `delay` staggers the whole grid into view. */
function Stat({
    label,
    value,
    decimals = 0,
    suffix,
    note,
    delay = 0,
    big = false,
}: {
    label: string;
    value: number;
    decimals?: number;
    suffix?: string;
    note?: string;
    delay?: number;
    big?: boolean;
}) {
    const reduced = useReducedMotion();
    return (
        <motion.div
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
                'rounded-xl border border-border/50 bg-background/40 p-4',
                big && 'sm:col-span-1'
            )}
        >
            <div
                className={cn(
                    'font-bold tracking-tight text-foreground',
                    big ? 'text-3xl sm:text-4xl' : 'text-2xl'
                )}
            >
                <CountUp value={value} decimals={decimals} suffix={suffix} delay={delay * 1000} />
            </div>
            <div className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {label}
            </div>
            {note && <div className="mt-1 text-xs text-muted-foreground/70">{note}</div>}
        </motion.div>
    );
}

/** Horizontal proportion bar — languages, and who wrote what. */
function Breakdown({
    title,
    rows,
    delay = 0,
}: {
    title: string;
    rows: Array<{ label: string; value: number }>;
    delay?: number;
}) {
    const reduced = useReducedMotion();
    const total = rows.reduce((sum, r) => sum + r.value, 0) || 1;
    return (
        <motion.div
            initial={reduced ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-xl border border-border/50 bg-background/40 p-4"
        >
            <div className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {title}
            </div>
            <div className="space-y-2">
                {rows.map((row, i) => (
                    <div key={row.label} className="flex items-center gap-3">
                        <div className="w-20 shrink-0 truncate text-xs text-muted-foreground">
                            {row.label}
                        </div>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <motion.div
                                className="h-full rounded-full bg-foreground/50"
                                initial={reduced ? false : { width: 0 }}
                                animate={{ width: `${(row.value / total) * 100}%` }}
                                transition={{
                                    duration: 0.8,
                                    delay: delay + 0.1 + i * 0.06,
                                    ease: [0.16, 1, 0.3, 1],
                                }}
                            />
                        </div>
                        <div
                            className="w-14 shrink-0 text-right text-xs text-muted-foreground"
                            style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                            {row.value.toLocaleString()}
                        </div>
                    </div>
                ))}
            </div>
        </motion.div>
    );
}

export function SiteMetricsDialog({
    info,
    open,
    onClose,
}: {
    info: BuildInfo;
    open: boolean;
    onClose: () => void;
}) {
    const [mounted, setMounted] = useState(false);
    const [visitors, setVisitors] = useState<Visitors | null>(null);
    const [visitorsFailed, setVisitorsFailed] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const reduced = useReducedMotion();

    useEffect(() => setMounted(true), []);

    // Fetch once, on first open — not on mount. Nobody who never opens this should
    // pay for a cross-origin request on every page of the site.
    useEffect(() => {
        if (!open || visitors || visitorsFailed) return;
        const base = process.env.NEXT_PUBLIC_WORKER_URL || 'https://mncoleman-admin-auth.mncoleman.workers.dev';
        let cancelled = false;
        fetch(`${base.replace(/\/$/, '')}/api/stats/visitors`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((data) => !cancelled && setVisitors(data))
            .catch(() => !cancelled && setVisitorsFailed(true));
        return () => {
            cancelled = true;
        };
    }, [open, visitors, visitorsFailed]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                // Handled here, so blank-canvas mode does not also exit on the same
                // press — see the note in blank-canvas-toggle.tsx.
                e.preventDefault();
                onClose();
            }
        };
        document.addEventListener('keydown', onKey);
        // The page behind must not scroll while a centred modal is up.
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        panelRef.current?.focus();
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = previous;
        };
    }, [open, onClose]);

    const commits = info.commits;
    const code = info.code;

    const derived = useMemo(() => {
        if (!commits) return null;
        return {
            sinceFirst: daysSince(commits.firstCommit.date),
            sinceLast: daysSince(commits.lastCommit.date),
        };
    }, [commits]);

    if (!mounted) return null;

    return createPortal(
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <div
                        className="absolute inset-0 bg-background/70 backdrop-blur-md"
                        onClick={onClose}
                        aria-hidden
                    />

                    <motion.div
                        ref={panelRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Site metrics"
                        tabIndex={-1}
                        // `data-lenis-prevent`: the site runs one root Lenis instance,
                        // which eats wheel events from any nested scroller that does not
                        // opt out (see CLAUDE.md → Patterns).
                        data-lenis-prevent
                        initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: 8 }}
                        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
                        className="glass-panel relative max-h-[85vh] w-full max-w-3xl overflow-y-auto p-6 shadow-2xl focus:outline-none sm:p-8"
                    >
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <X className="h-4 w-4" />
                        </button>

                        <header className="mb-6 pr-10">
                            <h2 className="text-xl font-bold tracking-tight">This site, by the numbers</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Measured from this repository at build{' '}
                                <span className="font-mono">{info.version}</span>
                                {commits && <> · first commit {formatDate(commits.firstCommit.date)}</>}
                            </p>
                        </header>

                        {commits && derived && (
                            <>
                                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    <Stat big label="Days building" value={derived.sinceFirst} delay={0.02} />
                                    <Stat big label="Commits" value={commits.total} delay={0.06} />
                                    {code && <Stat big label="Lines of code" value={code.lines} delay={0.1} />}
                                </div>

                                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    <Stat
                                        label="Days since last commit"
                                        value={derived.sinceLast}
                                        delay={0.14}
                                    />
                                    <Stat
                                        label="Commits / week"
                                        value={commits.perWeek}
                                        decimals={1}
                                        delay={0.17}
                                    />
                                    <Stat
                                        label="Commits / month"
                                        value={commits.perMonth}
                                        decimals={1}
                                        delay={0.2}
                                    />
                                    <Stat
                                        label="Busiest day"
                                        value={commits.busiestDay.count}
                                        note={formatDate(`${commits.busiestDay.date}T00:00:00Z`)}
                                        delay={0.23}
                                    />
                                    <Stat
                                        label="Longest streak"
                                        value={commits.longestStreakDays}
                                        suffix=" days"
                                        delay={0.26}
                                    />
                                    <Stat
                                        label="Longest quiet spell"
                                        value={commits.longestGapDays}
                                        decimals={1}
                                        suffix=" days"
                                        delay={0.29}
                                    />
                                    <Stat
                                        label="Days with a commit"
                                        value={commits.activeDays}
                                        note={`of ${derived.sinceFirst}`}
                                        delay={0.32}
                                    />
                                    {code && (
                                        <Stat label="Code files" value={code.codeFiles} delay={0.35} />
                                    )}
                                </div>
                            </>
                        )}

                        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {code && code.byLanguage.length > 0 && (
                                <Breakdown
                                    title="Lines by language"
                                    delay={0.38}
                                    rows={code.byLanguage.map((l) => ({ label: `.${l.ext}`, value: l.lines }))}
                                />
                            )}
                            {commits && commits.byAuthor.length > 0 && (
                                <Breakdown
                                    title="Commits by author"
                                    delay={0.41}
                                    rows={commits.byAuthor.map((a) => ({ label: a.name, value: a.count }))}
                                />
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {visitors ? (
                                <>
                                    <Stat
                                        label="Visitors / day"
                                        value={visitors.perDay}
                                        decimals={1}
                                        delay={0.44}
                                    />
                                    <Stat
                                        label="Visitors / week"
                                        value={visitors.perWeek}
                                        decimals={1}
                                        delay={0.47}
                                    />
                                    <Stat
                                        label="Visitors / month"
                                        value={visitors.perMonth}
                                        decimals={0}
                                        delay={0.5}
                                    />
                                    <Stat
                                        label="Page views"
                                        value={visitors.pageViews}
                                        note={`last ${visitors.windowDays} days`}
                                        delay={0.53}
                                    />
                                </>
                            ) : (
                                <div className="col-span-full rounded-xl border border-dashed border-border/50 p-4 text-xs text-muted-foreground">
                                    {visitorsFailed
                                        ? 'Visitor averages are unavailable right now.'
                                        : 'Loading visitor averages…'}
                                </div>
                            )}
                            {info.dependencies !== null && (
                                <Stat label="Dependencies" value={info.dependencies} delay={0.56} />
                            )}
                            {commits && (
                                <Stat
                                    label="Busiest weekday"
                                    value={Math.max(...commits.byWeekday)}
                                    note={WEEKDAYS[commits.byWeekday.indexOf(Math.max(...commits.byWeekday))]}
                                    delay={0.59}
                                />
                            )}
                        </div>

                        <footer className="mt-6 border-t border-border/40 pt-4 text-xs text-muted-foreground/70">
                            Code counts cover tracked source files only — generated output and
                            uploaded artifacts are excluded. Visitor figures are a{' '}
                            {visitors?.windowDays ?? 90}-day average.
                        </footer>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
