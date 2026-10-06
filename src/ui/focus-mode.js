/* ============================================================
   FOCUS MODE — the page and nothing else (write.html only)
   ------------------------------------------------------------
   Phase 4 of docs/SCREENPLAY-WRITER-PLAN.md. Ctrl/Cmd+Shift+F or the
   FOCUS button beside the screenplay's Export menu hides the shell's
   band, the rail, the tab strip, the footer, the mobile action bar and
   every panel that is not the script, and centres the page. Esc or the
   same keys come back out.

   WHAT IT IS MADE OF, and why each piece is shaped the way it is:

     • ONE CLASS ON <html>. `fm-on` on documentElement, read by
       focus-mode.css. Nothing is removed from the DOM — the tab strip,
       the shell and the verify gate all read the document as it is —
       and the class sits OUTSIDE every observed subtree (the shell
       watches .sh-bar, tabs.js and the shell's guesser watch #app,
       watermark.js watches <body>'s attributes), so turning focus on
       re-runs nobody's observer.
     • THE BUTTON IS RE-INJECTED, not built by write.js. write.js
       replaces `main` on every render(); a childList observer on #app
       (not subtree) puts the button back. That keeps write.js's share
       of this feature to one import line and one call.
     • NIGHT is the existing ink theme: `data-theme="dark"` on <html>
       for as long as focus lasts, and the previous value put back
       after. No palette is declared here and nothing is persisted —
       chrome.js's theme preference is never written.
     • TYPEWRITER keeps the caret's line about a third of the way down
       the viewport. The script face is fixed-width (`--f-script`), so
       the caret's line is ARITHMETIC — the advance of one glyph, the
       column width, a greedy word wrap — and never a mirror element
       laid out per keystroke. One getBoundingClientRect per frame,
       read in rAF after write.js's own handler has run. `--motion: 0`
       (reduced motion) scrolls instantly.
     • DIM THE REST marks the current scene's rows with a DATA
       attribute (write.js assigns `row.className` on a type change, so
       a class would be wiped), walking siblings from the focused row to
       the scene headings either side — one scene's rows, not the
       script's.
     • GOALS are src/lib/write-goals.js. This file only paints them.

   STORAGE. Two places, both written only by a user action or a save:
     fms_write_goals_v1  per project — the tracker writes it after a
                         SCRIPT save, never on a timer (see write-goals).
     fms_write_prefs_v1  per device — the marker / dim / night choices,
                         as extra fields READ, MERGED and written back,
                         because the format guide owns the same key and
                         its fields must survive ours. Written only when
                         one of these three controls changes.
   The sprint stopwatch is memory only; its tick touches a text node's
   `.data` (a characterData mutation, which no observer here watches).
   ============================================================ */
import { subscribe } from '../lib/store.js';
import { h, delegate } from '../lib/dom.js';
import { revealTarget } from './tabs.js';
import { isPaletteOpen } from './palette.js';
import Goals, { GOAL_KINDS } from '../lib/write-goals.js';
import '../styles/focus-mode.css';

const PREFS_KEY = 'fms_write_prefs_v1';
const SCRIPT_KEY = 'fms_script_v1';
const MARKERS = [
  { id: 'frame', label: 'Frame' },
  { id: 'line',  label: 'Line' },
  { id: 'none',  label: 'None' }
];
/** Where the caret's line is held, as a share of the viewport height. */
const TYPE_AT = 1 / 3;

const root = document.documentElement;
let getDoc = () => ({ elements: [] });
let tracker = null;

let on = false;
let prefs = { marker: 'frame', dim: true, night: true };
let themeBefore = undefined;      // the data-theme we replaced, or null
let themeSet = false;
let fullscreenOurs = false;
let lastTa = null;                // the last script field that had focus
let lastSel = [0, 0];
let pointerDown = false;
let curRows = [];

/* ---- per-device prefs, merged ------------------------------- */
function readPrefsBlob() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const o = raw ? JSON.parse(raw) : {};
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch (e) { return {}; }
}
function loadPrefs() {
  const o = readPrefsBlob();
  if (MARKERS.some((m) => m.id === o.focusMarker)) prefs.marker = o.focusMarker;
  if (typeof o.focusDim === 'boolean') prefs.dim = o.focusDim;
  if (typeof o.focusNight === 'boolean') prefs.night = o.focusNight;
}
function savePrefs() {
  // READ, MERGE, WRITE — the format guide's fields ride along untouched.
  const o = readPrefsBlob();
  o.focusMarker = prefs.marker;
  o.focusDim = prefs.dim;
  o.focusNight = prefs.night;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(o)); } catch (e) { /* private mode */ }
}

