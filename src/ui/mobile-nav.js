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
import { phases, globals, shelves, moduleSections } from '../lib/navmodel.js';
import { projectRows, projectList, formatLabel } from './project-switcher.js';
import { markLocked } from '../lib/plan-gate.js';
import { holdFocus, releaseFocus } from './modal-focus.js';
import { isGlobalMode } from './shell.js';
import '../styles/mobile-nav.css';

const CURRENT = (() => {
  const f = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  return f === '' ? 'index.html' : (/\.html$/.test(f) ? f : f + '.html');   // cleanUrls: /settings
})();
const fileOf = (href) => String(href || '').split('#')[0].toLowerCase();

let sheet = null;          // { overlay, kind, borrowed: [{ node, parent, next }] }

/* ---- where am I ----------------------------------------------
   The shell already keeps this true (it publishes the module as
   `data-sh-module` on <html> as the hash and the scroll spy move), so the sheet reads
   that answer rather than deciding a second time. Fallback: the first
   module whose file is this page. */
function hereModuleId() {
  const at = document.documentElement.getAttribute('data-sh-module');
  if (at) return at;
  for (const p of [...phases(), ...shelves()]) for (const m of p.modules || []) if (fileOf(m.href) === CURRENT) return m.id;
  return null;
}

/* The same answer the rail's admin-only items read (shell.js). */
function isAdmin() {
  try { const c = window.StudioCloud; return !!(c && c.getGateState && c.getGateState().role === 'admin'); }
  catch (e) { return false; }
}

/* ---- the sheet frame ------------------------------------------ */
/* THE EXIT (19 Oct 2026). A drawer leaves the way it came, down by its
   own height, faster than it rose. Everything a caller can observe —
   `sheet` cleared, focus returned, the scroll lock lifted, onClose —
   still happens synchronously; only the pixels linger, and only under
   html.ma-on (motion wanted, a real browser: never under webdriver, so
   every proof still sees the overlay go at once). Borrowed band nodes
   go home AFTER the slide, so the Tools sheet does not empty as it
   leaves; open() flushes a pending exit first, so a new sheet can never
   borrow a node that is still inside the old one. */
let closing = null;        // { overlay, borrowed, returnTo, timer }
const animating = () => document.documentElement.classList.contains('ma-on');

