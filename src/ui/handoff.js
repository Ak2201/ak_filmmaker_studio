/* ============================================================
   THE PRODUCTION HAND-OFF — Write tells the Breakdown what is new
   ------------------------------------------------------------
   docs/SCREENPLAY-WRITER-PLAN.md idea 18. After a writing session the
   script has scene headings the Breakdown's scene rows do not, and
   nothing says so until the 1st AD opens the stripboard and finds a
   hole. This is a quiet banner on write.html:

       3 new scenes since your last breakdown.  [Add them]  Open Breakdown →

   THE COUNT IS A JOIN, NOT A SUBTRACTION. "Headings minus rows" is
   wrong the first time a row is deleted on the breakdown or a heading
   is retyped, and both happen every week. matchScenes() in
   src/lib/screenplay-analysis.js already pairs every row with the
   heading that says the same place — the reports, the auto-tagger and
   the AI shot division all read it — so the banner reads it too, and a
   heading it could not pair is a "new" scene. A renamed heading that
   the join pairs by position is NOT new, which is the right answer.

   DERIVED, NEVER STORED. The banner is computed after a render and,
   debounced, once the writer stops typing; there is no "last seen" key
   and nothing here writes on its own. The one write is the click on
   "Add them", which goes through src/lib/scenes.js like every other
   writer of scene rows, and its Undo removes exactly the rows it added
   — by id, so a row the 1st AD typed in the meantime survives it.

   THE SCRIPT NOW DRIVES THE SCENES (BLUEPRINT-REALIGN-PLAN rev 3 §1d).
   `sceneSyncLater()` is called from write.js's scheduleDerived() and
   render(); once the writer pauses it runs src/lib/scene-sync.js
   against the page's in-memory script. A heading typed since the last
   sync adds its row; an edited heading updates the row's heading
   fields; a deleted one sends the row and everything hung on it to the
   bin (src/lib/scene-bin.js), each with a quiet toast and Undo. It
   compares the headings against the last sync's and does nothing at
   all when they have not changed — so it never writes on load and
   never on idle, which verify asserts. The baseline is taken when the
   page mounts: headings that were already there and are not in the
   Breakdown stay this banner's "Add them", because adding them by
   surprise on the first keystroke of a session is not what "a new
   heading adds its scene" means. The banner also counts the bin.
   ============================================================ */
import Scenes, { SCENES_KEY } from '../lib/scenes.js';
import { matchScenes } from '../lib/screenplay-analysis.js';
import { headingsOf, headingMap, reconcile, applySync, isEmptyPlan } from '../lib/scene-sync.js';
import * as Bin from '../lib/scene-bin.js';
import { elementLines, LINES_PER_PAGE } from '../lib/script.js';
import StudioUI from './chrome.js';
import { h, delegate } from '../lib/dom.js';

const BREAKDOWN_HREF = 'breakdown.html#scenes';
const IDLE_DELAY = 1200;
const SYNC_DELAY = 1200;

let getDoc = () => null;
let dismissedAt = -1;      // the count that "Not now" was said to; memory only
let busy = false;
let timer = 0;
let syncTimer = 0;
let syncPrev = null;       // Map(headingId -> text) at the last sync; memory only

/** The unmatched headings, in script order. Pure read. A heading a
    row is LINKED to (scene.scriptElId) is never new, whatever the
    content join makes of it. */
export function newHeadings(elements, scenes) {
  if (!elements || !elements.length) return [];
  const rows = scenes || Scenes.listScenes();
  const m = matchScenes(rows, elements);
  if (!m.slices.length) return [];
  const linked = new Set(rows.map((s) => s.scriptElId).filter(Boolean));
  if (!linked.size) return m.unmatchedHeadings;
  const ids = headingsOf(elements).map((x) => x.id);     // slice j <-> ids[j]
  const at = new Map(m.slices.map((sl, j) => [sl, j]));
  return m.unmatchedHeadings.filter((sl) => !linked.has(ids[at.get(sl)]));
}

