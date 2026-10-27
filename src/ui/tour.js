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
import { isDisabledEverywhere, entitlement, currentPlan, trialEndsAt, serverNow } from '../lib/plan-gate.js';
import '../styles/tour.css';

/* The tour's place (`fms_tour_v1`) is read and written by
   src/lib/tour-state.js, which owns the key; re-exported for importers. */
import { TOUR_KEY, readTourState, writeTourState, clampStep as clampStepOf } from '../lib/tour-state.js';
export { TOUR_KEY };
/* A step or checklist item naming a `module` is dropped while that module
   is switched off for everybody — the tour must not walk a reader to a
   "Not available" card. The switched-off ones are the LAST steps, so the
   stored step index of every step that stays is unchanged. */
const live = (x) => !(x && x.module) || !safeOff(x.module);
function safeOff(id) { try { return isDisabledEverywhere(id); } catch (e) { return false; } }
const STEPS = data.steps.filter(live);
const CHECK_ITEMS = data.checklist.items.filter(live);

/* ---- state: read freely, written only by a user action ------------ */
export function readTour() { return readTourState(STEPS.length); }
function writeTour(patch) { return writeTourState(patch, STEPS.length); }
function clampStep(n) { return clampStepOf(n, STEPS.length); }

/* ---- where am I --------------------------------------------------- */
export function pageId(path = location.pathname) {
  const last = String(path).split('/').pop() || 'index';
  return last.replace(/\.html$/, '') || 'index';
}
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

/* The sample's title, for "is the sample open". The hub already holds
   the sample JSON in its own chunk, so this import costs nothing there;
   it is only ever asked on the hub. */
/* ANY registered sample counts (src/lib/samples.js), so opening The
   Dark Knight ticks the step as Dragon does. */
let sampleMatch = null;
async function loadSampleTitle() {
  if (sampleMatch !== null) return sampleMatch;
  try { sampleMatch = (await import('../lib/samples.js')).isSampleTitle; } catch (e) { sampleMatch = () => false; }
  return sampleMatch;
}
const projects = () => { try { return Store.listProjects() || []; } catch (e) { return []; } };
const current = () => { try { return Store.currentProject() || null; } catch (e) { return null; } };

/* ---- the checklist's facts, derived -------------------------------- */
/* The first-week list's own horizon (its title says a week). Not a trial
   length: that is the server's. */
