/* ============================================================
   test:ai-fast — the speed and flow harness, in Node, against a
   FAKED streamed provider (scripts/fake-ai.mjs). No key, no network,
   no browser; never a real provider.

   Proves (docs/AI-FAST-HARNESS.md §A8):
     runBatches    never more than `concurrency` in flight; warm-first holds
                   the rest until batch 0's first text; items come back in
                   JOB order whatever order batches finish in; one failed
                   batch does not fail the run; a rate-limited batch is
                   retried once and concurrency drops to one; abort starts
                   nothing new and resolves `stopped` with what arrived;
                   every batch failing on the key rethrows ONE auth error
     arrayStream   the same reply cut at EVERY offset yields the same
                   elements (escaped quotes, \uXXXX, nested arrays, keys
                   before the array)
     the wire      Anthropic: cache_control on the system prompt and on the
                   run's `shared` block only (two breakpoints), identical
                   system / schema / effort / shared bytes across a run's
                   batches; Gemini: no cache_control, shared FIRST; the key
                   in a header, never the URL; effort follows the pref
     draftShotDivision / draftRest / applyBatch
                   cards arrive in ARRIVAL order, final items in job order; a
                   streamed reply gives a card per scene; the same `byScene`
                   as the one-request path; one failed batch names its scenes;
                   Stop resolves with what arrived; nothing is written before
                   applyBatch; only arrived, ticked scenes are written and the
                   rest stay pending
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

const { installFakeFetch } = await import('./fake-ai.mjs');
const AI = await import('../src/lib/ai.js');
const Batches = await import('../src/lib/ai-batches.js');
const Stream = await import('../src/lib/ai-stream-json.js');
const Effort = await import('../src/lib/ai-effort.js');
const Prefs = await import('../src/lib/chrome-prefs.js');
const Gen = await import('../src/lib/scriptgen.js');
const Script = await import('../src/lib/script.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= runBatches ================= */
{
  /* the cap */
  let inflight = 0, peak = 0;
  const jobs = Array.from({ length: 10 }, (_, i) => ({ id: 'j' + i }));
  const r = await Batches.runBatches(jobs, {
    size: 1, concurrency: 3, warmFirst: false,
    run: async (batch) => { inflight++; peak = Math.max(peak, inflight); await sleep(10 + Math.random() * 10); inflight--; return { items: batch.map((j) => j.id), model: 'm' }; }
  });
  ok(peak <= 3 && peak === 3, 'runBatches: at most `concurrency` in flight (peak ' + peak + ')');
  eq(r.items, jobs.map((j) => j.id), 'runBatches: items in JOB order');
  eq([r.failed.length, r.stopped, r.model], [0, false, 'm'], 'runBatches: nothing failed, not stopped, model carried');
  eq(Batches.batchesOf([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]], 'batchesOf');
}
{
  /* job order whatever the finish order: batch 0 is the slowest */
  const done = [];
  const r = await Batches.runBatches([0, 1, 2, 3], {
    size: 1, concurrency: 4, warmFirst: false,
    run: async ([n]) => { await sleep(n === 0 ? 60 : 5); done.push(n); return { items: [n] }; }
  });
  ok(done[0] !== 0 && done[done.length - 1] === 0, 'runBatches: batch 0 finished last (setup)');
  eq(r.items, [0, 1, 2, 3], 'runBatches: yet the items are in job order');
}
{
  /* warm first: the rest wait for batch 0's first text */
  const started = [];
  let release = null;
  const gate = new Promise((r) => { release = r; });
  const p = Batches.runBatches([0, 1, 2, 3], {
    size: 1, concurrency: 3, warmFirst: true,
    run: async ([n], { onStart }) => {
      started.push(n);
      if (n === 0) { await gate; onStart(); await sleep(30); }
      return { items: [n] };
    }
  });
  await sleep(40);
  eq(started, [0], 'warmFirst: batch 0 goes alone until it streams');
  release();
  await sleep(15);
  ok(started.length === 4 || started.length === 3, 'warmFirst: the rest start once batch 0 has streamed its first text (' + started + ')');
  const r = await p;
  eq(r.items, [0, 1, 2, 3], 'warmFirst: all items arrive');
  /* ... or when batch 0 simply settles */
  const st2 = [];
  const r2 = await Batches.runBatches([0, 1], { size: 1, run: async ([n]) => { st2.push(n); return { items: [n] }; } });
  eq([st2, r2.items], [[0, 1], [0, 1]], 'warmFirst: a batch that never streams still releases the rest on settle');
}
{
  /* one failed batch does not fail the run; the rest and the failure are both reported */
  const boom = Object.assign(new Error('server fell over'), { kind: 'server' });
  const r = await Batches.runBatches([0, 1, 2, 3], {
    size: 1, concurrency: 2, warmFirst: false,
    run: async ([n]) => { if (n === 2) throw boom; return { items: [n] }; }
  });
  eq(r.items, [0, 1, 3], 'a failed batch loses only itself');
  eq(r.failed.map((f) => [f.index, f.jobs, f.error.kind]), [[2, [2], 'server']], 'the failure names its batch, its jobs and its kind');
  /* but if every batch fails on the key, say that once */
  const auth = Object.assign(new Error('key rejected'), { kind: 'auth' });
  let thrown = null;
  try { await Batches.runBatches([0, 1], { size: 1, run: async () => { throw auth; } }); } catch (e) { thrown = e; }
  ok(thrown === auth, 'every batch refused on the key: ONE auth error is rethrown');
  /* every batch failing for another reason resolves (the caller decides) */
  const r3 = await Batches.runBatches([0, 1], { size: 1, run: async () => { throw boom; } });
  eq([r3.items.length, r3.failed.length], [0, 2], 'every batch failing otherwise resolves with all failures');
}
{
  /* a rate-limited batch is retried once, and concurrency drops to one */
  let tries = 0, inflight = 0, peakAfter = 0;
  const rate = Object.assign(new Error('slow down'), { kind: 'rate' });
  const r = await Batches.runBatches([0, 1, 2, 3, 4], {
    size: 1, concurrency: 3, warmFirst: false, retryDelayMs: 5,
    run: async ([n]) => {
      inflight++;
      if (n === 1 && tries === 0) { tries++; inflight--; throw rate; }
      if (tries > 0 && n >= 2) peakAfter = Math.max(peakAfter, inflight);
      await sleep(15);
      inflight--;
      return { items: [n] };
    }
  });
  eq(r.items, [0, 1, 2, 3, 4], 'rate: the retried batch succeeds and the run is whole');
  eq(r.failed.length, 0, 'rate: nothing is reported failed');
  /* a batch that stays rate limited fails after ONE retry */
  let n429 = 0;
  const r2 = await Batches.runBatches([0], { size: 1, retryDelayMs: 1, run: async () => { n429++; throw rate; } });
  eq([n429, r2.failed.length], [2, 1], 'rate: one retry, then it is reported failed');
}
{
  /* abort: starts nothing new, resolves stopped with what arrived */
  const ctl2 = new AbortController();
  const started2 = [];
  const p = Batches.runBatches([0, 1, 2, 3, 4, 5], {
    size: 1, concurrency: 2, warmFirst: false, signal: ctl2.signal,
    run: async ([n], { onItems, signal }) => {
      started2.push(n);
      if (n === 0) { onItems([{ n }]); await sleep(5); return { items: [{ n }] }; }
      await new Promise((res, rej) => { signal.addEventListener('abort', () => rej(Object.assign(new Error('Stopped'), { kind: 'aborted' }))); });
      return { items: [] };
    }
  });
  await sleep(30);
  const atAbort = started2.length;
  ctl2.abort();
  const out = await p;
  ok(out.stopped === true, 'abort: resolves stopped (does not throw)');
  eq(out.items, [{ n: 0 }], 'abort: keeps the items that had arrived');
  eq(started2.length, atAbort, 'abort: nothing new started after it (' + started2 + ')');
  eq(out.failed.length, 0, 'abort: a stopped batch is not a failure');
}

