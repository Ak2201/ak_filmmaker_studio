/* ============================================================
   SCRIPT LOCK, THE SHEETS — lock it, review what changed, unlock it
   ------------------------------------------------------------
   docs/SCRIPT-LOCK.md §2–§4 (owner, 1 Nov 2026). Three entry points,
   every one a view of src/lib/script-lock.js (the model, which stores
   the lock as FIELDS inside fms_script_v1's `numbering`; this file
   adds no key and keeps no state of its own):

     openLockReview()    the ONE deliberate step. A sheet that shows
                         what the lock will extract (the facts, then
                         the pipeline's own rows) and, on "Lock and
                         generate", takes the lock and runs the rules
                         pass. It replaces the three older locks
                         (Drafts' "Lock scene numbers", the
                         Stripboard's "Lock production draft" and the
                         Writer's) with one.
     openChangeReport()  after the lock: what changed since it, scene
                         by scene, and what each change touches
                         downstream. NOTHING downstream moves until
                         the writer presses an action on an item; each
                         action also marks the item reviewed.
     confirmUnlock()     the one release, through dialog.js, saying
                         every consequence before it happens.

   THE PIPELINE ROWS ARE DRAWN GENERICALLY, and that is the Phase 2
   extension point. The review lists whatever planPipeline() returns
   (label + note per step id) and openPipeline() runs whatever the
   pass holds, so a step Phase 2 adds to script-pipeline.js shows here
   and runs here with no edit to this file. The lock never names a
   step id. AI is not part of the lock pass (owner): the pass runs with
   `ai: false`; "Enhance with AI" is a later, separate button.

   A MARK IS A RE-READ, THEN A WRITE. Every report action reads the
   script again through getDoc() before it writes the review marks
   (doc.numbering = markReviewed(…)), because the Screenplay Writer
   keeps its own in-memory copy and a mark written over a stale one
   would save an older script over a newer line. The report writes
   NOTHING when it opens or redraws (verify's idle-write check); the
   first write is a press.

   A BIN ACTION IS UNDOABLE, AND THE UNDO TAKES BACK ONLY WHAT IT
   WROTE: the rows it binned come back (Bin.restoreMany), the rows it
   added go out again (Bin.unaddScenes), and the review mark it wrote
   is taken off so the item reads as open again.

   Kit components only (src/ui/kit/index.js), delegate() + data-action,
   tokens only (src/styles/script-lock.css). script-lock.js and the
   pipeline are dynamic imports: a page that never opens a sheet loads
   none of them.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { button, badge, sheet, closeSheet, statStrip, notice, tell, askDanger } from './kit/index.js';
import StudioUI from './chrome.js';
import Script, { isNumberingLocked, isHeld } from '../lib/script.js';
import Scenes from '../lib/scenes.js';
import * as Bin from '../lib/scene-bin.js';
import { headingsOf, applyNumbers, syncScript, applyFor, headingPatch } from '../lib/scene-sync.js';
import { formatEighths } from '../lib/sample-figures.js';
import '../styles/script-lock.css';

const model = () => import('../lib/script-lock.js');
const pipeline = () => import('../lib/script-pipeline.js');
const call = (fn, ...a) => (typeof fn === 'function' ? fn(...a) : undefined);
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const num = (v) => {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === 'object') return Number(v.count ?? v.n ?? v.total ?? 0) || 0;
  return Number(v) || 0;
};

/* The sheets name where a change lands. Hrefs are the pages' own anchors
   (a nav target never depends on data existing — CLAUDE.md). */
const LINKS = {
  shots: ['visualize.html#shot-list', 'Open the shot list'],
  day: ['stripboard.html#stripboard', 'Open the Stripboard'],
  sheets: ['contacts.html#call-sheets', 'Open the call sheets'],
  sides: ['reports.html#sides', 'Open the sides'],
  budget: ['budget.html', 'Open the Budget'],
  length: ['breakdown.html#scenes', 'Open the Breakdown']
};

/** The baseline line, from the model's own preview: a draft the script
    already equals is reused, else the lock saves the next one. */