function binNote(k) {
  return k === 1
    ? '1 scene removed from the script is in the bin, with everything that was attached to it.'
    : `${k} scenes removed from the script are in the bin, with everything that was attached to them.`;
}

function sentence(n, rows) {
  const s = n === 1 ? '' : 's';
  return rows
    ? `${n} new scene${s} since your last breakdown.`
    : `${n} scene${s} in this script ${n === 1 ? 'is' : 'are'} not in the Breakdown yet.`;
}

function render() {
  const section = document.getElementById('screenplay');
  const old = document.getElementById('wr-handoff');
  const doc = getDoc();
  if (!section || !doc) { if (old) old.remove(); return; }
  const scenes = Scenes.listScenes();
  const fresh = newHeadings(doc.elements, scenes);
  const n = fresh.length;
  const k = Bin.listBin().length;
  const sig = n + '|' + k;
  if ((!n && !k) || sig === dismissedAt) { if (old) old.remove(); return; }

  if (old && old.dataset.count === sig && old.dataset.rows === String(scenes.length > 0)) return;

  const copy = [];
  if (n) {
    copy.push(h('p.wx-handoff-msg', { text: sentence(n, scenes.length > 0) }));
    copy.push(h('p.wx-handoff-list', { text: fresh.slice(0, 3).map((s) => s.heading).join(' · ') + (n > 3 ? ' · …' : '') }));
  }
  if (k) copy.push(h(n ? 'p.wx-handoff-list' : 'p.wx-handoff-msg', { text: binNote(k) }));
  const acts = [];
  if (n) {
    acts.push(h('button.btn.primary', {
      type: 'button', 'data-action': 'handoff-add',
      text: n === 1 ? 'Add it to the Breakdown' : 'Add them to the Breakdown'
    }));
  }
  acts.push(h('a.btn', { href: BREAKDOWN_HREF, text: n ? 'Open Breakdown →' : 'Review the bin →' }));
  acts.push(h('button.btn.wx-quiet', { type: 'button', 'data-action': 'handoff-dismiss', text: 'Not now' }));
  const banner = h('aside.wx-handoff', {
    id: 'wr-handoff', role: 'status', 'aria-label': 'Breakdown hand-off',
    'data-count': sig, 'data-rows': String(scenes.length > 0)
  }, [
    h('div.wx-handoff-copy', {}, copy),
    h('div.wx-handoff-acts', {}, acts)
  ]);
  if (old) { old.replaceWith(banner); return; }
  const bar = section.querySelector('.wr-bar');
  if (bar) bar.after(banner);
  else section.append(banner);
}

/** Recompute once the writer has stopped. Idle, never inside a keystroke. */
function later() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(safeRender, { timeout: 1000 });
    else safeRender();
  }, IDLE_DELAY);
}
function safeRender() {
  try { render(); } catch (e) { console.warn('[handoff]', e); }
}

/** The rows for the unmatched headings, each placed after the row its
 *  preceding heading is paired with, so the Breakdown keeps script
 *  order. Numbers: the heading's own if it has one nobody holds, else
 *  the next number after the highest in use — never a guess at "12A". */