const WEEK_MS = 7 * 86400000;
export function firstWeekFacts({ match = sampleMatch } = {}) {
  const open = current();
  const facts = { sample: !!match && projects().some((p) => match(p.title)) };
  let scenes = [], script = { elements: [] }, story = {}, sheets = [];
  /* The sample ticks six of seven for free, which teaches nothing: the
     list measures the user's OWN film, so while the sample is the open
     project nothing but the sample item itself is read. */
  facts.onSample = !!(open && match && match(open.title));
  if (open && !facts.onSample) {
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
  /* "Choose a plan": the account's own state, not the film's, so it is
     read even on the sample. plan-gate.js knows it; signed out it is
     'unknown' and the item is not listed at all. */
  /* TICKED only for a plan actually bought: reason 'paid' is any
     entitled account that is not a trial or a grant, and a plan id of
     'free' under it is an account let in without buying, which has
     chosen nothing. LISTED for a bought plan, and for a trial that
     ends inside this list's own week: the §30 grandfather backfill is a
     trial too (a year long), and "Choose a plan" is not a first-week
     task for somebody whose access runs for months. A grant, an ended
     trial and an unknown state list nothing. */
  let reason = 'unknown', bought = false, soon = false;
  try {
    reason = entitlement().reason;
    const id = currentPlan().plan;
    /* A LAUNCH PASS (§61) is a few paid days, not a plan chosen: the item
       is listed for its whole length (it is a week long by design) and
       ticks only once a yearly plan is bought. */
    const pass = !!currentPlan().passActive;
    bought = reason === 'paid' && !!id && id !== 'free' && !pass;
    const ends = reason === 'trial' ? trialEndsAt() : null;
    soon = pass || (!!ends && ends.getTime() - serverNow() <= WEEK_MS);
  } catch (e) { reason = 'unknown'; }
  facts.planListed = bought || soon;
  facts.plan = bought;
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
    const match = await loadSampleTitle();
    const open = current();
    const sampleOpen = !!(open && match(open.title));
    opts = sampleOpen ? { done: true } : { primary: { act: 'sample', text: step.action || 'Open the sample' } };
  }
  whenAnchor(step, (el) => {
    if (el) {
      ring = el;
      el.setAttribute('data-tour-on', '');
      /* Centre a small anchor; a tall one (the whole screenplay, the
         breakdown) is shown from its TOP — centring a 100,000px section
         parked the reader in the middle of the script. */
      const tall = el.getBoundingClientRect().height > window.innerHeight * 0.6;
      try { el.scrollIntoView({ block: tall ? 'start' : 'center', behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) { /* old engine */ }
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
  renderInvite();
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
  renderInvite();
  if (finished && window.StudioUI && window.StudioUI.toast) window.StudioUI.toast('Tour finished. The first-week list on the hub keeps count.');
}

/** "Skip" on the home invitation: the tour's own dismissed state, nothing new. */
export function dismissTour() {
  writeTour({ active: false, step: 0, dismissed: true });
  renderInvite();
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
    else if (act === 'skip') dismissTour();
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

/* ---- the hub's invitation: shown until the tour is started, skipped or
   finished. It never starts anything by itself and never writes on load. */
let inviteHost = null;
function renderInvite() {
  if (pageId() !== 'index') return;
  const t = readTour();
  const show = !t.active && !t.dismissed && !t.finished;
  if (!show) { if (inviteHost) { inviteHost.remove(); inviteHost = null; } return; }
  if (inviteHost && inviteHost.isConnected) return;
  const inv = data.invite;
  inviteHost = h('div#tourInvite.tour-invite', { role: 'region', 'aria-label': 'Take the tour', 'data-tour': 'invite' }, [
    h('p.tour-invite-line', { text: inv.line }),
    h('div.tour-invite-actions', {}, [
      h('button.btn.primary', { type: 'button', 'data-tour-act': 'start', text: inv.start }),
      h('button.btn', { type: 'button', 'data-tour-act': 'skip', text: inv.skip })
    ])
  ]);
  const host = document.getElementById('tourInviteHost');
  if (host) host.replaceChildren(inviteHost);
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
  const items = CHECK_ITEMS.filter((it) => it.during !== 'trial' || facts.planListed);
  const onSample = !!facts.onSample;
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
  /* While the invitation above is on screen it is the one offer of the
     tour; the list would only say it a second time. ON SCREEN, not "would
     be shown": UI revamp 5 (12 Oct 2026) took #tourInviteHost off Home, so
     the invitation now has nowhere to draw, and reading the state alone
     hid this button too — a new reader's Home offered the tour nowhere,
     and Settings → Help was the only way in. */
  const inviting = !!(inviteHost && inviteHost.isConnected);
  const tourBtn = inviting ? null : t.active
    ? h('button.btn.primary', { type: 'button', 'data-tour-act': 'resume', text: 'Resume the tour' })
    : h('button.btn.primary', { type: 'button', 'data-tour-act': 'start', text: t.finished ? 'Take the tour again' : 'Take the tour' });
  sec.append(h('div.section-inner', {}, [
    h('div.section-head', {}, [
      h('div.left', {}, [
        h('div.label', { text: data.checklist.label }),
        h('h2#twHeading', { text: data.checklist.title }),
        h('p.deck', { text: data.checklist.deck }),
        onSample ? h('p.deck.tw-hint', { text: 'You are in the sample film, so these stay unticked. Start your own film to tick them off.' }) : null
      ].filter(Boolean)),
      h('div.right', { text: done + ' OF ' + items.length + ' DONE' })
    ]),
    h('div.tw-meter', { role: 'img', 'aria-label': done + ' of ' + items.length + ' first-week items done' }, [
      h('span.tw-fill', { style: 'width:' + Math.round((done / items.length) * 100) + '%' })
    ]),
    ol,
    h('div.tw-actions', {}, [
      tourBtn,
      h('button.btn', { type: 'button', 'data-tour-act': 'hide-list', text: 'Hide this list' })
    ].filter(Boolean))
  ]));

  if (listHost && listHost.isConnected) { listHost.replaceWith(sec); listHost = sec; return; }
  const before = document.getElementById('journey');
  const after = document.getElementById('top') || document.getElementById('projects');
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
    const draw = () => { renderInvite(); renderChecklist(); };
    /* The hub renders synchronously after its imports; this chunk lands
       after that, but wait for #main in case it does not. */
    const ready = (fn, n = 50) => (document.getElementById('main') ? fn() : n > 0 && setTimeout(() => ready(fn, n - 1), 100));
    ready(draw);
    Store.subscribe('projects:changed', () => { draw(); refreshStep(); });
    Store.subscribe('current:changed', () => { draw(); refreshStep(); });
    Store.subscribe('plan:changed', () => draw());   // the "Choose a plan" item follows the trial
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

export default { boot, startTour, dismissTour, readTour, firstWeekFacts, pageId, TOUR_KEY };
