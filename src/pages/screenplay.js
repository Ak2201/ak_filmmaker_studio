/* ============================================================
   SCRIPT — the writing-only page
   ------------------------------------------------------------
   A page, the lines, and nothing else: no hero, no stats, no tabs and
   no controls on each row. The editor is src/ui/script-editor (the
   same one write.html mounts, here with rowChrome:false); this file
   keeps the model, the ONE debounced save on fms_script_v1
   (src/lib/script.js), and the quiet things around the page: one top
   bar, a beats panel, a line menu, a phone chip bar.

   SAVE RULES (CLAUDE.md, verify's idle check): rendering never writes;
   every write starts at a user event; typing goes through persist(),
   structure through persistNow(). Nothing here writes on load — an empty
   script gets ONE blank line in memory so there is somewhere to type,
   and that line is saved only when the writer types in it.
   ============================================================ */
import { flushStorage, currentProject } from '../lib/store.js';
import { ask, askDanger } from '../ui/dialog.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/write.css';
import '../styles/pdf.css';
import '../styles/screenplay.css';
import '../ui/format-guide.js';   // Check format (its dock bar is hidden; the menu drives it)

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { actionMenu, wireActionBar } from '../ui/actionbar.js';
import { mountFocusMode } from '../ui/focus-mode.js';
import '../ui/read-as.js';        // dictation lives in its bar (hidden; the menu drives it)
import { mountTamilType, setTamilTyping, isTamilTyping } from '../ui/tamil-type.js';
import { h, delegate } from '../lib/dom.js';
import PDF from '../lib/pdf.js';
import { commitImportedScript } from '../lib/script-commit.js';
import { sceneSyncLater } from '../ui/handoff.js';
import Keys from '../lib/write-keys.js';
import { createSmartType } from '../ui/smarttype.js';
import WriteKeys from '../ui/write-shortcuts.js';
import '../styles/smarttype.css';
import { mountEditor } from '../ui/script-editor/editor.js';
import { installLineLanding } from '../ui/script-find.js';
import { mountBeats } from '../ui/beats-panel.js';
import { installLeavePrompt } from '../ui/leave-prompt.js';
import { latestDraft, changedSinceDraft } from '../lib/drafts.js';
import { mountStageGuide } from '../ui/stage-guide.js';
import { learn } from '../ui/learn.js';
import Script, {
  ELEMENT_TYPES, ELEMENT_TYPE_IDS, typeLabel, blankElement, withContd,
  pageCount, formatPages
} from '../lib/script.js';
import PlanGate from '../lib/plan-gate.js';   // script_import (src/data/plan-matrix.json)

const typesetter = () => import('../lib/screenplay-export.js');
const importer = () => import('../lib/script-import.js');
const app = document.getElementById('app');

/* ---- the model and its one save path ------------------------- */
let doc = Script.loadScript();
/* An empty script gets one blank scene line IN MEMORY so there is a
   line to type in. Not saved here; the first keystroke saves it. */
if (!doc.elements.length) doc.elements.push(blankElement({ type: 'scene' }));

const SAVE_DELAY = 500;
let saveTimer = null;
let saving = false;
let saveOwed = false;
let statusNode = null;
const setStatus = (s) => { if (statusNode && statusNode.textContent !== s) statusNode.textContent = s; };

function persist() {
  setStatus('Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; persistNow(); }, SAVE_DELAY);
}
function persistNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (saving) { saveOwed = true; return; }
  saving = true;
  setStatus('Saving…');
  Script.saveScript(doc);
  const settle = () => {
    saving = false;
    if (saveOwed) { saveOwed = false; persistNow(); return; }
    setStatus('Saved ✓');
    refreshDraftLabel();
  };
  flushStorage().then(settle, settle);
}
function persistBeforeLeaving() {
  if (!saveTimer && !saveOwed) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  saveOwed = false;
  Script.saveScript(doc);
}
addEventListener('pagehide', persistBeforeLeaving);
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistBeforeLeaving();
});

/* ---- keys, SmartType ------------------------------------------ */
let keyPrefs = Keys.loadWritePrefs();
const knownTypes = () => ELEMENT_TYPE_IDS;
WriteKeys.configure({
  get known() { return knownTypes(); },
  getPrefs: () => keyPrefs,
  setPrefs: (patch) => { keyPrefs = Keys.saveWritePrefs(patch); return keyPrefs; }
});
const idOf = (el, attr) => el.closest(`[data-${attr}]`)?.dataset[attr];
const indexOfEl = (id) => doc.elements.findIndex((e) => e.id === id);
const smart = createSmartType({
  getElements: () => doc.elements,
  elementOf: (ta) => doc.elements[indexOfEl(idOf(ta, 'el'))] || null
});

