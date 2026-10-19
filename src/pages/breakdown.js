/* ============================================================
   BREAKDOWN — scene list, tagging and the element index
   ------------------------------------------------------------
   Three views of ONE scene model (src/lib/scenes.js). Nothing here
   stores a second copy of anything: the element index is derived on
   every render, because two copies drift within a day.

   This page is also where the new visual language starts — generous
   spacing, one clear action per row, colour carrying meaning instead
   of decorating. The old pages put twelve small buttons in a strip and
   made the user read every one.
   ============================================================ */
import { mountStageGuide } from '../ui/stage-guide.js';
import '../lib/store.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import Scenes, {
  INT_EXT, DAY_NIGHT, ELEMENT_CATEGORIES, formatEighths, totalEighths
} from '../lib/scenes.js';
import * as Songs from '../lib/songs.js';
import { categoryTotals, indexTotals, indexRows, toCSV as elementsCSV, planBatch } from '../lib/element-index.js';
import { exportPDF } from '../lib/pdf.js';
import { download as saveFile, slug as fileSlug } from '../lib/story-io.js';
import '../styles/breakdown-elements.css';
import * as Bin from '../lib/scene-bin.js';
import '../styles/scene-bin.css';
import '../styles/scene-list.css';
import { shootDayOf } from '../lib/locations.js';
import {
  breakdownFigures, readNumberLock, numberKey, dupNumbers, daySlot, sceneStatus, STATUS_TONE,
  castSummary, searchText, PRESET_KEYS, filterActive as filterOn, describeFilter, presetMatches,
  rowMatches, filterCountText, applySuggestions, binEntryBits, binTotalsBits, headingInScript,
  sceneFieldValue, songFieldValue, runSaid
} from '../lib/breakdown-model.js';
import '../styles/breakdown-run.css';
import { flushStorage } from '../lib/store.js';
import { runBreakdown } from '../lib/breakdown-run.js';
import { commitImportedScript } from '../lib/script-commit.js';
import { renderOverview, setView, setFlowHooks, mountLearn, say as sayStatus } from '../ui/breakdown-overview.js';
import { loadScript, saveScript, blankElement } from '../lib/script.js';
import { renderScriptOverview, hydrateScriptParts } from '../ui/script-overview.js';
import { suggestReport, describeMatch, isConfident, SUGGEST_CATEGORIES } from '../lib/screenplay-analysis.js';
import { pageHeader, statStrip, statCard, button, chip, badge } from '../ui/kit/index.js';
import { aiPill } from '../ui/ai-pill.js';   // the one way into AI; the Desk loads at a click
import { measureEighths } from '../lib/scene-sync.js';
import PlanGate from '../lib/plan-gate.js';   // script_import (src/data/plan-matrix.json)

const app = document.getElementById('app');
const catById = Object.fromEntries(ELEMENT_CATEGORIES.map((c) => [c.id, c]));

/* ---- header ------------------------------------------------ */
function renderHeader(scenes) {
  const eighths = totalEighths(scenes);
  /* The kit's page header; `.bd-head` stays on it for the layout the
     other module pages share (measure, gutters, the stage-guide pill). */
  const head = pageHeader({
    class: 'bd-head bd-head-celtx',
    eyebrow: 'Breakdown · one scene model, every view',
    title: 'Breakdown',
    sub: 'Every scene once — INT/EXT, time, location, length. The stripboard, '
       + 'the sides, the shot list and the call sheet all read from this, so it '
       + 'is the only place any of it gets typed.',
    actions: scenes.length ? [
      aiPill({
        label: 'AI Desk',
        tasks: [{ id: 'scene-notes', label: 'Scene notes' }, { id: 'breakdown-tags', label: 'Breakdown tags' },
                { id: 'genre-comps', label: 'Genre and comparables' }],
        ctx: { elements: () => loadScript().elements, after: () => render() }
      }),
      button({
        label: 'RE-MEASURE PAGES FROM THE SCRIPT', action: 'eighths-measure',
        title: 'Recount each scene’s length in eighths from the script as it stands now'
      })
    ] : null
  });
  head.append(statStrip(kpis(scenes, eighths), { class: 'bd-kpis', label: 'The breakdown in figures' }));
  return head;
}

/* Six figures, all derived from the scene model on render. A figure with
   nothing behind it prints a dash rather than a zero that reads as a fact. */
function kpis(scenes, eighths) {
  const dash = (n, f) => (n ? f(n) : '—');
  const idx = Scenes.elementIndex();
  const { cats, locs, ints, exts, songs, cast } = breakdownFigures(scenes, idx, Songs.listSongs().length);
  const card = (value, label, note) => statCard({ value, label, note: note || '' });
  return [
    card(dash(scenes.length, String), scenes.length === 1 ? 'scene' : 'scenes', scenes.length ? 'in the breakdown' : ''),
    card(dash(scenes.length, () => formatEighths(eighths)), eighths === 8 ? 'page' : 'pages', scenes.length ? eighths + ' eighths' : ''),
    card(dash(idx.length, String), 'elements', idx.length ? cats + (cats === 1 ? ' category' : ' categories') : ''),
    card(dash(locs, String), 'locations', locs ? ints + ' INT / ' + exts + ' EXT scenes' : ''),
    card(dash(songs, String), 'songs', songs ? 'musical' : ''),
    card(dash(cast, String), 'cast', cast ? 'tagged' : '')
  ];
}

/* One element chip: the kit chip, in its category's hue. The category word
   is printed (identity is never colour alone) and `.bd-chip` stays on it,
   because verify's hue check reads the 3px left rule it draws. `tag:
   'button'` makes the Auto-Tag suggestion, which is the same chip, pressable. */
function elChip(cat, name, o = {}) {
  const base = chip({ label: name, class: 'bd-chip hue-' + cat.hue });
  let el = base;
  if (o.tag === 'button') {
    el = h('button.k-chip');
    el.className = base.className;
    while (base.firstChild) el.append(base.firstChild);
  }
  if (o.class) el.classList.add(o.class);
  el.title = cat.label;
  const lab = el.querySelector('.k-chip-label');
  lab.classList.add('bd-chip-name');
  lab.before(h('span.k-chip-cat.bd-chip-cat', { text: cat.label }));
  for (const [k, v] of Object.entries(o.attrs || {})) el.setAttribute(k, v);
  return el;
}

/* ---- the teaching empty state ------------------------------
   StudioBinder's best idea: an empty module explains itself instead of
   showing a blank grid. Anchored in the four films like the glossary. */
function renderEmpty() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '◍', 'aria-hidden': 'true' }),
    h('h2', { text: 'Start with the scenes' }),
    h('p', {
      text: 'A scene is one continuous action, in one place, at one time. '
          + 'When the place or the time changes, the scene changes — that is the '
          + 'whole rule, and it is what makes everything downstream possible.'
    }),
    h('div.bd-how', {}, [
      how('1', 'List them', 'Number, INT or EXT, day or night, where, and one line of what happens.'),
      how('2', 'Measure them', 'Length in eighths of a page. Eight eighths is one page, and one page is roughly one minute.'),
      how('3', 'Tag them', 'Cast, props, wardrobe, vehicles. Tag once here and every report builds itself.')
    ]),
    h('div.bd-example', {}, [
      h('span.bd-example-film', { text: 'Por Thozhil' }),
      h('span', {
        text: ' opens on an interior, day, a police station — one location, one '
            + 'continuous action. The moment the investigation moves outside, that '
            + 'is a new scene, a new line here, and eventually a different shoot day.'
      })
    ]),
    h('p.bd-sub', {}, [
      'Have a script already? ',
      h('a', { href: '#overview', text: 'Upload it or break it down on the Whole script tab' }),
      ' and every scene, character and location is filled in for you.'
    ]),
    button({ label: '+  Add a scene by hand', variant: 'primary', pill: true, action: 'scene-add', class: 'bd-cta' })
  ]);
}
const how = (n, title, body) =>
  h('div.bd-how-step', {}, [
    h('span.bd-how-num', { text: n }),
    h('strong', { text: title }),
    h('p', { text: body })
  ]);

/* ---- one scene ---------------------------------------------- */

/* THE SCENE NUMBER HAS TWO OWNERS, and the card shows which one.
   A scene the script's heading made (`scriptElId` set) is numbered by
   src/lib/scene-sync.js from that heading, and anything typed here
   would be overwritten by the next heading edit — so it is read-only,
   and says so. A scene typed by hand on this page belongs to this
   page, and its number is a text field: "12A" is a scene number, so
   it is a string, trimmed, never empty. Two scenes with one number are
   ALLOWED and FLAGGED, not blocked: the person renumbering a run of
   scenes passes through a duplicate on the way to the right answer,
   and a field that refuses the step blocks the fix (UX audit M26,
   docs/KNOWN-ISSUES.md §8). Nothing in the app sorts by number — the
   list order IS the scene order — so "12A" needs no comparator. */
const BOUND_TITLE = 'Set by the script’s scene heading. Change the heading in the Screenplay Writer to renumber it.';
/* LOCKED NUMBERS (src/lib/script.js). Once Write locks the scene
   numbers, a bound scene's number is the lock's — 12A for a scene cut
   in after 12 — and scene-sync.js writes it onto the row; the card says
   so, because "change the heading to renumber it" stops being true. A
   hand-made scene is still the Breakdown's own and stays editable. */
const LOCKED_TITLE = 'Locked scene number, set in the Screenplay Writer. An inserted scene is lettered and a cut one is OMITTED; unlock the numbers in Write’s Revisions to renumber.';
let NUM_LOCK = { locked: false, omitted: [] };   // readNumberLock(), src/lib/breakdown-model.js
/** Mark one number cell: the duplicate flag, and the title that says
 *  either "another scene has this number" or, on a bound scene, that
 *  the heading sets it. */
function markNumber(el, scene, dups) {
  const isDup = dups.has(numberKey(scene.number));
  el.classList.toggle('is-dup', isDup);
  if (isDup) {
    el.setAttribute('title', 'Another scene is also numbered ' + String(scene.number).trim()
      + ' — allowed, but the schedule and the sides will show two of them');
  } else if (scene.scriptElId) el.setAttribute('title', NUM_LOCK.locked ? LOCKED_TITLE : BOUND_TITLE);
  else el.removeAttribute('title');
  el.classList.toggle('is-locked', !!(NUM_LOCK.locked && scene.scriptElId));
}
/** Re-mark every number on the page after one changed, in place — a
 *  render here would take the focus off the field being tabbed to. */
function refreshNumberMarks() {
  const scenes = Scenes.listScenes();
  const dups = dupNumbers(scenes);
  const byId = new Map(scenes.map((s) => [s.id, s]));
  document.querySelectorAll('.bd-scene[data-scene] .bd-scene-no').forEach((el) => {
    const s = byId.get(el.closest('[data-scene]').dataset.scene);
    if (s) markNumber(el, s, dups);
  });
}
let DUPS = new Set();

