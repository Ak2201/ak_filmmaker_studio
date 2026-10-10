/* ============================================================
   MOBILE NAVIGATION — the phone's bottom bar and its two sheets
   ------------------------------------------------------------
   At 720px and below the desktop band does not fit, and what it did
   instead was worse than missing: the five stage pills became a
   sideways strip whose menus opened INSIDE the strip's own scroll box
   and were clipped to nothing, so on a phone there was no way from
   Breakdown to Stripboard except search; the page's toolbar stacked
   up to 600px of controls above the first word; and the bottom bar
   spent half its slots on Top and End. (Owner, 10 Oct 2026: "mobile
   navigation is very bad".)

   So, below 720px only (desktop is untouched):

     - the band is ONE slim row — the breadcrumb. Its stage segment
       opens the Go-to sheet at that stage.
     - the bottom bar is Home · Go to · Search · Tools.
     - GO TO is a sheet of every destination: the app-scope ones, then
       each stage with its modules, then the shelves (Library,
       Blueprints) — read from navigation.json through navmodel.js,
       like every other map in the app, so a module added there appears
       here with no edit. Where you are is marked.
     - TOOLS is a sheet holding the page's own controls. It BORROWS the
       real elements — the adopted `.toolbar` and the `.sh-tools` zone —
       and puts them back on close, rather than drawing copies: ids,
       listeners and every `.toolbar`-keyed rule survive a move (the
       same reasoning as adoptPageTools() in shell.js), and two copies
       of a save state or a project switcher would disagree.

   `html.mn-on` is set only while the bottom bar is attached, and the
   CSS that hides the band's extras keys off it — so a page that opts
   out of the bar (`data-no-actionbar`: the extension panel, the
   screening room) keeps its controls where they were. Nothing here
   writes storage.
   ============================================================ */
import { h } from '../lib/dom.js';
import { iconSpan } from './icon.js';
import { phases, globals, shelves } from '../lib/navmodel.js';
import { holdFocus, releaseFocus } from './modal-focus.js';
import '../styles/mobile-nav.css';

const CURRENT = (() => {
  const f = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  return f === '' ? 'index.html' : (/\.html$/.test(f) ? f : f + '.html');   // cleanUrls: /settings
})();
const fileOf = (href) => String(href || '').split('#')[0].toLowerCase();

let sheet = null;          // { overlay, kind, borrowed: [{ node, parent, next }] }

/* ---- where am I ----------------------------------------------
   The shell already keeps this true (it marks the phase menu's row
   `.is-here` as the hash and the scroll spy move), so the sheet reads
   that answer rather than deciding a second time. Fallback: the first
   module whose file is this page. */
function hereModuleId() {
  const row = document.querySelector('.sh-phase-menu .sh-mod.is-here');
  if (row && row.dataset.moduleId) return row.dataset.moduleId;
  for (const p of [...phases(), ...shelves()]) for (const m of p.modules || []) if (fileOf(m.href) === CURRENT) return m.id;
  return null;
}

/* The same answer the rail's admin-only items read (shell.js). */
function isAdmin() {
  try { const c = window.StudioCloud; return !!(c && c.getGateState && c.getGateState().role === 'admin'); }
  catch (e) { return false; }
}

/* ---- the sheet frame ------------------------------------------ */
function close() {
  if (!sheet) return;
  const s = sheet; sheet = null;
  for (const b of s.borrowed) {
    if (b.next && b.next.parentNode === b.parent) b.parent.insertBefore(b.node, b.next);
    else b.parent.append(b.node);
  }
  releaseFocus(s.overlay);
  s.overlay.remove();
  document.documentElement.classList.remove('mn-locked');
  syncBar();
  // the band's contents moved back: let the shell re-measure it
  window.dispatchEvent(new Event('resize'));
}