const say = (m) => { try { StudioUI.toast(m, { type: 'info' }); } catch (e) { /* chrome may not be up */ } };

/* ---- the editor ----------------------------------------------- */
let curId = null;           // the line the caret is in
let Typeset = null;         // the typesetter, once loaded (page breaks)

const editor = mountEditor(document, {
  getDoc: () => doc,
  persist: () => persist(),
  persistNow: () => persistNow(),
  render: (focus) => renderPage(focus),
  canPatch: () => true,
  refreshCounters: () => refreshDerivedUi(),
  scheduleDerived: () => scheduleDerived(),
  smart,
  getPrefs: () => keyPrefs,
  known: knownTypes,
  say,
  toast: (m, o) => StudioUI.toast(m, o),
  rowChrome: false
});

/* ---- draft label ------------------------------------------------ */
function draftLabel() {
  const last = latestDraft(doc);
  if (!last) return 'No draft saved yet';
  return last.name + (changedSinceDraft(doc) ? ' · unsaved draft changes' : '');
}
/* DOM only: the label after a save settles or a draft is written. */
function refreshDraftLabel() {
  const d = document.querySelector('[data-sc="draft"]');
  const t = draftLabel();
  if (d && d.textContent !== t) d.textContent = t;
}
document.addEventListener('fms:drafts-changed', refreshDraftLabel);

/* ---- chrome ----------------------------------------------------- */
let typeSel = null;
let hintNode = null;
let tipNode = null;
let tipKey = '';
let sheet = null;
let beatsOpen = false;

function buildTop() {
  statusNode = h('span.sc-status', { role: 'status', 'aria-live': 'polite', text: 'Saved ✓' });
  typeSel = h('select.sc-type', { id: 'scType', 'aria-label': 'Current line type' });
  ELEMENT_TYPES.forEach((t) => typeSel.append(h('option', { value: t.id, text: t.label })));

  const crumb = h('p.sc-crumb', {}, [
    h('strong', { text: 'Screenplay Writer' }),
    h('span.sc-sep', { text: '·', 'aria-hidden': 'true' }),
    h('span.sc-title', { text: Script.projectTitle() }),
    h('span.sc-sep', { text: '·', 'aria-hidden': 'true' }),
    h('span.sc-draft', { 'data-sc': 'draft', text: draftLabel() }),
    h('span.sc-sep', { text: '·', 'aria-hidden': 'true' }),
    statusNode
  ]);

  const beatsBtn = h('button.btn.sc-beats-btn', {
    type: 'button', 'data-action': 'sc-beats', 'aria-expanded': 'false',
    'aria-controls': 'beatsPanel', text: 'Beats ◧'
  });
  const menu = actionMenu('⋯', [
    { label: 'Import Screenplay', action: 'sc-import' },
    { label: 'Export PDF', action: 'sc-pdf', hint: 'working copy' },
    '---',
    { label: 'Tamil typing', action: 'sc-tamil', hint: 'Alt+T' },
    { label: 'Dictation', action: 'sc-dictate' },
    { label: 'Keyboard shortcuts', action: 'sc-keys', hint: '?' },
    { label: 'Format check', action: 'sc-check' },
    { label: 'Notes overview', action: 'sc-notes', hint: 'all notes' },
    '---',
    { label: 'Show or hide hints', action: 'sc-hints' },
    { label: 'Stage guide', action: 'sc-guide', hint: 'questions' },
    { label: 'Write from a synopsis', action: 'sc-generate', hint: 'AI' },
    { label: 'AI coverage report', action: 'sc-coverage', hint: 'AI' }
  ], { align: 'right', compact: true, ariaLabel: 'More' });

  /* The shell's `.toolbar` convention is not used: this bar is the
     page's own, and a focus button is moved in once focus-mode has
     injected it (see mountFocus). */
  tipNode = h('div#scTip.sc-tip', { role: 'note', 'aria-live': 'polite', hidden: !hintsOn() });
  return h('div#scTop.sc-top', {}, [
    crumb,
    h('div.sc-tools', {}, [typeSel, beatsBtn, h('span#scFocusSlot.sc-focus-slot'), menu]),
    tipNode
  ]);
}

