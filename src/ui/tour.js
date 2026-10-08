/* ============================================================
   THE TOUR, AND THE HUB'S FIRST-WEEK CHECKLIST
   ------------------------------------------------------------
   A lazy chunk. src/ui/footer.js imports it on the hub (for the
   checklist) and on any page where a tour the reader STARTED is still
   running; nowhere else pays for it.

   STORAGE. One device key, fms_tour_v1 — in ALL_KEYS (reset forgets
   the tour) and GLOBAL_KEYS (a backup carries it like the theme) — and
   it holds only the tour's own place:
       { v: 1, active, step, dismissed, finished, hideList }
   It is WRITTEN ONLY ON A CLICK OR A KEY: starting, Next, Back, End,
   Esc, hiding the list. Loading a page — any page, mid-tour or not —
   reads it and writes nothing, which is what verify's four idle
   seconds assert.

   THE CHECKLIST IS DERIVED, NEVER STORED. Each tick is a question put
   to the open film's models at render time (scenes.js, script.js,
   story.js, contacts.js, locations.js) — the same rule readiness.js
   and journey.js follow, for the same reason: a stored "done" is a
   second copy of a fact that goes wrong the first time either copy is
   edited. Unticked items are drawn, not filtered: a list that only
   shows what is left reads the same whether you are nearly done or the
   check stopped running.

   THE STEPS live in src/data/tour.json (content in JSON, invariant 2),
   and each names its anchor as a list of selectors tried in order —
   `[data-tour="…"]` first, so a page can name its own anchor, then the
   ids navigation.json already promises (which always render, per the
   fragment trap). The anchor gets a ring; the step itself is a card
   pinned to the bottom of the viewport, so it never covers the thing
   it is describing and never needs measuring against a band that moves.

   ACCESSIBILITY. The card is a non-modal role="dialog" with its title
   and body wired as label and description; focus moves INTO it on
   each step (the card itself, so a reader hears title then body) and
   back to where it was when the tour ends. Esc ends the tour from
   anywhere unless a modal of the page's own is open. Every transform
   is multiplied by --motion, and scrolling is instant under
   prefers-reduced-motion.
   ============================================================ */
import Store from '../lib/store.js';
import { h, delegate } from '../lib/dom.js';
import { listScenes } from '../lib/scenes.js';
import { loadScript } from '../lib/script.js';
import { loadStory } from '../lib/story.js';
import { listCallSheets } from '../lib/contacts.js';
import { unscheduledScenes } from '../lib/locations.js';
import data from '../data/tour.json';
import '../styles/tour.css';

export const TOUR_KEY = 'fms_tour_v1';
const STEPS = data.steps;

/* ---- state: read freely, written only by a user action ------------ */
export function readTour() {
  try {
    const t = JSON.parse(localStorage.getItem(TOUR_KEY) || 'null');
    if (t && typeof t === 'object' && !Array.isArray(t)) {
      return { active: !!t.active, step: clampStep(t.step), dismissed: !!t.dismissed, finished: !!t.finished, hideList: !!t.hideList };
    }
  } catch (e) { /* blocked or garbled: a fresh tour */ }
  return { active: false, step: 0, dismissed: false, finished: false, hideList: false };
}
function writeTour(patch) {
  const next = { v: 1, ...readTour(), ...patch };
  try { localStorage.setItem(TOUR_KEY, JSON.stringify(next)); } catch (e) { /* private mode: the tour still runs this page */ }
  return next;
}
function clampStep(n) {
  const i = parseInt(n, 10);
  return Number.isFinite(i) ? Math.max(0, Math.min(STEPS.length - 1, i)) : 0;
}

/* ---- where am I --------------------------------------------------- */
export function pageId(path = location.pathname) {
  const last = String(path).split('/').pop() || 'index';
  return last.replace(/\.html$/, '') || 'index';
}
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

/* The sample's title, for "is the sample open". The hub already holds
   the sample JSON in its own chunk, so this import costs nothing there;
   it is only ever asked on the hub. */