function open(kind, title, body, { focus } = {}) {
  close();
  const id = 'mnSheetTitle';
  const overlay = h('div.mn-overlay', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id, 'data-mn-sheet': kind });
  const panel = h('div.mn-sheet');
  panel.append(
    h('div.mn-head', {}, [
      h('h2.mn-title', { id, text: title }),
      h('button.mn-close', { type: 'button', 'data-mn': 'close', 'aria-label': 'Close' }, [h('span', { 'aria-hidden': 'true', text: '×' })])
    ]),
    body
  );
  overlay.append(panel);
  document.body.append(overlay);
  document.documentElement.classList.add('mn-locked');
  sheet = { overlay, kind, borrowed: [] };
  holdFocus(overlay);
  // preventScroll: the sheet places its own scroll (openGoTo), and a
  // focus() that scrolls puts the row under the sticky header
  (focus && focus() || overlay.querySelector('.mn-close')).focus({ preventScroll: true });
  syncBar();
  return sheet;
}

/* ---- GO TO ----------------------------------------------------- */
function modRow(m, here) {
  const planned = m.status === 'planned';
  const el = h(planned ? 'span.mn-mod.is-planned' : 'a.mn-mod', planned ? {} : { href: m.href });
  el.dataset.moduleId = m.id;
  if (m.id === here) { el.classList.add('is-here'); el.setAttribute('aria-current', 'page'); }
  el.append(...[   // a native append() prints null as "null" — filter first
    iconSpan('mn-mod-icon', m),
    h('span.mn-mod-text', {}, [
      h('span.mn-mod-label', { text: m.label }),
      m.purpose ? h('span.mn-mod-purpose', { text: m.purpose }) : null
    ]),
    planned ? h('span.mn-mod-flag', { text: 'SOON' }) : null
  ].filter(Boolean));
  return el;
}

function group(p, here, cls) {
  const sec = h('section.mn-group' + cls, { 'data-mn-phase': p.id, 'aria-labelledby': 'mn-g-' + p.id });
  sec.append(h('h3.mn-group-h', { id: 'mn-g-' + p.id }, [
    h('span.mn-dot', { 'aria-hidden': 'true' }),
    h('span', { text: p.label })
  ]));
  let sub = null;
  for (const m of p.modules || []) {
    if (m.group && m.group !== sub) sec.append(h('p.mn-sub', { text: m.group }));
    sub = m.group || null;
    sec.append(modRow(m, here));
  }
  return sec;
}

export function openGoTo(phaseId) {
  const here = hereModuleId();
  const body = h('div.mn-body');
  // the app-scope destinations, as one row of tiles
  const top = h('nav.mn-globals', { 'aria-label': 'Studio' });
  for (const g of globals()) {
    if (g.adminOnly && !isAdmin()) continue;   // the rail hides it too (shell.js syncAdminOnly)
    const a = h('a.mn-global', { href: g.href }, [iconSpan('mn-global-icon', g), h('span', { text: g.label })]);
    if (fileOf(g.href) === CURRENT && !(g.modules && g.modules.some((m) => m.id === here))) {
      a.classList.add('is-here'); a.setAttribute('aria-current', 'page');
    }
    top.append(a);
  }
  body.append(top);
  for (const p of phases()) body.append(group(p, here, '.sh-ph-' + p.hue));
  // shelves carry CATEGORY hues (.hue-*), never a phase class — the hue-class trap
  for (const s of shelves()) body.append(group(s, here, s.hue ? '.hue-' + s.hue : ''));

  let target = null;
  open('goto', 'Go to', body, {
    focus: () => {
      target = (phaseId && body.querySelector('[data-mn-phase="' + CSS.escape(phaseId) + '"]'))
        || body.querySelector('.mn-mod.is-here');
      return (target && target.matches('a') ? target : target && target.querySelector('a')) || null;
    }
  });
  /* Where you are, in view: the whole group (its stage heading too),
     just under the sticky header — measured, since the header's height
     is whatever its title and button make it. Nothing scrolls if the
     group is already on screen. */
  const box = body.closest('.mn-sheet');
  const sec = target && (target.closest('.mn-group') || target);
  if (box && sec) {
    const head = box.querySelector('.mn-head');
    const top = sec.getBoundingClientRect().top - box.getBoundingClientRect().top - (head ? head.offsetHeight : 0) - 8;
    const row = target.getBoundingClientRect();
    if (phaseId || row.bottom > box.getBoundingClientRect().bottom || top < 0) box.scrollTop += top;
  }
}