/* THE SCENE LIST IS A TABLE (owner, 12 Oct 2026: "Scene list UI is not
   nice"). One compact row per scene — number, where, INT/EXT, time, length,
   who, and where it stands — with the synopsis under the location and
   everything else (the synopsis field, the song, the element tags, move and
   delete) behind the row's chevron. Every control keeps the data-scene-field
   it always had, so the handlers below are the same ones. Nothing here is
   stored: the status chip is derived from the scene's own fields, and which
   rows are open, selected or filtered lives in SL for this page view only. */
const SL = {
  q: '', ie: '', dn: '', st: '', open: new Set(), sel: new Set(),
  /* Saved filters (1.7). IN MEMORY ONLY: they live and die with this page
     view and are written nowhere — no localStorage, no sessionStorage. A
     preset that survives a reload would be a new storage key, which is an
     owner decision (docs/NEXT-IDEAS-PLAN.md 3.2). */
  presets: [
    { id: 'p-night-ext', name: 'Night exteriors', q: '', ie: 'EXT', dn: 'NIGHT', st: '' },
    { id: 'p-untagged', name: 'Untagged scenes', q: '', ie: '', dn: '', st: 'untagged' }
  ],
  presetSeq: 0
};
const filterActive = () => filterOn(SL);
const KEYS_HINT = 'Keys: Up and Down arrows move between scenes (from the open/close button or the location). '
  + 'Enter opens or closes a scene. N adds a scene. Delete moves the focused scene to the bin, with Undo. '
  + 'On a drag handle, Up and Down reorder the scene.';
const GRIP_ON = 'Drag to reorder this scene (or focus it and press Up or Down)';
const GRIP_OFF = 'Reordering is off while a search or filter is active: clear it to drag scenes into a new order';
/* The day slot, the status chip, the cast line and the search text are
   derived in src/lib/breakdown-model.js; nothing here is stored. */

/** "2 Cast  3 Props": a per-category count, in the category's own hue. */
function rowCounts(scene) {
  const wrap = h('span.bd-sl-counts');
  for (const cat of ELEMENT_CATEGORIES) {
    const n = (scene.elements[cat.id] || []).length;
    if (n) wrap.append(chip({ label: cat.label, count: n, class: 'bd-count hue-' + cat.hue }));
  }
  return wrap.childNodes.length ? wrap : null;
}
function renderScene(scene, i, total) {
  /* The id is the command palette's target (breakdown.html#scene-…):
     tabs.js picks the tab that holds it and the fragment resolver
     lands on the card. Without it a scene result opened the top of
     the page (UX audit M17). */
  const open = SL.open.has(scene.id);
  const status = sceneStatus(scene);
  const card = h('article.bd-scene.bd-sl' + (open ? '.is-open' : ''), {
    'data-scene': scene.id, id: 'scene-' + scene.id,
    'data-ie': scene.intExt, 'data-dn': scene.dayNight, 'data-st': status.id,
    'data-find': searchText(scene)
  });
  const detailId = 'bdsd-' + scene.id;

  const numberCell = scene.scriptElId
    ? h('span.bd-scene-no', { text: scene.number || String(i + 1) })
    : field('input.bd-scene-no.bd-scene-no-edit', {
      type: 'text', value: scene.number, placeholder: String(i + 1), size: '3',
      autocomplete: 'off', spellcheck: 'false',
      'data-scene-field': 'number', 'aria-label': 'Scene number'
    });
  markNumber(numberCell, scene, DUPS);

  const cast = castSummary(scene);
  const day = shootDayOf(scene);
  const off = filterActive();
  if (day) card.append(h('span.bd-sl-day', { 'data-slot': String(daySlot(day)), title: 'Day ' + day, 'aria-hidden': 'true' }));
  card.append(h('div.bd-sl-main', {}, [
    h('button.bd-icon.bd-sl-grip', {
      type: 'button', 'data-action': 'sl-grip', 'aria-disabled': String(off), title: off ? GRIP_OFF : GRIP_ON,
      'aria-label': 'Reorder scene ' + (scene.number || i + 1) + '. Drag, or press Up or Down.', text: '\u283F'
    }),
    h('input.bd-sl-pick', { type: 'checkbox', 'data-action': 'sl-pick', checked: SL.sel.has(scene.id), 'aria-label': 'Select scene ' + (scene.number || i + 1) }),
    numberCell,
    h('div.bd-sl-where', {}, [
      field('input.bd-slug', {
        type: 'text', value: scene.location, placeholder: 'Location — where are we?',
        'data-scene-field': 'location', 'aria-label': 'Scene location'
      }),
      h('span.bd-sl-syn', { text: scene.synopsis || 'No synopsis yet' })
    ]),
    select(INT_EXT, scene.intExt, 'intExt', 'Interior or exterior'),
    select(DAY_NIGHT, scene.dayNight, 'dayNight', 'Time of day'),
    h('div.bd-sl-len', {}, [
      field('input', {
        type: 'number', min: '0', max: '80', step: '1', value: String(scene.eighths),
        'data-scene-field': 'eighths', 'aria-label': 'Length in eighths of a page'
      }),
      h('span.bd-pages', { text: formatEighths(scene.eighths), title: 'Length in pages (eighths in the box)' })
    ]),
    h('span.bd-sl-cast' + (cast ? '' : '.is-none'), { text: cast || '—', title: (scene.elements.cast || []).join(', ') || 'No cast tagged yet' }),
    badge({ label: status.label, tone: STATUS_TONE[status.id], dot: true, class: 'bd-sl-status is-' + status.id }),
    h('button.bd-icon.bd-sl-toggle', {
      type: 'button', 'data-action': 'sl-toggle', 'aria-expanded': String(open), 'aria-controls': detailId,
      title: open ? 'Close the scene' : 'Open the scene to edit its synopsis and tags',
      'aria-label': (open ? 'Close' : 'Open') + ' scene ' + (scene.number || i + 1), text: open ? '▾' : '▸'
    }),
    rowCounts(scene)
  ]));

  const detail = h('div.bd-sl-detail', { id: detailId, hidden: !open });
  detail.append(h('p.bd-detail-lab', { text: 'Synopsis' }));
  detail.append(field('textarea.bd-synopsis', {
    rows: '2', placeholder: 'What happens in this scene?',
    'data-scene-field': 'synopsis', 'aria-label': 'Scene synopsis'
  }, scene.synopsis));

  /* Which song this scene belongs to, if any. Only offered once a
     song exists — an empty dropdown on every scene card would be
     noise on the 95% of films that have not added one yet. */
  const songs = Songs.listSongs();
  if (songs.length) {
    const sel = h('select.bd-sel.bd-scene-song', {
      'data-scene-field': 'songId', 'aria-label': 'Part of which song'
    });
    const none = h('option', { value: '', text: 'Not part of a song' });
    if (!scene.songId) none.selected = true;
    sel.append(none);
    songs.forEach((sg) => {
      const opt = h('option', {
        value: sg.id,
        text: (sg.number ? sg.number + '. ' : '') + (sg.title || Songs.kindLabel(sg.kind))
      });
      if (sg.id === scene.songId) opt.selected = true;
      sel.append(opt);
    });
    detail.append(h('label.bd-scene-songlink', {}, [h('span', { text: 'song' }), sel]));
  }

  /* The Desk's scene note, when one was accepted: a reader's sentence
     that rests on a verified quote, and the cut flag it earned. */
  if (scene.readerNote) {
    detail.append(h('p.bd-reader-note', {}, [
      h('span.bd-reader-lab', { text: scene.cutCandidate ? 'Reader note · cut candidate' : 'Reader note' }),
      h('span', { text: ' ' + scene.readerNote })
    ]));
  }

  const song = scene.songId && songs.find((sg) => sg.id === scene.songId);
  if (song) {
    detail.append(h('p.bd-cue', {}, [
      h('strong', { text: 'Musical cue: ' }),
      h('span', { text: (song.number ? 'Song ' + song.number + ' \u2013 ' : '') + (song.title || Songs.kindLabel(song.kind)) }),
      song.duration ? h('span.bd-cue-dur', { text: song.duration }) : null
    ]));
  }
  const usedCats = ELEMENT_CATEGORIES.filter((c) => (scene.elements[c.id] || []).length).length;
  detail.append(h('p.bd-detail-lab', { text: 'Tagged elements (' + usedCats + (usedCats === 1 ? ' category' : ' categories') + ')' }));
  const tags = h('div.bd-tags');
  for (const cat of ELEMENT_CATEGORIES) {
    const names = scene.elements[cat.id] || [];
    if (!names.length) continue;
    for (const name of names) {
      const el = elChip(cat, name);
      el.append(h('button.k-chip-x.bd-chip-x', {
        type: 'button', 'data-action': 'el-remove',
        'data-cat': cat.id, 'data-name': name,
        'aria-label': `Remove ${name} from ${cat.label}`, text: '×'
      }));
      tags.append(el);
    }
  }
  const adder = h('div.bd-add-el');
  const sel = h('select.bd-add-cat', { 'aria-label': 'Element category' });
  ELEMENT_CATEGORIES.forEach((c) => sel.append(h('option', { value: c.id, text: c.label })));
  adder.append(sel, h('input.bd-add-name', {
    type: 'text', placeholder: 'Tag an element — name it, press Enter',
    'data-action-key': 'el-add', 'aria-label': 'Element name', list: 'bdElementNames', autocomplete: 'off'
  }), button({ label: 'Attach Element', variant: 'primary', icon: 'add', action: 'el-attach', class: 'bd-attach' }));
  tags.append(adder);
  detail.append(tags);
  detail.append(h('div.bd-scene-acts', {}, [
    iconBtn('↑', 'scene-up',   'Move earlier', i === 0),
    iconBtn('↓', 'scene-down', 'Move later',   i === total - 1),
    iconBtn('✕', 'scene-del',  'Move to the bin', false, true)
  ]));
  card.append(detail);
  return card;
}

/** The toolbar above the rows: find, three filters, expand all, and the
 *  bulk bar that appears once rows are ticked. Filtering hides rows in
 *  place (applySceneFilter) — a re-render here would take the caret out of
 *  the search box on every keystroke. */
