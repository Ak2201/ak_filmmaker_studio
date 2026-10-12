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

   ARIA: role=tablist / tab / tabpanel, arrow keys, Home and End.
   ============================================================ */
import nav from '../data/navigation.json';
import { stayEntry } from '../lib/navmodel.js';
import { h } from '../lib/dom.js';
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
  if (!main) return { parent: null, sections: [] };
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
  const byParent = new Map();
  for (const s of all) { const p = s.parentElement; byParent.set(p, (byParent.get(p) || []).concat(s)); }
  for (const [parent, list] of byParent) if (list.length >= 2) return { parent, sections: list };
  return { parent: null, sections: [] };
}

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
  for (const s of sections) {
    const on = s.id === id;
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
  document.querySelectorAll('.tabs [role="tab"]').forEach((t) => {
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
  if (t.left < s.left) strip.scrollLeft -= s.left - t.left + 16;
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

/* A section may carry `data-tab-group="Run"` (the admin console does):
   the strip then draws each run of same-group tabs under that heading.
   Below 1100px the headings fold away and it is the same single row; at
   1100px and over a page that wants it (admin.css) lays the strip out
   as a vertical list. `data-tab-badge="3"` puts a count on the tab. */
function tabButton(s) {
  const badge = s.dataset.tabBadge;
  const btn = h('button.tabs-tab', { type: 'button', role: 'tab', id: 'tab-' + s.id, 'data-tab': s.id, 'aria-controls': s.id, 'aria-selected': 'false' }, [
    h('span.tabs-tab-l', { text: labelFor(s) })
  ]);
  if (badge && badge !== '0') {
    btn.append(h('span.tabs-badge', { 'aria-hidden': 'true', text: badge }));
    btn.setAttribute('aria-label', labelFor(s) + ', ' + badge + ' waiting');
  }
  return btn;
}
function buildStrip(sections) {
  const grouped = sections.some((s) => s.dataset.tabGroup);
  const strip = h('nav.tabs' + (grouped ? '.tabs-grouped' : ''), { role: 'tablist', 'aria-label': 'Sections', 'aria-orientation': grouped ? 'vertical' : null });
  let group = null, name = null;
  for (const s of sections) {
    if (!grouped) { strip.append(tabButton(s)); continue; }
    const g = s.dataset.tabGroup || '';
    if (!group || g !== name) {
      name = g;
      group = h('div.tabs-group', { role: 'presentation' }, [g ? h('span.tabs-group-h', { 'aria-hidden': 'true', text: g }) : null]);
      strip.append(group);
    }
    group.append(tabButton(s));
  }
  watchHeight(strip);
  return strip;
}

/* The strip's pinned height, MEASURED, as --tabs-h on <html> (outside
   the observed element, so no loop): what a second pinned bar inside a
   tab — a stage guide's step strip — stacks under. 0 while the strip is
   not pinned at this width. RO plus one timer, as chrome's other
   measured heights do (RO rides the render loop). */
let stripRO = null;
function watchHeight(strip) {
  const publish = () => {
    /* A vertical sub-nav (tabs-grouped, wide) pins beside the panel, not above it. */
    const side = strip.classList.contains('tabs-grouped') && strip.parentElement && strip.offsetWidth < strip.parentElement.clientWidth / 2;
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
  const { parent, sections } = findTabs();
  const old = document.querySelector('.tabs');
  if (!parent) { if (old) old.remove(); signature = ''; return; }
  const sig = sections.map((s) => s.id + '=' + labelFor(s) + '/' + (s.dataset.tabGroup || '') + '/' + (s.dataset.tabBadge || '')).join('|');
  if (sig !== signature || !old || old.parentElement !== parent) {
    if (old) old.remove();
    parent.insertBefore(buildStrip(sections), sections[0]);
    signature = sig;
  }
  dedupeHeads(sections);
  const fromHash = currentFromHash(sections);
  const keep = sections.some((s) => s.id === active) ? active : '';
  show(sections, fromHash || keep || sections[0].id, { setHash: false });
}

function onTabClick(e) {
  const t = e.target.closest('.tabs [role="tab"]');
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
  let h = strip.getBoundingClientRect().height;
  /* A vertical sub-nav beside the panel (the admin console at 1100px
     and over) does not stack above it, so it takes no height. */
  if (strip.classList.contains('tabs-grouped') && strip.parentElement && strip.getBoundingClientRect().width < strip.parentElement.clientWidth / 2) h = 0;
  /* Document positions, so the resolver's half-finished scroll does
     not matter. */
  const panelDocTop = panel.getBoundingClientRect().top + window.scrollY;
  const stripDocBottom = y0 + stuckAt + h;
  const target = panelDocTop < stripDocBottom + gap - 1
    ? Math.max(0, panelDocTop - stuckAt - h - gap)
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
  const t = e.target.closest('.tabs [role="tab"]');
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
}

export default { installTabs, apply, revealTarget, TABBED };
