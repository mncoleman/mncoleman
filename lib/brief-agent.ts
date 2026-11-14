/**
 * The brief agent: the script on the Oracle ARM box (`brief-agent/` in this repo)
 * that compiles and publishes the daily brief. The box opens nothing to the internet.
 * It checks in with the admin Worker every few minutes, and everything a person
 * controls from /admin/brief lives here in the BRIEFS KV namespace:
 *
 *   agent:config   the schedule and standing instructions (the panel writes it)
 *   agent:request  at most one queued "run now" or "update" (the panel queues, the box claims)
 *   agent:runs     the last RUN_LIMIT runs, newest first (the box reports)
 *   agent:seen     when the box last checked in (written at most every SEEN_EVERY_MS)
 *
 * Routes, all under the `content` feature (see `handleBriefAgent`):
 *   GET    /api/briefs/agent           {config, request, runs, seen}
 *   PUT    /api/briefs/agent/config    any of {enabled, time, model, instructions}   panel only
 *   POST   /api/briefs/agent/request   {mode, date?, instructions?}                   panel only
 *   DELETE /api/briefs/agent/request   removes the queued request and returns it (cancel, or the box claiming it)
 *   POST   /api/briefs/agent/runs      one run's report, upserted by id               box only
 *
 * Shared by the Worker and the admin panel; no imports, so both bundles stay small.
 */

export const AGENT_MODELS = ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'] as const;
export type AgentModel = (typeof AGENT_MODELS)[number];

export interface BriefAgentConfig {
    /** Off: the scheduled run is skipped. A queued request still runs. */
    enabled: boolean;
    /** HH:MM, America/Denver. */
    time: string;
    model: AgentModel;
    /** Standing instructions appended to the prompt on every run. Plain text. */
    instructions: string;
}

export interface BriefAgentRequest {
    id: string;
    /** full: compile the date from scratch. update: revise the published edition as asked. */
    mode: 'full' | 'update';
    /** YYYY-MM-DD; absent means today in Mountain Time. */
    date?: string;
    instructions?: string;
    requestedAt: string;
    requestedBy: string;
}

export interface BriefAgentRun {
    id: string;
    status: 'running' | 'ok' | 'failed';
    trigger: 'scheduled' | 'manual';
    mode: 'full' | 'update';
    date: string;
    startedAt: string;
    finishedAt?: string;
    model?: string;
    costUsd?: number;
    minutes?: number;
    tokensOut?: number;
    /** Items per sector key. */
    counts?: Record<string, number>;
    warnings?: number;
    /** What was asked, for an update. */
    instructions?: string;
    error?: string;
}

export interface BriefAgentState {
    config: BriefAgentConfig;
    request: BriefAgentRequest | null;
    runs: BriefAgentRun[];
    seen: string | null;
}

export const AGENT_CONFIG_KEY = 'agent:config';
export const AGENT_REQUEST_KEY = 'agent:request';
export const AGENT_RUNS_KEY = 'agent:runs';
export const AGENT_SEEN_KEY = 'agent:seen';
export const RUN_LIMIT = 40;
export const SEEN_EVERY_MS = 10 * 60_000;
export const DEFAULT_AGENT_CONFIG: BriefAgentConfig = { enabled: true, time: '06:00', model: 'claude-sonnet-5-5', instructions: '' };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
// Control characters other than newline and tab: one would break the JSON the box reads.
const clean = (s: string, max: number) => s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);

/** Merge a partial update into the stored config. A string is an error to show. */
export function cleanAgentConfig(input: unknown, base: BriefAgentConfig): BriefAgentConfig | string {
    if (!input || typeof input !== 'object') return 'Send a JSON object.';
    const b = input as Record<string, unknown>;
    const next = { ...base };
    if (b.enabled !== undefined) {
        if (typeof b.enabled !== 'boolean') return 'enabled must be true or false';
        next.enabled = b.enabled;
    }
    if (b.time !== undefined) {
        if (typeof b.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) return 'time must be HH:MM (24-hour)';
        next.time = b.time;
    }
    if (b.model !== undefined) {
        if (!(AGENT_MODELS as readonly unknown[]).includes(b.model)) return `model must be one of ${AGENT_MODELS.join(', ')}`;
        next.model = b.model as AgentModel;
    }
    if (b.instructions !== undefined) {
        if (typeof b.instructions !== 'string') return 'instructions must be text';
        next.instructions = clean(b.instructions, 4000);
    }
    return next;
}

