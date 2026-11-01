/* ============================================================
   SECTION MENU — the app's ONE way to list "the parts of this page"
   ------------------------------------------------------------
   Settings' side menu, the admin console's, the Library's, every
   tabbed module page's strip, and (later) Story's path are the same
   control: a list of destinations, grouped under plain headings, each
   with an icon, a label and an optional count. tabs.js builds it from
   a page's `section[id]` elements; anything else builds it from an
   explicit list with the API below. There is no second implementation:
   markup, classes and CSS (tabs.css) are shared, so a change to how a
   selected row looks is made once.

   WHAT IT LOOKS LIKE
     A STRIP by default, on every page (one frame, 17 Oct 2026). The
     side layout below is opt-in, and only Settings and the Console opt in:
     >= 1100px  a vertical column (13.75rem), headings above each group,
                a hairline between groups, pinned under the shell's band.
                Only when the page puts the menu beside a panel: tabs.js
                does (class `tabs-has-side` on the panel's container).
     <  1100px  one scrolling strip, headings folded away, and a
                "Sections" button at its start that opens the same list
                as a sheet (openSectionsSheet). Orientation 'strip' (every
                other page) is never a side column and has no button.
     Selected = the accent fill with a leading bar, in both layouts and
     both themes; hover is a quiet tint, never an outline; nothing is
     underlined. (motion-app.js used to append a sliding 2px underline,
     .tabs-ink, to every .tabs; in a column its `bottom: 0` is under the
     LAST row. It is gone from the vertical layout, see tabs.css.)

   THE ITEM
     { id,        required. The element id of the destination; also the
                  row's data-tab and `aria-controls`.
       label,     required. Plain, sentence case.
       icon,      optional. A Material Symbols name that is in
                  src/data/section-icons.json or navigation.json (the
                  font is a subset built from those two files). None =
                  a small dot, so labels still line up.
       badge,     optional. A count: number or string, '' / 0 / '0' = none.
                  Read aloud as "<label>, <badge> waiting".
       hint,      optional. One line of what is in there: the row's
                  title tooltip AND an aria-describedby target.
       done,      optional boolean. A tick after the label ("done" is
                  read aloud). For a path.
       doing,     optional boolean. A half-filled circle after the label
                  ("in progress" is read aloud): the middle state of a
                  path, so "started" is not told from "not started" by
                  colour alone. Ignored when `done`.
       locked }   optional boolean. A PLAN flag (the plan does not
                  include it). The row stays clickable: the panel says why.
   A GROUP is { label, items }. Groups with the same label are merged
   into the first one's position, so a page whose sections interleave
   (Library: Craft = rules ... glossary) still gets one heading. A group
   with an empty label draws no heading and no hairline.

   THE API
     buildSectionMenu({ groups, active, ariaLabel, orientation,
                        onSelect, sectionsLabel, sectionsButton }) -> HTMLElement (nav.tabs)
        sectionsButton: a strip that may overflow also gets the Sections
          button (shown by tabs.css only while it is narrow and overflows).
        orientation 'strip' (the default) | 'side' (opt-in: Settings and
          the Console only, via tabs.js).
        onSelect(id): when given, the menu is SELF-MANAGED: it wires its
          own click and arrow-key handling and marks itself
          [data-sm-self], which tabs.js's delegated handlers ignore.
          Without it the rows are plain tab buttons for the caller (tabs.js)
          to drive, and the Sections sheet clicks the row.
     updateSectionMenu(el, groups, active) -> boolean
        Patch label, icon, badge, hint, done, locked and the selection in
        place. The nav, its listeners and its scroll position stay; only
        a change in WHICH rows exist (ids or group order) rebuilds the
        rows, inside the same element. Returns true if anything changed.
     openSectionsSheet({ groups, active, onSelect, title, returnTo })
        The phone's full grouped list, as a sheet over the page:
        mobile-nav's frame (focus trap, Escape, backdrop, close button),
        the active row has aria-current, and focus goes back to
        `returnTo` (the Sections button). onSelect(id) runs after the
        sheet has closed.
     itemsFromSections(sections, labelFor, page) -> groups   (tabs.js's reader,
        exported so a page can see what the sniffing would produce.)

   Nothing here writes storage, and the module imports nothing a page
   owns: it is in the CORE chunk beside tabs.js and mobile-nav.js, and
   start.html must never import it.
   ============================================================ */
import { h } from '../lib/dom.js';
import { iconSpan } from './icon.js';
import { openSheet, closeSheet } from './mobile-nav.js';
import symbols from '../data/section-icons.json';
import '../styles/tabs.css';

