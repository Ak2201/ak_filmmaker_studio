/* ============================================================
   AI STAMP — which records an AI Accept wrote, as a FIELD
   ------------------------------------------------------------
   docs/AI-FAST-HARNESS.md section B. Every record an AI Accept writes
   carries a small field; the history (src/lib/ai-history.js) is DERIVED
   from the stamps and stores nothing. NO storage key: both fields ride
   on records that already exist (the songId / shotState pattern), and
   every model reads a record by spreading it over a blank, so an
   unknown field passes through.

     ai      { task, model, run, at, h }
             the run that CREATED this record.
     aiFill  [ { task, model, run, at, h, fields, mode } ]
             runs that FILLED or CHANGED fields of a record they did not
             create (newest last, at most FILL_CAP).
             mode: 'fill' (a blank became a value), 'append' (added to
             what was there), 'replace' (changed what was there).

   `h` is aiHash() of the AI-written content AT WRITE TIME. "Edited
   since" is DERIVED — hash now vs `h` — and never written, so no editor,
   setter or keystroke path had to change. Reordering a record is not an
   edit (the number / position is not hashed); changing a hashed field is.

   A legacy shot stamped `ai: true` (before this file) reads as
   { task: 'shot-draft', run: '', legacy: true }: listed, never undoable,
   never "edited"-known (there is no hash to compare).

   PURE. No storage, no document, no clock but the `at` it stamps.
   ============================================================ */
import { newId } from './record-id.js';

export const FILL_CAP = 8;

/* kind → the fields whose content the stamp covers. `null` means "every
   field but the bookkeeping ones" (a document, a character card). A
   record rebuilt field by field must copy `ai` and `aiFill` through
   readStamp(); nothing here invents one. */
export const AI_KINDS = {
  shot: ['size', 'angle', 'movement', 'lens', 'rig', 'setup', 'description'],
  scene: ['intExt', 'dayNight', 'location', 'synopsis', 'eighths', 'beatId'],
  element: ['type', 'text'],
  step: ['beat', 'text'],
  story: ['logline', 'loglineAlts', 'genre', 'tone', 'budgetTier', 'budgetWhy', 'audience', 'comps', 'idea', 'synopsis'],
  /* A card, not a view: the Characters panel draws a VIEW (the card with the
     blueprint laid over it, plus bookkeeping fields), so the list is fixed
     rather than "every field" or a view would never hash like its record. */
  character: ['name', 'aliases', 'age', 'want', 'need', 'arc', 'voice', 'role', 'look', 'stakes', 'fear', 'lie', 'flaw',
    'strength', 'wound', 'secret', 'arcStart', 'arcEnd', 'relationships'],
  note: ['snippet'],
  frame: ['caption', 'action', 'dialogue', 'camera', 'ref'],
  block: ['name', 'note', 'widthM', 'marks', 'set', 'axis'],
  callsheet: ['notes'],
  recce: null,
  budgetRow: null,
  document: null,
  edit: null,
  take: ['text'],
  mark: ['start', 'end', 'tags']
};

const BOOKKEEPING = new Set(['id', 'ai', 'aiFill', 'u', 'updated', 'updatedAt', 'at', 'number', 'sceneId', 'shotId']);

/* A stable JSON: object keys sorted at every depth, so the hash does not
   depend on the order a model happened to build a record in. */
function stable(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
}

/** FNV-1a (32 bit) over a string, as 8 hex digits. Not a security hash. */
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return ('00000000' + h.toString(16)).slice(-8);
}

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/** The fields a stamp of this kind covers on this record. */
function fieldsFor(kind, record, fields) {
  if (Array.isArray(fields) && fields.length) return fields;
  const named = AI_KINDS[kind];
  if (Array.isArray(named)) return named;
  return Object.keys(record || {}).filter((k) => !BOOKKEEPING.has(k)).sort();
}

/** The fingerprint of the AI-written content of `record`. */
export function aiHash(kind, record, fields) {
  const r = isObj(record) ? record : {};
  const list = fieldsFor(kind, r, fields);
  const picked = {};
  for (const f of list) picked[f] = r[f] === undefined ? null : r[f];
  return fnv(stable(picked));
}

/** `meta` when no Desk handed one (a direct caller, a test). */
export function aiMeta(task, model = '', run) {
  return { task: String(task || ''), model: String(model || ''), run: run || newId('air'), at: new Date().toISOString() };
}

/** `meta` normalised, or a fresh one for `task` when it is absent. */
export function metaOf(task, meta, model) {
  if (isObj(meta) && meta.run) {
    return { task: String(meta.task || task || ''), model: String(meta.model || model || ''), run: String(meta.run), at: String(meta.at || new Date().toISOString()) };
  }
  return aiMeta(task, model);
}

