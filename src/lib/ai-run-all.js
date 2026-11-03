/* ============================================================
   AI RUN ALL — one press, every ticked tool, drafts until Accept
   ------------------------------------------------------------
   startRun() plans the run (ai-run-all-model.js planRun, pure), writes
   one DRAFT per node (ai-drafts.js, IndexedDB), and works through them
   with at most three requests in flight. A wave-2 node starts the
   moment its parents' drafts are ready, and reads the parent's DRAFT
   (drafted shots, ids 'draft:<n>'; a drafted shoot order) through its
   headless ctx (ai-headless-ctx.js). resumeRun() picks a run up again
   after the tab was closed: only queued, running and failed drafts run
   again; a ready, skipped, accepted or rejected one is left alone.

   IT WRITES NOTHING TO THE STUDIO. A task's run() only reads and asks
   (that is the Desk's contract for every task); the answer goes into the
   draft store and nowhere else. No Desk session is opened, read or
   aborted: the Desk's sessions and this run never meet.

   acceptDraft() is the only path from a draft to the studio, and it is
   the task's OWN apply(selected, ctx, result, meta), so every invariant
   the Desk relies on holds here too: blanks filled, typed work never
   overwritten, the history stamp from `meta`, an exact Undo. A draft
   that waits on a parent accepts the parent first (shots before their
   blocking or frames, the shoot order before the budget), maps the
   temporary 'draft:<n>' ids to the real ids the parent's apply created,
   and returns ONE undo for all of it, run newest first.

   Rate limits: a 'rate' or 'overloaded' answer is retried once after a
   pause and the pool drops to one request at a time, as ai-batches.js
   does. A missing or refused key fails the whole run once rather than
   eleven times.

   Pro only: aiUnlocked() is asked before anything is planned, and it
   fails closed. Nothing here touches localStorage.
   ============================================================ */
import { planRun } from './ai-run-all-model.js';
import { openDrafts } from './ai-drafts.js';
import { headlessCtx, headlessReady } from './ai-headless-ctx.js';
import { newId } from './record-id.js';

export const CONCURRENCY = 3;
const RETRY_DELAY_MS = 8000;
const SETTLED = new Set(['ready', 'failed', 'skipped', 'accepted', 'rejected']);
const RERUN = new Set(['queued', 'running', 'failed']);

const isAbort = (e) => !!(e && (e.kind === 'aborted' || e.code === 'aborted' || e.name === 'AbortError'));
const retryable = (e) => !!(e && (e.kind === 'rate' || e.kind === 'overloaded'));
const keyless = (e) => !!(e && (e.kind === 'auth' || e.kind === 'nokey'));
const errOf = (e) => ({ message: String((e && e.message) || e || 'It failed.').slice(0, 600), kind: String((e && (e.kind || e.code)) || 'unknown') });
const now = () => new Date().toISOString();
const nap = (ms, signal) => new Promise((resolve) => {
  if (signal && signal.aborted) { resolve(); return; }
  const t = setTimeout(wake, ms);
  function wake() { clearTimeout(t); if (signal) signal.removeEventListener('abort', wake); resolve(); }
  if (signal) signal.addEventListener('abort', wake, { once: true });
});

/* ---- what the engine leans on, injectable for Node tests ----------- */
async function readCareful() {
  try { const P = await import('./chrome-prefs.js'); return !!P.readAiCareful(); } catch (e) { return false; }
}

async function envOf(deps = {}) {
  const tasks = deps.tasks
    || await import('./ai-tasks.js').then((m) => m.loadTasks());
  const get = typeof tasks === 'function' ? tasks : (id) => (tasks instanceof Map ? tasks.get(id) : tasks[id]);
  if (!deps.ctxFor) await headlessReady();
  return {
    task: get,
    ctxFor: deps.ctxFor || headlessCtx,
    drafts: deps.drafts || null,
    concurrency: Math.max(1, Math.floor(Number(deps.concurrency)) || CONCURRENCY),
    retryDelayMs: deps.retryDelayMs == null ? RETRY_DELAY_MS : deps.retryDelayMs,
    /* The Desk's Careful switch (L0's effort ladder, ai-effort.js
       taskEffort): read ONCE per run, because effort is part of each
       task's prompt-cache key and must not change between its batches.
       Tests pass `careful` explicitly. */
    careful: deps.careful == null ? await readCareful() : !!deps.careful,
    unlocked: deps.unlocked
  };
}

