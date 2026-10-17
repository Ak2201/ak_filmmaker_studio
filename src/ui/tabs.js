/* ============================================================
   TABS — a page's sections as categories, one on screen at a time
   ------------------------------------------------------------
   Owner's ask, 6 Oct 2026: "not scrollable — tabbed, in all modules
   wherever possible; categorised things are needed." So on the pages
   listed in TABBED below, the top-level `section[id]` elements become
   tabs: a strip of them pinned under the shell's band, the active one
   shown, the others `hidden`. Nothing is removed from the document —
   every section keeps its id and its content, which is why

     - a deep link (reports.html#sides, or the phase menu's
       breakdown.html#elements) lands on the right tab: the hash picks
       the tab, and an in-page link to another section switches to it
       through the same hashchange;
     - the verify gate still counts every data-key and every word (it
       reads innerHTML), and every proof that targets a section by id
       still finds it — a hidden tab is reached by its hash;
     - the shell's breadcrumb keeps following the hash.

   WHICH PAGES. An explicit list, and a UI decision per page rather
   than a derivation, because the rule "several sibling sections" is
   true of pages that must NOT be tabbed: the two blueprints are a
   24-step reading flow with their own step rail, the hub is a landing
   page the verify gate drives, invite.html is two routes meant to be
   seen together, story.html IS its beats editor with two side rooms.
   Everything else with categories is here. Eleven pages today: settings,
   admin, library, breakdown, stripboard, reports, contacts, visualize,
   write, plan and budget. study and dissect are redirect stubs (they
   moved into the Library) and are not tabbed pages. write.html is
   retired; behind ?stay=1 it shows only the sections navmodel's
   STAY_PAGES names (AI coverage, Write from a synopsis).

   LABELS. `data-tab-label` on the section wins; then the label of the
   navigation.json module whose fragment is this section's id; then
   the section's own heading, without its final full stop.

   RE-APPLIED on DOM changes: settings.html and admin.html replace
   `main` on every render, breakdown.html fills its sections when a
   scene exists, so a MutationObserver on #app re-runs apply() rather
   than trusting one call at mount. Idempotent: the strip is rebuilt
   only when the set of tabs changes.

   THE STRIP IS section-menu.js. This file READS the page (the sections,
   their data-tab-label / -group / -icon / -hint / -badge, plan-gate's
   data-tab-lock, and src/data/section-icons.json `pages` for module pages
   that carry none) and hands the list to buildSectionMenu(); it never draws
   a row itself. Three or more tabs get the side layout: the container
   gets `.tabs-has-side` and tabs.css lays it out as a column at 1100px
   and over, the strip plus a Sections sheet below. A change to a count,
   hint, icon or lock patches the rows in place (updateSectionMenu), so
   the strip, its scroll and focus survive.

   ARIA: role=tablist (.tabs-list inside the nav) / tab / tabpanel, arrow
   keys, Home and End.
   ============================================================ */
import nav from '../data/navigation.json';
import { stayEntry } from '../lib/navmodel.js';
import { buildSectionMenu, updateSectionMenu, itemsFromSections } from './section-menu.js';
import '../styles/tabs.css';

const TABBED = new Set(['settings', 'admin', 'library', 'breakdown', 'stripboard', 'reports', 'contacts', 'visualize', 'write', 'plan', 'budget']);

const page = () => (typeof location === 'undefined' ? '' : (location.pathname.split('/').pop() || 'index.html').toLowerCase().replace(/\.html$/, '').replace(/^$/, 'index'));

function navLabel(id) {
  const here = page() + '.html';
  for (const p of nav.phases) for (const m of p.modules) {
    if (!m.href) continue;
    const [f, frag] = m.href.split('#');
    if (f.toLowerCase() === here && frag === id) return m.label;
  }
  return '';
}
function labelFor(sec) {
  if (sec.dataset.tabLabel) return sec.dataset.tabLabel;
  const n = navLabel(sec.id);
  if (n) return n;
  const hd = sec.querySelector('h2, h3, .bd-h2');
  const t = hd ? hd.textContent.trim().replace(/[.:]\s*$/, '') : '';
  return t || sec.id;
}