function renderSceneBar(scenes) {
  const opt = (v, l, cur) => h('option', { value: v, text: l, selected: v === cur });
  const bar = h('div.bd-sl-bar', { role: 'group', 'aria-label': 'Find and filter scenes', 'aria-describedby': 'bdSlKeys', title: KEYS_HINT }, [
    h('span#bdSlKeys.visually-hidden', { text: KEYS_HINT }),
    h('input#bdSceneSearch.bd-sl-search', { type: 'search', value: SL.q, placeholder: 'Find a scene — number, place, cast, anything in it…', 'data-action-key': 'sl-find', 'aria-label': 'Find a scene' }),
    h('select.bd-sel.bd-sl-filter', { 'data-sl-filter': 'ie', 'aria-label': 'Filter by interior or exterior' },
      [opt('', 'INT / EXT', SL.ie)].concat(INT_EXT.map((v) => opt(v, v, SL.ie)))),
    h('select.bd-sel.bd-sl-filter', { 'data-sl-filter': 'dn', 'aria-label': 'Filter by time of day' },
      [opt('', 'Any time', SL.dn)].concat(DAY_NIGHT.map((v) => opt(v, v, SL.dn)))),
    h('select.bd-sel.bd-sl-filter', { 'data-sl-filter': 'st', 'aria-label': 'Filter by where the scene stands' },
      [['', 'Any status'], ['untagged', 'Untagged'], ['tagged', 'Tagged'], ['scheduled', 'Scheduled'], ['shot', 'Shot'], ['part', 'Part shot'], ['dropped', 'Dropped']].map(([v, l]) => opt(v, l, SL.st))),
    button({ label: SL.open.size ? 'COLLAPSE ALL' : 'EXPAND ALL', action: 'sl-expand', class: 'bd-sl-expand' }),
    h('span.bd-sl-count', { role: 'status', 'aria-live': 'polite', title: KEYS_HINT, text: scenes.length + ' scenes' })
  ]);
  const bulk = h('div.bd-sl-bulk', { hidden: !SL.sel.size, role: 'group', 'aria-label': 'Selected scenes' }, [
    h('strong.bd-sl-bulk-n', { text: SL.sel.size + ' selected' }),
    h('select.bd-sel', { 'data-sl-bulk': 'intExt', 'aria-label': 'Set interior or exterior on the selected scenes' },
      [h('option', { value: '', text: 'Set INT / EXT…' })].concat(INT_EXT.map((v) => h('option', { value: v, text: v })))),
    h('select.bd-sel', { 'data-sl-bulk': 'dayNight', 'aria-label': 'Set time of day on the selected scenes' },
      [h('option', { value: '', text: 'Set time…' })].concat(DAY_NIGHT.map((v) => h('option', { value: v, text: v })))),
    button({ label: 'MOVE TO BIN', variant: 'danger', action: 'sl-bulk-bin' }),
    button({ label: 'CLEAR SELECTION', action: 'sl-clear' })
  ]);
  const names = h('datalist#bdElementNames');
  for (const el of Scenes.elementIndex()) names.append(h('option', { value: el.name }));
  return h('div.bd-sl-tools', {}, [bar, renderPresets(), bulk, names]);
}

/* ---- saved filters (in memory) ------------------------------ */
const presetOn = (p) => presetMatches(p, SL);
function renderPresets() {
  const on = filterActive();
  return h('div.bd-sl-presets', { role: 'group', 'aria-label': 'Saved filters (kept until you reload this page)' }, [
    button({
      label: 'SAVE THIS FILTER', size: 'sm', action: 'sl-save', disabled: !on, class: 'bd-sl-save',
      title: on ? 'Name the current search and filters and keep them as a button (until you reload this page)' : 'Set a search or a filter first, then save it'
    })
  ].concat(SL.presets.map((p) => {
    const active = on && presetOn(p);
    return h('span.bd-sl-preset' + (active ? '.is-on' : ''), { 'data-preset': p.id }, [
      h('button.bd-sl-preset-apply', { type: 'button', 'data-action': 'sl-preset', 'aria-pressed': String(active), title: 'Show: ' + describeFilter(p), text: p.name }),
      h('button.bd-sl-preset-x', { type: 'button', 'data-action': 'sl-preset-x', 'aria-label': 'Remove the saved filter ' + p.name, title: 'Remove this saved filter', text: '\u2715' })
    ]);
  })));
}
/** Redraw the preset strip in place, and give focus back to the control the
 *  reader was on (a chip that was just pressed has been replaced). */
function refreshPresets() {
  const old = document.querySelector('.bd-sl-presets');
  if (!old) return;
  const ae = document.activeElement;
  const back = ae && old.contains(ae)
    ? { action: ae.dataset.action, id: ae.closest('[data-preset]')?.dataset.preset } : null;
  const fresh = renderPresets();
  old.replaceWith(fresh);
  if (!back) return;
  let node = back.id
    ? fresh.querySelector('[data-preset="' + CSS.escape(back.id) + '"] [data-action="' + back.action + '"]')
    : fresh.querySelector('[data-action="' + back.action + '"]');
  if (!node || node.disabled) node = fresh.querySelector('[data-action="sl-save"], [data-action="sl-preset"]');
  if (node) node.focus();
}
/** Push SL's filter values back into the toolbar's controls. */
function syncBar() {
  const q = document.getElementById('bdSceneSearch');
  if (q) q.value = SL.q;
  document.querySelectorAll('[data-sl-filter]').forEach((el) => { el.value = SL[el.dataset.slFilter] || ''; });
}
function updateGrips() {
  const off = filterActive();
  document.querySelectorAll('.bd-sl-grip').forEach((g) => {
    g.setAttribute('aria-disabled', String(off));
    g.title = off ? GRIP_OFF : GRIP_ON;
  });
}

/** Hide the rows the filters rule out, in place. */
function applySceneFilter() {
  let shown = 0, total = 0;
  document.querySelectorAll('.bd-sl[data-scene]').forEach((row) => {
    total++;
    const ok = rowMatches(SL, row.dataset);
    row.hidden = !ok;
    if (ok) shown++;
  });
  const count = document.querySelector('.bd-sl-count');
  if (count) count.textContent = filterCountText(shown, total);
  const none = document.querySelector('.bd-sl-none');
  if (none) none.hidden = shown > 0;
  updateGrips();
  refreshPresets();
}

function field(spec, props, text) {
  const el = h(spec, props);
  if (text !== undefined) el.value = text;
  return el;
}
function select(options, value, fieldName, label) {
  const s = h('select.bd-sel', { 'data-scene-field': fieldName, 'aria-label': label });
  options.forEach((o) => {
    const opt = h('option', { value: o, text: o });
    if (o === value) opt.selected = true;
    s.append(opt);
  });
  return s;
}
function iconBtn(glyph, action, label, disabled, danger) {
  return h('button.bd-icon' + (danger ? '.is-danger' : ''), {
    type: 'button', 'data-action': action, title: label,
    'aria-label': label, text: glyph, disabled: disabled || false
  });
}

/* ---- songs --------------------------------------------------
   A Tamil feature carries four to six, and until now nothing in this
   studio knew what one was. The model is in src/lib/songs.js and the
   reasoning for it being its own model rather than a flag on a scene
   is at the top of that file.

   The card shows the PLAN and, once scenes are linked, what the script
   actually says — side by side, never merged. A song planned for two
   days whose scenes are spread over four is a schedule problem the
   producer has to see, and overwriting the plan with the derived
   figure would delete the evidence that there was ever a disagreement.
   The budget page settled this already: a hand-set figure is a
   decision, not a gap.
   ------------------------------------------------------------ */
function songSelect(options, value, fieldName, label) {
  const sel = h('select.bd-sel', { 'data-song-field': fieldName, 'aria-label': label });
  options.forEach((o) => {
    const opt = h('option', { value: o.id, text: o.label });
    if (o.id === value) opt.selected = true;
    sel.append(opt);
  });
  return sel;
}

function songField(spec, props, text) {
  const el = h(spec, props);
  if (text !== undefined) el.value = text;
  return el;
}

function renderSong(song, i, total, scenes) {
  const f = Songs.songFacts(song, scenes);
  const card = h('article.bd-song', { 'data-song': song.id });

  card.append(h('div.bd-song-bar', {}, [
    h('span.bd-song-no', { text: song.number || String(i + 1) }),
    songField('input.bd-song-title', {
      type: 'text', placeholder: 'Song title — or “untitled duet”',
      'data-song-field': 'title', 'aria-label': 'Song title'
    }, song.title),
    songSelect(Songs.SONG_KINDS, song.kind, 'kind', 'Kind of song'),
    songSelect(Songs.PLAYBACK_STATES, song.playback, 'playback', 'Playback state'),
    songSelect(Songs.UNITS, song.unit, 'unit', 'Which unit shoots it'),
    h('div.bd-song-acts', {}, [
      iconBtn('↑', 'song-up',   'Move earlier', i === 0),
      iconBtn('↓', 'song-down', 'Move later',   i === total - 1),
      iconBtn('✕', 'song-del',  'Delete song',  false, true)
    ])
  ]));

  card.append(songField('textarea.bd-song-sit', {
    rows: '2', 'data-song-field': 'situation', 'aria-label': 'Song situation',
    placeholder: 'What is the song doing in the story? The situation, not the lyrics.'
  }, song.situation));

  card.append(h('div.bd-song-grid', {}, [
    h('label.bd-song-f', {}, [
      h('span', { text: 'planned locations' }),
      songField('input', {
        type: 'text', 'data-song-field': 'locations', 'aria-label': 'Planned locations',
        placeholder: 'Marina, studio floor'
      }, song.locations)
    ]),
    h('label.bd-song-f', {}, [
      h('span', { text: 'planned days' }),
      songField('input', {
        type: 'number', min: '0', max: '60', step: '0.5',
        'data-song-field': 'days', 'aria-label': 'Planned shoot days'
      }, String(song.days || ''))
    ]),
    h('label.bd-song-f', {}, [
      h('span', { text: 'dancers' }),
      songField('input', {
        type: 'number', min: '0', max: '500', step: '1',
        'data-song-field': 'dancers', 'aria-label': 'Number of dancers'
      }, String(song.dancers || ''))
    ]),
    h('label.bd-song-f', {}, [
      h('span', { text: 'choreographer' }),
      songField('input', {
        type: 'text', 'data-song-field': 'choreographer', 'aria-label': 'Choreographer'
      }, song.choreographer)
    ])
  ]));

  /* What the script says, when it says anything. Shown as a separate
     line from the plan above, deliberately. */
  const facts = h('div.bd-song-facts');
  if (f.sceneCount) {
    facts.append(
      h('span', { text: f.sceneCount + (f.sceneCount === 1 ? ' scene' : ' scenes') + ' linked' }),
      h('span', { text: formatEighths(f.eighths) + ' pages' }),
      h('span', {
        text: f.scriptDays
          ? f.scriptDays + (f.scriptDays === 1 ? ' shoot day' : ' shoot days') + ' on the board'
          : 'no shoot day assigned yet'
      })
    );
  } else {
    facts.append(h('span', {
      text: 'No scenes linked yet — normal this early. Link them on a scene card above.'
    }));
  }
  card.append(facts);

  if (f.disagrees) {
    card.append(h('p.bd-song-warn', {
      text: 'The plan says ' + f.plannedDays
        + (f.plannedDays === 1 ? ' day' : ' days') + ' and the board has these scenes across '
        + f.scriptDays + (f.scriptDays === 1 ? ' day' : ' days')
        + '. Neither has been changed — decide which is right.'
    }));
  }
  /* A song cannot be picturised without a track to play, so a song
     with shoot days and no recording is a scheduling dependency, not
     a tidy-up. This is the one status here that can stop a day. */
  if (!f.ready && f.effectiveDays) {
    card.append(h('p.bd-song-warn', {
      text: 'Playback is “' + Songs.playbackLabel(song.playback) + '” but '
        + f.effectiveDays + (f.effectiveDays === 1 ? ' day is' : ' days are')
        + ' planned. Picturisation needs a track to play — this day cannot be shot yet.'
    }));
  }
  return card;
}