async function assertUnlocked(unlocked) {
  let ok = false;
  try {
    if (typeof unlocked === 'function') ok = !!(await unlocked());
    else { const PG = await import('./plan-gate.js'); ok = !!(PG.aiUnlocked || PG.default.aiUnlocked)(); }
  } catch (e) { ok = false; }   // fails closed
  if (!ok) {
    const e = new Error('Run all is part of the Pro plan’s AI tools. Nothing was run.');
    e.kind = 'locked';
    throw e;
  }
}

/* ---- the project as the planner needs it --------------------------- */
/** A snapshot of the open project for planRun (the counts behind each
    skip reason). Reads the models; writes nothing. */
export async function projectState({ ticks } = {}) {
  const [Sc, Sh, Sp, Lo, Co, Ch, St, PM, SM] = await Promise.all([
    import('./scenes.js'), import('./shots.js'), import('./script.js'), import('./locations.js'),
    import('./contacts.js'), import('./characters.js'), import('./story.js'),
    import('./ai-preprod-model.js'), import('./ai-story-model.js')
  ]);
  const safe = (fn, d) => { try { return fn(); } catch (e) { return d; } };
  const scenes = safe(() => Sc.listScenes(), []);
  const shots = safe(() => Sh.listShots(), []);
  const per = new Map();
  for (const s of shots) per.set(s.sceneId, (per.get(s.sceneId) || 0) + 1);
  const els = safe(() => Sp.loadScript().elements || [], []);
  const fmt = safe(() => Ch.projectFormat(), 'feature');
  const characters = safe(() => {
    /* ai-tasks-story.js arcFacts, the same three reads */
    const story = St.loadStory();
    let steps = [];
    try { steps = St.stepsInOrder(story, St.effectiveFramework(story, fmt)); } catch (e) { steps = []; }
    return SM.arcsFacts({ views: Ch.characterViews(Ch.loadCharacters(), fmt), steps, scenes, slugOf: Sc.slug }).characters.length;
  }, 0);
  const want = ticks == null ? null : new Set(Array.isArray(ticks) ? ticks : ticks instanceof Set ? [...ticks] : Object.keys(ticks).filter((k) => ticks[k]));
  let board = { ok: false, text: '' };
  if (want && want.has('board-frames')) {
    board = await import('./drive-board.js').then((m) => m.currentBoardGate())
      .catch(() => ({ ok: false, text: 'The Drive tools did not load.' }));
  }
  return {
    scriptScenes: els.filter((e) => e && e.type === 'scene').length,
    scenes: scenes.map((s) => ({ id: s.id, number: s.number, shots: per.get(s.id) || 0 })),
    shootable: safe(() => PM.shootOrderFacts(scenes, { pageTarget: (Lo.schedulePrefs() || {}).pageTarget || 0 }).scenes.length, 0),
    places: safe(() => PM.recceFacts(Lo.locationIndex(scenes), { only: '' }).places.length, 0),
    characters,
    callSheets: safe(() => Co.listCallSheets(), []).map((s) => ({ id: s.id, title: s.title, notes: !!String(s.notes || '').trim() })),
    board
  };
}

/* ---- the pool -------------------------------------------------------- */
const itemsOf = (result) => (result && Array.isArray(result.items) ? result.items : []);

/** What survives the store: no functions; the memo kept as its own field. */
function storable(result) {
  if (result == null || typeof result !== 'object') return { result: result ?? null, memo: null };
  const memo = result.memo === undefined ? null : result.memo;
  return { result: { ...result }, memo };
}

/** Put a stored memo back where recall() looks for it (non-enumerable). */
function pinMemo(result, memo) {
  if (result && typeof result === 'object' && memo != null) {
    Object.defineProperty(result, 'memo', { value: memo, enumerable: false, configurable: true });
  }
  return result;
}

function parentsOf(d, byKey) {
  const out = {};
  for (const k of d.parents || []) {
    const p = byKey.get(k);
    if (p) out[k] = { taskId: p.taskId, status: p.status, result: pinMemo(p.result, p.memo), made: p.made || {} };
  }
  return out;
}