function baselineLine(preview) {
  const b = (preview && preview.baseline) || {};
  return b.reuse ? b.reuse + ' becomes the locked script.' : 'Saved as ' + (b.next || 'a new draft') + ', which becomes the locked script.';
}

/* How the scenes will be numbered (lockPreview's `numbering`). */
const HOW = {
  rows: 'numbered as the Breakdown has them',
  text: 'numbered as the headings read',
  position: 'numbered by position'
};

/* ---- 1. the lock review ---------------------------------------- */

const FACTS = [
  ['scenes', 'Scenes'], ['cast', 'Cast'], ['locations', 'Locations'], ['elements', 'Elements'], ['extras', 'Extras']
];

/**
 * Open the review. opts { getDoc, save, afterLock, returnTo, onClose }
 *   getDoc()    the page's script in memory (it saved before opening)
 *   save()      the page's save
 *   afterLock() repaint the page: button, draft label, analysis, sync baseline
 *   onClose()   once, when the sheet goes (the page strips #lock then)
 */
export async function openLockReview(opts = {}) {
  const { getDoc, save, afterLock, returnTo, onClose } = opts;
  let L; let P;
  try { [L, P] = await Promise.all([model(), pipeline()]); }
  catch (e) {
    StudioUI.toast('The lock could not load. Check the connection and try again.', { type: 'error' });
    return null;
  }
  const doc = call(getDoc);
  if (!doc || !headingsOf(doc.elements || []).length) {
    return tell({
      eyebrow: 'Script lock', icon: 'lock', title: 'Nothing to lock yet',
      body: 'Write or import a screenplay first. The lock numbers the scenes it finds, and there are no scene headings yet.'
    });
  }
  // Locked already: this entry point is the review of changes, not a second lock.
  if (isNumberingLocked(doc.numbering)) return openChangeReport({ getDoc, save, returnTo, onClose });

  const rows = P.planPipeline({ elements: doc.elements, numbering: doc.numbering });
  const props = (Array.isArray(rows) ? rows : []).find((r) => r.id === 'props') || {};
  const preview = L.lockPreview(doc, props.byCategory, Scenes.listScenes()) || {};

  const facts = statStrip(FACTS.map(([key, label]) => ({
    label, value: num(preview[key]), note: key === 'scenes' ? HOW[preview.numbering] : '', attrs: { 'data-lock-fact': key }
  })), { label: 'What the lock will extract', class: 'lk-facts' });

  const steps = h('ol.lk-steps', { 'aria-label': 'What the pass will do' }, (Array.isArray(rows) ? rows : []).map((r) =>
    h('li.lk-step', { 'data-step': r.id }, [
      h('p.lk-step-label', { text: r.label || r.id }),
      h('p.lk-step-note', { text: r.note || r.what || '' })
    ])));

  const confirmBtn = button({ label: 'Lock and generate', variant: 'primary', pill: true, icon: 'lock', action: 'lock-confirm' });
  const card = h('div#lock.lk-review', {}, [
    h('p.lk-lede', { text: 'Locking freezes the scene numbers and generates pre-production from the script, by rules, on this device. Only blank places are filled; nothing you have written is overwritten.' }),
    facts,
    h('h3.lk-h', { text: 'The pass' }),
    steps,
    h('p.lk-base', { 'data-lock': 'baseline', text: baselineLine(preview) }),
    h('p.lk-means', { text: 'After the lock, scene numbers stay put: a scene added later becomes 12A and a scene cut stays as OMITTED. The Breakdown waits for your review of later changes in the change report, and nothing downstream moves until you act. You can unlock it again, which renumbers every scene.' }),
    h('div.lk-actions', {}, [confirmBtn, button({ label: 'Cancel', variant: 'ghost', action: 'lock-cancel' })])
  ]);

  let busy = false;
  delegate(card, 'click', '[data-action="lock-cancel"]', () => { closeSheet().catch(() => {}); });
  delegate(card, 'click', '[data-action="lock-confirm"]', async (e, btn) => {
    if (busy) return;
    busy = true;
    btn.disabled = true;
    try {
      // Re-read: the page's copy is current (it saved before opening) but a
      // sheet can stay open while a newer copy arrives.
      const fresh = call(getDoc);
      if (!fresh || !headingsOf(fresh.elements || []).length) {
        await closeSheet();
        await tell({ eyebrow: 'Script lock', title: 'Nothing to lock yet', body: 'The script has no scene headings now. Write or import a screenplay first.' });
        return;
      }
      if (isNumberingLocked(fresh.numbering)) { await closeSheet(); await openChangeReport({ getDoc, save, returnTo, onClose }); return; }
      if (!L.takeLock(fresh, Scenes.listScenes())) throw new Error('no headings');   // mutates the doc: the draft and the numbers
      call(save);
      applyNumbers(fresh.elements, fresh.numbering);   // the Breakdown's rows take the locked numbers
      call(afterLock);
      const n = Object.keys((fresh.numbering && fresh.numbering.ids) || {}).length || headingsOf(fresh.elements).length;
      StudioUI.toast('Script locked: ' + plural(n, 'scene') + ' numbered. Later edits wait in the change report.', { type: 'success' });
      // The pass is the act that generates pre-production, so it runs with
      // sync NOT held; its one Undo takes the run back, never the lock.
      const { openPipeline } = await import('./pipeline-checklist.js');
      await openPipeline({
        getElements: () => { const d = call(getDoc); return d ? d.elements : []; },
        getNumbering: () => { const d = call(getDoc); return d ? d.numbering : undefined; },
        getDoc: () => call(getDoc),
        save: () => call(save),
        onChange: () => call(afterLock),
        returnTo, ai: false, title: 'Generate pre-production'
      });
    } catch (err) {
      console.warn('[script-lock] lock', err);
      StudioUI.toast('The script could not be locked. Nothing was changed.', { type: 'error' });
      btn.disabled = false;
    } finally {
      busy = false;
    }
  });
  await sheet({ title: 'Lock the script', body: card, kind: 'lock', returnTo, onClose });
  return card;
}