function renderSongs(scenes) {
  const songs = Songs.listSongs();
  const wrap = h('section.bd-songs', { id: 'songs' });
  const t = Songs.songTotals(songs, scenes);

  wrap.append(
    h('h2.bd-h2', { text: 'Songs' }),
    h('p.bd-sub', {
      text: 'A song is its own production unit — its own days, its own locations, '
          + 'often its own unit — and it is usually decided before a scene exists '
          + 'to hang it on. Plan it here, then link the scenes once they are '
          + 'written; the stripboard groups by song and the budget counts its days.'
    })
  );

  if (songs.length) {
    wrap.append(statStrip([
      { value: String(t.count), label: t.count === 1 ? 'song' : 'songs' },
      { value: String(t.days), label: t.days === 1 ? 'shoot day' : 'shoot days' },
      { value: String(t.linkedScenes), label: 'linked scenes' },
      { value: String(t.peakDancers || '—'), label: 'peak dancers' }
    ]));
    if (t.blocked) {
      wrap.append(h('p.bd-song-warn', {
        text: t.blocked + (t.blocked === 1 ? ' song has' : ' songs have')
          + ' shoot days planned with no recorded track. Those days cannot be shot.'
      }));
    }
    songs.forEach((sg, i) => wrap.append(renderSong(sg, i, songs.length, scenes)));
  } else {
    wrap.append(h('p.bd-none', {
      text: 'No songs yet. Most Tamil features carry four to six, and the count is '
          + 'part of what a producer is sold — so it is worth deciding early, even '
          + 'before the situations are written.'
    }));
  }

  wrap.append(button({ label: '+  Add song', action: 'song-add', class: 'bd-add' }));
  return wrap;
}

/* ---- element index ------------------------------------------
   The index is DERIVED (src/lib/element-index.js) from the tags on the
   scenes; nothing here is stored. Which category is filtered and which
   scenes are picked for a batch tag live in memory for this page view
   (EX, and SL.sel which the scene list already shares). Batch tagging
   writes through Scenes.tagMany(), the one writer, and Undo takes back
   exactly what it added through untagMany(). */
const EX = { cat: '', sheet: false };   // sheet: the phone's index sheet is open (memory only)
function renderElements() {
  const scenes = Scenes.listScenes();
  const totals = categoryTotals(scenes, ELEMENT_CATEGORIES);
  const grand = indexTotals(totals);
  const usedCats = totals.filter((c) => c.tags).length;
  const wrap = h('section.bd-elements.bdx', { id: 'elements' });
  wrap.append(h('h2.bd-h2', { text: 'Elements' }),
              h('p.bd-sub', { text: 'Derived from the tags above. Nothing here is typed twice.' }));
  if (!grand.tags) {
    wrap.append(h('p.bd-none', { text: 'No elements tagged yet. Tag one on any scene and it appears here, with every scene it touches.' }));
    return wrap;
  }
  if (EX.cat && !totals.some((c) => c.id === EX.cat && c.tags)) EX.cat = '';
  const rows = indexRows(scenes, ELEMENT_CATEGORIES, EX.cat);

  const side = h('aside.bdx-side' + (EX.sheet ? '.is-open' : ''), { 'aria-label': 'Element index', id: 'bdxSide', tabindex: '-1',
    ...(EX.sheet ? { role: 'dialog', 'aria-modal': 'true' } : {}) });
  const cats = h('ul.bdx-cats');
  cats.append(h('li', {}, [h('button.bdx-cat.bdx-cat-all', { type: 'button', 'data-action': 'ex-cat', 'data-cat': '', 'aria-pressed': String(!EX.cat) }, [
    h('span.bdx-cat-name', { text: 'All categories' }),
    h('span.bdx-cat-n', { text: String(grand.tags) })
  ])]));
  for (const c of totals) {
    cats.append(h('li', {}, [h(`button.bdx-cat.hue-${c.hue}`, {
      type: 'button', 'data-action': 'ex-cat', 'data-cat': c.id, 'aria-pressed': String(EX.cat === c.id),
      disabled: !c.tags,
      title: c.tags ? c.elements + (c.elements === 1 ? ' element, ' : ' elements, ') + c.tags + (c.tags === 1 ? ' tag' : ' tags') : 'Nothing tagged in this category'
    }, [
      h('span.bdx-cat-dot', { 'aria-hidden': 'true' }),
      h('span.bdx-cat-name', { text: c.label }),
      h('span.bdx-cat-n', { text: String(c.tags) })
    ])]));
  }
  side.append(
    h('div.bdx-side-head', {}, [
      h('div', {}, [
        h('h3.bdx-side-title', { text: 'Element index' }),
        h('p.bdx-side-meta', { text: usedCats + ' of ' + totals.length + ' categories · ' + grand.tags + (grand.tags === 1 ? ' tag' : ' tags') + ' · ' + grand.elements + (grand.elements === 1 ? ' element' : ' elements') })
      ]),
      button({ label: 'Close the element index', icon: 'close', iconOnly: true, variant: 'ghost', action: 'ex-sheet-close', class: 'bdx-side-close' })
    ]),
    cats,
    batchPanel(scenes),
    h('div.bdx-export', {}, [
      button({ label: 'Export CSV', icon: 'table_chart', action: 'ex-csv', block: true }),
      button({ label: 'Export PDF', icon: 'picture_as_pdf', action: 'ex-pdf', block: true })
    ])
  );

  /* The phone's way in to the same index: a scrolling row of the same
     category filters, and the button that raises the side panel (filter
     list, batch tag, export) as a sheet. Hidden from 720px up, where the
     panel sits beside the list. */
  const phoneBar = h('div.bdx-phone', {}, [
    button({ label: 'Index, batch tag and export', icon: 'tune', action: 'ex-sheet', class: 'bdx-sheet-open', attrs: { 'aria-controls': 'bdxSide', 'aria-expanded': String(EX.sheet) } }),
    h('div.bdx-pchips.k-chip-row', { role: 'group', 'aria-label': 'Filter by category' },
      [{ id: '', label: 'All', tags: grand.tags, hue: '' }].concat(totals.filter((c) => c.tags)).map((c) =>
        h('button.bdx-pchip' + (c.hue ? '.hue-' + c.hue : ''), { type: 'button', 'data-action': 'ex-cat', 'data-cat': c.id, 'aria-pressed': String(EX.cat === c.id) }, [
          h('span.bdx-pchip-name', { text: c.label }),
          h('span.bdx-pchip-n', { text: String(c.tags) })
        ])))
  ]);
  const list = h('div.bdx-list');
  list.append(phoneBar);
  list.append(h('p.bdx-list-meta', { role: 'status', text: rows.length + (rows.length === 1 ? ' element' : ' elements')
    + (EX.cat ? ' in ' + catById[EX.cat].label : '') }));
  const grid = h('div.bd-el-grid');
  for (const item of rows) {
    const cat = catById[item.category];
    const nums = item.scenes.map((s) => s.number);
    grid.append(h(`div.bd-el.hue-${cat.hue}`, {}, [
      h('span.bd-el-cat', { text: cat.label }),
      h('strong.bd-el-name', { text: item.name }),
      h('span.bd-el-scenes', {}, [
        h('span.bd-el-count', { text: nums.length + (nums.length === 1 ? ' scene' : ' scenes') }),
        ' · ' + (nums.length > 12 ? nums.slice(0, 12).join(', ') + ' +' + (nums.length - 12) : nums.join(', '))
      ])
    ]));
  }
  list.append(grid);
  wrap.append(h('div.bdx-layout' + (EX.sheet ? '.sheet-open' : ''), {}, [list, h('div.bdx-scrim', { 'data-action': 'ex-sheet-close', 'aria-hidden': 'true' }), side]));
  return wrap;
}

/* Batch tag: the picked scenes are SL.sel, the same selection the scene
   list's checkboxes use, so picking in either place is one act. */
function batchPanel(scenes) {
  const box = h('div.bdx-batch', { role: 'group', 'aria-label': 'Batch tag' });
  box.append(h('h4.bdx-batch-title', { text: 'Batch tag' }));
  const list = h('ul.bdx-batch-scenes');
  scenes.forEach((s, i) => list.append(h('li', {}, [h('label.bdx-batch-pick', {}, [
    h('input', { type: 'checkbox', 'data-action': 'ex-pick', 'data-scene-id': s.id, checked: SL.sel.has(s.id) }),
    h('span.bdx-batch-num', { text: s.number || String(i + 1) }),
    h('span.bdx-batch-slug', { text: s.location || 'Untitled scene' })
  ])])));
  box.append(
    h('div.bdx-batch-all', {}, [
      h('span.bdx-batch-n', { role: 'status', text: SL.sel.size + ' of ' + scenes.length + ' scenes selected' }),
      button({ label: 'All', size: 'sm', variant: 'ghost', action: 'ex-pick-all' }),
      button({ label: 'None', size: 'sm', variant: 'ghost', action: 'ex-pick-none' })
    ]),
    list,
    h('select.bd-sel.bdx-batch-cat', { 'aria-label': 'Category to tag', 'data-ex': 'cat' },
      ELEMENT_CATEGORIES.map((c) => h('option', { value: c.id, text: c.label }))),
    h('input.bdx-batch-name', { type: 'text', 'data-ex': 'name', placeholder: 'Element name', 'aria-label': 'Element name to tag', autocomplete: 'off', list: 'bdElementNames' }),
    button({ label: 'Tag selected scenes', variant: 'primary', action: 'ex-batch', block: true, disabled: !SL.sel.size })
  );
  return box;
}

/* ---- suggested from the script (PRD 2.0 FR-603) --------------
   The script's action lines and cues read for cast, props, vehicles,
   stunts and sound — see src/data/element-lexicon.json for what is
   looked for and why. A SUGGESTION IS NOT A TAG: each one is a button
   carrying the line it was read off, and nothing lands on a scene until
   somebody presses it. A breakdown is a 1st AD's judgement; this saves
   the typing, not the judgement. */
const SUGGEST_CATS = SUGGEST_CATEGORIES;
/* ADD ALL takes only the five tight categories (BULK_CATS in
   src/lib/breakdown-model.js); the looser ones are one chip at a time. */
