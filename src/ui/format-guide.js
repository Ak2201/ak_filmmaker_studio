/* ============================================================
   THE FORMAT GUIDE — ghost hints, live notes, a check, a tour
   ------------------------------------------------------------
   Phase 3 of docs/SCREENPLAY-WRITER-PLAN.md, on write.html. Self-
   contained on purpose: write.js imports this file and does nothing
   else for it. Everything here works off the DOM write.js already
   draws — rows are `article.wr-el[data-el]`, each with a
   `select[data-el-field="type"]` and a `.wr-text[data-el-field="text"]`
   — through delegated listeners on the document, so it survives the
   page patching rows in place and re-rendering `main` wholesale.

   WHAT IT NEVER DOES
   - It never writes the script. A ghost hint is a `placeholder`, not
     text; the tour's "make this a Character" sets the row's own type
     select and dispatches the `change` write.js already listens for,
     so the page's save path is the only one.
   - It never writes storage while idle. The one key it owns,
     `fms_write_prefs_v1`, is written from a click (the level, the
     tour) and nothing else. Dismissed notes live in sessionStorage
     for the tab's session.
   - It never re-renders the editor. A note is one small element
     appended inside the row it is about; a check is a read.

   THE PREFS KEY IS SHARED. A later phase (keyboard presets) adds its
   own fields to the same JSON object, so every write here READS,
   MERGES and writes back; nothing assumes it owns the whole object.
   The key is per device (not in SCOPED_KEYS), in ALL_KEYS on the hub
   so reset clears it, and in GLOBAL_KEYS so it travels in a backup
   the way the theme does.

   LEVELS. Off — nothing. Hints — example text in an empty line.
   Coach — hints, quiet live notes after the writing settles, and the
   first-scene tour on an empty script. The "Check format" panel is
   on at every level: it only runs when it is asked to.
   ============================================================ */
import COPY from '../data/format-rules.json';
import { checkScript, checkAround } from '../lib/format-rules.js';
import { h, delegate } from '../lib/dom.js';
import { learn } from './learn.js';
import '../styles/format-guide.css';

export const PREFS_KEY = 'fms_write_prefs_v1';
const DISMISS_KEY = 'fms_write_guide_dismissed';
const LEVELS = COPY.levels.map((l) => l.id);
const DEFAULT_LEVEL = 'coach';
const SETTLE_MS = 550;
/* One learn-in-place box per element type, inside the note's "why". */
const LEARN_FOR = { scene: 'scene-heading', action: 'action', character: 'character-cue',
  dialogue: 'dialogue', paren: 'parenthetical', transition: 'transition' };

/* ---- prefs: read, merge, write ------------------------------ */
export function readPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (e) { return {}; }
}
export function writePrefs(patch) {
  const next = Object.assign(readPrefs(), patch);
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch (e) { /* private mode */ }
  return next;
}
export function guideLevel() {
  const l = readPrefs().guideLevel;
  return LEVELS.includes(l) ? l : DEFAULT_LEVEL;
}

let level = guideLevel();
const coach = () => level === 'coach';
const hints = () => level !== 'off';

/* ---- dismissed rules, for this tab's session ---------------- */
const dismissed = (() => {
  try { return new Set(JSON.parse(sessionStorage.getItem(DISMISS_KEY) || '[]')); }
  catch (e) { return new Set(); }
})();
function dismiss(ruleId) {
  dismissed.add(ruleId);
  try { sessionStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(dismissed))); } catch (e) { /* */ }
}

/* ---- reading the page --------------------------------------- */
const pageNode = () => document.getElementById('wr-page');
const section = () => document.getElementById('screenplay');

/** Every row in order, across the runs. Rows only: a pass panel is a
    sibling between them and is not an element. */
function allRows() {
  const page = pageNode();
  const out = [];
  if (!page) return out;
  for (const run of page.children) {
    for (const n of run.children) if (n.tagName === 'ARTICLE' && n.hasAttribute('data-el')) out.push(n);
  }
  return out;
}
function partsOf(row) {
  let sel = null, ta = null;
  for (const c of row.children) {
    if (c.tagName === 'SELECT') sel = c;
    else if (c.tagName === 'TEXTAREA') ta = c;
  }
  return { sel, ta };
}
function typeOf(row) {
  const { sel } = partsOf(row);
  if (sel) return sel.value;
  const m = row.className.match(/\bt-([\w-]+)/);
  return m ? m[1] : 'action';
}
function readElements(rows) {
  return rows.map((r) => {
    const { sel, ta } = partsOf(r);
    return { type: sel ? sel.value : typeOf(r), text: ta ? ta.value : '' };
  });
}

