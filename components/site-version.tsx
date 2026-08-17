'use client';

import { useState } from 'react';
import { buildInfo } from '@/lib/build-info';
import { SiteMetricsDialog } from '@/components/site-metrics-dialog';

/**
 * The footer's version line: what is deployed, from which commit, and since when.
 *
 * Deliberately quiet — it sits below the legal links at the smallest size on the
 * site, because it is for the handful of people who look for it. The commit hash
 * links out to GitHub; the start date opens the metrics dialog.
 *
 * The dialog itself is heavy enough to be worth not shipping to everyone, but it
 * is also small enough that a dynamic import would cost a request to save a few
 * kilobytes; it stays a plain import and simply renders nothing until opened.
 */
export function SiteVersion() {
    const [open, setOpen] = useState(false);
    const { version, commit, commits } = buildInfo;

    const started = commits
        ? new Date(commits.firstCommit.date).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              timeZone: 'UTC',
          })
        : null;

    return (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground/60">
            <span className="font-mono" title={`Built ${new Date(buildInfo.builtAt).toISOString()}`}>
                v{version}
            </span>

            {commit.short && (
                <>
                    <span aria-hidden="true">·</span>
                    <a
                        href={commit.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono underline-offset-4 transition-colors hover:text-foreground hover:underline"
                        title="View this commit on GitHub"
                    >
                        {commit.short}
                    </a>
                </>
            )}

            {started && (
                <>
                    <span aria-hidden="true">·</span>
                    <button
                        type="button"
                        onClick={() => setOpen(true)}
                        className="underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        title="See what this site is made of"
                    >
                        building since {started}
                    </button>
                </>
            )}

            <SiteMetricsDialog info={buildInfo} open={open} onClose={() => setOpen(false)} />
        </div>
    );
}