async function drive(env, store, runId, { signal, onUpdate } = {}) {
  const rows = await store.getRun(runId);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const tell = (d, extra) => { if (onUpdate) { try { onUpdate(extra ? { ...d, ...extra } : d); } catch (e) { /* UI */ } } };
  const save = async (d, patch) => {
    Object.assign(d, patch);
    let stored;
    try { stored = await store.update(runId, d.key, patch); }
    catch (e) {
      /* A result the store cannot clone (a Blob in a browser that will not
         take one) is kept as its JSON shape rather than lost. */
      if (patch && 'result' in patch) {
        const safe = { ...patch, result: JSON.parse(JSON.stringify(patch.result ?? null)), memo: JSON.parse(JSON.stringify(patch.memo ?? null)) };
        stored = await store.update(runId, d.key, safe);
      } else throw e;
    }
    if (stored) Object.assign(d, stored);
    tell(d);
    return d;
  };

  /* Resume: what had not finished runs again, from the start. */
  const pending = [];
  for (const d of rows) {
    if (!RERUN.has(d.status)) continue;
    if (d.status !== 'queued') await save(d, { status: 'queued', error: null, startedAt: null, endedAt: null, ms: null });
    pending.push(d);
  }
  pending.sort((a, z) => (a.wave - z.wave) || (a.order - z.order));

  let limit = env.concurrency;
  let inflight = 0;
  let halted = null;          // a key problem: nothing else is started
  let finish;
  const done = new Promise((r) => { finish = r; });
  const aborted = () => !!(signal && signal.aborted);
  const waitsOn = (d) => (d.parents || []).some((k) => { const p = byKey.get(k); return p && !SETTLED.has(p.status); });

  async function runOne(d) {
    const task = env.task(d.taskId);
    if (!task || typeof task.run !== 'function') {
      await save(d, { status: 'skipped', error: { message: 'This build has no “' + d.taskId + '” tool.', kind: 'missing' }, endedAt: now() });
      return;
    }
    const parents = parentsOf(d, byKey);
    const fed = Object.values(parents).some((p) => p.status === 'ready' || p.status === 'accepted');
    if (d.needsParent && !fed) {
      const names = (d.parents || []).map((k) => (byKey.get(k) || {}).label || k).join(', ');
      await save(d, { status: 'skipped', error: { message: 'Nothing to read: ' + names + ' did not finish.', kind: 'parent' }, endedAt: now() });
      return;
    }
    const started = Date.now();
    await save(d, { status: 'running', startedAt: new Date(started).toISOString(), error: null });
    let tries = 0;
    for (;;) {
      tries++;
      const shown = [];
      try {
        const ctx = env.ctxFor(d.taskId, d.ctx, { parentsResults: parents });
        const gate = typeof task.blocked === 'function' ? task.blocked(ctx) : null;
        if (gate) {
          await save(d, { status: 'skipped', error: { message: String(gate.text || 'This tool cannot run here now.'), kind: 'blocked' }, endedAt: now() });
          return;
        }
        const input = typeof task.input === 'function' ? String(task.input(ctx) ?? '') : '';
        const res = await task.run(input, {
          signal, ctx, careful: env.careful,
          onStatus: (m) => tell(d, { statusText: String(m || '') }),
          onItems: (items) => { shown.push(...[].concat(items || [])); tell(d, { partial: shown.slice() }); }
        });
        if (aborted()) throw Object.assign(new Error('Stopped.'), { kind: 'aborted' });
        const { result, memo } = storable(res || {});
        const ended = Date.now();
        await save(d, {
          status: 'ready', result, memo, error: null,
          model: String((result && result.model) || (memo && memo.model) || ''),
          aiRun: newId('air'), endedAt: new Date(ended).toISOString(), ms: ended - started
        });
        return;
      } catch (e) {
        if (aborted() || isAbort(e)) {
          await save(d, { status: 'queued', startedAt: null, endedAt: null, ms: null, error: null });
          return;
        }
        if (retryable(e) && tries <= 1) {
          limit = 1;                               // the provider is pushing back
          tell(d, { statusText: 'Busy, trying again shortly…' });
          await nap(env.retryDelayMs, signal);
          if (aborted()) { await save(d, { status: 'queued', startedAt: null, error: null }); return; }
          continue;
        }
        const ended = Date.now();
        await save(d, { status: 'failed', error: errOf(e), endedAt: new Date(ended).toISOString(), ms: ended - started });
        if (keyless(e)) halted = e;
        return;
      }
    }
  }

  /* A child whose parents have just settled goes to the front: its
     parent's cards are on screen, so its own should follow them, not wait
     behind every other wave-1 tool. Otherwise wave, then plan order. */
  const fed = (d) => (d.parents || []).length > 0 && !waitsOn(d);
  function pump() {
    if (!aborted() && !halted) {
      const next = pending.slice().sort((a, z) => (fed(z) - fed(a)) || (a.wave - z.wave) || (a.order - z.order));
      for (const d of next) {
        if (inflight >= limit) break;
        if (d.status !== 'queued' || d._on || waitsOn(d)) continue;
        d._on = true;
        inflight++;
        runOne(d).catch((e) => save(d, { status: 'failed', error: errOf(e), endedAt: now() }).catch(() => {}))
          .finally(() => { inflight--; delete d._on; pump(); });
      }
    }
    if (inflight === 0) settle();
  }

  let settling = false;
  async function settle() {
    if (settling) return;
    settling = true;
    if (halted) {
      for (const d of pending) if (d.status === 'queued') await save(d, { status: 'failed', error: errOf(halted), endedAt: now() });
    }
    const counts = {};
    for (const d of rows) counts[d.status] = (counts[d.status] || 0) + 1;
    finish({ runId, stopped: aborted(), counts });
  }

  if (signal) signal.addEventListener('abort', () => { if (inflight === 0) settle(); }, { once: true });
  pump();
  return done;
}

