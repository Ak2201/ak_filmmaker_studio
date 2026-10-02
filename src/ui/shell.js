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
import { openPalette } from './palette.js';

const RAIL_KEY = 'fms_studio_rail_open_v1';
const NARROW = '(max-width: 1099px)';

const CURRENT = (() => {
  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  return file === '' ? 'index.html' : file;
})();

/* ---- WHERE AM I -------------------------------------------
   The complaint this answers is literally "I don't know where I
   am". Two things made that true and both are structural, not
   cosmetic:

   1. Twenty-four modules live on thirteen pages, so the FILE does
      not identify the module. breakdown.html is Scene List *and*
      Elements; plan.html is Calendar, Media *and* Locations, and
      those last two are not even in the same phase. A tint on a tab
      cannot say which of three you are looking at.
   2. The only indicator was `.is-active` on one phase tab out of
      six — the same shape, the same size, one border-colour apart.

   So the shell now states the location in words, as a breadcrumb,
   and keeps that statement true while you move around inside a
   page. Everything below is that one job. ---------------------- */

/** The global (app-scope) destination this page is, if it is one. */
function globalHere() {
  return nav.global.find((g) => g.href.toLowerCase().split('#')[0] === CURRENT) || null;
}

/**
 * Resolve the current location.
 *
 * `hash` is passed in rather than read, because the scroll spy asks
 * this question about a section you have scrolled to, not about the
 * address bar.
 *
 * Order matters. An exact fragment match is the only ANSWER; the
 * other two branches are fallbacks, and they are returned with
 * exact:false so the hash/scroll tracking below knows not to
 * overwrite a real answer with a guess.
 */
function resolveLocation(hash = location.hash) {
  for (const phase of nav.phases) {
    for (const m of phase.modules) {
      if (!m.href) continue;
      const [file, frag] = m.href.split('#');
      if (file.toLowerCase() !== CURRENT) continue;
      if (frag && '#' + frag !== hash) continue;
      return { phase, module: m, global: null, exact: true };
    }
  }
  /* A page that is an app-scope destination in its own right says so
     before it borrows a phase. library.html with no fragment used to
     resolve to "Plan › Budget" purely because the Budget module links
     to library.html#calculator — the breadcrumb's first honest run
     would have announced the Library as part of Plan. */
  const g = globalHere();
  if (g) return { phase: null, module: null, global: g, exact: false };

  for (const phase of nav.phases) {
    for (const m of phase.modules) {
      if (m.href && m.href.split('#')[0].toLowerCase() === CURRENT) {
        return { phase, module: m, global: null, exact: false };
      }
    }
  }
  return { phase: null, module: null, global: null, exact: false };
}

/* ---- the module rows inside a phase dropdown --------------- */

function moduleRow(m) {
  const planned = m.status === 'planned';
  const el = h(planned ? 'button.sh-mod.planned' : 'a.sh-mod', planned
    ? { type: 'button', 'data-action': 'module-planned', 'data-module': m.id }
    : { href: m.href });
  el.dataset.moduleId = m.id;
  el.append(
    h('span.sh-mod-icon', { text: m.icon || '·', 'aria-hidden': 'true' }),
    h('span.sh-mod-label', { text: m.label }),
    h('span.sh-mod-purpose', { text: m.purpose })
  );
  if (m.status !== 'built') {
    el.append(h('span.sh-mod-flag', { text: m.status === 'partial' ? 'PARTIAL' : 'SOON' }));
  }
  return el;
}

function phaseTab(phase, active) {
  const wrap = h(`div.sh-phase.sh-ph-${phase.hue}` + (active ? '.is-active' : ''), {
    'data-phase': phase.id
  });
  const btn = h('button.sh-phase-btn', {
    type: 'button',
    'data-action': 'phase-toggle',
    'data-phase': phase.id,
    'aria-expanded': 'false',
    'aria-haspopup': 'true'
  });
  btn.append(h('span.sh-phase-dot', { 'aria-hidden': 'true' }),
             h('span.sh-phase-label', { text: phase.label }));
  const menu = h('div.sh-phase-menu', { hidden: true, role: 'menu', 'aria-label': phase.label });
  menu.append(h('div.sh-phase-menu-head', { text: phase.blurb }));
  phase.modules.forEach((m) => menu.append(moduleRow(m)));
  wrap.append(btn, menu);
  return wrap;
}