/* ---- TOOLS ----------------------------------------------------- */
export function openTools() {
  const bar = document.querySelector('.sh-bar');
  const body = h('div.mn-body.mn-tools');
  const take = [
    ['.sh-bar > .toolbar', 'This page'],
    ['.sh-bar > .sh-tools', 'Account and appearance']
  ];
  const plan = [];
  for (const [sel, label] of take) {
    const node = bar && document.querySelector(sel);
    if (!node) continue;
    const wrap = h('section.mn-tools-group', {}, [h('h3.mn-group-h', { text: label })]);
    body.append(wrap);
    plan.push({ node, parent: node.parentNode, next: node.nextSibling, wrap });
  }
  if (!plan.length) body.append(h('p.mn-empty', { text: 'This page has no tools of its own.' }));
  const s = open('tools', 'Tools', body);
  for (const b of plan) { b.wrap.append(b.node); s.borrowed.push({ node: b.node, parent: b.parent, next: b.next }); }
  const first = body.querySelector('button, a[href], select, input');
  if (first) first.focus();
}

/* ---- the bottom bar's items, for chrome.js -------------------- */
export function barItems() {
  return [
    { icon: '⌂', label: 'Home', href: 'index.html', id: 'home' },
    { icon: '☰', label: 'Go to', onClick: () => openGoTo(), id: 'goto', controls: true },
    { icon: '⌕', label: 'Search', id: 'search' },     // chrome.js wires the palette
    { icon: '⋯', label: 'Tools', onClick: () => openTools(), id: 'tools', controls: true }
  ];
}

/** The bar's state follows the sheets: aria-expanded on Go to / Tools,
 *  and aria-current on Home when this IS the hub. */
export function syncBar() {
  const bar = document.getElementById('mobileActionbar');
  if (!bar) return;
  for (const el of bar.querySelectorAll('[data-mn-item]')) {
    const k = el.dataset.mnItem;
    if (k === 'goto' || k === 'tools') el.setAttribute('aria-expanded', String(!!sheet && sheet.kind === k));
    if (k === 'home') { if (CURRENT === 'index.html') el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); }
  }
}

/** chrome.js calls these as the bar attaches and detaches. */
export function onBar(attached) {
  document.documentElement.classList.toggle('mn-on', !!attached);
  if (!attached) close();
  syncBar();
  window.dispatchEvent(new Event('resize'));
}

/* ---- wiring ----------------------------------------------------- */
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    if (!sheet) return;
    const t = e.target;
    if (t === sheet.overlay || (t.closest && t.closest('[data-mn="close"]'))) { close(); return; }
    // a destination in Go to: close first, so a same-page #hash lands
    // on an unlocked page and the sheet is not left over it
    if (sheet.kind === 'goto' && t.closest && t.closest('.mn-sheet a[href]')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet) { e.stopPropagation(); close(); }
  }, true);
  /* The crumb's stage segment opens that stage's menu on a desktop.
     On a phone the menu is the Go-to sheet, opened at that stage.
     Capture phase, so shell.js's own handler never runs here. */
  document.addEventListener('click', (e) => {
    if (!document.documentElement.classList.contains('mn-on')) return;
    const btn = e.target.closest && e.target.closest('[data-action="crumb-phase"]');
    if (!btn) return;
    e.preventDefault(); e.stopImmediatePropagation();
    openGoTo(btn.dataset.phase);
  }, true);
}

export default { openGoTo, openTools, barItems, onBar, syncBar };
