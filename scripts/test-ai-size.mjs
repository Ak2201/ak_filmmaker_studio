/* ============================================================
   test:ai-size — are the AI requests PRECISE? In Node, against a FAKED
   streamed provider (scripts/fake-ai.mjs). No key, no network, no
   browser; never a real provider.

   Owner, 3 Nov 2026: "Gemini takes longer than expected; make requests
   and responses precise". This holds the harness to that, per job:

     effort     what ai-effort.js TASK_EFFORT says (extraction low,
                judgement medium), the Careful pref raising it ONE step,
                and Gemini's thinkingLevel a word the model accepts
     ceiling    maxTokens under the job's budget (no 32,000 for a small
                job), and the callModel default 8,000
     bytes      the request body under a per-job budget, the run's
                `shared` block identical across batches, breakdown tags
                sending no blueprint
     batches    whole-script reads go 3 at a time in small parts
     schema     every object closed (additionalProperties false, every
                property required), enums where a value is a category,
                maxItems where a list is open-ended — and the Anthropic
                wire carries no maxItems (it 400s on them)
     lanes      every lane task names its id at its request (so the table
                decides its effort) and types no effort word
     frames     the storyboard prompt is compact and takes the frame's
                shape; frames are drawn 3 at a time

   Budgets are generous ceilings, not targets: a job that grows past one
   has grown, and the failing line says by how much.
   ============================================================ */
import { register } from 'node:module';
import { readFileSync } from 'node:fs';

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
const Effort = await import('../src/lib/ai-effort.js');
const Prefs = await import('../src/lib/chrome-prefs.js');
const Board = await import('../src/lib/board-frames.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
const under = (v, max, m) => ok(v <= max, m + ' — ' + v + ' (budget ' + max + ')');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/* ---- the fake provider --------------------------------------- */
const log = [];
let inflight = 0, peak = 0;
const idsIn = (u) => [...String(u).matchAll(/sceneId: (\S+)/g)].map((m) => m[1]);
installFakeFetch(async (req) => {
  inflight++; peak = Math.max(peak, inflight);
  await sleep(15);
  inflight--;
  const sys = req.system || '';
  if (/first assistant director and camera operator/.test(sys)) {
    return { scenes: idsIn(req.user).map((sceneId) => ({ sceneId, shots: [{ size: 'WS', angle: 'eye level', movement: 'static', lens: '', rig: '', setup: '', description: 'The room.' }] })) };
  }
  if (/one note per scene/.test(sys)) return { notes: [] };
  if (/script breakdown/.test(sys)) return { elements: [] };
  return {};
}, log);

const body = (r) => JSON.stringify(r.body);
const bytes = (r) => Buffer.byteLength(body(r));
const effortOf = (r) => (r.provider === 'anthropic' ? r.body.output_config.effort : r.body.generationConfig.thinkingConfig.thinkingLevel);
const tokensOf = (r) => (r.provider === 'anthropic' ? r.body.max_tokens : r.body.generationConfig.maxOutputTokens);
const schemaOf = (r) => (r.provider === 'anthropic' ? r.body.output_config.format.schema : r.body.generationConfig.responseJsonSchema);
const sharedOf = (r) => (r.provider === 'anthropic'
  ? (Array.isArray(r.body.messages[0].content) ? r.body.messages[0].content[0].text : '')
  : '');

/** Every object node closed and fully required; returns the faults. */
function looseNodes(node, path = '$', out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach((n, i) => looseNodes(n, path + '[' + i + ']', out)); return out; }
  if (node.type === 'object' && node.properties) {
    if (node.additionalProperties !== false) out.push(path + ': additionalProperties is not false');
    const keys = Object.keys(node.properties).sort();
    const req = [].concat(node.required || []).slice().sort();
    if (JSON.stringify(keys) !== JSON.stringify(req)) out.push(path + ': not every property is required');
  }
  for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') looseNodes(v, path + '.' + k, out);
  return out;
}
const hasKey = (node, key) => JSON.stringify(node).includes('"' + key + '"');

AI.setKey('sk-ant-TESTTESTTESTTESTTEST', 'anthropic');
AI.setKey('AIzaFAKEFAKEFAKEFAKEFAKEFAKE', 'gemini');
Prefs.saveAiCareful(false);