const SIDE_MQ = '(min-width: 1100px)';
const state = new WeakMap();      // nav -> { groups, active, onSelect, sectionsBtn }

const hasBadge = (b) => b != null && b !== '' && b !== 0 && b !== '0';
const asItem = (it) => ({
  id: String(it.id), label: String(it.label == null ? it.id : it.label), icon: it.icon || '',
  badge: hasBadge(it.badge) ? String(it.badge) : '', hint: it.hint || '', done: !!it.done, doing: !!it.doing && !it.done, locked: !!it.locked
});

/** Normalise and merge: same-label groups collapse into the first. */
function normalise(groups) {
  const out = [];
  const by = new Map();
  for (const g of groups || []) {
    const label = g.label || '';
    let slot = by.get(label);
    if (!slot) { slot = { label, items: [] }; by.set(label, slot); out.push(slot); }
    for (const it of g.items || []) slot.items.push(asItem(it));
  }
  return out.filter((g) => g.items.length);
}
const flat = (groups) => groups.flatMap((g) => g.items);
const structure = (groups) => groups.map((g) => g.label + ':' + g.items.map((i) => i.id).join(',')).join('|');

/* A name the font subset does not carry prints as a WORD over the label.
   In dev, say so once instead of finding out in a browser. */
const known = new Set(symbols.icons || []);
const warned = new Set();
function warnIcon(name) {
  if (!(import.meta.env && import.meta.env.DEV) || !name || known.has(name) || warned.has(name)) return;
  warned.add(name);
  console.warn('[section-menu] icon "' + name + '" is not in src/data/section-icons.json; if navigation.json has no such sym either, the icon font will not carry it');
}

const rowLabel = (it) => it.label + (it.badge ? ', ' + it.badge + ' waiting' : '') + (it.done ? ', done' : '') + (it.doing ? ', in progress' : '') + (it.locked ? ', not on your plan' : '');

/* ---- one row -------------------------------------------------- */
function iconNode(it) {
  warnIcon(it.icon);
  return it.icon
    ? iconSpan('tabs-tab-i', { sym: it.icon })
    : h('span.tabs-tab-i.tabs-dot', { 'aria-hidden': 'true' });
}
function fillRow(btn, it, on) {
  const label = btn.querySelector('.tabs-tab-l');
  if (label.textContent !== it.label) label.textContent = it.label;
  const ic = btn.querySelector('.tabs-tab-i');
  const want = it.icon || '';
  if ((ic.dataset.icon || '') !== want) { const n = iconNode(it); n.dataset.icon = want; ic.replaceWith(n); }
  const slot = (cls, text) => {
    let el = btn.querySelector('.' + cls);
    if (text) {
      if (!el) { el = h('span.' + cls, { 'aria-hidden': 'true' }); btn.append(el); }
      if (el.textContent !== text) el.textContent = text;
    } else if (el) el.remove();
  };
  slot('tabs-done.sym', it.done ? 'check' : '');   /* a Material Symbol, not a dingbat */
  slot('tabs-doing', it.doing ? '◐' : '');
  slot('tabs-badge', it.badge);
  slot('tabs-flag', it.locked ? 'Plan' : '');
  btn.setAttribute('aria-label', rowLabel(it));
  if (it.hint) btn.title = it.hint; else btn.removeAttribute('title');
  btn.classList.toggle('is-locked', it.locked);
  setOn(btn, on);
}
function setOn(btn, on) {
  if (btn.getAttribute('aria-selected') !== String(on)) btn.setAttribute('aria-selected', String(on));
  btn.tabIndex = on ? 0 : -1;
  btn.classList.toggle('is-on', on);
}
function rowButton(it, on) {
  const btn = h('button.tabs-tab', {
    type: 'button', role: 'tab', id: 'tab-' + it.id, 'data-tab': it.id,
    'aria-controls': it.id, 'aria-selected': 'false'
  }, [
    h('span.tabs-tab-i.tabs-dot', { 'aria-hidden': 'true' }),
    h('span.tabs-tab-l', { text: it.label })
  ]);
  fillRow(btn, it, on);
  return btn;
}

/* The list itself: groups of rows. Returns the rows' parent. */
function fillList(list, hints, groups, active) {
  list.replaceChildren();
  hints.replaceChildren();
  const labelled = groups.some((g) => g.label);
  for (const g of groups) {
    const box = h('div.tabs-group', { role: 'presentation' });
    if (g.label) box.append(h('span.tabs-group-h', { 'aria-hidden': 'true', text: g.label }));
    for (const it of g.items) {
      const b = rowButton(it, it.id === active);
      if (it.hint) {
        const id = 'tabhint-' + it.id;
        hints.append(h('span', { id, text: it.hint }));
        b.setAttribute('aria-describedby', id);
      }
      box.append(b);
    }
    list.append(box);
  }
  return labelled;
}