function finishClose() {
  const c = closing;
  if (!c) return;
  closing = null;
  clearTimeout(c.timer);
  for (const b of c.borrowed) {
    if (b.next && b.next.parentNode === b.parent) b.parent.insertBefore(b.node, b.next);
    else b.parent.append(b.node);
  }
  c.overlay.remove();
  /* a node that held focus inside the sliding sheet lost it on the move */
  if (c.returnTo && c.returnTo.isConnected && (!document.activeElement || document.activeElement === document.body)) {
    try { c.returnTo.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
  }
  // the band's contents moved back: let the shell re-measure it
  window.dispatchEvent(new Event('resize'));
}

function close({ instant = false, ms = 0 } = {}) {
  if (!sheet) return;
  const s = sheet; sheet = null;
  releaseFocus(s.overlay);
  /* the opener named at open() wins over "whatever had focus": a button
     tapped in Safari is never focused, so the focus the trap remembered
     is <body> and would be dropped */
  if (s.returnTo && s.returnTo.isConnected && typeof s.returnTo.focus === 'function') s.returnTo.focus({ preventScroll: true });
  document.documentElement.classList.remove('mn-locked');
  finishClose();   // any earlier exit still sliding
  closing = { overlay: s.overlay, borrowed: s.borrowed, returnTo: s.returnTo, timer: 0 };
  if (instant || !animating()) finishClose();
  else {
    s.overlay.classList.add('is-closing');
    /* a leaving sheet is no longer a dialog: nothing in it takes focus
       and the page behind it is no longer hidden from a screen reader */
    s.overlay.inert = true;
    s.overlay.removeAttribute('aria-modal');
    s.overlay.addEventListener('transitionend', (e) => {
      if (e.target.classList && e.target.classList.contains('mn-sheet') && e.propertyName === 'transform') finishClose();
    });
    closing.timer = setTimeout(finishClose, Math.max(240, ms + 40));
  }
  syncBar();
  if (typeof s.onClose === 'function') { try { s.onClose(); } catch (e) { console.warn('[mobile-nav] onClose', e); } }
}

/* SWIPE DOWN TO DISMISS, from the sheet's header (never its scrolling
   body). The pointer is captured, a second finger is ignored, an upward
   pull gets friction rather than a wall, and the transform is set on
   the panel itself (not through an inherited variable). The scrim
   thins with the drag (its colour, not the overlay's opacity). It closes on a flick (release velocity > 0.11
   px/ms) or a quarter of the sheet's height, and the rest of the way
   runs at the finger's own speed (remaining distance / release
   velocity, 120-300ms) so a fast flick does not slow at the handoff;
   otherwise the CSS transition snaps it home. With --motion at 0
   nothing follows the finger; the release still closes past the
   threshold. */
function wireDrag(overlay, panel, head) {
  let drag = null;
  const still = () => getComputedStyle(document.documentElement).getPropertyValue('--motion').trim() === '0';
  head.addEventListener('pointerdown', (e) => {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest && e.target.closest('button, a, input, select, textarea')) return;
    const t = performance.now();
    drag = { id: e.pointerId, y: e.clientY, t, dy: 0, v: 0, py: e.clientY, pt: t, still: still() };
    try { head.setPointerCapture(e.pointerId); } catch (err) { /* capture is a nicety */ }
  });
  head.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    let dy = e.clientY - drag.y;
    if (dy < 0) dy = dy * 0.2;                 // friction past the open edge
    drag.dy = dy;
    /* release velocity: the latest stretch of the move, smoothed a little,
       not the average since the press (a slow start hid a fast flick) */
    const now = performance.now();
    const dt = now - drag.pt;
    if (dt > 0) {
      const v = (e.clientY - drag.py) / dt;
      drag.v = drag.v ? 0.6 * v + 0.4 * drag.v : v;
      drag.py = e.clientY; drag.pt = now;
    }
    if (drag.still) return;
    panel.style.transition = 'none';
    panel.style.transform = 'translateY(' + dy + 'px)';
    /* the SCRIM thins with the drag, not the overlay (the sheet is its
       child and must stay solid under the finger) */
    const left = Math.max(0, 1 - Math.max(0, dy) / Math.max(1, panel.offsetHeight));
    overlay.style.transition = 'none';
    overlay.style.backgroundColor = 'color-mix(in srgb, var(--scrim) ' + Math.round(left * 100) + '%, transparent)';
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null;
    /* a finger that stopped before lifting has no velocity left */
    const v = performance.now() - d.pt > 80 ? 0 : d.v;
    const h = Math.max(1, panel.offsetHeight);
    const go = d.dy > 0 && (d.dy > 0.25 * h || v > 0.11);
    if (go) {
      /* continue from where the finger left it, at its speed: the closing
         rule's transform and opacity are the destination; the inline ones
         are cleared on the next frame so the transitions run from here */
      let ms = 0;
      if (!d.still && v > 0) {
        const rest = Math.max(1, h - d.dy);
        ms = Math.round(Math.min(300, Math.max(120, rest / v)));
        /* an ease-out whose opening slope IS the finger's speed: for
           cubic-bezier(x1, 1, …) the start slope is 1/x1 (in units of
           rest/ms), so x1 = rest / (v * ms), kept inside 0.05-0.5 */
        const x1 = Math.min(0.5, Math.max(0.05, rest / (v * ms))).toFixed(3);
        const curve = 'cubic-bezier(' + x1 + ', 1, 0.3, 1)';
        panel.style.transition = 'transform ' + ms + 'ms ' + curve;
        overlay.style.transition = 'opacity ' + ms + 'ms ' + curve;
      } else {
        panel.style.transition = '';
        overlay.style.transition = '';
      }
      if (sheet && sheet.overlay === overlay) close({ ms });
      requestAnimationFrame(() => { panel.style.transform = ''; });
    } else {
      panel.style.transition = '';
      panel.style.transform = '';               // the transition snaps it back
      overlay.style.transition = 'background-color var(--speed) var(--ease-out)';
      overlay.style.backgroundColor = '';
    }
  };
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
}

/* THE ONE SHEET FRAME, exported for the section menu's phone list
   (src/ui/section-menu.js openSectionsSheet) as well as this file's own
   Go to and Tools: overlay, header with a close button, focus trap,
   Escape and backdrop (wired below), scroll lock.
     kind     'goto' | 'tools' | any other word (a data attribute only)
     body     the element placed under the header
     focus    () => element to focus first (default: the close button)
     returnTo element that gets focus back on close
     onClose  called once, after the sheet is gone */