function buildChips() {
  const chips = h('div#scChips.sc-chips', { role: 'toolbar', 'aria-label': 'Line type' });
  [['scene', 'Scene'], ['action', 'Action'], ['character', 'Character'],
    ['dialogue', 'Dialogue'], ['paren', 'Paren'], ['transition', 'Trans']].forEach(([id, label]) => {
    chips.append(h('button.sc-chip', { type: 'button', 'data-action': 'sc-chip', 'data-type': id, text: label }));
  });
  return chips;
}

function render() {
  const main = h('main#main.sc-main');
  sheet = h('section#screenplay.sc-sheet', { 'aria-label': 'Screenplay' });
  /* Hosts the other modules look for inside #screenplay: focus mode
     puts its button in `.wr-export`, read-as/dictation use `.wr-bar`.
     Hidden (screenplay.css); the ⋯ menu drives them. */
  sheet.append(h('div.wr-bar.sc-hostbar', {}, [h('div.wr-export')]));
  sheet.append(editor.renderPage({ pageView: true }));
  hintNode = h('p.sc-hint', {}, [
    h('span', { text: 'Start with INT. or EXT. — Enter moves on, Tab switches. ' }),
    h('a', { href: '#import', 'data-action': 'sc-import', text: 'Import Screenplay' })
  ]);
  sheet.append(hintNode);

  const after = h('p.sc-done', {}, [
    h('span', { text: 'Screenplay done? ' }),
    h('a', { href: 'breakdown.html#script', text: '→ Go to Screenplay Analysis' })
  ]);
  const aside = h('aside#beatsPanel.sc-beats', { 'aria-label': 'Beats', hidden: true });
  main.append(buildTop(), sheet, after, aside, buildChips());
  app.replaceChildren(main);
  /* The blueprint's screenplay questions keep their saved answers here
     (verify's key-union needs section#guide on a stage page). The page
     is for writing, so the guide stays hidden until #guide asks for it. */
  const guide = mountStageGuide(main, { stage: 'screenplay' });
  if (guide) guide.hidden = location.hash !== '#guide';

  watchTopBar();
  mountShell();
  wireActionBar();
  try { StudioUI.autoAriaLabels(); } catch (e) { console.warn('[script] chrome', e); }
  refreshDerivedUi();
  editor.autosizeAll();
  requestAnimationFrame(editor.autosizeAll);
  applyBreaksSoon();
}

/** The page alone, rebuilt (an import, a dual-dialogue toggle, a pairing change). */
function renderPage(focus) {
  const old = document.getElementById('wr-page');
  if (!old) return;
  old.replaceWith(editor.renderPage({ pageView: true }));
  smart.invalidate();
  editor.autosizeAll();
  requestAnimationFrame(editor.autosizeAll);
  refreshDerivedUi();
  if (focus) editor.applyFocus(focus);
  applyBreaksSoon();
  sceneSyncLater();
}

/* ---- current line type + the empty hint (DOM only) ------------ */
function currentIndex() {
  const i = curId ? indexOfEl(curId) : -1;
  return i;
}
function refreshDerivedUi() {
  const i = currentIndex();
  const el = i >= 0 ? doc.elements[i] : null;
  if (typeSel && el && typeSel.value !== el.type) typeSel.value = el.type;
  document.querySelectorAll('.sc-chip').forEach((c) => {
    const on = !!el && c.dataset.type === el.type;
    if (c.classList.contains('is-on') !== on) c.classList.toggle('is-on', on);
    if (c.getAttribute('aria-pressed') !== String(on)) c.setAttribute('aria-pressed', String(on));
  });
  paintTip(el);
  if (hintNode) {
    const empty = doc.elements.length <= 1 && doc.elements.every((e) => !String(e.text || '').trim());
    if (hintNode.hidden === empty) hintNode.hidden = !empty;
  }
}
editor.on('type', refreshDerivedUi);

/* The top bar's height, MEASURED (it wraps, and the hint row comes
   and goes), so the pinned beats column can sit under it instead of
   behind it. Written on <html>, outside the observed element. */
let topRO = null;
function watchTopBar() {
  const bar = document.getElementById('scTop');
  if (!bar) return;
  const publish = () => {
    const px = Math.round(bar.getBoundingClientRect().height) + 'px';
    const de = document.documentElement;
    if (de.style.getPropertyValue('--sc-top-h') !== px) de.style.setProperty('--sc-top-h', px);
  };
  publish();
  if (typeof ResizeObserver === 'function') {
    if (topRO) topRO.disconnect();
    topRO = new ResizeObserver(publish);
    topRO.observe(bar);
  }
  setTimeout(publish, 300);   // RO rides the render loop; a timer does not
}

