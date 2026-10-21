/* ============================================================
   WRITE — the screenplay, its revisions, and the paper around it
   ------------------------------------------------------------
   Three views of ONE script model (src/lib/script.js): the typed
   element list you write in, the coloured revision history taken
   from it, and the production documents that get sent out with it.
   Same shape as breakdown.js, for the same reason — a module that
   invents its own arrangement is a module a reader has to learn.

   THE SAVE LOOP, WHICH IS WHY THIS FILE IS SHAPED LIKE THIS.
   CLAUDE.md names a defect where a save ran a refresh which ran a
   save, re-serialising 359 fields every 400ms forever, and `verify`
   asserts zero localStorage writes across four seconds of idle. So:

     • The document lives in memory, in `doc`. Render READS it.
     • Rendering never writes. Not once, not to "repair" anything —
       loadScript() hands back a shape-guaranteed object precisely so
       that no page has to save on load.
     • Writes are started by a user event and nothing else.
       `persist()` debounces keystrokes; `persistNow()` is for the
       structural actions, where a lost half-second is a lost element.
     • `refreshCounters()` touches the DOM only. It is called from
       input handlers, and it calls nothing that writes.

   Typing does not re-render. A full re-render on every keystroke
   would take the caret with it, so the input handler updates the
   in-memory element and the derived counters and stops there. Add,
   delete and reorder patch the rows they touch (see "screenplay:
   structure"); only a restore, an import and the panels rebuild.
   ============================================================ */
import Store, { flushStorage } from '../lib/store.js';
/* write.html is retired: the Script, Drafts and the Script Breakdown
   own its jobs. An old link forwards by its fragment (write-route.js);
   ?stay=1 keeps this page. */
import { redirectIfWrite } from '../lib/write-route.js';
import { stayEntry } from '../lib/navmodel.js';
redirectIfWrite();
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/write.css';
import '../styles/pdf.css';
import '../styles/ai.css';
/* The format guide (Phase 3): ghost hints, live notes, Check format,
   the first-scene tour. Self-contained; it reads this page's DOM. */
import '../ui/format-guide.js';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { actionMenu, wireActionBar } from '../ui/actionbar.js';
import { mountFocusMode } from '../ui/focus-mode.js';
import { mountBeatGuide } from '../ui/beat-guide.js';
import { h, delegate } from '../lib/dom.js';
import { pageHeader } from '../ui/kit/page-header.js';
import '../ui/read-as.js';   // read as a character + dictation (Phase 6), a view only
import BeatBoard from '../ui/beat-board.js';
/* The provider TABLE only — not src/lib/ai.js, which this page
   still reaches with import() at a click. The disclosure below has
   to name the host the key will actually go to, and a restated
   hostname is a privacy claim that goes stale. */
import { apiHost, providerLabel, hasKey } from '../lib/ai-providers.js';
import PDF from '../lib/pdf.js';
import Scenes from '../lib/scenes.js';
import { unaddScenes } from '../lib/scene-bin.js';
import { commitImportedScript } from '../lib/script-commit.js';
import * as Scriptgen from '../lib/scriptgen.js';
import { mountWriteExtrasB } from '../ui/write-extras-b.js';
/* Revision compare, revised-page marks and locked scene numbers: the
   panels under the Revisions list (src/ui/write-revisions.js). */
import { mountRevisionTools, renderRevisionTools } from '../ui/write-revisions.js';
import { mountCoverage } from '../ui/coverage.js';
import { aiPill } from '../ui/ai-pill.js';   // the one way into AI; the Desk and ai.js load at a click   // the Coverage tab: report + voice check
/* Script → shot list (BLUEPRINT-REALIGN-PLAN §1c): the per-heading
   shot count and "Break into shots". */
import Shots, { SHOTS_KEY } from '../lib/shots.js';
import { basicShotDivision } from '../lib/shot-rules.js';
import { matchScenes } from '../lib/screenplay-analysis.js';
import { addThem as handoffAddScenes, newHeadings, sceneSyncLater, offerPipeline } from '../ui/handoff.js';
import '../styles/write-shots.css';
/* Phase 2 of docs/SCREENPLAY-WRITER-PLAN.md: the keyboard (presets,
   Return/Tab flow), SmartType, the navigator and the shortcut sheets.
   The decisions are in write-keys.js; this page only carries them out. */
import Keys from '../lib/write-keys.js';
import { createSmartType } from '../ui/smarttype.js';
import WriteKeys from '../ui/write-shortcuts.js';
import '../styles/smarttype.css';
/* Characters as data (src/lib/characters.js) and the table read: the
   Characters tab. A view of the cues plus the writer's notes; it edits
   the script only through a rename, and then through scriptChanged(). */
import { renderCharacters, wireCharacters, characterNames } from '../ui/characters-panel.js';
/* The One-Pager, Treatment and Synopsis open on a starting draft from
   the Story page when they are empty (story.js docStarter, a read). */
import { loadStory, docStarter, STARTER_KINDS } from '../lib/story.js';
import { mountStageGuide } from '../ui/stage-guide.js';
/* The screenplay editor itself — rows, keys, the one type-change path,
   the chunked render and the row patching — lives in
   src/ui/script-editor/ so another page can mount it. This page keeps
   the model, the ONE debounced save, and everything around the rows. */
import { mountEditor, elFocus, iconBtn, field, setAttr, autosize } from '../ui/script-editor/editor.js';
import Script, {
  ELEMENT_TYPE_IDS, DOC_KINDS,
  revisionColour, typeLabel,
  blankElement, blankDocument,
  pageCount, formatPages, formatRuntime, wordCount, totalLines,
  TITLE_FIELDS, hasTitlePage, normaliseTitlePage
} from '../lib/script.js';
import { ask, askDanger } from '../ui/dialog.js';
import PlanGate from '../lib/plan-gate.js';   // script_import (src/data/plan-matrix.json)
/* The page's own arithmetic and sentences (dates, the synopsis loader,
   the generator's stage, the page view's layout, the import and
   restore questions, the shot counts): src/lib/write-model.js. */
import {
  prettyStamp, TITLE_LABELS, titlePlaceholder as titlePlaceholderFor, titlePageStateText,
  TYPE_ORDER, sceneNumberNote, importReplaceQuestion, importDoneMessage,
  synopsisFromText, synopsisLoadNote, synopsisPendingText,
  GEN_FORMATS, GEN_LANGS, genLang, genStage as genStageOf, genFailState,
  currentRevision as currentRevisionOf, exportMeta as exportMetaOf, restoreQuestion, docMetaText,
  pageViewLayout, omittedPlacements, pvWhereText as pvWhereTextOf,
  shotCountLabels, uncoveredShotJobs
} from '../lib/write-model.js';

/* The typesetter and the parser are both lazy chunks. Neither is
   needed to read or write a page, both are a few kilobytes of
   pure string work, and CLAUDE.md is explicit that anything of
   that shape stays out of first paint. `import()` is awaited at
   the click, which is also the first moment either could fail
   somewhere the user can be told about it. */
const typesetter = () => import('../lib/screenplay-export.js');
const importer = () => import('../lib/script-import.js');

/* The picker's accept list, taken from the parser rather than kept
   beside it. The panel is built before the dynamic import can
   resolve, so it ships a literal and this corrects it as soon as
   the module is in hand — which is before anyone can have chosen a
   file through it, because opening the panel is what loads it. */
function refreshAccept(Parser) {
  const input = document.getElementById('wr-imp-file');
  if (input && Parser && Parser.ACCEPT) input.setAttribute('accept', Parser.ACCEPT);
}

/* A read failure now has something worth saying. The PDF reader
   can tell a scan from a script and a subset font from a readable
   one, and each refusal is a sentence about what to do instead —
   collapsing those into "that file could not be read" throws away
   the only part that helps. */
function readFailed(err) {
  return (err && err.message) || 'That file could not be read.';
}

/* ============================================================
   A PASS ON ONE SPEECH
   ------------------------------------------------------------
   CLAUDE.md open item 3, the half that was left: "in-place work
   on the writing itself — dialogue passes, beat critique — using
   the blueprint as context. Still not a chat box."

   THE AI DESK RUNS IT. There is a ◇ on the row of a speech; it
   opens a strip under that speech holding one AI pill for the
   Desk's 'dialogue-pass' task (src/lib/ai-tasks.js), which wraps
   the same dialoguePass(). The Desk shows the speech beside the
   model's version as a diff the writer accepts change by change,
   and any chat there refines THAT speech and nothing else. The
   pill greys itself on a plan without AI and sends a device with
   no key to Settings, so this page draws no key form.

   THE FIVE RULES THIS PAGE HAS TO HOLD, and every one of them is
   a defect somebody already paid for:

   1. NOTHING IS SENT WITHOUT A CLICK. Not on load, not on focus,
      not on typing. The screenplay is the user's unpublished
      work; the panel names exactly what will leave the browser,
      before the button that sends it.
   2. TWO GATES, INDEPENDENTLY. No key and no speech are
      different problems with different fixes, so the panel says
      which, instead of showing a dead button.
   3. NOTHING IS OVERWRITTEN SILENTLY. A version is shown next to
      the original and a person clicks the one they want. Until
      then the model's text lives in a variable and nowhere else.
   4. WHAT THE MODEL WROTE IS MARKED, AND THE MARK IS DURABLE.
      Accepting stores `aiPass` on the element — when, which
      model, and the writer's own words — inside the script blob
      that already exists, so the mark and the undo survive a
      reload. No new storage key, which matters: a new key needs
      four registrations and two of them are in hub.js.
   5. UNDO IS ONE CLICK AND IT IS EXACT. `aiPass.was` holds the
      original text, so Undo restores the sentence rather than
      approximating it — and a second pass over an already-passed
      line keeps the FIRST original, so Undo always means "back
      to what I wrote", never "back to the machine's last go".

   All three modules below are lazy. A reader who never clicks ◇
   downloads none of the model code, none of the key handling and
   none of the step JSON the blueprint context is built from.
   ============================================================ */
let AIm = null;        // src/lib/ai.js
let Panelm = null;     // src/ui/ai-panel.js
let BPm = null;        // src/lib/blueprint-context.js

async function primeAI() {
  if (AIm) return true;
  let mods;
  try {
    mods = await Promise.all([
      import('../lib/ai.js'),
      import('../ui/ai-panel.js'),
      import('../lib/blueprint-context.js')
    ]);
  } catch (e) {
    console.warn('[write] ai', e);
    say('The writing tools could not be loaded. Check the connection and try again.');
    return false;
  }
  [AIm, Panelm, BPm] = mods;
  Panelm.wireAIPanel();
  // A key saved or forgotten in one panel changes every panel, and
  // there is only ever one open, so a plain re-render is honest and
  // costs nothing a click has not already cost.
  Panelm.onAIChange(() => render());
  return true;
}

/* View state. None of it is stored: which panel is open is not the
   user's work, and a run in flight that survived a reload would be a
   lie about a request that is no longer happening. */
let passFor = null;                 // element id, or null

const app = document.getElementById('app');

/* ---- state -------------------------------------------------
   `doc` is the persisted model. `openDocId` is which production
   document the editor has open — pure view state, deliberately not
   stored: it is not the user's work, and a second copy of "where I
   was" is a thing that goes stale and then lies. */
let doc = Script.loadScript();
mountWriteExtrasB({ getDoc: () => doc, save: () => persistNow() });   // hand-off banner, alternates, Tanglish
mountRevisionTools({
  getDoc: () => doc,
  persistNow: () => persistNow(),
  render: (focus) => render(focus),
  // A revised-pages PDF keeps the scene numbers in the margins when they are locked.
  exportPDF: (extra) => exportPDF(Script.isNumberingLocked(doc.numbering), extra)
});
mountCoverage({ getDoc: () => doc, save: () => persistNow() });

/* ---- the keyboard (Phase 2) ---------------------------------
   Prefs are READ once here and written only when the writer changes
   one in the keyboard panel — never on render, never on idle. */
let keyPrefs = Keys.loadWritePrefs();
const knownTypes = () => ELEMENT_TYPE_IDS;
WriteKeys.configure({
  get known() { return knownTypes(); },
  getPrefs: () => keyPrefs,
  setPrefs: (patch) => { keyPrefs = Keys.saveWritePrefs(patch); return keyPrefs; }
});
const smart = createSmartType({
  getElements: () => doc.elements,
  elementOf: (ta) => doc.elements[indexOfEl(idOf(ta, 'el'))] || null,
  // Names on the Characters list that no cue says yet.
  extraNames: characterNames
});
let openDocId = null;

/* Page view (see "PAGE VIEW" below). In memory: a way of looking at
   the script, not part of it, so it is neither stored nor synced. */
let pageView = false;
let Typeset = null;            // screenplay-export.js, once page view has asked for it
/* Import view state. `importPlan` is what a file parsed to and what
   the preview is showing; it is NOT stored, because it is a
   proposal the user has not accepted yet and a proposal that
   survives a reload is a proposal nobody remembers making. */
let importOpen = false;
let importPlan = null;
let importName = '';

/* ---- the synopsis upload's own state -----------------------
   `synPending` is a file that has been READ and not yet applied,
   which exists for one reason: the synopsis field may already have
   writing in it, and an upload that overwrites it is the same
   mistake the screenplay importer is careful about. Nothing here
   touches gen.synopsis until applySynopsis().

   `synNote` is what the last load did, in the real numbers — a
   truncation the writer discovers later is a truncation that lost
   their words. */