/* ---- 2. the change report -------------------------------------- */

const KIND = { added: ['New scene', 'ok'], changed: ['Changed', 'info'], omitted: ['Omitted', 'warn'] };

function countsText(c) {
  if (!c) return '';
  const part = (n, w) => (n ? plural(n, 'line') + ' ' + w : '');
  return [part(c.added, 'added'), part(c.removed, 'removed'), part(c.changed, 'changed'), part(c.moved, 'moved')].filter(Boolean).join(', ');
}

/* The downstream rows, in plain words. A row exists only when the change
   touches that thing, so a short list is itself the answer. */
function impactRows(item) {
  const im = item.impact || {};
  const out = [];
  const shots = num(im.shots);
  if (shots) out.push(['shots', plural(shots, 'shot') + ' planned for this scene ' + (item.kind === 'omitted' ? 'would have nothing to film.' : 'may need a second look.')]);
  const day = Number(im.day) || 0;
  if (day) out.push(['day', 'Scheduled on Day ' + day + (im.dayAlone ? ', where it is the only scene' : '') + '.']);
  const sheets = Array.isArray(im.sheets) ? im.sheets : [];
  if (sheets.length) {
    out.push(['sheets', 'On ' + plural(sheets.length, 'call sheet') + ': '
      + sheets.slice(0, 3).map((s) => (s.title || 'Untitled') + (s.date ? ' (' + s.date + ')' : '')).join(', ')
      + (sheets.length > 3 ? ' and more.' : '.')]);
  }
  if (im.sides && day) out.push(['sides', 'Reprint the sides for Day ' + day + '.']);
  if (im.budget === 'may-drop') out.push(['budget', 'Day ' + (day || '') + ' may drop out of the budget: this was its only scene.']);
  else if (im.budget === 'not-counted') out.push(['budget', 'Not counted in the budget’s days yet.']);
  const e = im.eighths;
  if (e && Number(e.row) !== Number(e.script)) {
    out.push(['length', 'The Breakdown has it at ' + formatEighths(e.row) + ' pages; the script now reads ' + formatEighths(e.script) + '.']);
  }
  return out;
}