/* ---- the hint strip ----------------------------------------------
   What the current line is for and where Enter and Tab go from it.
   The copy is write-presets.json's `hints`; the targets come from the
   same returnNext / tab tables the keys obey, so the hint can never
   promise a key the editor does not keep. DOM only, rebuilt only when
   the line's type or emptiness changes. Hidden or shown per device,
   stored as `hints` beside `keys` in the existing fms_write_prefs_v1
   (a read-merge-write, and only when the writer toggles it). */
function hintsOn() {
  try { return (JSON.parse(localStorage.getItem(Keys.WRITE_PREFS_KEY) || '{}') || {}).hints !== false; } catch (e) { return true; }
}
function setHints(on) {
  try {
    const raw = localStorage.getItem(Keys.WRITE_PREFS_KEY);
    let all = {};
    try { all = raw ? JSON.parse(raw) : {}; } catch (e) { all = {}; }
    if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
    if (on) delete all.hints; else all.hints = false;
    localStorage.setItem(Keys.WRITE_PREFS_KEY, JSON.stringify(all));
  } catch (e) { /* private mode: holds for this visit */ }
}
const typeName = (t) => (Keys.TYPE_NAMES && Keys.TYPE_NAMES[t]) || t;
function paintTip(el) {
  if (!tipNode || tipNode.hidden || !el) return;
  const empty = !String(el.text || '').trim();
  const key = el.type + (empty ? ':0' : ':1');
  if (key === tipKey) return;
  tipKey = key;
  const ret = Keys.returnNext(el.type, keyPrefs, knownTypes());
  const tab = Keys.tabAction(el.type, empty, false, knownTypes());
  const keysLine = [
    ret ? 'Enter → ' + typeName(ret) : null,
    tab ? 'Tab → ' + typeName(tab.type) : null,
    'Alt+1–7 any type'
  ].filter(Boolean).join(' · ');
  const topic = Keys.LEARN_TOPICS && Keys.LEARN_TOPICS[el.type];
  let box = null;
  try { box = topic ? learn(topic) : null; } catch (e) { box = null; }
  tipNode.replaceChildren(...[
    h('strong.sc-tip-type', { text: typeName(el.type) }),
    h('span.sc-tip-what', { text: (Keys.HINTS && Keys.HINTS[el.type]) || '' }),
    h('span.sc-tip-keys', { text: keysLine }),
    box
  ].filter(Boolean));   // append(null) would print "null"
}
delegate(document, 'click', '[data-action="sc-hints"]', () => {
  const on = !hintsOn();
  setHints(on);
  if (tipNode) { tipNode.hidden = !on; tipKey = ''; }
  refreshDerivedUi();
  say(on ? 'Hints on.' : 'Hints off. Turn them back on from the ⋯ menu.');
});

/* The line the caret is in. focusin sees every way into a row. */
delegate(document, 'focusin', '#wr-page .wr-text', (e, ta) => {
  const row = ta.closest('[data-el]');
  if (!row) return;
  curId = row.dataset.el;
  refreshDerivedUi();
  placeLineButton(row);
});

delegate(document, 'change', '#scType', (e, sel) => {
  const i = currentIndex();
  if (i < 0) return;
  editor.setElementType(i, sel.value);
  editor.focusEl(doc.elements[i].id);
});
/* A chip must not take focus from the line, or the keyboard drops. */
delegate(document, 'mousedown', '.sc-chip', (e) => e.preventDefault());
delegate(document, 'click', '[data-action="sc-chip"]', (e, btn) => {
  const i = currentIndex();
  if (i < 0) return;
  editor.setElementType(i, btn.dataset.type);
  editor.focusEl(doc.elements[i].id);
});

