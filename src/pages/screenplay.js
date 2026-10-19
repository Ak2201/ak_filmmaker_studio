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
import { flushStorage, currentProject, currentProjectId, subscribe } from '../lib/store.js';
import { incomingAction, keepBoth, takeTheirs } from '../lib/script-incoming.js';
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
import { button, sym, sheet as kitSheet, closeSheet } from '../ui/kit/index.js';
import PDF from '../lib/pdf.js';
import { commitImportedScript } from '../lib/script-commit.js';
import { sceneSyncLater, mountHandoff } from '../ui/handoff.js';
import Keys from '../lib/write-keys.js';
import { writeHintsOn, setWriteHints } from '../lib/write-prefs.js';
import { createSmartType } from '../ui/smarttype.js';
import WriteKeys from '../ui/write-shortcuts.js';
import '../styles/smarttype.css';
import { mountEditor, elFocus } from '../ui/script-editor/editor.js';
import { installLineLanding } from '../ui/script-find.js';
import { mountReplaceBar } from '../ui/script-replace-bar.js';
import { mountPresence } from '../ui/presence.js';
import { aiPill } from '../ui/ai-pill.js';   // the one way into AI; the Desk and ai.js load at a click
import { mountBeats, deriveBeats } from '../ui/beats-panel.js';
import { caretPosition, formatCaretPage, sceneTotal } from '../lib/caret-position.js';
import Scenes from '../lib/scenes.js';
import { installLeavePrompt } from '../ui/leave-prompt.js';
import { latestDraft } from '../lib/drafts.js';
/* The page's derivations and sentences: src/lib/screenplay-model.js. */
import {
  draftLabel as draftLabelOf, isBlankScript, showStartHint, typeKeyHint, typeName, tipKeysLine,
  scriptStats, estimatedRuntime, splitRuntime as splitRuntimeOf, targetDeltaText, targetLabel,
  targetPagesFor, scenePosText, shotsSummary, importReadText, importDoneText, pdfSubtitle
} from '../lib/screenplay-model.js';
import { pageAnchors } from '../lib/write-format.js';
import { mountStageGuide } from '../ui/stage-guide.js';
import { learn } from '../ui/learn.js';
import Script, {
  ELEMENT_TYPES, ELEMENT_TYPE_IDS, typeLabel, blankElement, withContd,
  formatPages, formatRuntime
} from '../lib/script.js';

const analysis = () => import('../lib/screenplay-analysis.js');
const shotsLib = () => import('../lib/shots.js');
const targetLib = () => import('../lib/target-runtime.js');
/* The page's phone width: the same number every rule in screenplay.css
   pairs with its min-width: 720px desk rules. */
const PHONE_Q = '(max-width: 719px)';
const isPhone = () => typeof matchMedia === 'function' && matchMedia(PHONE_Q).matches;
import PlanGate from '../lib/plan-gate.js';   // script_import (src/data/plan-matrix.json)

const typesetter = () => import('../lib/screenplay-export.js');
const importer = () => import('../lib/script-import.js');
const app = document.getElementById('app');

/* ---- the model and its one save path ------------------------- */
let doc = Script.loadScript();
/* An empty script gets one blank scene line IN MEMORY so there is a
   line to type in. Not saved here; the first keystroke saves it. */
if (!doc.elements.length) doc.elements.push(blankElement({ type: 'scene' }));
/* THE SCRIPT DRIVES THE SCENES (open item 16), here as on write.html.
   handoff.js reads the in-memory script through getDoc and keeps the
   heading baseline the sync compares against; without this call getDoc
   stayed `() => null`, so every sceneSyncLater() below was a no-op and
   headings typed in the Screenplay Writer never reached the Breakdown.
   prove:storage's "two projects" block is what caught it. */
try { mountHandoff({ getDoc: () => doc }); } catch (e) { console.warn('[screenplay] hand-off', e); }

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

/* ---- a newer copy arrived (cloud.js, pulled or live) ---------------
   cloud.js writes the synced script straight into storage; `doc` above is
   this page's own copy. Without this, the next keystroke saved that older
   copy over the one just synced, with a newer clock, and the other
   device's work was gone from the cloud. src/lib/script-incoming.js
   decides: nothing unsaved here → show the arrival; mid-edit → keep what
   is on screen AND keep the arrival as a draft, with "Use theirs" one
   press away (which keeps this copy as a draft in turn). No branch
   drops a line. */
