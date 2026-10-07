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
import announce from '../data/announcements.json';
import { h, delegate } from '../lib/dom.js';
import { iconSpan } from './icon.js';
import Store from '../lib/store.js';
import { openPalette } from './palette.js';
import { installTabs } from './tabs.js';
import { moduleGroups, guideStops } from '../lib/navmodel.js';

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

/** The modules this page hosts, in navigation order, with their fragment. */
/* Two kinds of group own modules: the five stages, and an app-scope
   entry in nav.global that carries a `modules` array of its own (the
   Library holding Case Studies, Dissection and the Glossary). A module
   of the second kind resolves with phase:null and global:<that entry>,
   and the crumb reads "Studio › Library › Dissection". Tolerant of the
   array being absent, so the file works with either navigation.json. */
function hereModules() {
  const out = [];
  const add = (phase, global, list) => {
    for (const m of list || []) {
      if (!m || !m.href) continue;
      const [file, frag] = m.href.split('#');
      if (file.toLowerCase() === CURRENT) out.push({ phase, global, module: m, frag: frag || '' });
    }
  };
  for (const phase of nav.phases) add(phase, null, phase.modules);
  for (const g of nav.global) if (Array.isArray(g.modules)) add(null, g, g.modules);
  return out;
}

/** Laid out and not inside anything hidden — a tab that is not the
    open one, a section not rendered yet. getClientRects() is empty for
    every display:none ancestor, which is what `hidden` resolves to. */
function isShown(el) {
  return !!el && el.isConnected && el.getClientRects().length > 0;
}

/**
 * Resolve the current location.
 *
 * `hash` is passed in rather than read, because the scroll spy asks
 * this question about a section you have scrolled to, not about the
 * address bar.
 *
 * SEVERAL PAGES HOST MODULES FROM TWO PHASES — contacts.html is
 * Contacts (Pre-Production) and Call Sheets (Production); story.html,
 * stripboard.html and reports.html each straddle two stages as well.
 * Which of those you are in is answered in this order, and only the
 * first two are an ANSWER (exact:true):
 *
 *   1. the hash names a module's fragment;
 *   2. the hash names something INSIDE a module's section (a scene
 *      row, a sub-heading) — that module owns it;
 *   — an app-scope page (the hub, the library) says so before it
 *     borrows a phase;
 *   3. a module with no fragment is the page itself (story.html's
 *      beats editor, feature.html's blueprint);
 *   4. the module whose section is the first one VISIBLE on the page.
 *      With tabs (src/ui/tabs.js) that is the open tab, which with no
 *      hash is the first one; without tabs, the first in document
 *      order. This is the branch that was missing: contacts.html with
 *      no hash used to come out as "Production › Call Sheets", because
 *      the scroll spy measured the hidden Call Sheets tab at top 0 and
 *      took it for the section you had scrolled to;
 *   5. the first of the page's modules in navigation order — the
 *      answer before the page has rendered anything at all.
 *
 * Nothing here names a page or a module; it is all derived from
 * navigation.json and the DOM, so a sixth two-phase page needs no edit.
 */
function resolveLocation(hash = location.hash) {
  const loc = resolveModule(hash);
  const part = blueprintPart();
  if (part) loc.part = part;
  return loc;
}

/* The blueprint part on screen: of the page's guide stops (each
   stage's `guide` entries that point at this file), the last whose
   anchor has crossed the reading line — or, with the hash naming
   something inside the document and nothing scrolled yet, the stop
   before it in document order. Null above the first part (the cover)
   and on every page that is not a blueprint. */
function blueprintPart() {
  const stops = guideStops(CURRENT);
  if (!stops.length) return null;
  const seen = new Set();
  const live = [];
  for (const st of stops) {
    if (seen.has(st.frag)) continue;   // short step 9 covers two stages: the first names it
    seen.add(st.frag);
    const el = document.getElementById(st.frag);
    if (isShown(el)) live.push({ ...st, el });
  }
  if (!live.length) return null;
  live.sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const line = window.innerHeight * 0.3;
  let best = null;
  for (const st of live) if (st.el.getBoundingClientRect().top <= line) best = st;
  if (!best) return null;
  return { phase: best.phase, guide: best.guide, frag: best.frag };
}

function resolveModule(hash) {
  const mods = hereModules();
  const want = (hash || '').replace(/^#/, '');
  if (want) {
    const hit = mods.find((x) => x.frag && x.frag === want);
    if (hit) return { phase: hit.phase, module: hit.module, global: hit.global, exact: true };
    let el = null;
    try { el = document.getElementById(decodeURIComponent(want)); } catch (e) { el = null; }
    if (el) {
      /* The innermost owning section wins, so a fragment nested in two
         module sections resolves to the closer one. */
      let best = null;
      for (const x of mods) {
        if (!x.frag) continue;
        const sec = document.getElementById(x.frag);
        if (sec && sec !== el && sec.contains(el) && (!best || best.sec.contains(sec))) best = { x, sec };
      }
      if (best) return { phase: best.x.phase, module: best.x.module, global: best.x.global, exact: true };
    }
  }
  /* A page that is an app-scope destination in its own right says so
     before it borrows a phase. library.html with no fragment used to
     resolve to "Plan › Budget" purely because the Budget module links
     to library.html#calculator — the breadcrumb's first honest run
     would have announced the Library as part of Plan. */
  const g = globalHere();
  if (g) return { phase: null, module: null, global: g, exact: false };

  const whole = mods.find((x) => !x.frag);
  if (whole) return { phase: whole.phase, module: whole.module, global: whole.global, exact: false };

  const shown = mods
    .map((x) => ({ x, el: document.getElementById(x.frag) }))
    .filter((y) => isShown(y.el))
    .sort((a, b) => (a.el === b.el ? 0
      : (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)));
  if (shown.length) {
    const { x } = shown[0];
    return { phase: x.phase, module: x.module, global: x.global, exact: false };
  }
  if (mods.length) return { phase: mods[0].phase, module: mods[0].module, global: mods[0].global, exact: false };
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
    iconSpan('sh-mod-icon', m),
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
    'aria-expanded': 'false'
  });
  btn.append(h('span.sh-phase-dot', { 'aria-hidden': 'true' }),
             h('span.sh-phase-label', { text: phase.label }));
  /* A disclosure of links, like the Sections panel below: no
     `role="menu"`, which promised arrow keys and one Tab stop that
     nothing here implements (UX audit L17). Tab walks the links,
     Escape closes, aria-expanded on the button says it is open. */
  const menu = h('div.sh-phase-menu', { hidden: true, role: 'group', 'aria-label': phase.label });
  menu.append(h('div.sh-phase-menu-head', { text: phase.blurb }));
  /* `group` on a module is a sub-heading (Pre-Production's Break down ·
     See it · Cost & staff it · Schedule it). A heading is printed when
     the group changes, so the JSON's order is the menu's order and a
     stage with no groups renders exactly as before. */
  let group = null;
  phase.modules.forEach((m) => {
    if (m.group && m.group !== group) {
      menu.append(h('div.sh-phase-menu-group', { text: m.group }));
    }
    group = m.group || null;
    menu.append(moduleRow(m));
  });
  /* "Guide for this stage": the blueprint parts that cover it. A
     cross-reference, not a module — its own row under a rule, with no
     data-module-id, so the plan flags and the "you are here" paint
     never treat it as one. */
  const guide = (phase.guide || []).filter((g) => g && g.href);
  if (guide.length) {
    const foot = h('div.sh-phase-menu-guide');
    foot.append(h('span.sh-guide-head', { text: 'Guide for this stage' }));
    const links = h('span.sh-guide-links');
    guide.forEach((g, i) => {
      if (i) links.append(h('span.sh-guide-sep', { text: '·', 'aria-hidden': 'true' }));
      links.append(h('a.sh-guide-link', { href: g.href, text: g.label }));
    });
    foot.append(links);
    menu.append(foot);
  }
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

