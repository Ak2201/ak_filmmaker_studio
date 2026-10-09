/* ============================================================
   THE COMMAND PALETTE — one key for twenty-two modules
   ------------------------------------------------------------
   The studio has 22 modules across six phases, four themes, six
   skins, a project list, and however many scenes and contacts the
   film has. The shell answers "where am I"; the launcher answers
   "what exists". Neither answers the question a person actually
   has at 2am, which is "take me to Scene 14", and the honest
   measure of the old answer was four interactions: open the rail,
   pick the phase, pick the module, find the row.

   This is ⌘K. It is the launcher's index with a text field in
   front of it, and three rules:

   1. IT IS DERIVED, NEVER LISTED. Modules come from
      navigation.json, skins from skin.js reading the CSSOM,
      themes from StudioUI.themeOrder(), projects from
      listProjects(), scenes and contacts from their own models.
      A hand-written list of what the app contains is a list that
      is wrong by the second change — the same rule that keeps the
      24 steps in JSON. Add a module to navigation.json and it is
      searchable here with no edit.

   2. IT READS, IT DOES NOT WRITE. Opening the palette touches no
      storage at all. verify asserts zero localStorage writes
      across four idle seconds, and a palette that recorded its own
      opening would trip it — correctly, because a map should not
      change the thing it maps. Recents are in memory for the
      session and deliberately do not survive it; the alternative
      was a new key in a storage contract that holds months of
      people's work, bought for the convenience of a reordered
      list.

   3. THE CONTENT IS LOADED LATE — and the build is worth reading
      on what that does and does not buy. navigation.json is in
      every page's graph already. scenes.js and contacts.js arrive
      by dynamic import, so the overlay renders without waiting for
      them: the shell is on screen in the same frame as the
      keystroke and the rows land after. That part is real.

      What it does NOT do is move them into a separate chunk. The
      bundler says so out loud —

        [INEFFECTIVE_DYNAMIC_IMPORT] src/lib/scenes.js is
        dynamically imported by src/ui/palette.js but also
        statically imported by src/lib/ai.js, locations.js,
        script-import.js, breakdown.js, …

      — because a module that anything else on the page imports
      statically is in the main chunk whatever this file does. On
      breakdown.html the scene model was already loaded before the
      palette existed. The dynamic import is still the right shape:
      it is free where the module is already there, and it genuinely
      defers on the pages that do not import it (the blueprints, the
      library), which is where a palette would otherwise have added
      two models to first paint. Do not "fix" the warning by making
      these static — that would pull both models into every page in
      the studio to silence a message that is telling the truth.

   ACCESSIBILITY. This is the combobox pattern, not a div with a
   keydown handler: role="combobox" on the input with
   aria-expanded, aria-controls and aria-activedescendant;
   role="listbox" on the list and role="option" on the rows. The
   active row is never FOCUSED — focus stays in the input the
   whole time, which is what lets you keep typing — so it is named
   by aria-activedescendant instead, the one mechanism that tells
   a screen reader about a selection its focus did not move to.
   The result count goes to a polite live region, because a list
   that silently became empty is a list that did not answer.
   ============================================================ */
/* navigation.json through navmodel.js, never directly: globals()
   and moduleGroups() apply the region filter, so a module hidden on
   the map is not quietly reachable from the palette. */
import { moduleGroups, hueClassOf, globals } from '../lib/navmodel.js';
import { h } from '../lib/dom.js';
import { iconSpan } from './icon.js';
import { listProjects, currentProjectId, setCurrentProject } from '../lib/store.js';
import '../styles/palette.css';

const MAX_ROWS = 60;

let root = null;        // the overlay
let input = null;
let listEl = null;
let countEl = null;
let emptyEl = null;

let items = [];         // the full index
let shown = [];         // what is on screen, scored and sorted
let active = 0;         // index into `shown`
let closeBtn = null;    // the dialog's one other focus stop
let opener = null;      // what to give focus back to
let loaded = false;     // have the late models been pulled in
let open = false;

/* In memory, for this session only. See rule 2. */
const recent = [];
function remember(id) {
  const i = recent.indexOf(id);
  if (i >= 0) recent.splice(i, 1);
  recent.unshift(id);
  if (recent.length > 8) recent.length = 8;
}