/* ---- (a) ghost hints ---------------------------------------- */
function ghost(ta) {
  const row = ta.closest('article[data-el]');
  if (!row) return;
  if (!('fgPh' in ta.dataset)) ta.dataset.fgPh = ta.getAttribute('placeholder') || '';
  const want = hints() && !ta.value ? (COPY.ghosts[typeOf(row)] ?? ta.dataset.fgPh) : ta.dataset.fgPh;
  if (ta.getAttribute('placeholder') !== want) ta.setAttribute('placeholder', want);
}

/* ---- (b) live notes ----------------------------------------- */
let settleTimer = 0;
let pendingRow = null;
let noteSeq = 0;

function clearNote(row) {
  const old = row.querySelector(':scope > .fg-note');
  if (!old) return;
  const { ta } = partsOf(row);
  if (ta && ta.getAttribute('aria-describedby') === old.id) ta.removeAttribute('aria-describedby');
  old.remove();
}

function showNote(row, f) {
  const old = row.querySelector(':scope > .fg-note');
  if (old && old.dataset.rule === f.ruleId) return;     // already saying it
  clearNote(row);
  const id = 'fg-note-' + (++noteSeq);
  const note = h('div.fg-note.is-' + f.severity, { id, role: 'note', 'data-rule': f.ruleId }, [
    h('p.fg-note-msg', { text: f.message }),
    h('details.fg-why', {}, [
      h('summary', { text: COPY.panel.whyLabel }),
      h('p', { text: f.why }),
      learn(LEARN_FOR[typeOf(row)])
    ].filter(Boolean)),
    h('button.fg-got', { type: 'button', 'data-action': 'fg-dismiss', 'data-rule': f.ruleId, text: COPY.panel.gotIt })
  ]);
  row.append(note);
  const { ta } = partsOf(row);
  if (ta && !ta.hasAttribute('aria-describedby')) ta.setAttribute('aria-describedby', id);
}

/** Check the row and its neighbours and bring their notes in step. */
function liveCheck(row) {
  if (!coach() || tour.active || !row || !row.isConnected) return;
  const rows = allRows();
  const i = rows.indexOf(row);
  if (i < 0) return;
  const elements = readElements(rows);
  const near = [i - 1, i, i + 1].filter((k) => k >= 0 && k < rows.length);
  const found = checkAround(elements, near);
  for (const k of near) {
    const mine = found.filter((f) => f.index === k && !dismissed.has(f.ruleId));
    const best = mine.find((f) => f.severity === 'warn') || mine[0];
    if (best) showNote(rows[k], best); else clearNote(rows[k]);
  }
}
function settleLater(row) {
  pendingRow = row;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => { const r = pendingRow; pendingRow = null; liveCheck(r); }, SETTLE_MS);
}
function clearAllNotes() {
  document.querySelectorAll('#wr-page .fg-note').forEach((n) => clearNote(n.parentElement));
}

/* ---- (c) the format check ----------------------------------- */
let panelOpen = false;
let lastFindings = null;

function runCheck() {
  const rows = allRows();
  const found = checkScript(readElements(rows));
  // Warnings first, then hints, each in script order.
  found.sort((a, b) => (a.severity === b.severity ? a.index - b.index : a.severity === 'warn' ? -1 : 1));
  lastFindings = { rows, found, scenes: sceneNumbers(rows) };
  panelOpen = true;
  drawDock();
  const head = document.getElementById('fg-panel-title');
  if (head) head.focus();
}

function sceneNumbers(rows) {
  const out = [];
  let n = 0;
  for (const r of rows) { if (typeOf(r) === 'scene') n++; out.push(n); }
  return out;
}