let synPending = null;
let synNote = null;     // { text, warn }
let importBusy = false;
let replaceScript = false;
let replaceScenes = false;

/* Generation state. `gen` is the persisted job and IS the user's work
   — the synopsis and the agreed beats — so it is stored. Everything
   beside it is this run: a busy flag, the abort controller behind Stop,
   the last status line, the last error, and whether the user asked for
   one batch or for all of them.

   `genAll` is the only thing in here that can spend money more than
   once per click, so it is read at the TOP of each loop turn and
   cleared by Stop. A loop that re-read it from a stale closure would
   keep billing after Stop, which is the one bug this feature cannot
   be allowed to have. */
let gen = Scriptgen.load();
let genBusy = false;
let genAbort = null;
let genStatus = '';
let genError = '';
let genAll = false;
let genReplaceScenes = false;

/* ---- persistence ------------------------------------------- */
const SAVE_DELAY = 500;
let saveTimer = null;

/* ONE SAVE IN FLIGHT AT A TIME. A screenplay is far over the overflow
   threshold, so `saveScript()` is an IndexedDB put, a read-back and a
   stub that settle asynchronously (src/lib/store.js). Two of those for
   the same key in flight at once can each read back the OTHER's bytes,
   and the loser then writes its own — older — copy into localStorage:
   measured, holding Backspace on the Dragon sample left a stale script
   behind that a reload served. That was unreachable while every Return
   took minutes; now that it takes milliseconds it is not. So a save that
   arrives while one is settling is coalesced: it is marked owed, and
   the latest `doc` is written the moment the first one lands. `doc` is
   the model, so the owed write always carries every change. */
let saving = false;
let saveOwed = false;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; persistNow(); }, SAVE_DELAY);
}
function persistNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (saving) { saveOwed = true; return; }
  saving = true;
  Script.saveScript(doc);
  const settle = () => {
    saving = false;
    if (saveOwed) { saveOwed = false; persistNow(); }
  };
  flushStorage().then(settle, settle);
}
/* A save that has not landed yet — a debounced keystroke, or one owed
   behind a save still settling — must not be lost to a tab close.
   `pagehide` fires where `unload` is unreliable on mobile. This is the
   one place that writes without waiting its turn: the page is going,
   and a write that might race is better than one that never happens. */
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

/* ---- small builders ---------------------------------------- */
const stat = (value, label) =>
  h('div.bd-stat', {}, [h('strong', { text: value }), h('span', { text: label })]);

const how = (n, title, body) =>
  h('div.bd-how-step', {}, [
    h('span.bd-how-num', { text: n }),
    h('strong', { text: title }),
    h('p', { text: body })
  ]);

function labelled(text, control) {
  return h('label.wr-field', {}, [h('span', { text }), control]);
}

/* The page view's "printed pages" tooltip (see pvWhereText). */
const PV_WHERE_TITLE = 'Sheets as the PDF prints them. The page count in the stats is the schedule\'s measure: 55 lines a page, which the breakdown\'s eighths are built on.';

/* ---- header ------------------------------------------------- */
function renderHeader() {
  const pages = pageCount(doc.elements);
  /* ONE PAGE FRAME: the kit header every studio page opens with. */
  const head = pageHeader({
    class: 'bd-head',
    eyebrow: ['Write', 'one script, its history, and its paper'],
    title: 'Screenplay tools',
    sub: 'A typed screenplay — every line knows whether it is a slug, an action '
       + 'or a cue — with a page count that follows the format rather than '
       + 'guessing at it, a coloured revision history, and the documents that '
       + 'travel with the script.'
  });
  head.append(
    h('div.bd-stats', {}, [
      h('div.bd-stat', {}, [
        h('strong', { 'data-count': 'pages', text: formatPages(pages), title: 'At 55 lines a page, the measure the schedule uses. The printed PDF can run a few pages longer.' }),
        h('span', { text: 'pages' })
      ]),
      h('div.bd-stat', {}, [
        h('strong', { 'data-count': 'elements', text: String(doc.elements.length) }),
        h('span', { text: doc.elements.length === 1 ? 'element' : 'elements' })
      ]),
      stat(String(doc.revisions.length), doc.revisions.length === 1 ? 'revision' : 'revisions'),
      stat(String(doc.documents.length), doc.documents.length === 1 ? 'document' : 'documents')
    ])
  );
  return head;
}

/* ============================================================
   1. SCREENPLAY
   ============================================================ */
function renderScreenplayEmpty() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '❖', 'aria-hidden': 'true' }),
    h('h2', { text: 'Start with one slug line' }),
    h('p', {
      text: 'A screenplay is not free text — it is six kinds of line, and a shot for '
          + 'the camera, each with its own place on the page. Say which kind each line is and the format, the '
          + 'page count and the export all take care of themselves.'
    }),
    h('div.bd-how', {}, [
      how('1', 'Head the scene', 'INT. or EXT., where, and DAY or NIGHT. That one line places the camera and the clock.'),
      how('2', 'Write it down', 'Action in the full measure. A cue, then the dialogue under it, indented the way a reader expects.'),
      how('3', 'Watch the count', 'Fifty-five lines is a page, and a page is roughly a minute. The count updates as you type.')
    ]),
    h('div.bd-example', {}, [
      h('span.bd-example-film', { text: 'Por Thozhil' }),
      h('span', {
        text: ' opens INT. POLICE STATION — DAY. One slug line, then action, then a '
            + 'cue and a line of dialogue. Four elements, and the page already looks '
            + 'like a screenplay.'
      })
    ]),
    h('button.btn.primary.bd-cta', {
      type: 'button', 'data-action': 'el-first', text: '+  Write the first line'
    })
  ]);
}

function renderScreenplay() {
  const section = h('section.wr-section', { id: 'screenplay' });
  section.append(
    h('h2.bd-h2', { text: 'Screenplay' }),
    h('p.bd-sub', {
      text: 'Every line is typed — scene heading, action, character, parenthetical, '
          + 'dialogue, transition or shot. Return starts the next element in the type that '
          + 'usually follows; Shift and Return break a line inside one.'
    })
  );

  const pages = pageCount(doc.elements);
  section.append(h('div.wr-bar.pdf-menu-host', {}, [
    h('div.wr-gauge', {}, [
      h('span.wr-gauge-num', { 'data-count': 'pages', text: formatPages(pages) }),
      h('span.wr-gauge-lab', { text: 'pages' }),
      h('span.wr-gauge-sep', { text: '·', 'aria-hidden': 'true' }),
      h('span.wr-gauge-num', { 'data-count': 'lines', text: String(totalLines(doc.elements)) }),
      h('span.wr-gauge-lab', { text: 'lines of 55' }),
      h('span.wr-gauge-sep', { text: '·', 'aria-hidden': 'true' }),
      h('span.wr-gauge-num', { 'data-count': 'runtime', text: formatRuntime(pages) }),
      h('span.wr-gauge-lab', { text: 'on screen' })
    ]),
    /* The exports go behind one named menu instead of three buttons
       on the gauge row. All of them are dead without pages, and they
       say so rather than silently producing an empty file.

       Import is NOT in that menu. It is the one control here that
       changes what is on the page rather than copying it off, and a
       destructive-capable action hiding under a verb that means the
       opposite is how somebody replaces a draft by accident. */
    h('div.wr-export', {}, [
      /* PAGE VIEW. The same rows, drawn as white pages with the page
         breaks the PDF will have — computed by the PDF's own paginator
         (screenplay-export.js), at idle, so the two cannot disagree and
         typing never waits for it. In memory only: a view, not a
         setting anybody's work depends on. */
      doc.elements.length ? h('button.btn' + (pageView ? '.is-on' : ''), {
        type: 'button', 'data-action': 'pageview-toggle',
        'aria-pressed': pageView ? 'true' : 'false',
        text: 'Page view'
      }) : null,
      /* Script → shot list (BLUEPRINT-REALIGN-PLAN §1c). Adds what is
         missing and touches nothing that exists: see breakIntoShots(). */
      doc.elements.length ? h('button.btn', {
        type: 'button', 'data-action': 'break-into-shots',
        title: 'Add any new scenes to the Breakdown, then draft shots for every scene that has none',
        text: 'Break into shots'
      }) : null,
      h('button.btn' + (importOpen ? '.is-on' : ''), {
        type: 'button', 'data-action': 'import-toggle',
        'aria-expanded': importOpen ? 'true' : 'false',
        'aria-controls': 'wr-import',
        text: 'Import a script'
      }),
      actionMenu('Export', [
        { label: 'Save as PDF',        action: 'export-pdf',      hint: 'US Letter' },
        { label: 'PDF, scene numbers', action: 'export-pdf-numbered', hint: 'shooting script' },
        { label: 'Screenplay text',    action: 'export-text',     hint: '.txt' },
        { label: 'Export .fountain',   action: 'export-fountain', hint: 'plain text' },
        { label: 'Export .fdx',        action: 'export-fdx',      hint: 'Final Draft' },
        { label: 'Export .docx',       action: 'export-docx',     hint: 'Word' }
      ], { align: 'right' })
    ].filter(Boolean))
  ]));
  if (pageView && doc.elements.length) {
    section.append(h('p.wr-pv-status', { role: 'status', 'aria-live': 'polite' }, [
      h('span', { 'data-pv': 'where', title: PV_WHERE_TITLE, text: pvWhereText() }),
      h('span.wr-gauge-sep', { text: ' · ', 'aria-hidden': 'true' }),
      h('span', { text: 'breaks as the PDF prints them' })
    ]));
  }

  section.append(WriteKeys.keysPanel());
  if (importOpen) section.append(renderImport());

  if (!doc.elements.length) {
    section.append(renderScreenplayEmpty());
    return section;
  }

  /* The rows themselves: src/ui/script-editor (runs of 64, a dual pair
     never split). The pass panel sits straight after its speech. */
  const page = editor.renderPage({
    pageView,
    afterRow: (el, i) => (passFor === el.id ? renderPass(el, i) : null)
  });
  section.append(page, h('button.btn.primary.wr-add', {
    type: 'button', 'data-action': 'el-add', text: '+  Add element'
  }));
  return section;
}

/* ============================================================
   1a. THE PASS PANEL
   ------------------------------------------------------------
   Built fresh on every render and thrown away; it holds no
   fields of the user's, so rebuilding it costs nothing. The
   SPEECH it is about is an ordinary <textarea data-el-field>
   in the row above and is never re-rendered by anything here.
   ============================================================ */

/* The scene a speech sits in, as the model reads it, is derived in
   src/lib/ai-tasks.js (passJob) at the moment the pass runs. */
function renderPass(el) {
  const wrap = h('div.ai-inline', { 'data-pass': el.id });
  const panel = h('div.ai-panel');
  panel.append(h('div.ai-head', {}, [
    h('h4.ai-title', { text: 'A pass on this speech' }),
    h('button.bd-icon', {
      type: 'button', 'data-action': 'pass-close',
      title: 'Close', 'aria-label': 'Close the pass panel', text: '✕'
    })
  ]));
  if (!String(el.text || '').trim()) {
    panel.append(h('p.ai-gate', {}, [
      h('strong', { text: 'This speech is empty. ' }),
      h('span', { text: 'A pass is a second look at words that already exist. Write the line first.' })
    ]));
    wrap.append(panel);
    return wrap;
  }
  /* The AI Desk does the rest: what is sent, the versions beside your
     line, Accept (marked as a model pass, with `aiPass.was` kept so the
     row's Undo is exact) and Skip. ctx at the click, so it reads the
     words on screen rather than the last save. */
  const pill = aiPill({
    label: 'Ask for a pass', tasks: ['dialogue-pass'],
    ctx: () => {
      const k = indexOfEl(el.id);
      const live = document.querySelector(`[data-el="${el.id}"] .wr-text`);
      if (k >= 0 && live) doc.elements[k].text = live.value;
      return {
        identity: 'speech:' + el.id, elId: el.id,
        getDoc: () => doc, save: () => persistNow(),
        render: (id) => { passFor = null; render(elFocus(id)); }
      };
    }
  });
  if (pill) panel.append(h('div.ai-acts', {}, [pill]));
  wrap.append(panel);
  return wrap;
}

/* ============================================================
   1b. IMPORT — a script arrives from somewhere else
   ------------------------------------------------------------
   CLAUDE.md open item 4. The parsing is in
   src/lib/script-import.js and writes nothing; everything here
   is the conversation around it, and the whole point of that
   split is this panel: a user sees what was understood BEFORE
   anything is stored.

   THREE WAYS IN, because "if I send a script" is not one
   gesture: the file picker, a drop anywhere on the page, and a
   paste straight into the box. All three end at the same
   `takeScript()`.

   NOTHING IS WRITTEN UNTIL THE LAST BUTTON. The default on
   both destinations is APPEND — the non-destructive one — and
   replace is only even offered when there is something to
   replace. When it is chosen, a revision is taken first, so an
   import is undone by the Restore button that already exists
   rather than by a route invented for this feature.
   ============================================================ */