/* ---- page breaks: the PDF's own paginator, at idle ------------- */
let derivedTimer = 0;
function scheduleDerived() {
  sceneSyncLater();
  clearTimeout(derivedTimer);
  derivedTimer = setTimeout(() => {
    derivedTimer = 0;
    editor.refreshCueOffers();
    applyBreaks();
  }, 400);
}
async function applyBreaksSoon() {
  if (!Typeset) {
    try { Typeset = await typesetter(); } catch (e) { return; }
  }
  applyBreaks();
}
function applyBreaks() {
  const page = document.getElementById('wr-page');
  if (!page || !Typeset) return;
  const pages = Typeset.paginateDoc(doc);
  const anchors = [];
  pages.forEach((rows, p) => {
    if (p === 0) return;
    const first = rows.find((r) => r.id);
    anchors[p] = first ? { id: first.id, split: !!first.cont } : null;
  });
  const existing = new Map();
  page.querySelectorAll('.wr-pbreak').forEach((n) => existing.set(n.dataset.page, n));
  for (let p = 1; p < pages.length; p++) {
    const a = anchors[p];
    let node = existing.get(String(p)) || null;
    existing.delete(String(p));
    const row = a ? editor.rowOf(a.id) : null;
    if (!row) { if (node) node.remove(); continue; }
    const target = row.closest('.wr-dual') || row;
    const key = a.id + (a.split ? '|split' : '');
    const placed = node && node.dataset.anchor === key
      && (a.split ? node.previousElementSibling === target : node.nextElementSibling === target);
    if (placed) continue;
    if (!node) node = h('div.wr-pbreak', { role: 'separator', 'data-page': String(p) });
    node.dataset.anchor = key;
    node.classList.toggle('is-split', a.split);
    const label = a.split ? 'Page ' + (p + 1) + ' · continues' : 'Page ' + (p + 1);
    if (node.textContent !== label) node.textContent = label;
    if (a.split) target.after(node); else target.before(node);
  }
  existing.forEach((n) => n.remove());
}

/* ---- the line menu: a ⋯ on the focused line, and right-click ---- */
const lineBtn = h('button.sc-line-more', {
  type: 'button', 'data-action': 'sc-line-menu', 'aria-label': 'Line actions',
  'aria-haspopup': 'menu', title: 'Line actions', text: '⋯'
});
function placeLineButton(row) {
  if (lineBtn.parentElement !== row) row.append(lineBtn);
}
lineBtn.addEventListener('mousedown', (e) => e.preventDefault());

const lineMenu = h('div#scLineMenu.sc-line-menu', { role: 'menu', hidden: true }, [
  ['sc-dual', 'Dual dialogue'], ['sc-contd', "Add CONT'D"], ['sc-up', 'Move up'],
  ['sc-down', 'Move down'], ['sc-del', 'Delete']
].map(([a, label]) => h('button.sc-line-item' + (a === 'sc-del' ? '.is-danger' : ''), {
  type: 'button', role: 'menuitem', 'data-action': a, text: label
})));
document.body.append(lineMenu);

function openLineMenu(x, y) {
  lineMenu.hidden = false;
  const w = lineMenu.offsetWidth;
  const hgt = lineMenu.offsetHeight;
  lineMenu.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + 'px';
  lineMenu.style.top = Math.max(8, Math.min(y, innerHeight - hgt - 8)) + 'px';
  lineMenu.querySelector('button')?.focus({ preventScroll: true });
}
function closeLineMenu(refocus) {
  if (lineMenu.hidden) return;
  lineMenu.hidden = true;
  if (refocus && curId) editor.focusEl(curId);
}
delegate(document, 'click', '[data-action="sc-line-menu"]', (e, btn) => {
  e.stopPropagation();
  if (!lineMenu.hidden) { closeLineMenu(true); return; }
  const r = btn.getBoundingClientRect();
  openLineMenu(r.left, r.bottom + 4);
});
delegate(document, 'contextmenu', '#wr-page .wr-text', (e, ta) => {
  if (e.shiftKey) return;                   // Shift + right-click: the browser's own menu
  const row = ta.closest('[data-el]');
  if (!row) return;
  e.preventDefault();
  curId = row.dataset.el;
  openLineMenu(e.clientX, e.clientY);
});
document.addEventListener('click', (e) => {
  if (!lineMenu.hidden && !e.target.closest('#scLineMenu')) closeLineMenu(false);
});
lineMenu.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeLineMenu(true); return; }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  const items = Array.from(lineMenu.querySelectorAll('button'));
  const at = items.indexOf(document.activeElement);
  items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
});