function actionsFor(item) {
  const acts = [];
  const im = item.impact || {};
  const e = im.eighths;
  /* A heading made by retyping a line that was already in the locked draft
     (a blank line turned into INT. BUS - DAY) is reported as a CHANGED
     scene with no Breakdown row, not as a new one: it needs the same
     "Add to Breakdown", and applyFor() is a no-op when there is nothing to add. */
  const orphan = item.kind === 'changed' && item.headingChanged && !item.sceneId && item.headingId && item.key !== '_PRE';
  if (item.pending === 'add' || orphan) acts.push(['add', 'Add to Breakdown', 'add', 'primary']);
  if (item.pending === 'omit' && item.sceneId) acts.push(['bin', 'Send to the bin', 'delete', 'secondary']);
  if (item.headingChanged && item.sceneId && item.kind !== 'omitted') acts.push(['fields', 'Update place and time', 'rule', 'secondary']);
  if (e && Number(e.row) !== Number(e.script) && item.sceneId) acts.push(['length', 'Use the script’s length', 'rule', 'secondary']);
  if (!item.reviewed) {
    if (item.kind === 'omitted' && item.pending === 'omit') acts.push(['keep', 'Keep it', 'check', 'ghost']);
    acts.push(['review', 'Mark reviewed', 'check', 'ghost']);
  }
  return acts;
}

function itemEl(item) {
  const [kindLabel, tone] = KIND[item.kind] || ['Changed', 'info'];
  const pre = item.key === '_PRE';
  const rows = impactRows(item);
  const acts = actionsFor(item);
  const counts = countsText(item.counts);
  return h('li.lk-item', {
    'data-lock-item': '', 'data-key': item.key, 'data-kind': item.kind, 'data-reviewed': String(!!item.reviewed)
  }, [
    h('div.lk-item-head', {}, [
      badge({ label: pre ? 'Intro' : (item.number || '–'), tag: true }),
      h('p.lk-item-title', { text: pre ? 'Before the first scene' : (item.heading || 'Scene') }),
      badge({ label: kindLabel, tone }),
      item.reviewed ? badge({ label: 'Reviewed', tone: 'ok', icon: 'check' }) : null
    ]),
    counts ? h('p.lk-item-counts', { text: counts }) : null,
    rows.length
      ? h('ul.lk-impacts', { 'aria-label': 'What this touches' }, rows.map(([id, text]) =>
        h('li.lk-impact', { 'data-impact': id }, [
          h('span', { text }),
          h('a.lk-link', { href: LINKS[id][0], text: LINKS[id][1] + ' →' })
        ])))
      : h('p.lk-none', { text: 'Nothing downstream is touched.' }),
    acts.length
      ? h('div.lk-item-acts', {}, acts.map(([id, label, icon, variant]) =>
        button({ label, icon, variant, size: 'sm', action: 'lock-act', attrs: { 'data-lock-act': id, 'data-key': item.key } })))
      : null
  ]);
}

/** The shots and call sheets the report's impact rows read, loaded once per draw. */
async function downstream() {
  const [S, C] = await Promise.all([import('../lib/shots.js'), import('../lib/contacts.js')]);
  return { scenes: Scenes.listScenes(), shots: S.listShots(), callSheets: C.listCallSheets() };
}

/** The review marks, written: re-read, mark, save. Returns the doc. */
function writeMarks(L, getDoc, save, items, keys) {
  const doc = getDoc();
  if (!doc) return null;
  const next = L.markReviewed(doc.numbering, items, keys);
  if (next) doc.numbering = next;
  save(doc);
  return doc;
}

/** Take a review mark off again (an Undo). Only while still locked. */
function unmark(getDoc, save, key) {
  const doc = getDoc();
  const r = doc && doc.numbering && doc.numbering.reviewed;
  if (!r || !(key in r)) return;
  delete r[key];
  if (!Object.keys(r).length) delete doc.numbering.reviewed;
  save(doc);
}

/**
 * Open the change report. opts { getDoc?, save?, returnTo, after?, onClose? }
 * `after()` repaints the caller once an action has changed something.
 * Defaults read and write the script blob itself (the Breakdown, the
 * Stripboard and the bar have no page copy of it).
 */