async function addThem() {
  if (busy) return;
  const doc = getDoc();
  if (!doc) return;
  busy = true;
  try {
    const { parseSlug } = await import('../lib/script-import.js');
    const scenes = Scenes.listScenes();
    const m = matchScenes(scenes, doc.elements);
    if (!m.unmatchedHeadings.length) { safeRender(); return; }
    const sceneOf = new Map(m.pairs.filter((p) => p.slice).map((p) => [p.slice, p.scene.id]));
    // Each new row is linked to its heading, so the script drives it
    // from here on (src/lib/scene-sync.js).
    const headIds = headingsOf(doc.elements).map((x) => x.id);
    const sliceAt = new Map(m.slices.map((sl, j) => [sl, j]));
    const fresh = new Set(m.unmatchedHeadings);
    const taken = new Set(scenes.map((s) => String(s.number || '').trim().toUpperCase()).filter(Boolean));
    let top = scenes.reduce((n, s) => Math.max(n, parseInt(s.number, 10) || 0), 0);
    const list = scenes.slice();
    const added = [];
    let after = null;          // the id of the row the next new one follows
    for (const slice of m.slices) {
      if (!fresh.has(slice)) { after = sceneOf.get(slice) || after; continue; }
      const parsed = parseSlug(slice.heading);
      let number = String(slice.number || parsed.number || '').trim();
      if (!number || taken.has(number.toUpperCase())) {
        do { top++; } while (taken.has(String(top)));
        number = String(top);
      }
      taken.add(number.toUpperCase());
      const lines = slice.elements.reduce((n, el) => n + elementLines(el), 0)
        + elementLines({ type: 'scene', text: slice.heading });
      const firstAction = slice.elements.find((el) => el.type === 'action');
      const row = Scenes.blankScene({
        number,
        intExt: parsed.intExt,
        dayNight: parsed.dayNight,
        location: parsed.location,
        eighths: Math.max(1, Math.round((lines / LINES_PER_PAGE) * 8)),
        synopsis: firstAction ? String(firstAction.text).replace(/\s+/g, ' ').trim().slice(0, 180) : '',
        scriptElId: headIds[sliceAt.get(slice)] || ''
      });
      const at = after ? list.findIndex((s) => s.id === after) + 1 : 0;
      list.splice(at, 0, row);
      added.push(row.id);
      after = row.id;
    }
    Scenes.saveScenes(list);
    dismissedAt = -1;
    safeRender();
    const n = added.length;
    const ids = new Set(added);
    StudioUI.toast(`Added ${n} scene${n === 1 ? '' : 's'} to the Breakdown.`, {
      type: 'success',
      action: 'Undo',
      onAction: () => {
        Scenes.saveScenes(Scenes.listScenes().filter((s) => !ids.has(s.id)));
        safeRender();
        StudioUI.toast(`Removed the ${n} scene${n === 1 ? '' : 's'} just added.`, { type: 'info' });
      }
    });
  } catch (e) {
    console.warn('[handoff] add', e);
    StudioUI.toast('The scenes could not be added. Nothing was changed.', { type: 'error' });
  } finally {
    busy = false;
  }
}

/* ---- the script drives the scenes ---------------------------- */

const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const sceneName = (row) => 'Scene ' + ((row && row.number) || '?');

function afterSync(res, plan) {
  const { added, binned, restored } = res;
  if (added.length) {
    const ids = added.map((r) => r.id);
    StudioUI.toast(added.length === 1
      ? `${sceneName(added[0])} added to the Breakdown.`
      : `${plural(added.length, 'scene')} added to the Breakdown.`, {
      type: 'success',
      action: 'Undo',
      onAction: () => {
        // Out of the list again; an entry with nothing attached is not
        // kept, one that gathered shots meanwhile stays restorable.
        for (const id of ids) {
          const e = Bin.binScene(id, { reason: 'hand' });
          if (!e) continue;
          const c = Bin.entryCounts(e);
          if (!c.shots && !c.frames && !c.sheets && !c.pickups && !c.edit) Bin.deleteBinEntry(e.id);
        }
        safeRender();
        StudioUI.toast('Taken out of the Breakdown. The heading stays in the script.', { type: 'info' });
      }
    });
  }
  if (binned.length) {
    const what = binned.length === 1
      ? Bin.describeEntry(binned[0])
      : `${plural(binned.length, 'scene')} (${plural(binned.reduce((n, e) => n + Bin.entryCounts(e).shots, 0), 'shot')})`;
    const ids = binned.map((e) => e.id);
    StudioUI.toast(plan.mass
      ? `${what} moved to the bin — their headings left the script in one change. Undo puts them back in the Breakdown.`
      : `${what} moved to the bin.`, {
      type: plan.mass ? 'error' : 'info',
      action: 'Undo',
      onAction: () => {
        const doc = getDoc();
        const here = new Set(doc ? headingsOf(doc.elements).map((x) => x.id) : []);
        // Back unlinked when its heading is not in the script, so the
        // next sync does not bin it straight away again.
        const byId = new Map(binned.map((e) => [e.id, e]));
        const back = Bin.restoreMany(ids, (id) => {
          const e = byId.get(id);
          return e && !here.has(e.scene.row.scriptElId) ? { patch: { scriptElId: '' } } : {};
        });
        safeRender();
        StudioUI.toast(`${plural(back.length, 'scene')} back in the Breakdown.`, { type: 'success' });
      }
    });
  }
  if (restored.length) {
    StudioUI.toast(restored.length === 1
      ? `${sceneName(restored[0])} is back in the Breakdown, with everything that was attached to it.`
      : `${plural(restored.length, 'scene')} back in the Breakdown from the bin.`, { type: 'success' });
  }
}