let lastTypedAt = 0;
document.addEventListener('input', (e) => {
  if (e.target && e.target.matches && e.target.matches('#wr-page .wr-text')) lastTypedAt = Date.now();
}, { capture: true });
const clock = () => new Date().toTimeString().slice(0, 5);
const inEditor = () => !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#wr-page'));
function showDoc() {
  if (!doc.elements.length) doc.elements.push(blankElement({ type: 'scene' }));
  const keep = curId && doc.elements.some((e) => e.id === curId) && inEditor() ? elFocus(curId) : null;
  renderPage(keep);
  refreshDraftLabel();
}
function onIncomingScript(live) {
  const fresh = Script.loadScript();
  const dirty = !!(saveTimer || saving || saveOwed) || Date.now() - lastTypedAt < 2500;
  const act = incomingAction({ mine: doc, fresh, dirty });
  if (act === 'same') return;
  if (act === 'load') {
    doc = fresh;
    showDoc();
    if (!live) say('Updated with the newer copy from your other device.');   // the live path already said so
    return;
  }
  const arrived = fresh;
  doc = keepBoth(doc, arrived, 'From another device, ' + clock());
  persistNow();
  refreshDraftLabel();
  try {
    StudioUI.toast('Another device saved a different version of this script while you were writing. Yours is kept; theirs is in Drafts as “From another device”.', {
      type: 'info', action: 'Use theirs',
      onAction: () => {
        doc = takeTheirs(doc, arrived, 'Your version, ' + clock());
        persistNow();
        showDoc();
      }
    });
  } catch (e) { /* chrome may not be up */ }
}
subscribe('cloud:synced', (p) => {
  if (!p || (p.projectId && p.projectId !== currentProjectId())) return;
  if (p.scope === 'script') onIncomingScript(true);
  else if (Array.isArray(p.scopes) && p.scopes.includes('script')) onIncomingScript(false);
});
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

/* ---- find and replace (Ctrl/Cmd+Shift+H, or Tools) ------------- */
const replaceBar = mountReplaceBar({
  editor,
  getDoc: () => doc,
  persistNow: () => persistNow(),
  afterChange: () => { refreshDerivedUi(); scheduleDerived(); },
  toast: (m, o) => StudioUI.toast(m, o),
  host: () => document.getElementById('scTop')
});
delegate(document, 'click', '[data-action="sc-find"]', () => replaceBar.open(curId));

/* ---- draft label ------------------------------------------------ */
const draftLabel = () => draftLabelOf(doc);
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
let typeName_ = null;
let typeKey_ = null;
let lineBar = null;
let sheet = null;
let beatsOpen = false;

/* The page's tools, ONCE: the desk's File and ⋯ menus and the phone's
   Tools sheet are both drawn from these lists, so the two layouts carry
   the same features in different places (owner, parity rule). */
const FILE_ITEMS = [
  { label: 'Import Screenplay', action: 'sc-import', icon: 'upload_file' },
  { label: 'Export PDF', action: 'sc-pdf', hint: 'working copy', icon: 'picture_as_pdf' },
  { label: 'Export Word (.docx)', action: 'sc-docx', hint: 'to edit in Word', icon: 'description' },
  { label: 'Drafts & history', href: 'drafts.html', icon: 'history' },
  { label: 'Title page', href: 'drafts.html#title', icon: 'menu_book' }
];
const TOOL_ITEMS = [
  { label: 'Tamil typing', action: 'sc-tamil', hint: 'Alt+T', icon: 'translate' },
  { label: 'Dictation', action: 'sc-dictate', icon: 'mic' },
  { label: 'Find and replace', action: 'sc-find', hint: 'Ctrl/⌘ Shift H', icon: 'find_replace' },
  { label: 'Keyboard shortcuts', action: 'sc-keys', hint: '?', icon: 'keyboard' },
  { label: 'Format check', action: 'sc-check', icon: 'spellcheck' },
  { label: 'Notes overview', action: 'sc-notes', hint: 'all notes', icon: 'sticky_note_2' }
];
const HELP_ITEMS = [
  { label: 'Show or hide hints', action: 'sc-hints', icon: 'lightbulb' },
  { label: 'Write from a synopsis', action: 'sc-generate', hint: 'AI', icon: 'auto_awesome' }
];