/* ---- what the strip is doing: overflowing, scrolled, pinned -------
   Three classes on a STRIP (never the side column), read by tabs.css:
     is-scrollable   the row is wider than the strip. Below 1100px that
                     shows the Sections button, when the strip has one:
                     Budget at 390 showed 2 of 9 tabs and nothing said
                     there were seven more.
     can-scroll-end  there is more to the right: the end fades, so a tab
                     boundary landing exactly on the edge (Pre-Production
                     at 1440: two steps fully off-screen) still reads as
                     "more".
     is-stuck        pinned under the band: the row gets a full-width
                     canvas backdrop, so the page does not scroll visibly
                     past a fit-content strip.
   Classes on the strip itself: tabs.js's observers watch section[id]
   nodes and data-tab-* attributes, so writing them feeds nothing. One
   ResizeObserver for all strips, one scroll listener per strip, and one
   rAF-throttled window scroll/resize listener for the pin. */
const strips = new Set();
let stripRO = null;
let pinBound = false;
let pinRaf = 0;
/* The button is measured OUT of the overflow test. Counted in, it was a
   latch: a strip that overflowed once (a 300px window, or a measure taken
   before the fonts settled) showed the 113px button, and the button's own
   width then kept the row overflowing for good, so a 2-tab strip that fits
   at 390 (plan, stripboard, contacts) stayed scrollable with its last tab
   clipped behind it. The tabs alone decide; the button follows. */
function buttonRoom(nav) {
  const b = state.get(nav)?.btn;
  if (!b || !b.offsetParent) return 0;
  const cs = getComputedStyle(b);
  const gap = parseFloat(getComputedStyle(nav).columnGap) || 0;
  return b.offsetWidth + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0) + gap;
}
function markScroll(nav) {
  const over = nav.scrollWidth - buttonRoom(nav) > nav.clientWidth + 1;
  const was = nav.classList.contains('is-scrollable');
  nav.classList.toggle('is-scrollable', over);
  /* The Sections button only shows once the strip is scrollable, so a tab
     brought in before this moment was brought in without it in the way:
     tell the owner of the active tab (tabs.js) to do it again. */
  if (over && !was) nav.dispatchEvent(new CustomEvent('sm:scrollable', { bubbles: true }));
  nav.classList.toggle('can-scroll-end', over && nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1);
}
function markStuck(nav) {
  const cs = getComputedStyle(nav);
  const top = parseFloat(cs.top);
  nav.classList.toggle('is-stuck', cs.position === 'sticky' && Number.isFinite(top)
    && window.scrollY > 0 && nav.getBoundingClientRect().top <= top + 0.5);
}
function markAll() {
  pinRaf = 0;
  for (const nav of strips) {
    if (!nav.isConnected) { strips.delete(nav); if (stripRO) stripRO.unobserve(nav); continue; }
    markScroll(nav); markStuck(nav);
  }
}
function watchStrip(nav) {
  if (typeof window === 'undefined') return;
  strips.add(nav);
  nav.addEventListener('scroll', () => markScroll(nav), { passive: true });
  if (typeof ResizeObserver === 'function') {
    if (!stripRO) stripRO = new ResizeObserver((es) => { for (const e of es) if (e.target.isConnected) markScroll(e.target); });
    stripRO.observe(nav);
  }
  if (!pinBound) {
    pinBound = true;
    const later = () => { if (!pinRaf) pinRaf = requestAnimationFrame(markAll); };
    window.addEventListener('scroll', later, { passive: true });
    window.addEventListener('resize', later, { passive: true });
  }
  /* RO rides the render loop; a timer runs when it does not */
  setTimeout(() => { if (nav.isConnected) { markScroll(nav); markStuck(nav); } }, 300);
}

const sideNow = () => typeof matchMedia === 'function' && matchMedia(SIDE_MQ).matches;
let mqBound = false;
function bindOrientation() {
  if (mqBound || typeof matchMedia !== 'function') return;
  mqBound = true;
  const sync = () => {
    for (const l of document.querySelectorAll('.tabs-side .tabs-list')) l.setAttribute('aria-orientation', sideNow() ? 'vertical' : 'horizontal');
  };
  try { matchMedia(SIDE_MQ).addEventListener('change', sync); } catch (e) { /* older engine */ }
}