/* ---- the entry button --------------------------------------- */
function focusButton() {
  return h('button.btn.fm-enter', {
    type: 'button',
    id: 'fm-enter',
    'data-action': 'fm-enter',
    'aria-keyshortcuts': 'Control+Shift+F Meta+Shift+F',
    title: 'Focus mode — only the page (Ctrl/⌘ + Shift + F)',
    text: 'Focus'
  });
}
/** A stable host inside whatever write.js last rendered: beside the
    Export menu if it exists, else on the screenplay bar, else under the
    section's heading. Idempotent. */
function injectButton() {
  if (document.getElementById('fm-enter')) return;
  const sec = document.getElementById('screenplay');
  if (!sec) return;
  const host = sec.querySelector('.wr-export') || sec.querySelector('.wr-bar');
  if (host) { host.prepend(focusButton()); return; }
  const head = sec.querySelector('h2');
  if (head) head.after(focusButton());
}

/* ---- the HUD -------------------------------------------------- */
let hud = null;
let bar = null;
let nodes = {};
const txt = (s) => document.createTextNode(s);

function buildHud() {
  nodes.goalText = txt('');
  nodes.sprintText = txt('0:00');
  nodes.todayText = txt('');

  bar = h('div.fm-bar', {
    role: 'progressbar', 'aria-label': 'Session goal',
    'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', hidden: true
  }, [h('span.fm-bar-fill')]);

  const kindSel = h('select.fm-goal-kind', { id: 'fm-goal-kind', 'data-fm': 'goal-kind', 'aria-label': 'Goal measured in' });
  GOAL_KINDS.forEach((k) => kindSel.append(h('option', { value: k.id, text: k.label })));
  const target = h('input.fm-goal-target', {
    id: 'fm-goal-target', type: 'number', min: '0', inputmode: 'decimal',
    'data-fm': 'goal-target', 'aria-label': 'Session goal'
  });
  const marker = h('select.fm-marker', { id: 'fm-marker', 'data-fm': 'marker', 'aria-label': 'Typewriter marker' });
  MARKERS.forEach((m) => marker.append(h('option', { value: m.id, text: m.label })));
  const check = (id, key, label) => h('label.fm-check', {}, [
    h('input', { type: 'checkbox', id, 'data-fm': key }), h('span', { text: label })
  ]);

  nodes.kindSel = kindSel;
  nodes.target = target;
  nodes.marker = marker;
  nodes.hist = h('ol.fm-hist', { 'aria-label': 'Written per day, last seven days' });
  nodes.opts = h('div.fm-opts', { id: 'fm-opts', hidden: true, role: 'group', 'aria-label': 'Focus options' }, [
    h('div.fm-opt-row', {}, [
      h('label.fm-field', { for: 'fm-goal-target' }, [h('span', { text: 'Goal' })]),
      target, kindSel
    ]),
    h('div.fm-opt-row', {}, [
      h('label.fm-field', { for: 'fm-marker' }, [h('span', { text: 'Marker' })]),
      marker
    ]),
    h('div.fm-opt-row', {}, [
      check('fm-dim', 'dim', 'Dim the rest'),
      check('fm-night', 'night', 'Night')
    ]),
    h('div.fm-opt-row', {}, [
      h('button.btn.fm-btn', { type: 'button', 'data-action': 'fm-fullscreen', text: 'Full screen' })
    ]),
    h('p.fm-today', {}, [nodes.todayText]),
    nodes.hist
  ]);

  nodes.optsBtn = h('button.btn.fm-btn', {
    type: 'button', 'data-action': 'fm-opts',
    'aria-expanded': 'false', 'aria-controls': 'fm-opts', text: 'Options'
  });
  nodes.sprintBtn = h('button.btn.fm-btn', { type: 'button', 'data-action': 'fm-sprint', text: 'Start sprint' });

  hud = h('div.fm-hud', { id: 'fm-hud', role: 'region', 'aria-label': 'Focus mode', hidden: true }, [
    nodes.opts,
    h('div.fm-hud-row', {}, [
      h('button.btn.fm-btn.fm-exit', {
        type: 'button', 'data-action': 'fm-exit',
        'aria-keyshortcuts': 'Escape', title: 'Leave focus mode (Esc)', text: 'Exit focus'
      }),
      h('span.fm-goal', {}, [nodes.goalText]),
      h('span.fm-sprint', { 'aria-label': 'Sprint time' }, [nodes.sprintText]),
      nodes.sprintBtn,
      h('button.btn.fm-btn', { type: 'button', 'data-action': 'fm-sprint-reset', text: 'Reset' }),
      nodes.optsBtn
    ])
  ]);
  document.body.append(bar, hud);
}

