/* ============================================================
   EDIT HISTORY — the Screenplay Writer's one undo/redo stack
   ------------------------------------------------------------
   PURE: no DOM, no storage, no clock of its own (the caller passes
   `now`). `npm run test:history` runs it in Node.

   WHY SNAPSHOTS, NOT INVERSE OPERATIONS. The editor changes the
   element list from a dozen places — typing, Return's split, a join at
   an edge, a type change, the auto-formatter, a paste, an alternate
   take swapped in, Backspace on an empty line — and each has its own
   corner cases (a dual flag dropped, an id kept for its note). An
   inverse per operation would be a dozen chances to restore something
   slightly different from what was there. A snapshot of the list is
   one rule that cannot disagree with any of them: undo puts back
   exactly the elements, with their ids, that existed before the step.

   It stays cheap by STRUCTURAL SHARING: a snapshot reuses the previous
   snapshot's frozen copy of every element that has not changed, so a
   step on a 3,000-line script copies one or two elements, not 3,000.
   The copies are frozen so nothing can edit history by accident; the
   editor gets fresh clones back on restore, because it edits elements
   in place (`el.text = ta.value`).

   COALESCING. Typing inside one line is one step per burst: a record
   of kind 'typing' with the same `key` (line + insert/delete), less
   than `pauseMs` after the last one, and with the caret where the
   last keystroke left it (`moved: false`), is folded into the step
   already open. Anything else — a pause, a caret move, a different
   line, any structural step — opens a new one.
   ============================================================ */

const SHALLOW = (v) => v === null || typeof v !== 'object';

function cloneValue(v) {
  if (SHALLOW(v)) return v;
  if (typeof structuredClone === 'function') {
    try { return structuredClone(v); } catch (e) { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(v));
}

/** A deep-enough copy of one element: every field, unknown ones too
 *  (the co-edit stamp `u`, `alts`, whatever a newer build adds). */
export function cloneElement(el) {
  const out = {};
  for (const k of Object.keys(el || {})) out[k] = cloneValue(el[k]);
  return out;
}

function deepFreeze(v) {
  if (!SHALLOW(v) && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

function sameValue(a, b) {
  if (a === b) return true;
  if (SHALLOW(a) || SHALLOW(b)) return false;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
}

/** True when two elements carry the same fields with the same values.
 *  `u` (the co-edit clock) is ignored: it moves on save, not on edit. */
export function sameElement(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  const ka = Object.keys(a).filter((k) => k !== 'u');
  const kb = Object.keys(b).filter((k) => k !== 'u');
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && sameValue(a[k], b[k]));
}

/** A frozen snapshot of `elements`, sharing every unchanged element
 *  with `prev` (an earlier snapshot, or null). */
export function snapshotOf(elements, prev) {
  const byId = new Map();
  if (Array.isArray(prev)) for (const e of prev) if (e && e.id != null) byId.set(e.id, e);
  const out = (elements || []).map((el) => {
    const old = el && byId.get(el.id);
    return old && sameElement(old, el) ? old : deepFreeze(cloneElement(el));
  });
  return Object.freeze(out);
}

/** Fresh, editable elements from a snapshot. An element that still
 *  exists in `current` keeps the co-edit stamp it has NOW (`u`): a
 *  restored line carrying its older stamp would be read by the save's
 *  stampChanged() as a stale copy, never re-stamped, and lose the next
 *  merge to the very edit it undid. */
export function restoreElements(snapshot, current) {
  const now = new Map();
  for (const e of current || []) if (e && e.id != null) now.set(e.id, e);
  return (snapshot || []).map((s) => {
    const el = cloneElement(s);
    const cur = now.get(el.id);
    if (cur && cur.u != null) el.u = cur.u;
    return el;
  });
}

/** True when two snapshots hold the same document. */
export function sameSnapshot(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!sameElement(a[i], b[i])) return false;
  return true;
}

/**
 * createHistory({ limit, pauseMs }) → the stack.
 *   record(snap, caret, { kind, key, now, moved, meta })
 *       Call BEFORE a change, with the state the change starts from.
 *       `snap` may be a function (it is only called when a step is
 *       really opened, so a coalesced keystroke costs nothing).
 *       Returns true when a new step was opened.
 *   undo(currentSnap, currentCaret) → { snap, caret, meta } | null
 *   redo(currentSnap, currentCaret) → { snap, caret, meta } | null
 *   breakCoalesce()   the next typing record opens a new step
 *   clear()
 *   canUndo() canRedo() size()
 */
export function createHistory({ limit = 200, pauseMs = 1000 } = {}) {
  let undoStack = [];
  let redoStack = [];
  let open = null;        // { key, at } of the typing burst in progress
  let lastSnap = null;    // for structural sharing

  const take = (snap) => {
    const s = typeof snap === 'function' ? snap(lastSnap) : snap;
    if (s) lastSnap = s;
    return s;
  };

  return {
    record(snap, caret, opts = {}) {
      const kind = opts.kind || 'edit';
      const now = Number(opts.now) || 0;
      if (kind === 'typing' && open && opts.key != null && open.key === opts.key
          && !opts.moved && now - open.at <= pauseMs) {
        open.at = now;
        return false;
      }
      const s = take(snap);
      if (!s) return false;
      const top = undoStack[undoStack.length - 1];
      /* A step that would start from exactly the state the last one
         started from adds nothing to undo — two checkpoints for one
         gesture (a type change inside a split) — so it is dropped. */
      if (!(top && sameSnapshot(top.snap, s) && kind !== 'typing')) {
        undoStack.push({ snap: s, caret: caret || null, kind, meta: opts.meta || null });
        if (undoStack.length > limit) undoStack.splice(0, undoStack.length - limit);
      }
      redoStack = [];
      open = kind === 'typing' && opts.key != null ? { key: opts.key, at: now } : null;
      return true;
    },
    undo(currentSnap, currentCaret) {
      open = null;
      const cur = take(currentSnap);
      while (undoStack.length) {
        const e = undoStack.pop();
        // A step that changed nothing (typing that was typed away) is skipped.
        if (cur && sameSnapshot(e.snap, cur)) continue;
        redoStack.push({ snap: cur, caret: currentCaret || null, kind: e.kind, meta: e.meta });
        lastSnap = e.snap;
        return { snap: e.snap, caret: e.caret, meta: e.meta, kind: e.kind };
      }
      return null;
    },
    redo(currentSnap, currentCaret) {
      open = null;
      const cur = take(currentSnap);
      const e = redoStack.pop();
      if (!e) return null;
      undoStack.push({ snap: cur, caret: currentCaret || null, kind: e.kind, meta: e.meta });
      lastSnap = e.snap;
      return { snap: e.snap, caret: e.caret, meta: e.meta, kind: e.kind };
    },
    /** Merge `meta` into the step most recently opened (a gesture made of
     *  several parts learns, part-way, that it was the auto-formatter's). */
    amendTop(meta) {
      const top = undoStack[undoStack.length - 1];
      if (top && meta) top.meta = { ...(top.meta || {}), ...meta };
    },
    breakCoalesce() { open = null; },
    clear() { undoStack = []; redoStack = []; open = null; lastSnap = null; },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    size: () => ({ undo: undoStack.length, redo: redoStack.length })
  };
}

export default { createHistory, snapshotOf, restoreElements, cloneElement, sameElement, sameSnapshot };
