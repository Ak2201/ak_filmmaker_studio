/* ============================================================
   SCENE SYNC — the script drives the scene list
   ------------------------------------------------------------
   docs/BLUEPRINT-REALIGN-PLAN.md, revision 3, §1d. Owner's decisions:
   a new scene heading adds its scene to the Breakdown AUTOMATICALLY;
   a heading removed from the script sends its scene and every
   dependent to the bin (src/lib/scene-bin.js), restorable.

   TWO HALVES. `reconcile()` is PURE: script elements and scene rows
   in, a plan out, nothing read from storage and nothing written.
   `applySync()` carries a plan out through scenes.js and the bin. The
   Write page runs both after a script save (src/ui/handoff.js, called
   from write.js's scheduleDerived()), never on load and never on a
   timer of its own — verify asserts zero idle writes.

   THE LINK is `scene.scriptElId`, the heading element's stable id
   (src/lib/script.js). Rules, in the order the plan applies them:

     1. A LINKED row whose heading is still there keeps it. If the
        heading's text changed since the last sync, only the
        heading-derived fields follow it — INT/EXT (when the heading
        says one), time of day (when it names one), location, and the
        number (when the heading carries one). Synopsis, cast,
        elements, notes, eighths, the day and the marks are a person's
        and are never touched.
     2. A MOVE IS NOT A DELETE. A linked row whose heading id vanished,
        while a heading with the same text appeared in the same save,
        is relinked to it. Cut-and-paste, a revision restore and an
        import that replaces the script all look like this.
     3. A linked row whose heading is gone → the bin, with the heading
        text it had (so typing it again restores it).
     4. An unclaimed heading whose id, or whose exact text, a SCRIPT
        bin entry holds → restored. (Ctrl+Z in the field brings the id
        back; retyping brings the text.) Entries binned BY HAND are
        never restored automatically — somebody deleted that row on
        purpose.
     5. An unclaimed heading that matches an UNLINKED row confidently
        (matchScenes() 'heading' or 'location' tier) → linked, fields
        left as they are. This is the one-time linking of a project
        made before the link existed, and it is how a Story outline's
        placeholder scene or an imported scene list gets its heading.
        A 'position' guess links nothing and adds nothing: it is held.
     6. Anything left that is NEW since the last sync → a new row,
        placed after the row of the heading before it.

   TWO GUARDS, both about a save that looks like a catastrophe:
     · ZERO HEADINGS IS "NO SCRIPT", NOT "DELETE EVERY SCENE". A
       cleared editor, a failed load or a script that is all action
       bins nothing; the plan is empty and says `empty: true`.
     · A MASS REMOVAL STILL APPLIES, AND SAYS SO LOUDLY. When three or
       more rows, and more than half the linked rows, would go to the
       bin in one save, the plan carries `mass: true` and the page
       shows a toast that stays until dismissed, with Undo. Refusing
       would leave the Breakdown describing a script that no longer
       exists; applying silently would hide the one moment worth
       seeing. Nothing is lost either way — it is a bin.

   LOCKED NUMBERS (src/lib/script.js, sceneNumbers()). When the script's
   numbers are locked, `opts.numbering` carries the lock and the NUMBER
   of every linked row is the lock's — 12A for a heading inserted after
   12 — on every sync, not only when the heading's text changed, and a
   new row takes its locked number rather than the next integer free.
   That is how the Breakdown, the stripboard and the call sheets say
   12A without a second numbering of their own. Unlocked, numbers
   behave exactly as rule 1 says. `numberPatches()` / `applyNumbers()`
   carry the numbers alone, for the moment the lock is set or released
   (the headings have not changed, so a sync would not run).

   UNLINKED ROWS ARE NEVER TOUCHED except by rule 5's link, which
   writes `scriptElId` alone. A Breakdown with no script, or rows
   typed by hand with no heading to match, stay exactly as they are.
   ============================================================ */
import './store.js';   // must evaluate before anything reads localStorage
import Scenes from './scenes.js';
import { matchScenes, isConfident } from './screenplay-analysis.js';
import { parseSlug } from './script-import.js';
import { elementLines, LINES_PER_PAGE, sceneNumbers, isNumberingLocked } from './script.js';
import * as Bin from './scene-bin.js';