/* ---- the breadcrumb ----------------------------------------
   Studio › Phase › Module, with the module's own purpose after it
   where there is room. Rebuilt wholesale on every update rather
   than patched in place: three text nodes and two classes is
   cheaper to re-create than to keep consistent, and a stale
   breadcrumb is worse than none.

   The phase segment is a real control — it opens that phase's
   menu. "Where am I" and "what else is next to me" are the same
   question asked half a second apart. */

function crumbStep(tag, cls, icon, label, props = {}) {
  const el = h(`${tag}.sh-where-step${cls}`, props);
  el.append(
    h('span.sh-where-icon', { text: icon || '·', 'aria-hidden': 'true' }),
    h('span.sh-where-text', { text: label })
  );
  return el;
}

function renderCrumb(crumb, loc) {
  crumb.textContent = '';
  crumb.className = 'sh-where' + (loc.phase ? ` sh-ph-${loc.phase.hue}` : '');

  const home = nav.global[0];
  const here = loc.module || loc.global;
  /* On the hub itself the root IS the destination. "Studio › Home"
     is two names for one place and reads like a bug. */
  const atHome = here === home;

  crumb.append(crumbStep(atHome ? 'span' : 'a', '.sh-where-root' + (atHome ? '.sh-where-here' : ''),
    home.icon, 'Studio',
    atHome ? { 'aria-current': 'page', title: home.purpose } : { href: home.href, title: home.purpose }));

  if (atHome) {
    crumb.append(h('span.sh-where-purpose', { text: home.purpose }));
    return;
  }

  if (loc.phase) {
    crumb.append(h('span.sh-where-sep', { text: '›', 'aria-hidden': 'true' }));
    crumb.append(crumbStep('button', '.sh-where-phase', loc.phase.icon, loc.phase.label, {
      type: 'button',
      'data-action': 'crumb-phase',
      'data-phase': loc.phase.id,
      'aria-haspopup': 'true',
      title: loc.phase.blurb
    }));
  }

  if (here) {
    crumb.append(h('span.sh-where-sep', { text: '›', 'aria-hidden': 'true' }));
    crumb.append(crumbStep('span', '.sh-where-here', here.icon, here.label, {
      'aria-current': 'page'
    }));
    if (here.purpose) crumb.append(h('span.sh-where-purpose', { text: here.purpose }));
  }
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
  const bar = h('div.sh-bar', { role: 'navigation', 'aria-label': 'Studio navigation' });
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

  const crumb = h('nav#studioWhere.sh-where', { 'aria-label': 'You are here' });
  renderCrumb(crumb, active);
  bar.append(crumb);

  const tabs = h('div.sh-phases');
  nav.phases.forEach((p) => tabs.append(phaseTab(p, active.phase && active.phase.id === p.id)));
  bar.append(tabs);

  /* The palette's handle. ⌘K is the fast way in and it is also
     invisible: a shortcut nobody has been told about is a feature
     that does not exist for most of the people using the app. So
     the binding gets a control, the control states the key it
     stands for, and the key keeps working for everyone who has
     learned it.

     It sits at the END of the bar rather than next to the
     breadcrumb on purpose. The crumb answers "where am I"; this
     answers "take me somewhere else", and they are opposite
     questions that should not share an edge. */
  /* ⌘ on a Mac, Ctrl everywhere else. A key cap printing the
     wrong modifier is worse than no key cap: it teaches a binding
     that does nothing, and the person concludes the feature is
     broken rather than that the label is. navigator.platform is
     deprecated but is the only one of the three spellings present
     in every engine this app runs in, so all three are tried and
     the fallback is the one that is right more often. */
  const mac = (() => {
    try {
      const d = navigator.userAgentData;
      if (d && d.platform) return /mac/i.test(d.platform);
      return /mac/i.test(navigator.platform || navigator.userAgent || '');
    } catch (e) { return false; }
  })();
  const find = h('button.sh-find', {
    type: 'button',
    'data-action': 'palette-open',
    'aria-label': 'Search the studio',
    'aria-keyshortcuts': 'Meta+K Control+K',
    title: 'Search the studio  (' + (mac ? '⌘K' : 'Ctrl K') + ')'
  });
  find.append(h('span.sh-find-icon', { text: '⌕', 'aria-hidden': 'true' }),
              h('span.sh-find-label', { text: 'Search', 'aria-hidden': 'true' }),
              h('kbd.sh-find-key', { text: mac ? '⌘K' : 'Ctrl K', 'aria-hidden': 'true' }));
  bar.append(find);
  return bar;
}