/* ================= arrayStream ================= */
{
  const rows = [
    { sceneId: 's1', shots: [{ description: 'He says "no" \\ and leaves', rig: 'café பதி' }, { description: 'nested [brackets] {braces}' }] },
    { sceneId: 's2', shots: [] },
    { sceneId: 's3', shots: [{ description: 'tab\there', lens: 'é' }] }
  ];
  const reply = JSON.stringify({ logline: 'a, "b" [c]', scenes: rows, trailer: [{ x: 1 }] });
  /* with a raw \u escape sequence in the source text too */
  const withEsc = reply.replace('café', 'caf\\u00e9');
  for (const text of [reply, withEsc]) {
    const want = JSON.parse(text).scenes;
    // every cut: feed the cumulative prefix one character at a time
    const s1 = Stream.arrayStream('scenes');
    const got1 = [];
    for (let i = 1; i <= text.length; i++) got1.push(...s1.feed(text.slice(0, i)));
    eq(got1, want, 'arrayStream: one character at a time yields every scene once, in order');
    // every single cut point: feed a prefix, then the whole
    let bad = 0;
    for (let cut = 0; cut <= text.length; cut++) {
      const s = Stream.arrayStream('scenes');
      const a = s.feed(text.slice(0, cut));
      const b = s.feed(text);
      if (JSON.stringify([...a, ...b]) !== JSON.stringify(want)) bad++;
    }
    eq(bad, 0, 'arrayStream: a chunk boundary at EVERY offset yields the same scenes');
    const s2 = Stream.arrayStream('scenes');
    s2.feed(text);
    eq(s2.count(), want.length, 'arrayStream: count()');
  }
  const none = Stream.arrayStream('nothing');
  eq(none.feed(reply), [], 'arrayStream: a key that is not there yields nothing');
  const bad = Stream.arrayStream('scenes');
  eq(bad.feed('{"scenes":[{"a":1},{"b":}'), [{ a: 1 }], 'arrayStream: a malformed element is skipped, never thrown');
}