const norm = (t) => String(t ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
const textOf = (el) => String((el && el.text) ?? '').trim();

/** The script's headings, in order, the way sliceScript() counts them:
    a `scene` element with text. [{ id, text, at }] */
export function headingsOf(elements) {
  const out = [];
  (elements || []).forEach((el, at) => {
    if (!el || el.type !== 'scene') return;
    const text = textOf(el);
    if (text) out.push({ id: el.id, text, at });
  });
  return out;
}

/** A Map(id → text) of the headings, for `opts.prev` next time. */
export function headingMap(elements) {
  return new Map(headingsOf(elements).map((h) => [h.id, h.text]));
}

const asMap = (prev) => {
  if (!prev) return null;
  if (prev instanceof Map) return prev;
  if (Array.isArray(prev)) return new Map(prev.map((p) => (Array.isArray(p) ? p : [p.id, p.text])));
  return null;
};

const HAS_IE = /^(?:[A-Z]?\d+[A-Z]?[.)]?\s+)?(INT|EXT|EST|I\s*\/\s*E)\b/i;

/** The heading-derived fields of a row, as this heading says them. */
export function headingFields(text) {
  /* A heading is ONE line. A line break inside one (an old paste kept a
     whole scene in a heading) is not part of the slug: only the first
     line is read, so the rest never becomes the location. */
  text = String(text || '').split('\n').find((l) => l.trim()) || '';
  const p = parseSlug(text);
  const out = { location: p.location };
  if (HAS_IE.test(String(text).trim())) out.intExt = p.intExt;
  if (!p.guessedTime) out.dayNight = p.dayNight;
  if (p.number) out.number = p.number;
  return out;
}

/** Only the fields that differ from the row. Exported for the change report's
    "Update place and time" (docs/SCRIPT-LOCK.md §3); callers drop `number`. */
export function headingPatch(text, scene) {
  const f = headingFields(text);
  const patch = {};
  for (const k of ['intExt', 'dayNight', 'location', 'number']) {
    if (k in f && f[k] !== '' && String(f[k]) !== String(scene[k] ?? '')) patch[k] = f[k];
  }
  return patch;
}

/** Eighths of the slice under heading `at`, the importer's metric. */
function sliceEighths(elements, at) {
  let lines = elementLines({ type: 'scene', text: textOf(elements[at]) });
  for (let i = at + 1; i < elements.length; i++) {
    const el = elements[i];
    if (!el) continue;
    if (el.type === 'scene' && textOf(el)) break;
    lines += elementLines(el);
  }
  return Math.max(1, Math.round((lines / LINES_PER_PAGE) * 8));
}

/**
 * Page eighths, measured again from the script as it stands now.
 * The importer sets a scene's length once; a script edited since then
 * leaves the number behind. Returns [{ sceneId, from, to }] for the scenes
 * whose measured length differs, over pairs matched by CONTENT only, so a
 * row paired by position (a guess) is never re-measured. Pure: it writes
 * nothing, the caller applies and offers the undo.
 */
export function measureEighths(elements, scenes) {
  const heads = headingsOf(elements);
  const out = [];
  for (const { scene, slice, how } of matchScenes(scenes, elements).pairs) {
    if (!slice || !isConfident(how)) continue;
    const head = heads[slice.index];
    if (!head) continue;
    const to = sliceEighths(elements, head.at);
    if (Number(scene.eighths) !== to) out.push({ sceneId: scene.id, from: Number(scene.eighths) || 0, to });
  }
  return out;
}

