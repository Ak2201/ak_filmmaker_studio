/* ============================================================
   SCRIPT PRODUCTION UI — Fit to page and the writer's reports
   ------------------------------------------------------------
   Two sheets the Screenplay Writer opens from its File menu, loaded at
   the press (screenplay.js imports this dynamically), so the editor's
   first paint carries none of it.

   · FIT TO PAGE shows what each bounded cheat (src/lib/fit-page.js)
     does to the page count, previews one as a PDF and keeps one as the
     export setting. It never changes a word: the caller paginates the
     same elements with a taller body.
   · REPORTS lists the scenes (number, heading, page, length in
     eighths), the locations and the characters, read off the printed
     pages (src/lib/script-production.js), and prints them through the
     one PDF path (pdf.js) on the --print-* tokens.

   Nothing here writes to storage itself: the fit choice goes back
   through the caller's `save`, on a press.
   ============================================================ */
import '../styles/script-production.css';
import { h } from '../lib/dom.js';
import { button, sheet, closeSheet } from './kit/index.js';
import PDF from '../lib/pdf.js';
import Script from '../lib/script.js';
import { paginateDoc, pageNumbersDoc, BODY_LINES } from '../lib/screenplay-export.js';
import { fitOptions, bestFit, describeCheat, normaliseCheat } from '../lib/fit-page.js';
import { sceneReport, locationReport, characterReport } from '../lib/script-production.js';
import { scrollBox, th, td } from './script-reports.js';

const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

/* ---- FIT TO PAGE ------------------------------------------------ */
/**
 * opts: { getDoc, current (0..4), save(n), preview(n), say, returnTo }
 */
export function openFitPage(opts) {
  const doc = opts.getDoc();
  const options = fitOptions((body) => paginateDoc(doc, { bodyLines: body }).length, BODY_LINES);
  const best = bestFit(options);
  let chosen = normaliseCheat(opts.current);

  const name = 'scf-cheat';
  const rows = options.map((o) => {
    const id = 'scf-opt-' + o.lines;
    const input = h('input', { type: 'radio', name, id, value: String(o.lines) });
    input.checked = o.lines === chosen;
    input.addEventListener('change', () => { if (input.checked) { chosen = o.lines; paintNote(); } });
    return h('label.scf-row', { for: id }, [
      input,
      h('span.scf-what', { text: o.lines ? '+' + plural(o.lines, 'line') + ' a page' : 'Standard page' }),
      h('span.scf-pages', { text: plural(o.pages, 'page') }),
      h('span.scf-saved', { text: o.saved > 0 ? '−' + o.saved : '—', 'aria-label': o.saved > 0 ? plural(o.saved, 'page') + ' saved' : 'nothing saved' })
    ]);
  });
  const note = h('p.scf-note', { role: 'status' });
  function paintNote() { note.textContent = describeCheat(options[chosen].geometry); }
  paintNote();

  const lead = best && best.saved > 0
    ? 'The script prints on ' + plural(options[0].pages, 'page') + '. A cheat of ' + plural(best.lines, 'line') + ' a page brings it to ' + plural(best.pages, 'page') + '.'
    : 'The script prints on ' + plural(options[0].pages, 'page') + '. No cheat within the safe limits saves a page here.';

  const body = h('div.scf', {}, [
    h('p.scf-lead', { text: lead }),
    h('p.scf-limits', { text: 'Within industry-safe limits: at most 0.25in off the top and bottom margins and one extra line of spacing a page. The words never change; this is an export setting for the PDF.' }),
    h('fieldset.scf-list', {}, [h('legend', { text: 'Lines added to each page' }), ...rows]),
    note,
    h('div.scf-actions', {}, [
      button({ label: 'Preview PDF', icon: 'picture_as_pdf', attrs: { 'data-scf': 'preview' } }),
      button({ label: 'Use for export', variant: 'primary', attrs: { 'data-scf': 'use' } })
    ])
  ]);
  body.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-scf]');
    if (!b) return;
    const n = chosen;
    if (b.dataset.scf === 'preview') { closeSheet().then(() => opts.preview(n)); return; }
    opts.save(n);
    closeSheet().then(() => opts.say(n
      ? 'The PDF fits ' + plural(n, 'more line') + ' a page: ' + plural(options[n].pages, 'page') + '.'
      : 'The PDF uses the standard page again.'));
  });
  return sheet({ title: 'Fit to page', body, kind: 'sc-fit', returnTo: opts.returnTo });
}

