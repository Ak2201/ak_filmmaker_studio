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
import { h, commitMain, delegate } from '../lib/dom.js';
import { showOnly, stepFooter, wireStepper, landUnderMenu, menuBeside } from '../ui/stepper.js';
import { buildSectionMenu, updateSectionMenu } from '../ui/section-menu.js';
import { pathSteps, nextStep } from '../lib/preprod-path.js';
import { readiness } from '../lib/readiness.js';
import Store from '../lib/store.js';
import { pageHeader, button, badge, meter } from '../ui/kit/index.js';

const app = document.getElementById('app');
const STATE_WORD = { done: 'Done', doing: 'In progress', todo: 'Not started' };
const STATE_TONE = { done: 'ok', doing: 'warn', todo: null };

let steps = [];
let cur = '';
let nav = null;          /* the section menu, kept across renders (updated in place) */

/* One mark per step, all in src/data/section-icons.json. */
const ICON = {
  script: 'description', scenes: 'view_list', breakdown: 'label', vision: 'palette', shots: 'format_list_numbered',
  people: 'groups', places: 'place', songs: 'music_note', budget: 'currency_rupee', schedule: 'calendar_month',
  sheets: 'content_cut', ready: 'fact_check'
};
/* The menu's item ids are the PANELS' element ids (step-<id>), which is
   what a row's aria-controls has to be; the page's own ids (#<id> in the
   address bar, the Fix links, the footer's Back/Next) stay bare. */
