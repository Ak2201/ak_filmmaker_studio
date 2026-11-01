/* ============================================================
   PIPELINE CHECKLIST — "Break down everything", as it happens
   ------------------------------------------------------------
   The view of src/lib/script-pipeline.js. One sheet (the kit's sheet,
   which is the phone's bottom sheet and a centred card at 720px and
   up) with a row per step — waiting, running, done, nothing to do —
   a progress meter, and once the run ends a summary:

       36 scenes, 12 characters, 21 locations, 318 props and elements
       suggested, 289 shots, 31 shooting days …

   with Undo for the whole run, the pages to go on to, and "Enhance
   with AI": the existing AI Desk tasks one after another, each review
   first, behind the AI pill (Pro, the writer's own key; the pill's
   locked / no-key states stand in front of it).

   Reached from two places:
     · the import hand-off (src/ui/handoff.js) — importing a script on
       screenplay.html or write.html offers "Break down everything";
     · the Breakdown's overview (src/ui/breakdown-overview.js).

   The lock (src/ui/script-lock-ui.js) opens it with `ai: false`, a
   `title` and an `intro` of its own: the lock pass is rules only (owner,
   1 Nov 2026), so that run carries no "Enhance with AI" block and says
   the script stays locked after an Undo. Every other caller is as it was.

   NO STORAGE. The run's undo is the model's, in memory; this file only
   draws. Kit components only (src/ui/kit/index.js).
   ============================================================ */
import { h } from '../lib/dom.js';
import { button, meter, setMeter, statStrip, notice, sheet, closeSheet, sym } from './kit/index.js';
import { aiPill } from './ai-pill.js';
import StudioUI from './chrome.js';
import '../styles/pipeline.css';

const model = () => import('../lib/script-pipeline.js');
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const call = (fn, ...a) => (typeof fn === 'function' ? fn(...a) : undefined);

/* Every mark must be in section-icons.json `icons` (the font is a subset). */
const ICON = { waiting: 'more_horiz', running: 'sync_alt', done: 'check_circle', nothing: 'check_circle', derived: 'assessment', skipped: 'remove', error: 'error' };
const WORD = { waiting: 'Waiting', running: 'Working…', done: 'Done', nothing: 'Nothing new', derived: 'Read', skipped: 'Skipped', error: 'Could not run' };

/* ---- the offer (a banner the hand-off shows after an import) --- */

/** The "Break down everything" offer. `onRun` is the press. */
export function pipelineOffer({ onRun, onDismiss, scenes = 0 } = {}) {
  const run = button({ label: 'Break down everything', variant: 'primary', pill: true, icon: 'auto_awesome', action: 'pipeline-run' });
  const not = button({ label: 'Not now', variant: 'ghost', action: 'pipeline-dismiss' });
  run.addEventListener('click', (e) => { e.preventDefault(); call(onRun); });
  not.addEventListener('click', (e) => { e.preventDefault(); call(onDismiss); });
  return h('aside.pl-offer', { id: 'pl-offer', role: 'status', 'aria-label': 'Break down the script' }, [
    notice({
      tone: 'info', icon: 'auto_awesome', title: 'Script imported',
      body: 'Break it down from start to end: ' + (scenes ? plural(scenes, 'scene') + ', ' : 'scenes, ')
        + 'cast, characters, locations, props, a shot division, proposed shooting days and the budget’s days — by rules, on this device. '
        + 'Only blank places are filled, and one Undo takes the whole run back.',
      action: [run, not]
    })
  ]);
}

/* ---- the checklist ---------------------------------------------- */

function row(st) {
  return h('li.pl-row', { 'data-step': st.id, 'data-status': st.status || 'waiting' }, [
    h('span.pl-ico', { 'aria-hidden': 'true' }, [sym(ICON[st.status || 'waiting'] || ICON.waiting)]),
    h('div.pl-copy', {}, [
      h('p.pl-label', {}, [h('span', { text: st.label }), h('span.pl-state', { text: WORD[st.status || 'waiting'] || '' })]),
      h('p.pl-detail', { text: st.detail || st.note || st.what || '' })
    ])
  ]);
}

function paintRow(list, st) {
  const old = list.querySelector('[data-step="' + st.id + '"]');
  const fresh = row(st);
  if (old) old.replaceWith(fresh); else list.append(fresh);
}