function importChooser() {
  const wrap = h('div.wr-imp-choose');

  wrap.append(h('p.wr-imp-lead', {
    text: 'Drop a script anywhere on this page, choose a file, or paste the text below. '
        + 'A PDF (.pdf), Fountain (.fountain), a plain screenplay (.txt), '
        + 'Final Draft (.fdx) and Word (.docx) all work.'
  }));
  wrap.append(h('p.wr-imp-privacy', {}, [
    h('strong', { text: 'The file is read in this browser. ' }),
    h('span', {
      text: 'Nothing is uploaded — the studio has no server, and an import never '
          + 'touches the network.'
    })
  ]));

  const file = h('input', {
    type: 'file', id: 'wr-imp-file', class: 'wr-imp-file',
    /* A first guess, corrected from Parser.ACCEPT the moment the
       lazy import resolves — see refreshAccept(). The panel renders
       before the parser loads, so it cannot read the real list
       here, and a literal that silently falls behind the parser is
       how a format becomes unpickable while still being
       importable. */
    accept: '.fountain,.spmd,.txt,.fdx,.xml,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'data-action': 'import-file'
  });
  wrap.append(h('div.wr-imp-row', {}, [
    h('label.btn.primary.wr-imp-pick', { for: 'wr-imp-file', text: 'Choose a file…' }),
    file
  ]));

  wrap.append(h('label.wr-field', {}, [
    h('span', { text: 'Or paste the script' }),
    h('textarea.wr-imp-paste', {
      id: 'wr-import-paste', rows: '6', spellcheck: 'false',
      placeholder: 'Paste the whole script here and it is read straight away.',
      'aria-label': 'Paste a script to import'
    })
  ]));
  wrap.append(h('button.btn', {
    type: 'button', 'data-action': 'import-paste', text: 'Read what I pasted'
  }));
  return wrap;
}

function importPreview(plan) {
  const wrap = h('div.wr-imp-preview');
  /* From the plan, not from a ternary here. See formatLabel in
     script-import.js for what the ternary cost. */
  const fmt = plan.formatLabel || plan.format;

  wrap.append(h('p.wr-imp-read', {
    text: 'Read ' + (importName ? '“' + importName + '” ' : '') + 'as ' + fmt + '.'
  }));

  const stats = h('div.wr-imp-stats');
  stats.append(impStat(String(plan.elements.length), plan.elements.length === 1 ? 'element' : 'elements'));
  stats.append(impStat(formatPages(plan.pages), 'pages'));
  stats.append(impStat(String(plan.scenes.length), plan.scenes.length === 1 ? 'scene' : 'scenes'));
  wrap.append(stats);

  const counts = h('ul.wr-imp-counts');
  for (const type of TYPE_ORDER) {
    if (!plan.counts[type]) continue;
    counts.append(h('li', {}, [
      h('strong', { text: String(plan.counts[type]) }),
      h('span', { text: ' ' + typeLabel(type).toLowerCase() })
    ]));
  }
  if (counts.childElementCount) wrap.append(counts);

  /* What it will do, in words, before it does it. */
  wrap.append(h('h3.wr-imp-h3', { text: 'Where it goes' }));
  wrap.append(destination(
    'The screenplay',
    doc.elements.length,
    doc.elements.length === 1 ? 'element already written' : 'elements already written',
    'import-script-mode', replaceScript,
    'Add the imported pages after what is there',
    'Replace the screenplay with the imported pages'
  ));

  const existingScenes = Scenes.listScenes().length;
  wrap.append(destination(
    'The scene list',
    existingScenes,
    existingScenes === 1 ? 'scene already broken down' : 'scenes already broken down',
    'import-scenes-mode', replaceScenes,
    'Add the imported scenes after the existing ones',
    'Replace the scene list with the imported scenes'
  ));
  wrap.append(h('p.bd-none.wr-imp-note', {
    text: 'Each scene gets its INT/EXT, time of day, location and a length in eighths '
        + 'measured from the imported pages. The one-line synopsis is the scene’s '
        + 'first action line — change it in the breakdown if it is not the sentence '
        + 'you would have written.'
  }));
  const numbers = sceneNumberNote(plan);
  if (numbers) wrap.append(h('p.bd-none.wr-imp-note', { text: numbers }));

  if (replaceScript && doc.elements.length) {
    wrap.append(h('p.wr-imp-safe', {
      text: 'A revision is taken first, so the pages on screen now can be brought back '
          + 'from the Revisions section below.'
    }));
  }

  if (plan.warnings.length) {
    const warn = h('div.wr-imp-warn');
    warn.append(h('strong', { text: 'What was not clean' }));
    const list = h('ul');
    plan.warnings.slice(0, 8).forEach((w) => list.append(h('li', { text: w })));
    if (plan.warnings.length > 8) {
      list.append(h('li', { text: '…and ' + (plan.warnings.length - 8) + ' more of the same kind.' }));
    }
    warn.append(list);
    warn.append(h('p', {
      text: 'Nothing was dropped. A line this parser could not place became an action '
          + 'line, and you can change its type in the editor.'
    }));
    wrap.append(warn);
  }

  wrap.append(h('div.wr-imp-acts', {}, [
    h('button.btn.primary', {
      type: 'button', 'data-action': 'import-commit', disabled: importBusy || !plan.elements.length,
      text: importBusy ? 'Importing…' : 'Import this script'
    }),
    h('button.btn', { type: 'button', 'data-action': 'import-back', text: 'Choose another file' }),
    h('button.btn', { type: 'button', 'data-action': 'import-cancel', text: 'Cancel' })
  ]));
  return wrap;
}

const impStat = (value, label) =>
  h('div.bd-stat', {}, [h('strong', { text: value }), h('span', { text: label })]);

/** One destination, with the choice it needs. Replace is only
    offered when there is work to lose; with an empty destination
    the two options mean the same thing and offering both is a
    question with no answer. */
function destination(title, existing, existingLabel, action, isReplace, appendText, replaceText) {
  const box = h('div.wr-imp-dest');
  box.append(h('strong', { text: title }));
  if (!existing) {
    box.append(h('span.wr-imp-dest-state', { text: 'empty — the import fills it' }));
    return box;
  }
  box.append(h('span.wr-imp-dest-state', { text: existing + ' ' + existingLabel }));
  const row = h('div.wr-imp-modes', { role: 'group', 'aria-label': title + ': add or replace' });
  [[false, 'Add', appendText], [true, 'Replace', replaceText]].forEach(([value, label, title2]) => {
    row.append(h('button.wr-imp-mode' + (isReplace === value ? '.is-on' : '') + (value ? '.is-danger' : ''), {
      type: 'button', 'data-action': action, 'data-mode': value ? 'replace' : 'append',
      'aria-pressed': String(isReplace === value), title: title2, text: label
    }));
  });
  box.append(row);
  box.append(h('span.wr-imp-dest-hint', { text: isReplace ? replaceText : appendText }));
  return box;
}

function renderImport() {
  const panel = h('section.wr-imp', { id: 'wr-import', 'aria-label': 'Import a script' });
  panel.append(h('div.wr-imp-head', {}, [
    h('h3.wr-imp-title', { text: 'Import a script' }),
    h('button.bd-icon', {
      type: 'button', 'data-action': 'import-cancel',
      title: 'Close the importer', 'aria-label': 'Close the importer', text: '✕'
    })
  ]));
  panel.append(importPlan ? importPreview(importPlan) : importChooser());
  return panel;
}

/* ============================================================
   2. REVISIONS
   ============================================================ */
/* ============================================================
   GENERATE — a synopsis becomes a script
   ------------------------------------------------------------
   Three stages, each one a checkpoint the writer reads before the
   next one spends anything. The arithmetic behind that shape is in
   scriptgen.js; what matters here is that every button says what it
   will cost before it costs it.

   TWO THINGS THIS PANEL REFUSES TO PRETEND.

   A page count in Tamil-throughout mode is an ESTIMATE, and it says
   so. `pageCount()` is 55 lines of 12pt Courier — arithmetic on a
   fixed-width Latin grid. Courier Prime has no Tamil subset and no
   monospaced Tamil font exists, so Tamil in the action lines makes
   the grid a guess. The default mode keeps Tamil in dialogue only,
   where the structural elements stay Latin and the count stays exact.

   And the model wrote this, not the filmmaker. Generated pages land
   in the editor as a draft under a revision, never as "your script" —
   the same posture the dialogue pass takes.
   ============================================================ */


/* ---- loading a synopsis off the disk ------------------------
   The synopsis stage could only be typed or pasted into, and a
   synopsis usually already exists as a file. So: a picker and a
   drop target that END AT THE TEXTAREA. There is no second
   pipeline behind this and no new stored key — scriptgen.js
   already persists gen.synopsis, and the beats still come from the
   beat-sheet AI pill (the Desk's 'synopsis-script' task), which is where the model is.

   A SYNOPSIS IS PROSE, NOT A SCREENPLAY, so it is deliberately
   NOT routed through parseScript() / detectFormat() / scenesFrom().
   Those read a FORMATTED screenplay — their whole job is to find
   scene headings and fill the script elements and the scene model
   from the columns the text sits in. A synopsis has no headings
   and no columns, and handing it to them would produce a scene
   list invented out of paragraph indentation. The reading is
   shared, because that part is format work rather than screenplay
   work: readFile() in script-import.js already turns a File into
   text and already takes a PDF through pdf-text.js, so a PDF
   synopsis works through the one call site that handles the
   extractor's refusals properly instead of a second copy of them. */

/* The field's ceiling (SYN_LIMIT) is write-model.js's. */
/* Prose formats only — see above for why a .fountain or a .fdx is not
   on this list even though readFile() would happily read them. */
const SYN_ACCEPT = '.txt,.text,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf';

/* Written once, printed by both branches of renderGenerate(). Two
   copies of a sentence about what leaves the browser is two chances
   for one of them to be more generous than the code. */
const GEN_DISCLOSURE =
  'What is sent: the synopsis you wrote, the beats as they stand, and for each '
  + 'batch of scenes its own slug lines plus the two scenes either side for '
  + 'continuity. Not your other projects, not your notes, not the rest of the '
  + 'screenplay. Nothing is sent until you press a button, and the key never '
  + 'leaves this device except as the one header that authorises the request.';

/**
 * Read a file into a synopsis.
 *
 * NO KEY IS NEEDED and none is asked for: extraction is local, and
 * the only thing on this stage that calls a model is the button
 * underneath. `importer()` is the script-import chunk, loaded for
 * readFile() alone.
 */
async function takeSynopsis(file) {
  if (!file) return;
  let Parser;
  try { Parser = await importer(); }
  catch (e) {
    say('The file reader could not be loaded. Check the connection and try again.');
    return;
  }
  let raw;
  try { raw = await Parser.readFile(file); }
  catch (err) { say(readFailed(err)); return; }

  const pending = synopsisFromText(raw, file.name);
  if (!pending) { say('There was no text in that file.'); return; }

  /* NEVER CLOBBER. An empty field has nothing to lose, so the text
     goes straight in. A field with writing in it gets asked first —
     the same property the screenplay importer holds, and the reason
     this function writes nothing itself. */
  if (String(gen.synopsis || '').trim()) {
    synPending = pending;
    synNote = null;
    render();
    return;
  }
  applySynopsis(pending);
}

/** The only thing that writes a loaded file into the field. */
function applySynopsis(p) {
  gen.synopsis = p.text;
  Scriptgen.save(gen);
  synPending = null;
  synNote = synopsisLoadNote(p);
  const cut = synNote.warn;
  render('#wr-gen-synopsis');
  say(cut ? 'Loaded, and truncated \u2014 read the note under the field.' : 'Synopsis loaded.');
}

/** The picker, the drop target, and whatever the last load has to say. */
function synopsisUpload() {
  const box = h('div.wr-syn-up');
  box.append(h('p.wr-imp-lead', {
    text: 'Or load it from a file. Plain text (.txt), Markdown (.md) and PDF all '
      + 'work \u2014 drop one on this box, or choose it.'
  }));
  box.append(h('p.wr-imp-privacy', {}, [
    h('strong', { text: 'Read in this browser, and no API key needed. ' }),
    h('span', {
      text: 'Nothing is uploaded \u2014 the studio has no server. Reading a file is '
        + 'local; only drafting the beats below calls a model.'
    })
  ]));

  /* The input comes BEFORE its label on purpose: the focus ring is
     published by `.wr-imp-file:focus-visible + .wr-imp-pick`, and a
     sibling combinator cannot reach backwards. */
  box.append(h('div.wr-imp-row', {}, [
    h('input.wr-imp-file', {
      type: 'file', id: 'wr-syn-file', accept: SYN_ACCEPT, 'data-action': 'syn-file'
    }),
    h('label.btn.wr-imp-pick', { for: 'wr-syn-file', text: 'Choose a file\u2026' })
  ]));

  if (synPending) {
    box.append(h('div.wr-gen-warn', {}, [
      h('p', { text: synopsisPendingText(synPending, String(gen.synopsis).length) }),
      /* KEEP is the primary button. The destructive option is never
         the one a reader presses by reflex. */
      h('div.wr-gen-acts', {}, [
        h('button.btn.primary', {
          type: 'button', 'data-action': 'syn-keep', text: 'Keep what I have'
        }),
        h('button.btn', {
          type: 'button', 'data-action': 'syn-replace', text: 'Replace the synopsis'
        })
      ])
    ]));
  } else if (synNote) {
    box.append(h(synNote.warn ? 'p.wr-gen-warn' : 'p.wr-gen-note', { text: synNote.text }));
  }
  return box;
}