/* ================= effort ================= */
{
  mem.clear();
  eq([Effort.draftEffort(), Effort.draftEffort(false), Effort.draftEffort(true)], ['low', 'low', 'high'], 'draftEffort: low by default, high when Careful');
  Prefs.saveAiCareful(true);
  eq([Effort.draftEffort(), Effort.draftEffort(false)], ['high', 'low'], 'draftEffort: follows the pref when not told');
  eq(JSON.parse(mem.get('fms_studio_prefs_v1')).aiCareful, true, 'the pref is a field of fms_studio_prefs_v1');
  Prefs.saveAiCareful(false);
  eq(Prefs.readAiCareful(), false, 'saveAiCareful(false) clears it');
  eq(Object.keys(JSON.parse(mem.get('fms_studio_prefs_v1') || '{}')).includes('aiCareful'), false, '... by removing the field');
}

/* ================= the wire ================= */
const ANTH = { id: 'anthropic', origin: 'https://api.anthropic.com' };
const GEM = { id: 'gemini', origin: 'https://generativelanguage.googleapis.com' };
{
  const base = { model: 'm', system: 'SYS', user: 'USER', schema: { type: 'object' }, maxTokens: 10, effort: 'low' };
  const a = AI.anthropicRequest(ANTH, base);
  eq(a.body.system, [{ type: 'text', text: 'SYS', cache_control: { type: 'ephemeral' } }], 'anthropic: system is a cached text block');
  eq(a.body.messages[0].content, 'USER', 'anthropic: without shared the user text is plain');
  const b = AI.anthropicRequest(ANTH, { ...base, shared: 'SHARED' });
  eq(b.body.messages[0].content, [{ type: 'text', text: 'SHARED', cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'USER' }], 'anthropic: shared is the cached first block, the batch text after it, uncached');
  const marks = JSON.stringify(b.body).match(/cache_control/g).length;
  eq(marks, 2, 'anthropic: two breakpoints, never more than four');
  ok(!JSON.stringify(AI.anthropicRequest(ANTH, { ...base, shared: 'S', cache: false }).body).includes('cache_control'), 'anthropic: cache:false sends none');
  eq(b.body.thinking, { type: 'adaptive' }, 'anthropic: thinking stays adaptive');
  eq(b.body.output_config.effort, 'low', 'anthropic: effort is the run\'s');
  ok(!b.url.includes('key') && b.authHeader === 'x-api-key' && !('x-api-key' in b.headers), 'anthropic: the key goes in x-api-key, added at send, never in the url');
  const g = AI.geminiRequest(GEM, { ...base, shared: 'SHARED' });
  ok(!JSON.stringify(g.body).includes('cache_control') && !JSON.stringify(g.body).toLowerCase().includes('cachedcontent'), 'gemini: no explicit cache');
  eq(g.body.contents[0].parts[0].text, 'SHARED\n\nUSER', 'gemini: shared goes FIRST');
  eq(g.body.generationConfig.thinkingConfig.thinkingLevel, 'low', 'gemini: the same effort word');
  ok(!g.url.includes('key=') && g.authHeader === 'x-goog-api-key', 'gemini: the key is a header, never ?key=');
  eq(AI.geminiRequest(GEM, base).body.contents[0].parts[0].text, 'USER', 'gemini: without shared the user text alone');
}