function lineAction(fn) {
  const i = currentIndex();
  closeLineMenu(false);
  if (i < 0) return;
  fn(i, doc.elements[i]);
}
delegate(document, 'click', '[data-action="sc-dual"]', () => lineAction((i) => editor.toggleDual(i)));
delegate(document, 'click', '[data-action="sc-contd"]', () => lineAction((i, el) => {
  if (el.type !== 'character') { say("CONT'D goes on a character cue — put the caret in one first."); return; }
  el.text = withContd(el.text);
  editor.patchRow(el.id);
  persistNow();
  refreshDerivedUi();
  editor.focusEl(el.id);
}));
delegate(document, 'click', '[data-action="sc-up"]', () => lineAction((i, el) => editor.moveElement(el.id, -1)));
delegate(document, 'click', '[data-action="sc-down"]', () => lineAction((i, el) => editor.moveElement(el.id, 1)));
delegate(document, 'click', '[data-action="sc-del"]', () => lineAction(async (i0, el) => {
  if (el.text.trim()
      && !(await askDanger({ title: `Delete this ${typeLabel(el.type).toLowerCase()}?`, body: '“' + el.text.trim().slice(0, 80) + '”', confirm: 'Delete' }))) return;
  // The document may have moved while the dialog was open: find the line again.
  const i = doc.elements.indexOf(el);
  if (i < 0) return;
  if (doc.elements.length === 1) { el.text = ''; editor.patchRow(el.id); persistNow(); refreshDerivedUi(); return; }
  editor.removeElement(i, (k) => doc.elements[k] || doc.elements[k - 1]);
}));

/* ---- beats ------------------------------------------------------ */
function setBeats(open) {
  beatsOpen = open;
  const aside = document.getElementById('beatsPanel');
  const btn = document.querySelector('[data-action="sc-beats"]');
  if (!aside) return;
  aside.hidden = !open;
  document.getElementById('main')?.classList.toggle('has-beats', open);
  if (btn) { btn.setAttribute('aria-expanded', String(open)); btn.classList.toggle('is-on', open); }
  if (open) {
    if (!beats || !aside.contains(document.querySelector('.bp'))) {
      if (beats) beats.destroy();
      beats = mountBeats(aside, {
        getElements: () => doc.elements,
        scrollToEl: (id) => editor.scrollToEl(id),
        onJump: ({ id }) => { if (id) editor.focusEl(id); },
        /* a feature runs ~110 pages, a short ~15: where each beat should land */
        getTargetPages: () => (/short/i.test(String((currentProject() || {}).format || '')) ? 15 : 110)
      });
      if (curId) beats.setCurrent(curId);
    }
    beats.open();   // the button is the only toggle; the panel's own caret stays usable
  }
}
let beats = null;
delegate(document, 'click', '[data-action="sc-beats"]', () => setBeats(!beatsOpen));

/* ---- the ⋯ menu ------------------------------------------------- */
delegate(document, 'click', '[data-action="sc-tamil"]', () => {
  setTamilTyping(!isTamilTyping());
  if (curId) editor.focusEl(curId);
});
delegate(document, 'click', '[data-action="sc-dictate"]', () => {
  const btn = document.querySelector('.wr-dict-btn');
  if (!btn) { say('Dictation needs a browser with speech recognition (Chrome).'); return; }
  if (curId) editor.focusEl(curId);
  btn.click();
});
delegate(document, 'click', '[data-action="sc-keys"]', () => {
  WriteKeys.publishSheet(keyPrefs);
  if (StudioUI.openShortcutSheet) StudioUI.openShortcutSheet();
});
delegate(document, 'click', '[data-action="sc-check"]', () => {
  const btn = document.querySelector('[data-action="fg-check"]');
  if (btn) btn.click();
  else say('The format check is not available here.');
});

async function exportPDF() {
  if (doc.elements.every((e) => !String(e.text || '').trim())) { say('Nothing to export yet — write a line first.'); return; }
  const main = document.getElementById('main');
  if (!main) return;
  let T;
  try { T = await typesetter(); }
  catch (e) { say('The typesetter could not be loaded. Check the connection and try again.'); return; }
  let node = null;
  const iso = new Date().toISOString();
  PDF.exportPDF({
    scope: 'screenplay',
    title: Script.projectTitle() + ' — Screenplay',
    subtitle: [draftLabel(), formatPages(pageCount(doc.elements)) + ' pages'].filter(Boolean).join(' · '),
    before: () => {
      node = T.buildDocument(doc, {
        title: Script.projectTitle(), revision: '', subtitle: iso.slice(0, 10), date: iso.slice(0, 10), sceneNumbers: false
      });
      main.append(node);
    },
    after: () => { if (node) { node.remove(); node = null; } }
  });
}
delegate(document, 'click', '[data-action="sc-pdf"]', () => { exportPDF(); });