function renderSuggestions(scenes) {
  const wrap = h('section.bd-suggest', { id: 'suggest' });
  wrap.append(h('h2.bd-h2', { text: 'Auto-Tag' }),
              h('p.bd-sub', { text: 'Read from each scene\u2019s cues and action lines, in the colour of its category. '
                + 'Press one to tag it; nothing is added until you do. Each scene is matched to the script heading that names the same place, so moving or deleting a scene here keeps its own text.' }));
  const report = scenes.length ? suggestReport(scenes, loadScript().elements) : { rows: [], match: null };
  const rows = report.rows;
  /* What the join could not pair is said, not guessed at: a scene with
     no heading gets no suggestions, and a heading with no scene is
     named so the writer can see which side is out of step. */
  const notes = describeMatch(report.match);
  if (notes.length) wrap.append(h('p.bd-match-note', { text: notes.join(' ') }));
  if (!rows.length) {
    wrap.append(h('p.bd-none', { text: scenes.length
      ? 'Nothing to suggest \u2014 either everything the script mentions is already tagged, or there is no script text yet. Write or import the script on the Write page.'
      : 'Import or write a script and the elements it mentions are offered here, scene by scene.' }));
    return wrap;
  }
  const count = (r) => SUGGEST_CATS.reduce((m, c) => m + r.suggestions[c].length, 0);
  const total = rows.reduce((n, r) => n + count(r), 0);
  const guessed = rows.filter((r) => !isConfident(r.how));
  wrap.append(h('div.bd-sug-tools', {}, [
    h('span.bd-sug-count', { text: `${total} suggestion${total === 1 ? '' : 's'} across ${rows.length} scene${rows.length === 1 ? '' : 's'}`
      + (guessed.length ? ` \u00b7 ADD ALL leaves out the ${guessed.length} paired by position only` : '') }),
    rows.length > guessed.length
      ? button({ label: 'ADD ALL', action: 'sug-all' })
      : null
  ]));
  const list = h('ol.bd-sug-list');
  for (const r of rows) {
    const li = h('li.bd-sug-scene', { 'data-scene': r.scene.id });
    li.append(h('div.bd-sug-head', {}, [
      h('strong', { text: `Scene ${r.scene.number || '\u2014'}` }),
      h('span.bd-sug-slug', { text: r.heading }),
      isConfident(r.how) ? null : h('span.bd-sug-guess', { text: 'paired by position, check the heading' }),
      button({ label: 'ADD THESE', size: 'sm', action: 'sug-scene', class: 'bd-sug-scene-all' })
    ]));
    const tags = h('div.bd-tags');
    for (const cat of SUGGEST_CATS) {
      const c = catById[cat];
      for (const sug of r.suggestions[cat]) {
        tags.append(elChip(c, '+ ' + sug.name, {
          tag: 'button', class: 'bd-sug',
          attrs: { type: 'button', 'data-action': 'sug-add', 'data-cat': cat, 'data-name': sug.name,
            title: 'From: ' + sug.from, 'aria-label': `Tag ${sug.name} as ${c.label} — from: ${sug.from}` }
        }));
      }
    }
    li.append(tags);
    list.append(li);
  }
  wrap.append(list);
  return wrap;
}

/* sceneIds null means ADD ALL, which acts ONLY on scenes matched to a
   heading by content: a position-only pair is shown, and can be added
   one scene at a time by somebody who has looked at it, but a bulk
   write onto a guess is how 221 tags once landed on the wrong scenes.
   applySuggestions() (src/lib/breakdown-model.js) returns exactly the
   tags written, so the toast's Undo removes those and nothing else. */

function toastTagged(added, where) {
  const n = added.length;
  if (!n) { StudioUI.toast('Nothing new to tag.'); return; }
  const scenesTouched = new Set(added.map((t) => t.sceneId)).size;
  StudioUI.toast(`Tagged ${n} element${n === 1 ? '' : 's'}${where ? ` across ${scenesTouched} scene${scenesTouched === 1 ? '' : 's'}` : ''}.`, {
    action: 'Undo',
    onAction: () => {
      const back = Scenes.untagMany(added);
      render();
      StudioUI.toast(`Removed the ${back} tag${back === 1 ? '' : 's'} just added.`);
    }
  });
}

/* ---- removed from the script: the bin -----------------------
   docs/BLUEPRINT-REALIGN-PLAN.md rev 3 §1d. A heading deleted from the
   script, or a scene deleted here, sends the scene and everything hung
   on it to the bin (src/lib/scene-bin.js). This lists the entries with
   what each holds; Restore puts it all back where it was, Delete for
   good and Empty bin ask first and name the counts. Nothing is purged
   on a timer. Rendered only when the bin holds something. */
function renderBin() {
  const entries = Bin.listBin();
  if (!entries.length) return null;
  const wrap = h('aside.bd-bin', { 'aria-label': 'Removed scenes' });
  wrap.append(
    h('h2.bd-h2', { text: `Removed from script (${entries.length})` }),
    h('p.bd-sub', { text: 'Scenes whose heading left the script, or that were deleted here, with their shots, frames, '
      + 'shoot day and call-sheet places. They are hidden from every page until you restore them or delete them for good.' })
  );
  const list = h('ul.bd-bin-list');
  for (const e of entries.slice().reverse()) {
    const row = e.scene.row;
    const bits = binEntryBits(Bin.entryCounts(e));
    const where = [row.intExt, row.location, row.dayNight].filter(Boolean).join(' · ');
    list.append(h('li.bd-bin-item', { 'data-bin': e.id }, [
      h('div.bd-bin-copy', {}, [
        h('strong', { text: `Scene ${row.number || '—'}` }),
        h('span.bd-bin-slug', { text: e.heading || where || 'No heading' }),
        h('span.bd-bin-meta', { text: bits.join(' · ') + (e.reason === 'hand' ? ' · deleted here' : ' · heading removed from the script') })
      ]),
      h('div.bd-bin-acts', {}, [
        button({ label: 'Restore', size: 'sm', action: 'bin-restore' }),
        button({ label: 'Delete for good', size: 'sm', variant: 'danger', action: 'bin-delete', class: 'bd-bin-del' })
      ])
    ]));
  }
  wrap.append(list);
  wrap.append(button({ label: 'Empty bin', action: 'bin-empty', class: 'bd-bin-empty' }));
  return wrap;
}

/* ---- render ------------------------------------------------- */
/* `focus` is a selector for the control to hand focus back to: a
   full render replaces the one the reader was using, and without it
   focus falls to <body> (UX audit M1; visualize.js's pattern). */
let STATUS = '';
function render(focus) {
  scriptDoc = null;   // the Script Breakdown tab re-reads the script on every render
  const scenes = Scenes.listScenes();
  const main = h('main', { id: 'main' });
  main.append(renderHeader(scenes));

  /* A NAV TARGET MUST NOT DEPEND ON DATA EXISTING.

     navigation.json sends the Breakdown phase to breakdown.html#scenes
     and #elements, and both ids used to live only on the populated
     branch. So on a studio with no scenes yet the fragment resolved to
     nothing and the browser stayed where it was — the phase menu
     looked broken to precisely the person who had never used the page.
     Measured before the fix: 6 of the 18 fragment hrefs in
     navigation.json were absent from the DOM, all 6 on the three
     scene-derived pages, in BOTH the no-project and the
     project-without-scenes states.

     Same shape as the hue-class trap and the skin-defaults trap: a
     thing the markup promises has to be there when the JS or the data
     has not arrived. So the ids move onto wrappers that always render,
     and the empty state lives inside the one it belongs to.
     renderElements() needed nothing — it already keeps its id and
     carries its own teaching copy when the index is empty. */
  const list = h('section.bd-list', { id: 'scenes' });
  /* #breakdown is Script Breakdowns' own target (Pre-Production), and
     #scenes the Scene List's (also Pre-Production): the same cards, read two
     ways — the list of scenes, and the tagging inside each one. A div,
     not a section, so tabs.js still sees one Scene List tab; and it
     ALWAYS renders, empty state included, for the reason above. */
  const tagging = h('div.bd-breakdown', { id: 'breakdown' });
  if (!scenes.length) {
    tagging.append(renderEmpty());
  } else {
    DUPS = dupNumbers(scenes);
    NUM_LOCK = readNumberLock();
    if (NUM_LOCK.locked) {
      tagging.append(h('p.bd-lock-note', {
        text: 'Scene numbers are locked in the Screenplay Writer: a scene inserted after 12 is 12A, and a cut scene keeps its number as OMITTED'
          + (NUM_LOCK.omitted.length ? ' (omitted: ' + NUM_LOCK.omitted.join(', ') + ')' : '')
          + '. Unlock them in Write’s Revisions to renumber.'
      }));
    }
    /* A scene the palette (or a link) points at opens itself. */
    const hashId = /^#scene-(.+)$/.exec(location.hash);
    if (hashId) SL.open.add(decodeURIComponent(hashId[1]));
    for (const id of [...SL.sel]) if (!scenes.some((s) => s.id === id)) SL.sel.delete(id);
    tagging.append(renderSceneBar(scenes));
    tagging.append(h('div.bd-sl-head', { 'aria-hidden': 'true' }, [
      h('span'), h('span'), h('span', { text: 'No.' }), h('span', { text: 'Location' }), h('span', { text: 'INT / EXT' }), h('span', { text: 'Time' }),
      h('span', { text: 'Length' }), h('span', { text: 'Cast' }), h('span', { text: 'Status' }), h('span')
    ]));
    scenes.forEach((s, i) => tagging.append(renderScene(s, i, scenes.length)));
    tagging.append(h('p.bd-sl-none', { hidden: true, text: 'No scene matches. Clear the search or a filter above.' }));
    tagging.append(button({ label: '+  Add scene', action: 'scene-add', class: 'bd-add' }));
  }
  list.append(tagging);
  // The bin, inside the Scenes tab, only when it holds something.
  const bin = renderBin();
  if (bin) list.append(bin);
  /* renderSongs() is OUTSIDE the branch for the same reason the #scenes
     id moved onto an always-rendering wrapper: navigation.json sends
     the Breakdown phase to breakdown.html#songs, so that id has to
     exist before any data does. It wants to be unconditional anyway —
     a song list is decided before the scenes are, so hiding it until a
     scene exists would hide it at exactly the moment it is most
     useful. The branch-local version this replaces called it twice. */
  main.append(renderScriptOverview(scenes), renderOverview(scenes, STATUS), list, renderSuggestions(scenes), renderSongs(scenes), renderElements());

  app.replaceChildren(main);
  applySceneFilter();
  hydrateScriptParts(wireScriptParts);
  if (focus) {
    const node = document.querySelector(focus);
    if (node) node.focus();
  }
  mountStageGuide(document.getElementById('main'), { stage: 'preprod' });   // the blueprint's questions for this stage
  mountShell();
  /* Learn-in-place slots for the craft ideas this page uses (src/data/learn.json).
     mountLearn() fills them; an unknown id leaves the slot empty. */
  const learnSlots = (ids) => ids.map((id) => h('div.bdo-learn', { 'data-learn': id }));
  const scenesBox = main.querySelector('#scenes');
  if (scenesBox) scenesBox.prepend(...learnSlots(['page-eighths', 'scene-number']));
  const elementsBox = main.querySelector('#elements .bd-sub');
  if (elementsBox) elementsBox.after(...learnSlots(['breakdown-categories', 'props-dressing', 'sfx-vfx']));
  mountLearn(main);
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[breakdown] chrome', e); }
}
const inScene = (id, sel) => '[data-scene="' + CSS.escape(id || '') + '"] ' + sel;

/* ---- events — delegated, no inline handlers ----------------- */
const sceneIdOf = (el) => el.closest('[data-scene]')?.dataset.scene;

