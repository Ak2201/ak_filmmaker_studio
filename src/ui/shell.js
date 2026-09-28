/* ============================================================
   THE SHELL — global rail + six-phase project bar
   ------------------------------------------------------------
   Everything here is rendered from src/data/navigation.json. Adding a
   module is a JSON edit; nothing in this file names one.

   Three layers of navigation, which is what makes a 22-module app
   traversable:

     rail       where am I in the product   (Home, Library)
     phase bar  where am I in the film      (Develop … Shoot)
     toolbar    what can I do on this page  (already exists per page)

   The old app had only the third, which is why 24 steps on one
   223,000px page felt like a maze.

   No inline handlers — a strict CSP ships in vercel.json and
   netlify.toml. Anything clickable is a real <a>, or carries
   data-action and is bound by delegate().
   ============================================================ */
import nav from '../data/navigation.json';
import { h, delegate } from '../lib/dom.js';

const CURRENT = (() => {
  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  return file === '' ? 'index.html' : file;
})();

/** Which module does this page currently represent? */
function activeModule() {
  const hash = location.hash;
  for (const phase of nav.phases) {
    for (const m of phase.modules) {
      if (!m.href) continue;
      const [file, frag] = m.href.split('#');
      if (file.toLowerCase() !== CURRENT) continue;
      if (frag && '#' + frag !== hash) continue;
      return { phase, module: m };
    }
  }
  // No exact hash match — fall back to the first module on this page.
  for (const phase of nav.phases) {
    for (const m of phase.modules) {
      if (m.href && m.href.split('#')[0].toLowerCase() === CURRENT) return { phase, module: m };
    }
  }
  return { phase: null, module: null };
}

function moduleRow(m) {
  const planned = m.status === 'planned';
  const el = h(planned ? 'button.sh-mod.planned' : 'a.sh-mod', planned
    ? { type: 'button', 'data-action': 'module-planned', 'data-module': m.id }
    : { href: m.href });
  el.append(
    h('span.sh-mod-label', { text: m.label }),
    h('span.sh-mod-purpose', { text: m.purpose })
  );
  if (m.status !== 'built') {
    el.append(h('span.sh-mod-flag', { text: m.status === 'partial' ? 'PARTIAL' : 'SOON' }));
  }
  return el;
}

function phaseTab(phase, active) {
  const wrap = h(`div.sh-phase.sh-ph-${phase.hue}` + (active ? '.is-active' : ''));
  const btn = h('button.sh-phase-btn', {
    type: 'button',
    'data-action': 'phase-toggle',
    'data-phase': phase.id,
    'aria-expanded': 'false',
    'aria-haspopup': 'true'
  });
  btn.append(h('span.sh-phase-dot'), h('span.sh-phase-label', { text: phase.label }));
  const menu = h('div.sh-phase-menu', { hidden: true, role: 'menu', 'aria-label': phase.label });
  menu.append(h('div.sh-phase-menu-head', { text: phase.blurb }));
  phase.modules.forEach((m) => menu.append(moduleRow(m)));
  wrap.append(btn, menu);
  return wrap;
}

function buildRail() {
  const rail = h('nav.sh-rail', { 'aria-label': 'Studio' });
  nav.global.forEach((g) => {
    const a = h('a.sh-rail-item' + (g.href.toLowerCase() === CURRENT ? '.is-active' : ''), {
      href: g.href, title: g.purpose
    });
    a.append(h('span.sh-rail-icon', { text: g.icon, 'aria-hidden': 'true' }),
             h('span.sh-rail-label', { text: g.label }));
    rail.append(a);
  });
  return rail;
}

function buildPhaseBar(active) {
  const bar = h('div.sh-phasebar', { role: 'navigation', 'aria-label': 'Production phases' });
  nav.phases.forEach((p) => bar.append(phaseTab(p, active.phase && active.phase.id === p.id)));
  return bar;
}

function closeAllMenus(except) {
  document.querySelectorAll('.sh-phase-menu').forEach((m) => {
    if (m === except) return;
    m.hidden = true;
    const btn = m.parentElement && m.parentElement.querySelector('.sh-phase-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;

  delegate(document, 'click', '[data-action="phase-toggle"]', (e, btn) => {
    const menu = btn.parentElement.querySelector('.sh-phase-menu');
    const open = menu.hidden;
    closeAllMenus(menu);
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  });

  // A planned module explains itself rather than 404ing or, worse,
  // looking clickable and doing nothing.
  delegate(document, 'click', '[data-action="module-planned"]', (e, btn) => {
    const id = btn.dataset.module;
    let found = null;
    for (const p of nav.phases) for (const m of p.modules) if (m.id === id) found = { p, m };
    if (!found) return;
    const { p, m } = found;
    if (window.StudioUI && StudioUI.toast) {
      StudioUI.toast(
        `${m.label} — ${m.purpose}. ${m.note || 'Not built yet; it lives in the ' + p.label + ' phase.'}`,
        { type: 'info', duration: 6000 }
      );
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.sh-phase')) closeAllMenus();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllMenus();
  });
}

/** Mount the shell above the page's own content. Idempotent. */
export function mountShell() {
  if (document.querySelector('.sh-shell')) return;
  const app = document.getElementById('app') || document.body;
  const active = activeModule();

  if (active.phase) document.documentElement.setAttribute('data-phase', active.phase.id);

  const shell = h('div.sh-shell');
  shell.append(buildRail(), buildPhaseBar(active));
  app.insertBefore(shell, app.firstChild);
  document.body.classList.add('has-sh-shell');
  wire();
  return shell;
}

export default { mountShell };
