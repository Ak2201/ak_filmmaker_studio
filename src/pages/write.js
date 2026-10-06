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
import { flushStorage } from '../lib/store.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/write.css';
import '../styles/pdf.css';
import '../styles/ai.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { actionMenu, wireActionBar } from '../ui/actionbar.js';
import { mountFocusMode } from '../ui/focus-mode.js';
import { h, delegate } from '../lib/dom.js';
/* The provider TABLE only — not src/lib/ai.js, which this page
   still reaches with import() at a click. The disclosure below has
   to name the host the key will actually go to, and a restated
   hostname is a privacy claim that goes stale. */
import { apiHost, providerLabel } from '../lib/ai-providers.js';
import PDF from '../lib/pdf.js';
import Scenes from '../lib/scenes.js';
import * as Scriptgen from '../lib/scriptgen.js';
import Script, {
  ELEMENT_TYPES, DOC_KINDS, NEXT_TYPE,
  revisionColour, typeLabel,
  blankElement, blankDocument,
  pageCount, formatPages, formatRuntime, wordCount, totalLines
} from '../lib/script.js';

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

   NOT A CHAT BOX, and the shape is the argument. There is no
   panel down the side of the page. There is a ◇ on the row of a
   speech, and what opens is about THAT speech: two or three
   alternative versions, each with one line on what it changes,
   shown BESIDE the words the writer already has. It is one
   transaction — here is my line, here are some other lines —
   with no conversation and no second turn.

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
let passRun = blankPassRun();
function blankPassRun() {
  return { running: false, abort: null, status: '', error: '', result: null };
}

const app = document.getElementById('app');

/* ---- state -------------------------------------------------
   `doc` is the persisted model. `openDocId` is which production
   document the editor has open — pure view state, deliberately not
   stored: it is not the user's work, and a second copy of "where I
   was" is a thing that goes stale and then lies. */
let doc = Script.loadScript();
let openDocId = null;

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

function iconBtn(glyph, action, label, disabled, danger) {
  return h('button.bd-icon' + (danger ? '.is-danger' : ''), {
    type: 'button', 'data-action': action, title: label,
    'aria-label': label, text: glyph, disabled: disabled || false
  });
}

function field(spec, props, value) {
  const el = h(spec, props);
  if (value !== undefined) el.value = value;
  return el;
}

function labelled(text, control) {
  return h('label.wr-field', {}, [h('span', { text }), control]);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** An ISO timestamp as '28 Sep 2026, 14:05'. No locale surprises. */
function prettyStamp(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear()
       + ', ' + String(d.getHours()).padStart(2, '0')
       + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* ---- header ------------------------------------------------- */
function renderHeader() {
  const pages = pageCount(doc.elements);
  return h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Write · one script, its history, and its paper' }),
    h('h1.bd-title', { text: 'The Pages.' }),
    h('p.bd-deck', {
      text: 'A typed screenplay — every line knows whether it is a slug, an action '
          + 'or a cue — with a page count that follows the format rather than '
          + 'guessing at it, a coloured revision history, and the documents that '
          + 'travel with the script.'
    }),
    h('div.bd-stats', {}, [
      h('div.bd-stat', {}, [
        h('strong', { 'data-count': 'pages', text: formatPages(pages) }),
        h('span', { text: 'pages' })
      ]),
      h('div.bd-stat', {}, [
        h('strong', { 'data-count': 'elements', text: String(doc.elements.length) }),
        h('span', { text: doc.elements.length === 1 ? 'element' : 'elements' })
      ]),
      stat(String(doc.revisions.length), doc.revisions.length === 1 ? 'revision' : 'revisions'),
      stat(String(doc.documents.length), doc.documents.length === 1 ? 'document' : 'documents')
    ])
  ]);
}

/* ============================================================
   1. SCREENPLAY
   ============================================================ */