/** The record with `ai` set: the run that created it. */
export function stampAI(kind, record, meta) {
  const m = metaOf('', meta);
  return { ...record, ai: { task: m.task, model: m.model, run: m.run, at: m.at, h: aiHash(kind, record) } };
}

/** The record with an `aiFill` entry appended (newest last, capped).
    `fields` are the fields this run filled; the hash covers only them. */
export function stampFill(kind, record, meta, fields, mode = 'fill') {
  const m = metaOf('', meta);
  let list = Array.isArray(fields) && fields.length ? fields.slice() : fieldsFor(kind, record);
  let prev = Array.isArray(record && record.aiFill) ? record.aiFill.filter(isObj) : [];
  /* One run, one mode, one entry: a run that fills a record twice (a take
     per call) widens its own entry instead of adding a second. */
  const same = prev.find((f) => f.run === m.run && f.task === m.task && f.mode === mode && Array.isArray(f.fields));
  if (same) {
    list = [...new Set(same.fields.concat(list))];
    prev = prev.filter((f) => f !== same);
  }
  const entry = { task: m.task, model: m.model, run: m.run, at: m.at, fields: list, h: aiHash(kind, record, list), mode };
  return { ...record, aiFill: prev.concat(entry).slice(-FILL_CAP) };
}

/** The same record without the fill entry of `run` (an Undo of the run). */
export function unstampFill(record, run) {
  if (!record || !Array.isArray(record.aiFill)) return record;
  const left = record.aiFill.filter((f) => !(f && f.run === run));
  if (left.length === record.aiFill.length) return record;
  const out = { ...record };
  if (left.length) out.aiFill = left; else delete out.aiFill;
  return out;
}

/** Normalise `ai` / `aiFill` / legacy `true`; never throws.
    → { created: {task,model,run,at,h,legacy}|null, fills: [{…, fields, mode}] } */
export function readStamp(record) {
  const out = { created: null, fills: [] };
  try {
    if (!isObj(record)) return out;
    const a = record.ai;
    if (a === true) out.created = { task: 'shot-draft', model: '', run: '', at: '', h: '', legacy: true };
    else if (isObj(a) && (a.task || a.run)) {
      out.created = { task: String(a.task || ''), model: String(a.model || ''), run: String(a.run || ''), at: String(a.at || ''), h: String(a.h || ''), legacy: false };
    }
    if (Array.isArray(record.aiFill)) {
      for (const f of record.aiFill) {
        if (!isObj(f) || !(f.task || f.run)) continue;
        out.fills.push({
          task: String(f.task || ''), model: String(f.model || ''), run: String(f.run || ''), at: String(f.at || ''), h: String(f.h || ''),
          fields: Array.isArray(f.fields) ? f.fields.map(String) : [],
          mode: f.mode === 'append' || f.mode === 'replace' ? f.mode : 'fill'
        });
      }
    }
  } catch (e) { /* a stamp is advice: unreadable means none */ }
  return out;
}

/** Has the AI-written content changed since the run wrote it? A legacy
    stamp (no hash) is never reported edited: nothing to compare. */
export function isEdited(kind, record, stamp) {
  if (!stamp || !stamp.h) return false;
  return aiHash(kind, record, stamp.fields && stamp.fields.length ? stamp.fields : undefined) !== stamp.h;
}

/** A run's stamping tools in ONE object, for the models that must not import this
    file (scenes.js, shots.js and scriptgen.js are on pages' first paint; this file is
    not): the lazy caller makes the stamper and hands it in as `{ ai }`.
      create(kind, rec)                → rec with `ai`
      fill(kind, rec, fields, mode)    → rec with an `aiFill` entry
      drop(rec)                        → rec without this run's fill entries
      run                              → the run id */
export function stamper(meta) {
  const m = metaOf('', meta);
  return {
    meta: m,
    run: m.run,
    create: (kind, rec) => stampAI(kind, rec, m),
    fill: (kind, rec, fields, mode) => stampFill(kind, rec, m, fields, mode),
    drop: (rec) => unstampFill(rec, m.run)
  };
}

/** Is any stamp on this record? (the badge's test) */
export const hasStamp = (record) => {
  const s = readStamp(record);
  return !!s.created || s.fills.length > 0;
};

export default { AI_KINDS, FILL_CAP, aiHash, aiMeta, metaOf, stampAI, stampFill, unstampFill, stamper, readStamp, isEdited, hasStamp };