export function cleanAgentRequest(input: unknown, by: string, now: Date, id: string): BriefAgentRequest | string {
    if (!input || typeof input !== 'object') return 'Send a JSON object.';
    const b = input as Record<string, unknown>;
    if (b.mode !== 'full' && b.mode !== 'update') return 'mode must be "full" or "update"';
    if (b.date !== undefined && b.date !== '' && (typeof b.date !== 'string' || !DATE_RE.test(b.date))) return 'date must be YYYY-MM-DD';
    const instructions = typeof b.instructions === 'string' ? clean(b.instructions, 4000) : '';
    if (b.mode === 'update' && !instructions) return 'Say what to change.';
    return {
        id, mode: b.mode, requestedAt: now.toISOString(), requestedBy: clean(by, 80) || 'Admin',
        ...(b.date ? { date: b.date as string } : {}),
        ...(instructions ? { instructions } : {}),
    };
}

export function cleanAgentRun(input: unknown): BriefAgentRun | string {
    if (!input || typeof input !== 'object') return 'Send a JSON object.';
    const b = input as Record<string, unknown>;
    if (typeof b.id !== 'string' || !ID_RE.test(b.id)) return 'id is required';
    if (!['running', 'ok', 'failed'].includes(b.status as string)) return 'status must be running, ok or failed';
    if (b.trigger !== 'scheduled' && b.trigger !== 'manual') return 'trigger must be scheduled or manual';
    if (b.mode !== 'full' && b.mode !== 'update') return 'mode must be full or update';
    if (typeof b.date !== 'string' || !DATE_RE.test(b.date)) return 'date must be YYYY-MM-DD';
    if (typeof b.startedAt !== 'string') return 'startedAt is required';
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
    const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? clean(v, max) : undefined);
    let counts: Record<string, number> | undefined;
    if (b.counts && typeof b.counts === 'object') {
        counts = {};
        for (const [k, v] of Object.entries(b.counts as Record<string, unknown>).slice(0, 10)) {
            const n = num(v);
            if (/^[a-z_]{1,20}$/.test(k) && n !== undefined) counts[k] = n;
        }
    }
    const run: BriefAgentRun = {
        id: b.id, status: b.status as BriefAgentRun['status'], trigger: b.trigger, mode: b.mode, date: b.date,
        startedAt: clean(b.startedAt, 40),
        finishedAt: str(b.finishedAt, 40), model: str(b.model, 40), costUsd: num(b.costUsd), minutes: num(b.minutes),
        tokensOut: num(b.tokensOut), counts, warnings: num(b.warnings), instructions: str(b.instructions, 4000), error: str(b.error, 1000),
    };
    for (const k of Object.keys(run) as (keyof BriefAgentRun)[]) if (run[k] === undefined) delete run[k];
    return run;
}