function renderScreenplayEmpty() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '❖', 'aria-hidden': 'true' }),
    h('h2', { text: 'Start with one slug line' }),
    h('p', {
      text: 'A screenplay is not free text — it is six kinds of line, each with its '
          + 'own place on the page. Say which kind each line is and the format, the '
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

function renderElement(el, i, total) {
  const row = h('article.wr-el.t-' + el.type, { 'data-el': el.id });

  const sel = h('select.wr-type', {
    'data-el-field': 'type',
    'aria-label': 'Element type for element ' + (i + 1)
  });
  ELEMENT_TYPES.forEach((t) => {
    const opt = h('option', { value: t.id, text: t.label });
    if (t.id === el.type) opt.selected = true;
    sel.append(opt);
  });

  const ta = field('textarea.wr-text', {
    rows: '1',
    spellcheck: 'true',
    'data-el-field': 'text',
    placeholder: PLACEHOLDER[el.type] || '',
    'aria-label': typeLabel(el.type) + ', element ' + (i + 1)
  }, el.text);

  /* The mark is built here, not by the lazy AI module, so that a line
     the model wrote is marked from the first paint of a cold load
     rather than three hundred milliseconds into it. A mark that
     arrives late is a mark somebody can miss. */
  if (el.aiPass) {
    row.classList.add('has-ai');
    row.append(h('div.wr-ai-tag', {}, [
      h('span.ai-mark', {
        title: 'This line was written by ' + (el.aiPass.model || 'a model')
             + ' and accepted by you. Undo puts your own words back.',
        text: 'AI PASS'
      }),
      h('button.ai-undo', {
        type: 'button', 'data-action': 'pass-undo',
        title: 'Put back the line you wrote',
        text: 'Undo'
      })
    ]));
  }

  row.append(
    sel,
    ta,
    h('div.wr-el-acts', {}, [
      /* Only dialogue. An action line is description and a slug is an
         address; neither is the thing "a dialogue pass" means, and a ◇
         on all six types is a ◇ nobody reads. */
      el.type === 'dialogue'
        ? iconBtn('◇', 'pass-open', 'Ask for a pass on this speech', false)
        : null,
      iconBtn('↑', 'el-up', 'Move up', i === 0),
      iconBtn('↓', 'el-down', 'Move down', i === total - 1),
      iconBtn('✕', 'el-del', 'Delete element', false, true)
    ].filter(Boolean))
  );
  return row;
}

/** Rows per run on the screenplay page; see renderScreenplay(). */
const CHUNK = 64;

const PLACEHOLDER = {
  scene: 'INT. LOCATION — DAY',
  action: 'What we see.',
  character: 'CHARACTER',
  paren: 'quietly',
  dialogue: 'What they say.',
  transition: 'CUT TO:'
};

function renderScreenplay() {
  const section = h('section.wr-section', { id: 'screenplay' });
  section.append(
    h('h2.bd-h2', { text: 'Screenplay' }),
    h('p.bd-sub', {
      text: 'Every line is typed — scene heading, action, character, parenthetical, '
          + 'dialogue or transition. Return starts the next element in the type that '
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
      h('button.btn' + (importOpen ? '.is-on' : ''), {
        type: 'button', 'data-action': 'import-toggle',
        'aria-expanded': importOpen ? 'true' : 'false',
        'aria-controls': 'wr-import',
        text: 'Import a script'
      }),
      actionMenu('Export', [
        { label: 'Save as PDF',        action: 'export-pdf',      hint: 'US Letter' },
        { label: 'Screenplay text',    action: 'export-text',     hint: '.txt' },
        { label: 'Export .fountain',   action: 'export-fountain', hint: 'plain text' }
      ], { align: 'right' })
    ])
  ]));

  if (importOpen) section.append(renderImport());

  if (!doc.elements.length) {
    section.append(renderScreenplayEmpty());
    return section;
  }

  /* The rows go into runs of CHUNK. A run is the unit the browser may
     skip while it is off screen (`content-visibility` in write.css), so
     a keystroke lays out the few runs in view instead of a feature's
     two thousand rows. The runs are invisible: same column, same gap. */
  const page = h('div.wr-page', { id: 'wr-page' });
  let run = null;
  doc.elements.forEach((el, i) => {
    if (i % CHUNK === 0) { run = h('div.wr-chunk'); page.append(run); }
    run.append(renderElement(el, i, doc.elements.length));
    // The panel is a sibling of the row it belongs to, so it opens
    // where the speech is rather than somewhere else on the page.
    if (passFor === el.id) run.append(renderPass(el, i));
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

/** The scene a speech sits in, as the model should read it: the slug
    line, a few elements before, the cue, and a couple after. Derived
    at the moment it is needed — a stored join between a speech and
    its scene would be wrong the first time either was reordered, the
    same argument sliceScriptByScene() makes in src/lib/ai.js. */
function passJobFor(i) {
  const els = doc.elements;
  const me = els[i];
  if (!me) return null;

  let slug = '';
  for (let j = i; j >= 0; j--) {
    if (els[j].type === 'scene' && els[j].text.trim()) { slug = els[j].text.trim().toUpperCase(); break; }
  }
  // The cue and any parenthetical immediately above this speech.
  let character = '', paren = '';
  for (let j = i - 1; j >= 0 && j >= i - 2; j--) {
    if (els[j].type === 'character' && !character) character = els[j].text.trim();
    else if (els[j].type === 'paren' && !paren) paren = els[j].text.trim();
    else break;
  }

  const line = (el) => typeLabel(el.type).toUpperCase() + ': ' + el.text.trim();
  const before = els.slice(Math.max(0, i - 6), i)
    .filter((e) => e.text.trim() && e.type !== 'scene').map(line).join('\n');
  const after = els.slice(i + 1, i + 4)
    .filter((e) => e.text.trim()).map(line).join('\n');

  return {
    slug, before, after,
    character,
    paren,
    speech: me.text
  };
}

function renderPass(el, i) {
  const wrap = h('div.ai-inline', { 'data-pass': el.id });

  if (!AIm) {
    wrap.append(h('p.ai-status', { role: 'status', text: 'Opening…' }));
    return wrap;
  }

  const panel = h('div.ai-panel');
  panel.append(h('div.ai-head', {}, [
    h('h4.ai-title', { text: 'A pass on this speech' }),
    h('button.bd-icon', {
      type: 'button', 'data-action': 'pass-close',
      title: 'Close', 'aria-label': 'Close the pass panel', text: '✕'
    })
  ]));

  /* GATE 1 — the key. */
  const kg = Panelm.keyGate('A dialogue pass');
  if (kg) {
    panel.append(kg);
    if (kg.dataset.blocking === 'true') { wrap.append(panel); return wrap; }
  }
  panel.append(Panelm.keyBar());

  /* GATE 2 — the writing. Independent of the key. */
  const job = passJobFor(i);
  if (!job || !job.speech.trim()) {
    panel.append(Panelm.gate(
      'This speech is empty.',
      'A pass is a second look at words that already exist. Write the line first — '
      + 'a machine guessing at what a character might say is not a pass, it is a '
      + 'stranger writing your film.'
    ));
    wrap.append(panel);
    return wrap;
  }

  const context = BPm.blueprintContext();
  const sum = BPm.contextSummary(context);
  const full = { ...job, context, ask: passAsk() };

  panel.append(Panelm.disclose(
    'Clicking the button below sends this speech, the few lines around it in the '
    + 'scene, and '
    + (sum.fields
      ? sum.fields + ' ' + (sum.fields === 1 ? 'answer' : 'answers') + ' from '
        + sum.steps + ' ' + (sum.steps === 1 ? 'step' : 'steps')
        + ' of your feature blueprint (logline, theme, who the characters are) '
      : 'nothing from your blueprint, because none of its spine steps is filled in yet, ')
    + 'to ' + apiHost() + ' using the key on this device. The rest of the screenplay '
    + 'stays here. Nothing is sent until you click.'
  ));

  panel.append(h('label.ai-field.ai-ask', {}, [
    h('span.ai-flabel', { text: 'Anything in particular? (optional)' }),
    field('input.ai-ask-input', {
      type: 'text', id: 'wr-pass-ask', maxlength: '200', autocomplete: 'off',
      placeholder: 'Shorter. Less on the nose. More Madurai.',
      'aria-label': 'What to ask for in the pass'
    }, passAsk())
  ]));

  const peek = h('details.ai-peek');
  peek.append(h('summary', { text: 'Show me exactly what would be sent' }));
  const pre = h('pre.ai-peek-body');
  pre.textContent = AIm.buildDialoguePrompt(full);
  peek.append(pre);
  panel.append(peek);

  panel.append(h('div.ai-acts', {}, [
    passRun.running
      ? h('button.btn.danger', { type: 'button', 'data-action': 'pass-stop', text: 'Stop' })
      : h('button.btn.primary', { type: 'button', 'data-action': 'pass-run', text: 'Send this speech' }),
    passRun.result && !passRun.running
      ? h('button.btn', { type: 'button', 'data-action': 'pass-clear', text: 'Discard these versions' })
      : null
  ]));

  const status = Panelm.statusLine(passRun.status);
  if (status) panel.append(status);
  const err = Panelm.errorLine(passRun.error);
  if (err) panel.append(err);

  if (passRun.result) panel.append(renderPassResult(el, passRun.result));
  wrap.append(panel);
  return wrap;
}

/* The optional steer. Kept in a module variable rather than read out
   of the DOM at send time, because the panel is rebuilt on every
   render and a value living only in an <input> would be lost by the
   first key-change repaint. */
let passAskText = '';
function passAsk() { return passAskText; }

/** The versions, BESIDE the original. Never in place of it: until a
    person clicks, the model's text is a suggestion on the page and
    the user's line is still the line. */
function renderPassResult(el, res) {
  const box = h('div.ai-result');
  box.append(h('div.ai-result-head', {}, [
    h('span.ai-mark', { title: 'Written by a model, not by you', text: 'MODEL VERSIONS' }),
    h('span.ai-result-meta', {
      text: 'by ' + res.model + ' · nothing is changed until you choose one'
        + (res.truncated ? ' · the reply was cut short' : '')
    })
  ]));
  if (res.keep) {
    box.append(h('p.ai-verdict', {}, [
      h('span.ai-try-label', { text: 'WORKS' }),
      h('span', { text: ' ' + res.keep })
    ]));
  }

  const grid = h('div.ai-compare');
  const mine = h('div.ai-mine');
  mine.append(h('p.ai-col-label', { text: 'YOUR LINE' }));
  mine.append(h('p.ai-speech', { text: el.text }));
  grid.append(mine);

  const theirs = h('div.ai-theirs');
  res.options.forEach((opt, n) => {
    const card = h('div.ai-option');
    card.append(h('p.ai-col-label', { text: 'VERSION ' + (n + 1) }));
    card.append(h('p.ai-speech', { text: opt.text }));
    if (opt.note) card.append(h('p.ai-note-line', { text: opt.note }));
    card.append(h('button.btn', {
      type: 'button', 'data-action': 'pass-use', 'data-option': String(n),
      text: 'Use this line'
    }));
    theirs.append(card);
  });
  grid.append(theirs);
  box.append(grid);

  box.append(h('p.ai-caveat', {
    text: 'Choosing one replaces the speech above, marks it as a model pass, and '
        + 'keeps your own words so Undo can put them straight back.'
  }));
  return box;
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
const TYPE_ORDER = ['scene', 'action', 'character', 'paren', 'dialogue', 'transition'];

function importChooser() {
  const wrap = h('div.wr-imp-choose');

  wrap.append(h('p.wr-imp-lead', {
    text: 'Drop a script anywhere on this page, choose a file, or paste the text below. '
        + 'A PDF (.pdf), Fountain (.fountain), a plain screenplay (.txt) and '
        + 'Final Draft (.fdx) all work.'
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
    accept: '.fountain,.spmd,.txt,.fdx,.xml,.pdf,text/plain,application/pdf',
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

/** Where the scene numbers came from, in one sentence. A number is
    what the stripboard, the sides and the call sheet call a scene,
    so a script that says 47 and a studio that says 12 is the one
    import failure that still looks like it worked. The parser
    ranks its three sources; this only reports which ones it used. */
function sceneNumberNote(plan) {
  const n = (plan && plan.numbering) || {};
  const carried = (n.fromFile || 0) + (n.fromHeading || 0);
  const ordinal = n.ordinal || 0;
  if (!carried) {
    return ordinal
      ? 'That file carries no scene numbers, so the scenes are numbered by their position — 1 upwards.'
      : '';
  }
  const source = n.fromFile && n.fromHeading ? 'the file and from the headings'
    : n.fromFile ? 'the file’s own scene numbers' : 'the headings';
  if (!ordinal) {
    return 'All ' + carried + ' scene numbers come from ' + source
      + ' — the script’s numbering is kept, letters and all.';
  }
  return carried + ' scene number(s) come from ' + source + '; the remaining ' + ordinal
    + ' heading(s) carry none and are numbered by their position, skipping anything already used.';
}

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

const GEN_FORMATS = [
  { id: 'feature', label: 'Feature', hint: 'about 100 pages' },
  { id: 'short', label: 'Short', hint: 'about 15 pages' }
];

/* ---- loading a synopsis off the disk ------------------------
   The synopsis stage could only be typed or pasted into, and a
   synopsis usually already exists as a file. So: a picker and a
   drop target that END AT THE TEXTAREA. There is no second
   pipeline behind this and no new stored key — scriptgen.js
   already persists gen.synopsis, and the beats still come from the
   existing `gen-beats` button, which is where the model is.

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

/* The field's ceiling, stated once and in one place. It is the
   textarea's own maxlength: about two or three pages of prose, which
   is a synopsis, and roughly one request's worth of input for a beat
   sheet. A forty-page treatment is not a synopsis, and the ONE thing
   that must not happen is keeping its first sixth without saying so. */
const SYN_LIMIT = 6000;

/* Prose formats only — see above for why a .fountain or a .fdx is not
   on this list even though readFile() would happily read them. */
const SYN_ACCEPT = '.txt,.text,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf';

const countFmt = (n) => Number(n).toLocaleString('en-IN');

/* Written once, printed by both branches of renderGenerate(). Two
   copies of a sentence about what leaves the browser is two chances
   for one of them to be more generous than the code. */
const GEN_DISCLOSURE =
  'What is sent: the synopsis you wrote, the beats as they stand, and for each '
  + 'batch of scenes its own slug lines plus the two scenes either side for '
  + 'continuity. Not your other projects, not your notes, not the rest of the '
  + 'screenplay. Nothing is sent until you press a button, and the key never '
  + 'leaves this device except as the one header that authorises the request.';

/** A document's text as paragraphs.

    A PDF arrives from pdf-text.js as INDENTED lines, because in a
    screenplay the indentation is the element type. In a synopsis it
    is nothing — it is where the margin happened to be — so the
    leading space comes off, a single newline inside a paragraph
    becomes a space, and a blank line stays a paragraph break. */
function prosify(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/([^\n])\n(?!\n)/g, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cut to `limit`, at a word boundary rather than through a word. */
function clipTo(text, limit) {
  if (text.length <= limit) return text;
  const hard = text.slice(0, limit);
  const space = hard.lastIndexOf(' ');
  return (space > limit - 400 ? hard.slice(0, space) : hard).trimEnd();
}

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

  const prose = prosify(String(raw));
  if (!prose) { say('There was no text in that file.'); return; }

  const kept = clipTo(prose, SYN_LIMIT);
  const pending = { name: file.name || 'that file', text: kept, read: prose.length, kept: kept.length };

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
  const cut = p.kept < p.read;
  synNote = {
    warn: cut,
    text: cut
      ? 'Loaded ' + countFmt(p.kept) + ' of ' + countFmt(p.read) + ' characters from \u201c'
        + p.name + '\u201d \u2014 the rest was NOT kept. The field holds '
        + countFmt(SYN_LIMIT) + ' characters, which is a synopsis rather than a '
        + 'treatment. The file on your disk is untouched, so if the part that '
        + 'matters was at the end, trim it there and load it again.'
      : 'Loaded all ' + countFmt(p.read) + ' characters from \u201c' + p.name + '\u201d.'
  };
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
    const p = synPending;
    const cut = p.kept < p.read;
    box.append(h('div.wr-gen-warn', {}, [
      h('p', {
        text: '\u201c' + p.name + '\u201d read as ' + countFmt(p.kept)
          + (cut ? ' of ' + countFmt(p.read) : '') + ' characters'
          + (cut ? ', the rest over the ' + countFmt(SYN_LIMIT) + '-character limit' : '')
          + '. There are already ' + countFmt(String(gen.synopsis).length)
          + ' characters in the synopsis field, and replacing them cannot be undone '
          + 'from here.'
      }),
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

/* Mirrored from SCRIPT_LANGS in ai.js so the panel renders before the
   model code loads. ai.js stays the authority — it is what the prompt
   is built from — and the ids are what tie the two together. */
const GEN_LANGS = [
  { id: 'ta-dialogue', label: 'Tamil dialogue · English slugs and action',
    hint: 'what Tamil crews shoot from, and the page count stays exact', exact: true },
  { id: 'tanglish', label: 'Tanglish throughout',
    hint: 'romanised Tamil; fits the Courier grid', exact: true },
  { id: 'ta-full', label: 'Tamil throughout',
    hint: 'action in Tamil too — the page count becomes an estimate', exact: false },
  { id: 'en', label: 'English', hint: '', exact: true }
];
const genLang = (id) => GEN_LANGS.find((l) => l.id === id) || GEN_LANGS[0];

function genStage() {
  if (!gen.beats.length) return 'synopsis';
  if (!gen.scenes.length) return 'beats';
  return gen.cursor >= gen.scenes.length ? 'done' : 'pages';
}

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
  /* THE GATE IS ON THE BUTTON, NOT ON THE STAGE. Everything above
     this line is a writing surface and a local file read; the thing
     that needs a key is the request. The whole stage used to sit
     behind keyGate(), which meant somebody with no key could not
     even open their own treatment in the field. */
  if (!AIm) {
    wrap.append(
      h('p.wr-gen-note', {
        text: 'Drafting the beat sheet needs your own ' + providerLabel() + ' API '
          + 'key, kept on this device and sent to nobody but ' + apiHost() + '. '
          + 'Loading and editing the synopsis above needs nothing.'
      }),
      h('div.wr-gen-acts', {}, [
        h('button.btn', { type: 'button', 'data-action': 'gen-open', text: 'Open' })
      ])
    );
    return wrap;
  }
  if (!Panelm.hasKey()) {
    wrap.append(Panelm.keyGate('draft a script from a synopsis'));
    return wrap;
  }

  wrap.append(
    h('div.wr-gen-acts', {}, [
      h('button.btn.primary', {
        type: 'button', 'data-action': 'gen-beats', disabled: genBusy,
        text: genBusy ? 'Working…' : 'Draft the beat sheet'
      }),
      genBusy ? h('button.btn', { type: 'button', 'data-action': 'gen-stop', text: 'Stop' }) : null
    ]),
    h('p.wr-gen-cost', {
      text: 'One request. This is the cheap stage — argue with the structure here, '
        + 'not after a hundred pages exist.'
    })
  );
  return wrap;
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
  wrap.append(
    h('div.wr-gen-acts', {}, [
      h('button.btn.primary', {
        type: 'button', 'data-action': 'gen-scenes', disabled: genBusy,
        text: genBusy ? 'Working…' : 'Lay out the scenes'
      }),
      genBusy ? h('button.btn', { type: 'button', 'data-action': 'gen-stop', text: 'Stop' }) : null,
      h('button.btn', { type: 'button', 'data-action': 'gen-beats', disabled: genBusy,
        text: 'Draft the beats again' })
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
    h('div.wr-gen-acts', {}, [
      h('button.btn.primary', {
        type: 'button', 'data-action': 'gen-run-all', disabled: genBusy,
        text: genBusy ? 'Writing…' : (p.done ? 'Resume and write the rest' : 'Write all ' + p.left + ' scenes')
      }),
      h('button.btn', {
        type: 'button', 'data-action': 'gen-run-one', disabled: genBusy,
        text: 'Just the next ' + Math.min(Scriptgen.BATCH_SIZE, p.left)
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
    if (keyed) section.append(Panelm.keyBar());
    section.append(renderGenSynopsis());
    section.append(...genStatusBlock());
    if (keyed) section.append(Panelm.disclose(GEN_DISCLOSURE));
    return section;
  }

  if (!AIm) {
    section.append(
      h('p.wr-gen-note', {
        text: 'Needs your own ' + providerLabel() + ' API key, kept on this '
          + 'device and sent to nobody but ' + apiHost() + '.'
      }),
      h('div.wr-gen-acts', {}, [
        h('button.btn', { type: 'button', 'data-action': 'gen-open', text: 'Open' })
      ])
    );
    return section;
  }
  if (!Panelm.hasKey()) {
    section.append(Panelm.keyGate('draft a script from a synopsis'));
    return section;
  }

  section.append(Panelm.keyBar());
  if (stage === 'beats') section.append(renderGenBeats());
  else section.append(renderGenPages());
  section.append(...genStatusBlock());
  section.append(Panelm.disclose(GEN_DISCLOSURE));
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
    section.append(renderRevisionsEmpty());
    return section;
  }
  const list = h('div.wr-rev-list');
  doc.revisions.forEach((r, i) => list.append(renderRevision(r, i, doc.revisions.length)));
  section.append(list);
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

const docMetaText = (d) => {
  const words = wordCount(d.body);
  return words + (words === 1 ? ' word' : ' words') + ' · ' + prettyStamp(d.updated);
};

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

function renderDocEditor(d) {
  const words = wordCount(d.body);
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
    field('textarea.wr-body', {
      rows: '14', spellcheck: 'true',
      placeholder: 'Write it here. Plain prose — this is not the screenplay.',
      'data-doc-field': 'body', 'aria-label': 'Document text'
    }, d.body),
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
  main.append(renderHeader(), renderScreenplay(), renderGenerate(),
    renderRevisions(), renderDocuments());
  app.replaceChildren(main);
  countNodes = null;
  autosizeAll();
  requestAnimationFrame(autosizeAll);   // again once layout has settled

  mountShell();
  wireActionBar();
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[write] chrome', e); }

  if (focus) applyFocus(focus);
}

function applyFocus(sel) {
  const node = typeof sel === 'string' ? document.querySelector(sel) : sel;
  if (!node) return;
  /* A row in a run the browser is skipping (off screen, see write.css)
     has a placeholder height, and the page scrolls smoothly — so a
     focus() aimed at it plans its scroll against the placeholders and
     stops thousands of pixels short. Bring that row into view first,
     instantly, which lays its run out for real; then focus as before. */
  if (typeof node.checkVisibility === 'function'
      && !node.checkVisibility({ contentVisibilityAuto: true })
      && node.closest('.wr-chunk')) {
    node.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  node.focus();
  if (typeof node.setSelectionRange === 'function' && typeof node.value === 'string') {
    try { node.setSelectionRange(node.value.length, node.value.length); } catch (e) { /* select */ }
  }
}
const elFocus = (id) => `[data-el="${id}"] .wr-text`;

/* ---- sizing the elements to their text ---------------------
   C2 in docs/UX-AUDIT-2026-10-06.md: on a feature-length script this
   page froze for minutes. The old autosize wrote `height: auto`, read
   scrollHeight and wrote the height back, once per textarea — a forced
   synchronous layout of the whole page per row, 2,361 times per render,
   twice per render, and every Return re-rendered every row.

   Where the browser can do it, it does: `field-sizing: content` in
   write.css grows each textarea to its text with no script at all, and
   it stays right across a font swap and a resize for free. Everywhere
   else the JS below is the fallback, and it is BATCHED — every write,
   then every read, then every write — so a whole page costs one layout
   rather than one per row. DOM only; never touches storage. */
const NATIVE_SIZING = typeof CSS !== 'undefined' && typeof CSS.supports === 'function'
  && CSS.supports('field-sizing', 'content');

function autosizeMany(list) {
  if (NATIVE_SIZING || !list.length) return;
  list.forEach((ta) => { ta.style.height = 'auto'; });
  // `scrollHeight` is the CONTENT box; the element is border-box, so
  // assigning it directly loses the two border pixels and every block
  // renders two pixels short of its own text. Add the frame back.
  const heights = list.map((ta) => ta.scrollHeight + (ta.offsetHeight - ta.clientHeight));
  list.forEach((ta, i) => { ta.style.height = heights[i] + 'px'; });
}
function autosize(ta) { if (ta) autosizeMany([ta]); }

/* The elements are `overflow: hidden`, so a height measured against the
   wrong font clips the text and there is no scrollbar to say so. The
   script face is a webfont: the first measurement happens before it
   arrives, every line then gets wider, and a four-line action block
   renders as three. So measure again once the fonts are in, and again
   whenever the column changes width — the indents are percentages, so a
   resize genuinely does change how many lines a block takes. (Only the
   fallback path needs any of this; field-sizing re-flows by itself.) */
function autosizeAll() {
  if (NATIVE_SIZING) return;
  autosizeMany(Array.from(document.querySelectorAll('.wr-text')));
}
if (!NATIVE_SIZING && document.fonts && document.fonts.ready) {
  document.fonts.ready.then(autosizeAll).catch(() => {});
}
let resizeFrame = 0;
if (!NATIVE_SIZING) {
  addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(autosizeAll);
  });
}

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
   EVENTS — delegated, no inline handlers. A strict CSP ships.
   ============================================================ */
const idOf = (el, attr) => el.closest(`[data-${attr}]`)?.dataset[attr];
const indexOfEl = (id) => doc.elements.findIndex((e) => e.id === id);

/* ---- screenplay: structure ---------------------------------
   A structural edit PATCHES the page rather than rebuilding it. On a
   feature-length script a full render is thousands of rows of DOM, and
   Return is a key people press every few seconds; rebuilding the lot
   for one new row is what made this page freeze (C2 in the UX audit).

   So add, delete and move touch the affected row(s) and nothing else,
   then bring the cheap derived state into step: each row's ordinal in
   its aria-labels, the first row's dead ↑ and the last row's dead ↓,
   and the counters. The model and the save path are exactly as before —
   the splice and `persistNow()` happen first, and the DOM follows.

   It falls back to a full render whenever a patch would have to know
   more than one row: the empty state (no page to patch), the header's
   "element"/"elements" switching at one, an open import preview (it
   quotes the element count) and an open pass panel (a sibling that
   sits between rows). All rare; none of them is Return.

   The rows live in runs (`.wr-chunk`, see renderScreenplay). A patch
   puts a new row in the run of the row above it, splits a run that has
   grown to twice its size, and drops a run left empty; a full render
   re-deals them evenly. */
const pageNode = () => document.getElementById('wr-page');
const rowOf = (id) => {
  const page = pageNode();
  return page ? page.querySelector(`[data-el="${CSS.escape(String(id))}"]`) : null;
};

/** Every row on the page, in order, across the runs. */
function allRows() {
  const page = pageNode();
  const rows = [];
  if (!page) return rows;
  for (const run of page.children) {
    for (const n of run.children) if (n.tagName === 'ARTICLE') rows.push(n);
  }
  return rows;
}

/** Keep the runs a sensible size after a patch. Never touches a row's
    contents, only which run holds it. */
function tidyRun(run) {
  if (!run || !run.classList.contains('wr-chunk')) return;
  if (!run.children.length) { run.remove(); return; }
  if (run.children.length < CHUNK * 2) return;
  const tail = h('div.wr-chunk');
  const kids = Array.from(run.children).slice(CHUNK);
  // A pass panel belongs with the row before it; never split them.
  while (kids.length && kids[0].tagName !== 'ARTICLE') kids.shift();
  tail.append(...kids);
  run.after(tail);
}

function patchable(lenBefore, lenAfter) {
  return lenBefore >= 2 && lenAfter >= 2 && !importOpen && passFor === null && !!pageNode();
}

function setAttr(node, name, value) {
  if (node && node.getAttribute(name) !== value) node.setAttribute(name, value);
}

/** Bring rows [from, to] back in step with their position: the ordinal
    in both labels, and which arrows are dead. Attribute writes only —
    no layout is read, so this is cheap even across the whole script. */
function reindexRows(from, to) {
  const page = pageNode();
  if (!page) return;
  // Rows only (an open pass panel is a sibling between them), and the
  // row's own children walked rather than queried.
  const rows = allRows();
  const total = doc.elements.length;
  const last = Math.min(rows.length - 1, to === undefined ? rows.length - 1 : to);
  for (let i = Math.max(0, from); i <= last; i++) {
    const el = doc.elements[i];
    if (!el) continue;
    for (const part of rows[i].children) {
      if (part.tagName === 'SELECT') setAttr(part, 'aria-label', 'Element type for element ' + (i + 1));
      else if (part.tagName === 'TEXTAREA') setAttr(part, 'aria-label', typeLabel(el.type) + ', element ' + (i + 1));
      else if (part.tagName === 'DIV' && part.classList.contains('wr-el-acts')) {
        for (const btn of part.children) {
          const act = btn.getAttribute('data-action');
          if (act === 'el-up') { if (btn.disabled !== (i === 0)) btn.disabled = i === 0; }
          else if (act === 'el-down') { if (btn.disabled !== (i === total - 1)) btn.disabled = i === total - 1; }
        }
      }
    }
  }
}

/* The ordinals of every row BELOW an insertion or a deletion are one
   out until this runs. They are only words in an aria-label — the
   arrows at either end are fixed synchronously — so they are brought
   back in step once the browser is idle, not inside the keystroke. */
let reindexFrom = Infinity;
let reindexTask = 0;
function reindexLater(from) {
  reindexFrom = Math.min(reindexFrom, Math.max(0, from));
  if (reindexTask) return;
  const run = () => {
    reindexTask = 0;
    const start = reindexFrom;
    reindexFrom = Infinity;
    if (start !== Infinity) reindexRows(start);
  };
  reindexTask = typeof requestIdleCallback === 'function'
    ? requestIdleCallback(run, { timeout: 1000 })
    : setTimeout(run, 200);
}

function addElement(after, type) {
  const el = blankElement({ type });
  const lenBefore = doc.elements.length;
  const at = after === null ? lenBefore : after + 1;
  doc.elements.splice(at, 0, el);
  persistNow();
  if (!patchable(lenBefore, doc.elements.length)) { render(elFocus(el.id)); return; }

  const row = renderElement(el, at, doc.elements.length);
  const prev = at > 0 ? rowOf(doc.elements[at - 1].id) : null;
  const next = doc.elements[at + 1] ? rowOf(doc.elements[at + 1].id) : null;
  if (!prev && !next) { render(elFocus(el.id)); return; }
  // Into the run of the row above, straight after it — or, for a new
  // first element, in front of the old one.
  if (prev) prev.after(row);
  else next.before(row);
  tidyRun(row.parentElement);
  autosize(row.querySelector('.wr-text'));
  reindexRows(at - 1, at);
  reindexLater(at + 1);
  refreshCounters();
  applyFocus(row.querySelector('.wr-text'));
}

/** Take element `i` out, and put the caret in `neighbourOf(i)`. */
function removeElement(i, neighbourOf) {
  const lenBefore = doc.elements.length;
  const [gone] = doc.elements.splice(i, 1);
  persistNow();
  const neighbour = neighbourOf(i);
  if (!patchable(lenBefore, doc.elements.length)) {
    render(neighbour ? elFocus(neighbour.id) : null);
    return;
  }
  const row = rowOf(gone.id);
  if (row) {
    const run = row.parentElement;
    row.remove();
    tidyRun(run);
  }
  reindexRows(i - 1, i);
  reindexLater(i + 1);
  refreshCounters();
  if (neighbour) applyFocus(elFocus(neighbour.id));
}

delegate(document, 'click', '[data-action="el-first"]', () => addElement(null, 'scene'));
delegate(document, 'click', '[data-action="el-add"]', () => {
  const last = doc.elements[doc.elements.length - 1];
  addElement(null, last ? (NEXT_TYPE[last.type] || 'action') : 'scene');
});

delegate(document, 'click', '[data-action="el-up"]', (e, btn) => moveElement(idOf(btn, 'el'), -1));
delegate(document, 'click', '[data-action="el-down"]', (e, btn) => moveElement(idOf(btn, 'el'), 1));
function moveElement(id, delta) {
  const i = indexOfEl(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= doc.elements.length) return;
  [doc.elements[i], doc.elements[j]] = [doc.elements[j], doc.elements[i]];
  persistNow();
  const len = doc.elements.length;
  const mine = rowOf(id);
  const theirs = rowOf(doc.elements[i].id);   // the one it swapped with
  if (!patchable(len, len) || !mine || !theirs) { render(elFocus(id)); return; }
  // Whichever row now comes first goes in front of the other.
  // Across a run boundary this moves a row from one run to the next,
  // which can leave a run of one empty.
  const runs = [mine.parentElement, theirs.parentElement];
  if (delta < 0) theirs.before(mine);
  else mine.before(theirs);
  runs.forEach(tidyRun);
  reindexRows(Math.min(i, j), Math.max(i, j));
  applyFocus(elFocus(id));
}

delegate(document, 'click', '[data-action="el-del"]', (e, btn) => {
  const id = idOf(btn, 'el');
  const i = indexOfEl(id);
  if (i < 0) return;
  const el = doc.elements[i];
  // Only ask when there is something to lose. A confirm on an empty
  // element is the dialog people learn to click through.
  if (el.text.trim()
      && !confirm(`Delete this ${typeLabel(el.type).toLowerCase()}?\n\n“${el.text.trim().slice(0, 80)}”`)) return;
  removeElement(i, (k) => doc.elements[k] || doc.elements[k - 1]);
});

/* ---- screenplay: editing -----------------------------------
   Typing updates the model and the counters; it does not re-render,
   because a re-render takes the caret with it. */
delegate(document, 'input', '.wr-text[data-el-field="text"]', (e, ta) => {
  const i = indexOfEl(idOf(ta, 'el'));
  if (i < 0) return;
  doc.elements[i].text = ta.value;
  autosize(ta);
  refreshCounters();
  persist();
});

/* A type change moves the element across the page, so the row's class
   changes — but re-rendering the whole section would cost the focus the
   user still has on the select. Swap the class in place instead. */
delegate(document, 'change', 'select[data-el-field="type"]', (e, sel) => {
  const row = sel.closest('[data-el]');
  const i = indexOfEl(row?.dataset.el);
  if (i < 0) return;
  doc.elements[i].type = sel.value;
  row.className = 'wr-el t-' + sel.value;
  const ta = row.querySelector('.wr-text');
  if (ta) {
    ta.placeholder = PLACEHOLDER[sel.value] || '';
    ta.setAttribute('aria-label', typeLabel(sel.value) + ', element ' + (i + 1));
    autosize(ta);
  }
  refreshCounters();
  persistNow();
});

/* Return makes the next element, in the type that usually follows —
   the mapping a screenwriter's hands already know. Shift+Return is a
   line break inside the element, which action blocks need. */
delegate(document, 'keydown', '.wr-text[data-el-field="text"]', (e, ta) => {
  if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
  const i = indexOfEl(idOf(ta, 'el'));
  if (i < 0) return;
  e.preventDefault();
  doc.elements[i].text = ta.value;         // the debounce may not have fired
  addElement(i, NEXT_TYPE[doc.elements[i].type] || 'action');
});

/* Backspace in an empty element deletes it and steps back, which is
   how every screenwriting app behaves and what makes the Return
   mapping above safe to be wrong about. */
delegate(document, 'keydown', '.wr-text[data-el-field="text"]', (e, ta) => {
  if (e.key !== 'Backspace' || ta.value !== '' || doc.elements.length < 2) return;
  const i = indexOfEl(idOf(ta, 'el'));
  if (i < 0) return;
  e.preventDefault();
  removeElement(i, (k) => doc.elements[k - 1] || doc.elements[k]);
});

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
function currentRevision() {
  if (!doc.revisions.length) return '';
  const i = doc.revisions.length - 1;
  return revisionColour(i).name + ' — ' + doc.revisions[i].name;
}

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
const exportMeta = () => ({
  title: Script.projectTitle(),
  revision: currentRevision(),
  subtitle: prettyStamp(new Date().toISOString()),
  date: new Date().toISOString().slice(0, 10)
});

delegate(document, 'click', '[data-action="export-pdf"]', async () => {
  if (!doc.elements.length) { say('Nothing to export yet — write a line first.'); return; }
  const main = document.getElementById('main');
  if (!main) return;
  let Typeset;
  try { Typeset = await typesetter(); }
  catch (e) { say('The typesetter could not be loaded. Check the connection and try again.'); return; }

  let node = null;
  PDF.exportPDF({
    scope: 'screenplay',
    title: Script.projectTitle() + ' — Screenplay',
    subtitle: [currentRevision(), formatPages(pageCount(doc.elements)) + ' pages']
      .filter(Boolean).join(' · '),
    before: () => { node = Typeset.buildDocument(doc, exportMeta()); main.append(node); },
    after: () => { if (node) { node.remove(); node = null; } }
  });
});

delegate(document, 'click', '[data-action="export-text"]', async () => {
  if (!doc.elements.length) { say('Nothing to export yet — write a line first.'); return; }
  let Typeset;
  try { Typeset = await typesetter(); }
  catch (e) { say('The typesetter could not be loaded. Check the connection and try again.'); return; }
  const title = Script.projectTitle();
  download(Typeset.toText(doc, exportMeta()),
    Script.slugify(title, 'screenplay') + '.txt', 'text/plain');
  say('Exported ' + Typeset.sheetCount(doc.elements) + ' pages of screenplay text.');
});

/* ---- the pass: events ---------------------------------------
   Delegated, no inline handlers — a strict CSP ships. Every one of
   these starts at a click; none of them runs on load, on focus or on
   a timer, and only `pass-use` and `pass-undo` write anything. */

delegate(document, 'click', '[data-action="pass-open"]', async (e, btn) => {
  const id = idOf(btn, 'el');
  if (!id) return;
  if (passRun.abort) passRun.abort.abort();
  // A steer typed for one speech is not a standing instruction for the
  // next one. Opening a different line starts from nothing asked.
  if (passFor !== id) passAskText = '';
  passFor = id;
  passRun = blankPassRun();
  render();                       // the "Opening…" placeholder
  if (await primeAI()) render();  // the real panel
});

delegate(document, 'click', '[data-action="pass-close"]', () => {
  if (passRun.abort) passRun.abort.abort();
  const id = passFor;
  passFor = null;
  passRun = blankPassRun();
  render(id ? elFocus(id) : null);
});

delegate(document, 'click', '[data-action="pass-clear"]', () => {
  passRun.result = null;
  passRun.status = '';
  passRun.error = '';
  render();
});

delegate(document, 'click', '[data-action="pass-stop"]', () => {
  if (passRun.abort) passRun.abort.abort();
});

// The optional steer, kept in memory so a repaint cannot lose it.
delegate(document, 'input', '.ai-ask-input', (e, input) => { passAskText = input.value; });

delegate(document, 'click', '[data-action="pass-run"]', async () => {
  if (passRun.running || !passFor) return;
  if (!await primeAI()) return;

  const i = indexOfEl(passFor);
  if (i < 0) return;
  // The debounce may not have fired. Send the words that are on
  // screen, not the ones that were saved half a second ago.
  const live = document.querySelector(`[data-el="${passFor}"] .wr-text`);
  if (live) doc.elements[i].text = live.value;

  const job = passJobFor(i);
  if (!job || !job.speech.trim()) { render(); return; }

  passRun.running = true;
  passRun.error = '';
  passRun.result = null;
  passRun.status = 'Starting…';
  passRun.abort = new AbortController();
  render();

  let result = null;
  try {
    result = await AIm.dialoguePass({
      ...job,
      ask: passAsk(),
      context: BPm.blueprintContext()
    }, {
      signal: passRun.abort.signal,
      onStatus: (m) => {
        passRun.status = m;
        /* DOM only. A re-render here would rebuild the panel under
           the Stop button the user may be about to press. */
        const node = document.querySelector('.ai-inline .ai-status');
        if (node) node.textContent = m;
      }
    });
  } catch (err) {
    passRun.running = false;
    passRun.abort = null;
    passRun.status = '';
    passRun.error = (err && err.message) ? err.message : 'Something went wrong and nothing was changed.';
    render();
    return;
  }

  passRun.running = false;
  passRun.abort = null;
  passRun.status = result.options.length
    + (result.options.length === 1 ? ' version' : ' versions') + ' back. Nothing has changed yet.';
  passRun.result = result;
  render();
});

/* THE ONLY PLACE A MODEL'S WORDS REACH THE DOCUMENT, and it is a
   click on a button that says which version it is. It writes through
   persistNow() — the page's normal save path — and it keeps the
   user's own sentence in `aiPass.was` so Undo is exact rather than
   approximate. A second pass over an already-passed line keeps the
   FIRST original: Undo must always mean "back to what I wrote". */
delegate(document, 'click', '[data-action="pass-use"]', (e, btn) => {
  if (!passRun.result || !passFor) return;
  const n = Number(btn.dataset.option);
  const opt = passRun.result.options[n];
  if (!opt) return;
  const i = indexOfEl(passFor);
  if (i < 0) return;

  const el = doc.elements[i];
  el.aiPass = {
    at: new Date().toISOString(),
    model: passRun.result.model,
    was: el.aiPass ? el.aiPass.was : el.text
  };
  el.text = opt.text;

  persistNow();
  const id = passFor;
  passFor = null;
  passRun = blankPassRun();
  render(elFocus(id));
  say('Line replaced and marked. Undo puts your own words back.');
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

delegate(document, 'click', '[data-action="import-commit"]', () => {
  const plan = importPlan;
  if (!plan || importBusy) return;

  /* The last gate, and it names what is about to happen rather
     than asking "are you sure?". Only shown when something is
     actually being replaced — a confirm on a safe action is the
     dialog people learn to click through. */
  const losing = [];
  if (replaceScript && doc.elements.length) {
    losing.push(doc.elements.length + (doc.elements.length === 1 ? ' element' : ' elements') + ' of screenplay');
  }
  const existingScenes = Scenes.listScenes();
  if (replaceScenes && existingScenes.length) {
    losing.push(existingScenes.length + (existingScenes.length === 1 ? ' scene' : ' scenes'));
  }
  if (losing.length && !confirm(
    'Replace ' + losing.join(' and ') + '?\n\n'
    + (replaceScript && doc.elements.length
      ? 'A revision of the current screenplay is taken first, so it can be restored.\n\n'
      : '')
    + 'The scene list is not versioned — replacing it cannot be undone.'
  )) return;

  importBusy = true;

  // 1. the screenplay
  if (replaceScript && doc.elements.length) {
    doc.revisions.push(Script.makeRevision(doc.elements, 'Before importing ' + (importName || 'a script')));
  }
  const incoming = plan.elements.map((el) => blankElement({ type: el.type, text: el.text }));
  doc.elements = replaceScript ? incoming : doc.elements.concat(incoming);
  persistNow();

  // 2. the scene list
  let renumbered = 0;
  const taken = new Set(replaceScenes ? [] : existingScenes.map((s) => String(s.number)));
  const base = replaceScenes ? 0 : existingScenes.length;
  const rows = plan.scenes.map((s, i) => {
    let number = String(s.number || '');
    if (!number || taken.has(number)) { number = String(base + i + 1); renumbered++; }
    taken.add(number);
    return { ...s, number };
  });
  Scenes.saveScenes(replaceScenes ? rows : existingScenes.concat(rows));

  importOpen = false;
  resetImport();
  render();
  say('Imported ' + incoming.length + ' elements and ' + rows.length
    + (rows.length === 1 ? ' scene' : ' scenes')
    + (renumbered ? ' · ' + renumbered + ' renumbered to avoid a clash' : '')
    + '. The breakdown and the stripboard have them now.');
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

delegate(document, 'click', '[data-action="rev-restore"]', (e, btn) => {
  const id = idOf(btn, 'rev');
  const i = doc.revisions.findIndex((r) => r.id === id);
  if (i < 0) return;
  const rev = doc.revisions[i];
  const colour = revisionColour(i);
  // Restoring overwrites work that is on screen right now, so it asks —
  // and it says what it is about to throw away, in elements, because
  // "are you sure?" on its own tells nobody anything.
  const ok = confirm(
    `Restore the ${colour.name} revision — “${rev.name}”?\n\n`
    + `The screenplay on screen (${doc.elements.length} `
    + `${doc.elements.length === 1 ? 'element' : 'elements'}) is replaced by this `
    + `snapshot (${rev.elements.length} ${rev.elements.length === 1 ? 'element' : 'elements'}). `
    + 'Snapshot the current pages first if you want to keep them.'
  );
  if (!ok) return;
  doc.elements = Script.restoreElements(rev);
  persistNow();
  render();
});

delegate(document, 'click', '[data-action="rev-del"]', (e, btn) => {
  const id = idOf(btn, 'rev');
  const i = doc.revisions.findIndex((r) => r.id === id);
  if (i < 0 || i !== doc.revisions.length - 1) return;
  const colour = revisionColour(i);
  if (!confirm(`Withdraw the ${colour.name} revision — “${doc.revisions[i].name}”?\n\n`
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

delegate(document, 'click', '[data-action="doc-del"]', () => {
  const d = doc.documents.find((x) => x.id === openDocId);
  if (!d) return;
  if (!confirm(`Delete “${d.title || 'Untitled document'}”?\n\n`
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
  d.body = ta.value;
  d.updated = new Date().toISOString();
  refreshCounters();
  persist();
});

delegate(document, 'change', '[data-doc-field]', (e, el) => {
  const key = el.dataset.docField;
  const d = doc.documents.find((x) => x.id === openDocId);
  if (!d) return;
  d[key] = el.value;
  d.updated = new Date().toISOString();
  persistNow();
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
  if (err && (err.kind === 'aborted' || err.name === 'AbortError')) {
    genStatus = '';
    genError = 'Stopped. Everything already written is kept.';
    return;
  }
  genError = (err && err.message) || 'Something went wrong, and nothing was changed.';
  console.warn('[write] gen', err);
}

delegate(document, 'click', '[data-action="gen-open"]', async () => {
  if (await primeAI()) render();
});

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

delegate(document, 'click', '[data-action="gen-beats"]', async () => {
  if (genBusy) return;
  if (!await primeAI()) return;
  readGenForm();
  if (!gen.synopsis.trim()) {
    genError = 'Write a synopsis first — a paragraph is enough.';
    render();
    return;
  }
  genBegin();
  render();
  try {
    const res = await Scriptgen.runBeats(gen, { onStatus: genSay, signal: genAbort.signal });
    gen = res.job;
    genStatus = '';
    if (res.missing > 0) {
      genError = res.missing + ' of the fifteen beats came back empty. Fill them in '
        + 'by hand, or draft the beats again.';
    } else {
      say('Beat sheet drafted.');
    }
  } catch (err) { genFail(err); }
  genEnd();
  render();
});

delegate(document, 'click', '[data-action="gen-scenes"]', async () => {
  if (genBusy) return;
  if (!await primeAI()) return;
  readGenBeats();
  Scriptgen.save(gen);
  genBegin();
  render();
  try {
    const res = await Scriptgen.runScenes(gen, {
      onStatus: genSay, signal: genAbort.signal, replaceScenes: genReplaceScenes
    });
    gen = res.job;
    genStatus = '';
    say(res.scenes + ' scenes on the board. The breakdown and stripboard can read them now.');
  } catch (err) { genFail(err); }
  genEnd();
  render();
});

/* One batch, or all of them.

   `genAll` is checked at the TOP of every turn and cleared by Stop, so
   Stop ends the loop after at most the batch already in flight — which
   the AbortSignal cuts anyway. Reading a captured copy instead would
   keep the loop billing after the user asked it to stop, and that is
   the one failure this feature is not allowed to have. */
async function genRun(all) {
  if (genBusy) return;
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

delegate(document, 'click', '[data-action="gen-run-one"]', () => genRun(false));
delegate(document, 'click', '[data-action="gen-run-all"]', () => genRun(true));

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

render(wantsImporter ? '#wr-import-paste' : null);
mountFocusMode(() => doc);   // Phase 4: src/ui/focus-mode.js