/* ------------------------------------------------------------
   SCORING
   ------------------------------------------------------------
   Five tiers, highest first, and the ordering between them is the
   whole of the "feel". A substring match that happens to be in the
   middle of a word must never outrank a prefix: typing "st" wants
   Stripboard, not "Ca(st) List". Subsequence matching is last and
   penalised by how spread out the letters are, so it catches
   "sbd" → Stripboard without letting any four-letter query match
   every row in the index.
   ------------------------------------------------------------ */
function score(item, q) {
  if (!q) return 1;
  const label = item.lc;
  const hay = item.hay;
  if (label === q) return 10000;
  if (label.startsWith(q)) return 8000 - label.length;
  // a word boundary inside the label
  const w = label.indexOf(' ' + q);
  if (w >= 0) return 6000 - w;
  const sub = label.indexOf(q);
  if (sub >= 0) return 4000 - sub;
  const inHay = hay.indexOf(q);
  if (inHay >= 0) return 2000 - inHay;
  // subsequence, spread-penalised
  let i = 0, gaps = 0, last = -1;
  for (let c = 0; c < label.length && i < q.length; c++) {
    if (label[c] === q[i]) {
      if (last >= 0) gaps += c - last - 1;
      last = c; i++;
    }
  }
  if (i === q.length) return 900 - gaps;
  return 0;
}

function rank(q) {
  const needle = q.trim().toLowerCase();
  const out = [];
  for (const it of items) {
    const s = score(it, needle);
    if (!s) continue;
    const bump = recent.indexOf(it.id);
    out.push({ it, s: s + (bump >= 0 ? (8 - bump) * 50 : 0) });
  }
  out.sort((a, b) => b.s - a.s || a.it.label.localeCompare(b.it.label));
  return out.slice(0, MAX_ROWS).map((r) => r.it);
}

/* ------------------------------------------------------------
   THE INDEX
   ------------------------------------------------------------ */
function entry(o) {
  const hay = [o.label, o.sub || '', (o.keywords || []).join(' '), o.group]
    .join(' ').toLowerCase();
  return { ...o, lc: o.label.toLowerCase(), hay };
}

function navItems() {
  const out = [];
  const isAdmin = (() => { try { return window.StudioCloud.getGateState().role === 'admin'; } catch (e) { return false; } })();
  for (const g of globals()) {
    if (g.adminOnly && !isAdmin) continue;   // the console: shown by the server's role, as in the rail
    out.push(entry({
      id: 'nav:' + (g.id || g.href),
      label: g.label,
      sub: g.purpose,
      group: 'Studio',
      icon: g.icon,
      sym: g.sym,
      href: g.href,
      keywords: ['go', 'open']
    }));
  }
  /* Stages AND shelves: the Library's case studies, dissection and
     glossary are modules too, grouped under the Library. */
  for (const p of moduleGroups()) {
    for (const m of p.modules) {
      /* `status` is carried through rather than filtered on. A
         planned module that vanished from search would be a map
         with a hole in it, and the honest answer — the row is
         there and says PLANNED — is the one the launcher already
         gives. The href still points at the stub that explains
         itself. */
      out.push(entry({
        id: 'mod:' + m.id,
        label: m.label,
        sub: m.purpose,
        group: p.label,
        /* THE CLASS FAMILY MATTERS. --hue is set by two families
           of class in tokens.css and only two: `.sh-ph-*` maps a
           PHASE to its hue, `.hue-*` names a hue directly. A phase
           id written as `hue-develop` matches neither, --hue stays
           undefined, and the row's rule falls back to the accent —
           silently, because an undefined custom property is not an
           error. That is the exact bug the breakdown shipped for
           two commits. Phases take sh-ph-; categories take hue-. */
        hueClass: hueClassOf(p),
        icon: m.icon,
        sym: m.sym,
        href: m.href,
        status: m.status,
        keywords: [p.label, p.blurb || '', m.status]
      }));
    }
  }
  return out;
}

