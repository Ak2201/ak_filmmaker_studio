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
import { mountPathBar } from '../ui/path-bar.js';
import { h } from '../lib/dom.js';
import C from '../lib/costs.js';
import { renderBudget, initBudget } from '../ui/budget.js';
import { costSections, costKpis, costAside, initCosts } from '../ui/budget-costs.js';
import { pageHeader, button, notice } from '../ui/kit/index.js';
import rates from '../data/rates.chennai.2024.json';
import rateChecks from '../data/rates.chennai.checks.json';

const app = document.getElementById('app');

function rateProvenance() {
  // rates.json calls it `asOf`, not `year` — I wrote `year` first and
  // it would have rendered "undefined" with a silent fallback hiding it.
  /* Counted from the overlay, not asserted. This line used to say
     every preset was 2024-25 full stop, which stopped being true the
     moment part of the card was re-checked against a Chennai rental
     house: the estimator below shows those with their own date, so a
     blanket "all 2024-25" above it contradicted the hints underneath
     it. The same one-fact-two-sources fault the estimator itself had,
     one level up and in the prose, where it is easier to miss. */
  const rows = rateChecks.rows || [];
  const checked = rows.filter((r) => r.confidence === 'checked').length;
  const stale = rows.filter((r) => r.confidence === 'stale').length;

  let s = `Preset rates are Chennai ${rates.asOf}. `;
  if (checked) {
    s += `${checked} were re-checked on ${rateChecks.lastChecked} and are shown with that `
       + `date — next to the ${rates.asOf} band, not over it, because the checked `
       + `figures come in well under it and it is not settled why. `;
  }
  if (stale) {
    s += `${stale} more were looked for and found published nowhere, so the `
       + `${rates.asOf} figure stands and says so on the line. `;
  }
  return s + `They are a starting point for a line, not a quote — every one of `
           + `them is editable.`;
}

function render() {
  const main = h('main#main.hue-plan');

  /* THE HEAD is the kit's page header (eyebrow, Space Grotesk title,
     deck, standing actions on the right) wearing `bd-head` as well:
     that class is the module column every page shares AND the host the
     blueprint pill looks for (blueprint-drawer.js), which lands after
     the `.bd-eyebrow` it finds. Export CSV is the budget file (the same
     builder as the Export tab's button); the versions link counts what
     costs.js holds. New cost line reaches the estimator's own add-row
     action, so there is one way to add a line. */
  let versions = 0;
  try { versions = C.listVersions().length; } catch (e) { /* none */ }
  const head = pageHeader({
    class: 'bd-head bd-head-split',
    eyebrow: 'Budget & People · what it costs',
    title: 'Production Budget.',
    sub: 'A line-item estimate that reads your schedule. Days come from the '
       + 'stripboard if you have built one, rates from the Chennai tables if '
       + 'you want them, and every figure stays editable. Then, once you are '
       + 'shooting: petty cash, crew payments and the cost report against it.',
    actions: [
      button({ label: versions ? 'Versions (' + versions + ')' : 'Versions', icon: 'history', href: '#versions' }),
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
      h('p', { text: rateProvenance() }),
      h('p', {}, [
        'The full rate tables — camera, crew, post, equipment — are in the ',
        h('a', { href: 'library.html#equipment', text: 'craft library' }),
        '. Shoot days come from the ',
        h('a', { href: 'stripboard.html#stripboard', text: 'stripboard' }),
        ', which reads the scenes you broke down in the ',
        h('a', { href: 'breakdown.html#scenes', text: 'breakdown' }),
        '.'
      ])
    ])
  });

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

  mountPathBar(main);   // the pre-production path, above the tool and Back / Next below it
  app.replaceChildren(main);
  /* Learn-in-place (src/ui/learn.js, loaded on demand so it stays out of first paint).
     It writes nothing; an unknown topic id returns null and is filtered. */
  import('../ui/learn.js').then((m) => {
    const at = document.querySelector("#estimate");
    if (!at) return;
    const boxes = ["atl-btl","schedule-budget","who-owns-what"].map((id) => m.learn(id)).filter(Boolean);
    if (boxes.length) at.prepend(...boxes);
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
