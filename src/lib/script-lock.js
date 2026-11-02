/* ============================================================
   SCRIPT LOCK — the model behind "Lock the script" and the change report
   ------------------------------------------------------------
   docs/SCRIPT-LOCK.md is the contract (sections 1, 3 and 4). The lock IS
   the scene-number lock already in the script blob (`numbering`,
   script.js); it gains two optional fields, `base` (the id of the draft
   that IS the locked script) and `reviewed` (the change report's marks).
   Nothing here adds a key: every fact is a field on the blob's own
   records.

   Three states, DERIVED and stored nowhere (lockState()):
     draft    no lock
     locked   a lock with a baseline draft — the script is HELD: the scene
              sync stops binning and adding and reports instead, the
              baseline draft is protected, and changeReport() has
              something to compare against
     legacy   a lock taken before the baseline existed. It reads as
              locked and nothing is written on any read; startTracking()
              is the one act that gives it a baseline.

   PURE like drafts.js: the writers (takeLock, startTracking) mutate the
   doc they are handed and the CALLER saves; changeReport() reads the
   scene rows, shots and call sheets it is given (injected, never read
   from storage here) and writes nothing. No document, no DOM.

   THE LOCK PASS DOES NOT LIVE HERE. takeLock() only locks numbers and
   picks the baseline; the extraction pass that fills the Breakdown is
   script-pipeline.js, run by the page afterwards. Phase 2 adds steps
   there and this file never names one.
   ============================================================ */
import {
  isNumberingLocked, isHeld, lockNumbering, sceneNumbers, cueSpeaker,
  compareSceneNumbers, parseSceneNumber
} from './script.js';
import { latestDraft, nextDraftNumber, saveNewDraft, changedSinceDraft, hashElements } from './drafts.js';
import { diffElements, groupByScene } from './script-diff.js';
import { issuedColour } from './script-incoming.js';
import { headingsOf, measureEighths, reconcile, headingFields } from './scene-sync.js';
import { shootDayOf } from './locations.js';
import { lockPreset } from './stripboard-model.js';

export const LOCK_NOTE = 'Locked script';

const norm = (t) => String(t ?? '').trim().replace(/\s+/g, ' ').toUpperCase();
const revs = (doc) => (doc && Array.isArray(doc.revisions) ? doc.revisions : []);

/** The baseline draft as the UI names it, or null. */
function describeBase(doc) {
  const id = doc && doc.numbering && doc.numbering.base;
  if (!id) return null;
  const list = revs(doc);
  const i = list.findIndex((r) => r && r.id === id);
  if (i < 0) return null;
  const r = list[i];
  const label = Number.isFinite(r.number) && r.number > 0 ? 'Draft ' + r.number : (r.name || 'Draft ' + (i + 1));
  return { id, label, colour: issuedColour(list, i) };
}

/**
 * Where the script stands. PURE.
 *   → { state: 'draft'|'locked'|'legacy', at, base: { id, label, colour }|null,
 *       baseMissing, colour }
 * `colour` is the latest issued draft's (name + swatch) or null: the
 * "current revision colour" the soft-gate bar prints.
 */
export function lockState(doc) {
  const n = doc && doc.numbering;
  const latest = latestDraft(doc || {});
  const colour = latest && !latest.side ? latest.colour : null;
  if (!isNumberingLocked(n)) return { state: 'draft', at: '', base: null, baseMissing: false, colour };
  if (!isHeld(n)) return { state: 'legacy', at: String(n.at || ''), base: null, baseMissing: false, colour };
  const base = describeBase(doc);
  return { state: 'locked', at: String(n.at || ''), base, baseMissing: !base, colour };
}

/**
 * What locking would do, for the review sheet. PURE.
 *   byCategory  planPipeline()'s props row `byCategory` (element suggestions)
 *   scenes      the Breakdown rows, optional: only needed to tell whether the
 *               rows' own numbers would be kept ('rows')
 * numbering mirrors lockNumbering()'s order of preference: the rows' numbers
 * when they run in script order, else the numbers the headings carry, else
 * position.
 */