/* Takes the ENTRY now, not a glyph string: the mark may be a
   ligature or a character and only iconSpan decides which. */
function crumbStep(tag, cls, entry, label, props = {}) {
  const el = h(`${tag}.sh-where-step${cls}`, props);
  el.append(
    iconSpan('sh-where-icon', entry),
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
    home, 'Studio',
    atHome ? { 'aria-current': 'page', title: home.purpose } : { href: home.href, title: home.purpose }));

  if (atHome) {
    crumb.append(h('span.sh-where-purpose', { text: home.purpose }));
  } else {
    if (loc.phase) {
      crumb.append(h('span.sh-where-sep', { text: '›', 'aria-hidden': 'true' }));
      crumb.append(crumbStep('button', '.sh-where-phase', loc.phase, loc.phase.label, {
        type: 'button',
        'data-action': 'crumb-phase',
        'data-phase': loc.phase.id,
        title: loc.phase.blurb
      }));
    } else if (loc.global && loc.module && loc.global !== home) {
      /* A module owned by an app-scope entry (Library › Dissection):
         the entry is the middle segment, as a link back to it. */
      crumb.append(h('span.sh-where-sep', { text: '›', 'aria-hidden': 'true' }));
      crumb.append(crumbStep('a', '.sh-where-group', loc.global, loc.global.label, {
        href: loc.global.href, title: loc.global.purpose || ''
      }));
    }

    if (here) {
      crumb.append(h('span.sh-where-sep', { text: '›', 'aria-hidden': 'true' }));
      crumb.append(crumbStep('span', '.sh-where-here', here, here.label, {
        'aria-current': 'page'
      }));
      /* On a blueprint, the part you are reading — "Part II ·
         Screenplay" on the feature, the stage alone on the short,
         whose steps are not grouped into parts. Derived from the
         stages' `guide` lists and the page's geometry (blueprintPart
         below), in the stage's own hue. */
      if (loc.part) {
        const pt = loc.part;
        crumb.append(h('span.sh-where-sep.sh-where-part-sep', { text: '›', 'aria-hidden': 'true' }));
        const seg = crumbStep('a', `.sh-where-part.sh-ph-${pt.phase.hue}`, pt.phase,
          (pt.guide.part ? 'Part ' + pt.guide.part + ' · ' : '') + pt.phase.label,
          { href: '#' + pt.frag, title: pt.guide.label });
        crumb.append(seg);
      } else if (here.purpose) crumb.append(h('span.sh-where-purpose', { text: here.purpose }));
    }
  }

  /* The last segment of the crumb is "what else is ON this page", for
     the pages that have sections. It is RE-APPENDED rather than
     rebuilt, because the crumb is thrown away and re-created on every
     hashchange and every scroll tick (see the note above), and the
     rows inside this menu are the page's own anchors — moved, not
     copied, so re-creating them is not an option. Moving a node is
     cheap and keeps its href, its id and anything bound to it. */
  if (pageNavEl) crumb.append(pageNavEl);
}

/* ---- ON THIS PAGE -------------------------------------------
   The hub and the library each carried a strip of in-page section
   links in their own toolbar — six and five of them. Six section
   links cannot share a row with six phase pills, and the two rows
   they needed were the second navigation band this collapse exists
   to remove.

   So they become a dropdown on the end of the breadcrumb, which is
   the right place for them on the evidence already in this file: the
   crumb answers "where am I", the phase segment already answers "what
   is next to me", and a section of the page you are on is the third
   question in that family. It reuses .sh-phase-menu wholesale rather
   than growing a second kind of dropdown — same panel, same rows,
   same close-on-outside-click, same below-720px pinning that stops a
   260px menu pushing the page sideways.

   DERIVED, not listed. Nothing here names a page or a section: it
   picks up whatever `a.nav-link[href^="#"]` the page put in its own
   toolbar, so feature.html and short.html (which have a step jumper
   instead and no nav links) get no menu and need no opt-out, and the
   eleven module pages have no toolbar at all. */
let pageNavEl = null;