const genStage = () => genStageOf(gen);

function genStatusBlock() {
  const rows = [];
  if (genStatus) rows.push(Panelm ? Panelm.statusLine(genStatus) : h('p.ai-status', { text: genStatus }));
  if (genError) rows.push(Panelm ? Panelm.errorLine(genError) : h('p.ai-error', { text: genError }));
  return rows;
}

/* ---- stage 1 form ------------------------------------------ */
function renderGenSynopsis() {
  const wrap = h('div.wr-gen-form');
  wrap.append(
    labelled('Synopsis',
      field('textarea.wr-gen-synopsis', {
        id: 'wr-gen-synopsis', rows: '7', maxlength: '6000',
        placeholder: 'A paragraph or three. Who it is about, what they want, what '
          + 'is in the way, and how it ends if you know. The more you give it, the '
          + 'less it invents.',
        'aria-label': 'Synopsis'
      }, gen.synopsis)),
    synopsisUpload(),
    h('div.wr-gen-opts', {}, [
      labelled('Length', field('select.wr-gen-format', { id: 'wr-gen-format' }, gen.format,
        )),
      labelled('Language', field('select.wr-gen-lang', { id: 'wr-gen-lang' }, gen.lang))
    ])
  );
  // Options are appended rather than written as markup so the two lists
  // stay the single source they are declared as.
  const fmt = wrap.querySelector('#wr-gen-format');
  for (const f of GEN_FORMATS) {
    fmt.append(h('option', { value: f.id, text: f.label + ' — ' + f.hint,
      selected: f.id === gen.format }));
  }
  const lang = wrap.querySelector('#wr-gen-lang');
  for (const l of GEN_LANGS) {
    lang.append(h('option', { value: l.id, text: l.label, selected: l.id === gen.lang }));
  }
  const chosen = genLang(gen.lang);
  if (chosen.hint) wrap.append(h('p.wr-gen-note', { text: chosen.hint }));
  if (!chosen.exact) {
    wrap.append(h('p.wr-gen-warn', {
      text: 'Tamil in the action lines means the page count and the runtime become '
        + 'estimates. Screenplay page maths is 55 lines of fixed-width Courier, and '
        + 'no monospaced Tamil font exists to count against. Everything else works.'
    }));
  }
  /* THE GATE IS ON THE PILL, NOT ON THE STAGE. Everything above
     this line is a writing surface and a local file read; the thing
     that needs a key is the request, and that is the AI pill: the
     AI Desk's 'synopsis-script' task (src/lib/ai-tasks.js), which runs
     the same draftBeatSheet() and, on Accept, writes the ticked beats
     into this job exactly where the old button wrote them — so the
     stage below opens on them. The pill greys itself on a plan
     without AI and sends a device with no key to Settings. */
  wrap.append(
    h('div.wr-gen-acts', {}, [genBeatsPill('Draft the beat sheet')]),
    h('p.wr-gen-cost', {
      text: 'One request. This is the cheap stage — argue with the structure here, '
        + 'not after a hundred pages exist.'
    })
  );
  return wrap;
}

/* The beat-sheet pill. ctx at the click: the form is read and saved
   first, so the Desk sends the synopsis on screen. */
function genBeatsPill(label) {
  return aiPill({
    label, tasks: ['synopsis-script'],
    ctx: () => {
      readGenForm();
      Scriptgen.save(gen);
      return {
        identity: 'synopsis',
        after: () => { gen = Scriptgen.load(); genError = ''; genStatus = ''; render(); }
      };
    }
  });
}

/* ---- stage 2: the beats, editable -------------------------- */
function renderGenBeats() {
  const wrap = h('div.wr-gen-beats');
  if (gen.logline) {
    wrap.append(h('p.wr-gen-logline', { text: gen.logline }));
  }
  wrap.append(h('p.bd-sub', {
    text: 'Fifteen beats, the Save the Cat spine the blueprint already teaches. '
      + 'Edit any of them — the scene list is built from what is written here, not '
      + 'from the synopsis, so a correction now is a correction to everything after.'
  }));
  const list = h('ol.wr-gen-beatlist');
  gen.beats.forEach((b, i) => {
    list.append(h('li.wr-gen-beat', { 'data-beat': b.id }, [
      h('strong.wr-gen-beat-name', { text: b.label || b.id }),
      field('textarea.wr-gen-beat-text', {
        rows: '3', maxlength: '1200', 'data-beat-text': b.id,
        'aria-label': (b.label || b.id) + ' — what happens'
      }, b.happens)
    ]));
  });
  wrap.append(list);

  const scenes = Scenes.listScenes();
  if (scenes.length) {
    wrap.append(h('label.wr-gen-check', {}, [
      field('input', {
        type: 'checkbox', 'data-action': 'gen-replace-scenes',
        checked: genReplaceScenes || false
      }),
      h('span', {
        text: 'Replace the ' + scenes.length + ' scene'
          + (scenes.length === 1 ? '' : 's') + ' already on the board'
          + (genReplaceScenes ? '' : ' (otherwise the new ones are added after them)')
      })
    ]));
  }
  /* The AI Desk's 'gen-scenes' task (src/lib/ai-tasks.js): the scene
     list is proposed there, the writer unticks what they do not want,
     and Accept writes the rest to the scene board — honouring the
     replace checkbox above as it stands at that moment — with an Undo.
     ctx at the click, so the beats sent are the ones on screen. */
  wrap.append(
    h('div.wr-gen-acts', {}, [
      aiPill({
        label: 'Lay out the scenes', tasks: ['gen-scenes'],
        ctx: () => {
          readGenBeats();
          Scriptgen.save(gen);
          return {
            patch: () => { readGenBeats(); return { beats: gen.beats }; },
            replaceScenes: () => genReplaceScenes,
            after: () => { gen = Scriptgen.load(); genError = ''; genStatus = ''; render(); }
          };
        }
      }),
      genBeatsPill('Draft the beats again')
    ]),
    h('p.wr-gen-cost', {
      text: 'One request. This one writes the SCENE BOARD — so the breakdown, '
        + 'stripboard, day out of days and budget all have something to read, '
        + 'whether or not you go on to the pages.'
    })
  );
  return wrap;
}

/* ---- stage 3: the pages ------------------------------------ */
function renderGenPages() {
  const wrap = h('div.wr-gen-pages');
  const p = Scriptgen.progress(gen);
  const rep = Scriptgen.pageReport(gen);
  const done = p.left === 0;

  wrap.append(h('div.wr-gen-stats', {}, [
    stat(p.done + ' / ' + p.total, 'scenes written'),
    stat(String(p.pct) + '%', 'of the list'),
    stat(formatPages(rep.pages) + (rep.exact ? '' : ' ≈'),
      rep.exact ? 'pages' : 'pages (estimate)')
  ]));

  wrap.append(h('div.wr-gen-bar', {
    role: 'progressbar', 'aria-valuenow': String(p.pct),
    'aria-valuemin': '0', 'aria-valuemax': '100',
    'aria-label': 'Scenes written'
  }, [h('span.wr-gen-bar-fill', { style: 'width:' + p.pct + '%' })]));

  if (!rep.exact) {
    wrap.append(h('p.wr-gen-warn', {
      text: 'The page figure is an estimate: this draft puts Tamil in the action '
        + 'lines, and the page grid it would be counted on is a fixed-width Latin one.'
    }));
  }
  if (gen.truncations) {
    wrap.append(h('p.wr-gen-warn', {
      text: gen.truncations + (gen.truncations === 1 ? ' batch was' : ' batches were')
        + ' cut off at the length limit, so those scenes may stop mid-page. They are '
        + 'in the editor and can be rewritten scene by scene.'
    }));
  }

  if (done) {
    wrap.append(
      h('p.wr-gen-note', {
        text: 'All ' + p.total + ' scenes are written. They are in the screenplay above, '
          + 'under a revision taken before the first one landed — so Restore still '
          + 'means "back to what I wrote".'
      }),
      h('div.wr-gen-acts', {}, [
        h('button.btn', { type: 'button', 'data-action': 'gen-reset', text: 'Start a new one' })
      ])
    );
    return wrap;
  }

  wrap.append(
    h('p.wr-gen-note', {
      text: p.done
        ? 'Stopped at scene ' + p.done + '. Resuming continues from there — the '
          + 'scenes already written are not sent again and not paid for again.'
        : 'Nothing written yet. Each request covers ' + Scriptgen.BATCH_SIZE
          + ' scenes, so this list is about ' + p.batches + ' requests.'
    }),
    /* Two ways on. The AI pill is the reviewed one: the AI Desk's
       'gen-batch' task drafts the next batch, the writer reads it, ticks
       the scenes to keep and accepts (an unticked scene is skipped and
       the run moves past it). The bulk button writes every batch in a
       row without stopping to ask; it is hidden — not greyed — on a plan
       without AI, because the pill beside it already carries the offer,
       and plan:changed (below) shows it once the plan is known. */
    h('div.wr-gen-acts', {}, [
      aiPill({
        label: 'Next ' + Math.min(Scriptgen.BATCH_SIZE, p.left) + ' scenes, in the Desk', tasks: ['gen-batch'],
        ctx: () => ({
          after: () => { gen = Scriptgen.load(); genError = ''; genStatus = ''; render(); }
        })
      }),
      h('button.btn', {
        type: 'button', 'data-action': 'gen-run-all', disabled: genBusy,
        hidden: PlanGate.aiUnlocked() ? null : true,
        text: genBusy ? 'Writing…' : (p.done ? 'Resume and write the rest' : 'Write all ' + p.left + ' scenes')
      }),
      genBusy ? h('button.btn.is-danger', { type: 'button', 'data-action': 'gen-stop', text: 'Stop' }) : null,
      h('button.btn', { type: 'button', 'data-action': 'gen-reset', disabled: genBusy,
        text: 'Start over' })
    ]),
    h('p.wr-gen-cost', {
      text: 'About ' + p.batches + (p.batches === 1 ? ' request' : ' requests')
        + ' left. Stop is immediate and keeps everything already written.'
    })
  );
  return wrap;
}

function renderGenerate() {
  const section = h('section.wr-section', { id: 'generate' });
  section.append(
    h('h2.bd-h2', { text: 'From a synopsis' }),
    h('p.bd-sub', {
      text: 'A synopsis becomes a beat sheet, the beat sheet becomes a scene board, '
        + 'and the scene board becomes pages. You read each one before the next one '
        + 'runs. Everything it writes is a draft by a machine, and it lands under a '
        + 'revision so your own pages are never what gets overwritten.'
    })
  );

  const stage = genStage();
  const keyed = !!(AIm && Panelm && Panelm.hasKey());
  /* What leaves the browser, said before any button on stages 2 and 3.
     ai-panel.js's own disclose() once it has loaded, the same markup
     before then — the pills load the model code only at a click. */
  const disclosure = () => (Panelm ? Panelm.disclose(GEN_DISCLOSURE) : h('div.ai-disclose', {}, [
    h('strong', { text: 'What gets sent, and where' }), h('p', { text: GEN_DISCLOSURE })
  ]));

  /* STAGE 1 IS NOT AN AI STAGE, and gating it whole made it look
     like one. Writing a synopsis is writing, and LOADING one off the
     disk is local extraction — neither sends anything anywhere. So
     the field, its upload and the length and language choices sit in
     front of the gate, and renderGenSynopsis() puts the gate on the
     one control that spends money. Before this, somebody without a
     key could not so much as open their own treatment in the field,
     which is a gate on the wrong thing.

     Stages 2 and 3 are model OUTPUT the whole way down — there is
     nothing on them to read or edit until a request has run — so
     they stay gated whole. */
  if (stage === 'synopsis') {
    section.append(renderGenSynopsis());
    section.append(...genStatusBlock());
    if (keyed) section.append(Panelm.disclose(GEN_DISCLOSURE));
    return section;
  }

  /* Stages 2 and 3 have no gate of their own any more: every request
     on them is an AI pill (locked plan → the Pro offer; no key →
     Settings) or the bulk button, which is hidden without AI and
     checks for a key itself. What is already written stays readable. */
  if (stage === 'beats') section.append(renderGenBeats());
  else section.append(renderGenPages());
  section.append(...genStatusBlock());
  section.append(disclosure());
  return section;
}

function renderRevisionsEmpty() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '◐', 'aria-hidden': 'true' }),
    h('h2', { text: 'No revisions issued' }),
    h('p', {
      text: 'A production runs on colours, not version numbers. The first draft that '
          + 'goes out is White; every issue after it takes the next colour, and a crew '
          + 'member holding a Pink page knows at a glance that the Blue one is stale.'
    }),
    h('div.bd-example', {}, [
      h('span.bd-example-film', { text: 'The order' }),
      h('span', {
        text: ' White, Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon, Cherry — '
            + 'and then round again as Double White. Take a snapshot whenever pages '
            + 'leave your hands, because that is the moment somebody else starts '
            + 'working from them.'
      })
    ])
  ]);
}

