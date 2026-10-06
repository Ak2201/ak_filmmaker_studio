/* ============================================================
   WRITE GOALS — a session goal, and how much got written each day
   ------------------------------------------------------------
   The model behind focus mode's goal bar and its small daily history
   (src/ui/focus-mode.js). Everything here is DERIVED from the script's
   own size — words and pages, measured with script.js's metric — at two
   moments: when the session started, and now. Nothing counts keystrokes,
   so a deleted paragraph is honestly a smaller number, not a bigger one.

   STORAGE CONTRACT. `fms_write_goals_v1` is a new PER-PROJECT key:

       { v: 1,
         goal: { kind: 'pages' | 'words' | 'minutes', target: n },
         days: { 'YYYY-MM-DD': { w0, p0, w, p } } }

   w0/p0 are the script's words/pages the first time that day was seen,
   w/p the latest. Written per day = w - w0. It is registered in
   store.js SCOPED_KEYS, backup.js PROJECT_KEYS and hub.js ALL_KEYS, and
   deliberately NOT in cloud.js's SCOPE_BY_KEY: a new cloud scope needs
   the CHECK constraint on `project_data.scope` widened first, and until
   a schema section does that Postgres would refuse the upsert. It is
   listed as LOCAL_ONLY there so the load-time warning stays quiet.

   WHEN IT WRITES. Only after the SCRIPT saved (a user event), only when
   a number actually moved, and at most once a minute while typing —
   with a final write on pagehide / tab hidden / leaving focus. Never on
   a timer: `verify` asserts zero localStorage writes across four idle
   seconds, and that holds with focus mode on.

   A JUMP IS NOT WRITING. An import, a restored revision or a generated
   draft can add ten thousand words in one save. A single save that
   moves more than JUMP_WORDS words (or JUMP_PAGES pages) shifts the
   baselines by the same amount instead of crediting the writer with it.
   ============================================================ */
import { totalLines, LINES_PER_PAGE, wordCount } from './script.js';

export const GOALS_KEY = 'fms_write_goals_v1';
export const GOAL_KINDS = [
  { id: 'words',   label: 'words',   step: 50,  def: 500 },
  { id: 'pages',   label: 'pages',   step: 0.5, def: 3 },
  { id: 'minutes', label: 'minutes', step: 5,   def: 25 }
];
const KIND_IDS = GOAL_KINDS.map((k) => k.id);
export const JUMP_WORDS = 1500;
export const JUMP_PAGES = 8;
const KEEP_DAYS = 60;
/** Minimum gap between two writes while the writer keeps typing. */
export const WRITE_GAP_MS = 60 * 1000;

/** Words and (unrounded) pages of a list of script elements. */
export function measure(elements) {
  const list = Array.isArray(elements) ? elements : [];
  let words = 0;
  for (const el of list) words += wordCount(el && el.text);
  return { words, pages: totalLines(list) / LINES_PER_PAGE };
}

/** The local calendar day, as YYYY-MM-DD. */
export function dayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
       + '-' + String(d.getDate()).padStart(2, '0');
}

const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);

export function blankGoals() {
  return { v: 1, goal: { kind: 'words', target: 500 }, days: {} };
}

/** Shape-guaranteed: anything stored (or nothing) reads back usable. */
export function normalise(raw) {
  const out = blankGoals();
  if (!raw || typeof raw !== 'object') return out;
  const g = raw.goal && typeof raw.goal === 'object' ? raw.goal : {};
  if (KIND_IDS.includes(g.kind)) out.goal.kind = g.kind;
  const t = num(g.target, 0);
  if (t > 0) out.goal.target = t;
  const days = raw.days && typeof raw.days === 'object' ? raw.days : {};
  for (const [k, d] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !d || typeof d !== 'object') continue;
    out.days[k] = { w0: num(d.w0), p0: num(d.p0), w: num(d.w), p: num(d.p) };
  }
  return out;
}

export function loadGoals(storage = globalThis.localStorage) {
  try {
    const raw = storage && storage.getItem(GOALS_KEY);
    return normalise(raw ? JSON.parse(raw) : null);
  } catch (e) { return blankGoals(); }
}