const panelId = (id) => 'step-' + id;
const bareId = (pid) => String(pid).replace(/^step-/, '');
function menuGroups() {
  const groups = [];
  for (const s of steps) {
    const label = s.group || '';
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) { g = { label, items: [] }; groups.push(g); }
    g.items.push({
      id: panelId(s.id), label: s.label, icon: ICON[s.id] || '', done: s.state === 'done', doing: s.state === 'doing',
      hint: STATE_WORD[s.state] + '. ' + s.about
    });
  }
  return groups;
}
function scrollRowIntoStrip() {
  if (!nav || menuBeside(nav)) return;
  const on = nav.querySelector('[aria-selected="true"]');
  if (on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = Math.max(0, on.offsetLeft - (nav.clientWidth - on.offsetWidth) / 2);
}

const hashId = () => decodeURIComponent((location.hash || '').replace(/^#/, ''));
const resolve = () => {
  const want = hashId().replace(/^step-/, '');
  const hit = steps.find((s) => s.id === want);
  const next = nextStep(steps);
  return hit ? hit.id : (next ? next.id : (steps[0] || {}).id);
};

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
  /* One A4 page for the producer. The code that draws it is fetched on
     the press, not with the page (src/lib/ready-pdf.js). */
  wrap.append(h('div.pp-act.pp-ready-act', {}, [
    button({ label: 'DOWNLOAD ONE-PAGE PDF', icon: 'picture_as_pdf', action: 'ready-pdf', class: 'pp-pdf' }),
    h('span.pp-check-hint', { text: 'Checks, shoot days, budget and open permissions, on one A4 page.' })
  ]));
  return wrap;
}

function stepPanel(s) {
  const sec = h('section.pp-step', { id: panelId(s.id), role: 'tabpanel', 'aria-labelledby': 'tab-' + panelId(s.id), hidden: s.id !== cur });
  sec.append(h('div.pp-step-head', {}, [
    h('span.pp-step-n', { text: 'Step ' + s.n }),
    h('h2', { id: 'pp-h-' + s.id, text: s.label }),
    badge({ label: STATE_WORD[s.state], tone: STATE_TONE[s.state], dot: true, class: 'pp-state is-' + s.state })
  ]));
  sec.append(h('p.pp-about', { text: s.about }));
  if (s.facts.length) sec.append(h('p.pp-facts', { text: s.facts.join(' · ') }));
  if (s.id === 'ready') {
    sec.append(readinessList());
    sec.append(h('div.pp-act', {}, [
      button({ href: 'contacts.html#call-sheets', label: 'MAKE THE CALL SHEET →', variant: 'primary' }),
      button({ href: 'shoot.html', label: 'OPEN THE SHOOT DAY →' })
    ]));
  }
  else if (s.missing.length) {
    sec.append(h('p.pp-missing-h', { text: 'Still to do' }),
      h('ul.pp-missing', {}, s.missing.map((m) => h('li', { text: m }))));
  } else if (s.state === 'done') {
    sec.append(h('p.pp-facts', { text: 'Nothing left in this step.' }));
  }
  if (s.id !== 'ready') {
    sec.append(h('div.pp-act', {}, [button({ href: s.tool.href, label: s.tool.label.toUpperCase() + ' →', variant: s.state === 'done' ? 'secondary' : 'primary' })]));
  }
  const foot = stepFooter(steps, s.id);
  if (foot) sec.append(foot);
  return sec;
}

function summary(done, next) {
  return h('div.pp-sum', {}, [
    h('span', { text: done + ' of ' + steps.length + ' steps done' + (next && next.id !== 'ready' ? ' \u00b7 next: ' + next.label : '') }),
    meter({ value: done, max: steps.length, show: false, class: 'pp-meter', attrs: { role: 'img', 'aria-label': done + ' of ' + steps.length + ' steps done' } })
  ]);
}

/* Same film, same steps: the state moved (a scene was tagged, a script
   saved). Patch the menu, the summary and the panels where they stand, so
   the strip keeps its scroll, the column its pin and the reader their
   place. Anything structural goes through commitMain below. */
function patch(project, done, next) {
  const main = document.getElementById('main');
  const body = main && main.querySelector(':scope > .pp-body');
  const sum = main && main.querySelector(':scope > .pp-sum');
  if (!nav || !nav.isConnected || !body || !sum || main.dataset.film !== project.id) return false;
  const have = [...body.children].map((e) => e.id).join();
  if (have !== steps.map((s) => panelId(s.id)).join()) return false;
  const old = nav.querySelectorAll('[role="tab"]').length;
  if (old !== steps.length) return false;
  sum.replaceWith(summary(done, next));
  const panels = steps.map(stepPanel);
  if (panels.map((e) => e.outerHTML).join('') !== body.innerHTML) body.replaceChildren(...panels);
  updateSectionMenu(nav, menuGroups(), panelId(cur));
  return true;
}

function render() {
  steps = pathSteps();
  const next = nextStep(steps);
  cur = resolve();
  const project = Store.currentProject();
  const done = steps.filter((s) => s.state === 'done').length;

  if (project && patch(project, done, next)) return;
  const main = h('main#main');
  main.append(pageHeader({
    class: 'bd-head',
    eyebrow: 'Studio \u00b7 Pre-Production',
    title: 'Pre-Production.',
    sub: 'From the script to the first day of shooting, one step at a time. Each step says what it is for and what is still missing, then opens the tool where it is done.'
  }));
  nav = null;
  if (!project) {
    main.append(h('div.pp-page', {}, [h('p.bd-sub', { text: 'No film is open. Open or create one from Home, and its path appears here.' })]));
  } else {
    /* main IS the container the shared menu lays out beside (tabs.css
       .tabs-has-side): header and summary span the width, the column
       is the menu, .pp-body is the open step. */
    main.classList.add('tabs-has-side', 'pp-has-menu');
    main.dataset.film = project.id;
    main.append(summary(done, next));
    nav = buildSectionMenu({
      groups: menuGroups(), active: panelId(cur), ariaLabel: 'Pre-Production steps', sectionsLabel: 'Steps', orientation: 'side',
      onSelect: (pid) => go(bareId(pid))
    });
    main.append(nav);
    main.append(h('div.pp-body', {}, steps.map(stepPanel)));
  }
  if (!commitMain(app, main, mountShell)) { nav = document.querySelector('#main > .tabs[data-sm-self]') || nav; return; }
  try { StudioUI.autoAriaLabels(); StudioUI.wireGlossaryPopovers(); StudioUI.polishEmptyStates(); } catch (e) { console.warn('[preprod] chrome', e); }
}

function go(id) {
  if (!steps.some((s) => s.id === id)) return;
  cur = id;
  showOnly(steps.map((s) => ({ id: s.id, el: document.getElementById('step-' + s.id) })), id);
  if (nav && nav.isConnected) updateSectionMenu(nav, menuGroups(), panelId(id));
  scrollRowIntoStrip();
  try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// */ }
  /* beside the panels (>= 1100px) nothing is pinned above them; below, the strip is */
  landUnderMenu(document.getElementById(panelId(id)), nav);
}

wireStepper(document, go);
delegate(document, 'click', '[data-action="ready-pdf"]', async (e, el) => {
  if (el.disabled) return;
  el.disabled = true;
  try {
    const m = await import('../lib/ready-pdf.js');
    m.exportReadyPDF();
  } catch (err) {
    console.warn('[preprod] ready PDF', err);
    StudioUI.toastError('The page could not be prepared.');
  } finally { el.disabled = false; }
});
window.addEventListener('hashchange', () => { const id = hashId().replace(/^step-/, ''); if (id && id !== cur) go(id); });
Store.subscribe('current:changed', render);
render();
