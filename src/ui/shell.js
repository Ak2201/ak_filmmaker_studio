/* ============================================================
   THE SHELL — a vertical app rail and one phase bar
   ------------------------------------------------------------
   SWISS PRECISION (14 Oct 2026): the rail is a 64px icon column whose
   five stage cells open flyouts of their modules (buildRailStages),
   and the band is one 56px row — crumb, search, the page's tools, the
   studio's zone. The stage strip that used to sit in the band is gone;
   what follows below is the history of how the shell got here, kept
   because the measuring and "where am I" reasoning still holds.

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
/* navigation.json is read through navmodel.js (phases/globals), which
   applies the region filter — see its header. Imported for nothing
   else here, so there is no second, unfiltered view of the map. */
import { h, delegate } from '../lib/dom.js';
import { iconSpan } from './icon.js';
import Store from '../lib/store.js';
import { openPalette } from './palette.js';
import { installTabs } from './tabs.js';
import { mountProjectSwitcher } from './project-switcher.js';
import { mountBackupMenu } from './topbar-backup.js';
import { moduleGroups, guideStops, phases, globals, stayEntry, stagePageEntry, homeStage, stageLead, moduleSections } from '../lib/navmodel.js';
import { renderTrialBand } from './trial-band.js';
import { syncLine } from './status-bar.js';
import { pageFile } from '../lib/page-file.js';
import { markLocked, allowed, isDisabledEverywhere } from '../lib/plan-gate.js';
import { monogram } from '../lib/brand.js';

const RAIL_KEY = 'fms_studio_rail_open_v1';
const NARROW = '(max-width: 1099px)';

const CURRENT = pageFile(location.pathname);

/* ---- TWO SHELL MODES (owner, 11 Oct 2026) -------------------
   Library, Settings, Admin and the purchase pages are "not project
   based, general for all", so they are shown without the project items
   in the band: no stage strip, no search handle, no project switcher,
   and no stages or Dashboard in the rail. Everything else — the stage
   and module pages and the dashboard — keeps the full band.

   'global' is DERIVED: the page is the hub, or an entry of
   navigation.json's `global[]` that is not the dashboard (library,
   settings, admin), or one of the names in EXTRA_GLOBAL_PAGES. That
   constant is the ONE hard-coded list: the purchase pages are created
   by another lane and have no navigation entry, and invite.html is the
   doorway, so they cannot be derived. Add a page here, nowhere else. */
const EXTRA_GLOBAL_PAGES = ['index.html', 'purchase.html', 'invite.html'];
function shellMode() {
  if (EXTRA_GLOBAL_PAGES.includes(CURRENT)) return 'global';
  const g = globalHere();
  return g && g.id !== 'dashboard' ? 'global' : 'project';
}
/* A global page with no navigation.json entry still needs a name for the
   crumb, or it reads as a bare "Studio" that says nothing about where you
   are (invite.html, the doorway). It is deliberately NOT added to
   navigation.json: an entry there is also a rail item, a palette row and a
   Go-to link, and nobody should navigate TO the doorway from inside. */
const EXTRA_GLOBAL_ENTRIES = {
  'invite.html': { id: 'invite', label: 'Come in', icon: '✉', sym: 'mail', href: 'invite.html',
    purpose: 'Start a free trial, buy a plan, or enter an invite code' }
};
const GLOBAL_MODE = shellMode();
export const isGlobalMode = () => GLOBAL_MODE === 'global';

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
  return globals().find((g) => g.href.toLowerCase().split('#')[0] === CURRENT)
    || EXTRA_GLOBAL_ENTRIES[CURRENT] || null;
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
  for (const phase of phases()) add(phase, null, phase.modules);
  for (const g of globals()) if (Array.isArray(g.modules)) add(null, g, g.modules);
  /* A module switched off for everybody is not where you are: the rail
     hides it, so a crumb naming it ("Screenplay Analysis" on the
     Breakdown) points at nothing. Unless EVERY module the page hosts is
     off — then the page is a "Not available" card and the crumb still
     says what it was. Guarded: plan-gate is not ready at first call. */
  const on = out.filter((x) => { try { return !PLAN.isOff(x.module.id); } catch (e) { return true; } });
  return on.length ? on : out;
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
 * Which MODULE you are in is answered in this order, and only the
 * first two are an ANSWER (exact:true). The STAGE is not: since
 * 17 Oct 2026 it is always the page's home stage (HOME_PHASE below),
 * whichever module or tab the hash names, so the frame is the same
 * however the page was reached.
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
const GUIDE_HIDDEN = true;

/* A stage's lead module — THE one stage-link rule (nav-stage.js
   stageLead): first built module not switched off for everybody and on
   this member's plan. The rail icon, the crumb's stage button, the
   dashboard's cards and the hub's doors all ask it, with plan-gate's two
   answers passed in here because this file may import plan-gate. */
const PLAN = { isOff: (id) => isDisabledEverywhere(id), allowed: (id) => allowed(id) };
function leadOf(phase) {
  return stageLead(phase, PLAN);
}

/* THE PAGE'S HOME STAGE (owner, 17 Oct 2026: "I want my UI to be the
   same when it is opened from any page"). Derived once from the FILE
   (navmodel homeStage: the stage of the page's first module), never from
   the hash it was entered by. It decides <html data-phase>, the lit rail
   stage and the crumb's stage segment; the crumb's LAST segment still
   follows the open tab. contacts.html#call-sheets therefore reads
   "Pre-Production › Call Sheets" in Pre-Production's colour, exactly as
   contacts.html does, and Reports' DPR tab sits under Pre-Production
   instead of under no stage. Global pages (the hub, the dashboard, the
   Library, Settings, the console, the purchase pages) have none. */
const HOME_STAGE_ID = homeStage(CURRENT);
const HOME_PHASE = (GLOBAL_MODE === 'project' && HOME_STAGE_ID && phases().find((p) => p.id === HOME_STAGE_ID)) || null;