/** The AI half: the existing Desk tasks, one after another, each a
 *  review. Between two, a toast that stays offers the next one, so the
 *  writer can stop at any point by not pressing it. */
const CHAIN = [
  { id: 'breakdown-tags', label: 'AI breakdown tags' },
  { id: 'shot-draft', label: 'AI shot division and story' },
  { id: 'story-map', label: 'Map the beats of your synopsis', when: async () => { try { const S = await import('../lib/story.js'); return !!String((S.loadStory() || {}).source || '').trim(); } catch (e) { return false; } } },
  { id: 'coverage', label: 'A coverage report' },
  { id: 'tension-notes', label: 'Notes on tension and arcs' }
];

function ctxFor(id, base) {
  if (id === 'shot-draft') {
    return async () => {
      const flow = await import('./breakdown-flow.js');
      return flow.aiBreakdownCtx({ refresh: () => call(base.refresh) })();
    };
  }
  if (id === 'coverage') return () => ({ getDoc: base.getDoc, save: base.save, elements: base.getElements, after: () => call(base.refresh) });
  return () => ({ elements: base.getElements, getDoc: base.getDoc, after: () => call(base.refresh) });
}

let chainAt = -1;
let chainBase = null;
function deskOpen() { return document.documentElement.classList.contains('ai-desk-open'); }
async function openStep(i) {
  chainAt = i;
  const D = await import('./ai-desk.js');
  await D.openDesk(CHAIN[i].id, ctxFor(CHAIN[i].id, chainBase));
}
async function offerNext() {
  if (chainAt < 0) return;
  /* breakdown-flow opens its story review straight after the shots
     review closes: wait until no Desk is open before offering on. */
  await new Promise((r) => setTimeout(r, 400));
  if (deskOpen()) return;
  let next = chainAt + 1;
  while (next < CHAIN.length && CHAIN[next].when && !(await CHAIN[next].when())) next++;
  if (next >= CHAIN.length) { chainAt = -1; StudioUI.toast('That is the last of the AI passes. Everything you accepted is kept; run any of them again from the AI menus.', { type: 'success' }); return; }
  chainAt = -1;
  StudioUI.toast('Next AI pass: ' + CHAIN[next].label + '.', {
    type: 'info', action: 'Continue',
    onAction: () => { openStep(next).catch((e) => console.warn('[pipeline] AI step', e)); }
  });
}
let chainWired = false;
function wireChain() {
  if (chainWired) return;
  chainWired = true;
  window.addEventListener('ai-desk:closed', () => { offerNext(); });
}

/** "Enhance with AI": the pill. `base` { getElements, getDoc, save, refresh }. */
export function enhancePill(base = {}) {
  wireChain();
  return aiPill({
    label: 'Enhance with AI',
    tasks: [{ id: CHAIN[0].id, label: 'Enhance with AI' }],
    ctx: () => {
      chainBase = base;
      chainAt = 0;
      closeSheet().catch(() => {});
      return ctxFor(CHAIN[0].id, base)();
    }
  });
}

function summaryBlock(res, opts, undoBtn) {
  const s = res.summary;
  const stats = statStrip([
    { label: 'Scenes', value: s.scenes, note: s.pages + ' pages' },
    { label: 'Characters', value: s.characters },
    { label: 'Locations', value: s.locations },
    { label: 'Props suggested', value: s.props },
    { label: 'Shots', value: s.shots },
    { label: 'Shooting days', value: s.days }
  ], { label: 'What the script holds now', class: 'pl-stats' });
  const links = h('div.pl-links', {}, [
    button({ label: 'Breakdown', href: 'breakdown.html#overview', icon: 'view_list' }),
    button({ label: 'Suggested tags', href: 'breakdown.html#suggest', icon: 'label' }),
    button({ label: 'Shots', href: 'visualize.html', icon: 'videocam' }),
    button({ label: 'Stripboard', href: 'stripboard.html', icon: 'view_agenda' }),
    button({ label: 'Script analysis', href: 'screenplay.html#analysis', icon: 'assessment' })
  ]);
  /* ai: false leaves out the AI block AND its chain: nothing in the lock
     pass may reach a provider (the pill is not even built). */
  const withAi = opts.ai !== false;
  const ai = withAi ? enhancePill({ getElements: opts.getElements, getDoc: opts.getDoc, save: opts.save, refresh: opts.onChange }) : null;
  return h('div.pl-summary', { id: 'pl-summary' }, [
    h('p.pl-sumline', { role: 'status', text: s.text || 'Nothing to break down yet.' }),
    stats,
    withAi ? h('div.pl-ai', {}, [
      h('p.pl-ai-copy', { text: 'Before AI, the rules did this. AI can add what they cannot read — every element the page calls for, a shot list from a director’s eye, the story beats, a coverage report and notes on tension — each one a review you accept or skip.' }),
      ai
    ]) : h('p.pl-ai-copy.pl-locknote', { text: 'Undo takes this run back; the script stays locked.' }),
    links,
    h('div.pl-foot', {}, [undoBtn])
  ]);
}

