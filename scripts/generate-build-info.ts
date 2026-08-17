/**
 * Collects everything the footer's version line and metrics dialog need, at build
 * time, into `data/build-info.json`.
 *
 * Runs FIRST in `npm run build` — before `next build` — because the version string
 * has to be in the exported HTML. The file is gitignored: committing it would
 * change on every commit and every rebuild, and a rebuild is not a source change.
 *
 * Two sources, deliberately:
 *   • The working tree, via `git ls-files`, for the line and file counts. That
 *     works even in a shallow clone, because the checkout is always complete.
 *   • The commit log, for everything historical. Cloudflare Pages may clone
 *     shallow, in which case `git log` sees one commit and every average would be
 *     nonsense — so a shallow repo falls back to the GitHub API (the repo is
 *     public, so this needs no credential, though it will use GITHUB_TOKEN if the
 *     build has one).
 *
 * Nothing here is allowed to fail the build. Metrics are a footer ornament; a
 * rate-limited API or an unusual checkout should cost us the dialog, not the
 * deploy. Every section degrades to null and the UI hides what it does not have.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'data', 'build-info.json');

const REPO_OWNER = 'mncoleman';
const REPO_NAME = 'mncoleman';
const REPO_URL = `https://github.com/${REPO_OWNER}/${REPO_NAME}`;

/** Extensions that count as code. Everything else is content, config or asset. */
const CODE_EXTENSIONS = new Set([
    'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts',
    'css', 'scss', 'html', 'sh', 'py', 'sql', 'toml', 'yml', 'yaml',
]);

/** Generated or vendored: real files, but nobody wrote them. */
const EXCLUDED_PREFIXES = ['profile-summary-card-output/', 'public/artifacts/', 'node_modules/'];

type Commit = { sha: string; timestamp: number; author: string };

function git(args: string[]): string {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

function isShallow(): boolean {
    try {
        return git(['rev-parse', '--is-shallow-repository']) === 'true';
    } catch {
        return true; // no git at all — treat as unusable and let the API path try
    }
}

// ── Commit history ──────────────────────────────────────────────────────────

function commitsFromGit(): Commit[] {
    // %x1f is the ASCII unit separator: a commit author name can contain almost
    // anything, so a printable delimiter is not safe.
    const raw = git(['log', '--pretty=format:%H%x1f%at%x1f%aN', '--no-merges']);
    return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => {
            const [sha, at, author] = line.split('\x1f');
            return { sha, timestamp: parseInt(at, 10) * 1000, author };
        });
}

async function commitsFromApi(): Promise<Commit[]> {
    const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'mncoleman-build',
    };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    const commits: Commit[] = [];
    // Cap the walk: 20 pages is 2000 commits, well past this repo, and it stops a
    // pathological case from turning a build into a crawl.
    for (let page = 1; page <= 20; page++) {
        const res = await fetch(
            `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits?per_page=100&page=${page}`,
            { headers }
        );
        if (!res.ok) throw new Error(`GitHub API ${res.status}`);
        const batch = (await res.json()) as Array<{
            sha: string;
            commit: { author: { date: string; name: string } };
        }>;
        if (!batch.length) break;
        for (const c of batch) {
            commits.push({
                sha: c.sha,
                timestamp: Date.parse(c.commit.author.date),
                author: c.commit.author.name,
            });
        }
        if (batch.length < 100) break;
    }
    return commits;
}

/** Local date key (YYYY-MM-DD) in UTC — a commit's "day" has to mean one thing. */
function dayKey(ts: number): string {
    return new Date(ts).toISOString().slice(0, 10);
}

function summariseCommits(commits: Commit[]) {
    if (!commits.length) return null;

    const sorted = [...commits].sort((a, b) => a.timestamp - b.timestamp);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    const perDay = new Map<string, number>();
    const perWeekday = new Array(7).fill(0);
    const perHour = new Array(24).fill(0);
    const perAuthor = new Map<string, number>();

    for (const c of sorted) {
        const key = dayKey(c.timestamp);
        perDay.set(key, (perDay.get(key) || 0) + 1);
        const d = new Date(c.timestamp);
        perWeekday[d.getUTCDay()]++;
        perHour[d.getUTCHours()]++;
        perAuthor.set(c.author, (perAuthor.get(c.author) || 0) + 1);
    }

    let busiestDay = { date: first ? dayKey(first.timestamp) : '', count: 0 };
    for (const [date, count] of perDay) {
        if (count > busiestDay.count) busiestDay = { date, count };
    }

    // Longest run of consecutive calendar days with at least one commit, and the
    // longest gap between two commits. Both read as "how the work actually went"
    // in a way a monthly average cannot.
    const days = [...perDay.keys()].sort();
    let longestStreak = 0;
    let streak = 0;
    let previous: number | null = null;
    for (const day of days) {
        const t = Date.parse(`${day}T00:00:00Z`);
        streak = previous !== null && t - previous === 86400000 ? streak + 1 : 1;
        if (streak > longestStreak) longestStreak = streak;
        previous = t;
    }

    let longestGapDays = 0;
    for (let i = 1; i < sorted.length; i++) {
        const gap = (sorted[i].timestamp - sorted[i - 1].timestamp) / 86400000;
        if (gap > longestGapDays) longestGapDays = gap;
    }

    const spanDays = Math.max((last.timestamp - first.timestamp) / 86400000, 1);

    return {
        total: sorted.length,
        firstCommit: { sha: first.sha, date: new Date(first.timestamp).toISOString() },
        lastCommit: { sha: last.sha, date: new Date(last.timestamp).toISOString() },
        activeDays: perDay.size,
        busiestDay,
        longestStreakDays: longestStreak,
        longestGapDays: Math.round(longestGapDays * 10) / 10,
        // Rates are per elapsed span, not per active day — "we commit 40 times a
        // month" should include the months where we did not.
        perWeek: Math.round((sorted.length / spanDays) * 7 * 10) / 10,
        perMonth: Math.round((sorted.length / spanDays) * 30.44 * 10) / 10,
        byWeekday: perWeekday,
        byHour: perHour,
        byAuthor: [...perAuthor.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([name, count]) => ({ name, count })),
    };
}

