/* ============================================================
   AI DRAFTS — where a run-all keeps its answers until Accept
   ------------------------------------------------------------
   A run-all draft is a model's answer that nobody has accepted yet:
   shots, tags, notes, pictures. It must survive closing the tab (the
   run goes on in the background and is reviewed later), and it must
   NOT be studio data:

   - NOT localStorage. Storage keys are a contract with saved work and
     no key is added for this; and a draft can hold Blobs (storyboard
     pictures) that would never fit there. IndexedDB, database
     'fms-ai-drafts', object store 'drafts', keyed [projectId, runId, key].
   - NOT in a backup, a sync or the studio models. Nothing reads it but
     the run-all view. A draft becomes studio data only through its
     task's own apply(), on Accept (ai-run-all.js acceptDraft).
   - Kept 14 days. Every open sweeps what is older, so a run nobody came
     back to does not sit in the browser for ever.

   draft = { projectId, runId, key, taskId, label, ctx, wave, parents,
             status: 'queued'|'running'|'ready'|'failed'|'skipped'|'accepted'|'rejected',
             result, error, model, startedAt, endedAt, ms,
             order, createdAt, memo?, aiRun?, made? }
   (`order` is the plan's order; `memo` what apply() needs beside the
   result; `aiRun` the history stamp's run id; `made` the real ids an
   Accept created, for the drafts that wait on this one.)

   The backend is injectable: Node tests use memoryBackend(), the
   browser the IndexedDB one. No dependency, no document.
   ============================================================ */

export const DB_NAME = 'fms-ai-drafts';
export const STORE = 'drafts';
export const KEEP_DAYS = 14;
const DAY = 86400000;

const clone = (v) => {
  if (typeof structuredClone === 'function') { try { return structuredClone(v); } catch (e) { /* fall through */ } }
  return v === undefined ? v : JSON.parse(JSON.stringify(v));
};
const keyOf = (d) => [String(d.projectId), String(d.runId), String(d.key)];

/** An in-memory backend with IndexedDB's copy-on-write manners. */
export function memoryBackend() {
  const rows = new Map();
  const id = (k) => JSON.stringify(k);
  return {
    async all() { return [...rows.values()].map(clone); },
    async get(k) { const r = rows.get(id(k)); return r ? clone(r) : null; },
    async put(rec) { rows.set(id(keyOf(rec)), clone(rec)); },
    async del(k) { rows.delete(id(k)); },
    size: () => rows.size
  };
}

/** The IndexedDB backend (browser only). One connection, opened lazily. */
export function idbBackend(idb = (typeof indexedDB !== 'undefined' ? indexedDB : null)) {
  let dbP = null;
  const db = () => {
    if (!idb) return Promise.reject(new Error('This browser has no IndexedDB, so run-all drafts cannot be kept.'));
    if (!dbP) {
      dbP = new Promise((resolve, reject) => {
        const rq = idb.open(DB_NAME, 1);
        rq.onupgradeneeded = () => {
          const d = rq.result;
          if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: ['projectId', 'runId', 'key'] });
        };
        rq.onsuccess = () => resolve(rq.result);
        rq.onerror = () => { dbP = null; reject(rq.error || new Error('IndexedDB would not open.')); };
        rq.onblocked = () => { dbP = null; reject(new Error('IndexedDB is blocked by another tab.')); };
      });
    }
    return dbP;
  };
  const tx = (mode, fn) => db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const st = t.objectStore(STORE);
    let out;
    const rq = fn(st);
    if (rq) rq.onsuccess = () => { out = rq.result; };
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error || new Error('IndexedDB refused the write.'));
    t.onabort = () => reject(t.error || new Error('IndexedDB refused the write.'));
  }));
  return {
    all: () => tx('readonly', (st) => st.getAll()).then((r) => r || []),
    get: (k) => tx('readonly', (st) => st.get(k)).then((r) => r || null),
    put: (rec) => tx('readwrite', (st) => st.put(rec)),
    del: (k) => tx('readwrite', (st) => st.delete(k))
  };
}

let backend = null;
/** Use another backend (a test's memoryBackend()); null puts IndexedDB back. */
export function useDraftsBackend(b) { backend = b || null; }
const current = () => backend || (backend = idbBackend());

const STATUSES = ['queued', 'running', 'ready', 'failed', 'skipped', 'accepted', 'rejected'];

/** A draft as stored: the named fields, anything else passed through. */
export function cleanDraft(d) {
  const x = d && typeof d === 'object' ? d : {};
  return {
    ...x,
    projectId: String(x.projectId || ''), runId: String(x.runId || ''), key: String(x.key || ''),
    taskId: String(x.taskId || ''), label: String(x.label || ''),
    ctx: x.ctx && typeof x.ctx === 'object' ? x.ctx : {},
    wave: x.wave === 2 ? 2 : 1,
    parents: Array.isArray(x.parents) ? x.parents.map(String) : [],
    status: STATUSES.includes(x.status) ? x.status : 'queued',
    result: x.result === undefined ? null : x.result,
    error: x.error == null ? null : x.error,
    model: String(x.model || ''),
    startedAt: x.startedAt || null, endedAt: x.endedAt || null,
    ms: Number.isFinite(x.ms) ? x.ms : null,
    order: Number.isFinite(x.order) ? x.order : 0,
    createdAt: x.createdAt || new Date().toISOString()
  };
}