let sampleTitle = null;
async function loadSampleTitle() {
  if (sampleTitle !== null) return sampleTitle;
  try { sampleTitle = String((await import('../data/sample.dragon.json')).default.title || ''); } catch (e) { sampleTitle = ''; }
  return sampleTitle;
}
const projects = () => { try { return Store.listProjects() || []; } catch (e) { return []; } };
const current = () => { try { return Store.currentProject() || null; } catch (e) { return null; } };

/* ---- the checklist's facts, derived -------------------------------- */
export function firstWeekFacts({ title = sampleTitle } = {}) {
  const open = current();
  const facts = { sample: !!title && projects().some((p) => p.title === title) };
  let scenes = [], script = { elements: [] }, story = {}, sheets = [];
  if (open) {
    try { scenes = listScenes(); } catch (e) { scenes = []; }
    try { script = loadScript() || script; } catch (e) { /* none */ }
    try { story = loadStory() || {}; } catch (e) { story = {}; }
    try { sheets = listCallSheets(); } catch (e) { sheets = []; }
  }
  let unscheduled = scenes.length;
  try { unscheduled = scenes.length ? unscheduledScenes(scenes).length : 0; } catch (e) { /* none */ }
  facts.story = !!(String(story.logline || '').trim() || String(story.source || '').trim());
  facts.script = Array.isArray(script.elements) && script.elements.length > 0;
  facts.scene = scenes.length > 0;
  facts.scheduled = scenes.length > 0 && unscheduled < scenes.length;
  facts.callsheet = sheets.length > 0;
  facts.shot = scenes.some((s) => s && s.shotState);
  return facts;
}

/* ---- the step card ------------------------------------------------- */
let pop = null, ring = null, chip = null, returnFocus = null, keyWired = false, waitTimer = 0;

/* Pages re-render their <main> (story.js, the hub) after this has drawn,
   which takes the ringed element with it. A rAF-throttled observer puts
   the ring back on the fresh copy; it touches attributes only on the
   anchor, never storage, and stops when the step closes. */
let ringObs = null, ringStep = null, ringQueued = false;
function watchRing(step) {
  ringStep = step;
  if (ringObs || typeof MutationObserver === 'undefined') return;
  ringObs = new MutationObserver(() => {
    if (ringQueued) return;
    ringQueued = true;
    requestAnimationFrame(() => {
      ringQueued = false;
      if (!ringStep || (ring && ring.isConnected)) return;
      const el = findAnchor(ringStep);
      if (el) { ring = el; el.setAttribute('data-tour-on', ''); }
    });
  });
  ringObs.observe(document.body, { childList: true, subtree: true });
}

function clearUI() {
  clearTimeout(waitTimer);
  if (ringObs) { ringObs.disconnect(); ringObs = null; }
  ringStep = null;
  if (pop) { pop.remove(); pop = null; }
  if (chip) { chip.remove(); chip = null; }
  if (ring) { ring.removeAttribute('data-tour-on'); ring = null; }
}

function findAnchor(step) {
  for (const sel of step.anchor || []) {
    let el = null;
    try { el = document.querySelector(sel); } catch (e) { el = null; }
    if (el && el.getClientRects().length) return el;
  }
  return null;
}

/** Steps whose anchors appear after the page's own render: wait a little. */
function whenAnchor(step, cb, tries = 60) {
  const el = findAnchor(step);
  if (el || tries <= 0) { cb(el); return; }
  waitTimer = setTimeout(() => whenAnchor(step, cb, tries - 1), 100);
}