export function lockPreview(doc, byCategory = {}, scenes = []) {
  const els = (doc && doc.elements) || [];
  const heads = headingsOf(els);
  const cast = new Set();
  const places = new Set();
  for (const e of els) {
    if (e && e.type === 'character') { const c = cueSpeaker(e.text); if (c) cast.add(c); }
  }
  for (const h of heads) { const p = norm(headingFields(h.text).location); if (p) places.add(p); }
  const cats = byCategory || {};
  const extras = Number(cats.extras) || 0;
  const elements = Object.entries(cats).reduce((n, [k, v]) => (k === 'extras' ? n : n + (Number(v) || 0)), 0);

  let how = 'position';
  const preset = lockPreset(scenes || []);
  const list = heads.map((h) => String(preset.get(h.id) || '').trim().toUpperCase());
  const ascending = list.every((n, i) => !i || compareSceneNumbers(list[i - 1], n) < 0);
  if (heads.length && list.every(Boolean) && new Set(list).size === list.length && ascending
    && list.every((n) => parseSceneNumber(n))) how = 'rows';
  else {
    const ids = lockNumbering(els, null).ids;
    if (heads.some((h, i) => (ids[h.id] || {}).n !== String(i + 1))) how = 'text';
  }
  const reuse = !changedSinceDraft(doc || {}) ? latestDraft(doc || {}) : null;
  return {
    scenes: heads.length, numbering: how, cast: cast.size, locations: places.size, elements, extras,
    baseline: { reuse: reuse ? reuse.label : null, next: 'Draft ' + nextDraftNumber(doc || { revisions: [] }) }
  };
}

/* The baseline: the latest draft when the working copy is still that draft,
   else one new draft saved now. Never overwrites a draft. */
function chooseBase(doc) {
  if (!changedSinceDraft(doc)) {
    const last = latestDraft(doc);
    if (last) return { baseId: last.id, savedDraft: null };
  }
  const d = saveNewDraft(doc, { note: LOCK_NOTE });
  return { baseId: d.id, savedDraft: d };
}

/**
 * Take the lock. MUTATES `doc`; the caller saves. `scenes` are the Breakdown
 * rows whose numbers a lock keeps (lockPreset). Returns
 * { baseId, savedDraft } (savedDraft null when an unchanged latest draft was
 * reused), or null when the script has no headings — nothing is touched then.
 */
export function takeLock(doc, scenes) {
  if (!doc || !headingsOf(doc.elements).length) return null;
  const { baseId, savedDraft } = chooseBase(doc);
  doc.numbering = { ...lockNumbering(doc.elements, lockPreset(scenes || [])), base: baseId };
  return { baseId, savedDraft };
}

/**
 * Give a legacy lock its baseline (reuse or save a draft; the numbers stay as
 * they are). MUTATES `doc`; returns the base id, or null when there is no
 * lock to track.
 */
export function startTracking(doc) {
  if (!doc || !isNumberingLocked(doc.numbering) || !headingsOf(doc.elements).length) return null;
  const { baseId } = chooseBase(doc);
  doc.numbering = { ...doc.numbering, base: baseId };
  return baseId;
}

/* The live script's slice for one heading: the heading to the next heading. */
function liveSlice(els, headingId) {
  const from = els.findIndex((e) => e && e.id === headingId);
  if (from < 0) return [];
  let to = els.length;
  for (let i = from + 1; i < els.length; i++) {
    if (els[i] && els[i].type === 'scene' && String(els[i].text ?? '').trim()) { to = i; break; }
  }
  return els.slice(from, to);
}
const livePre = (els) => {
  const i = els.findIndex((e) => e && e.type === 'scene' && String(e.text ?? '').trim());
  return i < 0 ? els : els.slice(0, i);
};