/**
 * The plan. Pure.
 *   elements     the script's elements
 *   scenes       the scene rows (listScenes())
 *   opts.prev    Map(headingId → text) from the last sync, or null.
 *                With it, only headings new since then are added and
 *                only headings whose text changed update their row;
 *                without it every unmatched heading is new.
 *   opts.bin     the bin's entries (listBin())
 *   opts.numbering  the script's `numbering` (locked scene numbers), or none
 *   opts.held    true: the script is HELD (locked with a baseline revision,
 *                script.js isHeld()), passed explicitly and NEVER inferred, so
 *                the pipeline and the lock pass are unaffected. Only identity
 *                and numbers follow the script: a linked row keeps its fields
 *                (as keepLinked), a lost row also relinks to the heading that
 *                carries its locked number, and a gone heading or a new one is
 *                REPORTED in `pending` ({ add, omit }) instead of binned or
 *                added, for the change report to put to the writer.
 *   opts.keepLinked  true: a row already linked to a heading that is still
 *                there keeps its heading-derived fields as they are
 *                (a person may have renamed the place on the Breakdown);
 *                only a locked number still follows the lock. The
 *                script pipeline's "fill the blanks" run uses this.
 * Returns {
 *   add:     [{ headingId, text, after, before, row }]  row = blankScene patch
 *   update:  [{ id, patch }]
 *   bin:     [{ sceneId, heading }]
 *   restore: [{ entryId, headingId, patch }]
 *   held:    [headingId]   a positional guess: neither linked nor added
 *   pending: { add: [{ headingId, text, number }], omit: [{ sceneId, heading, number }] }
 *                always present; filled only when `opts.held`
 *   mass, empty, linked    flags and the count of linked rows
 * }
 */