/** Run the sync now, if the headings changed since the last one. */
export function syncNow() {
  syncTimer = 0;
  const doc = getDoc();
  if (!doc || !Array.isArray(doc.elements)) return null;
  const cur = headingMap(doc.elements);
  if (!syncPrev) { syncPrev = cur; return null; }
  if (cur.size === syncPrev.size && [...cur].every(([id, t]) => syncPrev.get(id) === t)) return null;
  const plan = reconcile(doc.elements, Scenes.listScenes(), { prev: syncPrev, bin: Bin.listBin() });
  // An empty script is "no script": nothing planned, and the baseline
  // is kept, so headings that come back are not mistaken for new ones.
  if (plan.empty) return plan;
  syncPrev = cur;
  if (isEmptyPlan(plan)) return plan;
  const res = applySync(plan);
  afterSync(res, plan);
  safeRender();
  return plan;
}

/** After the writer pauses. Called from write.js's scheduleDerived(). */
export function sceneSyncLater() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    try { syncNow(); } catch (e) { console.warn('[handoff] sync', e); }
  }, SYNC_DELAY);
}

/** Wire the banner. `opts.getDoc` returns the page's in-memory script. */
export function mountHandoff(opts = {}) {
  if (typeof opts.getDoc === 'function') getDoc = opts.getDoc;
  // The baseline the first sync compares against: the script as loaded.
  try { const d = getDoc(); if (d && Array.isArray(d.elements)) syncPrev = headingMap(d.elements); } catch (e) { /* no doc yet */ }
  /* A sync still waiting on the writer's pause runs on the way out,
     the same as the save it follows. */
  addEventListener('pagehide', () => {
    if (!syncTimer) return;
    clearTimeout(syncTimer);
    try { syncNow(); } catch (e) { /* leaving */ }
  });
  const app = document.getElementById('app');
  // A full render replaces <main>; the banner follows it. childList on
  // #app only — a keystroke never touches that list.
  if (app && typeof MutationObserver === 'function') {
    new MutationObserver(safeRender).observe(app, { childList: true });
  }
  // Headings change by typing, by a type switch, by Return, by delete.
  delegate(document, 'input', '#wr-page .wr-text', (e, ta) => {
    if (ta.closest('.t-scene')) later();
  });
  delegate(document, 'change', '#wr-page select', later);
  delegate(document, 'click', '#wr-page [data-action^="el-"]', later);
  delegate(document, 'keydown', '#wr-page .wr-text', (e) => {
    if (e.key === 'Enter' || e.key === 'Backspace') later();
  });
  // The Breakdown open in another tab.
  addEventListener('storage', (e) => {
    if (!e.key || e.key.startsWith(SCENES_KEY)) later();
  });
  delegate(document, 'click', '[data-action="handoff-add"]', addThem);
  delegate(document, 'click', '[data-action="handoff-dismiss"]', () => {
    const b = document.getElementById('wr-handoff');
    dismissedAt = b ? b.dataset.count : -1;
    if (b) b.remove();
  });
  safeRender();
}

export default { mountHandoff, newHeadings, sceneSyncLater, syncNow };