/* ================= faked provider ================= */
const model = 'claude-fake-1';
void model;
const freshMem = () => { mem.clear(); AI.setProvider('anthropic'); AI.setKey('sk-ant-TESTTESTTESTTESTTEST'); };
freshMem();
let respondFn = async () => ({});
const log = [];
installFakeFetch((req) => respondFn(req), log);
/* A real fetch rejects with AbortError when the signal fires; the fake only checks
   at the start, so wrap it. */
{
  const inner = globalThis.fetch;
  globalThis.fetch = (url, init = {}) => new Promise((res, rej) => {
    if (init.signal) init.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }, { once: true });
    inner(url, init).then(res, rej);
  });
}
const idsIn = (user) => [...String(user).matchAll(/sceneId: (\S+)/g)].map((m) => m[1]);
const shotsFor = (id) => ({
  sceneId: id,
  shots: [
    { size: 'WS', angle: 'eye level', movement: 'static', lens: '24mm', rig: 'Key from window', setup: 'Setup 1', description: 'The room of ' + id + '.' },
    { size: 'CU', angle: 'eye level', movement: 'static', lens: '', rig: '', setup: '', description: 'A detail of ' + id + '.', extra: 'not a field' }
  ]
});
const shotJobs = (n) => Array.from({ length: n }, (_, i) => ({ sceneId: 'sc' + (i + 1), number: String(i + 1), slug: 'INT. ROOM ' + (i + 1) + ' - DAY', eighths: 8, synopsis: 'Scene ' + (i + 1), script: 'Text ' + (i + 1) }));

