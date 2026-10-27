/* ============================================================
   DRAFTS — every saved copy of the screenplay, in one place
   ------------------------------------------------------------
   Read src/lib/drafts.js first: a draft is an entry of the script's
   own `revisions`, and "changed since the last draft" is derived.
   This page lists them newest first and does five things with them:

     Download PDF   typesets THAT draft's snapshot with the lazy
                    typesetter. Its header, date and sheets come from
                    the draft alone — never from today — so the same
                    draft prints the same PDF every time.
     Compare with…  the Compare panel of write-revisions.js, preset.
     Restore        the snapshot becomes the working copy, after a
                    confirmation that says what is lost.
     Save as new draft / Update current draft
     Title page     the same seven fields, and the same `titlePage`
                    inside the script blob, as write.html's Documents.

   NOTHING HERE WRITES ON A RENDER OR AN IDLE. Writes happen at a
   click, or 400ms after typing in a title-page field, through
   saveScript().
   ============================================================ */
import Store from '../lib/store.js';          /* FIRST — it patches Storage.prototype. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/write.css';
import '../styles/pdf.css';
import '../styles/drafts.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import * as Script from '../lib/script.js';
import * as Drafts from '../lib/drafts.js';
import { pageHeader, button, badge, emptyState } from '../ui/kit/index.js';
import { choiceDialog, installLeavePrompt } from '../ui/leave-prompt.js';
import { mountRevisionTools, renderCompareTool, renderRevisedPagesTool, renderNumberingTool, presetCompare } from '../ui/write-revisions.js';
import { subscribe, onWriteElsewhere, currentProjectId } from '../lib/store.js';
import { exportMeta as exportMetaOf } from '../lib/write-model.js';
import { formatPages, pageCount } from '../lib/script.js';
/* What this page says about the drafts: src/lib/screenplay-drafts-model.js. */
import { TITLE_LABELS, titlePlaceholder as titlePlaceholderFor } from '../lib/write-format.js';
import {
  draftStateText, titlePageStateText, draftMetaText, nextDraftName, restoreDialogSpec,
  draftPdfMeta, draftPdfTitles
} from '../lib/screenplay-drafts-model.js';

const app = document.getElementById('app');
const typesetter = () => import('../lib/screenplay-export.js');
const pdfLib = () => import('../lib/pdf.js');

/* THE PAGE'S COPY IS RE-READ BEFORE EVERY WRITE. It used to be read
   once at load, and every save wrote that copy back whole — so a title
   typed here, or "Save as new draft", put back a script the Writer (in
   another tab) or a synced copy had since moved on from (QA: the newer
   lines were lost, and the new draft was taken from the stale copy).
   Typed title-page fields wait in `tpPatch` and are laid over the fresh
   copy at the write. */
let doc = Script.loadScript();
let tpTimer = null;
let tpPatch = null;                 // { field: value } typed, not yet saved
const applyPatch = () => {
  if (!tpPatch) return;
  doc.titlePage = Script.normaliseTitlePage(doc.titlePage);
  Object.assign(doc.titlePage, tpPatch);
};
/** The stored script, with anything typed here and not yet saved. */
function reload() { doc = Script.loadScript(); applyPatch(); }
const save = () => { Script.saveScript(doc); };
/** Re-read, then write what is pending. Every action calls this first. */
function fresh() {
  clearTimeout(tpTimer); tpTimer = null;
  reload();
  if (tpPatch) { tpPatch = null; save(); }
}

const say = (m, type = 'info') => { try { StudioUI.toast(m, { type }); } catch (e) { /* no chrome yet */ } };

mountRevisionTools({
  getDoc: () => doc,
  persistNow: () => save(),
  render: () => render(),
  exportPDF: (extra) => exportRevisedPDF(extra)
});
const leave = installLeavePrompt({ getDoc: () => doc, persistNow: () => fresh() });
document.addEventListener('fms:drafts-changed', () => render());
/* A write elsewhere (the Writer in another tab, or a synced copy) is
   shown here; a title field being typed in keeps its focus and value. */
function onScriptElsewhere() {
  reload();
  const typing = document.activeElement && document.activeElement.matches && document.activeElement.matches('[data-tp-field]');
  if (typing) refreshState(); else renderKeeping();
}
/* The whole page is rebuilt on an arrival, and the Writer in another tab
   saves on every pause in typing — so a reader on the Compare select or
   a draft's button was dropped to <body> and moved up the page each time
   (QA r2). The control in use is found again by what names it (its id,
   else its tag and data- attributes) and the scroll put back. */