function renderPanel() {
  const res = lastFindings;
  const panel = h('div.fg-panel', { id: 'fg-panel', role: 'region', 'aria-labelledby': 'fg-panel-title' });
  const warns = res ? res.found.filter((f) => f.severity === 'warn').length : 0;
  const hintsN = res ? res.found.length - warns : 0;
  panel.append(h('div.fg-panel-head', {}, [
    h('h3.fg-panel-title', { id: 'fg-panel-title', tabindex: '-1', text: COPY.panel.title }),
    h('span.fg-panel-count', {
      role: 'status',
      text: !res || !res.rows.length ? '' : `${warns} to fix · ${hintsN} ${hintsN === 1 ? 'hint' : 'hints'}`
    }),
    h('button.btn.fg-panel-close', { type: 'button', 'data-action': 'fg-close', text: COPY.panel.close })
  ]));
  if (!res || !res.rows.length) {
    panel.append(h('p.fg-panel-empty', { text: COPY.panel.empty }));
    return panel;
  }
  if (!res.found.length) {
    panel.append(h('p.fg-panel-empty', { text: COPY.panel.clean }));
    return panel;
  }
  const list = h('ol.fg-list');
  for (const f of res.found) {
    const scene = res.scenes[f.index];
    list.append(h('li.fg-item.is-' + f.severity, {}, [
      h('button.fg-jump', { type: 'button', 'data-action': 'fg-jump', 'data-index': String(f.index) }, [
        h('span.fg-where', { text: (scene ? 'Scene ' + scene + ' · ' : '') + 'line ' + (f.index + 1) }),
        h('span.fg-sev', { text: f.severity === 'warn' ? 'Fix' : 'Hint' }),
        h('span.fg-msg', { text: f.message })
      ])
    ]));
  }
  panel.append(list);
  return panel;
}

function jumpTo(index) {
  const rows = allRows();
  const row = rows[index];
  if (!row) return;
  const { ta } = partsOf(row);
  // A row in a run the browser is skipping has a placeholder height;
  // bring it into view instantly first, then focus (write.js's
  // applyFocus() does the same for the same reason).
  row.scrollIntoView({ block: 'center', behavior: 'instant' });
  if (ta) {
    ta.focus({ preventScroll: true });
    try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { /* */ }
  }
  if (coach()) {
    const f = lastFindings && lastFindings.found.find((x) => x.index === index);
    if (f) showNote(row, f);
  }
}

/* ---- (d) the first-scene tour ------------------------------- */
const STEPS = COPY.tour.steps;
const tour = { active: false, finished: false, lastRow: null };

/** The invitation, in the dock: Coach, never seen, an empty script. */
function tourWanted() {
  if (!coach() || tour.active) return false;
  return !readPrefs().tourDone && allRows().length === 0 && !!document.querySelector('[data-action="el-first"]');
}

/** How far the writer has got: each step is met by the first element
    of its type, with text, after the element that met the step before. */
function tourProgress() {
  const els = readElements(allRows());
  let pos = 0, k = 0;
  while (k < STEPS.length) {
    let hit = -1;
    for (let i = pos; i < els.length; i++) {
      if (els[i].type === STEPS[k].type && els[i].text.trim()) { hit = i; break; }
    }
    if (hit < 0) break;
    pos = hit + 1;
    k++;
  }
  return k;
}

function renderTour() {
  const box = h('div.fg-tour', { role: 'region', 'aria-label': COPY.tour.title });
  if (!tour.active && !tour.finished) {
    box.append(
      h('p.fg-tour-eyebrow', { text: COPY.tour.eyebrow }),
      h('h3.fg-tour-title', { text: COPY.tour.title }),
      h('p.fg-tour-ask', { text: COPY.tour.intro }),
      h('div.fg-tour-acts', {}, [
        h('button.btn.primary', { type: 'button', 'data-action': 'fg-tour-start', text: COPY.tour.start }),
        h('button.btn', { type: 'button', 'data-action': 'fg-tour-skip', text: COPY.tour.skip })
      ])
    );
    return box;
  }
  const k = tourProgress();
  if (k >= STEPS.length || tour.finished) {
    tour.finished = true;
    box.append(
      h('p.fg-tour-eyebrow', { text: COPY.tour.eyebrow + ' · done' }),
      h('h3.fg-tour-title', { text: COPY.tour.doneTitle }),
      h('p.fg-tour-ask', { text: COPY.tour.done }),
      h('div.fg-tour-acts', {}, [
        h('button.btn.primary', { type: 'button', 'data-action': 'fg-tour-finish', text: COPY.tour.finish })
      ])
    );
    return box;
  }
  const step = STEPS[k];
  const row = tour.lastRow && tour.lastRow.isConnected ? tour.lastRow : null;
  const needsConvert = step.convert && row && typeOf(row) !== step.type;
  box.append(
    h('p.fg-tour-eyebrow', { text: `${COPY.tour.eyebrow} · step ${k + 1} of ${STEPS.length}` }),
    h('h3.fg-tour-title', { text: step.title }),
    h('p.fg-tour-ask', { 'aria-live': 'polite', text: step.ask }),
    h('ol.fg-tour-dots', { 'aria-hidden': 'true' },
      STEPS.map((s, j) => h('li' + (j < k ? '.is-done' : j === k ? '.is-now' : '')))),
    h('div.fg-tour-acts', {}, [
      needsConvert
        ? h('button.btn.primary', { type: 'button', 'data-action': 'fg-tour-convert', 'data-type': step.type, text: step.convert })
        : null,
      h('button.btn', { type: 'button', 'data-action': 'fg-tour-skip', text: COPY.tour.skip })
    ].filter(Boolean))
  );
  return box;
}