function renderRevision(rev, i, total) {
  const colour = revisionColour(i);
  const pages = pageCount(rev.elements);
  const card = h('article.wr-rev.c-' + colour.swatch, { 'data-rev': rev.id });
  card.append(
    h('span.wr-rev-swatch', { 'aria-hidden': 'true' }),
    h('div.wr-rev-body', {}, [
      h('p.wr-rev-colour', { text: colour.name }),
      h('strong.wr-rev-name', { text: rev.name }),
      h('span.wr-rev-meta', {
        text: prettyStamp(rev.date) + ' · ' + rev.elements.length
            + (rev.elements.length === 1 ? ' element · ' : ' elements · ')
            + formatPages(pages) + ' pages'
      })
    ]),
    h('div.wr-rev-acts', {}, [
      h('button.btn', { type: 'button', 'data-action': 'rev-restore', text: 'Restore' }),
      // Only the LAST revision can be withdrawn. Deleting from the middle
      // would shift every later revision's colour — Pink would become Blue
      // on pages already printed — and a production never un-issues a
      // colour anyway. Withdrawing the one just taken renumbers nothing.
      i === total - 1
        ? iconBtn('✕', 'rev-del', 'Withdraw this revision', false, true)
        : null
    ])
  );
  return card;
}

function renderRevisions() {
  const section = h('section.wr-section', { id: 'revisions' });
  const next = revisionColour(doc.revisions.length);
  section.append(
    h('h2.bd-h2', { text: 'Revisions' }),
    h('p.bd-sub', {
      text: 'A snapshot of the screenplay as it stands, named and dated. The colour '
          + 'is not chosen — it is the position in the run, in the order every '
          + 'production office uses.'
    }),
    h('div.wr-snap', {}, [
      field('input.wr-snap-name', {
        type: 'text', id: 'wr-rev-name', maxlength: '80',
        placeholder: 'Name this revision — “Second draft”, “Producer notes”',
        'aria-label': 'Revision name'
      }, ''),
      h('button.btn.primary', {
        type: 'button', 'data-action': 'rev-snap',
        text: 'Snapshot as ' + next.name,
        disabled: doc.elements.length === 0
      })
    ])
  );
  if (doc.elements.length === 0) {
    section.append(h('p.bd-none', {
      text: 'There is nothing to snapshot yet. Write some of the screenplay above first.'
    }));
  }

  if (!doc.revisions.length) {
    section.append(renderRevisionsEmpty(), renderRevisionTools());
    return section;
  }
  const list = h('div.wr-rev-list');
  doc.revisions.forEach((r, i) => list.append(renderRevision(r, i, doc.revisions.length)));
  section.append(list, renderRevisionTools());
  return section;
}

/* ============================================================
   3. DOCUMENTS
   ============================================================ */
function renderDocumentsEmpty() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '▤', 'aria-hidden': 'true' }),
    h('h2', { text: 'The paper around the script' }),
    h('p', {
      text: 'Almost nobody reads your screenplay first. They read the one page that '
          + 'made them ask for it — and the documents that answer “why you, why this, '
          + 'why now” live here rather than in six files on a desktop.'
    }),
    h('div.bd-how', {}, [
      how('1', 'The treatment', 'The whole film in prose, present tense, no dialogue. Five to fifteen pages that prove the story stands up.'),
      how('2', "The director's statement", 'One page in your own voice: what the film is about underneath, and why it has to be you.'),
      how('3', 'The one-pager', 'Logline, synopsis, tone, comparable films. The single sheet that travels furthest.')
    ]),
    h('button.btn.primary.bd-cta', {
      type: 'button', 'data-action': 'doc-add', text: '+  Start a document'
    })
  ]);
}

function renderDocCard(d) {
  const card = h('button.wr-doc' + (d.id === openDocId ? '.is-open' : ''), {
    type: 'button', 'data-action': 'doc-open', 'data-doc': d.id,
    'aria-pressed': d.id === openDocId ? 'true' : 'false'
  });
  card.append(
    h('span.wr-doc-kind', { text: d.kind }),
    h('strong.wr-doc-title', { text: d.title || 'Untitled document' }),
    h('span.wr-doc-meta', { text: docMetaText(d) })
  );
  return card;
}

/* A STARTING DRAFT, shown and not saved. When a One-Pager, Treatment
   or Synopsis has no text, its editor opens on a draft built from the
   Story page (story.js docStarter). The model's body stays '' until
   the writer types — the first keystroke saves the whole draft as
   their text, through the same input handler as any other — so an
   untouched draft is re-derived on every open and can never be a stale
   copy of the story. "Clear it" empties the box for this visit. */
const starterCleared = new Set();     // doc ids, this visit only
function starterFor(d) {
  if (String(d.body || '').trim() || starterCleared.has(d.id) || !STARTER_KINDS.includes(d.kind)) return '';
  try { return docStarter(loadStory(), d.kind, { title: Script.projectTitle() }); } catch (e) { return ''; }
}

function renderDocEditor(d) {
  const words = wordCount(d.body);
  const starter = starterFor(d);
  const kind = h('select', { 'data-doc-field': 'kind', 'aria-label': 'Document kind' });
  DOC_KINDS.forEach((k) => {
    const opt = h('option', { value: k, text: k });
    if (k === d.kind) opt.selected = true;
    kind.append(opt);
  });

  return h('div.wr-editor', { 'data-doc': d.id }, [
    h('div.wr-editor-head', {}, [
      labelled('Title', field('input', {
        type: 'text', maxlength: '120', placeholder: 'What is this document called?',
        'data-doc-field': 'title', 'aria-label': 'Document title'
      }, d.title)),
      labelled('Kind', kind)
    ]),
    starter ? h('div.wr-starter', { 'data-starter': '' }, [
      h('p.wr-starter-msg', {}, [
        h('strong', { text: 'Starting draft from your Story page.' }),
        h('span', { text: ' Not saved until you change it — then it is yours to rewrite. Your Story page is not touched.' })
      ]),
      h('button.btn.wr-starter-clear', { type: 'button', 'data-action': 'doc-starter-clear', text: 'Clear it' })
    ]) : null,
    field('textarea.wr-body', {
      rows: '14', spellcheck: 'true',
      placeholder: STARTER_KINDS.includes(d.kind)
        ? 'Write it here. Fill in the Story page — logline, outline, synopsis — and this opens on a starting draft.'
        : 'Write it here. Plain prose — this is not the screenplay.',
      'data-doc-field': 'body', 'aria-label': 'Document text'
    }, d.body || starter),
    h('div.wr-editor-foot', {}, [
      h('span.wr-words', {}, [
        h('strong', { 'data-count': 'docwords', text: String(words) }),
        h('span', { text: words === 1 ? ' word' : ' words' })
      ]),
      h('button.btn.danger', {
        type: 'button', 'data-action': 'doc-del', text: 'Delete document'
      })
    ])
  ]);
}

/* ---- the title page -----------------------------------------
   The script's own page 1, kept inside the script blob as `titlePage`
   (src/lib/script.js says why there and not under a key of its own).
   Filled in, it is the PDF's first sheet in the standard layout, the
   Fountain title page and the .fdx one. Left empty it is not stored
   at all, and the PDF keeps the plain title page it always had. */
const titlePlaceholder = (f) => titlePlaceholderFor(f, Script.projectTitle());

function renderTitlePage() {
  const tp = normaliseTitlePage(doc.titlePage);
  const fieldOf = (f) => (f === 'contact'
    ? field('textarea.wr-tp-contact', {
      rows: '3', 'data-tp-field': f, placeholder: titlePlaceholder(f), 'aria-label': 'Title page ' + TITLE_LABELS[f]
    }, tp[f])
    : field('input', {
      type: 'text', maxlength: '160', 'data-tp-field': f,
      placeholder: titlePlaceholder(f), 'aria-label': 'Title page ' + TITLE_LABELS[f]
    }, tp[f]));
  const on = hasTitlePage(doc.titlePage);
  return h('div.wr-tp', { id: 'wr-title-page' }, [
    h('div.wr-tp-head', {}, [
      h('h3.wr-tp-h', { text: 'Title page' }),
      h('span.wr-tp-state', {
        'data-tp-state': '',
        text: titlePageStateText(on)
      })
    ]),
    h('div.wr-tp-grid', {}, TITLE_FIELDS.map((f) => labelled(TITLE_LABELS[f], fieldOf(f))))
  ]);
}

delegate(document, 'input', '[data-tp-field]', (e, input) => {
  const f = input.dataset.tpField;
  if (!TITLE_FIELDS.includes(f)) return;
  doc.titlePage = normaliseTitlePage(doc.titlePage);
  doc.titlePage[f] = input.value;
  const state = document.querySelector('[data-tp-state]');
  const text = titlePageStateText(hasTitlePage(doc.titlePage));
  if (state && state.textContent !== text) state.textContent = text;
  persist();
});

function renderDocuments() {
  const section = h('section.wr-section', { id: 'documents' });
  section.append(
    h('h2.bd-h2', { text: 'Documents' }),
    h('p.bd-sub', {
      text: 'Treatment, statement, one-pager, notes. Pick one from the list to edit it; '
          + 'a word count runs underneath, because every one of these has a length '
          + 'somebody expects.'
    })
  );

  section.append(renderTitlePage());

  if (!doc.documents.length) {
    section.append(renderDocumentsEmpty());
    return section;
  }

  const list = h('div.wr-doc-list');
  doc.documents.forEach((d) => list.append(renderDocCard(d)));
  list.append(h('button.btn.wr-doc-new', {
    type: 'button', 'data-action': 'doc-add', text: '+  New document'
  }));
  section.append(list);

  const open = doc.documents.find((d) => d.id === openDocId);
  section.append(open
    ? renderDocEditor(open)
    : h('p.bd-none', { text: 'Choose a document above to open it.' }));
  return section;
}

/* ============================================================
   RENDER — reads `doc`, writes nothing.
   ============================================================ */
function render(focus) {
  const main = h('main', { id: 'main' });
  /* ?stay=1 is the retired editor's escape hatch (AI coverage, Write
     from a synopsis). tabs.js shows only those two sections; this is
     the way back, kept on screen above them. */
  const stay = stayEntry('write.html', location.search);
  if (stay && stay.back) {
    main.append(h('p.wr-stay-back', {}, [
      h('a.btn.ghost', { href: stay.back, text: '← ' + (stay.backLabel || 'Back') })
    ]));
  }
  main.append(renderHeader(), renderScreenplay(), BeatBoard.renderOutline(),
    renderGenerate(), renderRevisions(), renderDocuments(), renderCharacters());
  app.replaceChildren(main);
  countNodes = null;
  smart.invalidate();
  editor.autosizeAll();
  requestAnimationFrame(editor.autosizeAll);   // again once layout has settled

  mountStageGuide(document.getElementById('main'), { stage: 'screenplay' });   // the blueprint's questions for this stage
  mountShell();
  wireActionBar();
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[write] chrome', e); }

  BeatBoard.decorateEditor();   // the Outline tab's beat markers; DOM only
  decorateShotCounts();         // "Sc 12 · 6 shots" at each heading; DOM only
  if (focus) applyFocus(focus);
  if (pageView) scheduleDerived(0);
  else sceneSyncLater();   // a re-render follows an import or a restore
}

/* Focus, sizing and the rows are the editor's (src/ui/script-editor). */
const applyFocus = (sel) => editor.applyFocus(sel);

/* The counter nodes, found once per render rather than once per
   keystroke: four attribute queries over a 30,000-node page were most
   of what a keystroke cost on a feature-length script. render() drops
   the cache, because it replaces every one of them. */
let countNodes = null;
function counterNodes() {
  if (!countNodes || countNodes.some((n) => !n.isConnected)) {
    countNodes = Array.from(app.querySelectorAll('[data-count]'));
  }
  return countNodes;
}

/** Re-derive every number on the page. DOM only, and deliberately so:
    if this wrote, typing would save, saving would refresh, and we would
    be back at the 400ms loop the idle assertion exists to catch. */
function refreshCounters() {
  const pages = pageCount(doc.elements);
  const set = (name, value) => {
    counterNodes().forEach((n) => {
      // Unchanged text is left alone: a write is a DOM mutation, and
      // the tab strip's observer re-runs on every one.
      if (n.dataset.count === name && n.textContent !== value) n.textContent = value;
    });
  };
  set('pages', formatPages(pages));
  set('lines', String(totalLines(doc.elements)));
  set('runtime', formatRuntime(pages));
  set('elements', String(doc.elements.length));
  const open = doc.documents.find((d) => d.id === openDocId);
  if (!open) return;
  set('docwords', String(wordCount(open.body)));
  // The card above the editor carries the same count. Leaving it behind
  // gives one document two word counts on screen at once, which reads as
  // a bug whichever of them the reader believes.
  const meta = document.querySelector(`.wr-doc[data-doc="${open.id}"] .wr-doc-meta`);
  if (meta) meta.textContent = docMetaText(open);
}

/* ============================================================
   DERIVED, AT IDLE — the (CONT'D) offers and the page view
   ------------------------------------------------------------
   Two things on this page are readings of the WHOLE script rather
   than of one row: whether a cue should be offered (CONT'D), which
   depends on the speech before it, and where the pages break, which
   depends on everything above. Neither may cost a keystroke anything,
   so neither runs inside one. An edit schedules them; they run once
   the writer has paused and the browser is idle, and they touch only
   the DOM nodes whose answer changed — a mutation is not free here,
   the tab strip's observer re-runs on every one.

   DOM only. Nothing in this block writes to storage, for the same
   reason refreshCounters() does not.
   ============================================================ */