export function reconcile(elements, scenes, opts = {}) {
  const plan = { add: [], update: [], bin: [], restore: [], held: [], mass: false, empty: false, linked: 0, ordinal: false, carriedNumber: false, pending: { add: [], omit: [] } };
  const els = elements || [];
  const rows = scenes || [];
  const heads = headingsOf(els);
  if (!heads.length) { plan.empty = true; return plan; }
  const prev = asMap(opts.prev);
  const isNew = (h) => !prev || !prev.has(h.id);
  const byId = new Map(heads.map((h) => [h.id, h]));
  const locked = isNumberingLocked(opts.numbering)
    ? sceneNumbers(els, opts.numbering).byId
    : null;
  plan.ordinal = !locked;
  // Held needs the lock's numbers to mean anything; without them it is today's sync.
  const holding = !!(opts.held && locked);
  const keepFields = !!(opts.keepLinked || holding);
  /* Locked, the number is the lock's and nothing else's: the heading's
     text cannot move it, and every linked row is told it each time. */
  const lockPatch = (headingId, scene, p) => {
    if (!locked) return p;
    const out = { ...p };
    delete out.number;
    const n = locked.get(headingId);
    if (n && String(n) !== String((scene && scene.number) ?? '')) out.number = n;
    return out;
  };
  const claimed = new Map();          // headingId -> sceneId
  const patches = new Map();          // sceneId -> patch
  const addPatch = (id, p) => {
    if (!Object.keys(p).length) return;
    patches.set(id, { ...(patches.get(id) || {}), ...p });
  };

  // 1. linked rows that keep their heading
  const linked = rows.filter((s) => s && s.scriptElId);
  plan.linked = linked.length;
  const lost = [];
  for (const s of linked) {
    const h = byId.get(s.scriptElId);
    if (h && !claimed.has(h.id)) {
      claimed.set(h.id, s.id);
      const p = !keepFields && (!prev || prev.get(h.id) !== h.text) ? headingPatch(h.text, s) : {};
      addPatch(s.id, lockPatch(h.id, s, p));
    } else lost.push(s);
  }

  // 2. moves: the same text under a new id, in the same save
  for (const s of lost) {
    const was = prev ? (prev.get(s.scriptElId) || '') : '';
    /* With no record of the old text, the row's own heading fields
       stand in for it: an unclaimed heading that says exactly the
       row's INT/EXT, place and time is the same heading, moved. */
    const sameAsRow = (x) => {
      const f = headingFields(x.text);
      return norm(f.location) === norm(s.location) && f.intExt === s.intExt && f.dayNight === s.dayNight;
    };
    const h = heads.find((x) => !claimed.has(x.id) && isNew(x)
      && (was ? norm(x.text) === norm(was) : !prev && sameAsRow(x)));
    /* Held only: a restore or a cut-and-paste after a settle gives the
       heading a new id AND may have changed its words, but the lock's number
       is the scene's identity, so the row follows its number. */
    const byNumber = h || !holding ? null : heads.find((x) => !claimed.has(x.id)
      && String(locked.get(x.id) || '').toUpperCase() === String(s.number ?? '').trim().toUpperCase()
      && String(s.number ?? '').trim());
    const target = h || byNumber;
    if (target) {
      claimed.set(target.id, s.id);
      addPatch(s.id, lockPatch(target.id, s, { scriptElId: target.id }));
    } else if (holding) {
      // 3. (held) gone: the writer decides, nothing is binned behind their back
      plan.pending.omit.push({ sceneId: s.id, heading: was || '', number: String(s.number ?? '') });
    } else {
      // 3. gone
      plan.bin.push({ sceneId: s.id, heading: was || '' });
    }
  }

  // 4. restores from the bin — script entries only
  const present = new Set(rows.map((s) => s && s.id));
  const entries = (opts.bin || []).filter((e) => e && e.reason === 'script'
    && e.scene && e.scene.row && !present.has(e.scene.row.id));
  const usedEntries = new Set();
  const restoredBy = new Map();       // headingId -> entry
  for (const h of holding ? [] : heads) {   // held: nothing comes back by itself
    if (claimed.has(h.id)) continue;
    let e = entries.find((x) => !usedEntries.has(x.id) && x.scene.row.scriptElId === h.id);
    if (!e) e = entries.find((x) => !usedEntries.has(x.id) && x.heading && norm(x.heading) === norm(h.text));
    if (!e) continue;
    usedEntries.add(e.id);
    restoredBy.set(h.id, e);
    const row = e.scene.row;
    const patch = row.scriptElId === h.id ? {} : { scriptElId: h.id };
    if (norm(e.heading) !== norm(h.text)) Object.assign(patch, headingPatch(h.text, { ...Scenes.blankScene(), ...row }));
    if (locked) {
      delete patch.number;
      Object.assign(patch, lockPatch(h.id, row, {}));
    }
    plan.restore.push({ entryId: e.id, headingId: h.id, patch });
  }

  // 5. confident matches with unlinked rows
  const unlinked = rows.filter((s) => s && !s.scriptElId);
  const open = heads.filter((h) => !claimed.has(h.id) && !restoredBy.has(h.id));
  if (unlinked.length && open.length) {
    const openIds = new Set(open.map((h) => h.id));
    // The other headings come out of the join, so a row cannot pair
    // with a heading another row already owns.
    const sub = els.filter((el) => !(el && el.type === 'scene' && textOf(el) && !openIds.has(el.id)));
    const order = headingsOf(sub);        // slice j <-> order[j]
    const m = matchScenes(unlinked, sub);
    const sliceIndex = new Map(m.slices.map((sl, j) => [sl, j]));
    for (const p of m.pairs) {
      if (!p.slice) continue;
      const h = order[sliceIndex.get(p.slice)];
      if (!h || claimed.has(h.id)) continue;
      if (isConfident(p.how)) {
        claimed.set(h.id, p.scene.id);
        addPatch(p.scene.id, lockPatch(h.id, p.scene, { scriptElId: h.id }));
      } else {
        plan.held.push(h.id);
      }
    }
  }

  // 6. new headings → new rows, numbered and placed
  const held = new Set(plan.held);
  const taken = new Set(rows.map((s) => String((s && s.number) || '').trim().toUpperCase()).filter(Boolean));
  for (const r of plan.restore) {
    const n = String(r.patch.number || (entries.find((e) => e.id === r.entryId) || { scene: { row: {} } }).scene.row.number || '').trim().toUpperCase();
    if (n) taken.add(n);
  }
  let top = rows.reduce((n, s) => Math.max(n, parseInt(s && s.number, 10) || 0), 0);
  const owner = (h) => claimed.get(h.id) || (restoredBy.get(h.id) ? restoredBy.get(h.id).scene.row.id : null);
  let lastAnchor = null;              // { kind: 'scene'|'add', id }
  heads.forEach((h, k) => {
    const sceneId = owner(h);
    if (sceneId) { lastAnchor = { kind: 'scene', id: sceneId }; return; }
    if (held.has(h.id) || !isNew(h)) return;
    if (holding) {
      plan.pending.add.push({ headingId: h.id, text: h.text, number: String(locked.get(h.id) || '') });
      return;
    }
    const f = headingFields(h.text);
    let number = String((locked && locked.get(h.id)) || f.number || '').trim();
    if (!locked && (!number || taken.has(number.toUpperCase()))) {
      do { top++; } while (taken.has(String(top)));
      number = String(top);
    }
    taken.add(number.toUpperCase());
    top = Math.max(top, parseInt(number, 10) || 0);
    let before = null;
    for (let j = k + 1; j < heads.length && !before; j++) before = owner(heads[j]);
    const p = parseSlug(h.text);
    plan.add.push({
      headingId: h.id,
      text: h.text,
      after: lastAnchor,
      before,
      row: {
        number,
        intExt: p.intExt,
        dayNight: p.dayNight,
        location: p.location,
        eighths: sliceEighths(els, h.at),
        scriptElId: h.id
      }
    });
    if (!locked && f.number) plan.carriedNumber = true;
    lastAnchor = { kind: 'add', id: h.id };
  });

  for (const [id, patch] of patches) plan.update.push({ id, patch });
  plan.mass = plan.bin.length >= 3 && plan.bin.length * 2 > plan.linked;
  return plan;
}