/* The tab already says what the panel is, so a first eyebrow or heading
   that only repeats the label is hidden (aria-hidden + display:none via
   .tabs-dup, nothing deleted). One that says something different, or
   that carries an id, stays. */
const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim().replace(/[.:]+$/, '').toLowerCase();
function dedupeHeads(sections) {
  for (const sec of sections) {
    const want = norm(labelFor(sec));
    if (!want) continue;
    for (const sel of ['.label, .eyebrow, .kicker', 'h2, .bd-h2']) {
      const el = sec.querySelector(sel);
      if (!el || el.classList.contains('tabs-dup')) continue;
      if (norm(el.textContent) !== want) continue;
      if (el.id || el.querySelector('[id]')) continue;
      el.classList.add('tabs-dup');
      el.setAttribute('aria-hidden', 'true');
    }
  }
}

/** The sections that are tabs: `section[id]` children of ONE container
 *  (the first parent that holds two or more), so a header above them
 *  and a note below them stay where they are. */
function findTabs() {
  const main = document.querySelector('main');
  if (!main) return { parent: null, sections: [], out: [] };
  let all = [...main.querySelectorAll('section[id]')];
  /* A retired page kept behind ?stay=1 (navmodel STAY_PAGES) shows only
     the sections it names. The rest are hidden, not removed, and are
     left out of the strip so show() never re-opens them. */
  const stay = stayEntry(page() + '.html', location.search);
  if (stay && stay.frags && Object.keys(stay.frags).length) {
    const keep = all.filter((s) => stay.frags[s.id]);
    for (const s of all) if (!keep.some((k) => k.contains(s))) s.hidden = true;
    all = keep;
  }
  /* A section that is not a tab at all: `data-tab-ignore` (the page says
     so) or `data-tab-off` (plan-gate: the module is off for everybody).
     It stays in the document, hidden, so its fields and words still count;
     it is only kept out of the strip. Anything inside it goes too. */
  const out = all.filter((s) => s.hasAttribute('data-tab-ignore') || s.hasAttribute('data-tab-off'));
  if (out.length) {
    /* #guide (an old blueprint link) names an ignored section: it is the
       one thing a deep link may open, so it is not forced shut again. */
    for (const s of out) s.hidden = !(s.id === 'guide' && hashTab() === 'guide');
    all = all.filter((s) => !out.some((o) => o === s || o.contains(s)));
  }
  const byParent = new Map();
  for (const s of all) { const p = s.parentElement; byParent.set(p, (byParent.get(p) || []).concat(s)); }
  for (const [parent, list] of byParent) if (list.length >= 2) return { parent, sections: list, out };
  return { parent: null, sections: [], out };
}

/* The strip tabs.js owns. A menu somebody else built from an explicit
   list (section-menu.js, onSelect) is marked [data-sm-self] and is none
   of this file's business: its clicks, keys and aria state are its own. */
const OWN = '.tabs:not([data-sm-self])';

let signature = '';
let active = '';

/* The part of the hash before a `?`: a page may hang its own state off
   the tab (admin.html#people?user=7 — the console's drawer), and that
   is not part of the tab's id. */
