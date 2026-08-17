import raw from '@/data/build-info.json';

/**
 * Typed access to the build stamp written by `scripts/generate-build-info.ts`.
 *
 * The JSON is gitignored and regenerated before every `next build` and `next dev`
 * (see the `build-info` / `predev` scripts), so it is always present by the time
 * anything imports it — and importing it rather than fetching it keeps the version
 * line in the statically exported HTML instead of appearing a beat after hydration.
 *
 * Every historical section is nullable on purpose. The generator refuses to fail a
 * deploy over a footer ornament, so an unusual checkout or a rate-limited API
 * yields nulls, and the UI hides what it does not have.
 */

export interface BuildInfo {
    /** CalVer: `YYYY.MM.DD.N`, N being the deployment's ordinal for that day. */
    version: string;
    /** `0` means the counter was unreachable — a local build, or the Worker down. */
    deployment: number;
    builtAt: string;
    commit: { sha: string; short: string; url: string };
    repoUrl: string;
    historySource: 'git' | 'github-api' | 'unavailable' | string;
    commits: {
        total: number;
        firstCommit: { sha: string; date: string };
        lastCommit: { sha: string; date: string };
        activeDays: number;
        busiestDay: { date: string; count: number };
        longestStreakDays: number;
        longestGapDays: number;
        perWeek: number;
        perMonth: number;
        byWeekday: number[];
        byHour: number[];
        byAuthor: Array<{ name: string; count: number }>;
    } | null;
    code: {
        lines: number;
        codeFiles: number;
        trackedFiles: number;
        bytes: number;
        byLanguage: Array<{ ext: string; files: number; lines: number }>;
    } | null;
    dependencies: number | null;
}

export const buildInfo = raw as BuildInfo;