function projectItems() {
  let list = [], cur = null;
  try { list = listProjects() || []; cur = currentProjectId(); } catch (e) { return []; }
  if (list.length < 2) return [];   // nothing to switch between
  return list
    .filter((p) => p.id !== cur)
    .map((p) => entry({
      id: 'proj:' + p.id,
      label: p.title || p.name || 'Untitled project',
      sub: 'Switch to this project',
      group: 'Projects',
      icon: '◳',
      keywords: ['project', 'switch', 'open film'],
      run: () => { setCurrentProject(p.id); location.reload(); }
    }));
}

function settingItems() {
  const out = [];
  const UI = typeof window !== 'undefined' ? window.StudioUI : null;
  const SK = typeof window !== 'undefined' ? window.StudioSkin : null;

  /* Themes and skins are asked for, not listed. THEME_ORDER lives
     in chrome.js and the skins are discovered from the CSSOM, so
     a fifth theme or a seventh skin appears here by existing. */
  if (UI && UI.themeOrder && UI.themeOrder().length > 1) { // dark only: no theme entries
    const LABEL = { paper: 'Paper', sepia: 'Sepia', ink: 'Ink', desk: 'Desk' };
    for (const t of UI.themeOrder()) {
      out.push(entry({
        id: 'theme:' + t,
        label: 'Theme: ' + (LABEL[t] || t),
        sub: 'Change the palette',
        group: 'Appearance',
        icon: '◐',
        keywords: ['theme', 'colour', 'color', 'dark', 'light', 'mode'],
        run: () => UI.applyTheme(t)
      }));
    }
  }
  if (SK && SK.listSkins) {
    for (const s of SK.listSkins()) {
      out.push(entry({
        id: 'skin:' + s.id,
        label: 'Design: ' + s.label,
        sub: 'Change the shapes and the type',
        group: 'Appearance',
        icon: '◇',
        keywords: ['skin', 'design', 'look', 'style', 'shape', 'font'],
        run: () => SK.applySkin(s.id)
      }));
    }
  }
  out.push(entry({
    id: 'cmd:shortcuts',
    label: 'Keyboard shortcuts',
    sub: 'Everything this desk answers to',
    group: 'Help',
    icon: '⌨',
    keywords: ['keys', 'help', 'bindings', '?'],
    run: () => UI && UI.openShortcutSheet && UI.openShortcutSheet()
  }));
  out.push(entry({
    id: 'cmd:print',
    label: 'Print this page',
    sub: 'Uses the print stylesheet, not the screen one',
    group: 'Help',
    icon: '⎙',
    keywords: ['print', 'pdf', 'paper', 'export'],
    run: () => window.print()
  }));
  out.push(entry({
    id: 'cmd:top',
    label: 'Jump to the top',
    sub: 'Same as g g',
    group: 'Help',
    icon: '↑',
    keywords: ['scroll', 'top', 'start', 'beginning'],
    run: () => window.scrollTo({ top: 0, behavior: 'smooth' })
  }));
  return out;
}

/* The late half: the film's own contents. Imported on first open
   so none of this is in any page's first paint. */
async function loadContent() {
  if (loaded) return;
  loaded = true;
  const add = [];
  try {
    const { listScenes } = await import('../lib/scenes.js');
    for (const sc of listScenes()) {
      const head = [sc.intExt, sc.location, sc.dayNight].filter(Boolean).join('. ');
      add.push(entry({
        id: 'scene:' + sc.id,
        label: 'Scene ' + (sc.number || '—') + (head ? ' · ' + head : ''),
        sub: sc.synopsis || 'No synopsis yet',
        group: 'Scenes',
        hueClass: 'hue-shorts',
        icon: '▦',
        href: 'breakdown.html#scene-' + sc.id,
        keywords: ['scene', 'breakdown', sc.location || '', sc.synopsis || '']
      }));
    }
  } catch (e) { /* the model is not in this build */ }
  try {
    const { listContacts } = await import('../lib/contacts.js');
    for (const c of listContacts()) {
      if (!c.name) continue;
      add.push(entry({
        id: 'contact:' + c.id,
        label: c.name,
        sub: [c.role, c.department].filter(Boolean).join(' · ') || 'Crew',
        group: 'Contacts',
        hueClass: 'hue-shoot',
        icon: '☏',
        href: 'contacts.html#c-' + c.id,
        keywords: ['crew', 'cast', 'contact', c.role || '', c.department || '']
      }));
    }
  } catch (e) { /* ditto */ }
  if (add.length) {
    items = items.concat(add);
    if (open) render(input.value);
  }
}