function buildTop() {
  statusNode = h('span.sc-status', { role: 'status', 'aria-live': 'polite', text: 'Saved ✓' });
  typeSel = h('select.sc-type', { id: 'scType', 'aria-label': 'Current line type' });
  ELEMENT_TYPES.forEach((t) => typeSel.append(h('option', { value: t.id, text: t.label })));
  /* The pill SHOWS the type and its Alt+digit; the real <select> sits
     over it, transparent, so it is still the control (keyboard, screen
     reader, the proofs) and the platform's own picker still opens. */
  typeName_ = h('span.sc-typename', { 'aria-hidden': 'true', text: ELEMENT_TYPES[0].label });
  typeKey_ = h('span.sc-typekey', { 'aria-hidden': 'true' });
  const typePill = h('span.sc-typepill', {}, [
    h('span.sc-typedot', { 'aria-hidden': 'true' }), typeName_, typeKey_,
    h('span.sc-caret', { 'aria-hidden': 'true', text: '▾' }), typeSel
  ]);
  const stat = (label, key) => h('span.sc-stat', {}, [label + ': ', h('strong', { 'data-sc-stat': key, text: '…' })]);
  /* The running time opens its own breakdown: dialogue against action,
     at the speaking paces Screenplay Analysis uses, and the film's one
     target (Reports'). A button, so it is the same on a phone and a desk. */
  const rtBtn = h('button.sc-stat.sc-rt-btn', {
    type: 'button', 'data-action': 'sc-runtime', 'aria-expanded': 'false', 'aria-controls': 'scRuntime',
    title: 'Dialogue and action, against the target'
  }, ['Est. runtime: ', h('strong', { 'data-sc-stat': 'runtime', text: '…' }), h('span.sc-rt-caret', { 'aria-hidden': 'true', text: '▾' })]);
  const stats = h('p.sc-stats', { 'aria-label': 'Script length' }, [
    stat('Words', 'words'), stat('Pages', 'pages'), rtBtn
  ]);
  /* Where the caret is: scene, beat, page, and the shots planned for
     the scene on Visualize. Every part is derived; a part with nothing
     behind it is hidden, never filled in. */
  const pos = h('p.sc-pos', { 'aria-label': 'Where you are', 'aria-live': 'off' }, [
    h('span.sc-pos-dot', { 'aria-hidden': 'true' }),
    h('span.sc-pos-item', { 'data-sc-pos': 'scene' }),
    h('span.sc-pos-item', { 'data-sc-pos': 'beat', hidden: true }),
    h('span.sc-pos-item', { 'data-sc-pos': 'page', hidden: true }),
    h('a.sc-pos-item.sc-pos-shots', { 'data-sc-pos': 'shots', href: 'visualize.html#shot-list', hidden: true })
  ]);

  /* The draft and the save state. It used to open with "Screenplay Writer
     · <project>", a second breadcrumb under the band's (which names the
     page) beside the band's switcher (which names the project); the
     editor's own line says only what the band cannot. */
  const crumb = h('p.sc-draftline', {}, [
    h('span.sc-draft', { 'data-sc': 'draft', text: draftLabel() }),
    h('span.sc-sep', { text: '·', 'aria-hidden': 'true' }),
    statusNode,
    /* Who else is in this script (src/ui/presence.js). Hidden until
       somebody is; a role="group" so the label reads with the faces. */
    h('span#scPeers.sc-peers', { role: 'group', hidden: true })
  ]);
  const meta = h('div.sc-meta', {}, [crumb, stats]);
  const runtime = h('div#scRuntime.sc-runtime', { role: 'region', 'aria-label': 'Running time', hidden: true });

  const beatsBtn = button({
    label: 'Beats ◧', icon: 'view_sidebar', size: 'sm', action: 'sc-beats', class: 'sc-beats-btn',
    attrs: { 'aria-expanded': 'false', 'aria-controls': 'beatsPanel' }
  });
  const fileMenu = actionMenu('File', [{ heading: 'File actions' }, ...FILE_ITEMS], { align: 'right', ariaLabel: 'File actions' });
  const menu = actionMenu('⋯', [{ heading: 'Tools' }, ...TOOL_ITEMS, { heading: 'Help' }, ...HELP_ITEMS],
    { align: 'right', compact: true, ariaLabel: 'More' });
  /* The phone's one Tools button: the same items as File and ⋯ (and
     Focus, which has no room in a 390px row), as a bottom sheet. */
  const toolsBtn = button({
    label: 'Tools', icon: 'more_horiz', iconOnly: true, size: 'sm', action: 'sc-tools-sheet', class: 'sc-tools-sheet-btn',
    attrs: { 'aria-haspopup': 'dialog' }
  });
  /* actionbar.js builds its toggles as the chrome's `.btn`; on this
     page they wear the kit's button, like everything else in the bar. */
  [fileMenu, menu].forEach((m) => {
    const b = m.querySelector('.tb-menu-btn');
    if (b) { b.classList.remove('btn'); b.classList.add('k-btn', 'k-btn--secondary', 'k-btn--sm'); }
  });

  /* ONE AI pill, a menu of the existing tools, each an AI Desk task
     (src/lib/ai-tasks.js). The ctx is computed at the click: the
     script in memory, the page's own save and redraw, and the line
     the caret was last in — so "this speech" and "this scene" mean
     the one the writer is on. Greyed with the Pro offer on a plan
     without AI; this page loads no model code. */
  const ai = aiPill({
    label: 'AI',
    tasks: [
      { id: 'coverage', label: 'Coverage report' },
      { id: 'dialogue-pass', label: 'Dialogue pass (speech at the caret)' },
      { id: 'beat-critique', label: 'Critique this scene' }
    ],
    ctx: () => ({
      identity: 'script:' + (curId || ''),
      getDoc: () => doc,
      cursorId: () => curId,
      save: () => persistNow(),
      render: (id) => renderPage(id ? elFocus(id) : null),
      after: () => refreshDraftLabel()
    })
  });

  /* The shell's `.toolbar` convention is not used: this bar is the
     page's own, and a focus button is moved in once focus-mode has
     injected it (see mountFocus). */
  tipNode = h('div#scTip.sc-tip', { role: 'note', 'aria-live': 'polite', hidden: !hintsOn() });
  return h('div#scTop.sc-top', {}, [
    meta,
    h('div.sc-tools', {}, [
      h('div.sc-tools-l', {}, [typePill, h('span.sc-vsep', { 'aria-hidden': 'true' }), beatsBtn, ai, h('span#scFocusSlot.sc-focus-slot')]),
      pos,
      h('div.sc-tools-r', {}, [fileMenu, menu, toolsBtn])
    ]),
    runtime,
    h('p#scPeerWarn.sc-peer-warn', { role: 'status', 'aria-live': 'polite', hidden: true }),
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
  const aside = h('aside#beatsPanel.sc-beats', { 'aria-label': 'Beats', hidden: true }, [
    h('div.sc-beats-bar', {}, [
      h('span.sc-beats-grab', { 'aria-hidden': 'true' }),
      button({ label: 'Close beats', icon: 'close', iconOnly: true, variant: 'ghost', size: 'sm', action: 'sc-beats-close', class: 'sc-beats-x' })
    ])
  ]);
  /* The phone's scrim behind the beats sheet; a tap on it closes them. */
  const scrim = h('div.sc-beats-scrim', { 'data-action': 'sc-beats-close', 'aria-hidden': 'true' });
  main.append(buildTop(), sheet, after, aside, scrim, buildChips());
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
  refreshStats();
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
  refreshStats();
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
  if (typeName_) {
    const t = el ? el.type : typeSel.value;
    const label = typeLabel(t);
    if (typeName_.textContent !== label) typeName_.textContent = label;
    const hint = typeKeyHint(t, keyPrefs.preset, knownTypes());
    if (typeKey_.textContent !== hint) typeKey_.textContent = hint;
  }
  if (lineBar && el && lineBar.dataset.type !== el.type) lineBar.dataset.type = el.type;
  document.querySelectorAll('.sc-chip').forEach((c) => {
    const on = !!el && c.dataset.type === el.type;
    if (c.classList.contains('is-on') !== on) c.classList.toggle('is-on', on);
    if (c.getAttribute('aria-pressed') !== String(on)) c.setAttribute('aria-pressed', String(on));
  });
  paintTip(el);
  refreshPos();
  if (hintNode) {
    const empty = showStartHint(doc.elements);
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
const hintsOn = () => writeHintsOn();
const setHints = (on) => setWriteHints(on);   // private mode: holds for this visit
function paintTip(el) {
  if (!tipNode || tipNode.hidden || !el) return;
  const empty = !String(el.text || '').trim();
  const key = el.type + (empty ? ':0' : ':1');
  if (key === tipKey) return;
  tipKey = key;
  const keysLine = tipKeysLine(el.type, empty, keyPrefs, knownTypes());
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
    refreshStats();
    refreshPos(true);
  }, 400);
}

/* ---- the status strip: words, pages, estimated running time ----
   DOM only, recomputed at idle and after a render. The running time is
   src/lib/screenplay-analysis.js's per-scene estimate (dialogue and
   action at speaking pace), loaded when first needed; until then the
   page-a-minute figure stands in. Stores nothing. */
let Analysis = null;
function refreshStats() {
  const put = (k, v) => {
    const n = document.querySelector('[data-sc-stat="' + k + '"]');
    if (n && n.textContent !== v) n.textContent = v;
  };
  const els = doc.elements;
  const { written, pages, words } = scriptStats(els);
  put('words', words);
  put('pages', formatPages(pages));
  if (!written) { put('runtime', '—'); estimateMin = 0; paintRuntime(); return; }
  const estimate = () => {
    const est = estimatedRuntime(Analysis, els, pages);
    put('runtime', est.text);
    estimateMin = est.minutes;
  };
  if (Analysis) estimate();
  else { put('runtime', formatRuntime(pages)); analysis().then((m) => { Analysis = m; estimate(); }, () => {}); }
  paintRuntime();
}
/* ---- the position strip: scene, beat, page, shots ---------------
   DOM only. The arithmetic part (scene ordinal, page in eighths) is
   cheap and runs with every caret move; the beat and the shots read
   the story, the scenes and the shot list, so they are recomputed only
   when the caret's scene changes or at idle (`deep`). */
let posScene;
let posBeat = '';
function putPos(k, text, show = !!text) {
  const n = document.querySelector('[data-sc-pos="' + k + '"]');
  if (!n) return;
  if (n.textContent !== text) n.textContent = text;
  if (n.hidden === show) n.hidden = !show;
}
function refreshPos(deep) {
  const p = curId ? caretPosition(doc.elements, curId) : null;
  const total = p ? p.sceneCount : sceneTotal(doc.elements);
  putPos('scene', scenePosText(p, total), true);
  putPos('page', p ? formatCaretPage(p) : '');
  const sid = p ? p.sceneElId : null;
  if (deep || sid !== posScene) {
    posScene = sid;
    posBeat = '';
    if (p) {
      try {
        const d = deriveBeats(doc.elements, curId, { targetPages: targetPages(), scenes: Scenes.listScenes() });
        const cur = d.rows.find((r) => r.current);
        posBeat = cur ? 'Beat: ' + (cur.beat.label || cur.beat.id) : '';
      } catch (e) { posBeat = ''; }
    }
    paintShots(sid);
  }
  putPos('beat', posBeat);
}
/* The shots planned for this scene on Visualize: the scene row the
   heading is linked to (scene.scriptElId, kept by the hand-off), and
   the shots filed under it, with their camera movement. No time
   estimate: nothing records how long a setup takes. A heading no scene
   row links to has no shot list, so the part is hidden, not "0". */
function paintShots(sid) {
  if (!sid) { putPos('shots', ''); return; }
  let row = null;
  try { row = Scenes.listScenes().find((sc) => sc && sc.scriptElId === sid) || null; } catch (e) { row = null; }
  if (!row) { putPos('shots', ''); return; }
  shotsLib().then((S) => {
    if (posScene !== sid) return;
    let list = [];
    try { list = S.listShots().filter((x) => x.sceneId === row.id); } catch (e) { list = []; }
    putPos('shots', shotsSummary(list), true);
  }, () => putPos('shots', ''));
}

/* ---- the film's target, for the beats and the running time -------
   ONE field (src/lib/target-runtime.js): Reports' target, else a value
   the Edit Log already holds. Read lazily; read again whenever the
   running-time panel or the beats open. */
let target = { minutes: 0, source: '' };
let estimateMin = 0;
function loadTarget() {
  return targetLib().then((T) => { target = T.targetRuntime(); return target; }, () => target);
}
/* Where the beats should land: a page a minute against the target when
   one is set; otherwise a feature's ~110 pages or a short's ~15. */
function targetPages() {
  if (target.minutes > 0) return target.minutes;   // read the project only when it decides
  return targetPagesFor(target, (currentProject() || {}).format);
}

/* ---- the running-time panel: dialogue against action --------------
   screenplay-analysis.js estimates every scene from its own words:
   dialogue at DIALOGUE_WPS a second plus a beat per speech, action at
   ACTION_WPS with a floor per sentence, and a moment per heading. The
   split is that same arithmetic read apart, so it always sums to the
   total in the strip. */
const splitRuntime = (A) => splitRuntimeOf(A, doc.elements);
function paintRuntime() {
  const box = document.getElementById('scRuntime');
  if (!box || box.hidden) return;
  const written = doc.elements.some((e) => String(e.text || '').trim());
  const done = (A) => {
    const kids = [];
    let estMin = 0;
    if (!written) {
      kids.push(h('p.sc-rt-none', { text: 'Write a line and the running time is estimated from its words.' }));
    } else {
      const r = splitRuntime(A);
      estMin = Math.round(r.all / 60);
      const pct = (x) => (r.all ? Math.round((x / r.all) * 100) : 0);
      const mins = (sec) => formatRuntime(sec / 60);
      const bar = h('div.sc-rt-bar', { 'aria-hidden': 'true' }, [h('span.sc-rt-dia'), h('span.sc-rt-act')]);
      bar.firstChild.style.width = pct(r.dia) + '%';
      bar.lastChild.style.width = (100 - pct(r.dia)) + '%';
      kids.push(
        h('div.sc-rt-row', {}, [
          h('span.sc-rt-k', {}, [h('span.sc-rt-key.is-dia', { 'aria-hidden': 'true' }), h('span', { text: 'Dialogue' })]),
          h('strong', { text: mins(r.dia) + ' · ' + pct(r.dia) + '%' })
        ]),
        h('div.sc-rt-row', {}, [
          h('span.sc-rt-k', {}, [h('span.sc-rt-key.is-act', { 'aria-hidden': 'true' }), h('span', { text: 'Action and headings' })]),
          h('strong', { text: mins(r.act) + ' · ' + (100 - pct(r.dia)) + '%' })
        ]),
        bar,
        h('p.sc-rt-note', { text: 'Estimated from the words: dialogue at ' + A.DIALOGUE_WPS + ' words a second, action at ' + A.ACTION_WPS + '.' })
      );
    }
    if (target.minutes > 0) {
      const d = estMin - target.minutes;
      kids.push(h('p.sc-rt-target' + (written && d > 0 ? '.is-over' : ''), {}, [
        h('span', { text: targetLabel(target) }),
        written ? h('strong', { text: targetDeltaText(estMin, target.minutes) }) : null
      ].filter(Boolean)));   // append(null) would print "null"
    } else {
      kids.push(h('p.sc-rt-target', {}, [
        h('span', { text: 'No target running time set. ' }),
        h('a', { href: 'reports.html#reports', text: 'Set one in Reports' })
      ]));
    }
    box.replaceChildren(...kids);
  };
  if (Analysis) done(Analysis);
  else analysis().then((m) => { Analysis = m; done(m); }, () => {});
}
delegate(document, 'click', '[data-action="sc-runtime"]', (e, btn) => {
  const box = document.getElementById('scRuntime');
  if (!box) return;
  const open = box.hidden;
  box.hidden = !open;
  btn.setAttribute('aria-expanded', String(open));
  if (open) loadTarget().then(paintRuntime);
});

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
  const anchors = pageAnchors(pages);
  // Locked pages print 12A or 12-13; the page view says the same.
  const labels = Typeset.pageNumbersDoc(doc, pages);
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
    const label = a.split ? 'Page ' + labels[p] + ' · continues' : 'Page ' + labels[p];
    const placed = node && node.dataset.anchor === key && node.textContent === label
      && (a.split ? node.previousElementSibling === target : node.nextElementSibling === target);
    if (placed) continue;
    if (!node) node = h('div.wr-pbreak', { role: 'separator', 'data-page': String(p) });
    node.dataset.anchor = key;
    node.classList.toggle('is-split', a.split);
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
/* On a wide screen the focused line carries a small toolbar above it:
   the same five actions as the line menu (right-click still opens that),
   through the same handlers below. Dual dialogue and CONT'D are shown
   only on a character cue, where the editor supports them. */
lineBar = h('div.sc-linebar', { role: 'toolbar', 'aria-label': 'Line actions' }, [
  ['sc-dual', 'Dual dialogue', 'is-cue'], ['sc-contd', "Add CONT'D", 'is-cue'],
  ['sc-up', 'Move up', 'is-ico', 'arrow_upward'], ['sc-down', 'Move down', 'is-ico', 'arrow_downward'], ['sc-del', 'Delete line', 'is-ico.is-danger', 'delete']
].map(([a, label, cls, icon]) => {
  const b = h('button.sc-lb.' + cls, { type: 'button', 'data-action': a, title: label, 'aria-label': label });
  b.append(icon ? sym(icon) : document.createTextNode(label));
  return b;
}));
lineBar.addEventListener('mousedown', (e) => e.preventDefault());
function placeLineButton(row) {
  if (lineBar.parentElement !== row) row.append(lineBar);
  if (lineBtn.parentElement !== row) row.append(lineBtn);
}
lineBtn.addEventListener('mousedown', (e) => e.preventDefault());

const lineMenu = h('div#scLineMenu.sc-line-menu', { role: 'menu', hidden: true }, [
  ['sc-dual', 'Dual dialogue', 'swap_horiz'], ['sc-contd', "Add CONT'D", 'add'], ['sc-up', 'Move up', 'arrow_upward'],
  ['sc-down', 'Move down', 'arrow_downward'], ['sc-del', 'Delete', 'delete']
].map(([a, label, icon]) => h('button.sc-line-item' + (a === 'sc-del' ? '.is-danger' : ''), {
  type: 'button', role: 'menuitem', 'data-action': a
}, [sym(icon), h('span', { text: label })])));
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
  document.documentElement.classList.toggle('sc-beats-on', open);
  if (btn) { btn.setAttribute('aria-expanded', String(open)); btn.classList.toggle('is-on', open); }
  if (open) {
    if (!beats || !aside.contains(document.querySelector('.bp'))) {
      if (beats) beats.destroy();
      beats = mountBeats(aside, {
        getElements: () => doc.elements,
        scrollToEl: (id) => editor.scrollToEl(id),
        onJump: ({ id }) => { if (id) editor.focusEl(id); if (isPhone()) setBeats(false); },
        getTargetPages: () => targetPages(),
        getTarget: () => ({ minutes: target.minutes, source: target.source, estimate: estimateMin })
      });
      if (curId) beats.setCurrent(curId);
      loadTarget().then(() => { if (beats) beats.refresh(); });
    }
    beats.open();   // the button is the only toggle; the panel's own caret stays usable
    if (isPhone()) aside.querySelector('[data-action="sc-beats-close"]')?.focus({ preventScroll: true });
  } else if (btn && aside.contains(document.activeElement)) btn.focus({ preventScroll: true });
}
/* On a phone the beats are a bottom sheet over the page: a scrim behind
   it and a close button on it, so the writer is never left under a
   panel with the Beats button out of reach. */
delegate(document, 'click', '[data-action="sc-beats-close"]', () => setBeats(false));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && beatsOpen && isPhone() && !document.querySelector('.mn-overlay')) setBeats(false);
});
let beats = null;
delegate(document, 'click', '[data-action="sc-beats"]', () => setBeats(!beatsOpen));

