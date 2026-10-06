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
   ============================================================ */
import Scenes, { SCENES_KEY } from '../lib/scenes.js';
import { matchScenes } from '../lib/screenplay-analysis.js';
import { elementLines, LINES_PER_PAGE } from '../lib/script.js';
import StudioUI from './chrome.js';
import { h, delegate } from '../lib/dom.js';

const BREAKDOWN_HREF = 'breakdown.html#scenes';
const IDLE_DELAY = 1200;

let getDoc = () => null;
let dismissedAt = -1;      // the count that "Not now" was said to; memory only
let busy = false;
let timer = 0;

/** The unmatched headings, in script order. Pure read. */
export function newHeadings(elements, scenes) {
  if (!elements || !elements.length) return [];
  const m = matchScenes(scenes || Scenes.listScenes(), elements);
  return m.slices.length ? m.unmatchedHeadings : [];
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
  if (!n || n === dismissedAt) { if (old) old.remove(); return; }

  const text = sentence(n, scenes.length > 0);
  if (old && old.dataset.count === String(n) && old.dataset.rows === String(scenes.length > 0)) return;

  const names = fresh.slice(0, 3).map((s) => s.heading).join(' · ') + (n > 3 ? ' · …' : '');
  const banner = h('aside.wx-handoff', {
    id: 'wr-handoff', role: 'status', 'aria-label': 'Breakdown hand-off',
    'data-count': String(n), 'data-rows': String(scenes.length > 0)
  }, [
    h('div.wx-handoff-copy', {}, [
      h('p.wx-handoff-msg', { text }),
      h('p.wx-handoff-list', { text: names })
    ]),
    h('div.wx-handoff-acts', {}, [
      h('button.btn.primary', {
        type: 'button', 'data-action': 'handoff-add',
        text: n === 1 ? 'Add it to the Breakdown' : 'Add them to the Breakdown'
      }),
      h('a.btn', { href: BREAKDOWN_HREF, text: 'Open Breakdown →' }),
      h('button.btn.wx-quiet', { type: 'button', 'data-action': 'handoff-dismiss', text: 'Not now' })
    ])
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
        synopsis: firstAction ? String(firstAction.text).replace(/\s+/g, ' ').trim().slice(0, 180) : ''
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

/** Wire the banner. `opts.getDoc` returns the page's in-memory script. */
export function mountHandoff(opts = {}) {
  if (typeof opts.getDoc === 'function') getDoc = opts.getDoc;
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
    dismissedAt = b ? Number(b.dataset.count) : -1;
    if (b) b.remove();
  });
  safeRender();
}

export default { mountHandoff, newHeadings };
