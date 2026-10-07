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
import { costSections, initCosts } from '../ui/budget-costs.js';
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

  /* THE PAGE COLUMN. Every module page puts its head in `header.bd-head`
     and its body in a column from the same family (modules.css) —
     max-width, auto margins, side padding. This page put the head and
     the two calculator blocks straight into <main>, so they ran from the
     rail to the window edge with no gutter and the estimator's subtotal
     column sat against (and under) the scrollbar. The same classes the
     other pages use, rather than a budget stylesheet of its own; the
     blueprint pill finds its host by `header.bd-head` too. */
  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Plan · what it costs' }),
    h('h1.bd-title', { text: 'Budget.' }),
    h('p.bd-deck', {
      text: 'A line-item estimate that reads your schedule. Days come from the '
          + 'stripboard if you have built one, rates from the Chennai tables if '
          + 'you want them, and every figure stays editable. Then, once you are '
          + 'shooting: petty cash, crew payments and the cost report against it.'
    })
  ]));

  /* TABS (src/ui/tabs.js, budget is on its list). The estimator and
     its notes are the first tab, `#estimate`; the cost tabs after it
     are views of src/lib/costs.js. Every section stays in the DOM —
     a hidden tab is reached by its hash, and the gate still reads
     every word in it. */
  const body = h('div.bd-list');
  const estimate = h('section#estimate.cx-sec', { 'data-tab-label': 'Estimate' });
  estimate.append(renderBudget());

  /* The rate tables did not move. Saying so, with a route, is the
     difference between "this page is thin" and "the reference is
     one click away". Not `.bd-how`: that is the empty states' grid of
     numbered steps, and it laid these three blocks out as three
     columns. */
  estimate.append(h('div.bd-notes', {}, [
    h('h3', { text: 'Where the numbers come from' }),
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
  ]));
  body.append(estimate, ...costSections());
  main.append(body);

  app.replaceChildren(main);
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
