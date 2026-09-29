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
   in-memory element and the derived counters and stops there; only
   structural change (add, delete, reorder, restore) rebuilds.
   ============================================================ */
import '../lib/store.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/write.css';
import '../styles/pdf.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { actionMenu, wireActionBar } from '../ui/actionbar.js';
import { h, delegate } from '../lib/dom.js';
import PDF from '../lib/pdf.js';
import Scenes from '../lib/scenes.js';
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
let importBusy = false;
let replaceScript = false;
let replaceScenes = false;

/* ---- persistence ------------------------------------------- */
const SAVE_DELAY = 500;
let saveTimer = null;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; Script.saveScript(doc); }, SAVE_DELAY);
}
function persistNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  Script.saveScript(doc);
}
// A debounced keystroke that has not landed yet must not be lost to a
// tab close. `pagehide` fires where `unload` is unreliable on mobile.
addEventListener('pagehide', () => { if (saveTimer) persistNow(); });
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && saveTimer) persistNow();
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

  row.append(
    sel,
    ta,
    h('div.wr-el-acts', {}, [
      iconBtn('↑', 'el-up', 'Move up', i === 0),
      iconBtn('↓', 'el-down', 'Move down', i === total - 1),
      iconBtn('✕', 'el-del', 'Delete element', false, true)
    ])
  );
  return row;
}

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

  const page = h('div.wr-page', { id: 'wr-page' });
  doc.elements.forEach((el, i) => page.append(renderElement(el, i, doc.elements.length)));
  section.append(page, h('button.btn.primary.wr-add', {
    type: 'button', 'data-action': 'el-add', text: '+  Add element'
  }));
  return section;
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
        + 'Fountain (.fountain), a plain screenplay (.txt) and Final Draft (.fdx) all work.'
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
    accept: '.fountain,.spmd,.txt,.fdx,.xml,text/plain',
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
  const fmt = plan.format === 'fdx' ? 'Final Draft'
    : plan.format === 'text' ? 'screenplay text' : 'Fountain';

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
  main.append(renderHeader(), renderScreenplay(), renderRevisions(), renderDocuments());
  app.replaceChildren(main);
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
  const node = document.querySelector(sel);
  if (!node) return;
  node.focus();
  if (typeof node.setSelectionRange === 'function' && typeof node.value === 'string') {
    try { node.setSelectionRange(node.value.length, node.value.length); } catch (e) { /* select */ }
  }
}
const elFocus = (id) => `[data-el="${id}"] .wr-text`;

/** Grow a textarea to its content. DOM only — never touches storage. */
function autosize(ta) {
  ta.style.height = 'auto';
  // `scrollHeight` is the CONTENT box; the element is border-box, so
  // assigning it directly loses the two border pixels and every block
  // renders two pixels short of its own text. Add the frame back.
  const frame = ta.offsetHeight - ta.clientHeight;
  ta.style.height = (ta.scrollHeight + frame) + 'px';
}

/* The elements are `overflow: hidden`, so a height measured against the
   wrong font clips the text and there is no scrollbar to say so. The
   script face is a webfont: the first measurement happens before it
   arrives, every line then gets wider, and a four-line action block
   renders as three. So measure again once the fonts are in, and again
   whenever the column changes width — the indents are percentages, so a
   resize genuinely does change how many lines a block takes. */
function autosizeAll() {
  document.querySelectorAll('.wr-text').forEach(autosize);
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(autosizeAll).catch(() => {});
}
let resizeFrame = 0;
addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(autosizeAll);
});

/** Re-derive every number on the page. DOM only, and deliberately so:
    if this wrote, typing would save, saving would refresh, and we would
    be back at the 400ms loop the idle assertion exists to catch. */
function refreshCounters() {
  const pages = pageCount(doc.elements);
  const set = (name, value) => {
    document.querySelectorAll(`[data-count="${name}"]`)
      .forEach((n) => { n.textContent = value; });
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

/* ---- screenplay: structure --------------------------------- */
function addElement(after, type) {
  const el = blankElement({ type });
  const at = after === null ? doc.elements.length : after + 1;
  doc.elements.splice(at, 0, el);
  persistNow();
  render(elFocus(el.id));
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
  render(elFocus(id));
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
  doc.elements.splice(i, 1);
  persistNow();
  const neighbour = doc.elements[i] || doc.elements[i - 1];
  render(neighbour ? elFocus(neighbour.id) : null);
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
  doc.elements.splice(i, 1);
  persistNow();
  const neighbour = doc.elements[i - 1] || doc.elements[i];
  render(neighbour ? elFocus(neighbour.id) : null);
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
  let text;
  try { text = await Parser.readFile(file); }
  catch (err) { say('That file could not be read.'); return; }
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
  let Parser;
  try { Parser = await importer(); } catch (err) { say('The script parser could not be loaded.'); return; }
  let text;
  try { text = await Parser.readFile(file); }
  catch (err) { say('That file could not be read.'); return; }
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

render();