const DERIVED_DELAY = 300;
let derivedTimer = 0;
let derivedIdle = 0;
function scheduleDerived(delay = DERIVED_DELAY) {
  /* THE SCRIPT DRIVES THE SCENES (src/ui/handoff.js → scene-sync.js):
     once the writer pauses, a heading added, edited or deleted since
     the last sync adds, updates or bins its scene. It compares the
     headings with the last sync's and writes nothing when they match,
     so this call costs an idle page nothing. */
  sceneSyncLater();
  clearTimeout(derivedTimer);
  derivedTimer = setTimeout(() => {
    derivedTimer = 0;
    if (derivedIdle) return;
    const run = () => { derivedIdle = 0; refreshCueOffers(); applyPageView(); };
    derivedIdle = typeof requestIdleCallback === 'function'
      ? requestIdleCallback(run, { timeout: 1000 })
      : setTimeout(run, 0);
  }, delay);
}

/** Show or hide each cue's "+ CONT'D" as the script now reads. */
const refreshCueOffers = () => editor.refreshCueOffers();

/* ---- PAGE VIEW ----------------------------------------------
   The rows stay the writing surface — same textareas, same keys, same
   patching — and the page view adds three things to them:

     · a break marker where each new page starts, numbered as the PDF
       numbers it, and where a speech or an action block breaks INSIDE
       itself, a marker after it that says so with the (MORE) and
       (CONT'D) the PDF will print there;
     · the scene number in both margins of every heading (data-scene-no,
       painted by write.css), never on a shot;
     · "page N of M" for the line the caret is in.

   Every one of those comes from Typeset.paginate() — the function the
   PDF is built from — so the page count on screen and the sheets in
   the PDF are the same number by construction. The script pages are
   counted; the title page, which carries no number, is not. */
let pvPageOf = new Map();       // element id -> page index it starts on
let pvTotal = 0;
let pvFocusId = null;
let omittedSig = '';       // the OMITTED markers last placed (placeOmitted)

function pvWhereText() {
  return pvWhereTextOf({ total: pvTotal, pageOf: pvPageOf, focusId: pvFocusId, elements: doc.elements });
}

function refreshPvStatus() {
  const node = document.querySelector('[data-pv="where"]');
  const text = pvWhereText();
  if (node && node.textContent !== text) node.textContent = text;
}

function clearPageView() {
  const page = pageNode();
  if (!page) return;
  page.querySelectorAll('.wr-pbreak, .wr-omitted').forEach((n) => n.remove());
  omittedSig = '';
  page.querySelectorAll('[data-scene-no]').forEach((n) => n.removeAttribute('data-scene-no'));
  pvPageOf = new Map();
  pvTotal = 0;
}

function applyPageView() {
  const page = pageNode();
  if (!pageView || !page || !Typeset) return;
  // paginateDoc: a locked script's numbers and OMITTED rows, as the PDF sets them.
  const pages = Typeset.paginateDoc(doc);
  const { pageOf, sceneNo, anchors } = pageViewLayout(pages);
  // Locked pages print 12A or 12-13; the page view says the same.
  const labels = Typeset.pageNumbersDoc(doc, pages);

  const existing = new Map();
  page.querySelectorAll('.wr-pbreak').forEach((n) => existing.set(n.dataset.page, n));
  for (let p = 1; p < pages.length; p++) {
    const a = anchors[p];
    let node = existing.get(String(p)) || null;
    existing.delete(String(p));
    const row = a ? rowOf(a.id) : null;
    if (!row) { if (node) node.remove(); continue; }
    const target = row.closest('.wr-dual') || row;
    const key = a.id + (a.split ? '|split' : '');
    const label = a.split
      ? "(MORE)  ·  page " + labels[p] + ' starts inside the line above  ·  (CONT’D)'
      : 'Page ' + labels[p];
    const placed = node && node.dataset.anchor === key && node.textContent === label
      && (a.split ? node.previousElementSibling === target : node.nextElementSibling === target);
    if (placed) continue;
    if (!node) {
      node = h('div.wr-pbreak', { role: 'separator', 'data-page': String(p) });
    }
    node.dataset.anchor = key;
    node.classList.toggle('is-split', a.split);
    if (node.textContent !== label) node.textContent = label;
    node.setAttribute('aria-label', 'Page ' + labels[p] + ', sheet ' + (p + 1) + ' of ' + pages.length);
    if (a.split) target.after(node); else target.before(node);
  }
  existing.forEach((n) => n.remove());

  for (const row of allRows()) {
    if (!row.classList.contains('t-scene')) {
      if (row.hasAttribute('data-scene-no')) row.removeAttribute('data-scene-no');
      continue;
    }
    const n = sceneNo.get(row.dataset.el) || '';
    if (n) setAttr(row, 'data-scene-no', n);
    else if (row.hasAttribute('data-scene-no')) row.removeAttribute('data-scene-no');
  }

  placeOmitted(page, pages);

  pvPageOf = pageOf;
  pvTotal = pages.length;
  page.dataset.pages = String(pages.length);
  refreshPvStatus();
}

/* A locked script's OMITTED scenes (src/lib/script.js): rows the
   paginator sets where a cut scene was, with no element behind them.
   The page view shows each as a marker before the heading that now
   follows it — or after the last row, for one at the end — so the
   page breaks on screen, which already count it, are explained. */
function placeOmitted(page, pages) {
  const want = omittedPlacements(pages);   // [anchorId | null, numbers[]]
  const sig = JSON.stringify(want);
  const have = page.querySelectorAll('.wr-omitted');
  if (sig === omittedSig && have.length === want.reduce((n, w) => n + w[1].length, 0)) return;
  have.forEach((n) => n.remove());
  omittedSig = sig;
  const rows = allRows();
  for (const [id, numbers] of want) {
    const row = id ? rowOf(id) : rows[rows.length - 1];
    if (!row) continue;
    let target = row.closest('.wr-dual') || row;
    const marks = numbers.map((n) => h('div.wr-omitted', { role: 'note', text: n + '  OMITTED' }));
    if (!id) { target.after(...marks); continue; }
    // Before a page break that sits right above the heading, so the
    // break marker keeps its place directly over the row it names.
    if (target.previousElementSibling && target.previousElementSibling.classList.contains('wr-pbreak')) {
      target = target.previousElementSibling;
    }
    target.before(...marks);
  }
}