/* ---- build ----------------------------------------------------- */
export function buildSectionMenu({ groups, active, ariaLabel = 'Sections', orientation, onSelect, sectionsLabel = 'Sections', sectionsButton = false } = {}) {
  const g = normalise(groups);
  const items = flat(g);
  /* The strip unless a caller asks for the column: the side menu is
     Settings' and the Console's alone (tabs.js decides), never a default. */
  const side = orientation === 'side';
  const list = h('div.tabs-list', { role: 'tablist', 'aria-label': ariaLabel, 'aria-orientation': side ? (sideNow() ? 'vertical' : 'horizontal') : 'horizontal' });
  const hints = h('div.tabs-hints', { hidden: true });
  const labelled = fillList(list, hints, g, active);
  const nav = h('nav.tabs' + (side ? '.tabs-side' : '') + (labelled ? '.tabs-grouped' : ''), { 'aria-label': ariaLabel });
  let btn = null;
  /* The side menu always carries the Sections button (tabs.css shows it
     below 1100px). A strip carries it when the caller asks
     (`sectionsButton`, tabs.js): tabs.css shows it only while the strip
     is narrow AND overflows, so a strip whose tabs run off the edge is
     never the only way to them. */
  if (side || sectionsButton) {
    btn = h('button.tabs-sections', { type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' }, [
      iconSpan('tabs-sections-i', { sym: 'menu' }), h('span.tabs-sections-l', { text: sectionsLabel })
    ]);
    nav.append(btn);
  }
  nav.append(list, hints);
  const st = { groups: g, active: active || '', onSelect: onSelect || null, btn, label: ariaLabel };
  state.set(nav, st);
  if (onSelect) {
    nav.dataset.smSelf = '1';
    nav.addEventListener('click', (e) => {
      const t = e.target.closest('[role="tab"]');
      if (t && nav.contains(t)) { setActive(nav, t.dataset.tab); onSelect(t.dataset.tab); }
    });
    nav.addEventListener('keydown', (e) => {
      const t = e.target.closest('[role="tab"]');
      if (!t) return;
      const tabs = [...nav.querySelectorAll('[role="tab"]')];
      const i = tabs.indexOf(t);
      const k = e.key;
      const j = (k === 'ArrowRight' || k === 'ArrowDown') ? (i + 1) % tabs.length
        : (k === 'ArrowLeft' || k === 'ArrowUp') ? (i + tabs.length - 1) % tabs.length
        : k === 'Home' ? 0 : k === 'End' ? tabs.length - 1 : -1;
      if (j < 0) return;
      e.preventDefault(); tabs[j].focus(); tabs[j].click();
    });
  }
  if (btn) {
    btn.addEventListener('click', () => {
      const cur = state.get(nav);
      btn.setAttribute('aria-expanded', 'true');
      openSectionsSheet({
        groups: cur.groups, active: cur.active, title: cur.label, returnTo: btn,
        onClose: () => btn.setAttribute('aria-expanded', 'false'),
        onSelect: (id) => {
          if (cur.onSelect) { setActive(nav, id); cur.onSelect(id); return; }
          /* tabs.js drives its own rows through one delegated click, so
             the sheet clicks the row rather than duplicating what that does */
          const row = nav.querySelector('[data-tab="' + CSS.escape(id) + '"]');
          if (row) row.click();
          /* the page may redraw around the choice (the console and settings
             replace <main>), which takes the button with it: put focus on
             whichever Sections button is there once it has settled */
          const back = () => {
            if (document.activeElement && document.activeElement !== document.body && document.activeElement.isConnected) return;
            const b = btn.isConnected ? btn : document.querySelector('.tabs-sections');
            if (b) b.focus({ preventScroll: true });
          };
          btn.focus({ preventScroll: true });
          requestAnimationFrame(() => requestAnimationFrame(back));
        }
      });
    });
    if (side) bindOrientation();
  }
  if (!side) watchStrip(nav);
  return nav;
}

function setActive(nav, id) {
  const st = state.get(nav);
  if (!st) return;
  st.active = id;
  for (const b of nav.querySelectorAll('[role="tab"]')) setOn(b, b.dataset.tab === id);
}