function focusKey(el) {
  if (!el || el === document.body || !el.closest || !el.closest('#main')) return null;
  if (el.id) return '#' + CSS.escape(el.id);
  const attrs = [...el.attributes].filter((x) => x.name.startsWith('data-') || x.name === 'name')
    .map((x) => '[' + x.name + '="' + CSS.escape(x.value) + '"]').join('');
  return attrs ? el.tagName.toLowerCase() + attrs : null;
}
function renderKeeping() {
  const key = focusKey(document.activeElement);
  const y = window.scrollY;
  render();
  window.scrollTo({ top: y, behavior: 'instant' });
  const back = key && document.querySelector(key);
  if (back && typeof back.focus === 'function') back.focus({ preventScroll: true });
}
onWriteElsewhere(['fms_script_v1'], onScriptElsewhere);
subscribe('cloud:synced', (p) => {
  if (!p || (p.projectId && p.projectId !== currentProjectId())) return;
  if (p.scope === 'script' || (Array.isArray(p.scopes) && p.scopes.includes('script'))) onScriptElsewhere();
});

/* ---- title page: the same fields and labels as write.js ---------- */
const titlePlaceholder = (f) => titlePlaceholderFor(f, Script.projectTitle());
function titlePageBlock() {
  const tp = Script.normaliseTitlePage(doc.titlePage);
  const control = (f) => {
    const el = f === 'contact'
      ? h('textarea.dr-contact', { rows: '3' })
      : h('input', { type: 'text', maxlength: '160' });
    el.setAttribute('data-tp-field', f);
    el.setAttribute('placeholder', titlePlaceholder(f));
    el.setAttribute('aria-label', 'Title page ' + TITLE_LABELS[f]);
    el.value = tp[f];
    return h('label.dr-field', {}, [h('span', { text: TITLE_LABELS[f] }), el]);
  };
  return h('section#title.dr-card', { 'aria-labelledby': 'dr-tp-h' }, [
    h('h2.dr-h', { id: 'dr-tp-h', text: 'Title Page' }),
    h('p.dr-sub', {
      'data-tp-state': '',
      text: titlePageStateText(Script.hasTitlePage(doc.titlePage))
    }),
    h('div.dr-grid', {}, Script.TITLE_FIELDS.map(control))
  ]);
}

delegate(document, 'input', '[data-tp-field]', (e, input) => {
  const f = input.dataset.tpField;
  if (!Script.TITLE_FIELDS.includes(f)) return;
  tpPatch = { ...(tpPatch || {}), [f]: input.value };
  applyPatch();
  clearTimeout(tpTimer);
  tpTimer = setTimeout(() => { fresh(); refreshState(); }, 400);
});

/* ---- the list ---------------------------------------------------- */
function row(d, isLatest) {
  const li = h('li.dr-row' + (isLatest ? '.is-current' : ''), { 'data-draft': d.id });
  li.append(
    h('span.dr-swatch.c-' + d.colour.swatch, { title: d.colour.name + ' revision colour', 'aria-hidden': 'true' }),
    h('div.dr-main', {}, [
      h('div.dr-name', {}, [
        h('strong', { text: d.label }),
        isLatest ? badge({ label: 'Current', tone: 'info', dot: true, class: 'dr-tag' }) : null,
        h('span.dr-colour', { text: d.colour.name })
      ]),
      h('div.dr-meta', { text: draftMetaText(d) }),
      d.note ? h('div.dr-note', { text: d.note }) : null
    ]),
    h('div.dr-acts', {}, [
      button({ label: 'Download PDF', size: 'sm', icon: 'picture_as_pdf', attrs: { 'data-dr': 'pdf', 'data-id': d.id } }),
      button({ label: 'Compare with…', size: 'sm', icon: 'rule', attrs: { 'data-dr': 'compare', 'data-id': d.id } }),
      button({ label: 'Restore as working copy', size: 'sm', icon: 'history', attrs: { 'data-dr': 'restore', 'data-id': d.id } })
    ])
  );
  return li;
}

const stateText = () => draftStateText(doc);
function refreshState() {
  const s = document.querySelector('[data-dr-state]');
  if (s) {
    s.textContent = stateText();
    s.classList.toggle('is-changed', Drafts.changedSinceDraft(doc));
  }
  const t = document.querySelector('[data-tp-state]');
  if (t) {
    t.textContent = titlePageStateText(Script.hasTitlePage(doc.titlePage));
  }
}