/* ================= the table ================= */
{
  const LOW = ['breakdown-tags', 'shot-draft', 'shoot-order', 'recce-notes', 'callsheet-notes', 'budget-estimate',
    'scene-notes', 'genre-comps', 'blocking-draft', 'character-arcs', 'script-cleanup'];
  const MEDIUM = ['coverage', 'audience-test', 'audience-quick', 'beat-critique', 'tension-notes', 'dialogue-pass', 'voice-check'];
  for (const id of LOW) eq(Effort.taskEffort(id, false), 'low', id + ': extraction runs at low effort');
  for (const id of MEDIUM) eq(Effort.taskEffort(id, false), 'medium', id + ': judgement keeps medium');
  for (const id of LOW) eq(Effort.taskEffort(id, true), 'medium', id + ': Careful raises it one step');
  for (const id of MEDIUM) eq(Effort.taskEffort(id, true), 'high', id + ': Careful raises judgement one step');
  eq(Effort.taskEffort('a-task-nobody-listed', false), 'medium', 'a task missing from the table is medium, never low by accident');
  eq(Effort.raiseEffort('high'), 'high', 'high is the top step');
  eq([Effort.draftEffort(false), Effort.draftEffort(true)], ['low', 'high'], 'the two big drafts keep their low / high pair');
  Prefs.saveAiCareful(true);
  eq(Effort.taskEffort('scene-notes'), 'medium', 'with no argument the Careful pref is read');
  Prefs.saveAiCareful(false);
  /* Gemini 3: a level the model would refuse rounds UP, never a 400. */
  eq(Effort.geminiThinkingLevel('low', 'gemini-3.8-flash'), 'low', 'gemini flash: low');
  eq(Effort.geminiThinkingLevel('medium', 'gemini-3.8-flash'), 'medium', 'gemini flash: medium');
  eq(Effort.geminiThinkingLevel('medium', 'gemini-3-pro-preview'), 'high', 'gemini 3 pro (low/high only): medium rounds up to high');
  eq(Effort.geminiThinkingLevel('medium', 'gemini-3.1-pro-preview'), 'medium', 'gemini 3.1 pro takes medium');
  eq(Effort.geminiThinkingLevel('max', 'gemini-3.8-flash'), 'high', 'an Anthropic-only word becomes high');
}

/* ================= the wire: maxItems and the default ceiling ================= */
{
  const schema = { type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: 'array', maxItems: 5, description: 'the list', items: { type: 'string' } } } };
  const a = AI.anthropicRequest({ origin: 'https://api.anthropic.com' }, { model: 'm', system: 'S', user: 'U', schema, maxTokens: 10, effort: 'low' });
  ok(!hasKey(a.body.output_config.format.schema, 'maxItems'), 'anthropic: maxItems is not sent (structured outputs refuse it)');
  ok(/at most 5 items/.test(a.body.output_config.format.schema.properties.a.description), 'anthropic: the limit rides in the description instead');
  ok(schema.properties.a.maxItems === 5, 'the caller\'s schema object is not mutated');
  const g = AI.geminiRequest({ origin: 'https://generativelanguage.googleapis.com' }, { model: 'gemini-3-pro-preview', system: 'S', user: 'U', schema, maxTokens: 10, effort: 'medium' });
  eq(g.body.generationConfig.responseJsonSchema.properties.a.maxItems, 5, 'gemini: maxItems is sent as written');
  eq(g.body.generationConfig.thinkingConfig.thinkingLevel, 'high', 'gemini: thinkingLevel goes through the safe mapping');

  AI.setProvider('anthropic');
  log.length = 0;
  try { await AI.callModelForTask({ system: 'S', user: 'U', schema: { type: 'object', additionalProperties: false, required: [], properties: {} } }); } catch (e) { /* the empty reply */ }
  eq(tokensOf(log[0]), 8000, 'callModel\'s default ceiling is 8,000, not 32,000');
  eq(effortOf(log[0]), 'medium', 'no task, no effort: medium');
  log.length = 0;
  try { await AI.callModelForTask({ system: 'S', user: 'U', task: 'recce-notes', schema: { type: 'object', additionalProperties: false, required: [], properties: {} } }); } catch (e) { /* */ }
  eq(effortOf(log[0]), 'low', 'a named task takes its effort from the table');
}