function resolveLocation(hash = location.hash) {
  const loc = stayLocation(hash) || resolveModule(hash);
  /* The module (or tab) still comes from the hash and the scroll; the
     stage never does. */
  loc.phase = HOME_PHASE;
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
  /* The stage guide is hidden now (stage-guide.js), so a "Part II ·"
     crumb segment would link to a section nobody can see. */
  if (GUIDE_HIDDEN) return null;
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

/* A retired page kept behind ?stay=1 (navmodel STAY_PAGES): named by
   the declared label, under its stage if it has one. Null elsewhere. */
function stayLocation(hash) {
  const e = stayEntry(CURRENT, location.search) || stagePageEntry(CURRENT);
  if (!e) return null;
  const frag = (hash || '').replace(/^#/, '');
  const phase = e.stage ? phases().find((p) => p.id === e.stage) || null : null;
  const label = (e.frags && e.frags[frag]) || e.label;
  const lead = phase && leadOf(phase);
  return {
    phase, global: null, exact: true,
    module: { id: 'stay:' + CURRENT, label, href: CURRENT + location.search + (frag ? '#' + frag : ''),
      sym: lead && lead.sym, icon: lead && lead.icon }
  };
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
      /* A tab that is no module of its own (Reports' DPR and Equipment,
         Write's Characters and Coverage): name the tab. Without this the
         crumb kept the last module's name ("Cast Matrix" over the DPR),
         or fell back to the page's first module on a direct load. */
      const panel = el.closest('[role="tabpanel"]');
      const base = mods.find((x) => x.phase) || mods[0];
      const tab = panel && document.getElementById('tab-' + panel.id);
      /* the row's LABEL span: its textContent also holds the icon's ligature
         name ("movie") and a count */
      const tabText = tab && (tab.querySelector('.tabs-tab-l') || tab).textContent;
      const label = (tabText || (panel && panel.dataset.tabLabel) || '').trim();
      if (panel && base && label) {
        /* No stage of its own: resolveLocation() puts it under the
           page's home stage (Reports' DPR reads "Pre-Production › DPR"). */
        return {
          phase: null, global: null, exact: true,
          module: { id: 'tab:' + panel.id, label, href: CURRENT + '#' + panel.id, sym: base.module.sym, icon: base.module.icon }
        };
      }
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
  if (whole) {
    /* The page as a whole is not always the module that owns its address:
       story.html is the Story editor, and "Beats & Pacing" is only one
       section of it. A module that says so (`pageLabel` / `pageFrag`) is
       named by the page until its own section is the one on screen; with
       `pageLabel` and no `pageFrag` (Story since 19 Oct 2026: Beats &
       pacing is a part of the Synopsis step, not a section) the page's
       name is used throughout. */
    let module = whole.module;
    if (module.pageLabel && (!module.pageFrag || !isShown(document.getElementById(module.pageFrag)))) {
      module = Object.assign({}, module, { label: module.pageLabel });
    }
    return { phase: whole.phase, module, global: whole.global, exact: false };
  }

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

/* A stage tab is a plain link to the stage's main page — the first
   built module of the phase. There is no dropdown: the stage page is
   where its modules are listed (tabs, the stage guide), and a menu
   over the page was a second, slower way to the same place. A real
   <a> gives keyboard, middle-click and aria-current for free. */
function phaseHref(phase) {
  const first = leadOf(phase);
  return first ? first.href : null;
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
  crumb.className = 'sh-where' + (loc.phase && !isGlobalMode() ? ` sh-ph-${loc.phase.hue}` : '');

  const home = globals()[0];
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
    if (loc.phase && !isGlobalMode()) {
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

    /* "Studio › Story › Story" said the same word twice: the stage button and
       then the page, whose label is the stage's own. The page segment is
       dropped when it only repeats the stage (owner, 12 Oct 2026); the
       stage button then carries the current page. */
    const repeatsStage = !!(here && loc.phase && !isGlobalMode()
      && String(here.label || '').trim().toLowerCase() === String(loc.phase.label || '').trim().toLowerCase());
    if (here && repeatsStage) {
      crumb.querySelector('.sh-where-phase')?.setAttribute('aria-current', 'page');
      if (here.purpose) crumb.append(h('span.sh-where-purpose', { text: here.purpose }));
    } else if (here) {
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

/* ---- THE RAIL (Swiss Precision, 14 Oct 2026) ------------------
   A 64px icon column, the owner's Stitch shell: the monogram, the
   app-scope destinations, the five STAGES (project pages only) each
   with a flyout of its modules, and a foot with the trial clock, help
   and the account. Every entry is read from navigation.json through
   navmodel.js; nothing here names a page, a stage or a module.

   The label of each icon is a real element (`.sh-rail-label`), shown
   as a tooltip on hover and focus and kept in the DOM at all times:
   it is the link's accessible name, and the gate reads innerHTML, so
   the words are still on the page while the column is icons only. */


function railGlobal(g) {
  /* A shelf is "here" on its own page and on the pages of its
     modules: the Blueprints entry lands on the hub's blueprint
     section, and is lit on feature.html and short.html. */
  const on = g.href.toLowerCase() === CURRENT
    || (Array.isArray(g.modules) && g.id !== 'home' && g.modules.some((m) =>
      !String(m.href || '').includes('#') && String(m.href || '').toLowerCase() === CURRENT));
  const a = h('a.sh-rail-item' + (on ? '.is-active' : ''), { href: g.href, title: g.purpose, 'aria-label': g.label });
  a.dataset.railId = g.id;
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
  return a;
}

function buildRail() {
  const rail = h('nav#studioRail.sh-rail', { 'aria-label': 'Studio' });
  /* The monogram that heads the rail. Decorative: the Home item below it
     is the real way home, so this one is out of the Tab order and the
     accessibility tree rather than a duplicate stop. */
  const homeG = globals().find((g) => g.id === 'home');
  rail.append(h('a.sh-rail-logo', {
    href: (homeG && homeG.href) || 'index.html', tabindex: '-1', 'aria-hidden': 'true',
    text: monogram()
  }));
  /* The Dashboard is the project's home (the launcher) and leads the rail
     again. The Library is always there (owner, 19 Oct 2026): its films,
     directors, rules, rates and watch list are not modules, so switching
     its three module shelves off must not take the whole page with it. */
  const gl = globals();
  /* Home and Dashboard lead; the stages follow them; the rest of the
     app-scope entries (Library, Settings, Purchase, Console) close the
     column. The split is by position in navigation.json, not by name:
     everything up to and including the dashboard entry leads. */
  const dashAt = gl.findIndex((g) => g.id === 'dashboard');
  const lead = dashAt >= 0 ? gl.slice(0, dashAt + 1) : gl.slice(0, 1);
  /* Settings is not a rail entry (owner, 19 Oct 2026): it opens from the
     account avatar at the foot, the one place that is about YOU. */
  const rest = gl.slice(lead.length).filter((g) => g.id !== 'settings');
  const main = h('div.sh-rail-main');
  lead.forEach((g) => main.append(railGlobal(g)));
  if (!isGlobalMode()) main.append(buildRailStages());
  if (rest.length) {
    const tail = h('div.sh-rail-group', { role: 'group', 'aria-label': 'Studio-wide' });
    rest.forEach((g) => tail.append(railGlobal(g)));
    main.append(tail);
  }
  rail.append(main);

  const foot = h('div.sh-rail-foot');
  /* The live trial clock, at the foot of the rail. Built HIDDEN and
     empty; trial-band.js fills and shows it only while a trial runs. */
  foot.append(h('div.sh-rail-trial', { hidden: true }));
  /* Backup and the sync state sit just above the account (owner,
     21 Oct 2026): they are about where YOUR work is kept, so they live
     with you rather than in the band. buildStudioTools() fills this; on
     the doorway it stays empty. */
  foot.append(h('div.sh-rail-tools', { role: 'group', 'aria-label': 'Backup and sync' }));
  /* The account, and nothing else (owner, 19 Oct 2026): the Google photo
     or the initials when signed in (copied from the account pill, which
     auth.js keeps), a person glyph otherwise. It opens the account menu:
     who you are, Settings, your plan, help, and the way out. */
  const acct = h('button.sh-rail-item.sh-rail-util.sh-rail-account', {
    type: 'button', 'data-action': 'rail-account', title: 'Your account',
    'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'shAcctMenu'
  });
  acct.append(h('span.sh-rail-avatar', { 'aria-hidden': 'true', hidden: true }),
              iconSpan('sh-rail-icon.sh-rail-person', { sym: 'person', icon: '◉' }),
              h('span.sh-rail-label', { text: 'Account' }));
  foot.append(acct);
  rail.append(foot);
  return rail;
}

/* THE STAGES, each a link to its main page with a FLYOUT of its
   modules. The flyout opens on hover and on keyboard focus, and it is
   a plain list of links, not a `role="menu"` (L17: nothing here
   implements a menu's arrow keys). It is `position: fixed` beside the
   rail, placed by placeFly() from the stage's own rect, because the
   rail scrolls and would otherwise clip it. */
function buildRailStages() {
  const wrap = h('div.sh-rail-stages', { role: 'group', 'aria-label': 'Stages' });
  phases().forEach((p) => {
    /* The stage's lead (the one stage-link rule): a module switched off
       everywhere is hidden by plan-gate and would take the link with it. */
    const first = leadOf(p);
    if (!first) return;
    /* The rail is 64px wide, so a stage's blurb and its modules'
       plain-English purposes (navigation.json) ride on the link too:
       `title` for a pointer, and a description for a screen reader,
       read from a `hidden` span. Derived, never typed. */
    const desc = stageDescription(p);
    const descId = 'shRailStageDesc-' + p.id;
    const cell = h(`div.sh-rail-stagecell.sh-ph-${p.hue}`, { 'data-phase': p.id });
    const a = h(`a.sh-rail-item.sh-rail-stage.sh-ph-${p.hue}`, {
      href: first.href, title: desc, 'aria-describedby': descId
    });
    a.dataset.phase = p.id;
    a.dataset.moduleId = first.id;   // plan-gate.js markLocked(): the module this link opens
    a.append(h('span.sh-rail-dot', { 'aria-hidden': 'true' }),
             iconSpan('sh-rail-icon', p), h('span.sh-rail-label', { text: p.label }));
    const d = h('span', { id: descId, text: desc });
    d.hidden = true;
    cell.append(a, d, buildFly(p));
    wrap.append(cell);
  });
  markLocked(wrap);
  return wrap;
}

function buildFly(p) {
  const fly = h(`div.sh-fly.sh-ph-${p.hue}`, { 'data-phase': p.id, hidden: true });
  const head = h('div.sh-fly-head');
  head.append(h('span.sh-fly-dot', { 'aria-hidden': 'true' }),
              h('span.sh-fly-title', { text: p.label }));
  fly.append(head);
  if (p.blurb) fly.append(h('p.sh-fly-blurb', { text: p.blurb }));
  const list = h('div.sh-fly-list');
  /* A stage with a landing page of its own (Pre-Production's path) lists
     it first: it is where the stage link goes. */
  if (p.home && p.home.href) list.append(flyRow({ id: p.id + '-home', status: 'built', ...p.home }));
  const mods = p.modules || [];
  /* TWO LEVELS when the stage has groups (owner, 1 Nov 2026). Pre-
     Production is twenty-odd modules and as many sections, and one flat
     list ran off a laptop screen. Level 1 is one row per group
     (navigation.json `group`, in rail order; a module with no group stays
     a row of its own); level 2 is that group's module and section rows,
     built by the SAME flyRow / flySubRow, so plan-gate's markLocked()
     hides and flags them exactly as before, and tidyHeadings() hides a
     group whose rows are all off and keeps its count true. A stage
     without groups keeps the flat list. */
  if (!mods.some((m) => m.group)) {
    for (const m of mods) appendModule(list, m);
  } else {
    const byLabel = new Map();
    const order = [];
    for (const m of mods) {
      if (!m.group) { order.push({ m }); continue; }
      if (!byLabel.has(m.group)) { const g = { label: m.group, mods: [] }; byLabel.set(m.group, g); order.push(g); }
      byLabel.get(m.group).mods.push(m);
    }
    order.forEach((g, i) => {
      if (g.m) { appendModule(list, g.m); return; }
      const pid = 'shFlyG-' + p.id + '-' + i;
      const row = h('button.sh-fly-grp', {
        type: 'button', 'data-fly-group': g.label, 'aria-expanded': 'false', 'aria-controls': pid
      });
      /* the group wears its first module's mark — the first one sold to anybody */
      const lead = g.mods.find((m) => !isDisabledEverywhere(m.id)) || g.mods[0];
      row.append(iconSpan('sh-fly-icon', lead), h('span.sh-fly-label', { text: g.label }),
        h('span.sh-fly-count', { text: String(g.mods.length) }),
        iconSpan('sh-fly-chev', { sym: 'chevron_right', icon: '›' }));
      const panel = h('div.sh-fly-l2', { id: pid, role: 'group', 'aria-label': g.label, hidden: true });
      panel.append(h('p.sh-fly-sub', { text: g.label }));
      for (const m of g.mods) appendModule(panel, m);
      /* The panel sits right after its row: inline it is the accordion's
         body; beside the flyout it is position: fixed (placeL2). */
      list.append(row, panel);
    });
  }
  fly.append(list);
  return fly;
}

/* A module's row and, indented under it, its sections: the page's tabs
   that are not modules of their own, so this list is the page strip's. */
function appendModule(into, m) {
  into.append(flyRow(m));
  if (m.status !== 'planned' && m.href) for (const sec of moduleSections(m)) into.append(flySubRow(m, sec));
}

/* A section of a module: a link to the page's tab, gated with its
   module (data-module-id is the parent's, so markLocked hides or flags
   it with the parent). */
function flySubRow(m, sec) {
  const row = h('a.sh-fly-mod.is-sub', { href: m.href.split('#')[0] + '#' + sec.id });
  row.dataset.moduleId = m.id;
  row.dataset.section = sec.id;
  row.append(iconSpan('sh-fly-icon', { sym: sec.sym }), h('span.sh-fly-label', { text: sec.label }));
  if (sec.purpose) row.title = sec.purpose;
  return row;
}

function flyRow(m) {
  const planned = m.status === 'planned' || !m.href;
  const row = planned
    ? h('button.sh-fly-mod.is-planned', { type: 'button', 'data-action': 'module-planned', 'data-module': m.id })
    : h('a.sh-fly-mod', { href: m.href });
  row.dataset.moduleId = m.id;   // markLocked(): PLAN on a module the plan does not include
  row.append(...[
    iconSpan('sh-fly-icon', m),
    h('span.sh-fly-label', { text: m.label }),
    planned ? h('span.sh-fly-flag', { text: 'SOON' }) : null
  ].filter(Boolean));
  if (m.purpose) row.title = m.purpose;
  return row;
}

/* ---- opening a flyout ------------------------------------------ */
let flyOpen = null;      // the open .sh-fly
let flyTimer = 0;
let flyQuiet = null;     // the cell Escape is returning focus to
function placeFly(cell, fly) {
  const r = cell.getBoundingClientRect();
  const vh = window.innerHeight;
  const bottomGap = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ssb-h')) || 0)
    + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mab-h')) || 0) + 8;
  const h0 = fly.offsetHeight;
  let top = Math.round(r.top);
  if (top + h0 > vh - bottomGap) top = Math.max(8, Math.round(vh - bottomGap - h0));
  fly.style.setProperty('--sh-fly-top', top + 'px');
}
function showFly(cell) {
  clearTimeout(flyTimer);
  const fly = cell && cell.querySelector(':scope > .sh-fly');
  if (!fly) return;
  /* moving from one open flyout to the next is instant: the first one
     waited for intent, the neighbours do not fade in again */
  const instant = !!flyOpen && flyOpen !== fly;
  if (flyOpen && flyOpen !== fly) hideFly(true);
  if (!fly.hidden) return;
  fly.classList.toggle('is-instant', instant);
  fly.hidden = false;
  cell.classList.add('is-fly');
  placeFly(cell, fly);
  flyOpen = fly;
}
function hideFly(now) {
  clearTimeout(flyTimer);
  const go = () => {
    const f = flyOpen;
    if (!f) return;
    /* never shut the flyout the keyboard is inside */
    if (!now && f.parentElement.contains(document.activeElement) && document.activeElement !== document.body
        && f.parentElement.matches(':focus-within')) return;
    closeL2(f);
    f.hidden = true;
    f.classList.remove('is-instant');
    f.parentElement.classList.remove('is-fly');
    flyOpen = null;
  };
  if (now) go(); else flyTimer = setTimeout(go, 160);
}

/* ---- level 2: a group's rows ------------------------------------
   Beside the flyout when the viewport has room for it (a second
   position: fixed panel, placed from the flyout's and the group row's
   own rects, as placeFly() places the first), else an ACCORDION: the
   panel opens in place under its row. It is the same element either
   way; `is-accordion` on the flyout is the only difference, decided
   each time a panel opens. One group open per flyout. */
let l2Timer = 0;
const L2_W = 272;   // the panel's width in chrome.css (.sh-fly-l2)
const l2Of = (row) => row && document.getElementById(row.getAttribute('aria-controls'));
function closeL2(fly) {
  clearTimeout(l2Timer);
  if (!fly) return;
  fly.querySelectorAll('.sh-fly-grp[aria-expanded="true"]').forEach((row) => {
    row.setAttribute('aria-expanded', 'false');
    const panel = l2Of(row);
    if (panel) panel.hidden = true;
  });
  fly.classList.remove('has-l2');
}
function placeL2(fly, row, panel) {
  const fr = fly.getBoundingClientRect();
  const room = window.innerWidth - fr.right - 8;
  fly.classList.toggle('is-accordion', room < L2_W + 4);
  if (fly.classList.contains('is-accordion')) {
    /* the flyout grew: keep it inside the window */
    const cell = fly.parentElement;
    if (cell) placeFly(cell, fly);
    return;
  }
  const rr = row.getBoundingClientRect();
  const vh = window.innerHeight;
  const ph = panel.offsetHeight;
  let top = Math.round(rr.top) - 8;
  if (top + ph > vh - 8) top = Math.max(8, Math.round(vh - 8 - ph));
  panel.style.setProperty('--sh-l2-top', top + 'px');
  panel.style.setProperty('--sh-l2-left', Math.round(fr.right + 4) + 'px');
}
function openL2(row, { focus = false } = {}) {
  clearTimeout(l2Timer);
  const fly = row && row.closest('.sh-fly');
  const panel = l2Of(row);
  if (!fly || !panel || row.hidden) return;
  if (row.getAttribute('aria-expanded') !== 'true') {
    closeL2(fly);
    row.setAttribute('aria-expanded', 'true');
    row.dataset.openedAt = String(Date.now());   // the click that follows a focus must not shut it
    panel.hidden = false;
    fly.classList.add('has-l2');
    placeL2(fly, row, panel);
  }
  if (focus) { const first = navRows(panel)[0]; if (first) first.focus(); }
}
/* The rows the arrow keys walk: the visible ones of one level. Level 1
   is the list's own children (rows and group rows), level 2 one panel. */
function navRows(level) {
  return [...level.children].filter((n) => !n.hidden && n.matches('.sh-fly-mod, .sh-fly-grp'));
}
function flyKeys(e) {
  const el = e.target;
  if (!el || !el.closest) return;
  const panel = el.closest('.sh-fly-l2');
  const level = panel || el.closest('.sh-fly-list');
  if (!level || !el.matches('.sh-fly-mod, .sh-fly-grp')) return;
  const k = e.key;
  if (k === 'ArrowDown' || k === 'ArrowUp') {
    const rows = navRows(level);
    const i = rows.indexOf(el);
    const next = rows[(i + (k === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length];
    if (next) { e.preventDefault(); next.focus(); }
  } else if (el.matches('.sh-fly-grp') && (k === 'ArrowRight' || k === 'Enter')) {
    e.preventDefault();   // Enter would also click, and the click toggles
    openL2(el, { focus: true });
  } else if (panel && (k === 'ArrowLeft' || k === 'Escape')) {
    e.preventDefault();
    e.stopPropagation();   // back one level, not out of the flyout
    const row = panel.previousElementSibling;
    closeL2(el.closest('.sh-fly'));
    if (row) row.focus();
  }
}

/* "Idea, logline, beats. Beats & Pacing: write the story and…; …" —
   the stage's blurb, then each BUILT module's label and purpose. */
function stageDescription(p) {
  const mods = (p.modules || [])
    .filter((m) => m.status !== 'planned' && m.purpose && !isDisabledEverywhere(m.id))
    .map((m) => m.label + ': ' + m.purpose);
  return [p.blurb || p.label, ...mods].join('. ') + '.';
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
  syncRailAccount();
}

/* The rail's account cell mirrors the band's account pill (auth.js owns
   what it says): the pill's initials disc when signed in, the person
   glyph otherwise, and the pill's own title. Read-only, and it only
   touches a node whose value changed, so it can be called from the
   band's MutationObserver without feeding it (the rail is not in the
   observed subtree either way). */
function syncRailAccount() {
  const cell = document.querySelector('#studioRail .sh-rail-account');
  if (!cell) return;
  const pill = document.getElementById('signInPill');
  const av = pill && pill.querySelector('.sip-avatar');
  const text = av && !av.hidden ? (av.textContent || '').trim() || initialsOf(pill.dataset.name) : '';
  const photo = (text && pill && pill.dataset.photo) || '';
  const disc = cell.querySelector('.sh-rail-avatar');
  const person = cell.querySelector('.sh-rail-person');
  if (disc) paintDisc(disc, text, photo);
  if (disc && disc.hidden !== !text) disc.hidden = !text;
  if (person && person.hidden !== !!text) person.hidden = !!text;
  const title = (pill && pill.title) || 'Your account';
  if (cell.title !== title) cell.title = title;
}
function initialsOf(name) {
  const parts = String(name || '').trim().split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '';
  return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] || '' : '')).toUpperCase();
}
/* Initials, or the Google photo over them; only rebuilt when the URL or
   the text changes (this runs from the band's MutationObserver). A photo
   that fails to load leaves the initials showing. */
function paintDisc(el, text, photo) {
  if (el.dataset.text === text && (el.dataset.photo || '') === photo) return;
  el.dataset.text = text;
  el.dataset.photo = photo;
  el.classList.remove('has-photo');
  el.textContent = text;
  if (!photo) return;
  /* The photo REPLACES the initials (they used to sit on top of it);
     they come back only if the image fails to load. */
  const pic = h('img', { src: photo, alt: '', referrerpolicy: 'no-referrer', decoding: 'async' });
  pic.addEventListener('error', () => { pic.remove(); el.classList.remove('has-photo'); el.textContent = text; }, { once: true });
  el.classList.add('has-photo');
  el.replaceChildren(pic);
}

/* ---- the account menu ------------------------------------------
   Opened from the rail's avatar. Built on open from the pill's dataset
   (auth.js keeps it) so it is never stale, and torn down on close. Its
   sign-in and sign-out rows are auth.js's own [data-auth-action]
   buttons, so there is one implementation of each. Writes nothing. */
function closeAcctMenu(returnFocus) {
  const m = document.getElementById('shAcctMenu');
  if (!m) return;
  m.remove();
  const btn = document.querySelector('#studioRail .sh-rail-account');
  if (btn) { btn.setAttribute('aria-expanded', 'false'); if (returnFocus) btn.focus(); }
}
function openAcctMenu(btn) {
  if (document.getElementById('shAcctMenu')) { closeAcctMenu(true); return; }
  const pill = document.getElementById('signInPill');
  const d = (pill && pill.dataset) || {};
  const signedIn = !!(pill && pill.classList.contains('signed-in'));
  const menu = h('div#shAcctMenu.sh-acct-menu', { role: 'menu', 'aria-label': 'Account' });
  if (signedIn) {
    const disc = h('span.sh-acct-avatar', { 'aria-hidden': 'true' });
    paintDisc(disc, initialsOf(d.name) || '?', d.photo || '');
    menu.append(h('div.sh-acct-who', {}, [disc, h('div.sh-acct-id', {}, [
      h('span.sh-acct-name', { text: d.name || 'Signed in' }),
      d.email ? h('span.sh-acct-email', { text: d.email }) : null
    ])]));
  } else {
    menu.append(h('div.sh-acct-who', {}, [h('div.sh-acct-id', {}, [
      h('span.sh-acct-name', { text: 'Not signed in' }),
      h('span.sh-acct-email', { text: 'Your work is saved on this device.' })
    ])]));
  }
  const row = (tag, attrs, sym, label) => {
    const el = h(tag + '.sh-acct-item', { role: 'menuitem', ...attrs });
    el.append(iconSpan('sh-acct-icon', { sym, icon: '' }), h('span', { text: label }));
    return el;
  };
  const settings = globals().find((g) => g.id === 'settings');
  const purchase = globals().find((g) => g.id === 'purchase');
  menu.append(h('div.sh-acct-list', {}, [
    row('a', { href: (settings && settings.href) || 'settings.html' }, 'settings', 'Settings'),
    purchase ? row('a', { href: purchase.href }, purchase.sym || 'shopping_cart', 'Purchase') : null,
    row('button', { type: 'button', 'data-action': 'rail-help' }, 'help', 'Help & shortcuts'),
    row('button', { type: 'button', 'data-action': 'rail-whatsnew' }, 'auto_awesome', 'What’s new'),
    signedIn
      ? row('button', { type: 'button', 'data-auth-action': 'signout' }, 'logout', 'Sign out')
      : row('button', { type: 'button', 'data-auth-action': 'pill' }, 'login', 'Sign in')
  ]));
  document.body.append(menu);
  const r = btn.getBoundingClientRect();
  menu.style.setProperty('--sh-acct-left', Math.round(r.right + 8) + 'px');
  menu.style.setProperty('--sh-acct-bottom', Math.max(8, Math.round(window.innerHeight - r.bottom)) + 'px');
  btn.setAttribute('aria-expanded', 'true');
  const first = menu.querySelector('.sh-acct-item');
  if (first) first.focus();
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

/* THE ANNOUNCEMENT PLATE IS GONE (owner, 11 Oct 2026). Nothing sits
   above the band now except trial-band.js's own .sh-trial strip, and
   only while a trial runs. src/data/announcements.json is unused. */

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

  /* THE STAGE STRIP LEFT THE BAND (Swiss shell, 14 Oct 2026): the five
     stages are in the rail now, each with a flyout of its modules, and
     the crumb's stage segment still names the one you are in. The band
     is one 56px row: where you are, search, the page's tools, the
     studio's zone. */

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
  /* A REAL FIELD (owner, 12 Oct 2026: "a real search box in the top bar").
     It is a launcher with a field's shape: a click or the first printable
     key opens the results panel (the palette) carrying what was typed, so
     the one index, ranking and keyboard handling stay in one place.
     Deliberately NOT opened on focus: the palette gives focus back to its
     opener on close, and a field that opens on focus would reopen it. */
  const kbd = mac ? '⌘K' : 'Ctrl K';
  const findInput = h('input.sh-find-input', {
    type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off',
    placeholder: 'Search the studio', 'aria-label': 'Search the studio',
    'aria-haspopup': 'dialog', 'aria-keyshortcuts': 'Meta+K Control+K'
  });
  const find = h('div.sh-find', { 'data-action': 'palette-open', title: 'Search the studio  (' + kbd + ')' });
  find.append(iconSpan('sh-find-icon', { sym: 'search', icon: '⌕' }), findInput,
              h('kbd.sh-find-key', { text: kbd, 'aria-hidden': 'true' }));
  findInput.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Enter') { e.preventDefault(); openPalette(); }
    else if (e.key.length === 1) { e.preventDefault(); openPalette(e.key); }
  });
  findInput.addEventListener('input', () => { const v = findInput.value; findInput.value = ''; if (v) openPalette(v); });
  bar.append(find);
  bar.dataset.mode = GLOBAL_MODE;
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
  /* ONE ZONE ON EVERY PAGE (owner, 12 Oct 2026): project switcher ·
     Backup · theme · your name, in that order, at the right edge. On the
     four pages that build a `.toolbar` the zone lives INSIDE it, as its
     last child, so the existing band layout (the grid column, the
     stacked second row, the phone row) carries it with no second set of
     rules; on the rest it is a direct child of the band. */
  const host = bar.querySelector(':scope > .toolbar') || bar;
  let tools = bar.querySelector('.sh-tools');
  if (!tools) {
    tools = h('div.sh-tools', { role: 'group', 'aria-label': 'Project, backup, theme and account' });
    host.append(tools);
  }
  const doorway = CURRENT === 'invite.html';   // the doorway keeps Sign in only
  /* Backup and sync go to the rail's foot when there is a rail; the
     band keeps them only on a page without one. */
  const railTools = document.querySelector('#studioRail .sh-rail-tools');
  if (!doorway) {
    try { mountProjectSwitcher(tools); } catch (e) { /* a control is not a reason to lose the band */ }
    try { mountBackupMenu(railTools || tools, { rail: !!railTools }); } catch (e) { /* ditto */ }
  }
  if (!doorway && !document.querySelector('.sh-sync')) {
    try { (railTools || tools).append(buildSyncPill(!!railTools)); } catch (e) { /* ditto */ }
  }
  if (railTools) for (const el of railTools.children) el.setAttribute('data-rail-home', '');
  const ui = (typeof window !== 'undefined' && window.StudioUI) || null;
  if (ui) {
    try { if (ui.mountAppearanceMenu) ui.mountAppearanceMenu(tools); } catch (e) { /* ditto */ }
    try { if (ui.attachSignInPill) ui.attachSignInPill(tools); } catch (e) { /* ditto */ }
  }
  gatherTools(bar, tools);
  /* Pages mount their own pill and theme button after this runs (the
     chrome auto-init, each page's re-init), into a toolbar. They are
     moved in as they arrive, and the order is re-stated each time. */
  try {
    new MutationObserver(() => gatherTools(bar, tools)).observe(bar, { childList: true, subtree: true });
  } catch (e) { /* no MutationObserver: the first gather is what there is */ }
  return tools;
}

/* Pull the four controls into the zone, in their order. Moving a node
   that is already in place is skipped, so this is safe to call from a
   MutationObserver (the move it makes is the only change it causes,
   and the second run finds nothing to move). */
const ZONE_ORDER = ['.ps-btn', '[data-tb-backup]', '[data-theme-toggle]', '.sh-sync', '#signInPill'];

/* ---- THE SYNC PILL (parity matrix group B, 14 Oct 2026) --------
   Where the work is safe, said in the band on every page and at every
   width: a dot, a cloud and the status bar's own words (syncLine()),
   so the band and the dock can never disagree. DERIVED, never stored:
   it reads getSyncStatus() on the `cloud:status` bus event and writes
   nothing. Signed out it says "Local only", which is the truth, not a
   failure. A link to Settings › Account, where Sync now and the cloud
   switch live. On a phone the words go (the dot and the cloud stay,
   the words are its accessible name); the dock repeats them. */
const SYNC_ICON = { ok: 'cloud_done', busy: 'cloud_sync', warn: 'cloud_upload', err: 'sync_problem', off: 'cloud_off' };
function buildSyncPill(inRail) {
  const led = h('span.sh-sync-led', { 'aria-hidden': 'true' });
  /* In the rail it is one rail item: the cloud, the dot on its corner,
     and the words as the rail's tooltip (still the link's text). */
  const icon = iconSpan(inRail ? 'sh-rail-icon.sh-sync-icon' : 'sh-sync-icon', { sym: SYNC_ICON.off });
  const text = h(inRail ? 'span.sh-rail-label.sh-sync-text' : 'span.sh-sync-text');
  const pill = inRail
    ? h('a.sh-rail-item.sh-rail-util.sh-sync', { href: 'settings.html#account' }, [icon, led, text])
    : h('a.sh-sync', { href: 'settings.html#account' }, [led, icon, text]);
  const paint = (st) => {
    const l = syncLine(st);
    if (text.textContent !== l.text) text.textContent = l.text;
    if (pill.dataset.tone !== l.tone) {
      pill.dataset.tone = l.tone;
      icon.textContent = SYNC_ICON[l.tone] || SYNC_ICON.off;
    }
    const name = 'Sync: ' + (l.detail && l.detail !== l.text ? l.detail : l.text) + '. Open account settings';
    if (pill.getAttribute('aria-label') !== name) { pill.setAttribute('aria-label', name); pill.title = name; }
  };
  const cloud = () => (typeof window !== 'undefined' && window.StudioCloud) || null;
  const refresh = () => { const c = cloud(); paint(c && c.getSyncStatus ? c.getSyncStatus() : null); };
  refresh();
  Store.subscribe('cloud:status', paint);
  /* StudioCloud arrives after the first paint on some pages (the status
     bar waits the same way, and stops). */
  const hook = setInterval(() => {
    const c = cloud();
    if (!c) return;
    clearInterval(hook);
    if (c.onAuth) c.onAuth(() => setTimeout(refresh, 0));
    refresh();
  }, 50);
  setTimeout(() => clearInterval(hook), 20000);
  return pill;
}
function gatherTools(bar, tools) {
  let moved = false;
  for (const sel of ZONE_ORDER) {
    const el = document.querySelector(sel);
    /* backup and sync live in the rail (and visit the phone's Tools sheet
       from there): never gathered into the band */
    if (el && (el.closest('#studioRail') || el.hasAttribute('data-rail-home'))) continue;
    if (el && el.parentElement !== tools) { tools.append(el); moved = true; }
  }
  if (!moved) {
    // Already gathered: only re-order if something is out of order.
    const have = ZONE_ORDER.map((sel) => tools.querySelector(sel)).filter(Boolean);
    const now = [...tools.children].filter((c) => have.includes(c));
    if (have.every((c, i) => now[i] === c)) return;
  }
  for (const sel of ZONE_ORDER) {
    const el = tools.querySelector(sel);
    if (el) tools.append(el);
  }
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

/* The flyout row for where you are: a SECTION row when the address names
   one of this page's sections (reports.html#dpr), else the module's own
   row. Run on every hash change, since a section is not a location the
   crumb resolves exactly. */
function markFlyHere(loc) {
  const tab = (location.hash || '').replace(/^#/, '').split('?')[0];
  const sub = tab ? [...document.querySelectorAll('.sh-fly-mod.is-sub')].find((r) =>
    r.dataset.section === tab && pageFile((r.getAttribute('href') || '').split('#')[0]) === CURRENT) : null;
  document.querySelectorAll('.sh-fly-mod').forEach((m) => {
    const here = sub ? m === sub
      : !m.classList.contains('is-sub') && !!(loc && loc.module && m.dataset.moduleId === loc.module.id);
    m.classList.toggle('is-here', here);
    if (here) m.setAttribute('aria-current', 'page'); else m.removeAttribute('aria-current');
  });
  /* the group holding it, at level 1 (aria-current stays on the row) */
  document.querySelectorAll('.sh-fly-grp').forEach((g) => {
    const panel = l2Of(g);
    g.classList.toggle('has-here', !!(panel && panel.querySelector('.sh-fly-mod.is-here')));
  });
}
let crumbEl = null;

function paintLocation(loc) {
  current = loc;
  if (crumbEl) renderCrumb(crumbEl, loc);

  document.querySelectorAll('.sh-phase').forEach((tab) => {
    const on = !!loc.phase && tab.dataset.phase === loc.phase.id;
    tab.classList.toggle('is-active', on);
    const b = tab.querySelector('.sh-phase-btn');
    if (b) { if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
  });
  /* The module the page is in, for mobile-nav's Go-to sheet (the stage
     menus that used to carry the .is-here row are gone). */
  if (loc.module && loc.module.id) document.documentElement.setAttribute('data-sh-module', loc.module.id);
  else document.documentElement.removeAttribute('data-sh-module');
  document.querySelectorAll('.sh-rail-stage').forEach((a) => {
    const on = !!loc.phase && a.dataset.phase === loc.phase.id;
    a.classList.toggle('is-active', on);
    /* The stage is "where you are" in the rail as the global entries
       are; aria-current only when no global entry already claims it. */
    if (on && !document.querySelector('.sh-rail-item[data-rail-id][aria-current]')) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  /* …and the module, in its flyout. */
  markFlyHere(loc);
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
  /* Compared by IDENTITY OF PLACE, not of object: globals() and the tab
     fallback build fresh objects on every call, so `===` on them never
     matched on the Library — every rAF repainted the crumb, the repaint
     fed the #app/.sh-bar observers, and scrolling stuttered at 30fps. */
  const key = (x) => (x ? (x.id || x.href || x.label || '') + '|' + (x.label || '') : '');
  if (current && key(current.module) === key(loc.module) && key(current.global) === key(loc.global)
      && key(current.phase) === key(loc.phase) && partOf(current) === partOf(loc)) {
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
  const plate = document.querySelector('.sh-trial');
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
  /* With no stage strip (the global pages) the anchor IS the crumb, so
     "the crumb ends before the anchor starts" can never hold and the band
     was stacked on every one of them. There the question is whether the
     crumb ends before the zone starts. */
  const hasStages = !!bar.querySelector('.sh-phases');
  const c = crumb ? crumb.getBoundingClientRect() : { right: a.left };
  const fits = t.top < a.bottom && t.height <= ctl * 1.5
    && t.right <= b.right + 1 && t.left >= a.right - 1 && c.right <= (hasStages ? a.left : t.left) + 1
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
  /* The value things are parked on RIGHT NOW: what this function last
     published, or, before it has run once, the stylesheet's default.
     It used to be `lastBand`, with the parked test gated on
     `lastBand > 0` — which is false on exactly the width where the
     band is 0 by design (below 720px the bar scrolls away). There the
     tab strip, pinned at top: 0, was counted as the band (61px), so
     the strip moved to top: 61; the next measure found it parked on
     the published value and put the band back to 0; the strip moved
     back. Every resize and every band mutation flipped it — the strip
     jumped 61px down and up on a phone — and a fragment that landed
     on the 0/0 beat sat under the strip. Measured on budget#topsheet
     at 390px: chrome 0, cover 0, heading behind the strip. */
  const published = lastBand >= 0 ? lastBand
    : (parseFloat(getComputedStyle(de).getPropertyValue('--sh-chrome-h')) || 0);
  /* A small, structural candidate set rather than a walk of the
     document: this runs on resize frames, and the hub is several
     thousand nodes. */
  /* `nav.tabs` is named because settings and admin wrap their sections in
     a div, so the strip is a grandchild of <main> and was never counted:
     --sh-cover-h stayed the band alone and a #storage landing put the
     card's first 34px behind the strip. */
  for (const el of document.querySelectorAll('#app > *, body > *, main > *, main nav.tabs')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'sticky' && cs.position !== 'fixed') continue;
    const top = parseFloat(cs.top);
    if (!Number.isFinite(top) || top < 0 || top > vh / 2) continue;
    const r = el.getBoundingClientRect();
    /* A row of chrome is at least a line of text tall. The floor is
       what keeps .reading-progress out of the sum — 2px, fixed, full
       width, and not a thing anything is hidden behind. */
    /* The tab strip is the exception to "wide": at 1440 it is a 685px
       strip beside the side-menu gutter, under half the viewport, so this
       test dropped it and --sh-cover-h stayed the band alone: a tab landing
       or a keyboard-focus scroll put the first lines under the strip. It
       must still straddle the middle, below. */
    if (r.height < 16 || (r.width < vw * 0.5 && !el.classList.contains('tabs'))) continue;
    /* AND NOT A SCREEN. plan-gate's .pg-lock is a fixed, full-width
       overlay parked at `top: var(--sh-chrome-h)`; with the band
       hidden (the paywall hides it) and no trial strip above it, it
       measured as a band of its own height and then parked on that,
       so the wall sat below the fold at 900px. The old announcement
       plate hid it by keeping the band above zero. A band is never
       most of the viewport; an overlay is. */
    if (r.height > vh * 0.6) continue;
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
    /* BUT NEVER THE BAND ITSELF. The position test cannot tell the
       two apart once the phone band is pinned at `top: 0` (14 Oct
       2026) and 0 is what was published: rotate a phone from
       landscape, where the band is not pinned and 0 is correct, to
       portrait, and the band's top equals the published 0, so it was
       filed as parked, `band` stayed 0, nothing changed and nothing
       ever would — the tab strip pinned under the 56px band until a
       reload. The band is known by identity, so only what parks on it
       goes through the position test. */
    const isBand = el.classList.contains('sh-bar') || !!el.querySelector('.sh-bar');
    if (!isBand && Math.abs(top - published) <= 1) { parked += Math.round(r.height); continue; }
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
  /* (14 Oct 2026) On a desk the rail is fixed and has no open/closed
     choice any more, so nothing is written. RAIL_KEY stays declared and
     readable: an old stored '0' is simply ignored. */
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
  /* Only what is on screen can take focus: a hidden admin link or the
     phone-only stage links on a wide viewport would stall Tab. */
  const stops = [...rail.querySelectorAll('a[href], button:not([disabled])')].filter((el) => el.getClientRects().length > 0);
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
  /* Desk: always shown (a fixed 64px icon rail). Phone: a drawer, closed. */
  return !isNarrow();
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
  const phaseStrip = document.querySelector('.sh-phases');
  if (phaseStrip) {
    phaseStrip.addEventListener('scroll', () => flagPhaseOverflow(phaseStrip), { passive: true });
    window.addEventListener('resize', () => flagPhaseOverflow(phaseStrip), { passive: true });
  }

  /* THE STAGE FLYOUTS. Hover opens one (a short delay on the way out,
     so the pointer can cross from the icon to the panel); keyboard focus
     opens it too, and Tab walks on into its links. Escape and a click
     elsewhere put it away; following a link does too. */
  const rail = document.getElementById('studioRail');
  if (rail) {
    /* The icon's label is a tooltip beside the rail. It is fixed, not
       absolute, because the rail scrolls and would clip it; its height is
       placed from the item's own rect, read when the item is reached. */
    const tip = (e) => {
      const it = e.target.closest && e.target.closest('.sh-rail-item');
      if (!it) return;
      const r = it.getBoundingClientRect();
      it.style.setProperty('--sh-tip-y', Math.round(r.top + r.height / 2) + 'px');
      it.style.setProperty('--sh-tip-x', Math.round(r.right) + 'px');
    };
    rail.addEventListener('pointerover', tip);
    rail.addEventListener('focusin', tip);
    /* INTENT, THEN INSTANT (19 Oct 2026). The first flyout waits for the
       pointer to rest 120ms, so a mouse travelling down the rail to the
       account button no longer flashes every stage on the way; once one
       is open, the next opens at once and without a fade. The labels do
       the same: after the first one has shown, the rail is `is-tipping`
       and the next label appears with no delay, until the pointer has
       been off the rail for 300ms. */
    let intentCell = null;
    let tipOn = 0, tipOff = 0;
    rail.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch') return;
      const cell = e.target.closest && e.target.closest('.sh-rail-stagecell');
      if (!cell) { intentCell = null; if (!e.target.closest('.sh-fly')) hideFly(); return; }
      if (flyOpen) { intentCell = null; showFly(cell); return; }
      if (intentCell === cell) return;   // still resting on the same stage
      intentCell = cell;
      clearTimeout(flyTimer);
      flyTimer = setTimeout(() => { if (intentCell === cell) showFly(cell); }, 120);
    });
    rail.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch' || !(e.target.closest && e.target.closest('.sh-rail-item'))) return;
      clearTimeout(tipOff);
      if (!rail.classList.contains('is-tipping') && !tipOn) tipOn = setTimeout(() => { tipOn = 0; rail.classList.add('is-tipping'); }, 120);
    });
    rail.addEventListener('pointerleave', () => {
      intentCell = null;
      hideFly();
      clearTimeout(tipOn); tipOn = 0;
      clearTimeout(tipOff);
      tipOff = setTimeout(() => rail.classList.remove('is-tipping'), 300);
    });
    rail.addEventListener('focusin', (e) => {
      const cell = e.target.closest && e.target.closest('.sh-rail-stagecell');
      if (cell && cell === flyQuiet) return;   // Escape handing focus back: stay shut
      if (cell) showFly(cell); else hideFly(true);
    });
    rail.addEventListener('focusout', (e) => {
      const to = e.relatedTarget;
      if (!to || !(to.closest && to.closest('.sh-rail-stagecell.is-fly'))) hideFly(true);
    });
    rail.addEventListener('scroll', () => hideFly(true), { passive: true });
    /* Level 2 (openL2): a group opens on a resting pointer (100ms, so a
       pointer travelling down level 1 does not flash every group), at
       once on a click, a focus, ArrowRight or Enter. Moving onto another
       level-1 row closes it after a longer wait, so a diagonal move from
       a group row to its panel survives crossing the row below. */
    rail.addEventListener('pointerover', (e) => {
      if (e.pointerType === 'touch' || !e.target.closest) return;
      if (e.target.closest('.sh-fly-l2')) { clearTimeout(l2Timer); return; }
      const row = e.target.closest('.sh-fly-grp');
      const fly = e.target.closest('.sh-fly');
      if (!fly || fly.classList.contains('is-accordion')) return;
      clearTimeout(l2Timer);
      if (row) { if (row.getAttribute('aria-expanded') !== 'true') l2Timer = setTimeout(() => openL2(row), fly.classList.contains('has-l2') ? 180 : 100); }
      else if (e.target.closest('.sh-fly-list > .sh-fly-mod')) l2Timer = setTimeout(() => closeL2(fly), 240);
    });
    rail.addEventListener('click', (e) => {
      const row = e.target.closest && e.target.closest('.sh-fly-grp');
      if (!row) return;
      if (row.getAttribute('aria-expanded') === 'true' && row.closest('.sh-fly.is-accordion')
          && Date.now() - Number(row.dataset.openedAt || 0) > 400) closeL2(row.closest('.sh-fly'));
      else openL2(row);
    });
    rail.addEventListener('focusin', (e) => {
      const row = e.target.closest && e.target.closest('.sh-fly-grp');
      if (row) openL2(row);
      else if (e.target.closest && e.target.closest('.sh-fly-list > .sh-fly-mod')) closeL2(e.target.closest('.sh-fly'));
    });
    rail.addEventListener('keydown', flyKeys);
  }
  delegate(document, 'click', '.sh-fly a', () => hideFly(true));

  /* Help in the rail's foot: the shortcut sheet, which already lists the
     keys and the page's own help. */
  delegate(document, 'click', '[data-action="rail-account"]', (e, el) => openAcctMenu(el));
  /* What's new: the same drawer the dashboard opens (src/ui/changelog.js),
     fetched on the click so neither it nor the entries ride on any page's
     first paint. Focus goes back to the avatar, since the menu closes. */
  delegate(document, 'click', '[data-action="rail-whatsnew"]', () => {
    const back = document.querySelector('#studioRail .sh-rail-account');
    import('./changelog.js').then((m) => m.openChangelog(back), () => { /* offline: nothing opens */ });
  });
  /* Any choice in the account menu closes it; a click elsewhere or
     Escape does too. Arrow keys move between its rows. */
  /* On WINDOW, which hears the click after every document-level handler:
     closing first detached the row, so delegate()'s root.contains() check
     failed for the row's own handler and 'Help & shortcuts' did nothing. */
  window.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('#shAcctMenu .sh-acct-item')) closeAcctMenu(false);
  });
  document.addEventListener('click', (e) => {
    const m = document.getElementById('shAcctMenu');
    if (m && !m.contains(e.target) && !e.target.closest('.sh-rail-account')) closeAcctMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    const m = document.getElementById('shAcctMenu');
    if (!m) return;
    if (e.key === 'Escape') { e.preventDefault(); closeAcctMenu(true); return; }
    /* The menu sits at the end of <body>, so Tab would run out of it into
       the footer under it. Tab closes it and carries on from the button. */
    if (e.key === 'Tab') { closeAcctMenu(true); return; }
    const items = [...m.querySelectorAll('.sh-acct-item')];
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      (e.key === 'Home' ? items[0] : items[items.length - 1]).focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const i = items.indexOf(document.activeElement);
    const n = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    if (n) { e.preventDefault(); n.focus(); }
  });
  window.addEventListener('resize', () => closeAcctMenu(false));

  delegate(document, 'click', '[data-action="rail-help"]', () => {
    /* Close the menu first, here, so the sheet's opener is the Account
       button and not a row that is about to be detached. */
    closeAcctMenu(true);
    const ui = window.StudioUI;
    if (ui && ui.openShortcutSheet) ui.openShortcutSheet();
  });

  delegate(document, 'click', '[data-action="rail-toggle"]', () => {
    if (!isNarrow()) return;   // no toggle on a desk
    setRail(!document.body.classList.contains('rail-shown'));
  });

  // Tapping the dimmed page puts the drawer away — the gesture every
  // drawer has, and the reason the scrim is a real element rather
  // than a ::before nobody can click.
  delegate(document, 'click', '[data-action="rail-close"]', () => { if (isNarrow()) setRail(false); });

  // The breadcrumb's stage segment goes to the stage's main page (on a
  // phone mobile-nav.js intercepts it first and opens the Go-to sheet).
  delegate(document, 'click', '[data-action="crumb-phase"]', (e, btn) => {
    const p = phases().find((x) => x.id === btn.dataset.phase);
    const href = p && phaseHref(p);
    if (href) location.assign(href);
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
    if (flyOpen && !e.target.closest('.sh-rail-stagecell')) hideFly(true);
    // Narrow: the rail is a temporary overlay, so following a link or
    // tapping the page puts it away again.
    if (!isNarrow()) return;
    if (e.target.closest('#studioRail a')) { setRail(false); return; }
    if (!e.target.closest('#studioRail, [data-action="rail-toggle"]')) setRail(false);
  });
  document.addEventListener('keydown', (e) => {
    trapRailFocus(e);
    if (e.key !== 'Escape') return;
    if (flyOpen) {
      const cell = flyOpen.parentElement;
      const inside = cell && cell.contains(document.activeElement);
      hideFly(true);
      if (inside) { const a = cell.querySelector('.sh-rail-stage'); flyQuiet = cell; if (a) a.focus(); flyQuiet = null; }
    }
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
     Call Sheets on contacts.html moves the crumb's LAST segment to Call
     Sheets and choosing Contacts moves it back. The stage segment, the
     lit rail stage and the colour stay the page's home stage. */
  window.addEventListener('hashchange', () => {
    const loc = resolveLocation();
    if (loc.exact || !current || !current.exact) goTo(loc);
    markFlyHere(current || loc);
  });

  let raf = 0;
  window.addEventListener('resize', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; measureBar(); runSpy(); fitOpenMenus(); if (flyOpen) hideFly(true); });
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

  /* The page's palette is its HOME STAGE's, from the file alone — never
     from the hash it was entered by, which used to paint
     contacts.html#call-sheets in Production's colour and contacts.html
     in Pre-Production's. Every root .html carries the same value
     statically (scripts/test-home-stage.mjs), so this restates the
     first paint rather than changing it; a page with no home stage
     carries none. */
  if (HOME_PHASE) document.documentElement.setAttribute('data-phase', HOME_PHASE.id);
  else document.documentElement.removeAttribute('data-phase');

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
  adoptPageTools(bar);
  buildStudioTools(bar);
  crumbEl = bar.querySelector('#studioWhere');
  document.body.classList.add('has-sh-shell');
  document.documentElement.setAttribute('data-shell-mode', GLOBAL_MODE);
  renderTrialBand();   // the strip exists only while a trial runs
  /* The status bar at the foot is retired (owner, 19 Oct 2026): the
     rail's account avatar is the only thing at the bottom now. */
  wire();
  setRail(initialRail());
  paintLocation(active);
  syncRailAccount();
  /* Two frames: one for layout, one for the web fonts to land. The
     bar is measured, and measuring it before the brand face (Catamaran) and
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
  /* "How this works": one idle import decides whether this page's modules
     have an approved video; nothing is added (or fetched) otherwise. */
  /* module ids, plus the owning phase id (module:write covers write.html). */
  const helpIds = [...new Set(hereModules().flatMap((m) => [m.module.id, m.phase && m.phase.id]).filter(Boolean))];
  if (helpIds.length) {
    /* Deferred to the first real interaction (or 8s): the chunk is first-paint
       bytes otherwise, and a button arriving mid-load re-wraps the band under
       a fragment jump that has already landed. */
    const EV = ['pointerdown', 'pointermove', 'keydown', 'touchstart'];
    let done = false;
    const go = () => {
      if (done) return; done = true;
      EV.forEach((t) => window.removeEventListener(t, go, true));
      import('./video-help.js').then((m) => m.mountHelp(document.querySelector('.sh-bar'), helpIds)).catch(() => {})
        .finally(() => document.documentElement.removeAttribute('data-vid-help-pending'));
    };
    /* Marks the deferred import as not yet landed, so a check that reads
       the band (prove:nav) can wait for it instead of guessing a delay. */
    document.documentElement.setAttribute('data-vid-help-pending', '');
    EV.forEach((t) => window.addEventListener(t, go, { capture: true, passive: true }));
    setTimeout(go, 8000);
  }
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
      mraf = requestAnimationFrame(() => { mraf = 0; measureBar(); syncRailAccount(); });
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
