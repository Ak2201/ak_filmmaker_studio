/* ============================================================
   test:ai-run-all — Run all: the plan, the pool, the drafts, Accept
   ------------------------------------------------------------
   No browser, no key, no network. Proves:
     plan      planRun's nodes per project state, every skip reason,
               the two waves, blocking per scene (drafted or real
               shots), board-frames only when ticked
     pool      never more than 3 in flight; a wave-2 node starts the
               moment its parent is ready (before slower wave-1 nodes
               finish) and reads the parent's DRAFT; a rate limit is
               retried and drops the pool to one; a missing key fails
               the run once; abort puts running drafts back to queued;
               resume re-runs only queued/running/failed
     drafts    the in-memory backend: listRuns/getRun/update/clearRun,
               and the 14-day sweep on open
     real      the real ai-tasks.js over a faked model: a run of
               shot-draft + blocking-draft (blocking staged on 'draft:<n>'
               shots) writes NOTHING to storage; acceptDraft on the
               blocking accepts the shots first, maps the ids, stamps
               both, and one undo puts storage back byte for byte
   ============================================================ */
import { register } from 'node:module';

const mem = new Map();
globalThis.__fakeMem = mem;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec.endsWith('/store.js') || spec === './store.js')
      return { url: 'data:text/javascript,' + encodeURIComponent(
        'const m = globalThis.__fakeMem;' +
        'export const rawGet = (k) => (m.has(k) ? m.get(k) : null);' +
        'export const rawSet = (k, v) => { m.set(k, String(v)); return true; };' +
        'export const rawRemove = (k) => { m.delete(k); return true; };' +
        'export const onWriteElsewhere = () => () => {};' +
        'export const flushStorage = () => {};' +
        'export default new Proxy({}, { get: () => () => {} });'), shortCircuit: true };
    if (spec.endsWith('.css'))
      return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    return next(spec, ctx);
  }
  export async function load(url, ctx, next) {
    if (url.endsWith('.json')) {
      const { readFileSync } = await import('node:fs');
      return { format: 'module', source: 'export default ' + readFileSync(new URL(url), 'utf8'), shortCircuit: true };
    }
    return next(url, ctx);
  }