/* ---- update in place --------------------------------------------- */
export function updateSectionMenu(nav, groups, active) {
  const st = state.get(nav);
  if (!st) return false;
  const g = normalise(groups);
  let changed = false;
  const list = nav.querySelector('.tabs-list');
  if (structure(g) !== structure(st.groups)) {
    const labelled = fillList(list, nav.querySelector('.tabs-hints'), g, active);
    nav.classList.toggle('tabs-grouped', labelled);
    changed = true;
  } else {
    const prev = new Map(flat(st.groups).map((i) => [i.id, i]));
    for (const it of flat(g)) {
      const old = prev.get(it.id);
      const on = it.id === active;
      const btn = list.querySelector('[data-tab="' + CSS.escape(it.id) + '"]');
      if (!btn) continue;
      if (!old || JSON.stringify(old) !== JSON.stringify(it)) {
        fillRow(btn, it, on); changed = true;
        const hintEl = nav.querySelector('#tabhint-' + CSS.escape(it.id));
        if (hintEl) { if (it.hint) hintEl.textContent = it.hint; }
      } else setOn(btn, on);
    }
  }
  if (active != null && active !== st.active) changed = true;
  st.groups = g;
  if (active != null) { st.active = active; for (const b of nav.querySelectorAll('[role="tab"]')) setOn(b, b.dataset.tab === active); }
  /* a label that grew or a row that came or went can change the overflow
     without resizing a strip already at its max-width */
  if (changed && strips.has(nav)) markScroll(nav);
  return changed;
}

/* ---- the phone's sheet ------------------------------------------- */
export function openSectionsSheet({ groups, active, onSelect, title = 'Sections', returnTo, onClose } = {}) {
  const g = normalise(groups);
  const body = h('div.mn-body.sm-sheet');
  for (const grp of g) {
    const sec = h('section.mn-group');
    if (grp.label) {
      const id = 'sm-g-' + grp.label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      sec.setAttribute('aria-labelledby', id);
      sec.append(h('h3.mn-group-h', { id, text: grp.label }));
    }
    for (const it of grp.items) {
      warnIcon(it.icon);
      const row = h('button.mn-mod.sm-row', { type: 'button', 'data-sm-id': it.id, 'aria-label': rowLabel(it) }, [
        it.icon ? iconSpan('mn-mod-icon', { sym: it.icon }) : h('span.mn-mod-icon.tabs-dot', { 'aria-hidden': 'true' }),
        h('span.mn-mod-text', {}, [
          h('span.mn-mod-label', { text: it.label }),
          it.hint ? h('span.mn-mod-purpose', { text: it.hint }) : null
        ].filter(Boolean)),
        h('span.sm-row-end', { 'aria-hidden': 'true' }, [
          it.badge ? h('span.sm-badge', { text: it.badge }) : null,
          it.done ? h('span.sm-done.sym', { 'aria-hidden': 'true', text: 'check' }) : null,
          it.doing ? h('span.sm-doing', { text: '◐' }) : null,
          it.locked ? h('span.mn-mod-flag', { text: 'Plan' }) : null
        ].filter(Boolean))
      ]);
      if (it.id === active) { row.classList.add('is-here'); row.setAttribute('aria-current', 'true'); }
      sec.append(row);
    }
    body.append(sec);
  }
  body.addEventListener('click', (e) => {
    const row = e.target.closest('[data-sm-id]');
    if (!row) return;
    const id = row.dataset.smId;
    closeSheet();
    if (typeof onSelect === 'function') onSelect(id);
  });
  return openSheet('sections', title, body, {
    returnTo, onClose,
    focus: () => body.querySelector('.is-here') || body.querySelector('.sm-row')
  });
}

/* ---- the reader tabs.js uses ---------------------------------------
   `data-tab-icon`, `data-tab-hint`, `data-tab-badge`, `data-tab-group`
   on the section, and `data-tab-lock` (plan-gate's tab lock). */
export function itemsFromSections(sections, labelFor, page) {
  const groups = [];
  let cur = null;
  /* a module page that is not edited for the menu is described in
     section-icons.json `pages`; an attribute on the section wins */
  const meta = (page && symbols.pages && symbols.pages[page]) || {};
  for (const s of sections) {
    const m = meta[s.id] || {};
    const label = s.dataset.tabGroup || m.group || '';
    if (!cur || cur.label !== label) { cur = { label, items: [] }; groups.push(cur); }
    cur.items.push({
      id: s.id, label: labelFor(s), icon: s.dataset.tabIcon || m.icon || '', badge: s.dataset.tabBadge || '',
      hint: s.dataset.tabHint || m.hint || '', locked: s.hasAttribute('data-tab-lock')
    });
  }
  return groups;
}

export default { buildSectionMenu, updateSectionMenu, openSectionsSheet, itemsFromSections };