/**
 * startRun({ projectId, ticks, signal, onUpdate }) → { runId, done }
 *   done resolves { runId, stopped, counts } and never rejects for one
 *   tool's failure (that is the draft's status). Rejects before anything
 *   is planned when AI tools are locked.
 * Test-only extras: tasks, ctxFor, drafts (an openDrafts store), project,
 * unlocked, concurrency, retryDelayMs, careful.
 */
export async function startRun({ projectId, ticks, signal, onUpdate, ...deps } = {}) {
  await assertUnlocked(deps.unlocked);
  const env = await envOf(deps);
  const store = env.drafts || openDrafts(projectId);
  const project = deps.project || await projectState({ ticks });
  const { nodes } = planRun({ ticks, project });
  const runId = newId('run');
  const at = now();
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    await store.put({
      projectId, runId, key: n.key, taskId: n.taskId, label: n.label, ctx: n.ctx, wave: n.wave, parents: n.parents,
      needsParent: !!n.needsParent, order: i, createdAt: at,
      status: n.skip ? 'skipped' : 'queued', error: n.skip ? { message: n.skip, kind: 'plan' } : null
    });
  }
  return { runId, done: drive(env, store, runId, { signal, onUpdate }) };
}

/** Pick a run up again: queued, running (a closed tab) and failed drafts
    run again; nothing else is touched. → { runId, done } */
export async function resumeRun(projectId, runId, { signal, onUpdate, ...deps } = {}) {
  await assertUnlocked(deps.unlocked);
  const env = await envOf(deps);
  const store = env.drafts || openDrafts(projectId);
  return { runId, done: drive(env, store, runId, { signal, onUpdate }) };
}

/** Mark a ready draft rejected (nothing is written). */
export async function rejectDraft(projectId, runId, key, { drafts } = {}) {
  const store = drafts || openDrafts(projectId);
  const d = await store.get(runId, key);
  if (!d || d.status !== 'ready') return null;
  return store.update(runId, key, { status: 'rejected' });
}

/* ---- Accept ----------------------------------------------------------- */
const TOKEN = /draft:\d+/g;

/** `v` with every 'draft:<n>' token that `map` names replaced by its real
    id, at any depth (ids, 'shot:draft:3' item ids, a memo's shot list).
    Plain objects and arrays are copied; anything else (a Blob) is kept. */
export function mapDraftIds(v, map) {
  if (!map || !Object.keys(map).length) return v;
  if (typeof v === 'string') return v.replace(TOKEN, (t) => (map[t] ? map[t] : t));
  if (Array.isArray(v)) return v.map((x) => mapDraftIds(x, map));
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out = {};
    for (const k of Object.keys(v)) out[k] = mapDraftIds(v[k], map);
    if (v.memo !== undefined && !Object.prototype.propertyIsEnumerable.call(v, 'memo')) pinMemo(out, mapDraftIds(v.memo, map));
    return out;
  }
  return v;
}