function render() {
  const main = h('main#main.dr-main.k-page');
  const hasProject = !!(Store.currentProject && Store.currentProject());
  main.append(pageHeader({
    class: 'bd-head',
    eyebrow: ['Screenplay', 'Drafts'],
    title: 'Drafts',
    sub: 'A draft is a copy of the script as it stood, with its title page. Save one when a pass is done; '
       + 'print it, compare it with the next, or go back to it. Your working copy is always kept as you type.'
  }));
  if (!hasProject) {
    /* #title is a nav target: it renders in every state (CLAUDE.md,
       "a nav target must not depend on data existing"). */
    /* Heading only: the NO PROJECT OPEN banner says the rest, once. */
    main.append(h('section#title.dr-card', {}, [h('h2.dr-h', { text: 'Title Page' })]));
    app.replaceChildren(main);
    mountShell();
    return;
  }

  const drafts = Drafts.listDrafts(doc);
  /* The current draft is the newest REAL one: a side copy the sync kept
     ("From another device") is listed but never Current (drafts.js). */
  const last = Drafts.latestDraft(doc);
  const next = nextDraftName(doc);

  main.append(h('div.dr-bar', {}, [
    button({ label: '← Back to Screenplay', href: 'screenplay.html', class: 'dr-back', variant: 'ghost' }),
    h('span.dr-state', { 'data-dr-state': '', 'aria-live': 'polite', text: stateText() }),
    h('span.dr-spacer'),
    button({ label: 'Save as new draft', variant: 'primary', icon: 'add', attrs: { 'data-dr': 'new' } }),
    button({ label: last ? 'Update ' + last.label : 'Update current draft', disabled: !last, attrs: { 'data-dr': 'update' } })
  ]));
  if (last) refreshStateClass(main);

  if (!drafts.length) {
    main.append(emptyState({ icon: 'history', class: 'dr-empty', title: 'No drafts yet.', body: '“Save as new draft” makes ' + next + ' from the script as it is now.' }));
  } else {
    main.append(h('ol.dr-list', { 'aria-label': 'Drafts, newest first' }, drafts.map((d) => row(d, !!last && d.id === last.id))));
  }

  main.append(h('div#dr-compare', {}, [renderCompareTool()]));
  main.append(h('div#dr-revised', {}, [renderRevisedPagesTool()].filter(Boolean)));
  /* The scene-number lock: the stripboard's "Manage numbering" lands
     here. Filtered — Element.append(null) prints "null". */
  main.append(h('div#numbering.dr-numbering', {}, [renderNumberingTool()].filter(Boolean)));
  main.append(titlePageBlock());
  app.replaceChildren(main);
  mountShell();
  try { StudioUI.autoAriaLabels(); } catch (e) { /* chrome */ }
}
function refreshStateClass(main) {
  const s = main.querySelector('[data-dr-state]');
  if (s && Drafts.changedSinceDraft(doc)) s.classList.add('is-changed');
}

/* ---- actions ----------------------------------------------------- */
delegate(document, 'click', '[data-dr="new"]', async () => {
  fresh();
  const name = nextDraftName(doc);
  const res = await choiceDialog({
    title: 'Save as ' + name,
    body: 'A copy of the script and its title page, as they are now.',
    field: 'A note, if you want one (optional)',
    choices: [{ id: 'go', label: 'Save as ' + name, primary: true }, { id: 'cancel', label: 'Cancel' }]
  });
  if (res.id !== 'go') return;
  fresh();   // the dialog took time: the script may have moved on
  const made = Drafts.saveNewDraft(doc, { note: res.value });
  save();
  say('Saved as ' + made.label + '.', 'success');
  render();
});

delegate(document, 'click', '[data-dr="update"]', async () => {
  fresh();
  const last = Drafts.latestDraft(doc);
  if (!last) return;
  const res = await choiceDialog({
    title: 'Update ' + last.label + '?',
    body: 'Its copy is replaced by the script as it is now. What it held before is not kept.',
    choices: [{ id: 'go', label: 'Update ' + last.label, primary: true }, { id: 'cancel', label: 'Cancel' }]
  });
  if (res.id !== 'go') return;
  fresh();
  Drafts.updateDraft(doc, last.id);
  save();
  say('Updated ' + last.label + '.', 'success');
  render();
});