function buildPageNav(toolbar) {
  const links = [...toolbar.querySelectorAll('a.nav-link[href^="#"]')];
  if (!links.length) return null;

  const wrap = h('div.sh-pagenav');
  const btn = h('button#pageNavBtn.sh-pagenav-btn', {
    type: 'button',
    'data-action': 'pagenav-toggle',
    'aria-expanded': 'false',
    'aria-controls': 'pageNavMenu',
    'aria-label': 'Sections of this page',
    title: 'Jump to a section of this page'
  });
  /* "Sections", not "On this page". The longer label is the clearer
     one and it measured 121px against 85px in the band's mono — on
     the hub at 900px that difference is the line break that puts the
     six phase pills on a row of their own, which is a 36px row of
     permanent chrome bought with four words. The full phrasing is
     still said twice, in the panel's own head and in the accessible
     name. */
  btn.append(h('span.sh-pagenav-label', { text: 'Sections' }),
             h('span.sh-pagenav-caret', { text: '▾', 'aria-hidden': 'true' }));

  /* A DISCLOSURE, not a `role="menu"` — and the phase menus beside it
     no longer claim the role either (L17). The working notes are explicit about what that
     costs: `role="menu"` is a promise of arrow keys, Home, End and one
     Tab stop, and the note on actionbar.js records it being made and
     not kept. Nothing here implements any of that, so it does not
     claim it — aria-expanded and aria-controls on the button, plain
     links inside, Tab walks them and Escape closes. The shared class
     is for the surface; the role would have been for the behaviour. */
  const menu = h('div#pageNavMenu.sh-phase-menu.sh-pagenav-menu', { hidden: true });
  menu.append(h('div.sh-phase-menu-head', { text: 'Sections of this page' }));
  links.forEach((a) => {
    const label = a.textContent.trim();
    a.textContent = '';
    a.className = 'sh-mod';
    a.append(h('span.sh-mod-label', { text: label }));
    menu.append(a);
  });
  /* The <nav> wrapper the library kept them in is now an empty box
     with a border down each side — furniture for nothing. */
  toolbar.querySelectorAll('.nav-jump').forEach((n) => {
    if (!n.querySelector('a')) n.remove();
  });

  wrap.append(btn, menu);
  return wrap;
}

/* ---- the two pieces ---------------------------------------- */

function buildRail() {
  const rail = h('nav#studioRail.sh-rail', { 'aria-label': 'Studio' });
  nav.global.forEach((g) => {
    /* A shelf is "here" on its own page and on the pages of its
       modules: the Blueprints entry lands on the hub's blueprint
       section, and is lit on feature.html and short.html. */
    const on = g.href.toLowerCase() === CURRENT
      || (Array.isArray(g.modules) && g.id !== 'home' && g.modules.some((m) =>
        !String(m.href || '').includes('#') && String(m.href || '').toLowerCase() === CURRENT));
    const a = h('a.sh-rail-item' + (on ? '.is-active' : ''), { href: g.href, title: g.purpose });
    a.append(iconSpan('sh-rail-icon', g),
             h('span.sh-rail-label', { text: g.label }));
    if (on) a.setAttribute('aria-current', 'page');
    /* ADMIN-ONLY ENTRIES (the console). navigation.json is static and
       the rail is drawn for everyone, so the entry is in the DOM for
       all and HIDDEN until the gate reports this account an admin —
       the same server-reported role admin.html itself checks, so the
       rail can never show a door the page would not open. Hidden, not
       absent: the shell is built once at load, and the role arrives a
       round trip later. */
    if (g.adminOnly) {
      a.classList.add('is-admin-only');
      a.hidden = !isAdminNow();
    }
    rail.append(a);
  });
  rail.append(buildRailStages());
  return rail;
}

/* THE STAGES, IN THE DRAWER, ON A PHONE ONLY. Below 720px the stage
   strip is one sideways-scrolling line under the crumb and at 390px
   Production and Post-Production start off-screen; the drawer — the
   one menu a phone user opens to go somewhere — listed the six global
   entries and none of the five stages, so neither route reached them
   at a glance (UX audit M22). Each stage is a link to its first page,
   the same row the stage's own menu opens with. Hidden at 720px and
   up (chrome.css), where every stage is on screen in the band. */
function buildRailStages() {
  const wrap = h('div.sh-rail-stages', { role: 'group', 'aria-label': 'Stages' });
  nav.phases.forEach((p) => {
    const first = (p.modules || []).find((m) => m.status !== 'planned' && m.href);
    if (!first) return;
    const a = h(`a.sh-rail-item.sh-rail-stage.sh-ph-${p.hue}`, { href: first.href, title: p.blurb || p.label });
    a.dataset.phase = p.id;
    a.append(iconSpan('sh-rail-icon', p), h('span.sh-rail-label', { text: p.label }));
    wrap.append(a);
  });
  return wrap;
}

/* The stage strip scrolls sideways below 720px with its scrollbar
   hidden, so nothing said there was more of it. Flag which edges have
   content past them; chrome.css fades that edge. Read-only: the strip's
   scroll position is the only state, and it is the browser's. */
function flagPhaseOverflow(strip) {
  if (!strip) return;
  const max = strip.scrollWidth - strip.clientWidth;
  const more = [];
  if (max > 1 && strip.scrollLeft > 1) more.push('left');
  if (max > 1 && strip.scrollLeft < max - 1) more.push('right');
  const v = more.join(' ');
  if ((strip.dataset.more || '') !== v) {
    if (v) strip.dataset.more = v; else delete strip.dataset.more;
  }
}

function isAdminNow() {
  try { const c = window.StudioCloud; return !!(c && c.getGateState && c.getGateState().role === 'admin'); }
  catch (e) { return false; }
}
function syncAdminOnly() {
  const show = isAdminNow();
  document.querySelectorAll('.sh-rail-item.is-admin-only').forEach((a) => { a.hidden = !show; });
}
if (typeof document !== 'undefined') {
  Store.subscribe('gate:changed', syncAdminOnly);
  const hook = setInterval(() => {
    const c = window.StudioCloud;
    if (!c) return;
    clearInterval(hook);
    if (c.onAuth) c.onAuth(() => setTimeout(syncAdminOnly, 0));
    syncAdminOnly();
  }, 50);
  setTimeout(() => clearInterval(hook), 20000);
}

/* THE BRAND PLATE — one line of purple above the navigation.

   It is the product's own strip rather than the page's: purple in
   both themes, like --panel is dark in both themes, because it is a
   plate and not a ground.

   NO TIMER. The dots advance it on click and nothing else, which is
   not a styling preference — a strip that cycles by itself is a clock
   in the one place every page shows, and the gate compares each
   page's visible words against a captured baseline. Three messages in
   rotation, one message in the baseline, and every run after the
   first fails for words that "went missing". announcements.json says
   the same thing at the top of the file, where the next person to add
   an item will be looking.

   Rendered even with one item; the dots are hidden by CSS below two,
   because a single dot is a control that cannot do anything. */
