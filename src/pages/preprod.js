/* ============================================================
   PRE-PRODUCTION — the path from a script to a shoot day
   ------------------------------------------------------------
   The Story page shows its path one step at a time. This is the same
   idea for everything between the script and the first day of shooting,
   which used to be twenty-one tools in a menu with nothing to say which
   came first or which was missing.

   Every step is read from the film (src/lib/preprod-path.js); this page
   stores nothing and writes nothing. A step says what it is for, how far
   it stands, what is missing, and links to the tool where it is done.
   The last step, Ready to shoot, lists every readiness check together.
   The same strip sits above each of those tools (src/ui/path-bar.js).
   ============================================================ */
import '../lib/store.js';   /* FIRST — invariant 6. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/path-bar.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, commitMain } from '../lib/dom.js';
import { showOnly, stepFooter, stepBar, wireStepper, landUnder } from '../ui/stepper.js';
import { pathSteps, nextStep } from '../lib/preprod-path.js';
import { readiness } from '../lib/readiness.js';
import Store from '../lib/store.js';

const app = document.getElementById('app');
const STATE_WORD = { done: 'Done', doing: 'In progress', todo: 'Not started' };

let steps = [];
let cur = '';

const hashId = () => decodeURIComponent((location.hash || '').replace(/^#/, ''));

function readinessList() {
  const r = readiness();
  const wrap = h('div.pp-ready');
  if (!r.hasFilm) { wrap.append(h('p.pp-about', { text: 'Add scenes first; there is nothing to check yet.' })); return wrap; }
  const order = (c) => (c.passed ? 2 : c.severity === 'blocker' ? 0 : 1);
  const ul = h('ul.pp-checks');
  r.checks.slice().sort((a, b) => order(a) - order(b)).forEach((c) => {
    const cls = c.passed ? 'is-ok' : c.severity === 'blocker' ? 'is-blocker' : 'is-gap';
    ul.append(h('li.pp-check.' + cls, {}, [
      h('span.pp-check-mark', { text: c.passed ? '✓' : c.severity === 'blocker' ? '✕' : '!', 'aria-label': c.passed ? 'passes' : c.severity }),
      h('span', {}, [
        h('strong', { text: c.label + (c.count ? ' (' + c.count + ')' : '') }),
        c.passed ? null : h('span.pp-check-hint', { text: c.hint + (c.items.length ? ' — ' + c.items.slice(0, 4).join('; ') + (c.items.length > 4 ? '; …' : '') : '') })
      ].filter(Boolean)),
      c.passed ? h('span') : h('a', { href: c.where || 'dashboard.html#readiness', text: 'Fix →' })
    ]));
  });
  wrap.append(ul);
  return wrap;
}

function stepPanel(s) {
  const sec = h('section.pp-step', { id: 'step-' + s.id, 'aria-labelledby': 'pp-h-' + s.id, hidden: s.id !== cur });
  sec.append(h('div.pp-step-head', {}, [
    h('span.pp-step-n', { text: 'Step ' + s.n }),
    h('h2', { id: 'pp-h-' + s.id, text: s.label }),
    h('span.pp-state.is-' + s.state, { text: STATE_WORD[s.state] })
  ]));
  sec.append(h('p.pp-about', { text: s.about }));
  if (s.facts.length) sec.append(h('p.pp-facts', { text: s.facts.join(' · ') }));
  if (s.id === 'ready') {
    sec.append(readinessList());
    sec.append(h('div.pp-act', {}, [
      h('a.btn.primary', { href: 'contacts.html#call-sheets', text: 'MAKE THE CALL SHEET →' }),
      h('a.btn', { href: 'shoot.html', text: 'OPEN THE SHOOT DAY →' })
    ]));
  }
  else if (s.missing.length) {
    sec.append(h('p.pp-missing-h', { text: 'Still to do' }),
      h('ul.pp-missing', {}, s.missing.map((m) => h('li', { text: m }))));
  } else if (s.state === 'done') {
    sec.append(h('p.pp-facts', { text: 'Nothing left in this step.' }));
  }
  if (s.id !== 'ready') {
    sec.append(h('div.pp-act', {}, [h('a.btn' + (s.state === 'done' ? '' : '.primary'), { href: s.tool.href, text: s.tool.label.toUpperCase() + ' →' })]));
  }
  const foot = stepFooter(steps, s.id);
  if (foot) sec.append(foot);
  return sec;
}

function render() {
  steps = pathSteps();
  const want = hashId().replace(/^step-/, '');
  const hit = steps.find((s) => s.id === want);
  const next = nextStep(steps);
  cur = hit ? hit.id : (next ? next.id : (steps[0] || {}).id);
  const project = Store.currentProject();
  const done = steps.filter((s) => s.state === 'done').length;

  const main = h('main#main');
  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Studio · Pre-Production' }),
    h('h1.bd-title', { text: 'Pre-Production.' }),
    h('p.bd-deck', { text: 'From the script to the first day of shooting, one step at a time. Each step says what it is for and what is still missing, then opens the tool where it is done.' })
  ]));
  const page = h('div.pp-page');
  if (!project) {
    page.append(h('p.bd-sub', { text: 'No film is open. Open or create one from Home, and its path appears here.' }));
  } else {
    page.append(h('div.pp-sum', {}, [
      h('span', { text: done + ' of ' + steps.length + ' steps done' + (next && next.id !== 'ready' ? ' · next: ' + next.label : '') }),
      (() => {
        const fill = h('span');
        fill.style.width = Math.round((done / Math.max(1, steps.length)) * 100) + '%';
        return h('span.pp-meter', { role: 'img', 'aria-label': done + ' of ' + steps.length + ' steps done' }, [fill]);
      })()
    ]));
    page.append(stepBar(steps, cur, { label: 'Pre-Production steps', done: (s) => s.state === 'done', title: (s) => s.about }));
    steps.forEach((s) => page.append(stepPanel(s)));
  }
  main.append(page);
  if (!commitMain(app, main, mountShell)) return;
  try { StudioUI.autoAriaLabels(); StudioUI.wireGlossaryPopovers(); StudioUI.polishEmptyStates(); } catch (e) { console.warn('[preprod] chrome', e); }
}

function go(id) {
  if (!steps.some((s) => s.id === id)) return;
  cur = id;
  showOnly(steps.map((s) => ({ id: s.id, el: document.getElementById('step-' + s.id) })), id);
  document.querySelectorAll('.stp-tab').forEach((b) => {
    const on = b.dataset.stepperGo === id;
    b.classList.toggle('is-on', on);
    if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
  });
  try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// */ }
  landUnder(document.getElementById('step-' + id), document.querySelector('.stp-bar'));
}

wireStepper(document, go);
window.addEventListener('hashchange', () => { const id = hashId().replace(/^step-/, ''); if (id && id !== cur) go(id); });
Store.subscribe('current:changed', render);
render();
