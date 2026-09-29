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

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h } from '../lib/dom.js';
import { renderBudget, initBudget } from '../ui/budget.js';
import rates from '../data/rates.chennai.2024.json';

const app = document.getElementById('app');

function rateProvenance() {
  // rates.json calls it `asOf`, not `year` — I wrote `year` first and
  // it would have rendered "undefined" with a silent fallback hiding it.
  return `Preset rates are Chennai ${rates.asOf}, shown with that date. They are a `
       + `starting point for a line, not a quote — every one of them is editable.`;
}

function render() {
  const main = h('main#main.hue-plan');

  main.append(
    h('p.bd-eyebrow', { text: 'Plan · what it costs' }),
    h('h1.bd-h1', { text: 'Budget.' }),
    h('p.bd-sub', {
      text: 'A line-item estimate that reads your schedule. Days come from the '
          + 'stripboard if you have built one, rates from the Chennai tables if '
          + 'you want them, and every figure stays editable.'
    })
  );

  main.append(renderBudget());

  /* The rate tables did not move. Saying so, with a route, is the
     difference between "this page is thin" and "the reference is
     one click away". */
  main.append(h('div.bd-how', {}, [
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

  app.replaceChildren(main);
  mountShell();
  initBudget(app);

  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[budget] chrome', e); }
}

render();