/* ---- keeping the statement true ----------------------------
   A breadcrumb that is right at load and wrong thereafter is worse
   than no breadcrumb: it is a confident lie, and the user's whole
   complaint is that they cannot trust the chrome to tell them
   where they are. Two things move the location without a page
   load, so two things have to move the indicator.

   (1) THE HASH. Following an in-page link to breakdown.html#elements
       genuinely puts you in Elements, so the crumb follows it — but
       ONLY when the new hash resolves to a real module. A blueprint
       hash like #step-7 resolves to nothing, and the fallback branch
       of resolveLocation() would then snap the crumb back to the
       first module on the page. Hence `exact`: an inexact resolution
       is never allowed to overwrite an exact one.

   (2) SCROLLING. This is the case that actually bites. Thirteen of
       the twenty-four modules are fragments of a shared page, and
       nothing changes the hash when you scroll from Scene List down
       into Elements — the address bar, and therefore every
       hash-only indicator, would still say Scene List while you are
       plainly looking at something else. So the fragment targets
       get an IntersectionObserver, the same one the step rail uses.

   The spy attaches only where a page has TWO or more module
   fragments, because with one there is no second state to spy on
   and re-labelling the whole of library.html "Plan › Budget"
   because you scrolled past one anchor would be a regression.

   What the spy deliberately does NOT do is write the hash. Nothing
   here touches history or localStorage: this is a read of where you
   are, not a navigation. */

let current = null;         // the last resolution we displayed
let crumbEl = null;

function paintLocation(loc) {
  current = loc;
  if (crumbEl) renderCrumb(crumbEl, loc);

  document.querySelectorAll('.sh-phase').forEach((tab) => {
    tab.classList.toggle('is-active', !!loc.phase && tab.dataset.phase === loc.phase.id);
  });
  document.querySelectorAll('.sh-mod').forEach((row) => {
    const on = !!loc.module && row.dataset.moduleId === loc.module.id;
    row.classList.toggle('is-here', on);
    if (on) row.setAttribute('aria-current', 'true');
    else row.removeAttribute('aria-current');
  });
  measureBar();
}

function goTo(loc) {
  if (!loc || (current && current.module === loc.module && current.global === loc.global)) return;
  paintLocation(loc);
}

/**
 * Every distinct fragment this page's modules point at, in DOM order.
 *
 * Resolved on every tick rather than captured once, because the
 * sections come and go: breakdown.html has no #scenes until a scene
 * exists. A list captured at mount is a list that is wrong for the
 * user who adds their first scene.
 */
function fragmentTargets() {
  const seen = new Map();
  for (const phase of nav.phases) {
    for (const m of phase.modules) {
      if (!m.href) continue;
      const [file, frag] = m.href.split('#');
      if (!frag || file.toLowerCase() !== CURRENT || seen.has(frag)) continue;
      const el = document.getElementById(frag);
      if (el) seen.set(frag, el);
    }
  }
  return [...seen.entries()].sort(
    (a, b) => a[1].getBoundingClientRect().top - b[1].getBoundingClientRect().top
  );
}

/**
 * Which fragment are you looking at? Null when the question does not
 * apply — fewer than two module sections on the page.
 *
 * NOT an IntersectionObserver band, although that is what the step
 * rail uses and what this was first written as. A band at the top
 * third of the viewport answers "what is under the top third", which
 * is a different question, and it gets the most common case wrong:
 * click Elements in the phase menu on a breakdown with two scenes and
 * the browser scrolls as far as it can — which is not far enough to
 * put Elements under the band. The observer then reported Scene List
 * while Elements filled the lower half of the screen, and, worse,
 * overwrote the correct answer the hashchange had just produced.
 *
 * So: the last section to have crossed the line, EXCEPT at the foot
 * of the document, where nothing can cross it any more and the
 * answer is the last section actually on screen. That is the case a
 * band cannot express, and it is the one a short page is always in.
 */