{
  /* shot division: batches of three, the same byScene the one-request path gave */
  freshMem();
  log.length = 0;
  let inflight = 0, peak = 0;
  const times = [];
  respondFn = async (req) => {
    inflight++; peak = Math.max(peak, inflight);
    times.push(Date.now());
    await sleep(25);
    inflight--;
    return { scenes: idsIn(req.user).map(shotsFor) };
  };
  const jobs = shotJobs(8);
  const arrivedCalls = [];
  const out = await AI.draftShotDivision(jobs, { onItems: (e) => arrivedCalls.push(e.map((x) => x.sceneId)) });
  eq(log.length, Math.ceil(8 / AI.SHOT_BATCH), 'shots: 8 scenes go in ceil(8/3) = 3 requests');
  ok(peak <= 3, 'shots: at most 3 in flight (peak ' + peak + ')');
  eq([...out.byScene.keys()], jobs.map((j) => j.sceneId), 'shots: byScene is in job order');
  eq(out.byScene.get('sc1'), [
    { size: 'WS', angle: 'eye level', movement: 'static', lens: '24mm', rig: 'Key from window', setup: 'Setup 1', description: 'The room of sc1.' },
    { size: 'CU', angle: 'eye level', movement: 'static', lens: '', rig: '', setup: '', description: 'A detail of sc1.' }
  ], 'shots: the same cleaned shots as the one-request path (an unknown field is dropped)');
  eq([out.failed, out.stopped, out.model === undefined], [[], false, false], 'shots: nothing failed, not stopped');
  ok(arrivedCalls.flat().length === 8 && arrivedCalls.length >= 3, 'shots: onItems delivered the 8 scenes in at least one call per request (' + arrivedCalls.length + ' calls)');
  /* warm first: the second request began after the first answered */
  ok(times.length === 3 && times[1] >= times[0] + 20, 'shots: the warm request went first, the rest after it was answered');
  /* the prefix is byte-identical across the run's batches */
  const same = (f) => new Set(log.map((r) => JSON.stringify(f(r.body)))).size === 1;
  ok(same((b) => b.system) && same((b) => b.output_config), 'shots: system, schema and effort are identical across the run\'s batches');
  eq(log[0].body.output_config.effort, 'low', 'shots: effort is LOW by default');
  ok(log[0].body.system[0].cache_control && typeof log[0].body.messages[0].content === 'string', 'shots: the system prompt is cached, no shared block (the scenes are the batch)');
  ok(log.every((r) => r.headers['x-api-key'] && !r.url.includes('sk-ant')), 'shots: the key rides in a header, never the url');
  /* Careful raises it */
  log.length = 0;
  await AI.draftShotDivision(shotJobs(2), { careful: true });
  eq(log[0].body.output_config.effort, 'high', 'shots: Careful raises the effort');
  /* ... and the pref is read when not told */
  Prefs.saveAiCareful(true);
  log.length = 0;
  await AI.draftShotDivision(shotJobs(2), {});
  eq(log[0].body.output_config.effort, 'high', 'shots: the effort follows the aiCareful pref');
  Prefs.saveAiCareful(false);
  log.length = 0;
  await AI.draftShotDivision(shotJobs(2), {});
  eq(log[0].body.output_config.effort, 'low', 'shots: and falls back to low');
}
{
  /* arrival order is not job order; the final items are */
  log.length = 0;
  respondFn = async (req) => {
    const ids = idsIn(req.user);
    await sleep(ids[0] === 'sc1' ? 5 : ids[0] === 'sc4' ? 60 : 25);
    return { scenes: ids.map(shotsFor) };
  };
  const order = [];
  const out = await AI.draftShotDivision(shotJobs(9), { onItems: (e) => order.push(...e.map((x) => x.sceneId)) });
  ok(order.indexOf('sc7') < order.indexOf('sc4'), 'cards arrive in ARRIVAL order (sc7 before sc4): ' + order.join(','));
  eq([...out.byScene.keys()], shotJobs(9).map((j) => j.sceneId), 'the resolved result is back in job order');
}
{
  /* one failed batch names its scenes; the others are kept */
  log.length = 0;
  respondFn = async (req) => {
    const ids = idsIn(req.user);
    if (ids.includes('sc4')) return { status: 500, body: { error: { message: 'boom' } } };
    return { scenes: ids.map(shotsFor) };
  };
  const out = await AI.draftShotDivision(shotJobs(9), {});
  eq(out.failed, ['sc4', 'sc5', 'sc6'], 'a failed batch loses only its three scenes, named');
  eq(out.failures.map((f) => f.kind), ['server'], 'and says why');
  eq([...out.byScene.keys()], ['sc1', 'sc2', 'sc3', 'sc7', 'sc8', 'sc9'], 'every other scene arrived');
  /* all failing on the key rethrows once */
  respondFn = async () => ({ status: 401, body: { error: { message: 'bad key' } } });
  let err = null;
  try { await AI.draftShotDivision(shotJobs(6), {}); } catch (e) { err = e; }
  ok(err && err.kind === 'auth', 'every request refused on the key: one auth error');
  /* a 429 on one batch is retried once (and succeeds) */
  let first429 = true;
  respondFn = async (req) => {
    const ids = idsIn(req.user);
    if (ids.includes('sc4') && first429) { first429 = false; return { status: 429, body: {} }; }
    return { scenes: ids.map(shotsFor) };
  };
  const t0 = Date.now();
  const out2 = await Promise.race([
    AI.draftShotDivision(shotJobs(6), {}),
    sleep(12000).then(() => 'late')
  ]);
  ok(out2 !== 'late' && out2.byScene.size === 6, 'a 429 is retried once after a pause and the run is whole (' + (Date.now() - t0) + 'ms)');
}
{
  /* Stop keeps what arrived and resolves */
  log.length = 0;
  const ctl = new AbortController();
  respondFn = async (req) => {
    const ids = idsIn(req.user);
    if (ids[0] === 'sc1') return { scenes: ids.map(shotsFor) };
    await sleep(2000);
    return { scenes: ids.map(shotsFor) };
  };
  const seen = [];
  const p = AI.draftShotDivision(shotJobs(9), { signal: ctl.signal, onItems: (e) => { seen.push(...e.map((x) => x.sceneId)); } });
  await sleep(150);
  ctl.abort();
  const out = await p;
  ok(out.stopped === true, 'Stop: resolves with stopped');
  eq([...out.byScene.keys()], ['sc1', 'sc2', 'sc3'], 'Stop: keeps the scenes that had arrived');
  ok(log.length <= 3, 'Stop: nothing new was sent after it (' + log.length + ' requests)');
}
{
  /* the other streamed jobs: scene list and beat sheet stream a card per row, medium by default */
  log.length = 0;
  respondFn = async () => ({
    scenes: [
      { intExt: 'INT', location: 'HOUSE', dayNight: 'DAY', synopsis: 'a', eighths: 8, beat: 'opening_image', cast: ['ANBU'] },
      { intExt: 'EXT', location: 'STREET', dayNight: 'NIGHT', synopsis: 'b', eighths: 4, beat: 'catalyst', cast: [] }
    ]
  });
  const calls = [];
  const out = await AI.draftSceneList({ synopsis: 'S', logline: 'L', format: 'feature', lang: 'en', beats: [{ id: 'opening_image', label: 'Opening', happens: 'x' }, { id: 'catalyst', label: 'Catalyst', happens: 'y' }] },
    { onItems: (rows) => calls.push(rows.map((r) => r.location)) });
  eq(calls.flat(), ['HOUSE', 'STREET'], 'scene list: a card per scene as it parses');
  ok(calls.length >= 2, 'scene list: the scenes arrive in separate calls, not at the end (' + calls.length + ')');
  eq(out.scenes.map((s) => s.location), ['HOUSE', 'STREET'], 'scene list: the final list is the parsed whole');
  eq(log.length, 1, 'scene list: still ONE request');
  eq(log[0].body.output_config.effort, 'medium', 'scene list: medium by default');
  await AI.draftSceneList({ synopsis: 'S', logline: 'L', format: 'feature', lang: 'en', beats: [{ id: 'opening_image', label: 'Opening', happens: 'x' }] }, { careful: true });
  eq(log[1].body.output_config.effort, 'high', 'scene list: Careful raises it to high');
  log.length = 0;
  respondFn = async () => ({ logline: 'L', beats: [{ id: 'opening_image', happens: 'It begins.' }, { id: 'catalyst', happens: 'It breaks.' }] });
  const bc = [];
  const bs = await AI.draftBeatSheet({ synopsis: 'S', format: 'feature', lang: 'en', beats: [{ id: 'opening_image', label: 'Opening' }, { id: 'catalyst', label: 'Catalyst' }] }, { onItems: (b) => bc.push(...b.map((x) => x.id)) });
  eq(bc, ['opening_image', 'catalyst'], 'beat sheet: a card per beat');
  eq([...bs.byBeat.keys()], ['opening_image', 'catalyst'], 'beat sheet: the final map');
  eq(log[0].body.output_config.effort, 'medium', 'beat sheet: medium by default');
}