/* ---- import (a dialog; script-import.js and script-commit.js) --- */
let imp = null;      // { plan, name, replace }
let impDialog = null;
let impInline = false;   // arrived by #import: an in-page panel, not a modal

function closeImport() {
  if (impDialog) { impDialog.remove(); impDialog = null; }
  imp = null;
  if (location.hash === '#import') history.replaceState(null, '', location.pathname + location.search);
  if (curId) editor.focusEl(curId);
}
const isBlankDoc = () => doc.elements.every((e) => !String(e.text || '').trim());

function drawImport() {
  const body = h('div.sc-imp-body');
  if (!imp) {
    const file = h('input', { type: 'file', id: 'scImpFile', class: 'sc-imp-file',
      accept: '.fountain,.spmd,.txt,.fdx,.xml,.pdf,text/plain,application/pdf', 'data-action': 'sc-imp-file' });
    body.append(
      h('p', { text: 'Choose a PDF, Fountain, plain-text or Final Draft file, or paste the text. It is read in this browser; nothing is uploaded.' }),
      h('div.sc-imp-row', {}, [h('label.btn.primary', { for: 'scImpFile', text: 'Choose a file…' }), file]),
      h('label.sc-imp-paste-l', {}, [
        h('span', { text: 'Or paste the screenplay' }),
        h('textarea#scImpPaste.sc-imp-paste', { rows: '6', spellcheck: 'false', placeholder: 'INT. HOSTEL ROOM - NIGHT\n\nArun stares at the board.' })
      ]),
      h('button.btn', { type: 'button', 'data-action': 'sc-imp-paste', text: 'Read the pasted text' })
    );
  } else {
    const p = imp.plan;
    body.append(
      h('p', { text: 'Read ' + (imp.name ? '“' + imp.name + '” ' : '') + 'as ' + (p.formatLabel || p.format) + ': '
        + p.elements.length + ' lines, ' + formatPages(p.pages) + ' pages, '
        + p.scenes.length + (p.scenes.length === 1 ? ' scene.' : ' scenes.') })
    );
    if (!isBlankDoc()) {
      body.append(h('div.sc-imp-modes', { role: 'radiogroup', 'aria-label': 'Where it goes' }, [
        ['append', 'Add after what is written'], ['replace', 'Replace the screenplay (a draft is saved first)']
      ].map(([m, label]) => h('button.btn' + ((imp.replace ? 'replace' : 'append') === m ? '.is-on' : ''), {
        type: 'button', role: 'radio', 'aria-checked': String((imp.replace ? 'replace' : 'append') === m),
        'data-action': 'sc-imp-mode', 'data-mode': m, text: label
      }))));
    }
    body.append(h('div.sc-imp-row', {}, [
      h('button.btn.primary', { type: 'button', 'data-action': 'sc-imp-commit', text: 'Import' }),
      h('button.btn', { type: 'button', 'data-action': 'sc-imp-back', text: 'Back' })
    ]));
  }
  const dlg = h(impInline ? 'section#import.sc-imp.is-inline' : 'div#scImport.sc-imp', impInline
    ? { 'aria-label': 'Import Screenplay' }
    : { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Import Screenplay' }, [
    h('div.sc-imp-card', {}, [
      h('div.sc-imp-head', {}, [
        h('h2', { text: 'Import Screenplay' }),
        h('button.bd-icon', { type: 'button', 'data-action': 'sc-imp-close', 'aria-label': 'Close', text: '✕' })
      ]),
      body
    ])
  ]);
  if (impDialog) impDialog.replaceWith(dlg);
  else if (impInline) { const m = document.getElementById('main'); const sh = document.getElementById('screenplay'); if (m && sh) m.insertBefore(dlg, sh); else document.body.append(dlg); }
  else document.body.append(dlg);
  impDialog = dlg;
  (dlg.querySelector('textarea, button.primary') || dlg).focus?.();
}
function openImport(inline = false) { if (!PlanGate.guard('script_import')) return; if (!impDialog) { imp = null; impInline = inline; drawImport(); } }