function spyFragment() {
  const targets = fragmentTargets();
  if (targets.length < 2) return null;
  const vh = window.innerHeight;
  const de = document.documentElement;
  let best = null;
  if (window.scrollY + vh >= de.scrollHeight - 4) {
    for (const [frag, el] of targets) {
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) best = frag;
    }
  } else {
    const line = vh * 0.3;
    for (const [frag, el] of targets) {
      if (el.getBoundingClientRect().top <= line) best = frag;
    }
    if (!best) best = targets[0][0];
  }
  return best;
}

function runSpy() {
  const frag = spyFragment();
  if (!frag) return;
  const loc = resolveLocation('#' + frag);
  if (loc.exact) goTo(loc);
}

/* The bar's height is measured, not assumed.

   `.toolbar` sits at `top: var(--sh-bar-h)`, and that was a literal
   56px — true only while the bar is one row. It already was not: six
   phase tabs wrap below about 900px, so between there and the
   breakpoint the page toolbar has been sliding under the shell. The
   breadcrumb makes the bar wrap sooner, so this stops being a latent
   bug and becomes a visible one. Measure it and publish it, which is
   what the working notes always claimed happened.

   A plain resize listener rather than a ResizeObserver: the height
   only changes with the viewport, and an observer that writes a
   custom property affecting layout is one notification loop away
   from a console error the verify gate counts. */
let lastBarH = 0;
function measureBar() {
  const bar = document.querySelector('.sh-bar');
  if (!bar) return;
  const px = Math.round(bar.getBoundingClientRect().height);
  if (px && px !== lastBarH) {
    lastBarH = px;
    document.documentElement.style.setProperty('--sh-bar-h', px + 'px');
  }
  /* main's measureChrome() replaces the --sh-stick-h half that used
     to be here. It measures the WHOLE pinned band rather than this
     one bar, and feeds a single scroll-padding-top — see the note on
     the function itself. */
  measureChrome();
}

/* THE WHOLE PINNED BAND, for the same reason and one layer out.

   --sh-bar-h answers "where does the page toolbar park". It does not
   answer "how much of the top of the viewport is covered", and that
   is the number every in-page jump needs. Following #projects put the
   section's top edge at y=0 — underneath the whole pinned stack: 118
   to 158px on the hub depending on whether the toolbar has wrapped,
   118px on the library, 226px on study.html — so the eyebrow and the
   heading of the section you asked for were the two things guaranteed
   to be hidden, and you landed mid-paragraph. Measured before the
   fix: all six of the hub's nav actions, all five of the library's,
   and every `scrollIntoView({ block: 'start' })` in the app, which is
   the step rail and the jump menu too.

   The fix is `scroll-padding-top` on the scroll container, which the
   browser applies to fragment navigation, scrollIntoView and scroll
   snapping alike — ONE rule rather than a scroll-margin on each
   target, because a hand-kept list of every anchor in the app is
   wrong by the second section anybody adds.

   WHAT COUNTS AS THE BAND, and why it is derived rather than listed.
   A band is a sticky or fixed element that is (a) laid out as a top
   chrome layer — a direct child of #app, of <body> or of <main> —
   (b) anchored to a `top` offset rather than a side, and (c) wide
   enough to span the page. Those three things are true of .sh-bar,
   of .toolbar and of study.html's .ds-bar, and false of the two
   sticky things that are NOT chrome you scroll under: stripboard's
   .sb-grid-name is anchored left, and the workbench's .wb-ref is a
   third of the width and nested deeper. Naming the four selectors
   would have been shorter and would have gone stale the first time a
   page grew a fifth bar.

   Each candidate's bottom is its computed `top` plus its height, not
   its current rect: the bar is only pinned once you have scrolled,
   and the measurement has to be right at the top of the document,
   which is exactly when a fragment jump is about to happen.

   The width and position tests are what make this correct at every
   breakpoint for free, and they are the reason this reads the cascade
   rather than a breakpoint of its own. Below 720px both .sh-bar and
   .toolbar are `relative` — deliberately, so the phase and toolbar
   menus can pin themselves to the bar — so nothing is pinned, the
   band measures 0, and a jump gets no padding, which is right: that
   is the width at which the chrome scrolls away on purpose. Measured
   across the breakpoints: 118px at 1280, 158px at 900 (the toolbar
   wraps), 110px at 800, 0 from 719px down. A rule keyed to a
   hard-coded 1100px or 560px would have had to be kept in step with
   three other files; this one cannot drift. */