delegate(document, 'click', '[data-dr="restore"]', async (e, btn) => {
  const id = btn.dataset.id;
  fresh();
  const d = Drafts.listDrafts(doc).find((x) => x.id === id);
  if (!d) return;
  const dirty = Drafts.changedSinceDraft(doc);
  const res = await choiceDialog(restoreDialogSpec(d, dirty, nextDraftName(doc)));
  if (res.id === 'cancel' || res.id === null) return;
  fresh();
  if (res.id === 'save') Drafts.saveNewDraft(doc);
  /* The Breakdown follows the restore, the way it follows a heading
     deleted in the Writer (QA: a scene the restored script no longer
     has stayed in the Breakdown). The baseline is the headings as they
     stood: a heading that survives relinks by its words (scene-sync
     rule 2), a gone one goes to the bin as a SCRIPT entry, so typing it
     again brings it back. */
  let Sync = null;   // loaded at the press: no first-paint cost here
  try { Sync = await import('../lib/scene-sync.js'); } catch (e) { console.warn('[drafts] scene sync', e); }
  fresh();
  const prev = Sync ? Sync.headingMap(doc.elements) : null;
  Drafts.restoreDraft(doc, id);
  save();
  let binned = 0;
  try {
    const r = Sync ? Sync.syncScript(doc.elements, { prev, numbering: doc.numbering }) : null;
    binned = (r && r.result && r.result.binned.length) || 0;
  } catch (e) { console.warn('[drafts] scene sync', e); }
  say('Restored ' + d.label + ' as the working copy.'
    + (binned ? ' ' + binned + (binned === 1 ? ' scene it does not have went' : ' scenes it does not have went') + ' to the Breakdown’s bin.' : ''), 'success');
  render();
});

delegate(document, 'click', '[data-dr="compare"]', (e, btn) => {
  presetCompare(btn.dataset.id);
  const box = document.getElementById('dr-compare');
  if (!box) return;
  box.replaceChildren(renderCompareTool());
  const sel = box.querySelector('#wr-cmp-to');
  box.scrollIntoView({ block: 'start' });
  if (sel) sel.focus({ preventScroll: true });
});

delegate(document, 'click', '[data-dr="pdf"]', async (e, btn) => {
  const d = Drafts.listDrafts(doc).find((x) => x.id === btn.dataset.id);
  const snap = d && Drafts.draftDocument(doc, d.id);
  if (!snap) return;
  if (!snap.elements.length) { say('That draft is empty — nothing to print.'); return; }
  const main = document.getElementById('main');
  let Typeset, PDF;
  try { [Typeset, PDF] = [await typesetter(), (await pdfLib()).default]; }
  catch (err) { say('The typesetter could not be loaded. Check the connection and try again.', 'error'); return; }
  /* Everything below comes from the draft, nothing from the clock: the
     same draft, the same sheets. */
  const meta = draftPdfMeta(d, Script.projectTitle());
  const titles = draftPdfTitles(d, Script.projectTitle());
  let node = null;
  /* A draft saved under locked numbers prints them in both margins, on
     the wide setup, like the revised pages below (QA r3). */
  const numbered = Script.isNumberingLocked(snap.numbering);
  PDF.exportPDF({
    scope: 'screenplay',
    ...(numbered ? { setup: 'screenplay-wide', classes: ['pdf-sn'] } : {}),
    title: titles.title,
    subtitle: titles.subtitle,
    before: () => { node = Typeset.buildDocument(snap, { ...meta, sceneNumbers: numbered }); main.append(node); },
    after: () => { if (node) { node.remove(); node = null; } }
  });
});

/* Revised pages: the working copy, an asterisk beside every line changed
   since the chosen draft (write-revisions.js works out `extra.marks`).
   The marks sit in the right margin, so it takes the wide setup the
   scene numbers use, as write.html did. */
async function exportRevisedPDF(extra = {}) {
  if (!doc.elements.length) { say('Nothing to export yet — write a line first.'); return; }
  const main = document.getElementById('main');
  if (!main) return;
  let Typeset, PDF;
  try { [Typeset, PDF] = [await typesetter(), (await pdfLib()).default]; }
  catch (err) { say('The typesetter could not be loaded. Check the connection and try again.', 'error'); return; }
  const meta = exportMetaOf(doc, Script.projectTitle());
  let node = null;
  PDF.exportPDF({
    scope: 'screenplay',
    setup: 'screenplay-wide',
    classes: ['pdf-sn', 'pdf-revmarks'],
    title: Script.projectTitle() + ' — Screenplay',
    subtitle: [meta.revision, formatPages(pageCount(doc.elements)) + ' pages', extra.note].filter(Boolean).join(' · '),
    before: () => {
      node = Typeset.buildDocument(doc, { ...meta, sceneNumbers: Script.isNumberingLocked(doc.numbering), marks: extra.marks });
      main.append(node);
    },
    after: () => { if (node) { node.remove(); node = null; } }
  });
}

render();