export async function openChangeReport(opts = {}) {
  const getDoc = opts.getDoc || (() => Script.loadScript());
  const save = opts.save || ((d) => Script.saveScript(d));
  const { returnTo } = opts;
  let L;
  try { L = await model(); }
  catch (e) {
    StudioUI.toast('The change report could not load. Check the connection and try again.', { type: 'error' });
    return null;
  }
  const first = getDoc();
  if (!first || !isNumberingLocked(first.numbering)) {
    return tell({ eyebrow: 'Script lock', icon: 'lock_open', title: 'The script is not locked', body: 'Lock the script on the Screenplay Writer first. After that, every later change is listed here for your review.' });
  }

  const body = h('div#changes.lk-report', {});
  let focusSpec = null;       // where focus goes after a redraw
  let token = 0;

  async function paint() {
    const mine = ++token;
    const doc = getDoc();
    const parts = [];
    let rep = null;
    if (!doc || !isNumberingLocked(doc.numbering)) {
      parts.push(notice({ tone: 'info', icon: 'lock_open', title: 'The script is not locked', body: 'There is nothing to review.' }));
    } else if (!isHeld(doc.numbering)) {
      // A lock taken before change tracking: locked, but with no baseline to compare.
      parts.push(notice({
        tone: 'info', icon: 'history', title: 'Locked, without change tracking',
        body: 'This script was locked before changes were tracked, so there is no baseline to compare it with. Starting tracking takes the script as it is now as the baseline.',
        action: button({ label: 'Start change tracking', variant: 'primary', icon: 'history', action: 'lock-track' })
      }));
    } else {
      rep = L.changeReport(doc, await downstream());
      if (mine !== token) return;   // a newer draw is under way
      if (rep.baseMissing) {
        parts.push(notice({
          tone: 'warn', icon: 'history', title: 'The locked draft is gone',
          body: 'The draft this lock was compared with was deleted, so changes cannot be listed. Tracking can start again from the latest draft.',
          action: button({ label: 'Start tracking from the latest draft', variant: 'primary', icon: 'history', action: 'lock-track' })
        }));
      } else {
        const items = rep.items || [];
        const open = items.filter((i) => !i.reviewed).length;
        const base = (doc.revisions || []).find((r) => r.id === doc.numbering.base);
        parts.push(h('div.lk-summary', {}, [
          h('p.lk-sumline', { role: 'status', text: !items.length
            ? 'No script changes since the lock' + (base ? ' (' + base.name + ').' : '.')
            : (open ? plural(open, 'script change') + ' to review' : 'Every script change is reviewed')
              + (base ? ', since ' + base.name + '.' : '.') }),
          open > 1 ? button({ label: 'Mark all reviewed', icon: 'check_circle', variant: 'secondary', size: 'sm', action: 'lock-review-all' }) : null
        ]));
        if (items.length) parts.push(h('ol.lk-items', { 'aria-label': 'Changes since the lock' }, items.map(itemEl)));
        parts.push(h('p.lk-foot', { text: 'Nothing downstream changes until you press an action on an item. The script itself stays editable; Drafts issues the next revision colour.' }));
      }
    }
    body.replaceChildren(...parts.filter(Boolean));
    body.dataset.open = rep ? String((rep.items || []).filter((i) => !i.reviewed).length) : '';
    restoreFocus();
  }

  /* Focus goes to the replacement control, never <body> (QA r4): the same
     item's same action if it is still there, else its first action, else
     the next item's, else the summary's own button. */
  function restoreFocus() {
    const spec = focusSpec; focusSpec = null;
    if (!spec) return;
    const items = Array.from(body.querySelectorAll('[data-lock-item]'));
    const q = (root, sel) => root && root.querySelector(sel);
    const mine = items.find((i) => i.dataset.key === spec.key);
    let target = q(mine, '[data-lock-act="' + spec.act + '"]') || q(mine, '[data-lock-act]');
    if (!target) {
      const at = Math.max(0, spec.index || 0);
      for (const it of items.slice(at).concat(items.slice(0, at))) { target = q(it, '[data-lock-act]'); if (target) break; }
    }
    target = target || q(body, '[data-action="lock-review-all"]') || q(body, '[data-action="lock-track"]');
    if (!target) {
      const s = q(body, '.lk-sumline');
      if (s) { s.tabIndex = -1; target = s; }
    }
    if (target) { try { target.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
  }

  const itemsNow = () => Array.from(body.querySelectorAll('[data-lock-item]'));

  async function act(kind, key, btn) {
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    const at = itemsNow().findIndex((i) => i.dataset.key === key);
    focusSpec = { key, act: kind, index: at };
    try {
      let doc = getDoc();
      const rep = L.changeReport(doc, await downstream());   // fresh items, fresh signatures
      const item = (rep.items || []).find((i) => i.key === key);
      if (!item) { await paint(); return; }
      let undo = null;
      if (kind === 'add') {
        const out = applyFor(doc.elements, doc.numbering, { headingId: item.headingId });
        const r = (out && out.result) || out || {};
        const added = (r.added || []).map((x) => x.id);
        const back = (r.restored || []).map((x) => x.id);
        if (added.length || back.length) {
          undo = { text: 'Scene ' + (item.number || '') + ' added to the Breakdown.', run: () => {
            if (added.length) Bin.unaddScenes(new Set(added));
            for (const id of back) Bin.binScene(id, { reason: 'hand' });
          } };
        }
      } else if (kind === 'bin') {
        const out = applyFor(doc.elements, doc.numbering, { sceneId: item.sceneId });
        const r = (out && out.result) || out || {};
        const ids = (r.binned || []).map((e) => e.id);
        if (ids.length) undo = { text: 'Scene ' + (item.number || '') + ' moved to the bin, with what was attached to it.', run: () => { Bin.restoreMany(ids); } };
      } else if (kind === 'fields' || kind === 'length') {
        const list = Scenes.listScenes();
        const row = list.find((s) => s.id === item.sceneId);
        if (row) {
          if (kind === 'length') row.eighths = item.impact.eighths.script;
          else {
            const patch = { ...headingPatch(item.heading, row) };
            delete patch.number;          // the lock owns the number
            Object.assign(row, patch, { id: row.id });
          }
          Scenes.saveScenes(list);
        }
      }
      // Every action marks the item reviewed. The marks are written from a
      // fresh read of the script, never from the copy the report was drawn from.
      writeMarks(L, getDoc, save, rep.items, [key]);
      call(opts.after);
      if (undo) {
        StudioUI.toast(undo.text, {
          type: 'info', action: 'Undo',
          onAction: () => {
            try { undo.run(); unmark(getDoc, save, key); } catch (e) { console.warn('[script-lock] undo', e); }
            call(opts.after);
            paint().catch(() => {});
            StudioUI.toast('Taken back.', { type: 'info' });
          }
        });
      }
      await paint();
    } catch (err) {
      console.warn('[script-lock] action', err);
      StudioUI.toast('That change could not be made. Nothing was changed.', { type: 'error' });
      btn.disabled = false;
    }
  }

  delegate(body, 'click', '[data-lock-act]', (e, btn) => { act(btn.dataset.lockAct, btn.dataset.key, btn); });
  delegate(body, 'click', '[data-action="lock-review-all"]', async (e, btn) => {
    btn.disabled = true;
    try {
      const rep = L.changeReport(getDoc(), await downstream());
      const keys = (rep.items || []).filter((i) => !i.reviewed).map((i) => i.key);
      if (keys.length) writeMarks(L, getDoc, save, rep.items, keys);
      call(opts.after);
      focusSpec = { key: '', act: '', index: 0 };
      await paint();
    } catch (err) {
      console.warn('[script-lock] review all', err);
      StudioUI.toast('The marks could not be saved.', { type: 'error' });
      btn.disabled = false;
    }
  });
  delegate(body, 'click', '[data-action="lock-track"]', async (e, btn) => {
    btn.disabled = true;
    try {
      const doc = getDoc();
      L.startTracking(doc);
      save(doc);
      call(opts.after);
      focusSpec = { key: '', act: '', index: 0 };
      await paint();
    } catch (err) {
      console.warn('[script-lock] track', err);
      StudioUI.toast('Change tracking could not start. Nothing was changed.', { type: 'error' });
      btn.disabled = false;
    }
  });

  await paint();
  await sheet({ title: 'Changes since the lock', body, kind: 'lock', returnTo, onClose: opts.onClose });
  return body;
}

/* ---- 3. unlock -------------------------------------------------- */

/**
 * The one release. opts { getDoc?, save?, after? }. Resolves true when
 * the script was unlocked.
 */
export async function confirmUnlock(opts = {}) {
  const getDoc = opts.getDoc || (() => Script.loadScript());
  const save = opts.save || ((d) => Script.saveScript(d));
  const first = getDoc();
  if (!first || !isNumberingLocked(first.numbering)) {
    await tell({ eyebrow: 'Script lock', icon: 'lock_open', title: 'The script is not locked', body: 'The script is not locked. Scene numbers already follow the script.' });
    return false;
  }
  let L;
  try { L = await model(); }
  catch (e) { StudioUI.toast('Unlocking could not load. Check the connection and try again.', { type: 'error' }); return false; }
  let shotRows = [];
  try { shotRows = (await import('../lib/shots.js')).listShots(); } catch (e) { /* the count is then left out */ }
  const s = L.unlockSummary(first, Scenes.listScenes(), Bin.listBin(), shotRows) || {};
  const adds = num(s.adds);
  const bins = num(s.bins);
  const shots = num(s.shotsBinned);
  const omitted = num(s.omitted);
  const body = [
    'Every scene is renumbered 1 to ' + (num(s.scenes) || 'N') + ', and lettered inserts such as 12A become whole numbers.'
      + (omitted ? ' ' + plural(omitted, 'OMITTED placeholder') + ' go.' : '') + (s.pagesLocked ? ' The page lock goes with them.' : ''),
    'The change report and its review marks are cleared'
      + (num(s.open) ? ' (' + plural(num(s.open), 'change') + ' still unreviewed)' : '') + '. Live sync with the Breakdown resumes now: '
      + plural(adds, 'scene') + ' will be added to the Breakdown and ' + plural(bins, 'scene')
      + ' sent to the bin' + (shots ? ' with ' + plural(shots, 'shot') : '') + ' (restorable from the bin).',
    'The locked draft stays in Drafts. Pages already handed out will no longer match the scene numbers.'
  ].join('\n\n');
  const ok = await askDanger({
    eyebrow: 'Script lock', icon: 'lock_open', title: 'Unlock the script', body, confirm: 'Unlock and renumber'
  });
  if (!ok) return false;

  const doc = getDoc();          // re-read: it can have changed while the dialog was open
  if (!doc) return false;
  delete doc.numbering;
  try {
    if (save(doc) === false) throw new Error('refused');
  } catch (e) {
    StudioUI.toast('The script could not be unlocked: it was not saved. Nothing was changed.', { type: 'error' });
    return false;
  }
  // Settle the held changes now (one toast, one Undo), then the numbers.
  let res = { added: [], binned: [] };
  try { res = syncScript(doc.elements, { numbering: null, keepLinked: true }).result || res; }
  catch (e) { console.warn('[script-lock] unlock sync', e); }
  try { applyNumbers(doc.elements, null); } catch (e) { console.warn('[script-lock] unlock numbers', e); }
  call(opts.after);
  const added = (res.added || []).map((r) => r.id);
  const binned = (res.binned || []).map((e) => e.id);
  const said = 'Script unlocked. Scene numbers follow the script again'
    + (added.length || binned.length ? ': ' + plural(added.length, 'scene') + ' added, ' + plural(binned.length, 'scene') + ' sent to the bin.' : '.');
  StudioUI.toast(said, added.length || binned.length ? {
    type: 'success', action: 'Undo',
    onAction: () => {
      if (binned.length) Bin.restoreMany(binned);
      if (added.length) Bin.unaddScenes(new Set(added));
      call(opts.after);
      StudioUI.toast('The Breakdown changes are taken back. The script stays unlocked.', { type: 'info' });
    }
  } : { type: 'success' });
  return true;
}

export default { openLockReview, openChangeReport, confirmUnlock };