let lastBand = -1;
function measureChrome() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const de = document.documentElement;
  let band = 0;
  /* A small, structural candidate set rather than a walk of the
     document: this runs on resize frames, and the hub is several
     thousand nodes. */
  for (const el of document.querySelectorAll('#app > *, body > *, main > *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'sticky' && cs.position !== 'fixed') continue;
    const top = parseFloat(cs.top);
    if (!Number.isFinite(top) || top < 0 || top > vh / 2) continue;
    const r = el.getBoundingClientRect();
    /* A row of chrome is at least a line of text tall. The floor is
       what keeps .reading-progress out of the sum — 2px, fixed, full
       width, and not a thing anything is hidden behind. */
    if (r.height < 16 || r.width < vw * 0.5) continue;
    band = Math.max(band, Math.round(top + r.height));
  }
  if (band === lastBand) return;
  lastBand = band;
  de.style.setProperty('--sh-chrome-h', band + 'px');
}

/* ---- open / closed ----------------------------------------- */

const isNarrow = () => window.matchMedia(NARROW).matches;

function setRail(open) {
  const was = document.body.classList.contains('rail-shown');
  document.body.classList.toggle('rail-shown', open);
  const btn = document.getElementById('railToggle');
  if (btn) btn.setAttribute('aria-expanded', String(open));
  // Only the wide-screen preference is worth keeping. Restoring "open"
  // on a phone would put a fifth of the screen of navigation over the
  // page on arrival.
  if (!isNarrow()) {
    try { localStorage.setItem(RAIL_KEY, open ? '1' : '0'); } catch (e) {}
  }
  /* Below the breakpoint the rail is a drawer over the page, so it
     behaves like one: focus moves into it on open and back to the
     control that opened it on close. Without this, tabbing from an
     open drawer walks straight into the toolbar it is covering —
     you are typing into controls you cannot see. */
  if (!isNarrow() || was === open) return;
  const at = document.activeElement;
  if (open) {
    const first = document.querySelector('#studioRail a');
    if (first) first.focus();
  } else if (btn && at && (at.closest('#studioRail') || at.classList.contains('sh-scrim'))) {
    btn.focus();
  }
}

