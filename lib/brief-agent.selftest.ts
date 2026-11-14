// npx tsx lib/brief-agent.selftest.ts — the brief agent's routes against an in-memory KV.
import { AGENT_RUNS_KEY, RUN_LIMIT, cleanAgentConfig, handleBriefAgent, runLooksStuck, DEFAULT_AGENT_CONFIG, type BriefAgentRun } from './brief-agent';

let failed = 0;
const check = (name: string, ok: boolean) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`); };

const store = new Map<string, string>();
const kv = {
    get: async (k: string) => (store.has(k) ? JSON.parse(store.get(k)!) : null),
    put: async (k: string, v: string) => { store.set(k, v); },
    delete: async (k: string) => { store.delete(k); },
};
const now = new Date('2026-11-14T13:00:00Z');
const panel = { kv, viaMcp: false, who: 'Matthew', now, newId: () => 'req000001' };
const box = { kv, viaMcp: true, who: 'Matthew', now };
const call = (ctx: typeof panel | typeof box, m: string, p: string, b: unknown = null) => handleBriefAgent(m, p, b, ctx);

(async () => {
    check('other paths are not handled', (await call(panel, 'GET', '/api/briefs')) === null);
    let r = await call(panel, 'GET', '/api/briefs/agent');
    check('defaults with nothing stored', r?.status === 200 && (r.body as any).config.time === '06:00' && (r.body as any).request === null);
    check('a panel read is not a check-in', !store.has('agent:seen'));
    await call(box, 'GET', '/api/briefs/agent');
    check('a box read is a check-in', JSON.parse(store.get('agent:seen')!).at === now.toISOString());

    r = await call(panel, 'PUT', '/api/briefs/agent/config', { time: '05:30', enabled: false });
    check('config saves a partial update', r?.status === 200 && (r.body as any).config.time === '05:30' && (r.body as any).config.model === 'claude-sonnet-5-5');
    check('bad time refused', (await call(panel, 'PUT', '/api/briefs/agent/config', { time: '6am' }))?.status === 400);
    check('unknown model refused', (await call(panel, 'PUT', '/api/briefs/agent/config', { model: 'gpt' }))?.status === 400);
    check('the box cannot change config', (await call(box, 'PUT', '/api/briefs/agent/config', { enabled: true }))?.status === 403);
    check('control characters stripped', (cleanAgentConfig({ instructions: 'a\u0000b\nc' }, DEFAULT_AGENT_CONFIG) as any).instructions === 'ab\nc');

    check('update with no instructions refused', (await call(panel, 'POST', '/api/briefs/agent/request', { mode: 'update' }))?.status === 400);
    check('the box cannot queue', (await call(box, 'POST', '/api/briefs/agent/request', { mode: 'full' }))?.status === 403);
    r = await call(panel, 'POST', '/api/briefs/agent/request', { mode: 'update', instructions: 'Refresh local' });
    check('a request is queued', r?.status === 200 && (r.body as any).request.requestedBy === 'Matthew');
    check('a second request waits its turn', (await call(panel, 'POST', '/api/briefs/agent/request', { mode: 'full' }))?.status === 409);
    r = await call(box, 'DELETE', '/api/briefs/agent/request');
    check('claiming returns and removes it', (r?.body as any).request?.id === 'req000001' && !store.has('agent:request'));
    r = await call(box, 'DELETE', '/api/briefs/agent/request');
    check('claiming nothing returns null', (r?.body as any).request === null);

    const run = { id: 'run000001', status: 'running', trigger: 'manual', mode: 'full', date: '2026-11-14', startedAt: '2026-11-14T13:00:00Z' };
    check('the panel cannot report runs', (await call(panel, 'POST', '/api/briefs/agent/runs', run))?.status === 403);
    await call(box, 'POST', '/api/briefs/agent/runs', run);
    await call(box, 'POST', '/api/briefs/agent/runs', { ...run, status: 'ok', costUsd: 1.5, counts: { local: 5, 'bad key': 2 } });
    const runs = JSON.parse(store.get(AGENT_RUNS_KEY)!) as BriefAgentRun[];
    check('a run report upserts by id', runs.length === 1 && runs[0].status === 'ok' && runs[0].costUsd === 1.5);
    check('bad count keys dropped', JSON.stringify(runs[0].counts) === '{"local":5}');
    for (let i = 0; i < RUN_LIMIT + 5; i++) await call(box, 'POST', '/api/briefs/agent/runs', { ...run, id: `run1${String(i).padStart(5, '0')}`, startedAt: `2026-11-${String(15 + (i % 10)).padStart(2, '0')}T0${i % 10}:00:00Z` });
    check('history is capped', JSON.parse(store.get(AGENT_RUNS_KEY)!).length === RUN_LIMIT);
    check('a bad status refused', (await call(box, 'POST', '/api/briefs/agent/runs', { ...run, status: 'done' }))?.status === 400);

    check('a 3-hour running run looks stuck', runLooksStuck({ ...(run as BriefAgentRun), startedAt: '2026-11-14T10:00:00Z' }, now));
    check('a fresh one does not', !runLooksStuck(run as BriefAgentRun, now));

    console.log(failed ? `\n${failed} FAILED` : '\nall passed');
    process.exit(failed ? 1 : 0);
})();