/**
 * What changed since the lock, scene by scene, and what each touches
 * downstream. PURE: scenes, shots and callSheets are INJECTED; nothing is
 * stored. See docs/SCRIPT-LOCK.md §3 for the item shape.
 *
 * The identity of an item is the scene's LOCKED NUMBER (upper case; '_PRE' for
 * the lines before the first heading), not an element id: ids are renewed by a
 * draft restore and by cut-and-paste, the number is what the call sheets say.
 * `sig` (hashElements of the live scene, or 'omitted') is what a "reviewed"
 * mark is compared with, so editing a scene again brings it back.
 */
export function changeReport(doc, { scenes = [], shots = [], callSheets = [] } = {}) {
  const empty = (base, baseMissing) => ({ base, baseMissing, items: [], open: 0, total: 0 });
  const n = doc && doc.numbering;
  if (!isHeld(n)) return empty(null, false);
  const base = describeBase(doc);
  if (!base) return empty(null, true);
  const baseRev = revs(doc).find((r) => r && r.id === base.id);
  const els = (doc.elements || []).filter(Boolean);
  const diff = diffElements(baseRev.elements || [], els);
  const nums = sceneNumbers(els, n).byId;
  const rows = scenes || [];
  const reviewedMap = n.reviewed || {};
  const eighths = new Map(measureEighths(els, rows).map((m) => [m.sceneId, m]));
  const pending = reconcile(els, rows, { held: true, numbering: n }).pending;

  const items = [];
  for (const g of groupByScene(diff)) {
    const op = g.ops[0] || {};
    const pre = !g.heading && !g.headingId && !(op.a && op.a.type === 'scene') && !(op.b && op.b.type === 'scene');
    let kind = 'changed';
    if (g.headingOp === 'added') kind = 'added';
    else if (g.headingOp === 'removed') kind = 'omitted';
    const headingId = kind === 'omitted' ? null : (g.headingId || null);
    const baseHeadingId = kind === 'added' || pre ? null : ((op.a && (op.a.liveId || op.a.id)) || null);
    let number = '';
    if (pre) number = '';
    else if (kind === 'omitted') {
      const ids = n.ids || {};
      const hit = (baseHeadingId && ids[baseHeadingId])
        || Object.values(ids).find((e) => norm(e.t) === norm(g.heading));
      number = hit ? String(hit.n).toUpperCase() : '';
    } else number = String(nums.get(headingId) || '').toUpperCase();
    const key = pre ? '_PRE' : (number || '_' + norm(g.heading));
    const sig = kind === 'omitted' ? 'omitted' : hashElements(pre ? livePre(els) : liveSlice(els, headingId));

    const linkId = kind === 'omitted' ? baseHeadingId : headingId;
    const row = pre ? null : (rows.find((s) => s && linkId && s.scriptElId === linkId)
      || (number ? rows.find((s) => s && String(s.number ?? '').trim().toUpperCase() === number) : null)
      || null);
    const sceneId = row ? row.id : null;

    const day = row ? shootDayOf(row) : 0;
    const dayAlone = !!(day && !rows.some((s) => s && s.id !== row.id && shootDayOf(s) === day));
    const sheets = row
      ? (callSheets || []).filter((c) => c && Array.isArray(c.sceneIds) && c.sceneIds.includes(row.id))
        .map((c) => ({ id: c.id, title: c.title || '', date: c.date || '' }))
      : [];
    const m = row && kind !== 'omitted' ? eighths.get(row.id) : null;
    let budget = 'none';
    if (kind === 'omitted' && dayAlone) budget = 'may-drop';
    else if (kind === 'added' && (!row || !day)) budget = 'not-counted';

    const pend = pre ? null
      : kind === 'added' && pending.add.some((a) => a.headingId === headingId) ? 'add'
        : kind === 'omitted' && sceneId && pending.omit.some((o) => o.sceneId === sceneId) ? 'omit' : null;

    items.push({
      key, number, kind, heading: g.heading, headingId, baseHeadingId,
      headingChanged: g.headingOp === 'changed', moved: g.headingOp === 'moved',
      counts: g.counts, sig, reviewed: reviewedMap[key] === sig, sceneId, pending: pend,
      impact: {
        shots: sceneId ? (shots || []).filter((s) => s && s.sceneId === sceneId).length : 0,
        day, dayAlone, sheets, sides: day > 0, budget,
        eighths: m ? { row: m.from, script: m.to } : null
      }
    });
  }
  /* A scene cut and pasted elsewhere renews its element ids, so the diff reads
     it as the old heading omitted AND a new one added, both under the same
     locked number. Review marks are keyed by number, so the two could never
     both be reviewed, and the omitted one would claim the scene's row had
     nothing to film. Fold the pair into ONE item: the scene moved. */
  const folded = [];
  for (const it of items) {
    const twin = it.number && it.kind === 'omitted'
      ? items.find((o) => o !== it && o.kind === 'added' && o.key === it.key) : null;
    if (twin) continue;   // carried by its twin below
    const gone = it.number && it.kind === 'added'
      ? items.find((o) => o !== it && o.kind === 'omitted' && o.key === it.key) : null;
    if (!gone) { folded.push(it); continue; }
    folded.push({
      ...it, kind: 'changed', moved: true, baseHeadingId: gone.baseHeadingId,
      reviewed: reviewedMap[it.key] === it.sig,
      impact: { ...it.impact, budget: 'none' }
    });
  }
  const open = folded.filter((i) => !i.reviewed).length;
  return { base, baseMissing: false, items: folded, open, total: folded.length };
}