/**
 * Open the checklist and run. opts {
 *   getElements?()  the script in memory (the page's own doc)
 *   getNumbering?()
 *   getDoc?() / save?()   for the coverage step (the page's doc and save)
 *   onChange?()     repaint the page after the run and after Undo
 *   returnTo?       focus on close
 *   ai?             false: no "Enhance with AI" block (default true)
 *   title?          the sheet's title (default "Break down everything")
 *   intro?          the opening line while it runs }
 * Resolves to the run's result (or null when it could not load).
 */
export async function openPipeline(opts = {}) {
  let M;
  try { M = await model(); }
  catch (e) { StudioUI.toast('The breakdown could not load. Check the connection and try again.', { type: 'error' }); return null; }
  const elements = call(opts.getElements);
  const numbering = call(opts.getNumbering);
  const plan = M.planPipeline({ elements, numbering });
  const list = h('ol.pl-list', { 'aria-label': 'Steps' }, plan.map((p) => row({ ...p, status: 'waiting', detail: p.note })));
  const bar = meter({ label: 'Breaking down the script', value: 0, max: plan.length, show: 'ratio', class: 'pl-meter' });
  const live = h('p.visually-hidden', { role: 'status', 'aria-live': 'polite' });
  const body = h('div.pl-body', { 'data-pipeline': 'running' }, [
    h('p.pl-intro', { text: opts.intro || 'Reading the script from the first page to the last. Only blank places are filled — nothing you have written or edited is overwritten.' }),
    bar, list, live
  ]);
  /* The run's Undo must outlive the sheet. Closed by any route (the
     close button, Escape, the scrim, "Enhance with AI"), a run that can
     still be undone leaves a toast that stays until it is pressed or
     dismissed — "one Undo takes the whole run back" stays true. */
  let res = null;
  let closed = false;
  let undone = false;
  const undoBtn = button({ label: 'Undo this run', icon: 'restart_alt', variant: 'ghost', action: 'pipeline-undo', disabled: true });
  const doUndo = () => {
    if (undone || !res) return;
    undone = true;
    const n = res.undo();
    undoBtn.disabled = true;
    call(opts.onChange, null);
    StudioUI.toast(n ? 'The run is undone: everything it filled in is back to blank.' : 'Nothing to undo.', { type: 'info' });
  };
  const offerUndo = () => {
    if (undone || !res || !res.undoable) return;
    StudioUI.toast((opts.title || 'Break down everything') + ': the run is kept.', { type: 'info', action: 'Undo the run', onAction: doUndo });
  };
  await sheet({
    title: opts.title || 'Break down everything', body, kind: 'pipeline', returnTo: opts.returnTo,
    onClose: () => { closed = true; offerUndo(); }
  });
  let done = 0;
  res = await M.runPipeline({
    elements, numbering,
    onStep: (st) => {
      paintRow(list, st);
      if (st.status !== 'running') { done++; setMeter(bar, done, plan.length); live.textContent = st.label + ': ' + (WORD[st.status] || ''); }
    }
  });
  body.dataset.pipeline = 'done';
  call(opts.onChange, res);
  undoBtn.disabled = !res.undoable;
  undoBtn.addEventListener('click', () => {
    doUndo();
    closeSheet().catch(() => {});
  });
  body.append(summaryBlock(res, opts, undoBtn));
  live.textContent = res.summary.text;
  if (closed) offerUndo();     // the sheet went while the run was working
  return res;
}

export default { openPipeline, pipelineOffer, enhancePill };