// ── Working tree ────────────────────────────────────────────────────────────

function summariseTree() {
    let files: string[];
    try {
        files = git(['ls-files']).split('\n').filter(Boolean);
    } catch {
        return null;
    }

    let lines = 0;
    let codeFiles = 0;
    let bytes = 0;
    const byLanguage = new Map<string, { files: number; lines: number }>();

    for (const file of files) {
        if (EXCLUDED_PREFIXES.some((p) => file.startsWith(p))) continue;
        const ext = file.split('.').pop()?.toLowerCase() || '';
        if (!CODE_EXTENSIONS.has(ext)) continue;

        let content: string;
        try {
            // A file can be listed but absent (sparse checkout, a bad merge); one
            // unreadable file must not take the whole count down with it.
            const stat = statSync(join(ROOT, file));
            if (!stat.isFile()) continue;
            content = readFileSync(join(ROOT, file), 'utf-8');
            bytes += stat.size;
        } catch {
            continue;
        }

        const count = content.length ? content.split('\n').length : 0;
        lines += count;
        codeFiles++;
        const entry = byLanguage.get(ext) || { files: 0, lines: 0 };
        entry.files++;
        entry.lines += count;
        byLanguage.set(ext, entry);
    }

    return {
        lines,
        codeFiles,
        trackedFiles: files.length,
        bytes,
        byLanguage: [...byLanguage.entries()]
            .sort((a, b) => b[1].lines - a[1].lines)
            .slice(0, 8)
            .map(([ext, v]) => ({ ext, ...v })),
    };
}

function dependencyCount(): number | null {
    try {
        const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
        return Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length;
    } catch {
        return null;
    }
}

// ── Version ─────────────────────────────────────────────────────────────────

/**
 * CalVer: `YYYY.MM.DD.N`, N being this deployment's ordinal for the day.
 *
 * The build cannot know N by itself — a cron rebuild ships the same commit as the
 * one before it — so the admin Worker keeps the counter in KV and hands out the
 * next one. `0` means the counter was unreachable (a local build, or the Worker
 * being down), which is deliberately distinguishable from a real first deploy.
 */
async function deploymentNumber(date: string): Promise<number> {
    const base = process.env.BUILD_COUNTER_URL || process.env.NEXT_PUBLIC_WORKER_URL;
    const token = process.env.BUILD_TOKEN;
    if (!base || !token) return 0;
    try {
        const res = await fetch(`${base.replace(/\/$/, '')}/api/build/number`, {
            method: 'POST',
            // `X-Requested-With` is the Worker's CSRF gate — it rejects every
            // non-GET without it, including server-to-server calls like this one.
            headers: {
                'X-Build-Token': token,
                'X-Requested-With': 'mncoleman-admin',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ date }),
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return 0;
        const data = (await res.json()) as { n?: number };
        return typeof data.n === 'number' ? data.n : 0;
    } catch {
        return 0;
    }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);

    let commits: Commit[] = [];
    let source = 'git';
    try {
        if (isShallow()) throw new Error('shallow clone');
        commits = commitsFromGit();
    } catch (e) {
        source = 'github-api';
        try {
            commits = await commitsFromApi();
        } catch (apiError) {
            source = 'unavailable';
            console.warn(
                `[build-info] no commit history (${(e as Error).message}; ${(apiError as Error).message})`
            );
        }
    }

    // Cloudflare Pages supplies the deployed SHA; fall back to the local HEAD.
    let sha = process.env.CF_PAGES_COMMIT_SHA || '';
    if (!sha) {
        try {
            sha = git(['rev-parse', 'HEAD']);
        } catch {
            sha = '';
        }
    }

    const n = await deploymentNumber(date);
    const [year, month, day] = date.split('-');

    const info = {
        version: `${year}.${month}.${day}.${n}`,
        deployment: n,
        builtAt: now.toISOString(),
        commit: {
            sha,
            short: sha.slice(0, 7),
            url: sha ? `${REPO_URL}/commit/${sha}` : REPO_URL,
        },
        repoUrl: REPO_URL,
        historySource: source,
        commits: summariseCommits(commits),
        code: summariseTree(),
        dependencies: dependencyCount(),
    };

    writeFileSync(OUT, `${JSON.stringify(info, null, 2)}\n`);
    console.log(
        `[build-info] ${info.version} · ${info.commit.short} · ${info.commits?.total ?? '?'} commits (${source}) · ${info.code?.lines ?? '?'} lines in ${info.code?.codeFiles ?? '?'} files`
    );
}

main().catch((error) => {
    // Never fail the build over an ornament. Write the minimum the UI needs and move on.
    console.warn('[build-info] falling back to a minimal record:', error);
    const now = new Date();
    const [year, month, day] = now.toISOString().slice(0, 10).split('-');
    writeFileSync(
        OUT,
        `${JSON.stringify(
            {
                version: `${year}.${month}.${day}.0`,
                deployment: 0,
                builtAt: now.toISOString(),
                commit: { sha: '', short: '', url: REPO_URL },
                repoUrl: REPO_URL,
                historySource: 'unavailable',
                commits: null,
                code: null,
                dependencies: null,
            },
            null,
            2
        )}\n`
    );
});