function buildPlate() {
  const items = (announce && announce.items) || [];
  if (!items.length) return null;
  const plate = h('div.sh-plate', { role: 'region', 'aria-label': 'Studio announcements' });
  const slides = h('div.sh-plate-slides');
  items.forEach((it, i) => {
    const a = h('a.sh-plate-item' + (i === 0 ? '.is-on' : ''), {
      href: it.href,
      hidden: i !== 0
    });
    if (it.flag) a.append(h('span.sh-plate-flag', { text: it.flag }));
    a.append(h('span.sh-plate-text', { text: it.text }));
    a.append(h('span.sh-plate-arrow', { text: '→', 'aria-hidden': 'true' }));
    slides.append(a);
  });
  plate.append(slides);

  /* Plain buttons, the current one marked aria-current. They were a
     tablist of tabs with no tabpanel and no arrow keys (UX audit L17). */
  const dots = h('div.sh-plate-dots', { role: 'group', 'aria-label': 'Announcements' });
  items.forEach((it, i) => {
    dots.append(h('button.sh-plate-dot' + (i === 0 ? '.is-on' : ''), {
      type: 'button',
      'data-action': 'plate-go',
      'data-index': String(i),
      'aria-label': 'Announcement ' + (i + 1) + ' of ' + items.length + ': ' + it.text,
      'aria-current': i === 0 ? 'true' : 'false'
    }));
  });
  plate.append(dots);

  /* DISMISSABLE, for this browser session. The plate is news, not
     navigation, and a strip you cannot put away is a strip that
     competes with the band under it on every page forever. Hidden,
     not removed: its words stay in the document (the gate reads
     innerHTML), and the next session shows it again so a new item is
     not missed for good. sessionStorage rather than localStorage —
     a per-viewer convenience, not part of the storage contract, and
     never written unless somebody clicks. */
  plate.append(h('button.sh-plate-close', {
    type: 'button',
    'data-action': 'plate-dismiss',
    'aria-label': 'Hide announcements',
    title: 'Hide announcements for this session',
    text: '×'
  }));
  try { if (sessionStorage.getItem(PLATE_KEY) === '1') plate.hidden = true; } catch (e) { /* storage blocked: show it */ }
  return plate;
}
const PLATE_KEY = 'fms_plate_hidden';

