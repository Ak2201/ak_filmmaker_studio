/* ============================================================
   THE BEAT GUIDE — the Story's beats beside the page you are on
   ------------------------------------------------------------
   docs/BLUEPRINT-REALIGN-PLAN.md, revision 3 §1b, the Write half.
   Mounted from write.js with one call, mountBeatGuide({ getDoc }),
   and self-contained after that, the way focus-mode.js and
   format-guide.js are.

   THREE SETTINGS, one pref. `beatGuide` inside the shared
   `fms_write_prefs_v1` object, written by READ-MERGE-WRITE through
   format-guide.js's own helpers — the guide level, the key preset and
   the focus prefs ride along untouched. No new storage key.
     off     the margin labels hidden, no panel.
     margin  the beat labels beat-board.js already draws (default).
     panel   the labels AND a card for the scene under the caret.
   Off is a class-free data attribute on <html> that one CSS rule
   reads; beat-board.js keeps drawing its markers exactly as before,
   so there is one implementation of a margin label, not two.

   WRITES NOTHING ELSE. The panel reads the story, the scene list and
   the page's in-memory script and draws; the pref is written from a
   `change` on the select and never on render or idle (the idle-write
   assertion in verify).

   CHEAP BY CONSTRUCTION. Nothing here runs per keystroke. A caret
   that moves to another row (focusin — click, Tab, Enter's own
   focus()) schedules ONE idle pass; typing in place only re-arms a
   1.2s timer. The pass is one scan of the elements plus the
   scene-to-heading join beat-outline.js already owns, and it touches
   the DOM only when what it would say has changed. In Off and Margin
   no pass runs at all.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import Scenes from '../lib/scenes.js';
import { loadStory, frameworkById, outlineByBeat, whereAt } from '../lib/story.js';
import FRAMEWORKS from '../data/frameworks.json';
import Outline from '../lib/beat-outline.js';
import { elementLines, LINES_PER_PAGE } from '../lib/script.js';
import { readPrefs, writePrefs } from './format-guide.js';
import '../styles/beat-guide.css';

const MODES = [
  { id: 'off',    label: 'Off' },
  { id: 'margin', label: 'Margin' },
  { id: 'panel',  label: 'Panel' }
];
const DEFAULT_MODE = 'margin';
const PREF = 'beatGuide';
const STORY_LINK = 'story.html#path-4';

const root = document.documentElement;
let getDoc = () => ({ elements: [] });
let mode = DEFAULT_MODE;
let caretId = '';          // the row the caret was last in
/* Collapsed or not: view state, in memory only. Starts closed on a
   phone, where an open card is a third of the screen. */
let openCard = !(typeof matchMedia === 'function' && matchMedia('(max-width: 719px)').matches);
let lastSig = '';
let idleHandle = 0;
let typeTimer = 0;

function readMode() {
  const m = readPrefs()[PREF];
  return MODES.some((x) => x.id === m) ? m : DEFAULT_MODE;
}

function applyMode() {
  root.setAttribute('data-beat-guide', mode);
}

/* ---- the control ---------------------------------------------- */
function control() {
  const sel = h('select#bg-mode.bg-mode', { 'data-bg': 'mode', 'aria-describedby': 'bg-mode-hint' });
  for (const m of MODES) {
    const opt = h('option', { value: m.id, text: m.label });
    if (m.id === mode) opt.selected = true;
    sel.append(opt);
  }
  return h('div.bg-ctl', {}, [
    h('label.bg-ctl-lab', { for: 'bg-mode', text: 'Beat guide' }),
    sel,
    h('span.bg-hint.visually-hidden', {
      id: 'bg-mode-hint',
      text: 'Off hides the beat labels. Margin shows them above each beat’s first scene. '
          + 'Panel adds a card for the scene you are writing.'
    })
  ]);
}

function ensureControl() {
  const sec = document.getElementById('screenplay');
  if (!sec) return;
  if (!sec.querySelector('#bg-mode')) {
    const host = sec.querySelector('.wr-export') || sec.querySelector('.wr-bar');
    if (host) host.prepend(control());
  }
  ensurePanel();
}

