/* ============================================================
   THE COMMAND PALETTE — one key for twenty-two modules
   ------------------------------------------------------------
   The studio has 22 modules across six phases, two themes, a
   project list, and however many scenes and contacts the
   film has. The shell answers "where am I"; the launcher answers
   "what exists". Neither answers the question a person actually
   has at 2am, which is "take me to Scene 14", and the honest
   measure of the old answer was four interactions: open the rail,
   pick the phase, pick the module, find the row.

   This is ⌘K. It is the launcher's index with a text field in
   front of it, and three rules:

   1. IT IS DERIVED, NEVER LISTED. Modules come from
      navigation.json, projects from
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
import { listProjects, currentProjectId } from '../lib/store.js';
import { switchProject } from './project-switcher.js';
import { markLocked, aiUnlocked, allowed } from '../lib/plan-gate.js';
import { pageFile } from '../lib/page-file.js';
import '../styles/palette.css';

const MAX_ROWS = 60;

let root = null;        // the overlay
let input = null;
let listEl = null;
let countEl = null;
let emptyEl = null;
let hintEl = null;      // the one-line explanation of a prefix, shown when the field is just that character
let recentCount = 0;    // how many of `shown` are the Recent group (empty field only)

let items = [];         // the full index
let shown = [];         // what is on screen, scored and sorted
let active = 0;         // index into `shown`
let closeBtn = null;    // the dialog's one other focus stop
let opener = null;      // what to give focus back to
let loading = false;    // a content pull is in flight
let base = [];          // the index that needs no model: modules, settings, commands
let late = [];          // the film's own contents, from the last pull
let open = false;

/* In memory, for this session only. See rule 2. The ENTRIES are kept,
   not just their ids, so a row that is not in the index (a script
   line, found by typing) can be offered again as a recent. */
const recent = [];
const recentEntries = new Map();
function remember(it) {
  const id = it.id;
  const i = recent.indexOf(id);
  if (i >= 0) recent.splice(i, 1);
  recent.unshift(id);
  recentEntries.set(id, it);
  while (recent.length > 8) recentEntries.delete(recent.pop());
}

/* ------------------------------------------------------------
   PREFIXES
   ------------------------------------------------------------
   The first character can say what KIND of thing is wanted:
     >  commands only (back up, switch theme, open Settings...)
     #  scenes, by number (#12 finds scene 12 and 12A)
     @  people only (crew contacts and the script's characters)
   Nothing else about the field changes. A prefix narrows the index
   it already has; it does not add a second one.
   ------------------------------------------------------------ */