/** Show one announcement. Index is clamped, so a stale dot cannot blank the plate. */
function showPlate(i) {
  const items = [...document.querySelectorAll('.sh-plate-item')];
  const dots = [...document.querySelectorAll('.sh-plate-dot')];
  if (!items.length) return;
  const at = Math.max(0, Math.min(items.length - 1, i | 0));
  items.forEach((el, n) => {
    el.hidden = n !== at;
    el.classList.toggle('is-on', n === at);
  });
  dots.forEach((el, n) => {
    el.classList.toggle('is-on', n === at);
    el.setAttribute('aria-current', n === at ? 'true' : 'false');
  });
  /* The messages are different lengths, so the plate's height can
     change and the bar below it is parked on that measurement. */
  measureBar();
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

/* ---- THE PAGE'S OWN CONTROLS, IN THE SAME BAND --------------
   Four pages — the hub, the two blueprints and the library — built a
   `.toolbar` of their own and it was a SECOND sticky row under this
   one. Two bands of navigation is the thing this collapse removes:
   118-158px of permanent chrome on a desktop, 320-400px on a phone,
   and two places to look for a control.

   The whole `.toolbar` ELEMENT is moved into the bar rather than its
   children, which is the smaller change in every direction that
   matters:

     - every id the pages query survives either way (#saveStatus,
       #projectSwitcherBtn, #darkBtn, #searchInput, #progressFill …) —
       moving a node does not touch its id. Verified by a walk of all
       four pages' ids after adoption, not assumed.
     - but so does everything else that keys off the ELEMENT:
       `document.querySelector('.toolbar')`, which chrome.js's autoInit
       and all four pages use to find a host for the sign-in pill and
       the Appearance menu; the `.toolbar .btn` rules in chrome.css
       that give chrome buttons the chrome palette; `.toolbar` in
       print.css; and the live reference library.js holds in a local.
       Adopting the children and dropping the element would have
       quietly broken all of those and none of them loudly.

   What makes it one band rather than a nested bar is CSS, not JS:
   `.sh-bar > .toolbar` is static, unpainted and unpadded. See the
   note in chrome.css. */
function adoptPageTools(bar) {
  const tools = document.querySelector('.toolbar');
  if (!tools || tools.closest('.sh-bar')) return null;
  // The section links come out first: they belong on the crumb, not
  // in the right-hand zone with the save state and the backups.
  pageNavEl = buildPageNav(tools);
  bar.append(tools);
  /* The palette handle used to be moved INTO the group here, first
     child, so that it wrapped with the rest of the controls instead
     of taking a third row of its own at 1100px (flex breaks lines on
     hypothetical sizes, before anything shrinks). That fixed 1100 and
     broke 720–1099: inside a group that wraps, the handle landed
     wherever the group's own line breaks put it — x=16 at 800, x=94
     at 850, x=59 at 899 on the feature blueprint — while on the
     module pages it held the end of the first row (UX audit L23).

     It stays a direct child of the bar now, between the stages and
     the zone, on every page. At 1100px and up the band is a GRID
     with a column of its own for it (chrome.css), so the flex
     line-breaking argument no longer applies; from 720 to 1099 the
     one rule that pins it to the end of the first row applies to
     every bar rather than to bars without a toolbar; below 720 it is
     hidden and the bottom action bar carries search. */
  return tools;
}

/* ---- THE SAME ZONE ON THE PAGES THAT HAVE NO TOOLBAR -----------
   Eighteen of the twenty-two pages built no `.toolbar`, and the
   sign-in pill and the Appearance menu hang off that element — so
   eighteen pages had no way to sign in, see the sync state, or change
   the theme without going back to the hub (UX audit M21). This is the
   host they were missing: one right-hand zone, same place in the band
   as the four pages' adopted toolbar, carrying the two controls that
   are the studio's rather than the page's.

   Built here rather than in chrome.js because chrome.js's autoInit
   runs at import, before any page has rendered and before this bar
   exists; the shell is the one thing that knows when the band is
   there. Both mounts are idempotent (attachSignInPill checks for
   #signInPill, mountAppearanceMenu for its own menu), so a page that
   calls mountShell() twice gets one of each. Reached through the
   StudioUI global rather than an import: chrome.js is not imported
   here and both files are in the same `studio` chunk, so by the time
   a page calls mountShell() the global exists. */
function buildStudioTools(bar) {
  let tools = bar.querySelector(':scope > .sh-tools');
  if (!tools) {
    tools = h('div.sh-tools', { role: 'group', 'aria-label': 'Account and appearance' });
    bar.append(tools);
  }
  const ui = (typeof window !== 'undefined' && window.StudioUI) || null;
  if (ui) {
    try { if (ui.mountAppearanceMenu) ui.mountAppearanceMenu(tools); } catch (e) { /* a menu is not a reason to lose the band */ }
    try { if (ui.attachSignInPill) ui.attachSignInPill(tools); } catch (e) { /* ditto */ }
  }
  return tools;
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
  document.querySelectorAll('.sh-rail-stage').forEach((a) => {
    a.classList.toggle('is-active', !!loc.phase && a.dataset.phase === loc.phase.id);
  });
  document.querySelectorAll('.sh-mod').forEach((row) => {
    const on = !!loc.module && row.dataset.moduleId === loc.module.id;
    row.classList.toggle('is-here', on);
    if (on) row.setAttribute('aria-current', 'true');
    else row.removeAttribute('aria-current');
  });
  /* On a phone the stages are one sideways-scrolling line (chrome.css),
     so the one you are in may start off-screen. Bring it in. Only the
     strip's own scroll position moves — never the page's. */
  const strip = document.querySelector('.sh-phases');
  const on = strip && strip.querySelector('.sh-phase.is-active');
  if (on && strip.scrollWidth > strip.clientWidth + 1) {
    const dx = on.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    strip.scrollLeft += dx - 16;
  }
  measureBar();
}

function goTo(loc) {
  if (!loc) return;
  const partOf = (l) => (l && l.part ? l.part.frag : '');
  if (current && current.module === loc.module && current.global === loc.global
      && partOf(current) === partOf(loc)) {
    current = loc;   // the same place; only how sure we are of it changed
    return;
  }
  paintLocation(loc);
}

/* A guess is re-made whenever the page may have changed under it — on
   some pages the sections render after the shell mounts, and the tab
   strip opens its first tab without touching the hash. An exact answer
   (from the hash or the spy) is never replaced by one. */
function refreshGuess() {
  if (current && current.exact) {
    /* An exact answer keeps its module, but the blueprint part under
       it is geometry and moves with the scroll. */
    const part = blueprintPart();
    if ((part ? part.frag : '') !== (current.part ? current.part.frag : '')) {
      paintLocation(Object.assign({}, current, { part: part || undefined }));
    }
    return;
  }
  goTo(resolveLocation());
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
  for (const { frag } of hereModules()) {
    if (!frag || seen.has(frag)) continue;
    /* Shown ones only. A tab that is not open measures top 0, which is
       above every line the spy draws, so it used to win every time —
       that is how contacts.html said "Call Sheets" while the Contacts
       tab was the one on screen. */
    const el = document.getElementById(frag);
    if (isShown(el)) seen.set(frag, el);
  }
  /* TWO NAMES FOR ONE AREA. A module fragment nested inside another's
     (breakdown.html#breakdown, Script Breakdowns, is the tagging area
     INSIDE #scenes, the Scene List) is not a second section to scroll
     to: both tops cross the line together, so the inner one would win
     every scroll tick and the outer would never be reported. Keep the
     one the address bar names; otherwise the outer one. */
  const want = (location.hash || '').replace(/^#/, '');
  for (const [frag, el] of [...seen.entries()]) {
    for (const [other, oel] of [...seen.entries()]) {
      if (other === frag || !seen.has(frag) || !seen.has(other)) continue;
      if (oel !== el && oel.contains(el)) {
        // `el` is inside `oel`: drop one of the pair
        seen.delete(want === frag ? other : frag);
      }
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
  if (targets.length < 2) return undefined;
  const vh = window.innerHeight;
  const de = document.documentElement;
  let best = null;
  if (window.scrollY + vh >= de.scrollHeight - 4) {
    for (const [frag, el] of targets) {
      const r = el.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) best = frag;
    }
    /* Several sections on screen at the foot of the page and the
       address bar names one of them: that one. story.html#pitch
       scrolls to the bottom, where the Idea Vault is also visible,
       and used to be announced as the vault. */
    const want = (location.hash || '').replace(/^#/, '');
    const named = want && targets.find(([frag, el]) => {
      const r = el.getBoundingClientRect();
      return frag === want && r.top < vh && r.bottom > 0;
    });
    if (named) best = want;
  } else {
    const line = vh * 0.3;
    for (const [frag, el] of targets) {
      if (el.getBoundingClientRect().top <= line) best = frag;
    }
    /* Nothing has crossed the line yet: you are above every module
       section, which on story.html is the beats editor itself (a
       module with no fragment). The first version answered the first
       section here, exactly, and story.html opened as "Screenplay ›
       Pitch Deck" with the pitch deck 2,400px below the fold. Null
       hands the question back to resolveLocation(). */
  }
  return best;
}

function runSpy() {
  const frag = spyFragment();
  if (frag === undefined) { refreshGuess(); return; }
  if (frag === null) {
    /* Above every section: the page's own answer, unless the address
       bar names a module, which stays the answer. */
    const loc = resolveLocation();
    if (loc.exact || !current || current.exact !== true || current.spied) goTo(loc);
    return;
  }
  const loc = resolveLocation('#' + frag);
  if (loc.exact) goTo(Object.assign(loc, { spied: true }));
}

/* The bar's height is measured, not assumed.

   It used to be a literal 56px, which was true only while the bar is
   one row, and it already was not: six phase tabs wrap below about
   900px. The page toolbar parked on this value and was therefore
   sliding under the shell between there and the breakpoint.

   The page toolbar is INSIDE this bar now, so nothing parks on
   --sh-bar-h any more on the four pages that have one. Two things
   still read it and both are page furniture that stacks under the
   whole band: study.css's `.ds-bar` and the workbench's pinned
   reference panel. It is also what makes the bar's own wrapping
   visible to anything that needs to clear it, which is why it is
   still measured rather than deleted.

   A plain resize listener rather than a ResizeObserver: the height
   only changes with the viewport, and an observer that writes a
   custom property affecting layout is one notification loop away
   from a console error the verify gate counts. */
let lastBarH = 0;
let lastPlateH = -1;
function measureBar() {
  const de = document.documentElement;
  /* The plate is pinned ABOVE the bar, so the bar's `top` is the
     plate's height and --sh-bar-h — which the working notes define as
     "where does the page toolbar park" — is the plate plus the bar.
     Measured off the computed position rather than the rect, because
     below the narrow breakpoint both are `relative`: nothing is
     pinned there, the plate scrolls away like any other block, and
     its height must not be added to an offset. */
  const plate = document.querySelector('.sh-plate');
  const plateH = plate && getComputedStyle(plate).position === 'sticky'
    ? Math.round(plate.getBoundingClientRect().height)
    : 0;
  if (plateH !== lastPlateH) {
    lastPlateH = plateH;
    de.style.setProperty('--sh-plate-h', plateH + 'px');
  }
  const bar = document.querySelector('.sh-bar');
  if (!bar) return;
  layoutBand(bar);
  flagPhaseOverflow(bar.querySelector('.sh-phases'));
  /* The plate is pinned ABOVE the bar, so what the page toolbar has to
     clear is the two of them together. plateH is 0 below the narrow
     breakpoint, where neither is pinned. measureChrome() needs no
     equivalent: it derives the band from whatever is actually pinned,
     and the plate qualifies on its own. */
  const px = Math.round(bar.getBoundingClientRect().height) + plateH;
  if (px && px !== lastBarH) {
    lastBarH = px;
    de.style.setProperty('--sh-bar-h', px + 'px');
  }
  /* main's measureChrome() replaces the --sh-stick-h half that used
     to be here. It measures the WHOLE pinned band rather than this
     one bar, and feeds a single scroll-padding-top — see the note on
     the function itself. */
  measureChrome();
}

/* ONE ROW OR A DELIBERATE TWO. The page's control cluster either
   shares the band's row with the crumb and the stages, or it gets a
   full-width row of its own (`data-stacked`, styled in chrome.css) —
   never the in-between where a few controls wrap and float. Decided
   by MEASURING the unstacked layout, not by a breakpoint, because
   the answer depends on which page's controls are in the band and
   on whether the rail is open: the hub fits at 1280, a blueprint's
   whole working toolbar does not.

   It runs inside measureBar(), before the height is read, so the
   published heights are always those of the layout that is on
   screen. The attribute is not in the bar's MutationObserver's
   options (childList + subtree only), so toggling it cannot feed
   that observer. Below 1100px the band wraps by design and the
   attribute is left off. */
function layoutBand(bar) {
  /* The cluster is the page's .toolbar, or on the module pages the
     studio's own .sh-tools zone — and in both cases the palette
     handle beside it, which is a direct child of the bar and has to
     fit on the same row for the row to count as fitting. */
  const tools = bar.querySelector(':scope > .toolbar, :scope > .sh-tools')
    || bar.querySelector(':scope > .sh-find');
  if (!tools) return;
  if (isNarrow()) { bar.removeAttribute('data-stacked'); return; }
  const was = bar.hasAttribute('data-stacked');
  if (was) bar.removeAttribute('data-stacked');
  const anchor = bar.querySelector('.sh-phases') || bar.querySelector('.sh-where');
  /* The CONTENT's extent, not the zone's box: the zone is
     `justify-content: flex-end` and `min-width: 0`, so a cluster too
     wide for it keeps a polite box and spills its controls out of the
     start edge, over the stages. */
  const box = tools.getBoundingClientRect();
  let t = box;
  const shown = (k) => k.getClientRects().length && getComputedStyle(k).position !== 'absolute';
  const parts = tools.classList.contains('sh-find') ? [tools] : [...tools.children].filter(shown);
  const find = bar.querySelector(':scope > .sh-find');
  if (find && find !== tools && shown(find)) parts.push(find);
  if (parts.length) {
    const rs = parts.map((k) => k.getBoundingClientRect());
    t = { top: Math.min(...rs.map((r) => r.top)), height: Math.max(...rs.map((r) => r.bottom)) - Math.min(...rs.map((r) => r.top)),
          left: Math.min(...rs.map((r) => r.left)), right: Math.max(...rs.map((r) => r.right)) };
  }
  const a = anchor ? anchor.getBoundingClientRect() : t;
  /* Fits = the cluster starts on the stages' row AND has not wrapped
     inside itself (one control height, with room for focus rings). */
  const ctl = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sh-ctl-h')) || 32;
  const b = bar.getBoundingClientRect();
  /* And it does not OVERLAP: in the grid layout an over-wide cluster
     overflows leftwards, over the stages, which neither the scroll
     width nor the right edge can see. */
  const crumb = bar.querySelector('.sh-where');
  const c = crumb ? crumb.getBoundingClientRect() : { right: a.left };
  const fits = t.top < a.bottom && t.height <= ctl * 1.5
    && t.right <= b.right + 1 && t.left >= a.right - 1 && c.right <= a.left + 1
    && bar.scrollWidth <= bar.clientWidth + 1
    /* the grid squeezes the stages' column before anything else, and
       the pills then spill out of it rather than shrink */
    && (!anchor || anchor.scrollWidth <= anchor.clientWidth + 1);
  if (!fits) bar.setAttribute('data-stacked', '');
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
   enough to span the page. Those three things are true of .sh-bar, of
   the plate and of study.html's .ds-bar, and false of the two sticky
   things that are NOT chrome you scroll under: stripboard's
   .sb-grid-name is anchored left, and the workbench's .wb-ref is a
   third of the width and nested deeper. Naming the selectors would
   have been shorter and would have gone stale the first time a page
   grew another bar — which is exactly what happened in the other
   direction when .toolbar stopped being one. It was a candidate
   until the two bands were collapsed; now it is a child of .sh-bar,
   so it is not a `#app > *` and drops out of the candidate set with
   no edit here. The band is the one band.

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
  let parked = 0;
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
    /* AND IT HAS TO CROSS THE PAGE, not merely be wide.
       `width >= half the viewport` is a proxy for "spans the page"
       and it stops being one on a phone, where half the viewport is
       195px and the step rail is 220px — fixed, `top: 64px`, 804px
       tall and translated off-canvas. It passed all three tests and
       made the band 868px on the two blueprints at 390px, which is a
       scroll-padding-top of nearly a whole screen: every fragment
       jump on the longest pages in the app landed a screen low. The
       note above already says a left-anchored rail is not a band;
       this is the test that says so. A real top band straddles the
       middle of the viewport, and nothing anchored to one edge
       does. */
    if (r.left > vw * 0.5 || r.right < vw * 0.5) continue;
    /* PARKED ON THIS VERY NUMBER. The tab strip (tabs.css) is pinned
       at `top: var(--sh-chrome-h)` — under the band — so counting it
       as `top + height` fed its own height back into the value it
       parks on, and every re-measure (and the bar's MutationObserver
       makes plenty) pushed it down by another strip: measured 266px,
       then 309, 404, 496 on pages whose band is 82px. An element whose
       top IS the published value is under the band, not part of it;
       it is collected separately and added to what a fragment jump has
       to clear (--sh-cover-h), never to where things park. */
    if (lastBand > 0 && Math.abs(top - lastBand) <= 1) { parked += Math.round(r.height); continue; }
    band = Math.max(band, Math.round(top + r.height));
  }
  const cover = band + parked;
  if (cover !== lastCover) {
    const grew = lastCover >= 0 ? cover - lastCover : 0;
    lastCover = cover;
    de.style.setProperty('--sh-cover-h', cover + 'px');
    if (grew > 0) relandFragment(grew);
  }
  if (band === lastBand) return;
  lastBand = band;
  de.style.setProperty('--sh-chrome-h', band + 'px');
}
let lastCover = -1;

/* THE BAND CAN GROW UNDER A TARGET THAT HAS JUST LANDED.

   verify's fragment sweep found it on the feature blueprint at 1280:
   a jump to #phase-4 travels ~72,000px of smooth scroll and lands the
   heading at 140px — correct for the 128px band it set out under. Then
   the scroll spy names Part V, the breadcrumb widens from 549 to 584px,
   the phase tabs no longer fit beside it and wrap to a second row, and
   the band is 168px. measureChrome() republishes the right number, but
   the browser's scroll-padding is read when a scroll STARTS, so the
   heading stays 28px behind the chrome. Same symptom as every other
   "landed in the wrong place" bug here, and invisible to a scroll
   check that measures before the band has finished moving.

   AND THE GROWTH HAPPENS MID-SCROLL. The spy names Part V while the
   page is still travelling, so at the moment the band grows the target
   is thousands of pixels away and nothing can be said about it yet.
   So when the cover grows within a few seconds of a landing, wait for
   the scroll to STOP (two ticks at the same scrollY), and if the hash's
   target then sits exactly where the OLD band plus the scroll padding
   would have put it, scroll by the growth, once. A target anywhere
   else is left alone: the reader has moved on, or the growth had
   nothing to do with their jump. `instant`, because html has
   scroll-behavior: smooth and a smooth correction here would race the
   one that just finished. */
let lastLanding = typeof performance !== 'undefined' ? performance.now() : 0;
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => { lastLanding = performance.now(); });
}
let reland = null;   // { grew, deadline, lastY }
function relandFragment(grew) {
  if (performance.now() - lastLanding > 4000) return;
  /* A malformed escape in the hash (#%E0%A4%A) throws here, and this
     runs inside measureChrome(), which feeds every scroll offset. */
  let id = '';
  try { id = decodeURIComponent((location.hash || '').slice(1)); } catch (e) { return; }
  if (!id) return;
  if (reland) { reland.grew += grew; return; }   // grew twice before the scroll stopped
  reland = { grew, deadline: performance.now() + 4000, lastY: null };
  const tick = () => {
    if (!reland) return;
    if (performance.now() > reland.deadline) { reland = null; return; }
    const y = window.scrollY;
    if (reland.lastY !== y) { reland.lastY = y; setTimeout(tick, 120); return; }
    // The scroll has stopped. Where did the target land?
    const el = document.getElementById(id);
    const pending = reland;
    reland = null;
    if (!el) return;
    const de = document.documentElement;
    const gap = (parseFloat(getComputedStyle(de).scrollPaddingTop) || 0) - lastCover;
    const top = el.getBoundingClientRect().top;
    const landedAgainstOld = lastCover + gap - pending.grew;
    if (Math.abs(top - landedAgainstOld) > 2) return;
    window.scrollBy({ top: -pending.grew, behavior: 'instant' });
  };
  setTimeout(tick, 120);
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
    /* Both openers, because the "on this page" menu reuses this panel
       and its button is not a .sh-phase-btn. A menu closed with its
       button still reporting aria-expanded="true" is a screen reader
       told the opposite of what is on screen. */
    const btn = m.parentElement
      && m.parentElement.querySelector('.sh-phase-btn, .sh-pagenav-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  });
}

/* A phase menu is taller than the window on most screens — Screenplay
   carries twelve modules, Pre-Production eleven — and it hangs off a
   pinned band, so the rows past the bottom edge were unreachable: the
   page scrolled under a menu that did not. The menu scrolls itself
   now (overflow-y in chrome.css), bounded by the room actually left
   below its top edge, which is measured rather than assumed because
   the band's height and pinning differ by width, and it stops above
   the phone's bottom action bar. Re-fitted on resize;
   nothing closes a menu on scroll, so a wheel inside it scrolls it. */
function fitMenu(menu) {
  if (!menu || menu.hidden) return;
  const top = menu.getBoundingClientRect().top;
  /* The bottom action bar (actionbar.js, below 720px) is fixed over
     the last 70px of the window and publishes its height as --mab-h;
     a menu that ran under it would hide its last rows behind it. */
  const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mab-h')) || 0;
  const room = Math.max(160, Math.floor(window.innerHeight - bar - Math.max(0, top) - 16));
  menu.style.setProperty('--sh-menu-max', room + 'px');
}
function fitOpenMenus() {
  document.querySelectorAll('.sh-phase-menu:not([hidden])').forEach(fitMenu);
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
    fitMenu(menu);
    btn.setAttribute('aria-expanded', String(open));
  });

  /* "On this page" — the same panel as a phase menu, opened from the
     end of the breadcrumb. */
  delegate(document, 'click', '[data-action="pagenav-toggle"]', (e, btn) => {
    const menu = document.getElementById('pageNavMenu');
    if (!menu) return;
    const open = menu.hidden;
    closeAllMenus(menu);
    menu.hidden = !open;
    fitMenu(menu);
    btn.setAttribute('aria-expanded', String(open));
  });

  /* Following a row inside it puts it away. The phase menus never
     needed this because their rows go to another page and the menu
     goes with it; these rows are fragments of the page you are
     already on, so the menu would otherwise stay open over the
     section it just took you to. */
  delegate(document, 'click', '.sh-pagenav-menu .sh-mod', () => closeAllMenus());

  // The stage strip's edge fades follow its own scroll and the width.
  const phases = document.querySelector('.sh-phases');
  if (phases) {
    phases.addEventListener('scroll', () => flagPhaseOverflow(phases), { passive: true });
    window.addEventListener('resize', () => flagPhaseOverflow(phases), { passive: true });
  }

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
    fitMenu(menu);
    const tabBtn = tab.querySelector('.sh-phase-btn');
    if (tabBtn) tabBtn.setAttribute('aria-expanded', String(open));
  });

  // The plate's dots. The only thing that advances it — see buildPlate.
  delegate(document, 'click', '[data-action="plate-go"]', (e, btn) => {
    showPlate(Number(btn.dataset.index));
  });
  delegate(document, 'click', '[data-action="plate-dismiss"]', (e, btn) => {
    const plate = btn.closest('.sh-plate');
    if (!plate) return;
    plate.hidden = true;
    try { sessionStorage.setItem(PLATE_KEY, '1'); } catch (err) { /* ignore */ }
    measureBar();
  });

  // A planned module explains itself rather than 404ing or, worse,
  // looking clickable and doing nothing.
  delegate(document, 'click', '[data-action="module-planned"]', (e, btn) => {
    const id = btn.dataset.module;
    let found = null;
    for (const p of moduleGroups()) for (const m of p.modules) if (m.id === id) found = { p, m };
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
    if (!e.target.closest('.sh-phase, .sh-where-phase, .sh-pagenav')) closeAllMenus();
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
  /* tabs.js dispatches one by hand when a tab is picked, so choosing
     Call Sheets on contacts.html moves the crumb and the active pill to
     Production, and choosing Contacts moves them back. */
  window.addEventListener('hashchange', () => {
    const loc = resolveLocation();
    if (loc.exact || !current || !current.exact) goTo(loc);
  });

  let raf = 0;
  window.addEventListener('resize', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; measureBar(); runSpy(); fitOpenMenus(); });
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
  const plate = buildPlate();
  const scrim = h('button.sh-scrim', {
    type: 'button',
    'data-action': 'rail-close',
    tabindex: '-1',
    'aria-hidden': 'true'
  });
  app.insertBefore(bar, app.firstChild);
  if (plate) app.insertBefore(plate, app.firstChild);
  app.insertBefore(rail, app.firstChild);
  app.insertBefore(scrim, app.firstChild);

  /* The page's own toolbar becomes the right-hand zone of this bar.
     All four pages that build one render it before they call
     mountShell(), which is what makes a single adopt-after-render
     pass enough; a page that ever renders its toolbar later would
     need to call mountShell() after it, and mountShell() is
     idempotent so that is safe.

     A page with no toolbar gets the studio's own zone instead — the
     account pill and the Appearance menu, nothing of the page's. One
     or the other, never both: the four toolbar pages mount those two
     controls into their toolbar themselves (chrome.js autoInit and
     each page's re-init), and a second pill would be a second
     #signInPill. */
  if (!adoptPageTools(bar) && !bar.querySelector(':scope > .toolbar')) buildStudioTools(bar);

  crumbEl = bar.querySelector('#studioWhere');
  document.body.classList.add('has-sh-shell');
  wire();
  setRail(initialRail());
  paintLocation(active);
  /* Two frames: one for layout, one for the web fonts to land. The
     bar is measured, and measuring it before Plus Jakarta Sans and
     JetBrains Mono arrive records the fallback's height. The spy runs on the
     same schedule because mountShell() is not always called after the
     page has rendered — dashboard.js mounts at import time, when #app
     is still empty, the same trap chrome.js records one level up. */
  /* Synchronously first. The two rAF passes below are for layout
     and for the web fonts, and they are still right — but a rAF does
     not run at all while the tab is hidden, and measureBar() is what
     publishes --sh-chrome-h through measureChrome(). A page restored
     into a background tab would otherwise have no scroll padding
     beyond the declared default until it was looked at. */
  /* The page's sections as tabs, where the page is one of the tabbed
     ones (src/ui/tabs.js decides) — BEFORE the first spy pass, because
     until the strip has hidden the other tabs every section is on
     screen and the spy would pick one by geometry and call it exact.
     --sh-chrome-h is published by the measureBar() just below; the
     strip reads it as a live custom property, so the order costs it
     nothing. */
  installTabs();
  measureBar();
  runSpy();
  requestAnimationFrame(() => {
    measureBar();
    runSpy();
    requestAnimationFrame(() => { measureBar(); runSpy(); });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureBar).catch(() => {});

  /* AND AGAIN WHENEVER THE BAND'S CONTENTS CHANGE.

     Everything above measures on a schedule — now, next frame, the
     frame after, and when the fonts land — and a schedule cannot see
     a control that arrives later. Several do, and all of them are
     inside the band now that the page's toolbar is: the sign-in pill
     (`attachSignInPill`, after a lazily-imported cloud module
     resolves), the Appearance menu that replaces the ◐ button, and
     the project switcher's label once a project exists. Measured on
     the feature blueprint at 1280px: the band settled at 102px and
     --sh-chrome-h stayed at the 146px it had been during load, so
     every fragment jump on that page landed 44px low. The resize
     listener could not help — nothing had resized.

     A MutationObserver rather than a ResizeObserver, which is what
     the note on measureBar() warns off: what this writes is two
     custom properties on <html>, and <html> is not in the observed
     subtree, so there is no notification loop to get wrong. rAF
     throttled for the same reason the scroll and resize listeners
     are. */
  if (typeof MutationObserver === 'function') {
    let mraf = 0;
    new MutationObserver(() => {
      if (mraf) return;
      mraf = requestAnimationFrame(() => { mraf = 0; measureBar(); });
    }).observe(bar, { childList: true, subtree: true });
  }
  /* A guess about which module you are in (no hash, no spy) is only as
     good as the DOM it looked at, and the page's sections render — and
     its tabs open and close — after this. Re-guess when #app changes.
     Cheap, rAF-throttled, a no-op once the answer is exact, and it
     repaints nothing unless the answer actually changed, so it cannot
     feed itself. */
  if (typeof MutationObserver === 'function') {
    let graf = 0;
    new MutationObserver(() => {
      if (graf || (current && current.exact)) return;
      graf = requestAnimationFrame(() => { graf = 0; refreshGuess(); });
    }).observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  }
  return bar;
}

export default { mountShell };