/**
 * The number every LINKED row should carry, as patches — the lock's
 * numbers when `numbering` is locked, the headings' positions when it
 * is not (which is what "unlock and renumber" asks for). Rows typed by
 * hand, with no heading, are never in it. PURE.
 *   → [{ id, patch: { number } }]
 */
export function numberPatches(elements, scenes, numbering) {
  const nums = sceneNumbers(elements, isNumberingLocked(numbering) ? numbering : null).byId;
  const out = [];
  for (const s of scenes || []) {
    if (!s || !s.scriptElId) continue;
    const n = nums.get(s.scriptElId);
    if (n && String(n) !== String(s.number ?? '')) out.push({ id: s.id, patch: { number: n } });
  }
  return out;
}

/** numberPatches() against what is stored, written. Returns the count. */
export function applyNumbers(elements, numbering) {
  const list = Scenes.listScenes();
  const patches = numberPatches(elements, list, numbering);
  if (!patches.length) return 0;
  const byId = new Map(list.map((s) => [s.id, s]));
  for (const p of patches) Object.assign(byId.get(p.id), p.patch);
  Scenes.saveScenes(list);
  return patches.length;
}

/**
 * Unlocked, scene numbers follow script order. A heading typed ABOVE
 * existing scenes is numbered by the next-free rule (max + 1), which left
 * it last in number and first in the list (3, 1, 2). When the rows that
 * were already there carry plain whole numbers rising in list order, no
 * person's number is in them, so the whole list is renumbered 1..n+k.
 * Anything else (12A, a list out of order) is somebody's and stays: the
 * new row keeps the number it was given. Returns true when it renumbered.
 * Locked numbers never come here; the lock numbers every linked row.
 */
export function renumberInOrder(list, newIds) {
  const before = list.filter((s) => s && !newIds.has(s.id));
  /* Only the plain run 1..n in list order is the app's own numbering, so
     only that is renumbered. A gap (1, 3, or an imported 1 … 12) may be a
     number somebody chose, and so may 12A or a reordered list: those stay,
     and a new row is numbered after the highest in use (test:sync holds this
     rule). Locking scene numbers is how a writer pins them for good. */
  const plain = before.every((s, i) => String(s.number ?? '').trim() === String(i + 1));
  if (!plain) return false;
  list.forEach((s, i) => { if (s) s.number = String(i + 1); });
  return true;
}

/** True when a plan would change anything. */
export const isEmptyPlan = (p) => !p || (!p.add.length && !p.update.length && !p.bin.length && !p.restore.length);

/**
 * Carry a plan out. Restores first (so a restored row can anchor an
 * add), then the field updates in one write, then the bin, then the
 * adds in one write. Returns { added: [row], binned: [entry],
 * restored: [row], updated: n }.
 */