/** Keep Tab inside the drawer while the drawer is over the page. */
function trapRailFocus(e) {
  if (e.key !== 'Tab' || !isNarrow()) return;
  if (!document.body.classList.contains('rail-shown')) return;
  const rail = document.getElementById('studioRail');
  if (!rail) return;
  /* The toggle is part of the drawer for focus purposes: it is the
     control that closes it, and it sits outside the rail element —
     last, because that is where it is in the document.

     Every Tab is handled, not just the two at the ends. The first
     version only intercepted the edges, which leaves the toggle —
     the FIRST stop — free to Tab forward into the page underneath:
     measured, focus left the drawer on the second press. A trap with
     one open side is not a trap. */
  const stops = [...rail.querySelectorAll('a[href], button:not([disabled])')];
  const toggle = document.getElementById('railToggle');
  if (toggle) stops.push(toggle);
  if (!stops.length) return;
  e.preventDefault();
  const at = stops.indexOf(document.activeElement);
  const step = e.shiftKey ? -1 : 1;
  const next = at < 0 ? (e.shiftKey ? stops.length - 1 : 0)
                      : (at + step + stops.length) % stops.length;
  stops[next].focus();
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

  delegate(document, 'click', '[data-action="palette-open"]', (e) => {
    e.preventDefault();
    openPalette();
  });

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

  // Tapping the dimmed page puts the drawer away — the gesture every
  // drawer has, and the reason the scrim is a real element rather
  // than a ::before nobody can click.
  delegate(document, 'click', '[data-action="rail-close"]', () => setRail(false));

  // The breadcrumb's phase segment opens that phase's own menu. It is
  // the same control as the tab, reached from the place you were
  // already reading to find out where you are.
  delegate(document, 'click', '[data-action="crumb-phase"]', (e, btn) => {
    const tab = document.querySelector(`.sh-phase[data-phase="${CSS.escape(btn.dataset.phase)}"]`);
    if (!tab) return;
    const menu = tab.querySelector('.sh-phase-menu');
    const open = menu.hidden;
    closeAllMenus(menu);
    menu.hidden = !open;
    const tabBtn = tab.querySelector('.sh-phase-btn');
    if (tabBtn) tabBtn.setAttribute('aria-expanded', String(open));
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
    // .sh-where-phase opens a menu too, so a click on it must not be
    // treated as a click "outside" — the generic close below runs
    // after the delegate above and would shut what it just opened.
    if (!e.target.closest('.sh-phase, .sh-where-phase')) closeAllMenus();
    // Narrow: the rail is a temporary overlay, so following a link or
    // tapping the page puts it away again.
    if (!isNarrow()) return;
    if (e.target.closest('#studioRail a')) { setRail(false); return; }
    if (!e.target.closest('#studioRail, [data-action="rail-toggle"]')) setRail(false);
  });
  document.addEventListener('keydown', (e) => {
    trapRailFocus(e);
    if (e.key !== 'Escape') return;
    closeAllMenus();
    if (isNarrow()) setRail(false);
  });

  // Crossing the breakpoint changes what "open" means, so re-decide.
  window.matchMedia(NARROW).addEventListener('change', () => {
    setRail(initialRail());
    measureBar();
  });

  /* The address bar is one of the two things that move the location
     without a page load. An inexact resolution never overwrites an
     exact one: see the note above resolveLocation(). */
  window.addEventListener('hashchange', () => {
    const loc = resolveLocation();
    if (loc.exact || !current || !current.exact) goTo(loc);
  });

  let raf = 0;
  window.addEventListener('resize', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; measureBar(); runSpy(); });
  });

  /* Scrolling is the other thing that moves you without a page load,
     and on the fragment pages it is the one that happens. Passive and
     rAF-throttled: this reads geometry and paints chrome, it never
     writes storage or history. */
  let sraf = 0;
  window.addEventListener('scroll', () => {
    if (sraf) return;
    sraf = requestAnimationFrame(() => { sraf = 0; runSpy(); });
  }, { passive: true });
}

/** Mount the shell around the page's own content. Idempotent. */
export function mountShell() {
  if (document.querySelector('.sh-rail')) return;
  const app = document.getElementById('app') || document.body;
  const active = resolveLocation();
  current = active;

  /* The page's palette is decided ONCE, at load. The crumb follows
     the hash and the scroll; --data-phase deliberately does not.
     plan.html holds Calendar and Media (Plan) and Locations (Shoot),
     so a scroll-following data-phase would repaint every accent on
     the page mid-scroll — a whole-page colour change to report a
     change of section is a worse answer than the section not being
     coloured. The crumb carries its own .sh-ph-* class, so the
     breadcrumb's hue is right either way. */
  if (active.phase) document.documentElement.setAttribute('data-phase', active.phase.id);

  const rail = buildRail();
  const bar = buildBar(active);
  const scrim = h('button.sh-scrim', {
    type: 'button',
    'data-action': 'rail-close',
    tabindex: '-1',
    'aria-hidden': 'true'
  });
  app.insertBefore(bar, app.firstChild);
  app.insertBefore(rail, app.firstChild);
  app.insertBefore(scrim, app.firstChild);

  crumbEl = bar.querySelector('#studioWhere');
  document.body.classList.add('has-sh-shell');
  wire();
  setRail(initialRail());
  paintLocation(active);
  /* Two frames: one for layout, one for the web fonts to land. The
     bar is measured, and measuring it before Fraunces and JetBrains
     Mono arrive records the fallback's height. The spy runs on the
     same schedule because mountShell() is not always called after the
     page has rendered — dashboard.js mounts at import time, when #app
     is still empty, the same trap chrome.js records one level up. */
  /* Synchronously first. The two rAF passes below are for layout
     and for the web fonts, and they are still right — but a rAF
     does not run at all while the tab is hidden, and --sh-stick-h
     feeds --scroll-offset. A page restored into a background tab
     would otherwise have no anchor offset until it was looked at. */
  measureBar();
  runSpy();
  requestAnimationFrame(() => {
    measureBar();
    runSpy();
    requestAnimationFrame(() => { measureBar(); runSpy(); });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureBar).catch(() => {});
  return bar;
}

export default { mountShell };