/* ---- the phone's Tools sheet -------------------------------------
   The kit's bottom sheet (the bottom bar's own Go-to / Tools frame),
   holding the desk's File and ⋯ items plus Focus. A row does not run
   the action itself: it closes the sheet, then clicks the desk menu's
   own item (still in the DOM, only hidden at this width), so there is
   exactly one handler per action and focus lands where that handler
   puts it, not back on the Tools button. */
function sheetRow(it) {
  if (it.href) {
    return h('a.sc-sheet-row', { href: it.href }, [
      sym(it.icon),
      h('span.sc-sheet-label', { text: it.label })
    ]);
  }
  return h('button.sc-sheet-row', { type: 'button', 'data-sc-act': it.action }, [
    sym(it.icon),
    h('span.sc-sheet-label', { text: it.label }),
    it.hint ? h('span.sc-sheet-hint', { text: it.hint }) : null
  ].filter(Boolean));
}
function openToolsSheet(opener) {
  const groups = [
    ['File', FILE_ITEMS],
    ['Write', [{ label: 'Focus mode', action: 'fm-enter', hint: 'only the page', icon: 'center_focus_strong' }]],
    ['Tools', TOOL_ITEMS],
    ['Help', HELP_ITEMS]
  ];
  const body = h('div.sc-sheet-body', {}, groups.map(([title, items]) => h('section.sc-sheet-group', { 'aria-label': title }, [
    h('h3.sc-sheet-h', { text: title }),
    ...items.map(sheetRow)
  ])));
  body.addEventListener('click', (e) => {
    const row = e.target.closest && e.target.closest('[data-sc-act]');
    if (!row) return;
    const act = row.dataset.scAct;
    closeSheet().then(() => {
      const real = act === 'fm-enter' ? document.getElementById('fm-enter')
        : document.querySelector('#scTop .tb-menu-panel [data-action="' + act + '"]');
      if (real) real.click();
    });
  });
  kitSheet({ title: 'Screenplay tools', body, kind: 'sc-tools', returnTo: opener });
}
delegate(document, 'click', '[data-action="sc-tools-sheet"]', (e, btn) => openToolsSheet(btn));

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
  if (isBlankScript(doc.elements)) { say('Nothing to export yet — write a line first.'); return; }
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
    subtitle: pdfSubtitle(doc),
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

