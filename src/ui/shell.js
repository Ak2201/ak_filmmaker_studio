/* ============================================================
   THE SHELL — a vertical app rail and one phase bar
   ------------------------------------------------------------
   Everything here is rendered from src/data/navigation.json. Adding a
   module is a JSON edit; nothing in this file names one.

   THE SHAPE, AND WHERE IT CAME FROM.

   Measured from StudioBinder's own app on 28 Sep 2026, because the
   brief was to match their layout and guessing at it would have been
   pointless. The structure, in their numbers:

     70px   a DARK ICON RAIL, fixed left. Four app-scope destinations
            only, icon above an 11px label, 70x76 each.
     60px   ONE horizontal bar beside it: project identity, a version
            selector, and the phase tabs — all in a single row.
     grid   the project overview is a LAUNCHER: one row per phase, a
            132x150 phase tile, then 165x132 module tiles.

   Only the arrangement is taken. The palette, the icons, the type and
   the wording here are this app's own.

   Two things in that are worth the rewrite. The app-level navigation
   is VERTICAL, so it costs no vertical space at all — the version of
   this shell it replaces spent a whole 52px row on two links, Home
   and Library, on every page forever. And "show me everything this
   tool can do" is answered by the launcher on one page, not by making
   the permanent chrome big enough to list 22 modules. That is how
   they keep a compact top bar and still feel navigable, and it is the
   answer to the complaint that started this.

   The phase tabs stay horizontal and keep their dropdowns, which is
   what they do too.

   No inline handlers — a strict CSP ships in vercel.json and
   netlify.toml. Anything clickable is a real <a>, or carries
   data-action and is bound by delegate().
   ============================================================ */
import nav from '../data/navigation.json';
import { h, delegate } from '../lib/dom.js';

const RAIL_KEY = 'arunak_studio_rail_open_v1';
const NARROW = '(max-width: 1099px)';

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

/* ---- the module rows inside a phase dropdown --------------- */

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

/* ---- the two pieces ---------------------------------------- */

function buildRail() {
  const rail = h('nav#studioRail.sh-rail', { 'aria-label': 'Studio' });
  nav.global.forEach((g) => {
    const on = g.href.toLowerCase() === CURRENT;
    const a = h('a.sh-rail-item' + (on ? '.is-active' : ''), { href: g.href, title: g.purpose });
    a.append(h('span.sh-rail-icon', { text: g.icon, 'aria-hidden': 'true' }),
             h('span.sh-rail-label', { text: g.label }));
    if (on) a.setAttribute('aria-current', 'page');
    rail.append(a);
  });
  return rail;
}

function buildBar(active) {
  const bar = h('div.sh-bar', { role: 'navigation', 'aria-label': 'Production phases' });
  // The rail toggle lives in the bar, not floating over the page: on a
  // narrow screen the rail is gone, and a control for something you
  // cannot see needs to sit where you are already looking.
  const toggle = h('button#railToggle.sh-rail-toggle', {
    type: 'button',
    'data-action': 'rail-toggle',
    'aria-controls': 'studioRail',
    'aria-expanded': 'false',
    'aria-label': 'Studio menu'
  });
  toggle.append(h('span.sh-burger', { 'aria-hidden': 'true' }));
  bar.append(toggle);

  const tabs = h('div.sh-phases');
  nav.phases.forEach((p) => tabs.append(phaseTab(p, active.phase && active.phase.id === p.id)));
  bar.append(tabs);
  return bar;
}

/* ---- open / closed ----------------------------------------- */

const isNarrow = () => window.matchMedia(NARROW).matches;

function setRail(open) {
  document.body.classList.toggle('rail-shown', open);
  const btn = document.getElementById('railToggle');
  if (btn) btn.setAttribute('aria-expanded', String(open));
  // Only the wide-screen preference is worth keeping. Restoring "open"
  // on a phone would put 70px of navigation over the page on arrival.
  if (!isNarrow()) {
    try { localStorage.setItem(RAIL_KEY, open ? '1' : '0'); } catch (e) {}
  }
}

function initialRail() {
  if (isNarrow()) return false;
  let v = null;
  try { v = localStorage.getItem(RAIL_KEY); } catch (e) {}
  return v !== '0';
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

  delegate(document, 'click', '[data-action="rail-toggle"]', () => {
    setRail(!document.body.classList.contains('rail-shown'));
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
    // Narrow: the rail is a temporary overlay, so following a link or
    // tapping the page puts it away again.
    if (!isNarrow()) return;
    if (e.target.closest('#studioRail a')) { setRail(false); return; }
    if (!e.target.closest('#studioRail, [data-action="rail-toggle"]')) setRail(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeAllMenus();
    if (isNarrow()) setRail(false);
  });

  // Crossing the breakpoint changes what "open" means, so re-decide.
  window.matchMedia(NARROW).addEventListener('change', () => setRail(initialRail()));
}

/** Mount the shell around the page's own content. Idempotent. */
export function mountShell() {
  if (document.querySelector('.sh-rail')) return;
  const app = document.getElementById('app') || document.body;
  const active = activeModule();

  if (active.phase) document.documentElement.setAttribute('data-phase', active.phase.id);

  const rail = buildRail();
  const bar = buildBar(active);
  app.insertBefore(bar, app.firstChild);
  app.insertBefore(rail, app.firstChild);

  document.body.classList.add('has-sh-shell');
  wire();
  setRail(initialRail());
  return bar;
}

export default { mountShell };