/** The 'draft:<n>' → real id map an accepted shot-draft's undo reports
    (undo.made = [[itemId, shotId]]), n being the item's index. */
function madeOf(result, undo) {
  const out = {};
  const pairs = undo && Array.isArray(undo.made) ? undo.made : [];
  if (!pairs.length) return out;
  const index = new Map(itemsOf(result).map((it, n) => [String(it && it.id), n]));
  for (const [itemId, realId] of pairs) {
    const n = index.get(String(itemId));
    if (n != null && realId) out['draft:' + n] = String(realId);
  }
  return out;
}

/**
 * acceptDraft(projectId, runId, key, selected?) → { undo, wrote }
 *   Parents still 'ready' are accepted first (all of their items), then
 *   this draft with `selected` (default: every item). Each through its
 *   task's apply(selected, headlessCtx, result, meta). A throw anywhere
 *   undoes what this call already wrote and rethrows: one Accept, one
 *   outcome. `undo()` (async) reverts all of it, newest first, and puts
 *   the drafts back to 'ready'. `wrote`: [{ key, taskId, said, made, unit }].
 * Test-only extras (5th argument): tasks, ctxFor, drafts.
 */
export async function acceptDraft(projectId, runId, key, selected, deps = {}) {
  const env = await envOf(deps);
  const store = env.drafts || openDrafts(projectId);
  const rows = await store.getRun(runId);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const target = byKey.get(String(key));
  if (!target) throw new Error('That draft is no longer kept (drafts are kept for 14 days). Run it again.');
  if (target.status !== 'ready') throw new Error('That draft is ' + target.status + ', so there is nothing to accept.');

  const order = [];
  const seen = new Set();
  (function visit(d) {
    if (seen.has(d.key)) return;
    seen.add(d.key);
    for (const k of d.parents || []) { const p = byKey.get(k); if (p && p.status === 'ready') visit(p); }
    order.push(d);
  })(target);

  const done = [];   // [{ d, undo, made }]
  const wrote = [];
  try {
    for (const d of order) {
      const task = env.task(d.taskId);
      if (!task || typeof task.apply !== 'function') throw new Error('“' + (d.label || d.taskId) + '” has nothing to accept.');
      /* Any id that never became real stays 'draft:<n>': the child's own
         apply skips a shot it cannot find (planDraftApply → skipped). */
      const map = {};
      for (const k of d.parents || []) Object.assign(map, (byKey.get(k) || {}).made || {});
      const result = pinMemo(mapDraftIds(d.result, map), mapDraftIds(d.memo, map));
      const pick = d === target && Array.isArray(selected) ? selected : itemsOf(d.result);
      const sel = mapDraftIds(pick, map);
      const ctx = env.ctxFor(d.taskId, d.ctx, { parentsResults: {} });
      const meta = { task: d.taskId, model: d.model || '', run: d.aiRun || newId('air'), at: now() };
      /* kind 'text' tasks take the text, not items (the Desk passes the proposal) */
      const arg = task.kind === 'text'
        ? (d === target && typeof selected === 'string' ? selected : String((result && result.proposed) || ''))
        : sel;
      const undo = await task.apply(arg, ctx, result, meta);
      const made = d.taskId === 'shot-draft' ? madeOf(d.result, undo) : {};
      done.push({ d, undo, made });
      wrote.push({ key: d.key, taskId: d.taskId, said: (ctx.said || []).slice(), made, unit: ctx.unit || '' });
      d.made = made;
      d.status = 'accepted';
    }
  } catch (e) {
    for (const x of done.slice().reverse()) { try { if (typeof x.undo === 'function') await x.undo(); } catch (er) { /* best effort */ } }
    for (const x of done) { x.d.status = 'ready'; x.d.made = {}; }
    throw e;
  }
  for (const x of done) await store.update(runId, x.d.key, { status: 'accepted', made: x.made, acceptedAt: now() });

  let undone = false;
  const undo = async () => {
    if (undone) return false;
    undone = true;
    let any = false;
    for (const x of done.slice().reverse()) {
      if (typeof x.undo === 'function') { const r = await x.undo(); if (r !== false) any = true; }
    }
    for (const x of done) await store.update(runId, x.d.key, { status: 'ready', made: {}, acceptedAt: null });
    return any;
  };
  return { undo, wrote };
}

export default { startRun, resumeRun, acceptDraft, rejectDraft, projectState, mapDraftIds, CONCURRENCY };