interface Kv {
    get(key: string, type: 'json'): Promise<unknown>;
    put(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
}

export interface AgentCtx {
    kv: Kv;
    /** True when the caller is a connected app (the box), not a person in the panel. */
    viaMcp: boolean;
    who: string;
    now?: Date;
    newId?: () => string;
}

export async function readAgentState(kv: Kv): Promise<BriefAgentState> {
    const [config, request, runs, seen] = await Promise.all([
        kv.get(AGENT_CONFIG_KEY, 'json'), kv.get(AGENT_REQUEST_KEY, 'json'), kv.get(AGENT_RUNS_KEY, 'json'), kv.get(AGENT_SEEN_KEY, 'json'),
    ]);
    return {
        config: { ...DEFAULT_AGENT_CONFIG, ...((config as Partial<BriefAgentConfig>) || {}) },
        request: (request as BriefAgentRequest) || null,
        runs: Array.isArray(runs) ? (runs as BriefAgentRun[]) : [],
        seen: typeof (seen as { at?: string })?.at === 'string' ? (seen as { at: string }).at : null,
    };
}

/**
 * Handle /api/briefs/agent[/config|/request|/runs]. Returns null for any other path.
 * `body` is the parsed JSON body (null when absent or invalid). Answers {status, body}
 * so the Worker owns headers and the selftest needs no Response.
 */
export async function handleBriefAgent(method: string, path: string, body: unknown, ctx: AgentCtx): Promise<{ status: number; body: unknown } | null> {
    const m = path.match(/^\/api\/briefs\/agent(?:\/(config|request|runs))?\/?$/);
    if (!m) return null;
    const part = m[1] || '';
    const now = ctx.now || new Date();
    const { kv } = ctx;
    const panelOnly = () => ({ status: 403, body: { error: 'Only the admin panel can do that.' } });
    const boxOnly = () => ({ status: 403, body: { error: 'Only the brief agent reports runs.' } });

    if (!part && method === 'GET') {
        const state = await readAgentState(kv);
        if (ctx.viaMcp && (!state.seen || now.getTime() - Date.parse(state.seen) > SEEN_EVERY_MS)) {
            state.seen = now.toISOString();
            await kv.put(AGENT_SEEN_KEY, JSON.stringify({ at: state.seen }));
        }
        return { status: 200, body: state };
    }
    if (part === 'config' && method === 'PUT') {
        if (ctx.viaMcp) return panelOnly();
        const state = await readAgentState(kv);
        const next = cleanAgentConfig(body, state.config);
        if (typeof next === 'string') return { status: 400, body: { error: next } };
        await kv.put(AGENT_CONFIG_KEY, JSON.stringify(next));
        return { status: 200, body: { ok: true, config: next } };
    }
    if (part === 'request' && method === 'POST') {
        if (ctx.viaMcp) return panelOnly();
        if (await kv.get(AGENT_REQUEST_KEY, 'json')) return { status: 409, body: { error: 'A request is already waiting. Cancel it first.' } };
        const id = ctx.newId ? ctx.newId() : crypto.randomUUID().replace(/-/g, '').slice(0, 16);
        const req = cleanAgentRequest(body, ctx.who, now, id);
        if (typeof req === 'string') return { status: 400, body: { error: req } };
        await kv.put(AGENT_REQUEST_KEY, JSON.stringify(req));
        return { status: 200, body: { ok: true, request: req } };
    }
    if (part === 'request' && method === 'DELETE') {
        const req = (await kv.get(AGENT_REQUEST_KEY, 'json')) as BriefAgentRequest | null;
        if (req) await kv.delete(AGENT_REQUEST_KEY);
        return { status: 200, body: { ok: true, request: req || null } };
    }
    if (part === 'runs' && method === 'POST') {
        if (!ctx.viaMcp) return boxOnly();
        const run = cleanAgentRun(body);
        if (typeof run === 'string') return { status: 400, body: { error: run } };
        const runs = ((await kv.get(AGENT_RUNS_KEY, 'json')) as BriefAgentRun[] | null) || [];
        const next = [run, ...runs.filter((r) => r.id !== run.id)]
            .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
            .slice(0, RUN_LIMIT);
        await kv.put(AGENT_RUNS_KEY, JSON.stringify(next));
        // Reporting counts as checking in.
        await kv.put(AGENT_SEEN_KEY, JSON.stringify({ at: now.toISOString() }));
        return { status: 200, body: { ok: true } };
    }
    return { status: 405, body: { error: 'method_not_allowed' } };
}

/** A run that says "running" long after any run could last died without reporting. */
export function runLooksStuck(run: BriefAgentRun, now = new Date()): boolean {
    return run.status === 'running' && now.getTime() - Date.parse(run.startedAt) > 2 * 60 * 60_000;
}