function syncControls() {
  nodes.kindSel.value = tracker.state.goal.kind;
  nodes.target.value = String(tracker.state.goal.target);
  const k = GOAL_KINDS.find((x) => x.id === tracker.state.goal.kind);
  nodes.target.step = String(k ? k.step : 1);
  nodes.marker.value = prefs.marker;
  document.getElementById('fm-dim').checked = prefs.dim;
  document.getElementById('fm-night').checked = prefs.night;
}

/* ---- goal painting (DOM only) -------------------------------- */
const fmtNum = (n, dp) => (dp ? (Math.round(n * 10) / 10).toFixed(1) : String(Math.round(n)));
function paintGoal() {
  if (!hud || !tracker) return;
  const goal = tracker.state.goal;
  const p = Goals.progress(goal, tracker.session(), sprintMs());
  const dp = goal.kind === 'pages';
  const s = fmtNum(p.done, dp) + ' / ' + fmtNum(p.target, dp) + ' ' + goal.kind;
  if (nodes.goalText.data !== s) nodes.goalText.data = s;
  const pct = Math.round(p.ratio * 100);
  if (bar.getAttribute('aria-valuenow') !== String(pct)) {
    bar.setAttribute('aria-valuenow', String(pct));
    bar.setAttribute('aria-valuetext', s);
    bar.firstChild.style.width = (p.ratio * 100) + '%';
    bar.classList.toggle('is-done', p.ratio >= 1);
  }
}
function paintHistory() {
  if (!tracker) return;
  const rows = Goals.history(tracker.state, 7);
  const today = rows[rows.length - 1];
  nodes.todayText.data = 'Today: ' + signed(today.words) + ' words, '
    + signed(Math.round(today.pages * 10) / 10, 1) + ' pages';
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  nodes.hist.replaceChildren(...rows.map((r) => h('li', {}, [
    h('span.fm-hist-day', { text: DAYS[r.date.getDay()] }),
    h('span.fm-hist-num', { text: signed(r.words) + ' w' })
  ])));
}
const signed = (n, dp) => (n > 0 ? '+' : '') + (dp ? n.toFixed(1) : String(Math.round(n)));

/* ---- the sprint stopwatch (memory only) ---------------------- */
let sprintAcc = 0;
let sprintFrom = 0;
let sprintTick = 0;
const sprintMs = () => sprintAcc + (sprintFrom ? Date.now() - sprintFrom : 0);
function paintSprint() {
  const s = Math.floor(sprintMs() / 1000);
  const t = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  if (nodes.sprintText.data !== t) nodes.sprintText.data = t;
  if (tracker && tracker.state.goal.kind === 'minutes') paintGoal();
}
function sprintToggle() {
  if (sprintFrom) {
    sprintAcc += Date.now() - sprintFrom;
    sprintFrom = 0;
    clearInterval(sprintTick); sprintTick = 0;
  } else {
    sprintFrom = Date.now();
    sprintTick = setInterval(paintSprint, 1000);   // DOM only, never storage
  }
  nodes.sprintBtn.textContent = sprintFrom ? 'Pause' : (sprintAcc ? 'Resume' : 'Start sprint');
  paintSprint();
}
function sprintReset() {
  sprintAcc = 0;
  if (sprintFrom) sprintFrom = Date.now();
  nodes.sprintBtn.textContent = sprintFrom ? 'Pause' : 'Start sprint';
  paintSprint();
}