`), import.meta.url);

const P = await import('../src/lib/ai-run-all-model.js');
const D = await import('../src/lib/ai-drafts.js');
const R = await import('../src/lib/ai-run-all.js');

let pass = 0, fails = 0;
const ok = (c, m) => { if (c) pass++; else { fails++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
const tick = () => new Promise((r) => setTimeout(r, 0));

/* ================= the plan ================= */
const full = {
  scriptScenes: 3,
  scenes: [{ id: 's1', number: '1', shots: 0 }, { id: 's2', number: '2', shots: 2 }, { id: 's3', number: '3', shots: 0 }],
  shootable: 3, places: 2, characters: 1,
  callSheets: [{ id: 'c1', title: 'Day 1', notes: false }, { id: 'c2', title: 'Day 2', notes: true }],
  board: { ok: false, text: 'Connect Drive.' }
};
let plan = P.planRun({ project: full }).nodes;
const keys = (ns) => ns.map((n) => n.key);
eq(keys(plan), ['breakdown-tags', 'scene-notes', 'genre-comps', 'shot-draft', 'shoot-order', 'recce-notes', 'character-arcs',
  'blocking-draft:s1', 'blocking-draft:s2', 'blocking-draft:s3', 'budget-estimate', 'callsheet-notes:c1', 'callsheet-notes:c2'],
'plan: every default tool, board-frames left out unless ticked, blocking per scene, one per call sheet');
const by = (ns, k) => ns.find((n) => n.key === k);
eq(by(plan, 'shot-draft').ctx.sceneIds, ['s1', 's3'], 'plan: shot-draft divides only scenes with no shots');
eq([by(plan, 'blocking-draft:s1').parents, !!by(plan, 'blocking-draft:s1').needsParent], [['shot-draft'], true], 'plan: blocking on a drafted scene waits on shot-draft');
eq([by(plan, 'blocking-draft:s2').parents, !!by(plan, 'blocking-draft:s2').needsParent], [[], false], 'plan: blocking on real shots has no parent');
eq(by(plan, 'budget-estimate').parents, ['shoot-order'], 'plan: budget waits on the shoot order');
ok(by(plan, 'callsheet-notes:c2').skip && !by(plan, 'callsheet-notes:c1').skip, 'plan: a sheet with notes is skipped, a blank one runs');
ok(plan.every((n) => n.label), 'plan: every node has a label');
eq(by(plan, 'blocking-draft:s2').label, 'Blocking · Sc 2', 'plan: a per-scene label');
eq(plan.filter((n) => n.wave === 2).map((n) => n.taskId).filter((v, i, a) => a.indexOf(v) === i), ['blocking-draft', 'budget-estimate', 'callsheet-notes'], 'plan: wave 2');

plan = P.planRun({ ticks: ['board-frames', 'shot-draft'], project: full }).nodes;
eq(by(plan, 'board-frames').skip, 'Connect Drive.', 'plan: board-frames ticked but Drive not connected → skip with the gate text');
eq(by(plan, 'board-frames').parents, ['shot-draft'], 'plan: board-frames waits on shot-draft');
plan = P.planRun({ ticks: { 'board-frames': true }, project: { ...full, board: { ok: true } } }).nodes;
ok(!by(plan, 'board-frames').skip && !by(plan, 'board-frames').parents.length, 'plan: board ok, real shots, no shot-draft ticked → runs alone');

const empty = { scriptScenes: 0, scenes: [], shootable: 0, places: 0, characters: 0, callSheets: [], board: { ok: true } };
plan = P.planRun({ ticks: [...P.WAVE1, ...P.WAVE2], project: empty }).nodes;
ok(plan.every((n) => typeof n.skip === 'string' && n.skip.length > 10), 'plan: an empty project skips every tool, each with a sentence');
eq(keys(plan), ['breakdown-tags', 'scene-notes', 'genre-comps', 'shot-draft', 'shoot-order', 'recce-notes', 'character-arcs',
  'blocking-draft', 'budget-estimate', 'callsheet-notes', 'board-frames'], 'plan: an empty project still lists every ticked tool once');
plan = P.planRun({ project: { ...full, scenes: full.scenes.map((s) => ({ ...s, shots: 1 })) } }).nodes;
ok(/already has shots/.test(by(plan, 'shot-draft').skip), 'plan: every scene has shots → shot-draft skipped');
ok(['blocking-draft:s1', 'blocking-draft:s2', 'blocking-draft:s3'].every((k) => !by(plan, k).parents.length), 'plan: shot-draft skipped → blocking reads real shots only');
plan = P.planRun({ ticks: ['budget-estimate'], project: full }).nodes;
eq(by(plan, 'budget-estimate').parents, [], 'plan: shoot-order not ticked → the budget reads the schedule as it is');

/* ================= forgetting a film's drafts (QA r4 H-2) ================= */
{
  const b = D.memoryBackend();
  await b.put(D.cleanDraft({ projectId: 'pD', runId: 'r', key: 'a' }));
  await b.put(D.cleanDraft({ projectId: 'pD', runId: 'r2', key: 'b' }));
  await b.put(D.cleanDraft({ projectId: 'pK', runId: 'r', key: 'a' }));
  eq(await D.forgetDrafts('pD', { backend: b }), 2, 'drafts: deleting a film forgets every draft of it, fresh or not');
  eq((await b.all()).map((r) => r.projectId), ['pK'], 'drafts: and leaves the other films\' drafts');
  await b.put(D.cleanDraft({ projectId: 'orphan', runId: 'r', key: 'a' }));
  eq(await D.forgetDrafts(null, { backend: b }), 2, 'drafts: Erase everything forgets every draft, listed film or not');
  eq(b.size(), 0, 'drafts: nothing left after the erase');
}

/* ================= the draft store ================= */
{
  const b = D.memoryBackend();
  const old = new Date(Date.now() - 20 * 86400000).toISOString();
  await b.put(D.cleanDraft({ projectId: 'pX', runId: 'old', key: 'a', createdAt: old }));
  await b.put(D.cleanDraft({ projectId: 'pY', runId: 'old2', key: 'a', createdAt: old }));
  await b.put(D.cleanDraft({ projectId: 'pY', runId: 'new', key: 'a' }));
  const st = D.openDrafts('pX', { backend: b });
  eq(await st.listRuns(), [], 'drafts: a run older than 14 days is swept on open');
  eq(b.size(), 1, 'drafts: the sweep covers every project, and keeps a new run');
  await st.put({ runId: 'r1', key: 'k2', order: 1, status: 'queued' });
  await st.put({ runId: 'r1', key: 'k1', order: 0, status: 'queued', zz: 'kept' });
  eq((await st.getRun('r1')).map((d) => d.key), ['k1', 'k2'], 'drafts: getRun in plan order');
  const u = await st.update('r1', 'k1', { status: 'ready', result: { items: [1] } });
  eq([u.status, u.result.items, u.zz, u.projectId], ['ready', [1], 'kept', 'pX'], 'drafts: update merges, passes unknown fields through');
  const runs = await st.listRuns();
  eq([runs.length, runs[0].total, runs[0].counts.ready, runs[0].counts.queued], [1, 2, 1, 1], 'drafts: listRuns counts by status');
  eq(await st.update('r1', 'nope', {}), null, 'drafts: update of a missing draft → null');
  eq(await st.clearRun('r1'), 2, 'drafts: clearRun');
  ok(D.cleanDraft({ status: 'weird' }).status === 'queued', 'drafts: an unknown status reads queued');
}

/* ================= the pool, with faked tasks ================= */
function fakeEnv({ delays = {}, fail = {}, rateOnce = new Set(), log = [], seen = {} } = {}) {
  let inflight = 0, peak = 0;
  const calls = {};
  const make = (id) => ({
    id, kind: 'list', input: () => 'in:' + id,
    async run(input, { signal, ctx }) {
      const key = ctx.__key;
      calls[key] = (calls[key] || 0) + 1;
      inflight++; peak = Math.max(peak, inflight);
      log.push('start ' + key);
      seen[key] = ctx;
      try {
        await new Promise((resolve, reject) => {
          const t = setTimeout(resolve, delays[key] ?? 5);
          if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('Stopped'), { kind: 'aborted' })); }, { once: true });
        });
        if (rateOnce.has(key)) { rateOnce.delete(key); throw Object.assign(new Error('busy'), { kind: 'rate' }); }
        if (fail[key]) throw Object.assign(new Error(fail[key].msg || 'boom'), { kind: fail[key].kind || 'server' });
        log.push('end ' + key);
        return { items: [{ id: 'i0', text: key, sceneId: 's1', draft: { size: 'WS', description: 'x' } }], model: 'fake' };
      } finally { inflight--; }
    }
  });
  const tasks = new Map([...P.WAVE1, ...P.WAVE2].map((id) => [id, make(id)]));
  return {
    tasks, calls, peak: () => peak, log,
    ctxFor: (taskId, nodeCtx, { parentsResults }) => ({ ...nodeCtx, __parents: parentsResults }),
    unlocked: () => true, retryDelayMs: 0
  };
}

{
  const env = fakeEnv({ delays: { 'shot-draft': 5, 'shoot-order': 60, 'recce-notes': 60, 'character-arcs': 60, 'genre-comps': 60 } });
  const ctxFor = (taskId, nodeCtx, opts) => ({ ...env.ctxFor(taskId, nodeCtx, opts), __key: nodeCtx.__key });
  const drafts = D.openDrafts('p1', { backend: D.memoryBackend() });
  const updates = [];
  const project = full;
  const { runId, done } = await R.startRun({
    projectId: 'p1', project, drafts, tasks: env.tasks, unlocked: () => true, retryDelayMs: 0,
    ctxFor: (taskId, nodeCtx, opts) => ctxFor(taskId, { ...nodeCtx, __key: keyOfCtx(taskId, nodeCtx) }, opts),
    onUpdate: (d) => updates.push(d.key + ':' + d.status)
  });
  function keyOfCtx(taskId, c) {
    if (taskId === 'blocking-draft') return 'blocking-draft:' + c.sceneId;
    if (taskId === 'callsheet-notes') return 'callsheet-notes:' + c.sheetId;
    return taskId;
  }
  const out = await done;
  ok(env.peak() <= 3 && env.peak() >= 2, 'pool: at most 3 in flight (peak ' + env.peak() + ')');
  const rows = await drafts.getRun(runId);
  const st = Object.fromEntries(rows.map((r) => [r.key, r.status]));
  eq(st['blocking-draft:s1'], 'ready', 'pool: wave-2 blocking ran');
  eq(st['callsheet-notes:c2'], 'skipped', 'pool: a planned skip stays skipped');
  ok(rows.filter((r) => r.status === 'ready').every((r) => r.ms != null && r.startedAt && r.endedAt && r.model === 'fake' && r.aiRun), 'pool: ready drafts carry timing, model and a stamp run id');
  const L = env.log;
  const iBlk = L.indexOf('start blocking-draft:s1');
  ok(iBlk > L.indexOf('end shot-draft') && iBlk < L.indexOf('end shoot-order'), 'pool: blocking started as soon as shot-draft was ready, before a slow wave-1 node ended');
  ok(L.indexOf('start budget-estimate') > L.indexOf('end shoot-order'), 'pool: the budget waited for the shoot order');
  const par = (rows.find((r) => r.key === 'blocking-draft:s1') || {});
  ok(par.status === 'ready', 'pool: parent results reach the child');
  eq(out.stopped, false, 'pool: done resolves, not stopped');
  ok(updates.includes('shot-draft:running') && updates.includes('shot-draft:ready'), 'pool: onUpdate hears each status');

  /* resume: only queued / running / failed run again */
  await drafts.update(runId, 'scene-notes', { status: 'failed', error: { message: 'x' } });
  await drafts.update(runId, 'genre-comps', { status: 'running' });
  await drafts.update(runId, 'recce-notes', { status: 'queued' });
  await drafts.update(runId, 'breakdown-tags', { status: 'accepted' });
  for (const k of Object.keys(env.calls)) env.calls[k] = 0;
  const again = await R.resumeRun('p1', runId, { drafts, tasks: env.tasks, unlocked: () => true, retryDelayMs: 0,
    ctxFor: (taskId, nodeCtx, opts) => ctxFor(taskId, { ...nodeCtx, __key: keyOfCtx(taskId, nodeCtx) }, opts) });
  await again.done;
  const ran = Object.keys(env.calls).filter((k) => env.calls[k]).sort();
  eq(ran, ['genre-comps', 'recce-notes', 'scene-notes'], 'resume: re-runs only queued, running and failed');
  eq((await drafts.get(runId, 'breakdown-tags')).status, 'accepted', 'resume: an accepted draft is left alone');
}

/* rate limit, key failure, abort, a needsParent child of a failed parent */
async function runWith(opts, project = full, ticks) {
  const env = fakeEnv(opts);
  const drafts = D.openDrafts('p2', { backend: D.memoryBackend() });
  const keyOfCtx = (taskId, c) => (taskId === 'blocking-draft' ? 'blocking-draft:' + c.sceneId : taskId === 'callsheet-notes' ? 'callsheet-notes:' + c.sheetId : taskId);
  const ctl = new AbortController();
  const r = await R.startRun({ projectId: 'p2', project, ticks, drafts, tasks: env.tasks, unlocked: () => true, retryDelayMs: opts.retryDelayMs ?? 0,
    signal: ctl.signal, ctxFor: (taskId, nodeCtx, o) => ({ ...env.ctxFor(taskId, nodeCtx, o), __key: keyOfCtx(taskId, nodeCtx) }) });
  return { env, drafts, ctl, ...r };
}
{
  const t = await runWith({ rateOnce: new Set(['shot-draft']) }, full, ['shot-draft', 'shoot-order', 'recce-notes', 'genre-comps']);
  await t.done;
  eq([t.env.calls['shot-draft'], (await t.drafts.get(t.runId, 'shot-draft')).status], [2, 'ready'], 'pool: a rate-limited task is retried once and lands');
}
{
  const t = await runWith({ fail: { 'shot-draft': { kind: 'server' } } }, full, ['shot-draft', 'blocking-draft']);
  await t.done;
  eq((await t.drafts.get(t.runId, 'shot-draft')).status, 'failed', 'pool: a failure is the draft’s status');
  const child = await t.drafts.get(t.runId, 'blocking-draft:s1');
  eq([child.status, child.error && child.error.kind], ['skipped', 'parent'], 'pool: a child that needs its failed parent is skipped, with why');
  eq((await t.drafts.get(t.runId, 'blocking-draft:s2')).status, 'ready', 'pool: blocking on real shots still runs');
}
{
  const t = await runWith({ fail: { 'breakdown-tags': { kind: 'nokey', msg: 'No key.' } }, delays: { 'breakdown-tags': 1 } }, full,
    ['breakdown-tags', 'scene-notes', 'genre-comps', 'shot-draft', 'shoot-order', 'recce-notes']);
  const out = await t.done;
  const rows = await t.drafts.getRun(t.runId);
  ok(rows.every((r) => r.status !== 'queued'), 'pool: a missing key leaves nothing queued');
  ok(rows.filter((r) => r.status === 'failed').every((r) => r.error.message === 'No key.' || r.key === 'breakdown-tags'), 'pool: the rest fail with the same sentence');
  ok(out.counts.failed >= 1, 'pool: counts reported');
}
{
  const t = await runWith({ delays: { 'shot-draft': 200, 'shoot-order': 200, 'recce-notes': 200, 'genre-comps': 200 } }, full,
    ['shot-draft', 'shoot-order', 'recce-notes', 'genre-comps', 'blocking-draft']);
  await new Promise((r) => setTimeout(r, 30));
  t.ctl.abort();
  const out = await t.done;
  const rows = await t.drafts.getRun(t.runId);
  eq(out.stopped, true, 'abort: done says stopped');
  ok(rows.filter((r) => !/skipped/.test(r.status)).every((r) => r.status === 'queued'), 'abort: running drafts go back to queued, nothing new started');
  eq(Math.max(...Object.values(t.env.calls)), 1, 'abort: nothing started twice');
}
{
  let threw = null;
  try { await R.startRun({ projectId: 'p3', project: full, drafts: D.openDrafts('p3', { backend: D.memoryBackend() }), tasks: new Map(), unlocked: () => false }); }
  catch (e) { threw = e; }
  eq(threw && threw.kind, 'locked', 'gate: aiUnlocked false → nothing planned (fails closed)');
  threw = null;
  try { await R.startRun({ projectId: 'p3', project: full, drafts: D.openDrafts('p3', { backend: D.memoryBackend() }), tasks: new Map(), unlocked: () => { throw new Error('x'); } }); }
  catch (e) { threw = e; }
  eq(threw && threw.kind, 'locked', 'gate: an unknown answer is locked');
}

/* mapDraftIds */
{
  const v = { items: [{ id: 'shot:draft:0', shotId: 'draft:0' }, { id: 'shot:draft:12', shotId: 'draft:12' }], note: 'draft:1' };
  Object.defineProperty(v, 'memo', { value: { draft: { shots: [{ shotId: 'draft:0' }] } }, enumerable: false });
  const m = R.mapDraftIds(v, { 'draft:0': 'shA', 'draft:1': 'shB' });
  eq([m.items[0].id, m.items[0].shotId, m.items[1].shotId, m.note, m.memo.draft.shots[0].shotId], ['shot:shA', 'shA', 'draft:12', 'shB', 'shA'],
    'map: tokens replaced at any depth, the memo included; an unmapped id stays a draft id');
  ok(!Object.keys(m).includes('memo'), 'map: the memo stays non-enumerable');
}


/* ================= review findings (3 Nov 2026) ================= */
/* resume: a child skipped because its parent failed runs once the parent does */
{
  const t = await runWith({ fail: { 'shot-draft': { kind: 'server' } } }, full, ['shot-draft', 'blocking-draft']);
  await t.done;
  eq((await t.drafts.get(t.runId, 'blocking-draft:s1')).status, 'skipped', 'resume-parent: the child was skipped behind its failed parent');
  for (const k of Object.keys(t.env.calls)) t.env.calls[k] = 0;
  const keyOfCtx = (taskId, c) => (taskId === 'blocking-draft' ? 'blocking-draft:' + c.sceneId : taskId);
  const ok2 = fakeEnv({});
  const again = await R.resumeRun('p2', t.runId, { drafts: t.drafts, tasks: ok2.tasks, unlocked: () => true, retryDelayMs: 0,
    ctxFor: (taskId, nodeCtx, o) => ({ ...nodeCtx, __key: keyOfCtx(taskId, nodeCtx) }) });
  await again.done;
  eq([(await t.drafts.get(t.runId, 'shot-draft')).status, (await t.drafts.get(t.runId, 'blocking-draft:s1')).status, (await t.drafts.get(t.runId, 'blocking-draft:s3')).status],
    ['ready', 'ready', 'ready'], 'resume-parent: Resume re-runs the parent AND the children it had skipped');
  ok(!ok2.calls['blocking-draft:s2'], 'resume-parent: a child that had already run is not re-run');
}
/* a project switch mid-run stops the run; nothing is drafted from the other film */
{
  let open = 'pM';
  const env = fakeEnv({ delays: { 'shot-draft': 40, 'shoot-order': 40, 'recce-notes': 40, 'genre-comps': 40 } });
  const drafts = D.openDrafts('pM', { backend: D.memoryBackend() });
  const keyOfCtx = (taskId, c) => (taskId === 'blocking-draft' ? 'blocking-draft:' + c.sceneId : taskId);
  const r = await R.startRun({ projectId: 'pM', project: full, ticks: ['shot-draft', 'shoot-order', 'recce-notes', 'genre-comps', 'blocking-draft', 'budget-estimate'],
    drafts, tasks: env.tasks, unlocked: () => true, retryDelayMs: 0, projectNow: () => open,
    ctxFor: (taskId, nodeCtx, o) => ({ ...nodeCtx, __key: keyOfCtx(taskId, nodeCtx) }) });
  await new Promise((res) => setTimeout(res, 10));
  open = 'pOther';
  const out = await r.done;
  const rows = await drafts.getRun(r.runId);
  eq([out.stopped, out.moved], [true, true], 'moved: the run stops when another film is opened');
  ok(rows.every((d) => d.status === 'queued' || d.status === 'skipped'), 'moved: nothing became ready from the other film (in flight → queued)');
  ok(!env.log.some((l) => /start (blocking|budget)/.test(l)), 'moved: no wave-2 node started after the switch');
  const acc = await R.acceptDraft('pM', r.runId, 'shot-draft', undefined, { drafts, tasks: env.tasks, unlocked: () => true, projectNow: () => 'pOther' }).catch((e) => e);
  ok(acc instanceof Error && /another film/.test(acc.message), 'moved: Accept refuses while another film is open');
}
/* Accept follows the Pro gate */
{
  const drafts = D.openDrafts('pG', { backend: D.memoryBackend() });
  await drafts.put({ runId: 'rg', key: 'scene-notes', taskId: 'scene-notes', status: 'ready', result: { items: [] } });
  let applied = 0;
  const tasks = new Map([['scene-notes', { id: 'scene-notes', kind: 'list', apply: () => { applied++; return () => {}; } }]]);
  const e1 = await R.acceptDraft('pG', 'rg', 'scene-notes', undefined, { drafts, tasks, unlocked: () => false }).catch((e) => e);
  eq([e1 && e1.kind, applied, (await drafts.get('rg', 'scene-notes')).status], ['locked', 0, 'ready'], 'gate: a locked account cannot Accept a draft (nothing applied)');
}
/* stale parent, sibling undo — fake tasks that log what they write */
function acceptEnv() {
  const shots = new Set();
  const marks = new Map();   // child key → shot ids it points at
  const tasks = new Map([
    ['shot-draft', { id: 'shot-draft', kind: 'list', apply: (sel) => {
      const made = sel.map((it, n) => [it.id, 'real' + it.id]);
      made.forEach(([, r]) => shots.add(r));
      const undo = () => { made.forEach(([, r]) => shots.delete(r)); };
      undo.made = made;
      return undo;
    } }],
    ['blocking-draft', { id: 'blocking-draft', kind: 'list', apply: (sel, ctx) => {
      const k = 'blk:' + ctx.sceneId;
      marks.set(k, sel.map((it) => it.shotId));
      return () => { marks.delete(k); };
    } }]
  ]);
  return { shots, marks, tasks, ctxFor: (taskId, c) => ({ ...c }), unlocked: () => true };
}
async function seedAccept(drafts, parentRev) {
  await drafts.put({ runId: 'ra', key: 'shot-draft', taskId: 'shot-draft', order: 0, status: 'ready',
    result: { items: [{ id: 'a', sceneId: 's1' }, { id: 'b', sceneId: 's2' }] } });
  for (const [i, sc, n] of [[1, 's1', 0], [2, 's2', 1]]) {
    await drafts.put({ runId: 'ra', key: 'blocking-draft:' + sc, taskId: 'blocking-draft', order: i, status: 'ready', ctx: { sceneId: sc },
      parents: ['shot-draft'], needsParent: true, parentRev: parentRev ? { 'shot-draft': 0 } : undefined,
      result: { items: [{ id: 'm' + n, shotId: 'draft:' + n }] } });
  }
}
{
  const E = acceptEnv();
  const drafts = D.openDrafts('pA', { backend: D.memoryBackend() });
  await seedAccept(drafts, true);
  const a1 = await R.acceptDraft('pA', 'ra', 'blocking-draft:s1', undefined, { drafts, ...E });
  eq(E.marks.get('blk:s1'), ['reala'], 'sibling: Sc 1 accepted its parent and mapped onto the real shot');
  const a2 = await R.acceptDraft('pA', 'ra', 'blocking-draft:s2', undefined, { drafts, ...E });
  eq(E.marks.get('blk:s2'), ['realb'], 'sibling: Sc 2 mapped through the accepted parent');
  await a1.undo();
  eq([E.marks.has('blk:s1'), E.marks.get('blk:s2'), [...E.shots].sort()], [false, ['realb'], ['reala', 'realb']],
    'sibling: undoing Sc 1 keeps the shots Sc 2 points at (later work kept)');
  eq([(await drafts.get('ra', 'shot-draft')).status, (await drafts.get('ra', 'blocking-draft:s1')).status, (await drafts.get('ra', 'blocking-draft:s2')).status],
    ['accepted', 'ready', 'accepted'], 'sibling: the parent stays accepted, Sc 1 is ready again');
  await a2.undo();
  eq(E.marks.has('blk:s2'), false, 'sibling: Sc 2 undoes on its own');
}
{
  const E = acceptEnv();
  const drafts = D.openDrafts('pS', { backend: D.memoryBackend() });
  await seedAccept(drafts, true);
  /* the parent was refined in the Desk: its result replaced, rev bumped */
  await drafts.update('ra', 'shot-draft', { result: { items: [{ id: 'b', sceneId: 's2' }, { id: 'a', sceneId: 's1' }] }, rev: 1 });
  const e = await R.acceptDraft('pS', 'ra', 'blocking-draft:s1', undefined, { drafts, ...E }).catch((x) => x);
  ok(e instanceof Error && /changed after this draft/.test(e.message), 'stale: a child drafted against an earlier parent refuses');
  eq([E.shots.size, E.marks.size], [0, 0], 'stale: nothing was written (not even the parent)');
  const row = await drafts.get('ra', 'blocking-draft:s1');
  eq([row.status, row.error && row.error.kind], ['failed', 'stale'], 'stale: the child is marked failed (Resume drafts it again)');
}
{
  const E = acceptEnv();
  const drafts = D.openDrafts('pL', { backend: D.memoryBackend() });
  await seedAccept(drafts, false);
  await drafts.update('ra', 'shot-draft', { rev: 1 });
  const a = await R.acceptDraft('pL', 'ra', 'blocking-draft:s1', undefined, { drafts, ...E });
  ok(a && a.undo, 'stale: a draft stored before parentRev existed accepts as before');
}

/* ================= the real tasks over a faked model ================= */
const { installFakeFetch } = await import('./fake-ai.mjs');
const AI = await import('../src/lib/ai.js');
const Scenes = await import('../src/lib/scenes.js');
const Shots = await import('../src/lib/shots.js');
const H = await import('../src/lib/ai-headless-ctx.js');
const Stamp = await import('../src/lib/ai-stamp.js');

let n = 0;
const E = (type, text, extra) => ({ id: 'e' + (++n), type, text, ...(extra || {}) });
mem.set('fms_script_v1', JSON.stringify({ elements: [
  E('scene', 'INT. ANBU HOUSE - NIGHT', { sceneNumber: '1' }), E('action', 'Anbu counts coins on the floor.'),
  E('scene', 'EXT. BUS STAND - DAY', { sceneNumber: '2' }), E('action', 'A crowd waits.')
] }));
Scenes.saveScenes([
  Scenes.blankScene({ id: 'r1', number: '1', intExt: 'INT', location: 'ANBU HOUSE', dayNight: 'NIGHT' }),
  Scenes.blankScene({ id: 'r2', number: '2', intExt: 'EXT', location: 'BUS STAND', dayNight: 'DAY' })
]);
Shots.addShot('r2', { size: 'WS', description: 'A real shot, typed.' });
AI.setProvider('anthropic');
AI.setKey('sk-ant-TESTTESTTESTTESTTEST');
const sent = [];
installFakeFetch(async (req) => {
  const u = req.user;
  sent.push(u);
  if (/into a shot division/.test(u)) {
    const ids = [...u.matchAll(/sceneId: (\S+)/g)].map((m) => m[1]);
    return { scenes: ids.map((id) => ({ sceneId: id, shots: [
      { size: 'WS', angle: 'eye level', movement: 'static', lens: '24mm', rig: '', setup: 'Setup 1', description: 'The room.' },
      { size: 'CU', angle: 'eye level', movement: 'static', lens: '85mm', rig: '', setup: 'Setup 2', description: 'The coins.' }
    ] })) };
  }
  if (/Block the following scene/.test(u)) {
    const ids = [...new Set([...u.matchAll(/id (draft:\d+|[\w-]+) —/g)].map((m) => m[1]))];
    const cam = (label, x) => ({ kind: 'camera', label, x, y: 60, rot: 0, hasMove: false, toX: 0, toY: 0, path: [], curve: false, charId: '' });
    return { floor: { name: 'Room', note: '', widthM: 5, set: [{ kind: 'table', label: 'Table', x: 50, y: 40, w: 10, h: 6, rot: 0 }], axis: { on: false, x1: 0, y1: 0, x2: 0, y2: 0 } },
      actors: [], shots: ids.map((id, i) => ({ shotId: id, number: String(i + 1), note: 'n', marks: [cam('Cam ' + i, 20 + i * 10)] })) };
  }
  return {};
});
const T = await import('../src/lib/ai-tasks.js');
const tasks = await T.loadTasks();
await H.headlessReady();

const realProject = await R.projectState({ ticks: ['shot-draft', 'blocking-draft'] });
eq(realProject.scenes.map((s) => [s.id, s.shots]), [['r1', 0], ['r2', 1]], 'state: shots counted per scene from shots.js');
eq(realProject.scriptScenes, 2, 'state: script scene headings counted');

const store = D.openDrafts('pR', { backend: D.memoryBackend() });
const before = JSON.stringify([...mem.entries()].sort());
const { runId, done } = await R.startRun({ projectId: 'pR', ticks: ['shot-draft', 'blocking-draft'], drafts: store, tasks, unlocked: () => true, retryDelayMs: 0 });
await done;
eq(JSON.stringify([...mem.entries()].sort()) === before, true, 'real: a whole run writes NOTHING to storage');
const rows = await store.getRun(runId);
eq(rows.map((r) => [r.key, r.status]), [['shot-draft', 'ready'], ['blocking-draft:r1', 'ready'], ['blocking-draft:r2', 'ready']], 'real: shot-draft and both blockings ready');
const sd = rows.find((r) => r.key === 'shot-draft');
eq(sd.ctx.sceneIds, ['r1'], 'real: only the scene with no shots was divided');
ok(sent.some((u) => /id draft:0 —/.test(u) && /id draft:1 —/.test(u)), 'real: the blocking prompt offered the drafted shots as draft:<n>');
const blk = rows.find((r) => r.key === 'blocking-draft:r1');
ok(blk.result.items.some((it) => it.shotId === 'draft:0') && blk.memo && blk.memo.draft.shots.some((s) => s.shotId === 'draft:1'), 'real: the blocking draft names the drafted shots, memo kept');

/* Accept the blocking: shots first, ids mapped, stamped, one undo */
const shotsBefore = Shots.listShots().length;
const acc = await R.acceptDraft('pR', runId, 'blocking-draft:r1', undefined, { drafts: store, tasks, unlocked: () => true });
const shots = Shots.listShots();
const made = shots.filter((s) => s.sceneId === 'r1');
eq([shots.length - shotsBefore, made.map((s) => s.number)], [2, ['1', '2']], 'accept: the parent shots were accepted first');
ok(made.every((s) => s.ai && s.ai.task === 'shot-draft' && s.ai.run === sd.aiRun), 'accept: the shots carry the shot-draft stamp (its draft’s run id)');
const blocks = Shots.listBlocks().filter((b) => b.sceneId === 'r1');
const diagrams = blocks.filter((b) => b.shotId);
eq(diagrams.map((b) => b.shotId).sort(), made.map((s) => s.id).sort(), 'accept: each diagram points at a REAL shot id, none at draft:<n>');
ok(blocks.every((b) => Stamp.readStamp(b).created && Stamp.readStamp(b).created.task === 'blocking-draft'), 'accept: the blocks are stamped by blocking-draft');
ok(made.every((s) => s.cam), 'accept: the drafted shots are linked to their cameras');
eq(acc.wrote.map((w) => w.key), ['shot-draft', 'blocking-draft:r1'], 'accept: wrote lists parent then child');
eq(Object.keys(acc.wrote[0].made).sort(), ['draft:0', 'draft:1'], 'accept: the id map is reported');
eq((await store.get(runId, 'shot-draft')).status, 'accepted', 'accept: parent draft marked accepted');
eq((await store.get(runId, 'blocking-draft:r1')).status, 'accepted', 'accept: child draft marked accepted');
await acc.undo();
eq(JSON.stringify([...mem.entries()].sort()) === before, true, 'undo: one combined undo puts storage back exactly');
eq([(await store.get(runId, 'shot-draft')).status, (await store.get(runId, 'blocking-draft:r1')).status], ['ready', 'ready'], 'undo: both drafts are ready again');

/* Accept the other blocking alone: real shots, no parent accepted */
const acc2 = await R.acceptDraft('pR', runId, 'blocking-draft:r2', undefined, { drafts: store, tasks, unlocked: () => true });
eq(acc2.wrote.map((w) => w.key), ['blocking-draft:r2'], 'accept: a draft with no parent accepts alone');
eq(Shots.listShots().filter((s) => s.sceneId === 'r1').length, 0, 'accept: the drafted shots of another scene were not written');
await acc2.undo();
eq(JSON.stringify([...mem.entries()].sort()) === before, true, 'undo: the lone accept undoes exactly');

/* A later edit survives the combined undo (the tasks' own undo guards) */
const acc3 = await R.acceptDraft('pR', runId, 'shot-draft', [], { drafts: store, tasks, unlocked: () => true }).catch((e) => e);
ok(acc3 && (acc3.undo || acc3.message), 'accept: an empty selection is the task’s own answer (no write or a refusal)');
if (acc3 && acc3.undo) await acc3.undo();
const acc4 = await R.acceptDraft('pR', runId, 'blocking-draft:r1', undefined, { drafts: store, tasks, unlocked: () => true });
const someBlock = Shots.listBlocks().find((b) => b.sceneId === 'r1' && b.shotId);
Shots.replaceBlock({ ...someBlock, note: 'Edited by me after Accept.' });
await acc4.undo();
ok(Shots.listBlocks().some((b) => b.note === 'Edited by me after Accept.'), 'undo: a diagram edited after Accept is kept');
ok((await R.acceptDraft('pR', runId, 'nope', undefined, { drafts: store, tasks, unlocked: () => true }).catch((e) => e)) instanceof Error, 'accept: a missing draft refuses');

/* Two Ready shot divisions of the same scene (a second run started before
   the first was accepted): the second Accept is refused, nothing doubles. */
{
  eq(Shots.listShots().filter((s) => s.sceneId === 'r1').length, 0, 'double: r1 starts with no shots');
  const st = D.openDrafts('pD', { backend: D.memoryBackend() });
  const a = await R.startRun({ projectId: 'pD', ticks: ['shot-draft'], drafts: st, tasks, unlocked: () => true, retryDelayMs: 0 });
  await a.done;
  const b = await R.startRun({ projectId: 'pD', ticks: ['shot-draft'], drafts: st, tasks, unlocked: () => true, retryDelayMs: 0 });
  await b.done;
  const first = await R.acceptDraft('pD', b.runId, 'shot-draft', undefined, { drafts: st, tasks, unlocked: () => true });
  const after1 = Shots.listShots().filter((s) => s.sceneId === 'r1').length;
  const e = await R.acceptDraft('pD', a.runId, 'shot-draft', undefined, { drafts: st, tasks, unlocked: () => true }).catch((x) => x);
  ok(e instanceof Error && /Sc 1 already has shots/.test(e.message), 'double: the second shot division is refused, naming the scene — ' + (e && e.message));
  eq([after1, Shots.listShots().filter((s) => s.sceneId === 'r1').length], [2, 2], 'double: the refusal wrote nothing (shots not doubled)');
  eq((await st.get(a.runId, 'shot-draft')).status, 'ready', 'double: the refused draft stays ready (Reject is still offered)');
  await first.undo();
  const again = await R.acceptDraft('pD', a.runId, 'shot-draft', undefined, { drafts: st, tasks, unlocked: () => true });
  eq(Shots.listShots().filter((s) => s.sceneId === 'r1').length, 2, 'double: once the first is undone, the other run accepts');
  await again.undo();
}

/* board-frames: a frame for a shot that does not exist is never kept or uploaded */
{
  const said = [];
  const board = tasks.get('board-frames');
  const framesBefore = Shots.listFrames().length;
  const r = await board.apply([{ shotId: 'draft:0', label: '1.1', blob: new Blob(['x'], { type: 'image/png' }) }],
    { say: (m) => said.push(m) }, { items: [] }, { task: 'board-frames', model: 'm', run: 'air_x', at: new Date().toISOString() });
  eq([r, Shots.listFrames().length - framesBefore], [null, 0], 'board: an unmapped draft:<n> frame writes nothing (no frame, no Drive upload)');
  ok(said.some((m) => /left out/.test(m)), 'board: it says the frame was left out');
}

/* the headless ctx's pure halves */
{
  const ds = H.draftShotsOf({ items: [{ id: 'a#0', sceneId: 's9', draft: { size: 'WS' } }, { id: 'a#1', sceneId: 's9', draft: { size: 'CU' } }] },
    { made: { 'draft:0': 'real0' }, shots: [{ sceneId: 's9', number: '4' }] });
  eq(ds.map((s) => [s.id, s.number, s.size]), [['draft:1', '5', 'CU']], 'ctx: drafted shots skip the accepted, number after the scene’s highest');
  const PM = await import('../src/lib/ai-preprod-model.js');
  const as = H.scenesAsIf([{ id: 'x', shootDay: '' }, { id: 'y', shootDay: 3 }], { items: [{ day: 2, sceneIds: ['x'] }] }, PM.planPlacements);
  eq(as.map((s) => s.shootDay), [2, 3], 'ctx: the schedule as if the drafted order were accepted');
  const B = await import('../src/lib/budget-model.js');
  eq(B.scheduleFacts(as).days, 2, 'budget: scheduleFacts reads a given scene list (pure over it)');
}

/* QA r4 K-3: the consent line counts REQUESTS (batches), not tools */
{
  const scenes = Array.from({ length: 36 }, (_, i) => ({ id: 's' + i, number: String(i + 1), shots: 0 }));
  const project = { scriptScenes: 36, scenes, shootable: 36, places: 3, characters: 4, callSheets: [], sceneReads: 16, shotBatch: 3 };
  const { nodes } = P.planRun({ project });
  const live = nodes.filter((n) => !n.skip).length;
  const n = P.requestCount(nodes, project);
  // 16 tags + 16 notes + 12 shot batches + 36 blocking + the single ones
  ok(n > live && n === 16 + 16 + 12 + 36 + (live - 3 - 36), 'requestCount: batches, not nodes — got ' + n + ' for ' + live + ' tools');
  eq(P.requestCount(nodes.map((x) => ({ ...x, skip: 'no' })), project), 0, 'requestCount: every tool skipped → 0 (the line then says nothing is sent)');
  eq(P.requestCount([{ taskId: 'breakdown-tags' }, { taskId: 'shot-draft', ctx: { sceneIds: ['a'] } }], {}), 2, 'requestCount: unknown batch figures fall back to one request a tool');
}

console.log((fails ? '✗' : '✓') + ' ai-run-all: ' + pass + ' passed, ' + fails + ' failed');
process.exit(fails ? 1 : 0);