function stepCard(i, opts = {}) {
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const body = opts.done && step.doneBody ? step.doneBody : step.body;
  const primary = opts.primary || (last
    ? { act: 'finish', text: step.action || 'Finish' }
    : { act: 'next', text: 'Next: ' + STEPS[i + 1].title.split(':')[0] });
  const card = h('div.tour-pop', {
    role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'tourTitle', 'aria-describedby': 'tourBody', tabindex: '-1'
  }, [
    h('p.tour-count', { text: 'Tour · step ' + (i + 1) + ' of ' + STEPS.length }),
    h('h2#tourTitle.tour-title', { text: step.title }),
    h('p#tourBody.tour-body', { text: body }),
    h('div.tour-actions', {}, [
      h('button.btn.primary', { type: 'button', 'data-tour-act': primary.act, text: primary.text }),
      i > 0 ? h('button.btn', { type: 'button', 'data-tour-act': 'back', text: 'Back' }) : null,
      h('button.btn.tour-end', { type: 'button', 'data-tour-act': 'end', text: 'End tour' })
    ]),
    h('p.tour-hint', { text: 'Esc ends the tour. You can start it again from the hub.' })
  ]);
  return card;
}

async function showStep(i, { focus = true } = {}) {
  clearUI();
  const step = STEPS[i];
  let opts = {};
  if (step.id === 'sample') {
    const title = await loadSampleTitle();
    const open = current();
    const sampleOpen = !!(open && title && open.title === title);
    opts = sampleOpen ? { done: true } : { primary: { act: 'sample', text: step.action || 'Open the sample' } };
  }
  whenAnchor(step, (el) => {
    if (el) {
      ring = el;
      el.setAttribute('data-tour-on', '');
      try { el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) { /* old engine */ }
    }
    pop = stepCard(i, opts);
    document.body.append(pop);
    watchRing(step);
    if (focus) {
      if (!returnFocus) returnFocus = document.activeElement;
      try { pop.focus({ preventScroll: true }); } catch (e) { pop.focus(); }
    }
  });
}

/* A tour that is running, on a page that is not its step's: a small
   chip that says where it is and how to get back. Never steals focus. */
function showChip(i) {
  clearUI();
  const step = STEPS[i];
  chip = h('div.tour-chip', { role: 'region', 'aria-label': 'Tour' }, [
    h('span.tour-chip-text', { text: 'Tour · step ' + (i + 1) + ' of ' + STEPS.length + ': ' + step.title.split(':')[0] }),
    h('a.btn.primary', { href: step.href, 'data-tour-act': 'continue', text: 'Continue' }),
    h('button.btn', { type: 'button', 'data-tour-act': 'end', text: 'End tour' })
  ]);
  document.body.append(chip);
}

function go(i) {
  const n = clampStep(i);
  writeTour({ active: true, step: n, dismissed: false });
  const step = STEPS[n];
  if (step.page === pageId()) { showStep(n); return; }
  location.href = step.href;
}