function open(kind, title, body, { focus, returnTo, onClose } = {}) {
  close({ instant: true });
  finishClose();
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
  wireDrag(overlay, panel, panel.querySelector('.mn-head'));
  document.body.append(overlay);
  document.documentElement.classList.add('mn-locked');
  sheet = { overlay, kind, borrowed: [], returnTo: returnTo || null, onClose: onClose || null };
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

function subRow(m, x) {
  const file = m.href.split('#')[0];
  const el = h('a.mn-mod.is-sub', { href: file + '#' + x.id }, [
    iconSpan('mn-mod-icon', { sym: x.sym }),
    h('span.mn-mod-text', {}, [h('span.mn-mod-label', { text: x.label })])
  ]);
  el.dataset.moduleId = m.id;   // markLocked: gated with its module
  const tab = (location.hash || '').replace(/^#/, '').split('?')[0];
  if (fileOf(file) === CURRENT && tab === x.id) { el.classList.add('is-here'); el.setAttribute('aria-current', 'page'); }
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
    /* the module's sections, as the rail's flyout lists them */
    if (m.status !== 'planned' && m.href) for (const x of moduleSections(m)) sec.append(subRow(m, x));
  }
  return sec;
}

export function openGoTo(phaseId) {
  const here = hereModuleId();
  const body = h('div.mn-body');
  // the app-scope destinations, as one row of tiles
  const top = h('nav.mn-globals', { 'aria-label': 'Studio' });
  /* On a global page (library, settings, admin, purchase, the hub) the
     desktop shell hides every project item; the sheet follows it. */
  const globalPage = isGlobalMode();
  for (const g of globals()) {
    if (globalPage && g.id === 'dashboard') continue;
    if (g.adminOnly && !isAdmin()) continue;   // the rail hides it too (shell.js syncAdminOnly)
    const a = h('a.mn-global', { href: g.href }, [iconSpan('mn-global-icon', g), h('span', { text: g.label })]);
    if (fileOf(g.href) === CURRENT && !(g.modules && g.modules.some((m) => m.id === here))) {
      a.classList.add('is-here'); a.setAttribute('aria-current', 'page');
    }
    top.append(a);
  }
  body.append(top);
  /* the open project first, and every other one to switch to */
  const { list, current } = projectList();
  const proj = h('section.mn-group.mn-project', { 'data-mn-phase': 'project', 'aria-labelledby': 'mn-g-project' });
  proj.append(h('h3.mn-group-h', { id: 'mn-g-project' }, [
    h('span', { text: 'Project: ' + (current ? (current.title || 'Untitled') + ' · ' + formatLabel(current.format) : 'none open') + ' · Switch' })
  ]));
  if (list.length) proj.append(...projectRows());
  proj.append(h('a.ps-link', { href: 'index.html', text: list.length ? '+ New project' : 'No project — start one' }));
  /* the band's project pill opens the sheet HERE, on a global page too */
  if (!globalPage || phaseId === 'project') body.append(proj);
  if (!globalPage) for (const p of phases()) body.append(group(p, here, '.sh-ph-' + p.hue));
  // shelves carry CATEGORY hues (.hue-*), never a phase class — the hue-class trap
  for (const s of shelves()) body.append(group(s, here, s.hue ? '.hue-' + s.hue : ''));

  markLocked(body);   // PLAN flag on a module the plan does not include
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
    ['.sh-bar > .sh-tools', 'Account and appearance'],
    /* Backup and sync live in the rail's foot (21 Oct 2026); the rail is
       never opened on a phone (the burger opens Go to), so they are
       borrowed here like the band's zone. */
    ['#studioRail .sh-rail-tools', 'Backup and sync']
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
  /* The same four cells on EVERY page, global pages included (owner,
     14 Oct 2026): Home / Go to / Search / Tools. A global page used to
     swap Search for Settings; Settings is reached from Go to and from
     the band like any other global destination, and the palette is
     wired on every page by chrome.js, so Search works here too. */
  return [
    { icon: '⌂', sym: 'home', label: 'Home', href: 'index.html', id: 'home' },
    { icon: '☰', sym: 'menu', label: 'Go to', onClick: () => openGoTo(), id: 'goto', controls: true },
    { icon: '⌕', sym: 'search', label: 'Search', id: 'search' },     // chrome.js wires the palette
    { icon: '⋯', sym: 'more_horiz', label: 'Tools', onClick: () => openTools(), id: 'tools', controls: true }
  ];
}

/** The bar's state follows the sheets: aria-expanded on Go to / Tools,
 *  and aria-current on Home when this IS the hub. */
function syncBurger(open) {
  const b = document.getElementById('railToggle');
  if (b && b.hasAttribute('aria-haspopup')) b.setAttribute('aria-expanded', String(!!open));
}

export function syncBar() {
  /* the band may be built after the bar attached: state it every time
     (both directions are idempotent) */
  burgerFor(document.documentElement.classList.contains('mn-on'));
  syncBurger(!!sheet && sheet.kind === 'goto');
  const bar = document.getElementById('mobileActionbar');
  if (!bar) return;
  for (const el of bar.querySelectorAll('[data-mn-item]')) {
    const k = el.dataset.mnItem;
    if (k === 'goto' || k === 'tools') el.setAttribute('aria-expanded', String(!!sheet && sheet.kind === k));
    if (k === 'home') { if (CURRENT === 'index.html') el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); }
  }
}