export function saveGoals(state, storage = globalThis.localStorage) {
  try {
    const days = Object.keys(state.days).sort();
    const kept = {};
    days.slice(-KEEP_DAYS).forEach((k) => { kept[k] = state.days[k]; });
    storage.setItem(GOALS_KEY, JSON.stringify({ v: 1, goal: state.goal, days: kept }));
    return true;
  } catch (e) { return false; }
}

/** Fold one measurement into the day it belongs to. Pure; returns
    whether anything changed. `prev` is the previous measurement this
    session (for the jump rule), or null for the first. */
export function observeDay(state, day, m, prev) {
  let d = state.days[day];
  if (!d) {
    // A day is first seen at the size the script ALREADY had — the
    // previous measurement if there is one, so the save that crosses
    // midnight still credits the minutes before it to nobody.
    const base = prev || m;
    d = state.days[day] = { w0: base.words, p0: base.pages, w: base.words, p: base.pages };
  }
  if (prev) {
    const dw = m.words - prev.words;
    const dp = m.pages - prev.pages;
    if (Math.abs(dw) > JUMP_WORDS || Math.abs(dp) > JUMP_PAGES) { d.w0 += dw; d.p0 += dp; }
  }
  const changed = d.w !== m.words || Math.abs(d.p - m.pages) > 1e-9;
  d.w = m.words;
  d.p = m.pages;
  return changed;
}

/** The last `n` days ending today, oldest first, with what was written. */
export function history(state, n = 7, today = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const k = dayKey(d);
    const r = state.days[k];
    out.push({
      day: k,
      date: d,
      words: r ? r.w - r.w0 : 0,
      pages: r ? r.p - r.p0 : 0
    });
  }
  return out;
}

/* ---- the session tracker -------------------------------------
   One per page load. `getElements` reads the editor's in-memory model;
   `onSaved()` is called after the script saved; `flush()` on the way
   out. `now` is injectable so the Node test can hold a clock. */
export function createTracker({ getElements, storage, now = () => Date.now() } = {}) {
  const store = storage || globalThis.localStorage;
  let state = loadGoals(store);
  const start = measure(getElements());
  const session = { w0: start.words, p0: start.pages };
  let prev = start;
  let dirty = false;
  let lastWrite = 0;

  function write() {
    if (!dirty) return false;
    dirty = false;
    lastWrite = now();
    return saveGoals(state, store);
  }

  return {
    get state() { return state; },
    /** A save landed. Re-measure, and write only if a number moved. */
    onSaved() {
      const m = measure(getElements());
      const dw = m.words - prev.words;
      const dp = m.pages - prev.pages;
      if (Math.abs(dw) > JUMP_WORDS || Math.abs(dp) > JUMP_PAGES) {
        session.w0 += dw; session.p0 += dp;
      }
      if (observeDay(state, dayKey(new Date(now())), m, prev)) dirty = true;
      prev = m;
      if (dirty && now() - lastWrite >= WRITE_GAP_MS) write();
      return m;
    },
    /** pagehide, tab hidden, leaving focus: write what is owed, if any. */
    flush: write,
    /** The goal is a user choice, so it is written when it is made. */
    setGoal(kind, target) {
      const k = KIND_IDS.includes(kind) ? kind : state.goal.kind;
      const t = num(target, 0) > 0 ? num(target) : state.goal.target;
      if (k === state.goal.kind && t === state.goal.target) return false;
      state.goal = { kind: k, target: t };
      dirty = true;
      return write();
    },
    /** What this session has written so far, by the same metric. */
    session() {
      return { words: prev.words - session.w0, pages: prev.pages - session.p0 };
    },
    current() { return prev; }
  };
}

/** Progress toward the goal, 0..1, plus the two numbers to print. */
export function progress(goal, sessionDone, sprintMs) {
  const target = Math.max(num(goal && goal.target, 0), 0) || 1;
  let done = 0;
  if (goal.kind === 'words') done = Math.max(0, sessionDone.words);
  else if (goal.kind === 'pages') done = Math.max(0, Math.round(sessionDone.pages * 10) / 10);
  else done = Math.floor(Math.max(0, sprintMs) / 60000);
  return { done, target, ratio: Math.min(1, done / target) };
}

export default {
  GOALS_KEY, GOAL_KINDS, measure, dayKey, loadGoals, saveGoals,
  observeDay, history, createTracker, progress, normalise
};