/* ---- current scene ------------------------------------------- */
const isRow = (n) => n && n.nodeType === 1 && n.hasAttribute('data-el');
const isScene = (row) => row.classList.contains('t-scene') || row.dataset.type === 'scene';
/** The row before/after this one in document order, across runs. */
function stepRow(row, dir) {
  let n = dir < 0 ? row.previousElementSibling : row.nextElementSibling;
  let run = row.parentElement;
  for (;;) {
    while (n && !isRow(n)) n = dir < 0 ? n.previousElementSibling : n.nextElementSibling;
    if (n) return n;
    run = run && (dir < 0 ? run.previousElementSibling : run.nextElementSibling);
    if (!run || !run.classList || !run.classList.contains('wr-chunk')) return null;
    n = dir < 0 ? run.lastElementChild : run.firstElementChild;
  }
}
function markScene(row) {
  /* The common case is Return: a new row under one already marked. It
     joins the scene without walking it again. */
  if (row && !isScene(row) && !row.hasAttribute('data-fm-cur') && curRows.length
      && curRows[0].isConnected) {
    const p = stepRow(row, -1);
    const n = stepRow(row, 1);
    if (p && p.hasAttribute('data-fm-cur') && (!n || isScene(n) || n.hasAttribute('data-fm-cur'))) {
      row.setAttribute('data-fm-cur', '');
      curRows.push(row);
      return;
    }
  }
  // Same scene, nothing moved: a marked body row, or the marked heading
  // still being a heading. A row that changed type falls through.
  if (row && row.hasAttribute('data-fm-cur') && curRows.length && curRows[0].isConnected
      && (row === curRows[0] ? isScene(row) : !isScene(row))) {
    return;
  }
  const next = [];
  if (row) {
    let a = row;
    // back to this scene's heading (inclusive)
    while (a && !isScene(a)) { const p = stepRow(a, -1); if (!p) break; a = p; }
    let r = a;
    next.push(r);
    for (r = stepRow(r, 1); r && !isScene(r); r = stepRow(r, 1)) next.push(r);
  }
  const keep = new Set(next);
  curRows.forEach((r) => { if (!keep.has(r)) r.removeAttribute('data-fm-cur'); });
  next.forEach((r) => { if (!r.hasAttribute('data-fm-cur')) r.setAttribute('data-fm-cur', ''); });
  curRows = next;
}
function clearScene() {
  curRows.forEach((r) => r.removeAttribute('data-fm-cur'));
  curRows = [];
}