function buildIndex() {
  items = [].concat(navItems(), projectItems(), settingItems());
}

/* ------------------------------------------------------------
   RENDER
   ------------------------------------------------------------ */
function rowFor(it, i) {
  const li = h('li.pal-row' + (it.hueClass ? '.' + it.hueClass : ''), {
    id: 'pal-opt-' + i,
    role: 'option',
    'aria-selected': String(i === active),
    'data-i': String(i)
  });
  li.append(iconSpan('pal-row-icon', it, '\u2022'));
  const body = h('span.pal-row-body');
  body.append(h('span.pal-row-label', { text: it.label }));
  if (it.sub) body.append(h('span.pal-row-sub', { text: it.sub }));
  li.append(body);
  /* The group is printed on every row rather than as a sticky
     header. A header tells you where a run of rows came from; with
     a query live, the rows are interleaved by score and a header
     would be lying about the four rows under it. */
  const tag = h('span.pal-row-tag');
  tag.append(h('span.pal-row-group', { text: it.group }));
  if (it.status && it.status !== 'built') {
    tag.append(h('span.pal-row-status', { text: it.status.toUpperCase() }));
  }
  li.append(tag);
  return li;
}

function render(q) {
  shown = rank(q || '');
  if (active >= shown.length) active = Math.max(0, shown.length - 1);
  listEl.textContent = '';
  shown.forEach((it, i) => listEl.append(rowFor(it, i)));
  const n = shown.length;
  emptyEl.hidden = n > 0;
  if (!n) {
    emptyEl.textContent = q
      ? 'Nothing matches “' + q.trim() + '”. Try a module, a scene number or a name.'
      : 'Nothing to show.';
  }
  /* Announced as a whole phrase, not a bare number: "17" on its own
     is not an answer to anything. Polite and atomic, and focus does
     not move — the reader stays in the field they are typing in. */
  countEl.textContent = n
    ? n + (n === 1 ? ' result' : ' results') + (q.trim() ? ' for ' + q.trim() : '')
    : 'No results';
  paintActive();
}

function paintActive() {
  const rows = listEl.children;
  for (let i = 0; i < rows.length; i++) {
    rows[i].setAttribute('aria-selected', String(i === active));
    rows[i].classList.toggle('is-active', i === active);
  }
  const el = rows[active];
  if (el) {
    input.setAttribute('aria-activedescendant', el.id);
    el.scrollIntoView({ block: 'nearest' });
  } else {
    input.removeAttribute('aria-activedescendant');
  }
}

function move(delta) {
  if (!shown.length) return;
  active = (active + delta + shown.length) % shown.length;
  paintActive();
}

function choose(i) {
  const it = shown[i];
  if (!it) return;
  remember(it.id);
  closePalette();
  /* The action runs AFTER the overlay is gone. A run() that opens
     the shortcut sheet would otherwise put a second dialog behind a
     first that is still closing, and focus would land in whichever
     won the race. */
  if (it.run) { try { it.run(); } catch (e) { console.warn('[palette]', e); } return; }
  if (it.href) location.href = it.href;
}

/* ------------------------------------------------------------
   OPEN / CLOSE
   ------------------------------------------------------------ */