function end({ finished = false } = {}) {
  writeTour({ active: false, step: 0, dismissed: !finished, finished });
  clearUI();
  const back = returnFocus;
  returnFocus = null;
  if (back && back.isConnected && typeof back.focus === 'function') { try { back.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
  renderChecklist();
  if (finished && window.StudioUI && window.StudioUI.toast) window.StudioUI.toast('Tour finished. The first-week list on the hub keeps count.');
}

export function startTour() {
  returnFocus = document.activeElement;
  go(0);
}

function wire() {
  if (keyWired) return;
  keyWired = true;
  delegate(document, 'click', '[data-tour-act]', (e, el) => {
    const act = el.dataset.tourAct;
    const t = readTour();
    if (act === 'continue') return;                // a plain link
    e.preventDefault();
    if (act === 'next') go(t.step + 1);
    else if (act === 'back') go(t.step - 1);
    else if (act === 'end') end();
    else if (act === 'finish') end({ finished: true });
    else if (act === 'start') startTour();
    else if (act === 'resume') go(t.step);
    else if (act === 'hide-list') { writeTour({ hideList: true }); renderChecklist(); }
    else if (act === 'sample') {
      /* The sample is opened by the hub's own URL handler, the same one
         start.html links to; the tour stays on step 1 and redraws with
         "the sample is open" when the page comes back. */
      writeTour({ active: true, step: 0, dismissed: false });
      location.href = 'index.html?sample=1';
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || (!pop && !chip)) return;
    /* A page modal of its own (a dialog, the palette) takes Esc first. */
    if (document.body.classList.contains('pal-open')) return;   // the palette closes first
    const modal = [...document.querySelectorAll('[aria-modal="true"]')].find((m) => m !== pop && m.getClientRects().length);
    if (modal) return;
    e.preventDefault();
    end();
  });
}

/* ---- the hub's checklist ------------------------------------------- */
let listHost = null;
function renderChecklist() {
  if (pageId() !== 'index') return;
  const main = document.getElementById('main');
  if (!main) return;
  const t = readTour();
  if (t.hideList) { if (listHost) { listHost.remove(); listHost = null; } return; }
  const facts = firstWeekFacts();
  const items = data.checklist.items;
  const done = items.filter((it) => facts[it.id]).length;

  const sec = h('section#firstweek.section.tw-section', { 'aria-labelledby': 'twHeading', 'data-tour': 'checklist' });
  const ol = h('ol.tw-list');
  items.forEach((it) => {
    const ok = !!facts[it.id];
    ol.append(h('li.tw-item' + (ok ? '.is-done' : ''), {}, [
      h('span.tw-mark', { 'aria-hidden': 'true', text: ok ? '✓' : '' }),
      h('a.tw-link', { href: it.href }, [it.label, h('span.visually-hidden', { text: ok ? ' — done' : ' — not yet' })])
    ]));
  });
  const tourBtn = t.active
    ? h('button.btn.primary', { type: 'button', 'data-tour-act': 'resume', text: 'Resume the tour' })
    : h('button.btn.primary', { type: 'button', 'data-tour-act': 'start', text: t.finished ? 'Take the tour again' : 'Take the tour' });
  sec.append(h('div.section-inner', {}, [
    h('div.section-head', {}, [
      h('div.left', {}, [
        h('div.label', { text: data.checklist.label }),
        h('h2#twHeading', { text: data.checklist.title }),
        h('p.deck', { text: data.checklist.deck })
      ]),
      h('div.right', { text: done + ' OF ' + items.length + ' DONE' })
    ]),
    h('div.tw-meter', { role: 'img', 'aria-label': done + ' of ' + items.length + ' first-week items done' }, [
      h('span.tw-fill', { style: 'width:' + Math.round((done / items.length) * 100) + '%' })
    ]),
    ol,
    h('div.tw-actions', {}, [
      tourBtn,
      h('button.btn', { type: 'button', 'data-tour-act': 'hide-list', text: 'Hide this list' })
    ])
  ]));

  if (listHost && listHost.isConnected) { listHost.replaceWith(sec); listHost = sec; return; }
  const before = document.getElementById('journey');
  const after = document.getElementById('projects');
  if (before && before.parentNode) before.before(sec);
  else if (after && after.parentNode) after.after(sec);
  else main.append(sec);
  listHost = sec;
}

/* ---- boot ---------------------------------------------------------- */
let booted = false;
export async function boot() {
  if (booted) return;
  booted = true;
  wire();
  const here = pageId();
  if (here === 'index') {
    await loadSampleTitle();
    const draw = () => renderChecklist();
    /* The hub renders synchronously after its imports; this chunk lands
       after that, but wait for #main in case it does not. */
    const ready = (fn, n = 50) => (document.getElementById('main') ? fn() : n > 0 && setTimeout(() => ready(fn, n - 1), 100));
    ready(draw);
    Store.subscribe('projects:changed', () => { draw(); refreshStep(); });
    Store.subscribe('current:changed', () => { draw(); refreshStep(); });
    window.addEventListener('focus', draw);
  }
  const t = readTour();
  if (!t.active) return;
  const step = STEPS[t.step];
  if (step.page === here) showStep(t.step);
  else showChip(t.step);
}
/* The sample step redraws when the sample opens in place. */
function refreshStep() {
  const t = readTour();
  if (t.active && pop && STEPS[t.step].id === 'sample') showStep(t.step, { focus: false });
}

export default { boot, startTour, readTour, firstWeekFacts, pageId, TOUR_KEY };
