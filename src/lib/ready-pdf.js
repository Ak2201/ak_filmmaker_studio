/* ============================================================
   THE READY-TO-SHOOT PAGE, AS PDF
   ------------------------------------------------------------
   Lazy: preprod.js imports this only when someone presses the button,
   so the page's first paint carries none of it. It collects what the
   models already hold, hands it to the pure src/lib/ready-sheet.js,
   draws the result as one A4 page and prints it through lib/pdf.js —
   the same print pipeline every other document in the studio uses
   (live text, real pagination, plan check, one job at a time), the same
   way invoice-pdf.js does it: one element appended to <body> for the
   length of the job, everything else stepping aside in print
   (styles/path-bar.css has the rules).

   It READS. Nothing is stored, nothing written, no new key; the file
   name comes from the project's title.
   ============================================================ */
import { h } from './dom.js';
import { exportPDF, projectTitle } from './pdf.js';
import { readiness } from './readiness.js';
import Scenes from './scenes.js';
import Locations from './locations.js';
import * as Costs from './costs.js';
import { readySheet } from './ready-sheet.js';

const today = () => new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

/** The budget the estimator holds, or null when it holds nothing. The
    top sheet's grand total is the figure: estimate plus contingency. */
function budgetOf() {
  try {
    const lines = Costs.estimateLines(Costs.readCalc(), Costs.readAll().lines);
    if (!lines.length) return null;
    const report = Costs.costReport({ lines, contingencyPct: Costs.getSettings().contingencyPct });
    const ts = Costs.topSheet(report);
    return ts.grand > 0 ? { total: ts.grand, contingencyPct: ts.contingencyPct, currency: Costs.budgetCurrency() } : null;
  } catch (e) { return null; }
}

/** Gather the inputs from the models. Each read is guarded: a model that
    cannot be read leaves its block out rather than the page blank. */
export function collect() {
  let scenes = [];
  try { scenes = Scenes.listScenes(); } catch (e) { scenes = []; }
  let report = { checks: [], blockers: 0, gaps: 0, ready: false, hasFilm: false };
  try { report = readiness(); } catch (e) { console.warn('[ready-pdf] readiness', e); }
  let days = [], locations = [], unscheduled = 0;
  try { days = Locations.calendarDays(scenes); } catch (e) { days = []; }
  try { locations = Locations.locationIndex(scenes); } catch (e) { locations = []; }
  try { unscheduled = Locations.unscheduledScenes(scenes).length; } catch (e) { unscheduled = 0; }
  return readySheet({ title: projectTitle(), report, days, unscheduled, budget: budgetOf(), locations, asOf: today() });
}

/* ---- the page ---------------------------------------------------- */
const MARK = { blocker: 'BLOCKER', gap: 'GAP' };

export function buildDoc(sheet) {
  const doc = h('div.rd-doc', { role: 'document', 'aria-label': 'Ready to shoot: ' + sheet.title });
  doc.append(h('header.rd-head', {}, [
    h('div', {}, [h('p.rd-kind', { text: 'Ready to shoot' }), h('h1', { text: sheet.title })]),
    h('p.rd-asof', { text: sheet.asOf })
  ]));
  doc.append(h('p.rd-verdict', { text: sheet.verdict }));
  if (!sheet.hasFilm) return doc;

  if (sheet.attention.length) {
    doc.append(h('h2', { text: 'Needs attention' }));
    const ul = h('ul.rd-attn');
    sheet.attention.forEach((a) => {
      ul.append(h('li', {}, [
        h('span.rd-tag.is-' + a.severity, { text: MARK[a.severity] || 'GAP' }),
        h('span', {}, [
          h('strong', { text: a.label + (a.count ? ' (' + a.count + ')' : '') }),
          a.items.length ? h('span.rd-items', { text: ' — ' + a.items.join('; ') + (a.more ? '; and ' + a.more + ' more' : '') }) : null
        ].filter(Boolean))
      ]));
    });
    if (sheet.attentionMore) ul.append(h('li.rd-more', { text: 'And ' + sheet.attentionMore + ' more.' }));
    doc.append(ul);
  }
  if (sheet.passed.length) {
    doc.append(h('p.rd-passed', {}, [
      h('strong', { text: sheet.passed.length + (sheet.passed.length === 1 ? ' check passes: ' : ' checks pass: ') }),
      sheet.passed.join('; ') + '.'
    ]));
  }

  const sc = sheet.schedule;
  doc.append(h('h2', { text: 'Shoot days' }));
  if (!sc.totalDays) {
    doc.append(h('p.rd-note', { text: 'No scene is on a shoot day yet.' + (sc.unscheduled ? ' ' + sc.unscheduled + ' unscheduled.' : '') }));
  } else {
    doc.append(h('p.rd-note', {
      text: sc.totalDays + (sc.totalDays === 1 ? ' day' : ' days') + ', ' + sc.dated + ' dated'
        + (sc.unscheduled ? ' · ' + sc.unscheduled + (sc.unscheduled === 1 ? ' scene' : ' scenes') + ' not on a day' : '')
    }));
    const table = h('table.rd-days');
    table.append(h('thead', {}, [h('tr', {}, ['Day', 'Date', 'Scenes', 'Pages', 'Where'].map((t) => h('th', { scope: 'col', text: t })))]));
    const body = h('tbody');
    sc.rows.forEach((r) => body.append(h('tr', {}, [
      h('td', { text: String(r.day) }),
      h('td', { text: r.date || 'No date' }),
      h('td', { text: String(r.scenes) }),
      h('td', { text: r.pages }),
      h('td', { text: r.places })
    ])));
    table.append(body);
    doc.append(table);
    if (sc.more) doc.append(h('p.rd-note', { text: 'And ' + sc.more + ' more ' + (sc.more === 1 ? 'day' : 'days') + '.' }));
  }

  if (sheet.budget) {
    doc.append(h('h2', { text: 'Budget' }), h('p.rd-budget', {}, [
      h('strong', { text: sheet.budget.total }),
      ' — the estimate' + (sheet.budget.contingencyPct ? ' including ' + sheet.budget.contingencyPct + '% contingency' : '') + '.'
    ]));
  }

  if (sheet.permissions.total) {
    doc.append(h('h2', { text: 'Permissions still open' }));
    const ul = h('ul.rd-perms');
    sheet.permissions.rows.forEach((p) => ul.append(h('li', {}, [h('strong', { text: p.name }), ' — ' + p.status])));
    if (sheet.permissions.more) ul.append(h('li.rd-more', { text: 'And ' + sheet.permissions.more + ' more.' }));
    doc.append(ul);
  }
  return doc;
}

/** A filename-safe slug of the project title; letters of any script are kept. */
export function slug(s) {
  const out = String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return out || 'film';
}

/** Draw the page and open the print dialog on it. false when the plan
    check or another print job stood in the way. */
export function exportReadyPDF() {
  const sheet = collect();
  const doc = buildDoc(sheet);
  return exportPDF({
    scope: 'ready',
    setup: 'sheet',
    label: 'Ready to shoot',
    masthead: false,
    title: slug(sheet.title) + '-ready-to-shoot',
    before: () => document.body.append(doc),
    after: () => doc.remove()
  });
}

export default { exportReadyPDF, collect, buildDoc, slug };