const hashTab = () => (location.hash || '').replace(/^#/, '').split('?')[0];

function currentFromHash(sections) {
  const want = hashTab();
  if (want) {
    if (sections.some((s) => s.id === want)) return want;
    // a fragment INSIDE a tab's section selects that tab
    const el = document.getElementById(want);
    const owner = el && sections.find((s) => s.contains(el));
    if (owner) return owner.id;
  }
  /* `?tab=` is the moved-page stubs' fallback (src/pages/moved.js): the
     tab their page became, for an old fragment that resolves to
     nothing here. Only ever consulted after the hash has failed. */
  let tab = '';
  try { tab = new URLSearchParams(location.search).get('tab') || ''; } catch (e) { /* ignore */ }
  return tab && sections.some((s) => s.id === tab) ? tab : '';
}

function show(sections, id, { setHash = true, animate = false } = {}) {
  active = id;
  /* An open #guide deep link stands alone: the tab panels give way to it
     until a tab is picked (a click passes animate, and moves the hash). */
  const guide = document.getElementById('guide');
  const guideOpen = !animate && hashTab() === 'guide' && !!guide && guide.hasAttribute('data-tab-ignore');
  for (const s of sections) {
    const on = s.id === id && !guideOpen;
    const wasHidden = s.hidden;
    s.hidden = !on;
    /* Only a switch the reader made animates the panel that arrives
       (tabs.css). Restarting the class forces a reflow first, so a
       second switch back to the same panel plays again. */
    if (on && animate && wasHidden) {
      s.classList.remove('tabs-enter');
      void s.offsetWidth;
      s.classList.add('tabs-enter');
    }
    s.setAttribute('role', 'tabpanel');
    s.setAttribute('aria-labelledby', 'tab-' + s.id);
    if (!s.hasAttribute('tabindex')) s.setAttribute('tabindex', '0');
  }
  document.querySelectorAll(OWN + ' [role="tab"]').forEach((t) => {
    const on = t.dataset.tab === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    t.classList.toggle('is-on', on);
    if (on) intoStrip(t);
  });
  if (setHash && hashTab() !== id) {
    /* replaceState rather than location.hash = …: no history entry per
       tab, and no scroll jump. The shell's breadcrumb listens for
       hashchange, so one is dispatched by hand. */
    try { history.replaceState(history.state, '', location.pathname + location.search + '#' + id); } catch (e) { /* ignore */ }
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
}

/* The strip is one sideways-scrolling row (tabs.css), so the active
   tab can start off-screen — a deep link to the last tab at 390px.
   Bring it in by moving the STRIP's scroll only: scrollIntoView would
   also scroll the window, under a sticky element, mid-load. */
function intoStrip(tab) {
  const strip = tab.closest('.tabs');
  if (!strip || strip.scrollWidth <= strip.clientWidth + 1) return;
  const s = strip.getBoundingClientRect();
  const t = tab.getBoundingClientRect();
  /* the Sections button is pinned over the strip's left end: a tab
     scrolled in under it is not in */
  const lead = strip.querySelector('.tabs-sections');
  const edge = s.left + (lead && lead.offsetParent ? lead.offsetWidth : 0);
  if (t.left < edge) strip.scrollLeft -= edge - t.left + 16;
  else if (t.right > s.right) strip.scrollLeft += t.right - s.right + 16;
}

/** Make the element with this id visible, if a hidden tab is all that
 *  stands between it and the reader: switch to the tab whose section
 *  holds it. Returns true when a tab was switched.
 *
 *  THE ONE WAY IN FOR A FRAGMENT. fragments.js intercepts same-page
 *  `#` clicks (cover cards, the SECTIONS disclosure, the breadcrumb,
 *  links in copy) with preventDefault + replaceState, which never fires
 *  `hashchange` — so the listener below never heard about them and the
 *  address changed while the tab did not (UX audit H2). The resolver
 *  now asks here BEFORE it scrolls, on a click and on every settle
 *  tick of a load, rather than this module guessing at which links
 *  exist. No hash is written: the caller owns the address. */
export function revealTarget(id) {
  if (typeof document === 'undefined' || !id || !TABBED.has(page())) return false;
  const el = document.getElementById(id);
  if (!el) return false;
  const { sections } = findTabs();
  const owner = sections.find((s) => s === el || s.contains(el));
  if (!owner || (!owner.hidden && owner.id === active)) return false;
  show(sections, owner.id, { setHash: false });
  return true;
}

/* THE STRIP IS section-menu.js. A section may carry `data-tab-group`
   (the heading its tab sits under), `data-tab-icon` (a Material Symbols
   name from src/data/section-icons.json), `data-tab-hint` (one line: the
   tooltip and the aria description) and `data-tab-badge` ("3": a count);
   plan-gate stamps `data-tab-lock` (and `data-tab-off` on a module nobody
   has: left out of the strip). Only Settings and the console get the side
   menu (a column at 1100px and over, the scrolling strip plus a Sections
   sheet below); every other page is the segmented bar. */
const isSide = (sections) => (page() === 'admin' || page() === 'settings') && sections.length >= 3;
function buildStrip(sections, activeId) {
  const strip = buildSectionMenu({
    groups: itemsFromSections(sections, labelFor, page()), active: activeId,
    ariaLabel: 'Sections', orientation: isSide(sections) ? 'side' : 'strip'
  });
  watchHeight(strip);
  return strip;
}
/* A vertical sub-nav (the side menu, wide) pins beside the panel, not
   above it, so it takes no height there. */
function besideNow(strip) {
  return strip.classList.contains('tabs-side') && !!strip.parentElement && strip.offsetWidth < strip.parentElement.clientWidth / 2;
}

/* The strip's pinned height, MEASURED, as --tabs-h on <html> (outside
   the observed element, so no loop): what a second pinned bar inside a
   tab — a stage guide's step strip — stacks under. 0 while the strip is
   not pinned at this width. RO plus one timer, as chrome's other
   measured heights do (RO rides the render loop). */
let stripRO = null;
function watchHeight(strip) {
  const publish = () => {
    const side = besideNow(strip);
    const pinned = strip.isConnected && !side && getComputedStyle(strip).position === 'sticky';
    const px = (pinned ? Math.round(strip.getBoundingClientRect().height) : 0) + 'px';
    const de = document.documentElement;
    if (de.style.getPropertyValue('--tabs-h') !== px) de.style.setProperty('--tabs-h', px);
  };
  if (stripRO) stripRO.disconnect();
  if (typeof ResizeObserver === 'function') { stripRO = new ResizeObserver(publish); stripRO.observe(strip); }
  setTimeout(publish, 300);
}

export function apply() {
  if (typeof document === 'undefined' || !TABBED.has(page())) return;
  const { parent, sections, out } = findTabs();
  const old = document.querySelector(OWN);
  if (!parent) { if (old) old.remove(); signature = ''; document.querySelectorAll('.tabs-has-side').forEach((p) => p.classList.remove('tabs-has-side')); return; }
  const groups = itemsFromSections(sections, labelFor, page());
  const sig = JSON.stringify(groups);
  const fromHash = currentFromHash(sections);
  const keep = sections.some((s) => s.id === active) ? active : '';
  const want = fromHash || keep || sections[0].id;
  const side = isSide(sections);
  if (!old || old.parentElement !== parent || old.classList.contains('tabs-side') !== side) {
    if (old) old.remove();
    parent.insertBefore(buildStrip(sections, want), sections[0]);
    signature = sig;
  } else if (sig !== signature) {
    /* a count, a lock or a label moved: patch the rows, keep the strip
       (its scroll, its focus, the sheet's opener) */
    updateSectionMenu(old, groups, want);
    signature = sig;
  }
  document.querySelectorAll('.tabs-has-side').forEach((p) => { if (p !== parent || !side) p.classList.remove('tabs-has-side'); });
  parent.classList.toggle('tabs-has-side', side);
  dedupeHeads(sections);
  /* The address names a tab that is not one (a module switched off for
     everybody, breakdown.html#script): the first enabled tab opens and the
     address follows it, so a reload and the breadcrumb agree. */
  const h0 = hashTab();
  const dead = !!h0 && h0 !== 'guide' && !fromHash && (out || []).some((o) => o.id === h0 || (document.getElementById(h0) && o.contains(document.getElementById(h0))));
  show(sections, want, { setHash: dead });
}

function onTabClick(e) {
  const t = e.target.closest(OWN + ' [role="tab"]');
  if (!t) return;
  const { sections } = findTabs();
  const strip = t.closest('.tabs');
  const y0 = window.scrollY;
  const stuckAt = strip ? strip.getBoundingClientRect().top : 0;
  show(sections, t.dataset.tab, { animate: true });
  t.focus({ preventScroll: true });
  revealPanel(strip, document.getElementById(t.dataset.tab), y0, stuckAt);
}

/* Switching tabs from deep inside a long one used to leave the window
   where it was: the strip is sticky, so it stayed on screen, but the
   new panel began a screen or more ABOVE it and you landed in the
   middle of it (or past its end), then slid somewhere else as the
   fragment resolver's smooth scroll caught up.

   Decided from where the reader WAS, not from wherever the hash
   resolver has started to scroll to: if the new panel's top would be
   on screen below the strip from the old position, stay put; if it
   would be above it, bring it to just under the strip — exactly
   where the strip's own flow position puts it. `instant`, because
   html has `scroll-behavior: smooth` and a smooth scroll here races
   the resolver's and lands wherever the two cancel out. */
function revealPanel(strip, panel, y0, stuckAt) {
  if (!strip || !panel) return;
  const gap = parseFloat(getComputedStyle(strip).marginBottom) || 0;
  let hgt = strip.getBoundingClientRect().height;
  /* A side menu beside the panel (1100px and over) does not stack
     above it, so it takes no height. */
  if (besideNow(strip)) hgt = 0;
  /* Document positions, so the resolver's half-finished scroll does
     not matter. */
  const panelDocTop = panel.getBoundingClientRect().top + window.scrollY;
  const stripDocBottom = y0 + stuckAt + hgt;
  const target = panelDocTop < stripDocBottom + gap - 1
    ? Math.max(0, panelDocTop - stuckAt - hgt - gap)
    : y0;
  window.scrollTo({ top: target, behavior: 'instant' });
  /* And once more after the next frame: Chromium re-positions the
     window during the render that follows a sticky element's content
     changing height under it, which undid the first scroll by a few
     hundred pixels on contacts and reports. */
  requestAnimationFrame(() => {
    if (Math.abs(window.scrollY - target) > 1) window.scrollTo({ top: target, behavior: 'instant' });
  });
}

function onTabKey(e) {
  const t = e.target.closest(OWN + ' [role="tab"]');
  if (!t) return;
  const tabs = [...t.closest('.tabs').querySelectorAll('[role="tab"]')];
  const i = tabs.indexOf(t);
  let j = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabs.length;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i + tabs.length - 1) % tabs.length;
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = tabs.length - 1;
  if (j < 0) return;
  e.preventDefault();
  tabs[j].click();
}

let installed = false;
/** Called by the shell once it is mounted; safe to call again. */
export function installTabs() {
  if (typeof document === 'undefined' || !TABBED.has(page())) return;
  apply();
  if (installed) return;
  installed = true;
  document.addEventListener('click', onTabClick);
  document.addEventListener('keydown', onTabKey);
  document.addEventListener('animationend', (e) => {
    if (e.animationName === 'tabs-in' && e.target.classList) e.target.classList.remove('tabs-enter');
  });
  window.addEventListener('hashchange', () => {
    const { sections } = findTabs();
    const id = currentFromHash(sections);
    if (id && id !== active) show(sections, id, { setHash: false, animate: true });
  });
  /* ONLY MUTATIONS THAT CAN CHANGE THE SET OF TABS. The observer has to
     watch the whole subtree — settings and admin replace <main>, other
     pages re-render one section, and both arrive as childList records
     at different depths — but most records are typing: write.html adds
     and re-renders script rows inside one section on every keystroke,
     and re-running apply() for each (a query of every section[id] on
     the page) cost about 11ms a frame. A record matters when a node it
     adds or removes is, or holds, a tab section, a <main> or the strip
     itself; anything else happened inside a panel and leaves the tabs
     as they were. */
  const relevant = (n) => n.nodeType === 1 && (
    n.matches('section[id], main, .tabs') || !!n.querySelector('section[id], main'));
  const app = document.getElementById('app') || document.body;
  let raf = 0;
  new MutationObserver((records) => {
    if (raf) return;
    const hit = records.some((r) =>
      [...r.addedNodes].some(relevant) || [...r.removedNodes].some(relevant));
    if (!hit) return;
    raf = requestAnimationFrame(() => { raf = 0; apply(); });
  }).observe(app, { childList: true, subtree: true });
  /* A count, a hint, an icon or a plan lock changing on a section (the
     console's pending counts, plan-gate's tab lock) does not add or
     remove a node, so the observer above never sees it. These attributes
     are on the sections, never on the strip, so patching the strip does
     not feed this observer. */
  let araf = 0;
  new MutationObserver(() => {
    if (araf) return;
    araf = requestAnimationFrame(() => { araf = 0; apply(); });
  }).observe(app, { attributes: true, subtree: true, attributeFilter: ['data-tab-badge', 'data-tab-lock', 'data-tab-off', 'data-tab-ignore', 'data-tab-hint', 'data-tab-icon', 'data-tab-label', 'data-tab-group'] });
}

export default { installTabs, apply, revealTarget, TABBED };