/* ---- REPORTS ---------------------------------------------------- */
function reportsOf(doc, autoContd) {
  const pages = paginateDoc(doc, { autoContd: autoContd === true });
  const labels = pageNumbersDoc(doc, pages);
  const scenes = sceneReport(pages, labels, BODY_LINES);
  return { scenes, locations: locationReport(scenes), characters: characterReport(pages, labels) };
}

function table(caption, heads, rows) {
  return h('table.scr-table', {}, [
    h('caption', { text: caption }),
    h('thead', {}, [h('tr', {}, heads.map(([t, c]) => th(t, c)))]),
    h('tbody', {}, rows.map((cells) => h('tr', {}, cells.map(([t, c]) => td(t, c)))))
  ]);
}

function sceneTable(r) {
  return table('Scene report', [['Sc.', 'scr-num'], ['Heading'], ['Page', 'scr-num'], ['Length', 'scr-num'], ['Speaking']],
    r.scenes.map((s) => [[s.number, 'scr-num'], [s.heading], [s.page, 'scr-num'], [s.length, 'scr-num'], [s.cast.join(', ') || '—']]));
}
function locationTable(r) {
  return table('Location report', [['Location'], ['Int/Ext'], ['Time'], ['Scenes', 'scr-num'], ['Scene numbers'], ['Length', 'scr-num']],
    r.locations.map((l) => [[l.place], [l.ie.join(', ') || '—'], [l.times.join(', ') || '—'], [String(l.scenes), 'scr-num'], [l.numbers.join(', ') || '—'], [l.length, 'scr-num']]));
}
function characterTable(r) {
  return table('Character report', [['Character'], ['Scenes', 'scr-num'], ['Speeches', 'scr-num'], ['Pages', 'scr-num'], ['First page', 'scr-num']],
    r.characters.map((c) => [[c.name], [String(c.scenes), 'scr-num'], [String(c.speeches), 'scr-num'], [String(c.pages), 'scr-num'], [c.firstPage, 'scr-num']]));
}

/**
 * opts: { getDoc, autoContd, say, returnTo }
 */
export function openReports(opts) {
  const r = reportsOf(opts.getDoc(), opts.autoContd);
  const facts = plural(r.scenes.length, 'scene') + ' · ' + plural(r.locations.length, 'location') + ' · ' + plural(r.characters.length, 'speaking part');
  const body = h('div.scr', {}, [
    h('p.scr-lead', { text: facts + '. Pages and lengths are the ones the PDF prints.' }),
    scrollBox(sceneTable(r)),
    scrollBox(locationTable(r)),
    scrollBox(characterTable(r)),
    h('div.scr-actions', {}, [button({ label: 'Print reports', icon: 'print', variant: 'primary', attrs: { 'data-scr': 'print' } })])
  ]);
  body.addEventListener('click', (e) => {
    if (!(e.target.closest && e.target.closest('[data-scr="print"]'))) return;
    closeSheet().then(() => printReports(opts));
  });
  return sheet({ title: 'Reports', body, kind: 'sc-reports', returnTo: opts.returnTo });
}

/** The three reports as one printed document, through pdf.js. Built
    fresh for the job and removed after it (one representation per thing). */
export function printReports(opts) {
  const main = document.getElementById('main');
  if (!main) return false;
  const r = reportsOf(opts.getDoc(), opts.autoContd);
  let node = null;
  return PDF.exportPDF({
    scope: 'reports',
    label: 'Script reports',
    classes: ['pdf-scr'],
    title: Script.projectTitle() + ' — Script reports',
    subtitle: plural(r.scenes.length, 'scene'),
    before: () => {
      node = h('div.scr-print', {}, [sceneTable(r), locationTable(r), characterTable(r)]);
      main.append(node);
    },
    after: () => { if (node) { node.remove(); node = null; } }
  });
}

export default { openFitPage, openReports, printReports };