/* ---- typewriter ---------------------------------------------- */
const metricCache = new WeakMap();
let canvas = null;
function metricsOf(ta) {
  let m = metricCache.get(ta);
  if (m) return m;
  const cs = getComputedStyle(ta);
  const font = [cs.fontStyle, cs.fontWeight, cs.fontSize, cs.fontFamily].join(' ');
  canvas = canvas || document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = font;
  const cw = ctx.measureText('M'.repeat(40)).width / 40 || parseFloat(cs.fontSize) * 0.6;
  const fs = parseFloat(cs.fontSize) || 16;
  const lh = parseFloat(cs.lineHeight) || fs * 1.45;
  m = {
    cw, lh,
    top: parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth),
    padX: parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
  };
  metricCache.set(ta, m);
  return m;
}
function wrapLines(seg, cpl) {
  if (!seg) return 1;
  let lines = 1;
  let col = 0;
  for (const word of seg.split(' ')) {
    const w = word.length;
    if (col === 0) col = w;
    else if (col + 1 + w <= cpl) col += 1 + w;
    else { lines++; col = w; }
    while (col > cpl) { lines++; col -= cpl; }
  }
  return lines;
}
/** The caret's line, in viewport px, for a fixed-width textarea. */
function caretY(ta) {
  const m = metricsOf(ta);
  const r = ta.getBoundingClientRect();
  const cpl = Math.max(1, Math.floor((ta.clientWidth - m.padX) / m.cw));
  const before = ta.value.slice(0, ta.selectionEnd || 0).split('\n');
  let line = 0;
  for (let i = 0; i < before.length - 1; i++) line += wrapLines(before[i], cpl);
  line += wrapLines(before[before.length - 1], cpl) - 1;
  return r.top + m.top + (line + 0.5) * m.lh;
}
function motionOn() {
  const v = parseFloat(getComputedStyle(root).getPropertyValue('--motion'));
  return !(v === 0);
}
let twFrame = 0;
let twSmooth = true;
let twSkip = false;
let sceneOwed = false;
function typewriterSoon(smooth, markOnly) {
  if (!on) return;
  twSmooth = smooth;
  twSkip = !!markOnly;
  if (twFrame) return;
  twFrame = requestAnimationFrame(() => {
    twFrame = 0;
    const ta = document.activeElement;
    if (!on || !ta || !ta.matches || !ta.matches('#wr-page textarea')) return;
    if (sceneOwed) { sceneOwed = false; markScene(ta.closest('[data-el]')); }
    if (twSkip) { twSkip = false; return; }   // a click: mark, do not scroll
    const y = caretY(ta);
    const target = window.innerHeight * TYPE_AT;
    const delta = y - target;
    const m = metricsOf(ta);
    if (Math.abs(delta) < m.lh / 3) return;
    /* A line or two — every Return, every wrap — is a STEP, like the
       carriage it is named after: instant, and one frame of work. Only
       a longer jump (PageDown, a click far away) glides, and only when
       --motion allows travel at all. A glide per keystroke keeps the
       page animating under the next Return. */
    const glide = twSmooth && Math.abs(delta) > m.lh * 3 && motionOn();
    window.scrollBy({ top: delta, behavior: glide ? 'smooth' : 'instant' });
  });
}
function publishLine() {
  // The Line marker's band sits where the caret is held.
  root.style.setProperty('--fm-type-y', Math.round(window.innerHeight * TYPE_AT) + 'px');
  const ta = lastTa && lastTa.isConnected ? lastTa : document.querySelector('#wr-page textarea');
  if (ta) root.style.setProperty('--fm-line-h', Math.round(metricsOf(ta).lh) + 'px');
}

/* ---- enter / exit -------------------------------------------- */
function applyPrefs() {
  root.classList.toggle('fm-dim', prefs.dim);
  root.classList.remove('fm-mk-frame', 'fm-mk-line', 'fm-mk-none');
  root.classList.add('fm-mk-' + prefs.marker);
  if (!on) return;
  if (prefs.night && !themeSet) {
    themeBefore = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'dark');
    themeSet = true;
  } else if (!prefs.night && themeSet) {
    restoreTheme();
  }
}
function restoreTheme() {
  if (!themeSet) return;
  themeSet = false;
  // Only undo OUR change: a theme picked during focus (Ctrl+D) stays.
  if (root.getAttribute('data-theme') !== 'dark') return;
  if (themeBefore == null) root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', themeBefore);
}

function rememberCaret(ta) {
  lastTa = ta;
  try { lastSel = [ta.selectionStart, ta.selectionEnd]; } catch (e) { lastSel = [0, 0]; }
}

export function enterFocus({ fullscreen = false } = {}) {
  if (on) return;
  if (!hud) buildHud();
  const act = document.activeElement;
  if (act && act.matches && act.matches('#wr-page textarea')) rememberCaret(act);
  revealTarget('screenplay');
  on = true;
  root.classList.add('fm-on');
  applyPrefs();
  syncControls();
  hud.hidden = false;
  bar.hidden = false;
  paintGoal();
  paintHistory();
  publishLine();
  if (fullscreen && root.requestFullscreen && !document.fullscreenElement) {
    root.requestFullscreen().then(() => { fullscreenOurs = true; }, () => { /* CSS-only, fine */ });
  }
  const ta = lastTa && lastTa.isConnected ? lastTa
    : document.querySelector('#wr-page [data-el] textarea');
  if (ta) {
    ta.focus({ preventScroll: true });
    try { ta.setSelectionRange(lastSel[0], lastSel[1]); } catch (e) { /* select */ }
    markScene(ta.closest('[data-el]'));
    typewriterSoon(false);
  } else {
    const cta = document.querySelector('#screenplay .bd-empty button');
    if (cta) cta.focus({ preventScroll: true });
  }
}