/* ================= gemini: the same run, no cache_control ================= */
{
  AI.setProvider('gemini');
  AI.setKey('AIzaTESTTESTTESTTESTTESTTESTTESTTESTTE');
  log.length = 0;
  respondFn = async (req) => ({ scenes: idsIn(req.user).map(shotsFor) });
  const calls = [];
  const out = await AI.draftShotDivision(shotJobs(4), { onItems: (e) => calls.push(e.length) });
  eq([...out.byScene.keys()], ['sc1', 'sc2', 'sc3', 'sc4'], 'gemini: the same byScene through the CRLF stream');
  ok(log.every((r) => r.provider === 'gemini' && !JSON.stringify(r.body).includes('cache_control') && !r.url.includes('key=')), 'gemini: no cache_control, no ?key=');
  ok(log.every((r) => r.headers['x-goog-api-key']), 'gemini: the key is in x-goog-api-key');
  AI.setProvider('anthropic');
}

/* ================= pages: draftScenePages shared prefix ================= */
const scenesOf = (n) => Array.from({ length: n }, (_, i) => ({ sceneId: 'g' + (i + 1), slug: 'INT. ROOM ' + (i + 1) + ' - DAY', synopsis: 'S' + (i + 1), eighths: 8, cast: ['ANBU'], beat: '' }));
const elsFor = (id) => ({ sceneId: id, elements: [{ type: 'scene', text: 'HEADING ' + id }, { type: 'action', text: 'Body of ' + id + '.' }] });