/** Delete every draft (any project) older than `maxAgeDays`. A run is
    swept as one: its newest draft decides its age. → how many went. */
async function sweepAll(b, maxAgeDays = KEEP_DAYS, now = Date.now()) {
  const cut = now - Math.max(0, Number(maxAgeDays) || 0) * DAY;
  const rows = await b.all();
  const newest = new Map();
  for (const r of rows) {
    const id = r.projectId + '\u0000' + r.runId;
    const t = Date.parse(r.endedAt || r.startedAt || r.createdAt || '') || 0;
    newest.set(id, Math.max(newest.get(id) || 0, t));
  }
  let gone = 0;
  for (const r of rows) {
    if ((newest.get(r.projectId + '\u0000' + r.runId) || 0) < cut) { await b.del(keyOf(r)); gone++; }
  }
  return gone;
}

/**
 * forgetDrafts(projectId) → how many drafts went. Every draft of that
 * project, whatever its age; forgetDrafts(null) every draft of every
 * project. The sweep alone was not enough: it runs only when a drafts
 * view opens, so deleting a film or "Erase everything" left that film's
 * unaccepted rewrites and pictures in IndexedDB on a device that never
 * opened the Draft space again (QA r4 H-2). store.js deleteProject() /
 * purgeProjectEverywhere() and hub-reset.js call it, lazily.
 */
export async function forgetDrafts(projectId, { backend: given } = {}) {
  const b = given || current();
  const all = projectId == null;
  const pid = String(projectId || '');
  let gone = 0;
  for (const r of await b.all()) {
    if (all || r.projectId === pid) { await b.del(keyOf(r)); gone++; }
  }
  return gone;
}

/**
 * openDrafts(projectId) → { listRuns, getRun, get, put, update, remove,
 *   clearRun, sweep }. Every call waits for the sweep the open started.
 */
export function openDrafts(projectId, { backend: given, now } = {}) {
  const pid = String(projectId || '');
  const b = given || current();
  const swept = sweepAll(b, KEEP_DAYS, now).catch(() => 0);
  const mine = async () => { await swept; return (await b.all()).filter((r) => r.projectId === pid); };
  const byOrder = (a, z) => (a.order - z.order) || String(a.key).localeCompare(String(z.key));

  const api = {
    /** [{ runId, createdAt, updatedAt, total, counts: {status: n} }], newest first. */
    async listRuns() {
      const runs = new Map();
      for (const r of await mine()) {
        let x = runs.get(r.runId);
        if (!x) runs.set(r.runId, x = { runId: r.runId, createdAt: r.createdAt, updatedAt: r.createdAt, total: 0, counts: {}, ticks: r.ticks });
        x.total++;
        x.counts[r.status] = (x.counts[r.status] || 0) + 1;
        if (String(r.createdAt) < String(x.createdAt)) x.createdAt = r.createdAt;
        const u = r.endedAt || r.startedAt || r.createdAt;
        if (String(u) > String(x.updatedAt)) x.updatedAt = u;
      }
      return [...runs.values()].sort((a, z) => String(z.createdAt).localeCompare(String(a.createdAt)));
    },
    /** Every draft of one run, in the plan's order. */
    async getRun(runId) { return (await mine()).filter((r) => r.runId === String(runId)).sort(byOrder); },
    async get(runId, key) { await swept; return b.get([pid, String(runId), String(key)]); },
    async put(draft) {
      await swept;
      const d = cleanDraft({ ...draft, projectId: pid });
      await b.put(d);
      return d;
    },
    /** Merge `patch` into one draft. → the draft as stored, or null. */
    async update(runId, key, patch) {
      await swept;
      const was = await b.get([pid, String(runId), String(key)]);
      if (!was) return null;
      const d = cleanDraft({ ...was, ...(patch || {}), projectId: pid, runId: was.runId, key: was.key });
      await b.put(d);
      return d;
    },
    async remove(runId, key) { await swept; await b.del([pid, String(runId), String(key)]); },
    async clearRun(runId) {
      const rows = await api.getRun(runId);
      for (const r of rows) await b.del(keyOf(r));
      return rows.length;
    },
    sweep: (maxAgeDays = KEEP_DAYS) => sweepAll(b, maxAgeDays, now)
  };
  return api;
}

export default { openDrafts, forgetDrafts, memoryBackend, idbBackend, useDraftsBackend, cleanDraft, DB_NAME, STORE, KEEP_DAYS };