export function exitFocus() {
  if (!on) return;
  on = false;
  if (tracker) tracker.flush();
  root.classList.remove('fm-on');
  restoreTheme();
  clearScene();
  hud.hidden = true;
  bar.hidden = true;
  nodes.opts.hidden = true;
  nodes.optsBtn.setAttribute('aria-expanded', 'false');
  if (document.fullscreenElement && fullscreenOurs) {
    try { document.exitFullscreen().catch(() => {}); } catch (e) { /* ignore */ }
  }
  fullscreenOurs = false;
  /* The shell measures its band on resize and on mutations of its own
     bar; neither happened while the band was display:none, but a
     fullscreen change did resize the window WHILE it was hidden, so a
     measurement taken then is stale. One synthetic resize after the
     chrome is back lets every measurer re-read the real thing. */
  requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  const ta = lastTa && lastTa.isConnected ? lastTa : null;
  if (ta) {
    ta.focus({ preventScroll: true });
    try { ta.setSelectionRange(lastSel[0], lastSel[1]); } catch (e) { /* select */ }
    ta.scrollIntoView({ block: 'center', behavior: 'instant' });
  } else {
    const b = document.getElementById('fm-enter');
    if (b) b.focus({ preventScroll: true });
  }
}
export const isFocusOn = () => on;
const toggle = (opts) => (on ? exitFocus() : enterFocus(opts));

/* ---- Esc: only when nothing else wanted it ------------------- */
function otherLayerOpen() {
  try { if (isPaletteOpen()) return true; } catch (e) { /* ignore */ }
  if (nodes.opts && !nodes.opts.hidden) return true;
  const sel = '#shortcutSheet.show, .cm-overlay.show, [aria-modal="true"], [role="dialog"], '
    + '.tb-menu-panel:not([hidden]), .sh-phase-menu:not([hidden]), #shareDialog';
  for (const el of document.querySelectorAll(sel)) {
    if (el.hidden || el.closest('#fm-hud')) continue;
    if (el.getClientRects().length) return true;
  }
  return false;
}
let escClaimed = false;