async function takeScript(text, name) {
  if (!PlanGate.guard('script_import')) return;
  if (!String(text || '').trim()) { say('That file was empty.'); return; }
  let Parser;
  try { Parser = await importer(); }
  catch (e) { say('The screenplay parser could not be loaded. Check the connection and try again.'); return; }
  let plan;
  try { plan = Parser.parseScript(text, name); }
  catch (e) { console.warn('[script] import', e); say('That file could not be read as a screenplay.'); return; }
  if (plan.fatal || !plan.elements.length) { say(plan.warnings[0] || 'Nothing in that file looked like a screenplay.'); return; }
  imp = { plan, name: name || '', replace: false };
  drawImport();
}

delegate(document, 'click', '[data-action="sc-import"]', (e) => { e.preventDefault(); openImport(); });
delegate(document, 'click', '[data-action="sc-imp-close"]', closeImport);
delegate(document, 'click', '[data-action="sc-imp-back"]', () => { imp = null; drawImport(); });
delegate(document, 'click', '[data-action="sc-imp-mode"]', (e, btn) => { imp.replace = btn.dataset.mode === 'replace'; drawImport(); });
delegate(document, 'change', 'input[data-action="sc-imp-file"]', async (e, input) => {
  const file = input.files && input.files[0];
  if (!file) return;
  let Parser;
  try { Parser = await importer(); } catch (err) { say('The screenplay parser could not be loaded.'); return; }
  let text;
  try { text = await Parser.readFile(file); }
  catch (err) { say((err && err.message) || 'That file could not be read.'); return; }
  takeScript(text, file.name);
});
delegate(document, 'click', '[data-action="sc-imp-paste"]', () => {
  const box = document.getElementById('scImpPaste');
  if (!box || !box.value.trim()) { say('Paste a screenplay into the box first.'); return; }
  takeScript(box.value, '');
});
delegate(document, 'click', '[data-action="sc-imp-commit"]', async () => {
  if (!imp) return;
  const blank = isBlankDoc();
  if (imp.replace && !blank && !(await ask({ title: 'Replace the screenplay?', body: 'A draft of the current one is saved first, so it can be restored.', confirm: 'Replace' }))) return;
  if (!imp) return;
  if (blank) doc.elements = [];
  const done = commitImportedScript(imp.plan, {
    replaceScript: blank || imp.replace, replaceScenes: blank || imp.replace,
    doc, persist: persistNow, importName: imp.name
  });
  closeImport();
  curId = null;
  renderPage();
  const d = document.querySelector('[data-sc="draft"]');
  if (d) d.textContent = draftLabel();
  say('Imported ' + done.elements + ' lines and ' + done.scenes + (done.scenes === 1 ? ' scene' : ' scenes') + '. Next: Screenplay Analysis.');
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && impDialog) closeImport(); });

/* ---- boot --------------------------------------------------------- */
render();
mountTamilType();
WriteKeys.publishSheet(keyPrefs);
mountFocusMode(() => doc);
/* Focus mode injects its button inside #screenplay; bring it up into the
   top bar (it is found by id, so it is not injected twice). */
{
  const slot = document.getElementById('scFocusSlot');
  const btn = document.getElementById('fm-enter');
  if (slot && btn) slot.append(btn);
}
installLeavePrompt({ getDoc: () => doc, persistNow: () => persistNow() });
if (location.hash === '#import') openImport(true);
/* script.html#line-<id>: a search result opens the page at that line. */
installLineLanding(editor);
function syncGuide() {
  const g = document.getElementById('guide');
  if (!g) return;
  const show = location.hash === '#guide';
  if (g.hidden === show) g.hidden = !show;
  if (show) g.scrollIntoView({ behavior: 'instant', block: 'start' });
}
addEventListener('hashchange', () => { if (location.hash === '#import') openImport(true); syncGuide(); });
delegate(document, 'click', '[data-action="sc-generate"]', () => { location.href = 'write.html?stay=1#generate'; });
delegate(document, 'click', '[data-action="sc-coverage"]', () => { location.href = 'write.html?stay=1#coverage'; });
delegate(document, 'click', '[data-action="sc-notes"]', async () => {
  try {
    const m = await import('../ui/script-notes.js');
    await m.openScriptNotes({
      getElements: () => doc.elements, getNumbering: () => doc.numbering,
      title: Script.projectTitle(), say,
      goTo: (id) => { editor.scrollToEl(id); editor.focusEl(id); }
    });
  } catch (e) { console.warn('[script] notes', e); say('Notes could not be opened here. Try again in a moment.'); }
});
delegate(document, 'click', '[data-action="sc-guide"]', () => {
  if (location.hash === '#guide') syncGuide(); else location.hash = '#guide';
});