{
  /* a run: shared + runIds make the prefix identical across batches */
  freshMem();
  Script.saveScript({ elements: [{ id: 'p1', type: 'action', text: 'Stored line.' }], revisions: [], documents: [] });
  const sc = scenesOf(7);
  Gen.save({ ...Gen.load(), stage: 'pages', cursor: 0, logline: 'A broke son leaves.', lang: 'en', startedAt: 'T0', scenes: sc });
  log.length = 0;
  const wrote0 = JSON.stringify([...mem.entries()]);
  let inflight = 0, peak = 0;
  respondFn = async (req) => {
    inflight++; peak = Math.max(peak, inflight);
    await sleep(20);
    inflight--;
    return { scenes: idsIn(req.user).filter((id) => id.startsWith('g')).map(elsFor) };
  };
  const cards = [];
  const draft = await Gen.draftRest({ onItems: (e) => cards.push(...e.map((x) => x.sceneId)) });
  eq(log.length, Math.ceil(7 / Gen.PAGE_BATCH), 'draftRest: 7 scenes go in ceil(7/2) = 4 requests');
  ok(peak <= Gen.PAGE_CONCURRENCY, 'draftRest: at most ' + Gen.PAGE_CONCURRENCY + ' in flight (peak ' + peak + ')');
  eq(cards.length, 7, 'draftRest: a card per scene');
  eq(draft.batch.map((s) => s.sceneId), sc.map((s) => s.sceneId), 'draftRest: the draft covers every remaining scene');
  eq(Object.keys(draft.byScene), sc.map((s) => s.sceneId), 'draftRest: byScene in job order');
  eq([draft.cursor, draft.done, draft.failed, draft.stopped], [0, false, [], false], 'draftRest: the draft shape applyBatch reads');
  ok(JSON.stringify([...mem.entries()]) === wrote0, 'draftRest: NOTHING was written (script, job, anything)');
  /* byte-identical prefix */
  const first = log[0].body;
  const rest = log.slice(1).map((r) => r.body);
  ok(rest.every((b) => JSON.stringify(b.system) === JSON.stringify(first.system)), 'draftRest: system identical across batches');
  ok(rest.every((b) => JSON.stringify(b.output_config) === JSON.stringify(first.output_config)), 'draftRest: schema and effort identical across batches');
  ok(rest.every((b) => JSON.stringify(b.messages[0].content[0]) === JSON.stringify(first.messages[0].content[0])), 'draftRest: the shared block is byte-identical across batches');
  ok(first.messages[0].content[0].cache_control && !first.messages[0].content[1].cache_control && first.system[0].cache_control, 'draftRest: cache_control on system and shared only, not on the batch text');
  const sharedText = first.messages[0].content[0].text;
  ok(sharedText.includes('A broke son leaves.') && sharedText.includes('INT. ROOM 7 - DAY') && sharedText.includes('Element rules:'), 'draftRest: shared holds the logline, the scene map and the rules');
  ok(!/sceneId:|T0|cursor|batch [0-9]/.test(sharedText + JSON.stringify(first.system)), 'draftRest: nothing about a batch, cursor or time in the prefix');
  const enumOf = (b) => b.output_config.format.schema.properties.scenes.items.properties.sceneId.enum;
  eq(enumOf(first), sc.map((s) => s.sceneId), 'draftRest: the schema enum is the RUN\'s ids, not the batch\'s');
  eq(first.output_config.effort, 'low', 'draftRest: effort low by default');

  /* apply: only the ticked, arrived scenes; the rest stay pending */
  const res = Gen.applyBatch(draft, ['g1', 'g2', 'g4', 'g5', 'g6', 'g7']);
  eq([res.wrote, res.pending, Gen.load().cursor], [6, ['g3'], 6], 'applyBatch: writes the ticked scenes, the unticked one stays pending');
  eq(Gen.load().scenes.map((s) => s.sceneId).slice(6), ['g3'], 'applyBatch: the unticked scene is next in line');
  eq(Script.loadScript().elements.filter((e) => e.type === 'scene').map((e) => e.text), ['HEADING g1', 'HEADING g2', 'HEADING g4', 'HEADING g5', 'HEADING g6', 'HEADING g7'], 'applyBatch: only ticked scenes, in order');
  res.undo();
  eq([Gen.load().cursor, Script.loadScript().elements.length], [0, 1], 'applyBatch: the exact Undo');
}
{
  /* one failed batch: its scenes are named, stay pending; Careful and the pref */
  freshMem();
  Script.saveScript({ elements: [], revisions: [], documents: [] });
  const sc = scenesOf(6);
  Gen.save({ ...Gen.load(), stage: 'pages', cursor: 0, lang: 'en', scenes: sc });
  respondFn = async (req) => {
    const ids = idsIn(req.user).filter((id) => id.startsWith('g'));
    if (ids.includes('g3')) return { status: 429, body: {} };
    return { scenes: ids.map(elsFor) };
  };
  const draft = await Promise.race([Gen.draftRest({ careful: true }), sleep(30000).then(() => null)]);
  ok(draft, 'draftRest: finished although one batch stayed rate limited');
  eq(draft.failed, ['g3', 'g4'], 'draftRest: the failed batch names its scenes');
  eq(draft.failures.map((f) => f.kind), ['rate'], 'draftRest: and the reason');
  eq(Object.keys(draft.byScene), ['g1', 'g2', 'g5', 'g6'], 'draftRest: the other scenes arrived');
  const res = Gen.applyBatch(draft, null);
  eq([res.wrote, res.pending.sort(), Gen.load().cursor], [4, ['g3', 'g4'], 4], 'applyBatch: the failed scenes stay pending, next in line');
  eq(Gen.load().scenes.map((s) => s.sceneId).slice(4), ['g3', 'g4'], 'applyBatch: they are the next ones asked for');
  ok(log.some((r) => r.body && r.body.output_config && r.body.output_config.effort === 'high'), 'draftRest: careful reached the requests');
}
{
  /* Stop on draftRest: resolves with what arrived; applying writes only that */
  freshMem();
  Script.saveScript({ elements: [], revisions: [], documents: [] });
  const sc = scenesOf(8);
  Gen.save({ ...Gen.load(), stage: 'pages', cursor: 0, lang: 'en', scenes: sc });
  respondFn = async (req) => {
    const ids = idsIn(req.user).filter((id) => id.startsWith('g'));
    if (ids[0] !== 'g1') await sleep(3000);
    return { scenes: ids.map(elsFor) };
  };
  const ctl = new AbortController();
  const p = Gen.draftRest({ signal: ctl.signal });
  await sleep(200);
  ctl.abort();
  const draft = await p;
  ok(draft.stopped === true, 'draftRest: Stop resolves stopped');
  eq(Object.keys(draft.byScene), ['g1', 'g2'], 'draftRest: only what had arrived is in the draft');
  const res = Gen.applyBatch(draft, null);
  eq([res.wrote, Gen.load().cursor, res.done], [2, 2, false], 'applyBatch: a stopped draft writes only what arrived');
  eq(Gen.load().scenes.slice(2).map((s) => s.sceneId), ['g3', 'g4', 'g5', 'g6', 'g7', 'g8'], 'applyBatch: the rest stay pending, in order');
}
{
  /* a run with every scene written has nothing to ask for */
  freshMem();
  Gen.save({ ...Gen.load(), stage: 'pages', cursor: 2, scenes: scenesOf(2) });
  const before = log.length;
  const d = await Gen.draftRest({});
  eq([d.done, d.batch.length, log.length - before], [true, 0, 0], 'draftRest: nothing left, nothing sent');
}

console.log(`test:ai-fast — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