/* ================= shot division ================= */
const shotJobs = (n) => Array.from({ length: n }, (_, i) => ({
  sceneId: 'sc' + (i + 1), number: String(i + 1), slug: 'INT. ROOM ' + (i + 1) + ' - DAY', eighths: 8,
  synopsis: 'Anbu waits for news.', script: 'INT. ROOM - DAY\n  Anbu waits by the window. The phone does not ring.\n          ANBU\n     Still nothing.'
}));
for (const prov of ['anthropic', 'gemini']) {
  AI.setProvider(prov);
  log.length = 0; peak = 0;
  await AI.draftShotDivision(shotJobs(7), { careful: false });
  eq(log.length, 3, prov + ' shot-draft: 7 scenes in 3 requests');
  under(peak, 3, prov + ' shot-draft: at most 3 in flight');
  for (const r of log) {
    under(bytes(r), 7000, prov + ' shot-draft: request body bytes');
    under(tokensOf(r), 6000, prov + ' shot-draft: maxTokens per batch');
    eq(effortOf(r), 'low', prov + ' shot-draft: low effort');
    eq(looseNodes(schemaOf(r)), [], prov + ' shot-draft: schema closed');
  }
  const sch = schemaOf(log[0]);
  const shot = sch.properties.scenes.items.properties.shots.items.properties;
  ok(Array.isArray(shot.size.enum) && Array.isArray(shot.angle.enum) && Array.isArray(shot.movement.enum), prov + ' shot-draft: size, angle and movement are enums');
  ok(prov === 'anthropic' ? !hasKey(sch, 'maxItems') : sch.properties.scenes.items.properties.shots.maxItems === AI.SHOTS_PER_SCENE_MAX, prov + ' shot-draft: shots capped (maxItems on gemini, description on anthropic)');
  eq(new Set(log.map((r) => JSON.stringify(schemaOf(r)))).size, 1, prov + ' shot-draft: one schema for every batch (the cache key)');
}