/* While the tour runs, its card sits INSIDE the row being written —
   under the caret, where a first-time writer is looking — rather than
   at the top of the section, which a phone has scrolled away by the
   third line. Same mechanism as a note: one element in the row. */
let tourStepShown = -1;
let tourConvertShown = null;
let tourRowShown = null;
function drawTour() {
  document.querySelectorAll('#wr-page .fg-tour').forEach((n) => n.remove());
  const row = tour.lastRow && tour.lastRow.isConnected ? tour.lastRow : null;
  if (!tour.active || !row) return;
  const card = renderTour();
  card.classList.add('is-inline');
  row.append(card);
}
function refreshTour() {
  if (!tour.active) return;
  const k = tourProgress();
  const row = tour.lastRow && tour.lastRow.isConnected ? tour.lastRow : null;
  const step = STEPS[k];
  const conv = !!(step && step.convert && row && typeOf(row) !== step.type);
  const shown = row && row.querySelector(':scope > .fg-tour');
  if (k !== tourStepShown || conv !== tourConvertShown || row !== tourRowShown || !shown) {
    tourStepShown = k; tourConvertShown = conv; tourRowShown = row;
    drawTour();
  }
}

/* ---- the dock: level, Check format, the panel, the tour ----- */
function renderDock() {
  const dock = h('div.fg-dock', { 'data-fg': 'dock' });
  const sel = h('select.fg-level', { id: 'fg-level', 'data-action': 'fg-level' });
  for (const l of COPY.levels) {
    const opt = h('option', { value: l.id, text: l.label });
    if (l.id === level) opt.selected = true;
    sel.append(opt);
  }
  const cur = COPY.levels.find((l) => l.id === level);
  dock.append(h('div.fg-bar', {}, [
    h('label.fg-level-lab', { for: 'fg-level', text: COPY.panel.levelLabel }),
    sel,
    h('span.fg-level-hint', { id: 'fg-level-hint', text: cur ? cur.hint : '' }),
    h('button.btn.fg-check', {
      type: 'button', 'data-action': 'fg-check',
      'aria-expanded': panelOpen ? 'true' : 'false', 'aria-controls': 'fg-panel',
      text: COPY.panel.button
    })
  ]));
  sel.setAttribute('aria-describedby', 'fg-level-hint');
  if (tourWanted()) dock.append(renderTour());
  if (panelOpen) dock.append(renderPanel());
  return dock;
}

function drawDock() {
  const sec = section();
  if (!sec) return;
  const dock = renderDock();
  const old = sec.querySelector(':scope > .fg-dock');
  if (old) { old.replaceWith(dock); return; }
  const bar = sec.querySelector(':scope > .wr-bar');
  if (bar) bar.after(dock); else sec.append(dock);
}

/* write.js replaces `main` on a full render; put the dock back when it
   does. Only `#app`'s own children are watched, so a row patch — an
   Enter, a delete — never reaches this. */
let lastMain = null;
function ensureDock() {
  const sec = section();
  if (!sec) return;
  const main = document.getElementById('main');
  if (main !== lastMain) {
    lastMain = main;
    // Findings index rows by position; a new main means new rows.
    if (lastFindings) { lastFindings = null; panelOpen = false; }
  }
  if (!sec.querySelector(':scope > .fg-dock')) drawDock();
}

/* ---- events -------------------------------------------------- */
const TEXT = '.wr-text[data-el-field="text"]';

delegate(document, 'focusin', TEXT, (e, ta) => {
  ghost(ta);
  const row = ta.closest('article[data-el]');
  if (tour.active && row) { tour.lastRow = row; refreshTour(); }
});

delegate(document, 'input', TEXT, (e, ta) => {
  if (ta.value === '') ghost(ta);
  const row = ta.closest('article[data-el]');
  if (!row) return;
  if (tour.active) { tour.lastRow = row; refreshTour(); return; }
  if (coach()) { row.dataset.fgDirty = '1'; settleLater(row); }
});