/* ---- deriving what the panel says ------------------------------ */
function headingIndexAt(els, idx) {
  for (let i = Math.min(idx, els.length - 1); i >= 0; i--) {
    if (els[i] && els[i].type === 'scene' && String(els[i].text ?? '').trim()) return i;
  }
  return -1;
}

/** Everything the card shows, or null when there is no script. Pure
    apart from reading the story and the scene list. */
export function derive(els, rowId) {
  if (!els || !els.length) return null;
  let idx = rowId ? els.findIndex((e) => e.id === rowId) : -1;
  if (idx < 0) idx = 0;

  let before = 0, total = 0;
  for (let i = 0; i < els.length; i++) {
    const n = elementLines(els[i]);
    if (i < idx) before += n;
    total += n;
  }
  const totalPages = total / LINES_PER_PAGE;
  const page = Math.floor(before / LINES_PER_PAGE) + 1;
  const pos = total ? before / total : 0;

  const story = loadStory();
  const known = FRAMEWORKS.frameworks.some((f) => f.id === story.framework);
  const fw = frameworkById(story.framework);
  const ordered = [...fw.beats].sort((a, b) => a.at - b.at);

  const head = headingIndexAt(els, idx);
  let scene = null, beat = null, how = 'estimated', from = null;
  if (head >= 0) {
    const spans = Outline.sceneSpans(Scenes.listScenes(), els);
    const sp = spans.find((s) => s.start === head);
    if (sp) {
      scene = sp.scene;
      const r = Outline.resolveBeat(sp.scene.beatId, fw.id);
      if (r) { beat = r.beat; how = r.inferred ? 'inferred' : 'linked'; from = r.from; }
    }
  }
  const where = whereAt(fw.id, pos);
  if (!beat) beat = where.nearest;
  const next = how === 'estimated'
    ? where.next
    : ordered.find((b) => b.at > beat.at) || null;

  const ob = outlineByBeat(story, fw.id);
  const row = ob.beats.find((r) => r.beat.id === beat.id);
  const steps = row ? row.steps.filter((s) => String(s.text || '').trim()) : [];

  const pageOf = (at) => Math.max(1, Math.round(at * totalPages) || 1);
  return {
    fw, known, beat, how, from, next, steps,
    hasOutline: ob.withText > 0,
    scene, heading: head >= 0 ? String(els[head].text || '').trim() : '',
    page, totalPages, pos,
    expectedPage: pageOf(beat.at),
    nextPage: next ? pageOf(next.at) : 0
  };
}

/* ---- the card --------------------------------------------------- */
const pct = (x) => Math.round(x * 100) + '%';

function body(d) {
  const out = [];
  if (!d.known) {
    out.push(h('p.bg-note', {
      text: 'No beat sheet format is picked on the Story page, so this follows '
          + d.fw.label + ', the studio’s default.'
    }));
  }
  out.push(h('p.bg-prompt', { text: d.beat.prompt || 'No prompt is written for this beat.' }));

  const whereText = d.how === 'estimated'
    ? 'This scene has no beat yet, so the beat is estimated from where you are: '
      + pct(d.pos) + ' of the way through.'
    : d.how === 'inferred' && d.from
      ? 'Linked in ' + d.from.fw.label + ' to ' + d.from.beat.label + '; the nearest ' + d.fw.short + ' beat.'
      : 'Linked to this scene on the Outline tab.';
  out.push(h('p.bg-where', { text: whereText }));
  out.push(h('p.bg-pages', {}, [
    h('strong', { text: 'Expected around p. ' + d.expectedPage }),
    ', you are on p. ' + d.page + ' of ' + Math.max(1, Math.ceil(d.totalPages)) + '.'
  ]));

  if (d.steps.length) {
    out.push(h('h4.bg-sub', { text: 'Your step outline for this beat' }));
    out.push(h('ol.bg-steps', {}, d.steps.map((s) => h('li', {
      text: s.text.length > 320 ? s.text.slice(0, 317).trimEnd() + '…' : s.text
    }))));
    out.push(h('p.bg-link', {}, [h('a', { href: STORY_LINK, text: 'Open in Story' })]));
  } else if (!d.hasOutline) {
    out.push(h('p.bg-note', {
      text: 'No step outline on the Story page yet. The beats here are ' + d.fw.label + '’s.'
    }));
    out.push(h('p.bg-link', {}, [h('a', { href: STORY_LINK, text: 'Plan the beats in Story' })]));
  } else {
    out.push(h('p.bg-note', { text: 'No outline step is written for this beat.' }));
    out.push(h('p.bg-link', {}, [h('a', { href: STORY_LINK, text: 'Open in Story' })]));
  }

  out.push(h('p.bg-next', {}, d.next
    ? [h('span.bg-next-lab', { text: 'Next beat' }), ' ' + d.next.label + ' · around p. ' + d.nextPage]
    : [h('span.bg-next-lab', { text: 'Next beat' }), ' none — this is the last beat of ' + d.fw.short + '.']));
  return out;
}