/* ================= scene notes and breakdown tags ================= */
let id = 0;
const E = (type, text) => ({ id: 'e' + (++id), type, text });
const bigScript = () => {
  id = 0;
  const out = [];
  for (let i = 1; i <= 40; i++) {
    out.push(E('scene', 'INT. ROOM ' + i + ' - DAY'));
    out.push(E('action', ('Anbu crosses the room and picks up the red bag. The fan ticks. ').repeat(8)));
    out.push(E('character', 'ANBU'));
    out.push(E('dialogue', 'Naan nalaikku Chennai poren, amma. '.repeat(3)));
  }
  return out;
};
const context = [{ step: 'Idea', answers: [{ label: 'logline', value: 'A boy leaves home for the city. '.repeat(40) }] }];
for (const prov of ['anthropic', 'gemini']) {
  AI.setProvider(prov);
  const els = bigScript();
  const plan = AI.planSceneRead(els);
  ok(plan.batches.length >= 3, prov + ' scene reads: a 40-scene script is several small parts (' + plan.batches.length + ')');

  log.length = 0; peak = 0;
  const shared = AI.buildSceneNotesShared({ title: 'T', context });
  await AI.runSceneBatches(els, (scenes, part, parts, o = {}) =>
    AI.sceneNotesBatch({ scenes, part, parts, title: 'T', context, shared }, { effort: AI.taskEffort('scene-notes', false), signal: o.signal, onStart: o.onStart }));
  eq(log.length, plan.batches.length, prov + ' scene-notes: one request per part');
  under(peak, 3, prov + ' scene-notes: at most 3 in flight');
  for (const r of log) {
    under(bytes(r), AI.SCENE_READ_BATCH_CHARS + 6000, prov + ' scene-notes: request body bytes');
    under(tokensOf(r), 8000, prov + ' scene-notes: maxTokens');
    eq(effortOf(r), 'low', prov + ' scene-notes: low effort');
    eq(looseNodes(schemaOf(r)), [], prov + ' scene-notes: schema closed');
  }
  if (prov === 'anthropic') eq(new Set(log.map(sharedOf)).size, 1, 'anthropic scene-notes: the shared block is byte-identical across parts');
  else ok(log.every((r) => r.user.startsWith(shared)), 'gemini scene-notes: the shared block goes FIRST in every part');

  log.length = 0; peak = 0;
  const cats = [{ id: 'props', label: 'Props' }, { id: 'cast', label: 'Cast' }];
  const sharedT = AI.buildBreakdownTagsShared({ title: 'T', context: [], categories: cats });
  await AI.runSceneBatches(els, (scenes, part, parts, o = {}) =>
    AI.breakdownTagsBatch({ scenes, part, parts, title: 'T', context: [], categories: cats, shared: sharedT }, { effort: AI.taskEffort('breakdown-tags', false), signal: o.signal, onStart: o.onStart }));
  eq(log.length, plan.batches.length, prov + ' breakdown-tags: one request per part');
  under(peak, 3, prov + ' breakdown-tags: at most 3 in flight');
  for (const r of log) {
    under(bytes(r), AI.SCENE_READ_BATCH_CHARS + 5000, prov + ' breakdown-tags: request body bytes');
    under(tokensOf(r), 12000, prov + ' breakdown-tags: maxTokens');
    eq(effortOf(r), 'low', prov + ' breakdown-tags: low effort');
    eq(looseNodes(schemaOf(r)), [], prov + ' breakdown-tags: schema closed');
    ok(Array.isArray(schemaOf(r).properties.elements.items.properties.category.enum), prov + ' breakdown-tags: category is an enum');
    ok(!/THE BLUEPRINT/.test(r.user), prov + ' breakdown-tags: no blueprint is sent (extraction reads the page)');
  }
}
{
  /* the task passes no blueprint to breakdown tags, and fixes effort once */
  const src = read('src/lib/ai-tasks.js');
  ok(/const context = withRefineContext\(\[\], refine\);[\s\S]{0,400}breakdown-tags/.test(src), 'breakdown-tags task: only the writer\'s follow-up rides as context');
  ok(/AI\.taskEffort\('scene-notes', careful\)/.test(src) && /AI\.taskEffort\('breakdown-tags', careful\)/.test(src), 'the scene reads fix their effort once per run');
}

/* ================= single-request jobs ================= */
AI.setProvider('anthropic');
{
  const sc = AI.coverageScenes(bigScript()).slice(0, 4);
  const cases = [
    ['genre-comps', () => AI.genreComps({ scenes: sc, title: 'T' }), 'low', 4000, 30000],
    ['coverage', () => AI.coverageBatch({ scenes: sc, part: 1, parts: 1 }), 'medium', 8000, 30000],
    ['dialogue-pass', () => AI.dialoguePass({ speech: 'Naan nalaikku Chennai poren.', character: 'ANBU' }), 'medium', 6000, 12000],
    ['beat-critique', () => AI.beatCritique({ step: { num: 1, title: 'Idea' }, answers: [{ label: 'logline', value: 'A boy leaves home.' }] }), 'medium', 6000, 12000],
    ['test-key', () => AI.testKey(), 'low', 1024, 4000]
  ];
  for (const [name, fn, effort, maxTok, maxBytes] of cases) {
    log.length = 0;
    try { await fn(); } catch (e) { /* an empty fake reply; the request is what is measured */ }
    if (!log.length) { ok(false, name + ': sent a request'); continue; }
    const r = log[0];
    eq(effortOf(r), effort, name + ': effort as the table says');
    under(tokensOf(r), maxTok, name + ': maxTokens');
    under(bytes(r), maxBytes, name + ': request body bytes');
    eq(looseNodes(schemaOf(r)), [], name + ': schema closed');
  }
}

