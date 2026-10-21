/* ============================================================
   BUDGET — the page
   ------------------------------------------------------------
   The estimator used to be the last block on the craft library,
   reached by a navigation entry pointing at `library.html#calculator`
   — an anchor that has never existed in this app. Budget is a PLAN
   module, not a reference one, so it gets a page.

   The page is thin on purpose: src/ui/budget.js owns the estimator,
   and this file frames it. The rate tables stay in the library,
   which is where reference material belongs; a link goes each way so
   neither is a dead end.

   THE LOOK is the Swiss kit (src/ui/kit/, docs/DESIGN-KIT.md): a
   kit page header, a stat strip of real figures, kit panels. Nothing
   on this page is a sample figure; a number that cannot be measured
   is not drawn.
   ============================================================ */
import '../lib/store.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/budget.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h } from '../lib/dom.js';
import { renderBudget, initBudget } from '../ui/budget.js';
import { costSections, costKpis, costAside, initCosts } from '../ui/budget-costs.js';
import { pageHeader, button, notice } from '../ui/kit/index.js';
import { rateProvenance, rateSources, cardNote, budgetCurrency } from '../lib/budget-model.js';
import { isDisabledEverywhere } from '../lib/plan-gate.js';

const app = document.getElementById('app');

/* rateProvenance() — the counted provenance line — is src/lib/budget-model.js's. */

function render() {
  const main = h('main#main.hue-plan');
  /* A budget in US dollars (budgetCurrency(), the rule in costs.js)
     reads US rental figures instead of the Chennai card; a rupee
     budget's words are exactly what they were. */
  const usd = budgetCurrency() === 'USD';

  /* THE HEAD is the kit's page header (eyebrow, Space Grotesk title,
     deck, standing actions on the right) wearing `bd-head` as well:
     that class is the module column every page shares AND the host the
     blueprint pill looks for (blueprint-drawer.js), which lands after
     the `.bd-eyebrow` it finds. Export CSV is the budget file (the same
     builder as the Export tab's button). Versions is a tab of its own,
     so it is not repeated up here. New cost line reaches the estimator's own add-row
     action, so there is one way to add a line. */
  const head = pageHeader({
    class: 'bd-head bd-head-split',
    eyebrow: 'Budget & People · what it costs',
    title: 'Budget',
    sub: 'A line-item estimate that reads your schedule. Days come from the '
       + 'stripboard if you have built one, rates from the '
       + (usd ? 'US rental list prices' : 'Chennai tables') + ' if '
       + 'you want them, and every figure stays editable. Then, once you are '
       + 'shooting: petty cash, crew payments and the cost report against it.',
    actions: [
      button({ label: 'Export CSV', icon: 'download', attrs: { 'data-cx': 'csv-budget' } }),
      button({ label: 'New cost line', icon: 'add', variant: 'primary', pill: true, action: 'add-row' })
    ]
  });
  const eb = head.querySelector('.k-eyebrow');
  if (eb) eb.classList.add('bd-eyebrow');
  main.append(head);
  main.append(costKpis());

  /* TABS (src/ui/tabs.js, budget is on its list). The estimator and
     its notes are the first tab, `#estimate`; the cost tabs after it
     are views of src/lib/costs.js. Every section stays in the DOM —
     a hidden tab is reached by its hash, and the gate still reads
     every word in it. */
  const body = h('div.bd-list');
  const estimate = h('section#estimate.cx-sec', { 'data-tab-label': 'Estimate' });

  /* The rate tables did not move. Saying so, with a route, is the
     difference between "this page is thin" and "the reference is
     one click away". A kit notice; `.bd-notes` kept as its name. */
  const notes = notice({
    tone: 'info',
    class: 'bd-notes',
    title: 'Where the numbers come from',
    body: h('div', {}, [
      h('p', { text: rateProvenance(usd ? 'USD' : 'INR') }),
      /* THE SOURCES, by name and link, with the day each was read.
         rateProvenance() counts; this says who. Read from
         rates.chennai.checks.json, never typed here. The Chennai sources
         are rupee figures, so a dollar budget does not list them. */
      usd ? null : h('ul.bud-sources', {}, [
        h('li', { text: 'The 2024-25 card (every line marked "indicative"): ' + cardNote() }),
        ...rateSources().map((s) => h('li', {}, [
          h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.name }),
          ' — ' + s.kind + (s.place ? ', ' + s.place : '') + '. Read on ' + s.checked
            + (s.checkedRows ? ' for ' + s.checkedRows + ' checked figure' + (s.checkedRows === 1 ? '' : 's') : '')
            + (s.corroborating ? (s.checkedRows ? ' and ' : ' for ') + s.corroborating + ' comparison figure' + (s.corroborating === 1 ? '' : 's') + ', not used as a rate' : '')
            + '. ' + (s.note || '')
        ]))
      ]),
      h('p', {}, [
        usd ? 'The Chennai rate tables, in rupees and for reference only, are in the '
            : 'The full rate tables — camera, crew, post, equipment — are in the ',
        h('a', { href: 'library.html#equipment', text: 'craft library' }),
        '. Shoot days come from the ',
        h('a', { href: 'stripboard.html#stripboard', text: 'stripboard' }),
        ', which reads the scenes you broke down in the ',
        h('a', { href: 'breakdown.html#scenes', text: 'breakdown' }),
        '.'
      ])
    ])
  });
  /* The banner points at the Library's equipment rates (module 'library').
     When that module is switched off for everybody it points at nothing, so it is hidden —
     [hidden], never removed (the gate reads its words). The plan state
     arrives after first paint, so the answer is read again as it lands. */
  const syncNotes = () => {
    const gone = isDisabledEverywhere('library');
    if (notes.hidden !== gone) notes.hidden = gone;
  };
  syncNotes();
  [600, 2000, 5000].forEach((ms) => setTimeout(syncNotes, ms));

  /* The estimate's own layout: the schedule connector and the
     estimator in the main column, the petty-cash aside beside them
     once the tab is wide enough (a container query in budget.css),
     under them otherwise. The learn boxes are prepended to the
     SECTION, so they sit above this grid. */
  estimate.append(h('div.bud-est-grid', {}, [
    h('div.bud-est-main', {}, [renderBudget(), notes]),
    costAside()
  ]));

  /* Two tabs the section-icons.json map does not describe; an
     attribute on the section wins over the map (tabs.js). */
  const extra = { schedule: { group: 'Plan', icon: 'timeline' }, versions: { group: 'Plan', icon: 'history' } };
  const sections = costSections();
  for (const s of sections) {
    const x = extra[s.id];
    if (x) { s.dataset.tabGroup = x.group; s.dataset.tabIcon = x.icon; }
  }
  body.append(estimate, ...sections);
  main.append(body);

  app.replaceChildren(main);
  /* Learn-in-place (src/ui/learn.js, loaded on demand so it stays out of first paint).
     It writes nothing; an unknown topic id returns null and is filtered. */
  import('../ui/learn.js').then((m) => {
    const at = document.querySelector("#estimate");
    if (!at) return;
    const boxes = ["atl-btl","schedule-budget","who-owns-what"].map((id) => m.learn(id)).filter(Boolean);
    /* One row of three, not three stacked rows: closed, they are three
       short questions, and stacked they took a phone's first screen. */
    if (boxes.length) at.prepend(h('div.bud-learn-row', {}, boxes));
  }).catch(() => { /* a nicety, never the page */ });
  mountShell();
  initBudget(app);
  initCosts(app);

  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[budget] chrome', e); }
}

render();