/**
 * Mark items reviewed. PURE: returns a NEW numbering object with
 * reviewed[key] = the item's signature for each of `keys`, and every key with
 * no item in `items` dropped (pruned only here, when marks are WRITTEN, never
 * on a read). `reviewed` is removed when empty.
 */
export function markReviewed(numbering, items, keys) {
  const list = items || [];
  const present = new Map(list.map((i) => [i.key, i.sig]));
  const reviewed = {};
  for (const [k, v] of Object.entries((numbering && numbering.reviewed) || {})) if (present.has(k)) reviewed[k] = v;
  for (const k of keys || []) if (present.has(k)) reviewed[k] = present.get(k);
  const out = { ...numbering };
  if (Object.keys(reviewed).length) out.reviewed = reviewed; else delete out.reviewed;
  return out;
}

/**
 * What releasing the lock means, in numbers, for the confirm dialog. PURE.
 *   → { scenes, omitted, open, adds, bins, shotsBinned, pagesLocked }
 * adds / bins are what the live sync does the moment the lock is gone
 * (reconcile with no numbering). `shots` (optional) lets the dialog say how
 * many shots go to the bin with their scenes.
 */
export function unlockSummary(doc, scenes, bin, shots = []) {
  const n = doc && doc.numbering;
  const els = (doc && doc.elements) || [];
  const plan = reconcile(els, scenes || [], { numbering: null, keepLinked: true, bin: bin || [] });
  const binned = new Set(plan.bin.map((b) => b.sceneId));
  return {
    scenes: headingsOf(els).length,
    omitted: isNumberingLocked(n) ? sceneNumbers(els, n).omitted.length : 0,
    open: isHeld(n) ? changeReport(doc, { scenes, shots: [], callSheets: [] }).open : 0,
    adds: plan.add.length,
    bins: plan.bin.length,
    shotsBinned: (shots || []).filter((s) => s && binned.has(s.sceneId)).length,
    pagesLocked: !!(n && n.pages && n.pages.locked)
  };
}

export default { LOCK_NOTE, lockState, lockPreview, takeLock, startTracking, changeReport, markReviewed, unlockSummary };