/* Word: a file someone without the studio can open and edit, each
   element in its named screenplay style (src/lib/screenplay-docx.js).
   Loaded at the press, so no page pays for it on first paint. */
async function exportDOCX() {
  if (isBlankScript(doc.elements)) { say('Nothing to export yet — write a line first.'); return; }
  let W;
  try { W = await import('../lib/screenplay-docx.js'); }
  catch (e) { say('The Word exporter could not be loaded. Check the connection and try again.'); return; }
  const title = Script.projectTitle();
  const blob = new Blob([W.toDOCX(doc, { title })], { type: W.DOCX_MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = Script.slugify(title, 'screenplay') + '.docx';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
delegate(document, 'click', '[data-action="sc-docx"]', () => { exportDOCX(); });

/* ---- import (a dialog; script-import.js and script-commit.js) --- */
let imp = null;      // { plan, name, replace }
let impDialog = null;
/* ONE import, however it is reached: the Import button, the hint's link
   and an arrival at screenplay.html#import (the nav's Import Screenplay)
   all open this same dialog. Its card carries id="import", so the
   fragment still names a visible element. */

function closeImport() {
  if (impDialog) { impDialog.remove(); impDialog = null; }
  imp = null;
  if (location.hash === '#import') history.replaceState(null, '', location.pathname + location.search);
  if (curId) editor.focusEl(curId);
}
const isBlankDoc = () => isBlankScript(doc.elements);

function drawImport() {
  const body = h('div.sc-imp-body');
  if (!imp) {
    const file = h('input', { type: 'file', id: 'scImpFile', class: 'sc-imp-file',
      accept: '.fountain,.spmd,.txt,.fdx,.xml,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'data-action': 'sc-imp-file' });
    body.append(
      h('p', { text: 'Choose a PDF, Fountain, plain-text, Final Draft or Word file, or paste the text. It is read in this browser; nothing is uploaded.' }),
      h('div.sc-imp-row', {}, [h('label.k-btn.k-btn--primary.k-btn--pill', { for: 'scImpFile' }, [sym('upload_file'), h('span', { text: 'Choose a file…' })]), file]),
      h('label.sc-imp-paste-l.k-field', {}, [
        h('span.k-field-label', { text: 'Or paste the screenplay' }),
        h('span.k-control.k-control--textarea', {}, [
          h('textarea#scImpPaste.sc-imp-paste.k-textarea', { rows: '6', spellcheck: 'false', placeholder: 'INT. HOSTEL ROOM - NIGHT\n\nArun stares at the board.' })
        ])
      ]),
      button({ label: 'Read the pasted text', action: 'sc-imp-paste' })
    );
  } else {
    body.append(h('p', { text: importReadText(imp.name, imp.plan) }));
    if (!isBlankDoc()) {
      body.append(h('div.sc-imp-modes.k-seg', { role: 'radiogroup', 'aria-label': 'Where it goes' }, [
        ['append', 'Add after what is written'], ['replace', 'Replace the screenplay (a draft is saved first)']
      ].map(([m, label]) => h('button.k-seg-btn' + ((imp.replace ? 'replace' : 'append') === m ? '.is-on' : ''), {
        type: 'button', role: 'radio', 'aria-checked': String((imp.replace ? 'replace' : 'append') === m),
        'data-action': 'sc-imp-mode', 'data-mode': m, text: label
      }))));
    }
    body.append(h('div.sc-imp-row', {}, [
      button({ label: 'Import', variant: 'primary', pill: true, action: 'sc-imp-commit' }),
      button({ label: 'Back', variant: 'ghost', action: 'sc-imp-back' })
    ]));
  }
  const dlg = h('div#scImport.sc-imp', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Import Screenplay' }, [
    h('div.sc-imp-card', { id: 'import' }, [
      h('div.sc-imp-head', {}, [
        h('span.sc-imp-icon', {}, [sym('upload_file')]),
        h('h2', { text: 'Import Screenplay' }),
        button({ label: 'Close', icon: 'close', iconOnly: true, variant: 'ghost', size: 'sm', action: 'sc-imp-close', class: 'sc-imp-x' })
      ]),
      body
    ])
  ]);
  if (impDialog) impDialog.replaceWith(dlg);
  else document.body.append(dlg);
  impDialog = dlg;
  (dlg.querySelector('textarea, button.k-btn--primary') || dlg).focus?.();
}
function openImport() { if (!PlanGate.guard('script_import')) return; if (!impDialog) { imp = null; drawImport(); } }

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
  say(importDoneText(done));
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && impDialog) closeImport(); });

/* ---- boot --------------------------------------------------------- */
render();
mountPresence({
  strip: () => document.getElementById('scPeers'),
  warn: () => document.getElementById('scPeerWarn'),
  rowOf: (id) => editor.rowOf(id)
});
mountTamilType();
WriteKeys.publishSheet(keyPrefs);
mountFocusMode(() => doc, {
  /* focus mode's top strip: the page's own labels, as the crumb has them */
  getMeta: () => ({
    title: Script.projectTitle(),
    draft: (latestDraft(doc) || {}).name || '',
    status: statusNode ? statusNode.textContent : ''
  })
});
/* Focus mode injects its button inside #screenplay; bring it up into the
   top bar (it is found by id, so it is not injected twice). */
{
  const slot = document.getElementById('scFocusSlot');
  const btn = document.getElementById('fm-enter');
  if (slot && btn) slot.append(btn);
}
installLeavePrompt({ getDoc: () => doc, persistNow: () => persistNow() });
if (location.hash === '#import') openImport();
/* script.html#line-<id>: a search result opens the page at that line. */
installLineLanding(editor);
function syncGuide() {
  const g = document.getElementById('guide');
  if (!g) return;
  const show = location.hash === '#guide';
  if (g.hidden === show) g.hidden = !show;
  if (show) g.scrollIntoView({ behavior: 'instant', block: 'start' });
}
addEventListener('hashchange', () => { if (location.hash === '#import') openImport(); syncGuide(); });
delegate(document, 'click', '[data-action="sc-generate"]', () => { location.href = 'write.html?stay=1#generate'; });
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