const HINTS = {
  '>': 'Commands only: back up, switch theme, open Settings, take the tour. Type to narrow.',
  '#': 'Scenes by number: type 12 for scene 12 and 12A.',
  '@': 'People only: crew contacts and the characters in your script.'
};
function parseQuery(raw) {
  const t = String(raw || '').replace(/^\s+/, '');
  const c = t.charAt(0);
  if (c === '>' || c === '#' || c === '@') return { mode: c, needle: t.slice(1).trim().toLowerCase() };
  return { mode: '', needle: t.trim().toLowerCase() };
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

let scriptLines = [];
/* A script hit opens the page AT the line: screenplay.html#line-<element id>.
   script.js reads the hash on load and on hashchange. Already on the
   script page, choosing the SAME hash again would fire no hashchange and
   a different one would be a full reload for nothing, so the hash is set
   quietly and the event dispatched, which is what fragments.js does for
   a same-page link. */
function lineHref(id) { return 'screenplay.html#line-' + encodeURIComponent(String(id)); }
function goToLine(id) {
  const href = lineHref(id);
  if (pageFile(location.pathname) === 'screenplay.html') {
    history.replaceState(null, '', href.slice(href.indexOf('#')));
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.href = href;
  }
}
/** Up to six script lines containing the query (three characters or more),
 *  as ordinary palette entries that open the script at that line. */
function scriptHits(needle) {
  if (needle.length < 3 || !scriptLines.length) return [];
  const out = [];
  for (const l of scriptLines) {
    const at = l.text.toLowerCase().indexOf(needle);
    if (at < 0) continue;
    const from = Math.max(0, at - 24);
    out.push(entry({
      id: 'line:' + l.id,
      label: (from ? '…' : '') + l.text.slice(from, at + needle.length + 48).trim(),
      sub: 'Screenplay · ' + (l.type === 'dialogue' ? 'dialogue' : l.type === 'action' ? 'action' : 'scene line'),
      group: 'Screenplay',
      hueClass: 'sh-ph-screenplay',
      icon: '¶',
      href: lineHref(l.id),
      run: () => goToLine(l.id)
    }));
    if (out.length >= 6) break;
  }
  return out;
}

/* "12", "12a": a scene number as a person types it. */
const SCENE_NO = /^\d+[a-z]?$/;
function sceneNoScore(it, needle) {
  const no = it.sceneNo;
  if (!no) return 0;
  if (no === needle) return 10000;
  if (no.startsWith(needle)) return 8000 - no.length;
  return 0;
}

function rank(q) {
  const { mode, needle } = parseQuery(q);
  const out = [];
  for (const it of items) {
    if (mode === '>' && !it.cmd) continue;
    if (mode === '#' && it.group !== 'Scenes') continue;
    if (mode === '@' && !it.person) continue;
    const s = mode === '#' && SCENE_NO.test(needle) ? sceneNoScore(it, needle) : score(it, needle);
    if (!s) continue;
    const bump = recent.indexOf(it.id);
    out.push({ it, s: s + (bump >= 0 ? (8 - bump) * 50 : 0) });
  }
  /* Scenes keep their script order on a tie, so "#1" reads 1, 10, 11
     rather than the alphabet of their sluglines. The rest sort by name. */
  out.sort((a, b) => b.s - a.s
    || (a.it.ord !== undefined && b.it.ord !== undefined ? a.it.ord - b.it.ord : 0)
    || a.it.label.localeCompare(b.it.label));
  const rows = out.slice(0, MAX_ROWS).map((r) => r.it);
  if (mode) return rows;
  /* Script lines come last: a module or a person named like the query is
     a better answer than a line that happens to contain it. */
  return rows.concat(scriptHits(needle)).slice(0, MAX_ROWS + 6);
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
      if (!allowed(m.id)) continue;   // switched off in the plan matrix / console: not searchable
      /* `status` is carried through rather than filtered on. A
         planned module that vanished from search would be a map
         with a hole in it, and the honest answer — the row is
         there and says PLANNED — is the one the launcher already
         gives. The href still points at the stub that explains
         itself. */
      out.push(entry({
        id: 'mod:' + m.id,
        moduleId: m.id,   // plan-gate.js markLocked() flags the row by this
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
      run: () => { switchProject(p.id); }   // the one switch: sets the project, lands on the dashboard (project-switcher.js)
    }));
}

function settingItems() {
  const out = [];
  const UI = typeof window !== 'undefined' ? window.StudioUI : null;

  /* No theme rows: the studio has one theme (dark, 14 Oct 2026), so
     there is nothing to switch to. A second theme in chrome.js's
     THEME_ORDER would be the place to bring them back, derived. */
  void UI;
  out.push(entry({
    id: 'cmd:shortcuts',
    label: 'Keyboard shortcuts',
    sub: 'Everything this desk answers to',
    group: 'Help',
    icon: '⌨',
    cmd: true,
    keywords: ['keys', 'help', 'bindings', '?'],
    run: () => UI && UI.openShortcutSheet && UI.openShortcutSheet()
  }));
  out.push(entry({
    id: 'cmd:print',
    label: 'Print this page',
    sub: 'Uses the print stylesheet, not the screen one',
    group: 'Help',
    icon: '⎙',
    cmd: true,
    keywords: ['print', 'pdf', 'paper', 'export'],
    run: () => window.print()
  }));
  out.push(entry({
    id: 'cmd:top',
    label: 'Jump to the top',
    sub: 'Same as g g',
    group: 'Help',
    icon: '↑',
    cmd: true,
    keywords: ['scroll', 'top', 'start', 'beginning'],
    run: () => window.scrollTo({ top: 0, behavior: 'smooth' })
  }));
  return out;
}

/* Press a data-action the page already answers. The Backup menu in the
   band (topbar-backup.js) owns export and import and listens for
   `data-action` clicks on the document, so the palette asks it the same
   way a menu item does rather than importing the backup code (CORE stays
   light). Where that menu is not on the page, say where Backup lives
   instead of doing nothing. */
function pressAction(action, fallbackHref) {
  if (!document.querySelector('[data-tb-backup]')) { if (fallbackHref) location.href = fallbackHref; return; }
  const b = h('button', { type: 'button', 'data-action': action, hidden: true });
  document.body.append(b);
  b.click();
  b.remove();
}

/* Commands: things that DO something, listed under `>`. Navigation to a
   place is not a command, so Settings is here only because the person
   typing "settings" after `>` means it. Nothing here writes at the moment
   the palette opens; each row acts only when chosen. */
function commandItems() {
  const out = [];
  const c = (o) => out.push(entry({ group: 'Commands', cmd: true, ...o }));
  c({
    id: 'cmd:export', label: 'Export a backup', sub: 'Every project, as one .json file', icon: '⇩',
    keywords: ['backup', 'download', 'save', 'json', 'export everything'],
    run: () => pressAction('bk-export', 'settings.html#backup')
  });
  c({
    id: 'cmd:import', label: 'Import a backup', sub: 'Restore from a .json backup file', icon: '⇧',
    keywords: ['backup', 'restore', 'upload', 'json'],
    run: () => pressAction('bk-import', 'settings.html#backup')
  });
  c({
    id: 'cmd:overview', label: 'Studio overview (PDF)', sub: 'The studio overview as a paginated A4 document', icon: '⎙',
    keywords: ['backup', 'pdf', 'overview', 'print', 'export'],
    run: () => pressAction('bk-overview', 'settings.html#backup')
  });
  c({
    id: 'cmd:drive', label: 'Google Drive backup', sub: 'Connect Drive, back up now, restore an earlier version', icon: '☁',
    keywords: ['backup', 'drive', 'google', 'sync', 'cloud'],
    href: 'settings.html#backup'
  });
  c({
    id: 'cmd:settings', label: 'Open Settings', sub: 'Account, data and backup, appearance', icon: '⚙',
    keywords: ['preferences', 'options', 'account', 'configure'],
    href: 'settings.html'
  });
  c({
    id: 'cmd:newproject', label: 'New project', sub: 'Start another film', icon: '+',
    keywords: ['film', 'create', 'start', 'feature', 'short'],
    href: 'index.html'
  });
  c({
    id: 'cmd:tour', label: 'Take the tour', sub: 'A short walk through the studio', icon: '➜',
    keywords: ['help', 'guide', 'walkthrough', 'start', 'learn'],
    run: () => import('./tour.js').then((m) => m.startTour()).catch((e) => console.warn('[palette] tour', e))
  });
  return out;
}

/* The late half: the film's own contents. Imported on first open
   so none of this is in any page's first paint. */
/* Pulled on EVERY open, not once: buildIndex() starts from the static
   half each time, and a film that gained a scene since the last open
   should find it. The previous pull stays in `late` meanwhile, so rows
   do not blink out while the new one loads. */
async function loadContent() {
  if (loading) return;
  loading = true;
  try { await pullContent(); } finally { loading = false; }
}

async function pullContent() {
  const add = [];
  try {
    const { listScenes } = await import('../lib/scenes.js');
    listScenes().forEach((sc, ord) => {
      const head = [sc.intExt, sc.location, sc.dayNight].filter(Boolean).join('. ');
      add.push(entry({
        id: 'scene:' + sc.id,
        label: 'Scene ' + (sc.number || '—') + (head ? ' · ' + head : ''),
        sub: sc.synopsis || 'No synopsis yet',
        group: 'Scenes',
        hueClass: 'hue-shorts',
        icon: '▦',
        href: 'breakdown.html#scene-' + sc.id,
        sceneNo: String(sc.number || '').trim().toLowerCase(),   // `#12` matches on this
        ord,
        keywords: ['scene', 'breakdown', sc.location || '', sc.synopsis || '']
      }));
    });
  } catch (e) { /* the model is not in this build */ }
  try {
    const { listContacts } = await import('../lib/contacts.js');
    for (const c of listContacts()) {
      if (!c.name) continue;
      add.push(entry({
        id: 'contact:' + c.id,
        label: c.name,
        sub: [c.role, c.department].filter(Boolean).join(' · ') || 'Crew',
        group: 'People',
        hueClass: 'hue-shoot',
        icon: '☏',
        person: true,   // `@` lists these
        href: 'contacts.html#c-' + c.id,
        keywords: ['crew', 'cast', 'contact', c.role || '', c.department || '']
      }));
    }
  } catch (e) { /* ditto */ }
  try {
    /* Cast: the script's characters, stored or only named by a cue, as
       characters.js reads them. `@` lists these beside the crew. */
    const Chars = await import('../lib/characters.js');
    const { loadScript: readScript } = await import('../lib/script.js');
    const doc = readScript();
    const els = doc && Array.isArray(doc.elements) ? doc.elements : [];
    for (const c of Chars.mergeWithCues(Chars.loadCharacters(), els)) {
      if (!c.name) continue;
      add.push(entry({
        id: 'char:' + c.id,
        label: c.name,
        sub: 'Character' + (c.cues ? ' · ' + c.cues + (c.cues === 1 ? ' cue' : ' cues') : ''),
        group: 'People',
        hueClass: 'hue-shoot',
        icon: '☺',
        person: true,
        href: 'breakdown.html#script',
        keywords: ['character', 'cast', 'role'].concat(c.aliases || [])
      }));
    }
  } catch (e) { /* no characters in this build or studio */ }
  try {
    const { locationIndex } = await import('../lib/locations.js');
    for (const row of locationIndex()) {
      add.push(entry({
        id: 'place:' + row.key,
        label: row.name,
        sub: row.scenes.length + (row.scenes.length === 1 ? ' scene' : ' scenes'),
        group: 'Places',
        hueClass: 'hue-plan',
        icon: '⌖',
        href: 'plan.html#locations',
        keywords: ['location', 'place', 'recce', 'set']
      }));
    }
  } catch (e) { /* ditto */ }
  try {
    /* Script text is searched on demand (scriptHits), never indexed: a
       feature is thousands of lines and most queries are not about them. */
    const { loadScript } = await import('../lib/script.js');
    const doc = loadScript();
    scriptLines = (doc && Array.isArray(doc.elements) ? doc.elements : [])
      .filter((e) => e && e.text && /^(action|dialogue|scene|heading|parenthetical)$/.test(String(e.type)))
      .map((e, i) => ({ id: e.id, text: String(e.text), type: e.type, i }));
  } catch (e) { /* no script */ }
  late = add;
  items = base.concat(late);
  if (open && input) render(input.value);
}

/* AI, through the same pill flow. Every AI pill on THIS page is
   offered by its own label (which already ends "· Pro" when the plan
   has no AI), and choosing one clicks that pill — so the lock, the Pro
   offer, the no-key step and the Desk are the pill's, never a second
   copy here. Plus one row for the key's one place, Settings. Read off
   the DOM at open; nothing is stored. */
function aiItems() {
  const out = [];
  const locked = !aiUnlocked();
  const seen = new Set();
  document.querySelectorAll('button.ai-pill').forEach((pill) => {
    if (root && root.contains(pill)) return;
    const label = (pill.textContent || '').replace(/\s+/g, ' ').trim();
    if (!label || seen.has(label)) return;
    seen.add(label);
    out.push(entry({
      id: 'ai:' + label,
      label: 'AI: ' + label,
      sub: locked ? 'AI tools come with Pro' : 'Opens the AI Desk',
      group: 'AI',
      icon: '✦',
      keywords: ['ai', 'assistant', 'model', 'desk'],
      run: () => { if (pill.isConnected) pill.click(); }
    }));
  });
  out.push(entry({
    id: 'ai:settings',
    label: 'AI key' + (locked ? ' · Pro' : ''),
    sub: locked ? 'AI tools come with Pro' : 'Add, replace or forget your AI key in Settings',
    group: 'AI',
    icon: '✦',
    keywords: ['ai', 'key', 'api', 'anthropic', 'gemini', 'settings'],
    href: 'settings.html#ai'
  }));
  return out;
}

function buildIndex() {
  base = [].concat(navItems(), projectItems(), settingItems(), commandItems(), aiItems());
  items = base.concat(late);
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
  if (it.moduleId) li.dataset.moduleId = it.moduleId;
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

function sepRow(text) {
  return h('li.pal-sep', { role: 'presentation', text });
}

function render(q) {
  const { mode, needle } = parseQuery(q);
  shown = rank(q || '');
  /* An empty field starts with what was chosen this session. They come
     first under their own label and are not repeated below. */
  recentCount = 0;
  if (!mode && !needle) {
    const back = recent.map((id) => recentEntries.get(id)).filter(Boolean);
    if (back.length) {
      const ids = new Set(back.map((r) => r.id));
      shown = back.concat(shown.filter((it) => !ids.has(it.id)));
      recentCount = back.length;
    }
  }
  if (active >= shown.length) active = Math.max(0, shown.length - 1);
  listEl.textContent = '';
  shown.forEach((it, i) => {
    if (recentCount && i === 0) listEl.append(sepRow('Recent'));
    if (recentCount && i === recentCount && i < shown.length) listEl.append(sepRow('Everything'));
    listEl.append(rowFor(it, i));
  });
  markLocked(listEl);   // PLAN flag on a module the plan does not include
  /* The hint shows while the field is JUST the prefix; once a word follows,
     the person has understood it and the row is only in the way. */
  const lone = !needle && mode && String(q).trim() === mode;
  hintEl.hidden = !lone;
  hintEl.textContent = lone ? HINTS[mode] : '';
  if (lone) input.setAttribute('aria-describedby', 'palHint'); else input.removeAttribute('aria-describedby');
  const n = shown.length;
  emptyEl.hidden = n > 0;
  if (!n) {
    emptyEl.textContent = !needle && !mode ? 'Nothing to show.'
      : mode === '>' ? 'No command matches “' + needle + '”. Clear the > to search everything.'
      : mode === '#' ? 'No scene numbered “' + needle + '”.'
      : mode === '@' ? 'Nobody named “' + needle + '” in your contacts or script.'
      : 'Nothing matches “' + q.trim() + '”. Try a module, a scene number or a name.';
  }
  /* Announced as a whole phrase, not a bare number: "17" on its own
     is not an answer to anything. Polite and atomic, and focus does
     not move — the reader stays in the field they are typing in. */
  countEl.textContent = n
    ? n + (n === 1 ? ' result' : ' results') + (q.trim() ? ' for ' + q.trim() : '')
      + (recentCount ? ', ' + recentCount + ' recent' : '')
    : 'No results';
  paintActive();
}

function paintActive() {
  /* Only the options: the Recent / Everything labels are rows of the
     list element too, and are not part of the selection. */
  const rows = listEl.querySelectorAll('.pal-row');
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
  remember(it);
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
  field.append(iconSpan('pal-field-icon', { sym: 'search', icon: '⌕' }));
  input = h('input#palInput.pal-input', {
    type: 'text',
    role: 'combobox',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder: 'Search scenes, people, places, tools, settings, screenplay lines…',
    'aria-expanded': 'false',   // openPalette/closePalette keep it true only while open
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

  hintEl = h('p#palHint.pal-hint', { hidden: true });
  box.append(hintEl);
  listEl = h('ul#palList.pal-list', { role: 'listbox', 'aria-label': 'Results' });
  box.append(listEl);
  emptyEl = h('p.pal-empty', { hidden: true });
  box.append(emptyEl);

  const foot = h('div.pal-foot');
  foot.append(h('span', { text: '↑↓ move' }), h('span', { text: '↵ open' }),
              h('span', { text: 'esc close' }),
              h('span.pal-foot-keys', { text: '> commands  # scene  @ people' }));
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

export function openPalette(seed = '') {
  build();
  if (open) { if (seed) { input.value = seed; active = 0; render(seed); } else input.select(); return; }
  open = true;
  opener = document.activeElement;
  buildIndex();
  root.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  document.body.classList.add('pal-open');
  input.value = seed || '';
  active = 0;
  render(input.value);
  input.focus();
  if (seed) { try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) { /* ignore */ } }
  loadContent();
}

export function closePalette() {
  if (!open || !root) return;
  open = false;
  root.hidden = true;
  if (input) input.setAttribute('aria-expanded', 'false');
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