function addSceneAndFocus() {
  const made = Scenes.addScene();
  SL.q = ''; SL.ie = ''; SL.dn = ''; SL.st = '';   // the new row must be visible
  if (made) SL.open.add(made.id);
  render();
  const last = made && document.querySelector(inScene(made.id, '.bd-slug'));
  if (last) last.focus();
}
delegate(document, 'click', '[data-action="scene-add"]', addSceneAndFocus);
/* ---- the list's own controls (nothing here is stored) ---- */
delegate(document, 'click', '[data-action="sl-toggle"]', (e, el) => {
  const id = sceneIdOf(el);
  if (SL.open.has(id)) SL.open.delete(id); else SL.open.add(id);
  render(inScene(id, '[data-action="sl-toggle"]'));
});
delegate(document, 'click', '[data-action="sl-expand"]', () => {
  if (SL.open.size) SL.open.clear(); else Scenes.listScenes().forEach((s) => SL.open.add(s.id));
  render('[data-action="sl-expand"]');
});
delegate(document, 'change', '[data-action="sl-pick"]', (e, el) => {
  const id = sceneIdOf(el);
  if (el.checked) SL.sel.add(id); else SL.sel.delete(id);
  const bulk = document.querySelector('.bd-sl-bulk');
  if (bulk) { bulk.hidden = !SL.sel.size; const n = bulk.querySelector('.bd-sl-bulk-n'); if (n) n.textContent = SL.sel.size + ' selected'; }
});
delegate(document, 'click', '[data-action="sl-clear"]', () => { SL.sel.clear(); render(); });
delegate(document, 'click', '[data-action="sl-preset"]', (e, el) => {
  const p = SL.presets.find((x) => x.id === el.closest('[data-preset]')?.dataset.preset);
  if (!p) return;
  /* Pressing the active preset again clears the filter it set. */
  const was = filterActive() && presetOn(p);
  for (const k of PRESET_KEYS) SL[k] = was ? '' : (p[k] || '');
  syncBar();
  applySceneFilter();
});
delegate(document, 'click', '[data-action="sl-preset-x"]', (e, el) => {
  const id = el.closest('[data-preset]')?.dataset.preset;
  const p = SL.presets.find((x) => x.id === id);
  if (!p) return;
  SL.presets = SL.presets.filter((x) => x.id !== id);
  refreshPresets();
  document.querySelector('[data-action="sl-save"]:not([disabled]), .bd-sl-search')?.focus();
  StudioUI.toast('Removed the saved filter \u201C' + p.name + '\u201D.', { type: 'success' });
});
delegate(document, 'click', '[data-action="sl-save"]', async () => {
  if (!filterActive()) return;
  const snap = Object.fromEntries(PRESET_KEYS.map((k) => [k, SL[k]]));
  const name = await askText({
    title: 'Save this filter',
    body: 'Showing: ' + describeFilter(snap) + '. Give it a name. Saved filters stay until you reload this page.',
    value: describeFilter(snap), confirm: 'SAVE'
  });
  if (!name) return;
  const clash = SL.presets.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (clash) Object.assign(clash, snap);
  else SL.presets.push({ id: 'p-' + (++SL.presetSeq), name, ...snap });
  refreshPresets();
  document.querySelector('.bd-sl-presets [data-action="sl-save"]')?.focus();
  StudioUI.toast('Saved the filter \u201C' + name + '\u201D. It stays until you reload this page.', { type: 'success' });
});
delegate(document, 'input', '[data-action-key="sl-find"]', (e, el) => { SL.q = el.value; applySceneFilter(); });
delegate(document, 'change', '[data-sl-filter]', (e, el) => { SL[el.dataset.slFilter] = el.value; applySceneFilter(); });
delegate(document, 'change', '[data-sl-bulk]', (e, el) => {
  if (!el.value || !SL.sel.size) return;
  const key = el.dataset.slBulk, n = SL.sel.size;
  for (const id of SL.sel) Scenes.updateScene(id, { [key]: el.value });
  render();
  StudioUI.toast(n + (n === 1 ? ' scene' : ' scenes') + ' set to ' + el.value + '.', { type: 'success' });
});
delegate(document, 'click', '[data-action="sl-bulk-bin"]', () => {
  const ids = [...SL.sel];
  if (!ids.length) return;
  const gone = binScenes(ids);
  SL.sel.clear();
  render();
  undoBin(gone, ids.length + (ids.length === 1 ? ' scene' : ' scenes') + ' moved to the bin.');
});
/** Move scenes to the bin and return the bin entries that now hold them. */
function binScenes(ids) {
  const before = new Set(Bin.listBin().map((x) => x.id));
  for (const id of ids) { Scenes.removeScene(id); SL.open.delete(id); SL.sel.delete(id); }
  return Bin.listBin().filter((x) => !before.has(x.id)).map((x) => x.id);
}
/** A delete is undone, not confirmed: the bin keeps everything attached, so
 *  the toast offers the way back instead of asking first. */
function undoBin(entryIds, message) {
  StudioUI.toast(message, {
    type: 'success', action: 'UNDO',
    onAction: () => { Bin.restoreMany(entryIds); render(); }
  });
}
/* The moved scene keeps focus on the same arrow, or on the other one
   when that arrow is now disabled at the end of the list. */
function moveAndFocus(el, dir) {
  const id = sceneIdOf(el);
  Scenes.moveScene(id, dir);
  const act = dir < 0 ? 'scene-up' : 'scene-down';
  render(inScene(id, '[data-action="' + act + '"]'));
  const btn = document.querySelector(inScene(id, '[data-action="' + act + '"]'));
  if (btn && btn.disabled) document.querySelector(inScene(id, '[data-action="' + (dir < 0 ? 'scene-down' : 'scene-up') + '"]'))?.focus();
}
delegate(document, 'click', '[data-action="scene-up"]',   (e, el) => moveAndFocus(el, -1));
delegate(document, 'click', '[data-action="scene-down"]', (e, el) => moveAndFocus(el,  1));
delegate(document, 'click', '[data-action="scene-del"]',  (e, el) => binOne(sceneIdOf(el)));
function binOne(id) {
  const scene = Scenes.listScenes().find((x) => x.id === id);
  const label = scene && (scene.number || scene.location) ? ' ' + (scene.number || scene.location).toString().slice(0, 30) : '';
  // removeScene() goes through the bin (src/lib/scene-bin.js), so the
  // scene's shots, frames, call-sheet places and edit notes go with it
  // and come back with it — which is why this offers UNDO, not a prompt.
  const gone = binScenes([id]);
  render();
  undoBin(gone, 'Scene' + label + ' moved to the bin — its shots, frames and call-sheet places went with it.');
}

/* ---- keyboard flow (1.5) --------------------------------------
   Up / Down walk the rows (from the open-close button or the location,
   the two controls whose arrow keys mean nothing else — a select or a
   number box uses them to change its value, so they are left alone);
   Enter on the toggle is the button's own click; N adds a scene; Delete
   bins the focused row with the same UNDO toast the button gives. Nothing
   here fires while a field, a select or a dialog has the keyboard. */
const typing = (el) => !!el && !!el.closest && !!el.closest('textarea, select, [contenteditable=""], [contenteditable="true"], input:not([type="checkbox"]):not([type="radio"]):not([type="button"])');
const visibleRows = () => [...document.querySelectorAll('.bd-sl[data-scene]')].filter((r) => !r.hidden);
function neighbourRowId(row) {
  const rows = visibleRows(), i = rows.indexOf(row);
  const n = rows[i + 1] || rows[i - 1];
  return n ? n.dataset.scene : null;
}
document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (!t || !t.closest || t.closest('dialog, [role="dialog"], [aria-modal="true"], .modal-overlay')) return;
  const row = t.closest('.bd-sl[data-scene]');

  if (row && !e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    const kind = t.matches('.bd-sl-toggle') ? '.bd-sl-toggle' : t.matches('.bd-slug') ? '.bd-slug' : '';
    if (!kind) return;
    const rows = visibleRows();
    const next = rows[rows.indexOf(row) + (e.key === 'ArrowUp' ? -1 : 1)];
    e.preventDefault();
    if (next) next.querySelector(kind)?.focus();
    return;
  }
  if (row && e.key === 'Delete' && !e.shiftKey && !typing(t)) {
    e.preventDefault();
    const id = row.dataset.scene, near = neighbourRowId(row);
    binOne(id);
    const n = near && document.querySelector(inScene(near, '.bd-sl-toggle'));
    if (n) n.focus();
    return;
  }
  if (e.key === 'n' && !e.shiftKey && !typing(t)) {
    const sec = document.getElementById('scenes');
    if (!sec || !sec.offsetParent) return;                       // another tab, or no page
    if (t !== document.body && !sec.contains(t)) return;         // keep clear of the rest of the page
    e.preventDefault();
    addSceneAndFocus();
  }
});

/* ---- drag to reorder (2.1) -------------------------------------
   Pointer events, the stripboard's pattern, so a thumb can do it. Nothing
   moves in the DOM until the drop: a line shows where the scene would
   land, the row dims, a tag follows the pointer, Esc or a pointercancel
   puts everything back and writes nothing. The drop is ONE write
   (Scenes.reorderScene). The handle is inert while a search or filter is
   active — the rows on screen are then not the list, and a position among
   them would not mean a position in it. Up / Down on the focused handle is
   the keyboard route, and the open row keeps its arrow buttons. */