/* ---- wiring --------------------------------------------------- */
function wire() {
  // The shortcut, at capture so a field's own handler cannot eat it.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { escClaimed = otherLayerOpen(); return; }
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
    if (e.code !== 'KeyF' && String(e.key).toLowerCase() !== 'f') return;
    e.preventDefault();
    toggle();
  }, true);
  // Esc, last in line: anything that handled it first stopped it, and
  // anything open when it was pressed (palette, menu, dialog, our own
  // options) gets this press instead of us.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !on) return;
    if (escClaimed || e.defaultPrevented) { escClaimed = false; return; }
    e.preventDefault();
    exitFocus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !on || !nodes.opts || nodes.opts.hidden) return;
    if (!escClaimed) return;
    if (otherLayerOpenBesidesOpts()) return;
    closeOpts(true);
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && on && fullscreenOurs) { fullscreenOurs = false; exitFocus(); }
  });

  delegate(document, 'click', '[data-action="fm-enter"]', () => enterFocus({ fullscreen: true }));
  delegate(document, 'click', '[data-action="fm-exit"]', () => exitFocus());
  delegate(document, 'click', '[data-action="fm-sprint"]', () => sprintToggle());
  delegate(document, 'click', '[data-action="fm-sprint-reset"]', () => sprintReset());
  delegate(document, 'click', '[data-action="fm-opts"]', () => {
    if (nodes.opts.hidden) {
      nodes.opts.hidden = false;
      nodes.optsBtn.setAttribute('aria-expanded', 'true');
      paintHistory();
    } else closeOpts(false);
  });
  delegate(document, 'click', '[data-action="fm-fullscreen"]', () => {
    if (document.fullscreenElement) {
      try { document.exitFullscreen().catch(() => {}); } catch (e) { /* ignore */ }
      fullscreenOurs = false;
    } else if (root.requestFullscreen) {
      root.requestFullscreen().then(() => { fullscreenOurs = true; }, () => {});
    }
  });
  /* HUD buttons do not take focus from the page: a click on Start
     sprint must leave the caret where the writer was typing. */
  document.addEventListener('mousedown', (e) => {
    if (e.target.closest && e.target.closest('#fm-hud .fm-hud-row button')) e.preventDefault();
  });

  document.addEventListener('change', (e) => {
    const k = e.target && e.target.dataset ? e.target.dataset.fm : null;
    if (!k) return;
    if (k === 'goal-kind') {
      const def = GOAL_KINDS.find((x) => x.id === e.target.value);
      tracker.setGoal(e.target.value, def ? def.def : undefined);
      syncControls(); paintGoal();
    } else if (k === 'goal-target') {
      tracker.setGoal(tracker.state.goal.kind, e.target.value);
      syncControls(); paintGoal();
    } else if (k === 'marker') {
      prefs.marker = e.target.value; savePrefs(); applyPrefs();
    } else if (k === 'dim') {
      prefs.dim = e.target.checked; savePrefs(); applyPrefs();
    } else if (k === 'night') {
      prefs.night = e.target.checked; savePrefs(); applyPrefs();
    }
  });

  // The page: caret memory, the current scene, the typewriter.
  document.addEventListener('pointerdown', (e) => {
    pointerDown = !!(e.target.closest && e.target.closest('#wr-page'));
  }, true);
  document.addEventListener('pointerup', () => { setTimeout(() => { pointerDown = false; }, 0); }, true);
  document.addEventListener('focusin', (e) => {
    const ta = e.target;
    if (!ta.matches || !ta.matches('#wr-page textarea')) return;
    rememberCaret(ta);
    if (!on) return;
    // Nothing synchronous here: focusin runs inside write.js's Return
    // handler, so the scene marking and the scroll wait for the frame.
    sceneOwed = true;
    typewriterSoon(true, pointerDown);
  });
  document.addEventListener('input', (e) => {
    const ta = e.target;
    if (!ta.matches || !ta.matches('#wr-page textarea')) return;
    rememberCaret(ta);
    if (on) typewriterSoon(true);
  });
  const NAV = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']);
  document.addEventListener('keyup', (e) => {
    const ta = e.target;
    if (!ta.matches || !ta.matches('#wr-page textarea')) return;
    rememberCaret(ta);
    if (on && NAV.has(e.key)) typewriterSoon(true);
  });
  document.addEventListener('mouseup', (e) => {
    const ta = e.target;
    if (ta.matches && ta.matches('#wr-page textarea')) rememberCaret(ta);
  });
  // A type change can turn a row into (or out of) a scene heading.
  document.addEventListener('change', (e) => {
    if (!on || !e.target.closest) return;
    const row = e.target.closest('#wr-page [data-el]');
    if (row) requestAnimationFrame(() => markScene(row));
  });
  addEventListener('resize', () => {
    if (!on) return;
    // Every field's column width may have changed; the glyph has not.
    publishLine();
  });

  // Saves drive the goals; the heavy part waits for an idle moment so
  // it never lands on the Return that caused the save.
  const idle = (fn) => (typeof requestIdleCallback === 'function'
    ? requestIdleCallback(fn, { timeout: 1000 }) : setTimeout(fn, 50));
  let pending = false;
  subscribe('saved', ({ key } = {}) => {
    if (key !== SCRIPT_KEY || !tracker || pending) return;
    pending = true;
    idle(() => {
      pending = false;
      tracker.onSaved();
      if (on) { paintGoal(); if (!nodes.opts.hidden) paintHistory(); }
    });
  });
  const flush = () => { if (tracker) tracker.flush(); };
  addEventListener('pagehide', flush);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

function otherLayerOpenBesidesOpts() {
  const was = nodes.opts.hidden;
  nodes.opts.hidden = true;
  const r = otherLayerOpen();
  nodes.opts.hidden = was;
  return r;
}
function closeOpts(refocus) {
  nodes.opts.hidden = true;
  nodes.optsBtn.setAttribute('aria-expanded', 'false');
  if (refocus) nodes.optsBtn.focus({ preventScroll: true });
}

/** Called once by write.js with a reader of its in-memory model. */
export function mountFocusMode(readDoc) {
  if (typeof readDoc === 'function') getDoc = readDoc;
  loadPrefs();
  tracker = Goals.createTracker({ getElements: () => (getDoc() || {}).elements || [] });
  wire();
  const app = document.getElementById('app');
  injectButton();
  if (app && typeof MutationObserver === 'function') {
    new MutationObserver(injectButton).observe(app, { childList: true });
  }
}

export default { mountFocusMode, enterFocus, exitFocus, isFocusOn };
