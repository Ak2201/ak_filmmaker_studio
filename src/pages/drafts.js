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
import { mountRevisionTools, renderCompareTool, presetCompare } from '../ui/write-revisions.js';
/* What this page says about the drafts: src/lib/screenplay-drafts-model.js. */
import { TITLE_LABELS, titlePlaceholder as titlePlaceholderFor } from '../lib/write-format.js';
import {
  draftStateText, titlePageStateText, draftMetaText, nextDraftName, restoreDialogSpec,
  draftPdfMeta, draftPdfTitles
} from '../lib/screenplay-drafts-model.js';

const app = document.getElementById('app');
const typesetter = () => import('../lib/screenplay-export.js');
const pdfLib = () => import('../lib/pdf.js');

let doc = Script.loadScript();
const save = () => { Script.saveScript(doc); };
let tpTimer = null;

const say = (m, type = 'info') => { try { StudioUI.toast(m, { type }); } catch (e) { /* no chrome yet */ } };

mountRevisionTools({
  getDoc: () => doc,
  persistNow: () => save(),
  render: () => render(),
  exportPDF: () => {}
});
const leave = installLeavePrompt({ getDoc: () => doc, persistNow: () => { clearTimeout(tpTimer); save(); } });
document.addEventListener('fms:drafts-changed', () => render());

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
  doc.titlePage = Script.normaliseTitlePage(doc.titlePage);
  doc.titlePage[f] = input.value;
  clearTimeout(tpTimer);
  tpTimer = setTimeout(() => { tpTimer = null; save(); refreshState(); }, 400);
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
  const main = h('main#main.dr-main');
  const hasProject = !!(Store.currentProject && Store.currentProject());
  main.append(pageHeader({
    class: 'bd-head',
    eyebrow: ['Screenplay', 'Drafts'],
    title: 'Drafts.',
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
  const last = drafts[0] || null;
  const next = nextDraftName(doc);

  main.append(h('div.dr-bar', {}, [
    button({ label: 'Back to the Screenplay Writer', href: 'screenplay.html', class: 'dr-back', variant: 'ghost' }),
    h('span.dr-state', { 'data-dr-state': '', 'aria-live': 'polite', text: stateText() }),
    h('span.dr-spacer'),
    button({ label: 'Save as new draft', variant: 'primary', icon: 'add', attrs: { 'data-dr': 'new' } }),
    button({ label: last ? 'Update ' + last.label : 'Update current draft', disabled: !last, attrs: { 'data-dr': 'update' } })
  ]));
  if (last) refreshStateClass(main);

  if (!drafts.length) {
    main.append(emptyState({ icon: 'history', class: 'dr-empty', title: 'No drafts yet.', body: '“Save as new draft” makes ' + next + ' from the script as it is now.' }));
  } else {
    main.append(h('ol.dr-list', { 'aria-label': 'Drafts, newest first' }, drafts.map((d, i) => row(d, i === 0))));
  }

  main.append(h('div#dr-compare', {}, [renderCompareTool()]));
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
  save();
  const name = nextDraftName(doc);
  const res = await choiceDialog({
    title: 'Save as ' + name,
    body: 'A copy of the script and its title page, as they are now.',
    field: 'A note, if you want one (optional)',
    choices: [{ id: 'go', label: 'Save as ' + name, primary: true }, { id: 'cancel', label: 'Cancel' }]
  });
  if (res.id !== 'go') return;
  const made = Drafts.saveNewDraft(doc, { note: res.value });
  save();
  say('Saved as ' + made.label + '.', 'success');
  render();
});

delegate(document, 'click', '[data-dr="update"]', async () => {
  const last = Drafts.latestDraft(doc);
  if (!last) return;
  save();
  const res = await choiceDialog({
    title: 'Update ' + last.label + '?',
    body: 'Its copy is replaced by the script as it is now. What it held before is not kept.',
    choices: [{ id: 'go', label: 'Update ' + last.label, primary: true }, { id: 'cancel', label: 'Cancel' }]
  });
  if (res.id !== 'go') return;
  Drafts.updateDraft(doc, last.id);
  save();
  say('Updated ' + last.label + '.', 'success');
  render();
});

delegate(document, 'click', '[data-dr="restore"]', async (e, btn) => {
  const id = btn.dataset.id;
  const d = Drafts.listDrafts(doc).find((x) => x.id === id);
  if (!d) return;
  save();
  const dirty = Drafts.changedSinceDraft(doc);
  const res = await choiceDialog(restoreDialogSpec(d, dirty, nextDraftName(doc)));
  if (res.id === 'cancel' || res.id === null) return;
  if (res.id === 'save') Drafts.saveNewDraft(doc);
  Drafts.restoreDraft(doc, id);
  save();
  say('Restored ' + d.label + ' as the working copy.', 'success');
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
  PDF.exportPDF({
    scope: 'screenplay',
    title: titles.title,
    subtitle: titles.subtitle,
    before: () => { node = Typeset.buildDocument(snap, meta); main.append(node); },
    after: () => { if (node) { node.remove(); node = null; } }
  });
});

render();