const RD = { p: null, active: false, line: null, tag: null, at: null };
const RD_START_PX = 6;
function sayLive(text) {
  let el = document.getElementById('bdSlLive');
  if (!el) {
    el = h('div#bdSlLive.visually-hidden', { role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 40);
}
const sceneLabel = (id) => {
  const s = Scenes.listScenes().find((x) => x.id === id);
  return 'Scene ' + ((s && (s.number || s.location)) || '');
};
delegate(document, 'pointerdown', '.bd-sl-grip', (e, grip) => {
  if (e.button !== 0) return;
  if (filterActive()) { sayLive('Reordering is off while a search or filter is active. Clear it to drag scenes.'); return; }
  const row = grip.closest('.bd-sl');
  RD.p = { grip, row, id: row.dataset.scene, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  try { grip.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
});
function beginRowDrag(e) {
  const p = RD.p;
  RD.active = true;
  p.row.classList.add('is-dragging');
  document.body.classList.add('bd-sl-is-dragging');
  RD.line = h('div.bd-sl-drop', { 'aria-hidden': 'true' });
  RD.tag = h('div.bd-sl-drag-tag', { 'aria-hidden': 'true', text: sceneLabel(p.id) });
  document.body.append(RD.tag);
  sayLive('Dragging ' + sceneLabel(p.id).toLowerCase() + '. Release where it should go, or press Escape to cancel.');
  updateRowDrag(e);
}
function updateRowDrag(e) {
  const p = RD.p;
  RD.tag.style.left = e.clientX + 'px';
  RD.tag.style.top = e.clientY + 'px';
  const edge = 72, vh = window.innerHeight;
  if (e.clientY < edge) window.scrollBy(0, -Math.ceil((edge - e.clientY) / 4));
  else if (e.clientY > vh - edge) window.scrollBy(0, Math.ceil((e.clientY - (vh - edge)) / 4));

  const rows = visibleRows().filter((r) => r !== p.row);
  RD.line.remove();
  RD.at = null;
  if (!rows.length) return;
  const first = rows[0].getBoundingClientRect(), last = rows[rows.length - 1].getBoundingClientRect();
  if (e.clientY < first.top - 80 || e.clientY > last.bottom + 80) return;   // pointer is nowhere near the list
  /* The row's own line is its midpoint, so a tall open row is judged by
     its top line and a pointer in its detail lands AFTER it. */
  let anchor = null, before = false;
  for (const r of rows) {
    const rect = r.getBoundingClientRect();
    const main = r.querySelector('.bd-sl-main');
    const lineH = Math.min(rect.height, main ? main.getBoundingClientRect().height : rect.height);
    if (e.clientY < rect.top + lineH / 2) { anchor = r; before = true; break; }
  }
  if (!anchor) { anchor = rows[rows.length - 1]; before = false; }
  if (before) anchor.before(RD.line); else anchor.after(RD.line);
  const ids = rows.map((r) => r.dataset.scene);
  const index = ids.indexOf(anchor.dataset.scene) + (before ? 0 : 1);
  const from = visibleRows().indexOf(p.row);
  if (index === from) { RD.line.remove(); return; }   // its own place: nothing to write
  RD.at = { index };
}
function endRowDrag({ drop }) {
  const p = RD.p;
  if (!p) return;
  const at = drop ? RD.at : null;
  const wasActive = RD.active;
  if (wasActive) {
    try { p.grip.releasePointerCapture(p.pointerId); } catch (err) { /* already released */ }
    p.row.classList.remove('is-dragging');
    document.body.classList.remove('bd-sl-is-dragging');
    if (RD.line) RD.line.remove();
    if (RD.tag) RD.tag.remove();
  }
  RD.p = null; RD.active = false; RD.at = null; RD.line = null; RD.tag = null;
  if (!wasActive) return;
  if (!at) { sayLive('Drag cancelled. Nothing moved.'); return; }
  const all = Scenes.listScenes();
  Scenes.reorderScene(p.id, at.index);
  render(inScene(p.id, '.bd-sl-grip'));
  sayLive(sceneLabel(p.id) + ' moved to position ' + (at.index + 1) + ' of ' + all.length + '.');
}
document.addEventListener('pointermove', (e) => {
  const p = RD.p;
  if (!p || e.pointerId !== p.pointerId) return;
  if (!RD.active) {
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < RD_START_PX) return;
    beginRowDrag(e);
    return;
  }
  e.preventDefault();
  updateRowDrag(e);
});
document.addEventListener('pointerup', (e) => { if (RD.p && e.pointerId === RD.p.pointerId) endRowDrag({ drop: true }); });
document.addEventListener('pointercancel', (e) => { if (RD.p && e.pointerId === RD.p.pointerId) endRowDrag({ drop: false }); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && RD.active) { e.preventDefault(); endRowDrag({ drop: false }); }
});
/* A long press on a touch handle must not open the context menu. */
document.addEventListener('contextmenu', (e) => {
  if (RD.p && e.target.closest && e.target.closest('.bd-sl-grip')) e.preventDefault();
});
/* The keyboard route: Up / Down on the handle moves the scene one place. */
delegate(document, 'keydown', '.bd-sl-grip', (e, grip) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  if (filterActive()) { sayLive('Reordering is off while a search or filter is active. Clear it first.'); return; }
  const id = sceneIdOf(grip);
  const list = Scenes.listScenes();
  const i = list.findIndex((x) => x.id === id), j = i + (e.key === 'ArrowUp' ? -1 : 1);
  if (i < 0 || j < 0 || j >= list.length) { sayLive(sceneLabel(id) + ' is already ' + (j < 0 ? 'first' : 'last') + '.'); return; }
  Scenes.reorderScene(id, j);
  render(inScene(id, '.bd-sl-grip'));
  sayLive(sceneLabel(id) + ' moved to position ' + (j + 1) + ' of ' + list.length + '.');
});

/* ---- the bin ------------------------------------------------- */
const binIdOf = (el) => el.closest('[data-bin]')?.dataset.bin;
delegate(document, 'click', '[data-action="bin-restore"]', (e, el) => {
  const id = binIdOf(el);
  const entry = Bin.listBin().find((x) => x.id === id);
  if (!entry) return;
  const linked = entry.scene.row.scriptElId;
  const row = Bin.restoreFromBin(id, linked && !headingInScript(linked) ? { patch: { scriptElId: '' } } : {});
  render();
  if (row) StudioUI.toast(`Scene ${row.number || ''} is back, with everything that was attached to it.`, { type: 'success' });
});
delegate(document, 'click', '[data-action="bin-delete"]', async (e, el) => {
  const id = binIdOf(el);
  const entry = Bin.listBin().find((x) => x.id === id);
  if (!entry) return;
  if (!await askDanger(`Delete for good — ${Bin.describeEntry(entry)}?\n\nThis cannot be undone.`)) return;
  Bin.deleteBinEntry(id);
  render();
});
delegate(document, 'click', '[data-action="bin-empty"]', async () => {
  const t = Bin.binTotals();
  if (!t.scenes) return;
  const bits = binTotalsBits(t);
  if (!await askDanger(`Empty the bin? ${bits.join(', ')} will be deleted for good.\n\nThis cannot be undone.`)) return;
  Bin.emptyBin();
  render();
});
delegate(document, 'click', '[data-action="sug-add"]', (e, el) => {
  Scenes.tagElement(sceneIdOf(el), el.dataset.cat, el.dataset.name);
  render();
});
delegate(document, 'click', '[data-action="sug-scene"]', (e, el) => {
  const added = applySuggestions([sceneIdOf(el)]);
  render();
  toastTagged(added, false);
});
delegate(document, 'click', '[data-action="eighths-measure"]', () => {
  const changes = measureEighths(loadScript().elements, Scenes.listScenes());
  if (!changes.length) { StudioUI.toast('Every matched scene\u2019s length already agrees with the script.'); return; }
  const to = new Map(changes.map((c) => [c.sceneId, c.to]));
  const from = new Map(changes.map((c) => [c.sceneId, c.from]));
  const set = (m) => Scenes.saveScenes(Scenes.listScenes().map((s) => (m.has(s.id) ? { ...s, eighths: m.get(s.id) } : s)));
  set(to);
  render();
  StudioUI.toast(`Re-measured ${changes.length} scene${changes.length === 1 ? '' : 's'} from the script.`, {
    action: 'Undo',
    onAction: () => { set(from); render(); StudioUI.toast('Put the earlier lengths back.'); }
  });
});
delegate(document, 'click', '[data-action="sug-all"]', () => {
  const added = applySuggestions(null);
  render();
  toastTagged(added, true);
});
/* ---- element index: filter, batch tag, export ---------------- */
delegate(document, 'click', '[data-action="ex-cat"]', (e, el) => {
  EX.cat = el.dataset.cat || '';
  /* The same filter exists twice — the phone's chip row (first in the
     DOM) and the side panel — so focus goes back to the copy that was
     pressed, or a desktop click lands on a hidden chip (body) and a
     click in the open sheet leaves the sheet. */
  const scope = el.closest('.bdx-side') ? '#bdxSide ' : '.bdx-pchips ';
  render(scope + '[data-action="ex-cat"][data-cat="' + CSS.escape(EX.cat) + '"]');
});
/* The sheet is the same panel, so it opens and closes in place (no
   re-render, so a half-typed element name survives) and the state is
   remembered only so a re-render keeps it. Escape closes; focus goes to
   the panel on open and back to the button on close. */
function exSheet(open) {
  EX.sheet = open;
  document.querySelector('.bdx-layout')?.classList.toggle('sheet-open', open);
  const side = document.getElementById('bdxSide');
  if (side) {
    side.classList.toggle('is-open', open);
    if (open) { side.setAttribute('role', 'dialog'); side.setAttribute('aria-modal', 'true'); } else { side.removeAttribute('role'); side.removeAttribute('aria-modal'); }
  }
  document.documentElement.classList.toggle('bdx-locked', open);
  const btn = document.querySelector('.bdx-sheet-open');
  if (btn) btn.setAttribute('aria-expanded', String(open));
  if (open) side?.focus({ preventScroll: true }); else btn?.focus({ preventScroll: true });
}
delegate(document, 'click', '[data-action="ex-sheet"]', () => exSheet(true));
delegate(document, 'click', '[data-action="ex-sheet-close"]', () => exSheet(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && EX.sheet) exSheet(false); });
/* Leaving the Elements tab closes it. The sheet lives INSIDE that tab's
   panel, so a tab switch (a hash change — Back, a crumb, the strip)
   hid the sheet while `bdx-locked` stayed on <html>: overflow hidden on
   a page with nothing open, and a phone that could no longer be scrolled
   by hand (prove:scroll, 19 Oct 2026). Next tick, so tabs.js has shown
   the new panel before the sheet is asked whether it can still be seen. */
window.addEventListener('hashchange', () => setTimeout(() => {
  if (!EX.sheet) return;
  const side = document.getElementById('bdxSide');
  if (!side || !side.getClientRects().length || side.closest('[hidden]')) exSheet(false);
}, 0));
/* Widening past the phone closes it: the panel is a column again. */
matchMedia('(max-width: 720px)').addEventListener('change', (m) => { if (!m.matches && EX.sheet) exSheet(false); });
const exSync = () => {
  const n = SL.sel.size;
  const tot = document.querySelectorAll('.bdx-batch-scenes input').length;
  const status = document.querySelector('.bdx-batch-n');
  if (status) status.textContent = n + ' of ' + tot + ' scenes selected';
  const go = document.querySelector('[data-action="ex-batch"]');
  if (go) go.disabled = !n;
  const bulk = document.querySelector('.bd-sl-bulk');
  if (bulk) { bulk.hidden = !n; const c = bulk.querySelector('.bd-sl-bulk-n'); if (c) c.textContent = n + ' selected'; }
};
delegate(document, 'change', '[data-action="ex-pick"]', (e, el) => {
  if (el.checked) SL.sel.add(el.dataset.sceneId); else SL.sel.delete(el.dataset.sceneId);
  exSync();
});
const exPickAll = (on) => {
  document.querySelectorAll('.bdx-batch-scenes input').forEach((i) => {
    i.checked = on;
    if (on) SL.sel.add(i.dataset.sceneId); else SL.sel.delete(i.dataset.sceneId);
  });
  exSync();
};
delegate(document, 'click', '[data-action="ex-pick-all"]', () => exPickAll(true));
delegate(document, 'click', '[data-action="ex-pick-none"]', () => exPickAll(false));
delegate(document, 'click', '[data-action="ex-batch"]', () => {
  const cat = document.querySelector('[data-ex="cat"]')?.value;
  const nameEl = document.querySelector('[data-ex="name"]');
  const name = (nameEl?.value || '').trim();
  if (!name) { StudioUI.toast('Type the element’s name first.', { type: 'error' }); nameEl?.focus(); return; }
  const plan = planBatch(Scenes.listScenes(), [...SL.sel], cat, name);
  if (!plan.tags.length) {
    StudioUI.toast('Every selected scene already carries “' + name + '”.', { type: 'info' });
    return;
  }
  const added = Scenes.tagMany(plan.tags);
  render('[data-action="ex-batch"]');
  StudioUI.toast('Tagged “' + name + '” (' + catById[cat].label + ') on ' + added.length + (added.length === 1 ? ' scene' : ' scenes')
    + (plan.already ? '; ' + plan.already + ' already had it' : '') + '.', {
    type: 'success', action: 'Undo',
    onAction: () => { Scenes.untagMany(added); render(); }
  });
});
delegate(document, 'click', '[data-action="ex-csv"]', () => {
  const rows = indexRows(Scenes.listScenes(), ELEMENT_CATEGORIES, EX.cat);
  if (!rows.length) { StudioUI.toast('Nothing to export yet.', { type: 'info' }); return; }
  saveFile(fileSlug() + '-element-index.csv', '﻿' + elementsCSV(rows), 'text/csv;charset=utf-8');
});
delegate(document, 'click', '[data-action="ex-pdf"]', () => {
  if (!Scenes.elementIndex().length) { StudioUI.toast('Nothing to export yet.', { type: 'info' }); return; }
  exportPDF({ scope: 'elements', setup: 'a4', label: 'Element index' });
});
delegate(document, 'click', '[data-action="el-remove"]', (e, el) => {
  Scenes.untagElement(sceneIdOf(el), el.dataset.cat, el.dataset.name);
  render();
});