/* Leaving an edited line checks it at once, rather than waiting out
   the settle timer while the writer is already somewhere else. */
delegate(document, 'focusout', TEXT, (e, ta) => {
  const row = ta.closest('article[data-el]');
  if (!row || !row.dataset.fgDirty) return;
  delete row.dataset.fgDirty;
  if (pendingRow === row) { clearTimeout(settleTimer); pendingRow = null; }
  // Not inside the event: focusout fires in the middle of an Enter
  // (write.js moves the caret to the new line), and a whole-script
  // read there would be paid by the keystroke.
  setTimeout(() => liveCheck(row), 60);
});

/* A type change: write.js resets the placeholder in its own handler,
   which runs after this one, so the ghost is re-applied on the next
   task. */
delegate(document, 'change', 'select[data-el-field="type"]', (e, sel) => {
  const row = sel.closest('article[data-el]');
  if (!row) return;
  setTimeout(() => {
    const { ta } = partsOf(row);
    if (ta) ghost(ta);
    if (tour.active) { tour.lastRow = row; refreshTour(); }
    else if (coach()) liveCheck(row);
  }, 0);
});

delegate(document, 'change', 'select[data-action="fg-level"]', (e, sel) => {
  if (!LEVELS.includes(sel.value)) return;
  level = sel.value;
  writePrefs({ guideLevel: level });
  if (!coach()) { clearAllNotes(); tour.active = false; tour.finished = false; drawTour(); }
  document.querySelectorAll('#wr-page ' + TEXT).forEach((ta) => { if ('fgPh' in ta.dataset) ghost(ta); });
  drawDock();
  const again = document.getElementById('fg-level');
  if (again) again.focus();
});

delegate(document, 'click', '[data-action="fg-dismiss"]', (e, btn) => {
  const rule = btn.getAttribute('data-rule');
  const row = btn.closest('article[data-el]');
  if (rule) dismiss(rule);
  const { ta } = row ? partsOf(row) : {};
  document.querySelectorAll(`#wr-page .fg-note[data-rule="${CSS.escape(rule || '')}"]`)
    .forEach((n) => clearNote(n.parentElement));
  if (ta) ta.focus();
});

delegate(document, 'click', '[data-action="fg-check"]', () => {
  if (panelOpen) { panelOpen = false; drawDock(); return; }
  runCheck();
});
delegate(document, 'click', '[data-action="fg-close"]', () => {
  panelOpen = false;
  drawDock();
  const btn = document.querySelector('[data-action="fg-check"]');
  if (btn) btn.focus();
});
delegate(document, 'click', '[data-action="fg-jump"]', (e, btn) => {
  jumpTo(Number(btn.getAttribute('data-index')));
});

delegate(document, 'click', '[data-action="fg-tour-start"]', () => {
  // Shown once: the start is the moment it has been seen.
  writePrefs({ tourDone: true });
  tour.active = true;
  tour.finished = false;
  tourStepShown = -1;
  drawDock();                   // the invitation goes
  const first = document.querySelector('[data-action="el-first"]');
  if (first) first.click();     // write.js adds the first scene heading and focuses it
});
delegate(document, 'click', '[data-action="fg-tour-skip"]', () => {
  writePrefs({ tourDone: true });
  tour.active = false; tour.finished = false;
  drawTour();
  drawDock();
});
delegate(document, 'click', '[data-action="fg-tour-finish"]', () => {
  tour.active = false; tour.finished = false;
  drawTour();
  const rows = allRows();
  const last = rows[rows.length - 1];
  const { ta } = last ? partsOf(last) : {};
  if (ta) ta.focus();
});
delegate(document, 'click', '[data-action="fg-tour-convert"]', (e, btn) => {
  const row = tour.lastRow && tour.lastRow.isConnected ? tour.lastRow : null;
  const type = btn.getAttribute('data-type');
  if (!row || !type) return;
  const { sel, ta } = partsOf(row);
  if (!sel) return;
  sel.value = type;
  sel.dispatchEvent(new Event('change', { bubbles: true }));   // write.js saves it
  if (ta) ta.focus();
});

/* ---- boot ---------------------------------------------------- */
function boot() {
  const app = document.getElementById('app');
  if (!app) return;
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; ensureDock(); });
  }).observe(app, { childList: true });
  ensureDock();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();

export default { readPrefs, writePrefs, guideLevel, PREFS_KEY };