function signature(d) {
  if (!d) return 'none';
  return [d.fw.id, d.known, d.beat.id, d.how, d.from && d.from.beat.id, d.next && d.next.id,
    d.page, d.expectedPage, d.nextPage, Math.ceil(d.totalPages), Math.round(d.pos * 100),
    d.hasOutline, d.steps.map((s) => s.id + ':' + s.text.length).join(',')].join('|');
}

function ensurePanel() {
  const page = document.getElementById('wr-page');
  const old = document.getElementById('bg-panel');
  if (mode !== 'panel' || !page) {
    if (old) old.remove();
    setShift(false);
    decidedFor = '';
    lastSig = '';
    return;
  }
  if (old && old.nextElementSibling === page) { place(); return; }
  if (old) old.remove();
  const card = h('details#bg-panel.bg-panel', { 'aria-label': 'Beat guide' }, [
    h('summary.bg-summary', {}, [
      h('span.bg-eyebrow', { text: 'Beat' }),
      h('span.bg-beat', { 'data-bg': 'beat', text: '…' }),
      h('span.bg-at', { 'data-bg': 'at', text: '' })
    ]),
    h('div.bg-body', { 'data-bg': 'body' })
  ]);
  if (openCard) card.open = true;
  page.before(card);
  lastSig = '';
  watchPage(page);
  place();
  schedule();
}

/* ---- where the card goes ----------------------------------------
   NEVER OVER THE TEXT. The script is a fixed-width column; when the
   viewport leaves a gutter to its right wide enough for the card, the
   card is pinned there (fixed, under the band and anything parked
   under it), sized to the gutter. When it does not — a narrow desk, a
   tablet, a phone — the card stays where it sits in the flow, above
   the page, and scrolls with it. One measurement, of the page's right
   edge against the viewport's, re-taken on a resize, when the page's
   width changes (page view) and after a render; it writes custom
   properties on the card, which is outside the observed element, so
   there is no observer loop. */
const GUTTER_MIN = 248;     // the narrowest card worth pinning, px
const GUTTER_MAX = 368;
const GAP = 16;
let watched = null;
let pageObs = null;
let lastW = -1;
let placeQueued = false;

let decidedFor = '';        // the layout the shift decision was made for
let shifted = false;

/** Room to the right of the page as laid out now, in px. */
function roomNow(page) {
  return document.documentElement.clientWidth - page.getBoundingClientRect().right - 2 * GAP;
}

function place() {
  const card = document.getElementById('bg-panel');
  const page = document.getElementById('wr-page');
  if (!card || !page) { setShift(false); decidedFor = ''; return; }
  /* Decide centred / left-aligned / in flow ONCE per layout — the
     viewport width, the page's width and page view — by trying centred
     and, only if that is too narrow, left-aligned. Both are measured,
     never predicted, so the section's padding and the page's own
     width are whatever the stylesheets say. Toggling the attribute
     restyles the document, so it happens only when that layout key
     changes; a caret move reuses the decision and reads one rect. */
  const key = document.documentElement.clientWidth + '|' + page.offsetWidth
    + '|' + page.classList.contains('is-pageview');
  if (key !== decidedFor) {
    setShift(false);
    if (roomNow(page) < GUTTER_MIN) {
      setShift(true);
      if (roomNow(page) < GUTTER_MIN) setShift(false);
    }
    decidedFor = key;
  }
  const room = roomNow(page);
  const gutter = room >= GUTTER_MIN;
  card.classList.toggle('is-gutter', gutter);
  if (gutter) {
    card.style.setProperty('--bg-left', Math.round(page.getBoundingClientRect().right + GAP) + 'px');
    card.style.setProperty('--bg-w', Math.round(Math.min(GUTTER_MAX, room)) + 'px');
  } else {
    card.style.removeProperty('--bg-left');
    card.style.removeProperty('--bg-w');
  }
}
/* PANEL MODE ONLY: the screenplay section gives up its centring when
   that is what makes room for the gutter card. Off and Margin never
   set it, and leaving Panel removes it. */