/* ================= the lane tasks ================= */
for (const lane of ['preprod', 'post', 'story']) {
  const s = read('src/lib/ai-tasks-' + lane + '.js');
  ok(!/effort:\s*'(low|medium|high)'/.test(s), 'ai-tasks-' + lane + '.js: no effort word typed (the table decides)');
  /* A lane with an ask() helper sends through it (its one callModelForTask
     passes the `task` it was handed); a lane without one calls directly. */
  const viaAsk = /async function ask\(/.test(s);
  const calls = (s.match(viaAsk ? /await ask\(/g : /callModelForTask\(/g) || []).length;
  if (viaAsk) ok(/callModelForTask\(\{[\s\S]{0,80}\btask\b/.test(s), 'ai-tasks-' + lane + '.js: ask() hands its task to the request');
  const named = (s.match(/task: '[a-z-]+'/g) || []).length;
  ok(calls > 0 && named >= calls, 'ai-tasks-' + lane + '.js: every request names its task (' + named + ' of ' + calls + ')');
  for (const m of s.matchAll(/task: '([a-z-]+)'/g)) ok(m[1] in Effort.TASK_EFFORT, 'ai-tasks-' + lane + '.js: ' + m[1] + ' is in the effort table');
}
{
  const s = read('src/lib/ai.js');
  /* Every literal effort left in ai.js is a deliberate one, named here. */
  const literal = [...s.matchAll(/effort:\s*'(low|medium|high)'/g)].length;
  eq(literal, 2, 'ai.js: only testKey (low) and the coverage synthesis (high) type an effort word');
}

/* ================= storyboard frames ================= */
{
  const scene = { id: 'scA', number: '4', intExt: 'INT', location: 'CHAI SHOP', dayNight: 'DAY', synopsis: 'Ravi waits. '.repeat(30), elements: { cast: ['RAVI', 'MEENA'] } };
  const shots = [1, 2, 3, 4].map((n) => ({ id: 'sh' + n, sceneId: 'scA', number: String(n), size: 'WS', angle: 'eye level', lens: '35mm', movement: 'static', description: 'Ravi at the counter. '.repeat(5), rig: 'Key from window' }));
  const frames = [{ id: 'f1', shotId: 'sh2', ref: '', aspect: '2.39:1' }];
  const { jobs } = Board.boardJobs({ shots, scenes: [scene], frames });
  eq(jobs.map((j) => j.aspect), ['16:9', '2.39:1', '16:9', '16:9'], 'a frame\'s own shape reaches its job');
  const p = Board.framePrompt(jobs[1], 'pencil', []);
  under(p.length, 700, 'storyboard: the per-shot prompt is compact (characters)');
  ok(/size WS/.test(p) && /angle eye level/.test(p) && /lens 35mm/.test(p) && /movement static/.test(p), 'storyboard: the camera is in it');
  ok(/Set: INT\. CHAI SHOP/.test(p) && /Action: /.test(p) && /RAVI, MEENA/.test(p), 'storyboard: set, action and characters are in it');
  ok(/2\.39:1/.test(p) && !/16:9/.test(p), 'storyboard: the frame\'s aspect, not a fixed 16:9');
  ok(!/Ravi waits/.test(p), 'storyboard: the scene synopsis is left out when the shot says what we see');
  eq(Board.imageAspect('2.39:1'), '21:9', 'scope asks the image model for 21:9');
  eq(Board.imageAspect(''), '16:9', 'no shape asks for 16:9');
  eq(Board.BOARD_CONCURRENCY, 3, 'frames are drawn three at a time');
  const t = read('src/lib/ai-tasks.js');
  ok(/runBatchesFor\(jobs, \{[\s\S]{0,120}concurrency: BoardM\.BOARD_CONCURRENCY/.test(t), 'board-frames runs its frames through runBatches');
  ok(/aspectRatio: BoardM\.imageAspect\(job\.aspect\)/.test(t), 'board-frames asks for the frame\'s aspect');
}

/* ================= timing is shown, never stored ================= */
{
  const d = read('src/ui/ai-desk.js');
  ok(/ai-desk-timing/.test(d) && /onBatchTime/.test(d), 'the Desk shows the run\'s seconds and each batch\'s');
  ok(!/localStorage|sessionStorage|updateDevicePrefs/.test(d.slice(d.indexOf('TIMING, shown and never stored'), d.indexOf('TIMING, shown and never stored') + 400)), 'the timing is not written anywhere');
}

console.log('test:ai-size — ' + pass + ' passed, ' + fail + ' failed');
console.log('  (the provider is FAKED here; nothing in this test reached a real one.)');
process.exit(fail ? 1 : 0);