// Field edits RE-RENDER on change rather than per keystroke — a render
// on every character would steal the caret. But they SAVE as they are
// typed: on `change` alone, a reload or a closed tab took everything
// since the field was entered (UX audit H10). saveOnInput() debounces
// the store write and flushes it on pagehide / hidden.
import { saveOnInput } from '../lib/autosave.js';
import { ask, askDanger, askText } from '../ui/dialog.js';
const sceneValue = (el) => sceneFieldValue(el.dataset.sceneField, el.value);
/* A number is a string that is not empty: an empty one is never saved
   (a field mid-edit), and on `change` the field is put back to what is
   stored. A duplicate IS saved, and flagged. */
saveOnInput('[data-scene-field]', (el) => {
  const key = el.dataset.sceneField;
  const value = sceneValue(el);
  if (key === 'number' && !value) return;
  Scenes.updateScene(sceneIdOf(el), { [key]: value });
  if (key === 'number') refreshNumberMarks();
});
delegate(document, 'change', '[data-scene-field]', (e, el) => {
  const key = el.dataset.sceneField;
  const id = sceneIdOf(el);
  if (key === 'number') {
    const value = sceneValue(el);
    if (!value) {
      const stored = Scenes.listScenes().find((s) => s.id === id);
      el.value = stored ? stored.number : '';
      StudioUI.toast('A scene needs a number — the one it had is back.');
      return;
    }
    el.value = value;
    Scenes.updateScene(id, { number: value });
    refreshNumberMarks();
    return;
  }
  Scenes.updateScene(id, { [key]: sceneValue(el) });
  /* Eighths change the card's page figure and the header's totals,
     and nothing else on the page. `change` fires as focus LEAVES the
     field, usually on Tab, so a full render here threw away the field
     the reader was tabbing into (UX audit M1). Patch the two in place. */
  /* The location count in the header and the song cards' scene lists
     read these two as well, so they are patched on the same terms. */
  if (key === 'eighths' || key === 'location' || key === 'songId') {
    const scenes = Scenes.listScenes();
    const scene = scenes.find((s) => s.id === id);
    const pages = document.querySelector(inScene(id, '.bd-pages'));
    if (scene && pages) pages.textContent = formatEighths(scene.eighths);
    const head = document.querySelector('#main > header.bd-head');
    if (head) head.replaceWith(renderHeader(scenes));
    else render();
    // The song cards sum their scenes' pages; keep the tab's state.
    const songs = document.getElementById('songs');
    if (songs) {
      const next = renderSongs(scenes);
      ['hidden', 'role', 'aria-labelledby', 'tabindex'].forEach((a) => {
        if (songs.hasAttribute(a)) next.setAttribute(a, songs.getAttribute(a));
      });
      songs.replaceWith(next);
    }
  }
});
function attachElement(el) {
  const adder = el.closest('.bd-add-el');
  const name = adder.querySelector('.bd-add-name');
  if (!name.value.trim()) return;
  const id = sceneIdOf(el);
  Scenes.tagElement(id, adder.querySelector('.bd-add-cat').value, name.value);
  // Back into the same scene's field, for the next element.
  render(inScene(id, '[data-action-key="el-add"]'));
}
delegate(document, 'keydown', '[data-action-key="el-add"]', (e, el) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  attachElement(el);
});
delegate(document, 'click', '[data-action="el-attach"]', (e, el) => attachElement(el));

/* ---- songs — events ----------------------------------------- */
const songIdOf = (el) => el.closest('[data-song]')?.dataset.song;

delegate(document, 'click', '[data-action="song-add"]', () => {
  Songs.addSong();
  render();
  const last = document.querySelector('.bd-song:last-of-type .bd-song-title');
  if (last) last.focus();
});
delegate(document, 'click', '[data-action="song-up"]',   (e, el) => { Songs.moveSong(songIdOf(el), -1); render(); });
delegate(document, 'click', '[data-action="song-down"]', (e, el) => { Songs.moveSong(songIdOf(el),  1); render(); });

/* Deleting a song UNLINKS its scenes rather than deleting them. A
   song row is a plan; the scenes are pages someone wrote. One button
   must never take both, and the confirm says which it takes. */
delegate(document, 'click', '[data-action="song-del"]', async (e, el) => {
  const id = songIdOf(el);
  const song = Songs.listSongs().find((s) => s.id === id);
  if (!song) return;
  const linked = Songs.scenesFor(id);
  const label = song.title ? ` "${song.title.slice(0, 40)}"` : '';
  const note = linked.length
    ? `\n\n${linked.length} scene${linked.length === 1 ? '' : 's'} will be unlinked. `
      + 'The scenes themselves are kept.'
    : '';
  if (!await askDanger(`Delete song${label}?${note}`)) return;
  linked.forEach((sc) => Scenes.updateScene(sc.id, { songId: '' }));
  Songs.removeSong(id);
  render();
});

const songValue = (el) => songFieldValue(el.dataset.songField, el.value);
// Saved as typed, re-rendered on change — as the scene fields above.
saveOnInput('[data-song-field]', (el) => {
  Songs.updateSong(songIdOf(el), { [el.dataset.songField]: songValue(el) });
});
delegate(document, 'change', '[data-song-field]', (e, el) => {
  const id = songIdOf(el);
  const key = el.dataset.songField;
  Songs.updateSong(id, { [key]: songValue(el) });
  // These three change what the card reports about itself — the day
  // disagreement, the playback block, the header totals.
  if (key === 'days' || key === 'dancers' || key === 'playback') render();
});

/* ---- the whole-script breakdown ------------------------------ */
function toastRun(res) {
  const a = res.applied;
  const said = runSaid(res);
  if (a.castTagged) {
    StudioUI.toast(said, {
      action: 'Undo cast tagging',
      onAction: () => {
        const back = a.undo();
        STATUS = 'Removed the ' + back + ' cast tag' + (back === 1 ? '' : 's') + ' just added.';
        render();
        StudioUI.toast(STATUS);
      }
    });
  } else StudioUI.toast(said);
}
/* Manual breakdown and Breakdown with AI share one chain
   (src/ui/breakdown-flow.js): the run (this toast), then shots and story
   as reviews in the Desk. The module loads at the click, so first paint
   carries none of it. `tab` is where the page repaints afterwards. */
const flowHooks = (tab) => ({
  onRun: (res) => {
    if (!res) return;
    flushStorage().catch(() => {});
    scriptDoc = null;
    STATUS = runSaid(res);
    render(tab);
  },
  /* the run's toast waits for the reviews to end: on a phone it sat
     over the existing-shots question and the Desk's sheet */
  announce: (res) => { if (res) toastRun(res); },
  refresh: () => { scriptDoc = null; render(tab); }
});
setFlowHooks(flowHooks);
async function manualFlow(tab) {
  try { await (await import('../ui/breakdown-flow.js')).manualBreakdown(flowHooks(tab)); }
  catch (e) { console.warn('[breakdown] manual', e); StudioUI.toast('The breakdown could not run on this script.', { type: 'error' }); }
}
delegate(document, 'click', '[data-action=run-breakdown]', () => manualFlow('#overview'));
delegate(document, 'click', '[data-action=sum-view]', (e, btn) => {
  setView(btn.dataset.view);
  render('#' + btn.id);
});
delegate(document, 'change', 'input[data-action=bd-upload]', async (e, input) => {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (!PlanGate.guard('script_import')) return;
  let Parser;
  try { Parser = await import('../lib/script-import.js'); }
  catch (err) { sayStatus('The script reader could not be loaded. Check the connection and try again.'); return; }
  let plan;
  try {
    const text = await Parser.readFile(file);
    if (!String(text || '').trim()) { sayStatus('That file was empty.'); return; }
    plan = Parser.parseScript(text, file.name);
  } catch (err) { sayStatus((err && err.message) || 'That file could not be read as a screenplay.'); return; }
  if (plan.fatal || !plan.elements.length) {
    sayStatus((plan.warnings && plan.warnings[0]) || 'Nothing in that file looked like a screenplay.');
    return;
  }
  const have = loadScript().elements.length;
  const scenesHave = Scenes.listScenes().length;
  if ((have || scenesHave) && !await askDanger('Replace the script' + (scenesHave ? ' and the ' + scenesHave + ' scenes' : '') + ' with this file?\n\n'
    + (have ? 'A revision of the current script is kept first. ' : '')
    + (scenesHave ? 'The old scenes go to the bin, with everything attached, and can be restored.' : ''))) return;
  commitImportedScript(plan, { mode: 'replace', importName: file.name });
  let res;
  try { res = runBreakdown(); } catch (err) { console.warn('[breakdown] run', err); StudioUI.toast('The script was imported, but the breakdown could not run.', { type: 'error' }); render(); return; }
  await flushStorage().catch(() => {});
  STATUS = runSaid(res);
  toastRun(res);
  render('#overview');
});

/* The Script Breakdown tab hosts the beat board and the characters
   panel (moved from write.html). Both edit the script through this
   page's own doc and save path; a script doc is read fresh per action. */
let scriptDoc = null;
const getScriptDoc = () => (scriptDoc || (scriptDoc = loadScript()));
function wireScriptParts(bb, ch) {
  ch.wireCharacters({
    getDoc: getScriptDoc,
    scriptChanged: () => { try { saveScript(getScriptDoc()); } catch (e) { console.warn('[breakdown] save script', e); } }
  });
  bb.wireBeatBoard({
    getDoc: getScriptDoc,
    saveDoc: () => { try { saveScript(getScriptDoc()); } catch (e) { console.warn('[breakdown] save script', e); } },
    rerender: () => { scriptDoc = null; render('#script'); },
    blankElement
  });
}
delegate(document, 'click', '[data-action=run-breakdown-script]', () => manualFlow('#script'));

render();