function setShift(on) {
  if (on === shifted && on === root.hasAttribute('data-bg-shift')) return;
  shifted = on;
  if (on) root.setAttribute('data-bg-shift', '');
  else root.removeAttribute('data-bg-shift');
}
function queuePlace() {
  if (placeQueued) return;
  placeQueued = true;
  requestAnimationFrame(() => { placeQueued = false; place(); });
}
function watchPage(page) {
  if (watched === page || typeof ResizeObserver !== 'function') return;
  if (pageObs) pageObs.disconnect();
  watched = page;
  lastW = -1;
  pageObs = new ResizeObserver((entries) => {
    const w = Math.round(entries[0].contentRect.width);
    if (w === lastW) return;            // a row added changes the height only
    lastW = w;
    queuePlace();
  });
  pageObs.observe(page);
}

function draw() {
  idleHandle = 0;
  if (mode !== 'panel') return;
  ensurePanel();
  const card = document.getElementById('bg-panel');
  if (!card) return;
  const doc = getDoc() || {};
  let d = null;
  try { d = derive(doc.elements || [], caretId); } catch (e) { d = null; }
  const sig = signature(d);
  if (sig === lastSig) return;
  lastSig = sig;
  const beatNode = card.querySelector('[data-bg="beat"]');
  const atNode = card.querySelector('[data-bg="at"]');
  const bodyNode = card.querySelector('[data-bg="body"]');
  if (!d) {
    beatNode.textContent = 'nothing to place yet';
    atNode.textContent = '';
    bodyNode.replaceChildren(h('p.bg-note', { text: 'Write a scene heading and the guide will place it.' }));
    return;
  }
  beatNode.textContent = d.beat.label + (d.how === 'estimated' ? ' (estimated)' : '');
  atNode.textContent = 'p. ' + d.page + ' · expected p. ' + d.expectedPage;
  card.dataset.how = d.how;
  bodyNode.replaceChildren(...body(d));
}

function schedule() {
  if (mode !== 'panel' || idleHandle) return;
  if (typeof requestIdleCallback === 'function') {
    idleHandle = requestIdleCallback(draw, { timeout: 400 });
  } else {
    idleHandle = setTimeout(draw, 120);
  }
}

/* ---- wiring ------------------------------------------------------ */
function setMode(m) {
  if (!MODES.some((x) => x.id === m) || m === mode) return;
  mode = m;
  writePrefs({ [PREF]: m });            // read, merge, write
  applyMode();
  ensurePanel();
  if (mode === 'panel') schedule();
}

/** Called once by write.js. ctx = { getDoc }. */
export function mountBeatGuide(ctx) {
  if (ctx && typeof ctx.getDoc === 'function') getDoc = ctx.getDoc;
  mode = readMode();
  applyMode();

  delegate(document, 'change', 'select[data-bg="mode"]', (e, sel) => setMode(sel.value));
  delegate(document, 'toggle', '#bg-panel', (e, card) => { openCard = card.open; }, true);

  document.addEventListener('focusin', (e) => {
    if (mode !== 'panel') return;
    const row = e.target && e.target.closest && e.target.closest('#wr-page [data-el]');
    if (!row || row.dataset.el === caretId) return;
    caretId = row.dataset.el;
    schedule();
  });
  document.addEventListener('input', (e) => {
    if (mode !== 'panel') return;
    if (!e.target || !e.target.closest || !e.target.closest('#wr-page')) return;
    clearTimeout(typeTimer);
    typeTimer = setTimeout(schedule, 1200);
  });

  window.addEventListener('resize', queuePlace, { passive: true });

  const app = document.getElementById('app');
  ensureControl();
  if (app && typeof MutationObserver === 'function') {
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; ensureControl(); schedule(); });
    }).observe(app, { childList: true });
  }
}

export default { mountBeatGuide, derive };