function build() {
  if (root) return;
  root = h('div#studioPalette.pal-overlay', {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Search the studio',
    hidden: true
  });
  const box = h('div.pal-box');
  const field = h('div.pal-field');
  field.append(h('span.pal-field-icon', { text: '⌕', 'aria-hidden': 'true' }));
  input = h('input#palInput.pal-input', {
    type: 'text',
    role: 'combobox',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder: 'Go to a module, a scene, a person, a setting…',
    'aria-expanded': 'true',
    /* The list is filtered as you type rather than completing the
       value in the field, which is "list" and not "both" or
       "inline". Saying "both" would promise an inline completion
       that never arrives. */
    'aria-autocomplete': 'list',
    'aria-controls': 'palList',
    'aria-label': 'Search the studio'
  });
  field.append(input);
  /* A REAL CLOSE, not a picture of a key. This used to be a
     `<kbd aria-hidden>esc</kbd>`, and on a phone that was the whole
     story: under 560px the box is a full-height sheet covering the
     scrim whose mousedown closes it, and a touch keyboard has no
     Escape — so the palette opened from the action bar's SEARCH could
     not be left except by reloading (UX audit H9). A labelled button,
     everywhere, with the key it shares named for assistive tech; the
     visible word is "Close" because "esc" means nothing to a thumb. */
  closeBtn = h('button.pal-close', {
    type: 'button',
    'aria-label': 'Close search',
    'aria-keyshortcuts': 'Escape',
    text: 'Close'
  });
  field.append(closeBtn);
  box.append(field);

  listEl = h('ul#palList.pal-list', { role: 'listbox', 'aria-label': 'Results' });
  box.append(listEl);
  emptyEl = h('p.pal-empty', { hidden: true });
  box.append(emptyEl);

  const foot = h('div.pal-foot');
  foot.append(h('span', { text: '↑↓ move' }), h('span', { text: '↵ open' }),
              h('span', { text: 'esc close' }));
  box.append(foot);

  countEl = h('p.pal-count.visually-hidden', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  box.append(countEl);

  root.append(box);
  document.body.append(root);

  /* Pointer: mousedown rather than click for the activation, so the
     row cannot lose a race with the input's blur; and the
     highlight follows the pointer so there are never two "current"
     rows, one under the keyboard and one under the mouse. */
  listEl.addEventListener('mousemove', (e) => {
    const row = e.target.closest('.pal-row');
    if (!row) return;
    const i = Number(row.dataset.i);
    if (i !== active) { active = i; paintActive(); }
  });
  listEl.addEventListener('mousedown', (e) => {
    const row = e.target.closest('.pal-row');
    if (!row) return;
    e.preventDefault();
    choose(Number(row.dataset.i));
  });
  root.addEventListener('mousedown', (e) => { if (e.target === root) closePalette(); });
  closeBtn.addEventListener('click', () => closePalette());
  /* Escape and Tab for the button's half of the dialog. The input
     handles its own keys (onKey) and stops Escape there; this catches
     the same keys while the Close button holds focus. */
  closeBtn.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(); }
    else if (e.key === 'Tab') { e.preventDefault(); input.focus(); }
  });
  input.addEventListener('input', () => { active = 0; render(input.value); });
  input.addEventListener('keydown', onKey);
}

function onKey(e) {
  switch (e.key) {
    case 'Escape':      e.preventDefault(); e.stopPropagation(); closePalette(); break;
    case 'ArrowDown':   e.preventDefault(); move(1); break;
    case 'ArrowUp':     e.preventDefault(); move(-1); break;
    case 'PageDown':    e.preventDefault(); move(8); break;
    case 'PageUp':      e.preventDefault(); move(-8); break;
    case 'Home':        e.preventDefault(); active = 0; paintActive(); break;
    case 'End':         e.preventDefault(); active = shown.length - 1; paintActive(); break;
    case 'Enter':       e.preventDefault(); choose(active); break;
    /* Tab is trapped rather than allowed to leave: this is
       aria-modal, and a Tab that walked into the page behind would
       leave a sighted keyboard user focused on something they
       cannot see under a scrim. There are exactly two stops, the
       field and its Close button, and Tab either way swaps them. */
    case 'Tab':         e.preventDefault(); if (closeBtn) closeBtn.focus(); break;
    default: break;
  }
}

export function openPalette() {
  build();
  if (open) { input.select(); return; }
  open = true;
  opener = document.activeElement;
  buildIndex();
  root.hidden = false;
  document.body.classList.add('pal-open');
  input.value = '';
  active = 0;
  render('');
  input.focus();
  loadContent();
}

export function closePalette() {
  if (!open || !root) return;
  open = false;
  root.hidden = true;
  document.body.classList.remove('pal-open');
  /* Focus goes back where it came from. A dialog that drops focus
     on <body> at close sends the next Tab to the top of the
     document, which on a 65,000px blueprint is a long way from
     wherever the reader was. */
  if (opener && document.contains(opener) && opener.focus) {
    try { opener.focus(); } catch (e) {}
  }
  opener = null;
}

export function togglePalette() {
  if (open) closePalette(); else openPalette();
}

export function isPaletteOpen() { return open; }

export default { openPalette, closePalette, togglePalette, isPaletteOpen };
