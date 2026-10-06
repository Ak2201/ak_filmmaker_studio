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

   UNLINKED ROWS ARE NEVER TOUCHED except by rule 5's link, which
   writes `scriptElId` alone. A Breakdown with no script, or rows
   typed by hand with no heading to match, stay exactly as they are.
   ============================================================ */
import './store.js';   // must evaluate before anything reads localStorage
import Scenes from './scenes.js';
import { matchScenes, isConfident } from './screenplay-analysis.js';
import { parseSlug } from './script-import.js';
import { elementLines, LINES_PER_PAGE } from './script.js';
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
  const p = parseSlug(text);
  const out = { location: p.location };
  if (HAS_IE.test(String(text).trim())) out.intExt = p.intExt;
  if (!p.guessedTime) out.dayNight = p.dayNight;
  if (p.number) out.number = p.number;
  return out;
}

/** Only the fields that differ from the row. */
function fieldPatch(text, scene) {
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
 * The plan. Pure.
 *   elements     the script's elements
 *   scenes       the scene rows (listScenes())
 *   opts.prev    Map(headingId → text) from the last sync, or null.
 *                With it, only headings new since then are added and
 *                only headings whose text changed update their row;
 *                without it every unmatched heading is new.
 *   opts.bin     the bin's entries (listBin())
 * Returns {
 *   add:     [{ headingId, text, after, before, row }]  row = blankScene patch
 *   update:  [{ id, patch }]
 *   bin:     [{ sceneId, heading }]
 *   restore: [{ entryId, headingId, patch }]
 *   held:    [headingId]   a positional guess: neither linked nor added
 *   mass, empty, linked    flags and the count of linked rows
 * }
 */
export function reconcile(elements, scenes, opts = {}) {
  const plan = { add: [], update: [], bin: [], restore: [], held: [], mass: false, empty: false, linked: 0 };
  const els = elements || [];
  const rows = scenes || [];
  const heads = headingsOf(els);
  if (!heads.length) { plan.empty = true; return plan; }
  const prev = asMap(opts.prev);
  const isNew = (h) => !prev || !prev.has(h.id);
  const byId = new Map(heads.map((h) => [h.id, h]));
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
      if (!prev || prev.get(h.id) !== h.text) addPatch(s.id, fieldPatch(h.text, s));
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
    if (h) {
      claimed.set(h.id, s.id);
      addPatch(s.id, { scriptElId: h.id });
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
  for (const h of heads) {
    if (claimed.has(h.id)) continue;
    let e = entries.find((x) => !usedEntries.has(x.id) && x.scene.row.scriptElId === h.id);
    if (!e) e = entries.find((x) => !usedEntries.has(x.id) && x.heading && norm(x.heading) === norm(h.text));
    if (!e) continue;
    usedEntries.add(e.id);
    restoredBy.set(h.id, e);
    const row = e.scene.row;
    const patch = row.scriptElId === h.id ? {} : { scriptElId: h.id };
    if (norm(e.heading) !== norm(h.text)) Object.assign(patch, fieldPatch(h.text, { ...Scenes.blankScene(), ...row }));
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
        addPatch(p.scene.id, { scriptElId: h.id });
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
    const f = headingFields(h.text);
    let number = String(f.number || '').trim();
    if (!number || taken.has(number.toUpperCase())) {
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
    lastAnchor = { kind: 'add', id: h.id };
  });

  for (const [id, patch] of patches) plan.update.push({ id, patch });
  plan.mass = plan.bin.length >= 3 && plan.bin.length * 2 > plan.linked;
  return plan;
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
    Scenes.saveScenes(list);
  }
  return out;
}

/** reconcile() + applySync() against what is stored now. */
export function syncScript(elements, opts = {}) {
  const plan = reconcile(elements, Scenes.listScenes(), { prev: opts.prev, bin: Bin.listBin() });
  return { plan, result: applySync(plan) };
}

export default { headingsOf, headingMap, headingFields, reconcile, isEmptyPlan, applySync, syncScript };