async function setPageView(on) {
  if (on && !Typeset) {
    try { Typeset = await typesetter(); }
    catch (e) { say('The page view could not be loaded. Check the connection and try again.'); return; }
  }
  pageView = on;
  const page = pageNode();
  const btn = document.querySelector('[data-action="pageview-toggle"]');
  if (btn) { btn.classList.toggle('is-on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  if (!page) return;
  page.classList.toggle('is-pageview', on);
  let status = document.querySelector('.wr-pv-status');
  if (on && !status) {
    status = h('p.wr-pv-status', { role: 'status', 'aria-live': 'polite' }, [
      h('span', { 'data-pv': 'where', title: PV_WHERE_TITLE, text: pvWhereText() }),
      h('span.wr-gauge-sep', { text: ' · ', 'aria-hidden': 'true' }),
      h('span', { text: 'breaks as the PDF prints them' })
    ]);
    page.before(status);
  }
  if (!on) {
    if (status) status.remove();
    clearPageView();
    return;
  }
  applyPageView();               // once now, so the toggle answers at once
}

delegate(document, 'click', '[data-action="pageview-toggle"]', () => { setPageView(!pageView); });

/* The counter follows the caret. focusin is the one event that sees
   every way into a row — click, Tab, the patch's own focus(). */
document.addEventListener('focusin', (e) => {
  if (!pageView) return;
  const row = e.target && e.target.closest && e.target.closest('[data-el]');
  if (!row) return;
  pvFocusId = row.dataset.el;
  refreshPvStatus();
});

/* ============================================================
   EVENTS — delegated, no inline handlers. A strict CSP ships.
   ============================================================ */
const idOf = (el, attr) => el.closest(`[data-${attr}]`)?.dataset[attr];
const indexOfEl = (id) => doc.elements.findIndex((e) => e.id === id);

/* ---- the screenplay editor ----------------------------------
   Rows, structure (add / split / delete / move, PATCHED rather than
   re-rendered), typing, the type select, dual dialogue, (CONT'D), the
   keyboard and Backspace-with-undo: src/ui/script-editor/. Mounted here
   with this page's model and save path; it never saves on its own. */
const editor = mountEditor(document, {
  getDoc: () => doc,
  persist: () => persist(),
  persistNow: () => persistNow(),
  render: (focus) => render(focus),
  // A patch would have to know more than one row: the import preview
  // quotes the element count, and the pass panel sits between rows.
  canPatch: () => !importOpen && passFor === null,
  refreshCounters: () => refreshCounters(),
  scheduleDerived: () => scheduleDerived(),
  smart,
  getPrefs: () => keyPrefs,
  known: knownTypes,
  say: (m) => say(m),
  toast: (m, o) => StudioUI.toast(m, o)
});
const pageNode = () => editor.pageNode();
const rowOf = (id) => editor.rowOf(id);
const allRows = () => editor.allRows();

/* The `?` sheet's Write section, for the active preset. DOM only. */
WriteKeys.publishSheet(keyPrefs);

/* ---- Fountain export ---------------------------------------- */
function download(text, filename, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function say(message) {
  try { StudioUI.toast(message, { type: 'info' }); } catch (e) { /* chrome may not be up */ }
}

/** "White — Second draft", or nothing if no revision has been issued. */
const currentRevision = () => currentRevisionOf(doc);

delegate(document, 'click', '[data-action="export-fountain"]', () => {
  if (!doc.elements.length) { say('Nothing to export yet — write a line first.'); return; }
  const title = Script.projectTitle();
  const text = Script.toFountain(doc, { title, revision: currentRevision() });
  download(text, Script.slugify(title, 'screenplay') + '.fountain');
});

/* ---- the screenplay as paper --------------------------------
   The editor is a grid of a type selector, a growing textarea and
   three row buttons. It is a good writing surface and a terrible
   page: printed as-is, every element lands in its own bordered box
   at print.css's 36px field floor, the autosized heights were
   measured against a screen-width column, and `overflow: hidden`
   then clips whatever no longer fits — silently, because a
   textarea has no scrollbar to give it away.

   So the PDF is typeset instead, from the same element list, at
   print time, by src/lib/screenplay-export.js — which also
   decides where the pages break, because a page number and a
   (MORE) are both answers to "which page is this". It is thrown
   away again on afterprint: a second copy of the script living
   permanently in the DOM is the "one representation per thing"
   rule broken, and it would be the copy that goes stale. The
   measurements are in styles/pdf.css and styles/write.css. */
const exportMeta = () => exportMetaOf(doc, Script.projectTitle());

delegate(document, 'click', '[data-action="export-pdf"]', () => exportPDF(false));
delegate(document, 'click', '[data-action="export-pdf-numbered"]', () => exportPDF(true));

delegate(document, 'click', '[data-action="export-fdx"]', async () => {
  if (!doc.elements.length) { say('Nothing to export yet — write a line first.'); return; }
  let F;
  try { F = await import('../lib/screenplay-fdx.js'); }
  catch (e) { say('The Final Draft exporter could not be loaded. Check the connection and try again.'); return; }
  const title = Script.projectTitle();
  download(F.toFDX(doc, { title }), Script.slugify(title, 'screenplay') + '.fdx', F.FDX_MIME);
});

delegate(document, 'click', '[data-action="export-docx"]', async () => {
  if (!doc.elements.length) { say('Nothing to export yet — write a line first.'); return; }
  let W;
  try { W = await import('../lib/screenplay-docx.js'); }
  catch (e) { say('The Word exporter could not be loaded. Check the connection and try again.'); return; }
  const title = Script.projectTitle();
  download(W.toDOCX(doc, { title }), Script.slugify(title, 'screenplay') + '.docx', W.DOCX_MIME);
});

/* `extra.marks` is a revised-pages export (src/ui/write-revisions.js):
   the asterisks sit in the right margin, which the plain screenplay
   setup clips, so it takes the wide setup the scene numbers use — same
   1.5in gutter, the margins moved inside the printable area. */
async function exportPDF(sceneNumbers, extra = {}) {
  if (!doc.elements.length) { say('Nothing to export yet — write a line first.'); return; }
  const main = document.getElementById('main');
  if (!main) return;
  let Typeset;
  try { Typeset = await typesetter(); }
  catch (e) { say('The typesetter could not be loaded. Check the connection and try again.'); return; }

  let node = null;
  PDF.exportPDF({
    scope: 'screenplay',
    // Scene numbers live in the margins, which a PDF page clips; see
    // SETUPS['screenplay-wide'] in src/lib/pdf.js.
    ...(sceneNumbers || extra.marks
      ? { setup: 'screenplay-wide', classes: extra.marks ? ['pdf-sn', 'pdf-revmarks'] : ['pdf-sn'] }
      : {}),
    title: Script.projectTitle() + ' — Screenplay',
    subtitle: [currentRevision(), formatPages(pageCount(doc.elements)) + ' pages', extra.note]
      .filter(Boolean).join(' · '),
    before: () => {
      node = Typeset.buildDocument(doc, { ...exportMeta(), sceneNumbers, marks: extra.marks });
      main.append(node);
    },
    after: () => { if (node) { node.remove(); node = null; } }
  });
}

delegate(document, 'click', '[data-action="export-text"]', async () => {
  if (!doc.elements.length) { say('Nothing to export yet — write a line first.'); return; }
  let Typeset;
  try { Typeset = await typesetter(); }
  catch (e) { say('The typesetter could not be loaded. Check the connection and try again.'); return; }
  const title = Script.projectTitle();
  download(Typeset.toText(doc, exportMeta()),
    Script.slugify(title, 'screenplay') + '.txt', 'text/plain');
  say('Exported ' + Typeset.sheetCount(doc.elements, doc.numbering) + ' pages of screenplay text.');
});

/* ---- the pass: events ---------------------------------------
   Delegated, no inline handlers — a strict CSP ships. Every one of
   these starts at a click; none of them runs on load, on focus or on
   a timer, and only `pass-use` and `pass-undo` write anything. */

delegate(document, 'click', '[data-action="pass-open"]', (e, btn) => {
  const id = idOf(btn, 'el');
  if (!id) return;
  passFor = passFor === id ? null : id;
  render(passFor ? null : elFocus(id));
});

delegate(document, 'click', '[data-action="pass-close"]', () => {
  const id = passFor;
  passFor = null;
  render(id ? elFocus(id) : null);
});

delegate(document, 'click', '[data-action="pass-undo"]', (e, btn) => {
  const id = idOf(btn, 'el');
  const i = indexOfEl(id);
  if (i < 0) return;
  const el = doc.elements[i];
  if (!el.aiPass) return;
  el.text = el.aiPass.was;
  delete el.aiPass;
  persistNow();
  render(elFocus(id));
  say('Your line is back.');
});

/* ---- import -------------------------------------------------
   Three ways in, one path through. Nothing below writes until
   `import-commit`. */
function resetImport() {
  importPlan = null;
  importName = '';
  importBusy = false;
  replaceScript = false;
  replaceScenes = false;
}

async function takeScript(text, filename) {
  if (!PlanGate.guard('script_import')) return;
  if (!String(text || '').trim()) { say('That file was empty.'); return; }
  let Parser;
  try { Parser = await importer(); }
  catch (e) { say('The script parser could not be loaded. Check the connection and try again.'); return; }

  let plan;
  try { plan = Parser.parseScript(text, filename); }
  catch (e) {
    console.warn('[write] import', e);
    say('That file could not be read as a screenplay.');
    return;
  }

  if (plan.fatal || !plan.elements.length) {
    importPlan = null;
    importOpen = true;
    render();
    say(plan.warnings[0] || 'Nothing in that file looked like a screenplay.');
    return;
  }

  importPlan = plan;
  importName = filename || '';
  importBusy = false;
  // Default to the safe side on both destinations, every time a new
  // file is read — a replace chosen for the last file is not consent
  // for this one.
  replaceScript = false;
  replaceScenes = false;
  importOpen = true;
  render();
}

delegate(document, 'click', '[data-action="import-toggle"]', () => {
  importOpen = !importOpen;
  if (!importOpen) resetImport();
  render(importOpen ? '#wr-import-paste' : null);
});
delegate(document, 'click', '[data-action="import-cancel"]', () => {
  importOpen = false;
  resetImport();
  render();
});
delegate(document, 'click', '[data-action="import-back"]', () => {
  resetImport();
  render('#wr-import-paste');
});

delegate(document, 'change', 'input[data-action="import-file"]', async (e, input) => {
  const file = input.files && input.files[0];
  if (!file) return;
  let Parser;
  try { Parser = await importer(); } catch (err) { say('The script parser could not be loaded.'); return; }
  refreshAccept(Parser);
  let text;
  try { text = await Parser.readFile(file); }
  catch (err) { say(readFailed(err)); return; }
  takeScript(text, file.name);
});

delegate(document, 'click', '[data-action="import-paste"]', () => {
  const box = document.getElementById('wr-import-paste');
  if (!box || !box.value.trim()) { say('Paste a script into the box first.'); return; }
  takeScript(box.value, '');
});

/* A paste into the box reads it immediately — the button beside it
   stays for the person who typed or dropped text in some other way.
   `setTimeout` because the value is not in the field yet when the
   paste event fires. */
delegate(document, 'paste', '#wr-import-paste', (e, box) => {
  setTimeout(() => { if (box.value.trim()) takeScript(box.value, ''); }, 0);
});

delegate(document, 'click', '[data-action="import-script-mode"]', (e, btn) => {
  replaceScript = btn.dataset.mode === 'replace';
  render();
});
delegate(document, 'click', '[data-action="import-scenes-mode"]', (e, btn) => {
  replaceScenes = btn.dataset.mode === 'replace';
  render();
});

delegate(document, 'click', '[data-action="import-commit"]', async () => {
  const plan = importPlan;
  if (!plan || importBusy) return;

  /* The last gate, and it names what is about to happen rather
     than asking "are you sure?". Only shown when something is
     actually being replaced — a confirm on a safe action is the
     dialog people learn to click through. */
  const question = importReplaceQuestion({
    replaceScript, replaceScenes,
    elementCount: doc.elements.length, sceneCount: Scenes.listScenes().length
  });
  if (question && !await askDanger(question)) return;

  importBusy = true;

  const done = commitImportedScript(plan, { replaceScript, replaceScenes, doc, persist: persistNow, importName });

  importOpen = false;
  resetImport();
  render();
  say(importDoneMessage(done));
  /* Everything starts from the script: offer the whole breakdown. */
  offerPipeline().catch((e) => console.warn('[write] pipeline offer', e));
});

/* ---- drop a script anywhere ---------------------------------
   The third way in. It is on the document rather than on a small
   target because a person dragging a file at a page aims at the
   page. A drag that is not carrying files is ignored, so dragging
   text inside a textarea still behaves. */
function draggingFiles(e) {
  const dt = e.dataTransfer;
  return !!dt && Array.from(dt.types || []).includes('Files');
}
let dragDepth = 0;
addEventListener('dragenter', (e) => {
  if (!draggingFiles(e)) return;
  dragDepth++;
  document.body.classList.add('wr-dropping');
});
addEventListener('dragover', (e) => { if (draggingFiles(e)) e.preventDefault(); });
addEventListener('dragleave', (e) => {
  if (!draggingFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) document.body.classList.remove('wr-dropping');
});
addEventListener('drop', async (e) => {
  if (!draggingFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('wr-dropping');
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file) return;
  /* ONE DROP HANDLER, TWO DESTINATIONS. The synopsis box is a drop
     target inside a page that already takes a drop ANYWHERE as a
     screenplay import, so the choice is made here rather than by a
     second listener racing this one for the same event. Aiming at
     the box means "this is a synopsis"; aiming anywhere else still
     means "this is a script". */
  if (e.target && e.target.closest && e.target.closest('.wr-syn-up')) {
    takeSynopsis(file);
    return;
  }
  let Parser;
  try { Parser = await importer(); } catch (err) { say('The script parser could not be loaded.'); return; }
  refreshAccept(Parser);
  let text;
  try { text = await Parser.readFile(file); }
  catch (err) { say(readFailed(err)); return; }
  takeScript(text, file.name);
});

/* ---- revisions ---------------------------------------------- */
delegate(document, 'click', '[data-action="rev-snap"]', () => {
  if (!doc.elements.length) return;
  const input = document.getElementById('wr-rev-name');
  const colour = revisionColour(doc.revisions.length);
  const name = (input && input.value.trim()) || colour.name + ' draft';
  doc.revisions.push(Script.makeRevision(doc.elements, name));
  persistNow();
  render();
});

delegate(document, 'click', '[data-action="rev-restore"]', async (e, btn) => {
  const id = idOf(btn, 'rev');
  const i = doc.revisions.findIndex((r) => r.id === id);
  if (i < 0) return;
  const rev = doc.revisions[i];
  const colour = revisionColour(i);
  // Restoring overwrites work that is on screen right now, so it asks —
  // and it says what it is about to throw away, in elements, because
  // "are you sure?" on its own tells nobody anything.
  const ok = await ask(restoreQuestion(colour.name, rev, doc.elements.length));
  if (!ok) return;
  doc.elements = Script.restoreElements(rev);
  persistNow();
  render();
});

delegate(document, 'click', '[data-action="rev-del"]', async (e, btn) => {
  const id = idOf(btn, 'rev');
  const i = doc.revisions.findIndex((r) => r.id === id);
  if (i < 0 || i !== doc.revisions.length - 1) return;
  const colour = revisionColour(i);
  if (!await askDanger(`Withdraw the ${colour.name} revision — “${doc.revisions[i].name}”?\n\n`
    + 'The snapshot is deleted. The screenplay on screen is not touched.')) return;
  doc.revisions.splice(i, 1);
  persistNow();
  render();
});

/* ---- documents ----------------------------------------------- */
delegate(document, 'click', '[data-action="doc-add"]', () => {
  const d = blankDocument();
  doc.documents.push(d);
  openDocId = d.id;
  persistNow();
  render('.wr-editor input[data-doc-field="title"]');
});

delegate(document, 'click', '[data-action="doc-open"]', (e, card) => {
  const id = card.dataset.doc;
  openDocId = (openDocId === id) ? null : id;
  render(openDocId ? '.wr-editor input[data-doc-field="title"]' : null);
});

delegate(document, 'click', '[data-action="doc-del"]', async () => {
  const d = doc.documents.find((x) => x.id === openDocId);
  if (!d) return;
  if (!await askDanger(`Delete “${d.title || 'Untitled document'}”?\n\n`
    + `${wordCount(d.body)} words. This cannot be undone.`)) return;
  doc.documents = doc.documents.filter((x) => x.id !== openDocId);
  openDocId = null;
  persistNow();
  render();
});

/* Title and kind re-render the card above, so they land on `change`,
   once the user has finished. The body is a writing surface and must
   never re-render under the caret — it updates the count and debounces. */
delegate(document, 'input', 'textarea[data-doc-field="body"]', (e, ta) => {
  const d = doc.documents.find((x) => x.id === openDocId);
  if (!d) return;
  // The first edit of a starting draft makes it the writer's text.
  const starter = ta.closest('.wr-editor')?.querySelector('[data-starter]');
  if (starter) starter.remove();
  d.body = ta.value;
  d.updated = new Date().toISOString();
  refreshCounters();
  persist();
});

delegate(document, 'click', '[data-action="doc-starter-clear"]', (e, btn) => {
  const editor = btn.closest('.wr-editor');
  const ta = editor && editor.querySelector('textarea[data-doc-field="body"]');
  if (!ta) return;
  starterCleared.add(editor.dataset.doc);
  btn.closest('[data-starter]')?.remove();
  ta.value = '';                    // the model's body is '' already: nothing to save
  ta.focus();
});

delegate(document, 'change', '[data-doc-field]', (e, el) => {
  const key = el.dataset.docField;
  const d = doc.documents.find((x) => x.id === openDocId);
  if (!d) return;
  /* A starting draft that was never edited is not the document's body;
     a `change` on it (blur after nothing) must not save it. */
  if (key === 'body' && el.closest('.wr-editor')?.querySelector('[data-starter]')) return;
  d[key] = el.value;
  d.updated = new Date().toISOString();
  persistNow();
  // A new kind on an empty document: open on that kind's starting draft.
  if (key === 'kind' && !String(d.body || '').trim()) {
    const ed = document.querySelector(`.wr-editor[data-doc="${CSS.escape(d.id)}"]`);
    if (ed) {
      ed.replaceWith(renderDocEditor(d));
      document.querySelector('.wr-editor select[data-doc-field="kind"]')?.focus();
    }
  }
  // Only the card above is stale. Replacing that one node keeps its
  // title, kind and word count honest without rebuilding the section
  // under the caret the user is still holding in the editor.
  const list = document.querySelector('.wr-doc-list');
  const card = list && list.querySelector(`[data-doc="${d.id}"]`);
  if (card) card.replaceWith(renderDocCard(d));
});

/* ============================================================
   GENERATE — handlers
   ------------------------------------------------------------
   Every one of these can spend the user's money, so each is a
   click and none is a side effect. There is no timer, no retry
   and no "while we're here".
   ============================================================ */

/** Read the stage-1 form back off the DOM before a run, so what is
    sent is what is on screen rather than what was last re-rendered. */
function readGenForm() {
  const syn = document.getElementById('wr-gen-synopsis');
  const fmt = document.getElementById('wr-gen-format');
  const lang = document.getElementById('wr-gen-lang');
  if (syn) gen.synopsis = syn.value;
  if (fmt) gen.format = fmt.value;
  if (lang) gen.lang = lang.value;
}

/** Read the edited beats back. The textareas are the authority at this
    point — the writer has been invited to correct them, and sending the
    model's own version instead would make that invitation a lie. */
function readGenBeats() {
  for (const ta of document.querySelectorAll('[data-beat-text]')) {
    const b = gen.beats.find((x) => x.id === ta.dataset.beatText);
    if (b) b.happens = ta.value;
  }
}

function genBegin() {
  genBusy = true;
  genError = '';
  genStatus = '';
  genAbort = new AbortController();
}
function genEnd() {
  genBusy = false;
  genAbort = null;
  genAll = false;
}
const genSay = (m) => {
  genStatus = m;
  const line = document.querySelector('#generate .ai-status');
  if (line) line.textContent = m;
};

/* One place that turns a thrown thing into a line the user can act
   on, so the three stages cannot disagree about what a 401 means. */
function genFail(err) {
  const st = genFailState(err);
  genError = st.error;
  if (st.aborted) { genStatus = st.status; return; }
  console.warn('[write] gen', err);
}

delegate(document, 'change', '[data-action="gen-replace-scenes"]', (e, box) => {
  genReplaceScenes = !!box.checked;
  render();
});

/* The language hint and the estimate warning depend on the choice, so
   the two selects re-render. The synopsis textarea does NOT — it is a
   writing surface and must never re-render under the caret. */
delegate(document, 'change', '#wr-gen-format, #wr-gen-lang', () => {
  readGenForm();
  Scriptgen.save(gen);
  render();
});
delegate(document, 'input', '#wr-gen-synopsis', (e, ta) => {
  gen.synopsis = ta.value;
  Scriptgen.save(gen);
  /* A note about the last load stops being true the moment the
     writer edits the field, so it goes. Cleared without a re-render:
     this is the one surface that must never rebuild under the caret. */
  if (synNote) { synNote = null; const n = document.querySelector('.wr-syn-up .wr-gen-note, .wr-syn-up .wr-gen-warn'); if (n) n.remove(); }
});

/* ---- loading a synopsis ------------------------------------- */
delegate(document, 'change', 'input[data-action="syn-file"]', (e, input) => {
  const file = input.files && input.files[0];
  /* The value is cleared so choosing the SAME file twice still fires
     a change event — otherwise a writer who declines the replace and
     then changes their mind has to pick a different file. */
  input.value = '';
  takeSynopsis(file);
});

delegate(document, 'click', '[data-action="syn-replace"]', () => {
  if (synPending) applySynopsis(synPending);
});

delegate(document, 'click', '[data-action="syn-keep"]', () => {
  synPending = null;
  synNote = null;
  render('#wr-gen-synopsis');
  say('Kept what you had. The file was not used.');
});
delegate(document, 'input', '[data-beat-text]', (e, ta) => {
  const b = gen.beats.find((x) => x.id === ta.dataset.beatText);
  if (!b) return;
  b.happens = ta.value;
  Scriptgen.save(gen);
});

/* One batch, or all of them.

   `genAll` is checked at the TOP of every turn and cleared by Stop, so
   Stop ends the loop after at most the batch already in flight — which
   the AbortSignal cuts anyway. Reading a captured copy instead would
   keep the loop billing after the user asked it to stop, and that is
   the one failure this feature is not allowed to have. */
async function genRun(all) {
  if (genBusy) return;
  /* The pill does these two checks for the reviewed path; the bulk
     button is a plain button, so it asks them itself. */
  if (!PlanGate.aiUnlocked()) return;
  if (!hasKey()) {
    genError = 'No AI key on this device. Add your key once in Settings (settings.html#ai); every AI tool uses it.';
    render();
    return;
  }
  if (!await primeAI()) return;
  genBegin();
  genAll = all;
  render();
  try {
    for (;;) {
      const res = await Scriptgen.runNextBatch({
        onStatus: genSay, signal: genAbort.signal
      });
      gen = res.job;
      // Re-render between batches: the progress bar is the only honest
      // report of how far a run that might still fail has actually got.
      render();
      if (res.done) { say('The draft is complete.'); break; }
      if (!genAll) break;
      if (!genAbort) break;          // Stop ran between turns
    }
    genStatus = '';
  } catch (err) { genFail(err); }
  genEnd();
  render();
}

delegate(document, 'click', '[data-action="gen-run-all"]', () => genRun(true));
/* The bulk button is hidden until the plan is known to carry AI, and
   the plan arrives after first paint. Toggled in place rather than by
   a re-render, so a plan landing mid-sentence never rebuilds the page
   under the caret. */
Store.subscribe('plan:changed', () => {
  const on = PlanGate.aiUnlocked();
  document.querySelectorAll('[data-action="gen-run-all"]').forEach((b) => { b.hidden = !on; });
});

delegate(document, 'click', '[data-action="gen-stop"]', () => {
  genAll = false;
  if (genAbort) { try { genAbort.abort(); } catch (e) { /* already gone */ } }
});

/* Clears the JOB, not the writing. The pages stay in the editor and
   the revision taken before them stays in the list — a reset that
   silently deleted a hundred written pages would be the worst button
   in the app. */
delegate(document, 'click', '[data-action="gen-reset"]', () => {
  if (genBusy) return;
  Scriptgen.clear();
  gen = Scriptgen.load();
  genStatus = '';
  genError = '';
  genReplaceScenes = false;
  say('Started over. The pages already written are untouched, in the screenplay above.');
  render();
});

/* ARRIVED AT BY ITS OWN FRAGMENT. The importer renders only while
   `importOpen`, so #wr-import names an element that does not exist
   until somebody has already found the button — which makes a link to
   it from anywhere else a dead link that lands at the top of the page.
   The feature blueprint's ways-in panel offers "I already have a
   script" and this is the only importer in the app, so the fragment
   has to open it rather than point at where it would be.

   Same family as the nav-target trap in CLAUDE.md: a fragment target
   that depends on state fails silently, and the person it fails for
   is the one who has never opened the page. The fix there was to make
   the id unconditional; here the PANEL is the target, so the state is
   what the fragment sets. Read once, at boot, and never again — a
   later hashchange is the browser scrolling, not a request to
   reopen a panel somebody may have just closed. */
const wantsImporter = typeof location !== 'undefined' && location.hash === '#wr-import';
if (wantsImporter) importOpen = true;

/* ============================================================
   SCRIPT → SHOT LIST (docs/BLUEPRINT-REALIGN-PLAN.md, Rev 3 §1c)
   ------------------------------------------------------------
   Two things, and neither runs on its own:

   · THE COUNT. Each scene heading carries "Sc 12 · 6 shots" or
     "Sc 12 · no shots yet" in the space above it. Derived on a full
     render (and after a break-down, and when the tab comes back into
     view) from Shots.listShots() and matchScenes() — the join the
     hand-off banner and the shot division already read — so it is
     one pass over the script per render, never per keystroke, and it
     writes nothing.

   · BREAK INTO SHOTS. A click: first the hand-off banner's own
     "Add them" path for headings the Breakdown does not have, then a
     shot division for every confidently matched scene with NO shots
     — the AI one when there is a key and the writer says send, the
     basic rules (src/lib/shot-rules.js) otherwise. Append-only
     through Shots.addShot(); a scene somebody has already covered is
     never touched, and Undo removes exactly what this click added.
   ============================================================ */
let shotsBusy = false;

function decorateShotCounts() {
  const page = document.getElementById('wr-page');
  if (!page) return;
  page.querySelectorAll('.wr-shotcount').forEach((n) => n.remove());
  // The labels (write-model.js): one per heading with text.
  let labels;
  try { labels = shotCountLabels(doc.elements, () => Scenes.listScenes(), () => Shots.listShots()); }
  catch (e) { console.warn('[write] shot counts', e); return; }
  if (!labels.size) return;
  const rows = new Map();
  page.querySelectorAll('.wr-el.t-scene').forEach((r) => rows.set(r.dataset.el, r));
  for (const [id, label] of labels) {
    const row = rows.get(id);
    if (!row) continue;
    row.classList.add('wr-has-shotcount');
    row.append(h('span.wr-shotcount' + (label.none ? '.is-none' : ''), { text: label.text }));
  }
}

/** The toast, plus a link to the shot list beside its Undo. The
    toast takes one action; the link is a second way out, appended to
    the toast this call just made. */
function shotsToast(message, onUndo) {
  StudioUI.toast(message, { type: 'success', action: 'Undo', onAction: onUndo });
  const host = document.getElementById('toastHost');
  const t = host && host.lastElementChild;
  if (t && t.classList.contains('toast')) {
    const close = t.querySelector('.toast-close');
    const link = h('a.toast-action', { href: 'visualize.html#shot-list', text: 'Open Shot List' });
    if (close) close.before(link); else t.append(link);
  }
}

async function breakIntoShots() {
  if (shotsBusy || !doc.elements.length) return;
  shotsBusy = true;
  const btn = document.querySelector('[data-action="break-into-shots"]');
  if (btn) btn.disabled = true;
  let addedScenes = [];
  try {
    // 1. Headings the Breakdown does not have yet: the banner's path.
    if (newHeadings(doc.elements).length) {
      addedScenes = await handoffAddScenes({ quiet: true }) || [];
    }

    // 2. Every scene with a confident match and no shots.
    const scenes = Scenes.listScenes();
    const jobs = uncoveredShotJobs(scenes, Shots.listShots(), doc.elements);
    if (!jobs.length) {
      decorateShotCounts();
      if (addedScenes.length) {
        const ids = new Set(addedScenes);
        shotsToast(addedScenes.length + (addedScenes.length === 1 ? ' scene' : ' scenes')
          + ' added to the Breakdown · every scene already has shots', () => {
          unaddScenes(ids);   // through the bin: nothing hung on them is orphaned
          decorateShotCounts();
        });
      } else {
        say('Every scene in the script already has shots. Nothing was changed.');
      }
      return;
    }

    // 3. AI if there is a key AND the writer says send; rules otherwise.
    let result = null;
    let byAI = false;
    if (await primeAI() && AIm.hasKey() && (!Panelm || Panelm.aiAllowed())) {
      const go = await ask('Draft the shots for ' + jobs.length + (jobs.length === 1 ? ' scene' : ' scenes')
        + ' with AI?\n\nOK sends the slug line, synopsis and script text of those scenes to '
        + apiHost() + ', using the key on this device.\n'
        + 'Cancel uses the basic breakdown instead, which reads the pages here and sends nothing.');
      if (go) {
        const bySlice = new Map(matchScenes(scenes, doc.elements).pairs
          .filter((p) => p.slice).map((p) => [p.scene.id, p.slice]));
        say('Drafting ' + jobs.length + (jobs.length === 1 ? ' scene' : ' scenes') + ' with ' + providerLabel() + '…');
        try {
          result = await AIm.draftShotDivision(jobs.map((j) => ({
            sceneId: j.sceneId, number: j.number, slug: j.slug, eighths: j.eighths,
            synopsis: j.synopsis, script: AIm.sceneScriptText(bySlice.get(j.sceneId))
          })));
          byAI = true;
        } catch (err) {
          StudioUI.toast((err && err.message) || 'The AI draft did not run.', { type: 'error' });
          result = null;
        }
      }
    }
    if (!result) result = await basicShotDivision(jobs);

    // 4. Append. Nothing a person wrote is touched or renumbered.
    const made = [];
    for (const [sceneId, list] of result.byScene) {
      for (const draft of list) {
        made.push(Shots.addShot(sceneId, byAI ? { ...draft, ai: true } : { ...draft, rules: true }).id);
      }
    }
    decorateShotCounts();
    if (!made.length) {
      say('No shots came back. Nothing was added.');
      return;
    }
    const shotIds = new Set(made);
    const sceneIds = new Set(addedScenes);
    shotsToast(made.length + (made.length === 1 ? ' shot' : ' shots') + ' added'
      + (byAI ? ' by ' + result.model : '')
      + (sceneIds.size ? ' · ' + sceneIds.size + (sceneIds.size === 1 ? ' scene' : ' scenes') + ' added to the Breakdown' : ''),
    () => {
      Shots.saveShots(Shots.listShots().filter((s) => !shotIds.has(s.id)));
      if (sceneIds.size) unaddScenes(sceneIds);   // through the bin, see scene-bin.js
      decorateShotCounts();
      say('Removed the ' + shotIds.size + (shotIds.size === 1 ? ' shot' : ' shots') + ' just added.');
    });
  } catch (e) {
    console.warn('[write] break into shots', e);
    StudioUI.toast('The shots could not be drafted. Nothing more was changed.', { type: 'error' });
  } finally {
    shotsBusy = false;
    const b = document.querySelector('[data-action="break-into-shots"]');
    if (b) b.disabled = false;
  }
}

delegate(document, 'click', '[data-action="break-into-shots"]', () => { breakIntoShots(); });
// Shots added in another tab (the Shot List): repaint the counts when
// this tab is looked at again. Reads only.
addEventListener('storage', (e) => {
  if (e.key && e.key.startsWith(SHOTS_KEY) && document.visibilityState === 'visible') decorateShotCounts();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') decorateShotCounts();
});

/* The Outline tab (src/ui/beat-board.js) edits the script through
   the page's own model and save path, never around it. */
/* The Characters tab: a rename changes cues in place, and this is the
   page's own path for "the script changed under these rows". */
wireCharacters({
  getDoc: () => doc,
  scriptChanged: (ids) => {
    ids.forEach((id) => autosize(rowOf(id)?.querySelector('.wr-text')));
    smart.invalidate();
    refreshCounters();
    persistNow();
    scheduleDerived();
  }
});

BeatBoard.wireBeatBoard({
  getDoc: () => doc,
  saveDoc: () => persistNow(),
  rerender: () => render(),
  blankElement
});

render(wantsImporter ? '#wr-import-paste' : null);
mountFocusMode(() => doc);   // Phase 4: src/ui/focus-mode.js
mountBeatGuide({ getDoc: () => doc, addScene: (text) => editor.addElement(null, 'scene', text) });   // plan rev. 3 §1b: src/ui/beat-guide.js