/* THE BAND'S BURGER on a phone opens Go to, not the desk's rail drawer
   (the rail is a 64px icon column with hover flyouts; the sheet is the
   phone's map). Its ARIA follows what it opens, and is put back when
   the bar detaches. */
function burgerFor(attached) {
  const b = document.getElementById('railToggle');
  if (!b) return;
  if (attached) {
    if (b.dataset.mnControls !== undefined) return;   // already the phone's
    b.dataset.mnControls = b.getAttribute('aria-controls') || '';
    b.removeAttribute('aria-controls');
    b.setAttribute('aria-haspopup', 'dialog');
    b.setAttribute('aria-label', 'Go to');
  } else if (b.dataset.mnControls !== undefined) {
    if (b.dataset.mnControls) b.setAttribute('aria-controls', b.dataset.mnControls);
    b.removeAttribute('aria-haspopup');
    b.setAttribute('aria-label', 'Studio menu');
    delete b.dataset.mnControls;
  }
}

/** chrome.js calls these as the bar attaches and detaches. */
export function onBar(attached) {
  document.documentElement.classList.toggle('mn-on', !!attached);
  burgerFor(!!attached);
  if (!attached) close({ instant: true });
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
    if (e.key !== 'Escape' || !sheet) return;
    /* A dialog, the palette or a menu opened from inside the sheet is
       above it, and Escape is theirs: this listener was registered at
       import, so it runs before the ones they add at open, and
       stopPropagation does not stop a later listener on the same node.
       One Escape used to cancel the dialog AND drop the sheet under it,
       sending focus to a button that was display:none by then. */
    if (document.querySelector('.modal-overlay.show:not(.is-closing), #studioPalette:not([hidden]), body.pal-open, .tb-menu-panel:not([hidden]), .switcher-dropdown:not([hidden])')) return;
    e.stopPropagation(); close();
  }, true);
  /* The crumb's stage segment opens that stage's menu on a desktop.
     On a phone the menu is the Go-to sheet, opened at that stage.
     Capture phase, so shell.js's own handler never runs here. */
  /* The same for the phone's top bar (Swiss, 14 Oct 2026): the burger
     opens Go to, and the project pill opens it at the project, whose
     rows are the switcher's own (projectRows) — one list, two doors.
     Only IN THE BAND: the same pill borrowed into the Tools sheet keeps
     its own dropdown. */
  document.addEventListener('click', (e) => {
    if (!document.documentElement.classList.contains('mn-on')) return;
    const t = e.target;
    if (!t.closest) return;
    const btn = t.closest('[data-action="crumb-phase"]');
    if (btn) { e.preventDefault(); e.stopImmediatePropagation(); openGoTo(btn.dataset.phase); return; }
    const burger = t.closest('.sh-bar [data-action="rail-toggle"]');
    if (burger) { e.preventDefault(); e.stopImmediatePropagation(); openGoTo(); return; }
    const ps = t.closest('.sh-bar .ps-btn');
    if (ps) { e.preventDefault(); e.stopImmediatePropagation(); openGoTo('project'); }
  }, true);
}

export { open as openSheet, close as closeSheet };
export default { openGoTo, openTools, barItems, onBar, syncBar, openSheet: open, closeSheet: close };