export function applySync(plan) {
  const out = { added: [], binned: [], restored: [], updated: 0 };
  if (isEmptyPlan(plan)) return out;

  if (plan.restore.length) {
    const patchOf = new Map(plan.restore.map((r) => [r.entryId, r.patch]));
    out.restored = Bin.restoreMany(plan.restore.map((r) => r.entryId),
      (id) => (Object.keys(patchOf.get(id) || {}).length ? { patch: patchOf.get(id) } : {}));
  }

  if (plan.update.length) {
    const list = Scenes.listScenes();
    const byId = new Map(list.map((s) => [s.id, s]));
    for (const u of plan.update) {
      const s = byId.get(u.id);
      if (!s) continue;
      Object.assign(s, u.patch, { id: s.id });
      out.updated++;
    }
    if (out.updated) Scenes.saveScenes(list);
  }

  for (const b of plan.bin) {
    const e = Bin.binScene(b.sceneId, { reason: 'script', heading: b.heading });
    if (e) out.binned.push(e);
  }

  if (plan.add.length) {
    const list = Scenes.listScenes();
    const madeFor = new Map();        // headingId -> row id
    for (const a of plan.add) {
      const row = Scenes.blankScene(a.row);
      let at = -1;
      if (a.after) {
        const id = a.after.kind === 'add' ? madeFor.get(a.after.id) : a.after.id;
        const i = list.findIndex((s) => s.id === id);
        if (i >= 0) at = i + 1;
      }
      if (at < 0 && a.before) {
        const i = list.findIndex((s) => s.id === a.before);
        if (i >= 0) at = i;
      }
      if (at < 0) at = list.length;
      list.splice(at, 0, row);
      madeFor.set(a.headingId, row.id);
      out.added.push(row);
    }
    if (plan.ordinal && !plan.carriedNumber) renumberInOrder(list, new Set(out.added.map((r) => r.id)));
    Scenes.saveScenes(list);
  }
  return out;
}

/** reconcile() + applySync() against what is stored now.
 *  opts.keepLinked, opts.held  see reconcile().
 *  opts.fillOnly    keepLinked, AND a plan that would bin or restore a
 *                   row is not applied at all: `{ plan, result, refused:
 *                   true }` with an empty result. Binning moves a scene's
 *                   shots, sheets and edit notes with it, which a "fill
 *                   the blanks" run must never do behind somebody's back. */
export function syncScript(elements, opts = {}) {
  const keepLinked = !!(opts.keepLinked || opts.fillOnly);
  const plan = reconcile(elements, Scenes.listScenes(), { prev: opts.prev, bin: Bin.listBin(), numbering: opts.numbering, keepLinked, held: opts.held });
  if (opts.fillOnly && (plan.bin.length || plan.restore.length)) {
    return { plan, refused: true, result: { added: [], binned: [], restored: [], updated: 0 } };
  }
  return { plan, result: applySync(plan) };
}

/**
 * A subset of a plan for ONE item of the change report. PURE.
 *   sel.headingId  the add / restore entries for that heading, and the update
 *                  of the row linked to it
 *   sel.sceneId    the bin entry for that scene, and that row's update
 * Flags are copied; `mass` is false (one item is never a mass removal).
 */
export function planFor(plan, sel = {}) {
  const { headingId, sceneId } = sel;
  const rowOf = new Set();
  const add = headingId ? plan.add.filter((a) => a.headingId === headingId) : [];
  const restore = headingId ? plan.restore.filter((r) => r.headingId === headingId) : [];
  const bin = sceneId ? plan.bin.filter((b) => b.sceneId === sceneId) : [];
  if (sceneId) rowOf.add(sceneId);
  const update = plan.update.filter((u) => rowOf.has(u.id) || (headingId && u.patch.scriptElId === headingId));
  return { ...plan, add, update, bin, restore, held: [], pending: { add: [], omit: [] }, mass: false };
}

/** The writer pressed an action on one report item: reconcile with today's
    rules (not held, fields kept), keep only that item's part, apply it. */
export function applyFor(elements, numbering, sel) {
  const plan = reconcile(elements, Scenes.listScenes(), { numbering, bin: Bin.listBin(), keepLinked: true });
  return applySync(planFor(plan, sel));
}

export default { planFor, applyFor, headingPatch, renumberInOrder, measureEighths, headingsOf, headingMap, headingFields, reconcile, isEmptyPlan, applySync, syncScript, numberPatches, applyNumbers };
