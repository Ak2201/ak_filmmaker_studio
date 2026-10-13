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
import { mountPathBar } from '../ui/path-bar.js';
import { h, delegate } from '../lib/dom.js';
import Scenes, {
  INT_EXT, DAY_NIGHT, ELEMENT_CATEGORIES, formatEighths, totalEighths
} from '../lib/scenes.js';
import * as Songs from '../lib/songs.js';
import * as Bin from '../lib/scene-bin.js';
import '../styles/scene-bin.css';
import '../styles/scene-list.css';
import { shootDayOf } from '../lib/locations.js';
import '../styles/breakdown-run.css';
import { flushStorage } from '../lib/store.js';
import { runBreakdown } from '../lib/breakdown-run.js';
import { commitImportedScript } from '../lib/script-commit.js';
import { renderOverview, setView, mountLearn, say as sayStatus } from '../ui/breakdown-overview.js';
import { loadScript, saveScript, blankElement, isNumberingLocked, sceneNumbers } from '../lib/script.js';
import { renderScriptOverview, hydrateScriptParts } from '../ui/script-overview.js';
import { suggestAll, suggestReport, describeMatch, isConfident, SUGGEST_CATEGORIES } from '../lib/screenplay-analysis.js';
import { aiPill } from '../ui/ai-pill.js';   // the one way into AI; the Desk loads at a click
import { measureEighths } from '../lib/scene-sync.js';
import PlanGate from '../lib/plan-gate.js';   // script_import (src/data/plan-matrix.json)

const app = document.getElementById('app');
const catById = Object.fromEntries(ELEMENT_CATEGORIES.map((c) => [c.id, c]));

/* ---- header ------------------------------------------------ */
function renderHeader(scenes) {
  const eighths = totalEighths(scenes);
  return h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Breakdown · one scene model, every view' }),
    h('h1.bd-title', { text: 'Breakdown.' }),
    h('p.bd-deck', {
      text: 'Every scene once — INT/EXT, time, location, length. The stripboard, '
          + 'the sides, the shot list and the call sheet all read from this, so it '
          + 'is the only place any of it gets typed.'
    }),
    h('div.bd-stats', {}, [
      stat(String(scenes.length), scenes.length === 1 ? 'scene' : 'scenes'),
      stat(formatEighths(eighths), eighths === 8 ? 'page' : 'pages'),
      stat(String(Scenes.elementIndex().length), 'elements'),
      stat(String(new Set(scenes.map((s) => s.location).filter(Boolean)).size), 'locations'),
      stat(String(Songs.listSongs().length), 'songs')
    ]),
    scenes.length ? h('p.bd-measure', {}, [
      aiPill({
        label: 'AI Desk',
        tasks: [{ id: 'scene-notes', label: 'Scene notes' }, { id: 'breakdown-tags', label: 'Breakdown tags' },
                { id: 'genre-comps', label: 'Genre and comparables' }],
        ctx: { elements: () => loadScript().elements, after: () => render() }
      }),
      h('button.btn', {
        type: 'button', 'data-action': 'eighths-measure', text: 'RE-MEASURE PAGES FROM THE SCRIPT',
        title: 'Recount each scene\u2019s length in eighths from the script as it stands now'
      })
    ]) : null
  ]);
}
const stat = (value, label) =>
  h('div.bd-stat', {}, [h('strong', { text: value }), h('span', { text: label })]);

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
    h('button.btn.bd-cta', { type: 'button', 'data-action': 'scene-add', text: '+  Add a scene by hand' })
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
let NUM_LOCK = { locked: false, omitted: [] };
function readNumberLock() {
  try {
    const s = loadScript();
    if (!isNumberingLocked(s.numbering)) return { locked: false, omitted: [] };
    return { locked: true, omitted: sceneNumbers(s.elements, s.numbering).omitted.map((o) => o.number) };
  } catch (e) { return { locked: false, omitted: [] }; }
}
const numberKey = (n) => String(n || '').trim().toUpperCase();
/** The numbers more than one scene carries, upper-cased. */
function dupNumbers(scenes) {
  const seen = new Set(), dup = new Set();
  for (const s of scenes) {
    const k = numberKey(s.number);
    if (!k) continue;
    if (seen.has(k)) dup.add(k); else seen.add(k);
  }
  return dup;
}
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
const filterActive = () => !!(SL.q.trim() || SL.ie || SL.dn || SL.st);
const KEYS_HINT = 'Keys: Up and Down arrows move between scenes (from the open/close button or the location). '
  + 'Enter opens or closes a scene. N adds a scene. Delete moves the focused scene to the bin, with Undo. '
  + 'On a drag handle, Up and Down reorder the scene.';
const GRIP_ON = 'Drag to reorder this scene (or focus it and press Up or Down)';
const GRIP_OFF = 'Reordering is off while a search or filter is active: clear it to drag scenes into a new order';
/* Eight shoot-day colours, from the phase and category hues in tokens.css
   (scene-list.css maps slot -> token). Day N uses slot ((N - 1) mod 8) + 1. */
const daySlot = (day) => ((day - 1) % 8) + 1;

/** Where a scene stands, from the fields it already has. Nothing stored. */
function sceneStatus(scene) {
  if (scene.shotState === 'shot')    return { id: 'shot', label: 'Shot' };
  if (scene.shotState === 'part')    return { id: 'part', label: 'Part shot' };
  if (scene.shotState === 'dropped') return { id: 'dropped', label: 'Dropped' };
  const day = shootDayOf(scene);
  if (day) return { id: 'scheduled', label: 'Day ' + day };
  const tags = ELEMENT_CATEGORIES.reduce((n, c) => n + (scene.elements[c.id] || []).length, 0);
  if (tags) return { id: 'tagged', label: 'Tagged' };
  return { id: 'untagged', label: 'Untagged' };
}
function castSummary(scene) {
  const names = scene.elements.cast || [];
  if (!names.length) return '';
  return names.slice(0, 2).join(', ') + (names.length > 2 ? ' +' + (names.length - 2) : '');
}
const searchText = (scene) => [scene.number, scene.location, scene.synopsis, scene.intExt, scene.dayNight]
  .concat(...ELEMENT_CATEGORIES.map((c) => scene.elements[c.id] || [])).join(' ').toLowerCase();

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
    h('span.bd-sl-status.is-' + status.id, { text: status.label }),
    h('button.bd-icon.bd-sl-toggle', {
      type: 'button', 'data-action': 'sl-toggle', 'aria-expanded': String(open), 'aria-controls': detailId,
      title: open ? 'Close the scene' : 'Open the scene to edit its synopsis and tags',
      'aria-label': (open ? 'Close' : 'Open') + ' scene ' + (scene.number || i + 1), text: open ? '▾' : '▸'
    })
  ]));

  const detail = h('div.bd-sl-detail', { id: detailId, hidden: !open });
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

  const tags = h('div.bd-tags');
  for (const cat of ELEMENT_CATEGORIES) {
    const names = scene.elements[cat.id] || [];
    if (!names.length) continue;
    for (const name of names) {
      const chip = h(`span.bd-chip.hue-${cat.hue}`, { title: cat.label });
      chip.append(
        h('span.bd-chip-cat', { text: cat.label }),
        h('span.bd-chip-name', { text: name }),
        h('button.bd-chip-x', {
          type: 'button', 'data-action': 'el-remove',
          'data-cat': cat.id, 'data-name': name,
          'aria-label': `Remove ${name} from ${cat.label}`, text: '✕'
        })
      );
      tags.append(chip);
    }
  }
  const adder = h('div.bd-add-el');
  const sel = h('select.bd-add-cat', { 'aria-label': 'Element category' });
  ELEMENT_CATEGORIES.forEach((c) => sel.append(h('option', { value: c.id, text: c.label })));
  adder.append(sel, h('input.bd-add-name', {
    type: 'text', placeholder: 'Tag an element — name it, press Enter',
    'data-action-key': 'el-add', 'aria-label': 'Element name', list: 'bdElementNames', autocomplete: 'off'
  }));
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
    h('button.btn.bd-sl-expand', { type: 'button', 'data-action': 'sl-expand', text: SL.open.size ? 'COLLAPSE ALL' : 'EXPAND ALL' }),
    h('span.bd-sl-count', { role: 'status', 'aria-live': 'polite', title: KEYS_HINT, text: scenes.length + ' scenes' })
  ]);
  const bulk = h('div.bd-sl-bulk', { hidden: !SL.sel.size, role: 'group', 'aria-label': 'Selected scenes' }, [
    h('strong.bd-sl-bulk-n', { text: SL.sel.size + ' selected' }),
    h('select.bd-sel', { 'data-sl-bulk': 'intExt', 'aria-label': 'Set interior or exterior on the selected scenes' },
      [h('option', { value: '', text: 'Set INT / EXT…' })].concat(INT_EXT.map((v) => h('option', { value: v, text: v })))),
    h('select.bd-sel', { 'data-sl-bulk': 'dayNight', 'aria-label': 'Set time of day on the selected scenes' },
      [h('option', { value: '', text: 'Set time…' })].concat(DAY_NIGHT.map((v) => h('option', { value: v, text: v })))),
    h('button.btn.danger', { type: 'button', 'data-action': 'sl-bulk-bin', text: 'MOVE TO BIN' }),
    h('button.btn', { type: 'button', 'data-action': 'sl-clear', text: 'CLEAR SELECTION' })
  ]);
  const names = h('datalist#bdElementNames');
  for (const el of Scenes.elementIndex()) names.append(h('option', { value: el.name }));
  return h('div.bd-sl-tools', {}, [bar, renderPresets(), bulk, names]);
}

/* ---- saved filters (in memory) ------------------------------ */
const PRESET_KEYS = ['q', 'ie', 'dn', 'st'];
const STATUS_LABELS = { untagged: 'Untagged', tagged: 'Tagged', scheduled: 'Scheduled', shot: 'Shot', part: 'Part shot', dropped: 'Dropped' };
function describeFilter(f) {
  const bits = [];
  if (f.ie) bits.push(f.ie);
  if (f.dn) bits.push(f.dn.toLowerCase());
  if (f.st) bits.push((STATUS_LABELS[f.st] || f.st).toLowerCase());
  if (f.q && f.q.trim()) bits.push('\u201C' + f.q.trim() + '\u201D');
  return bits.join(' \u00B7 ') || 'every scene';
}
const presetOn = (p) => PRESET_KEYS.every((k) => String(p[k] || '').trim().toLowerCase() === String(SL[k] || '').trim().toLowerCase());
function renderPresets() {
  const on = filterActive();
  return h('div.bd-sl-presets', { role: 'group', 'aria-label': 'Saved filters (kept until you reload this page)' }, [
    h('button.btn.bd-sl-save', {
      type: 'button', 'data-action': 'sl-save', disabled: !on, text: 'SAVE THIS FILTER',
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
  const q = SL.q.trim().toLowerCase();
  let shown = 0, total = 0;
  document.querySelectorAll('.bd-sl[data-scene]').forEach((row) => {
    total++;
    const ok = (!q || row.dataset.find.includes(q)) && (!SL.ie || row.dataset.ie === SL.ie)
      && (!SL.dn || row.dataset.dn === SL.dn) && (!SL.st || row.dataset.st === SL.st);
    row.hidden = !ok;
    if (ok) shown++;
  });
  const count = document.querySelector('.bd-sl-count');
  if (count) count.textContent = (shown === total ? total + (total === 1 ? ' scene' : ' scenes') : shown + ' of ' + total + ' scenes');
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
    wrap.append(h('div.bd-stats', {}, [
      stat(String(t.count), t.count === 1 ? 'song' : 'songs'),
      stat(String(t.days), t.days === 1 ? 'shoot day' : 'shoot days'),
      stat(String(t.linkedScenes), 'linked scenes'),
      stat(String(t.peakDancers || '—'), 'peak dancers')
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

  wrap.append(h('button.btn.bd-add', {
    type: 'button', 'data-action': 'song-add', text: '+  Add song'
  }));
  return wrap;
}

/* ---- element index ------------------------------------------ */
function renderElements() {
  const index = Scenes.elementIndex();
  const wrap = h('section.bd-elements', { id: 'elements' });
  wrap.append(h('h2.bd-h2', { text: 'Elements' }),
              h('p.bd-sub', { text: 'Derived from the tags above. Nothing here is typed twice.' }));
  if (!index.length) {
    wrap.append(h('p.bd-none', { text: 'No elements tagged yet. Tag one on any scene and it appears here, with every scene it touches.' }));
    return wrap;
  }
  const grid = h('div.bd-el-grid');
  for (const item of index) {
    const cat = catById[item.category] || { label: item.category, hue: 'feature' };
    grid.append(h(`div.bd-el.hue-${cat.hue}`, {}, [
      h('span.bd-el-cat', { text: cat.label }),
      h('strong.bd-el-name', { text: item.name }),
      h('span.bd-el-scenes', {
        text: item.scenes.length === 1
          ? `scene ${item.scenes[0].number}`
          : `${item.scenes.length} scenes · ${item.scenes.map((s) => s.number).join(', ')}`
      })
    ]));
  }
  wrap.append(grid);
  return wrap;
}

/* ---- suggested from the script (PRD 2.0 FR-603) --------------
   The script's action lines and cues read for cast, props, vehicles,
   stunts and sound — see src/data/element-lexicon.json for what is
   looked for and why. A SUGGESTION IS NOT A TAG: each one is a button
   carrying the line it was read off, and nothing lands on a scene until
   somebody presses it. A breakdown is a 1st AD's judgement; this saves
   the typing, not the judgement. */
const SUGGEST_CATS = SUGGEST_CATEGORIES;
/* ADD ALL takes only the five categories whose lists are tight. The
   looser ones (furniture, clothing, crowds) are one chip at a time. */
const BULK_CATS = ['cast', 'props', 'vehicles', 'stunts', 'sound'];
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
      ? h('button.btn', { type: 'button', 'data-action': 'sug-all', text: 'ADD ALL' })
      : null
  ]));
  const list = h('ol.bd-sug-list');
  for (const r of rows) {
    const li = h('li.bd-sug-scene', { 'data-scene': r.scene.id });
    li.append(h('div.bd-sug-head', {}, [
      h('strong', { text: `Scene ${r.scene.number || '\u2014'}` }),
      h('span.bd-sug-slug', { text: r.heading }),
      isConfident(r.how) ? null : h('span.bd-sug-guess', { text: 'paired by position, check the heading' }),
      h('button.btn.bd-sug-scene-all', { type: 'button', 'data-action': 'sug-scene', text: 'ADD THESE' })
    ]));
    const tags = h('div.bd-tags');
    for (const cat of SUGGEST_CATS) {
      const c = catById[cat];
      for (const sug of r.suggestions[cat]) {
        tags.append(h(`button.bd-chip.bd-sug.hue-${c.hue}`, {
          type: 'button', 'data-action': 'sug-add', 'data-cat': cat, 'data-name': sug.name,
          title: 'From: ' + sug.from, 'aria-label': `Tag ${sug.name} as ${c.label} — from: ${sug.from}`
        }, [h('span.bd-chip-cat', { text: c.label }), h('span.bd-chip-name', { text: '+ ' + sug.name })]));
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
   Returns exactly the tags written, so the toast's Undo removes those
   and nothing else. */
function applySuggestions(sceneIds) {
  const scenes = Scenes.listScenes();
  const rows = suggestAll(scenes, loadScript().elements)
    .filter((r) => (sceneIds ? sceneIds.includes(r.scene.id) : isConfident(r.how)));
  const cats = sceneIds ? SUGGEST_CATS : BULK_CATS;
  const tags = [];
  for (const r of rows) for (const cat of cats) for (const sug of r.suggestions[cat]) {
    tags.push({ sceneId: r.scene.id, category: cat, name: sug.name });
  }
  return Scenes.tagMany(tags);
}

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
    const c = Bin.entryCounts(e);
    const bits = [];
    if (c.shots) bits.push(`${c.shots} shot${c.shots === 1 ? '' : 's'}`);
    if (c.frames) bits.push(`${c.frames} frame${c.frames === 1 ? '' : 's'}`);
    if (c.blocks) bits.push(`${c.blocks} blocking diagram${c.blocks === 1 ? '' : 's'}`);
    if (c.cutNotes) bits.push(`${c.cutNotes} cut note${c.cutNotes === 1 ? '' : 's'}`);
    if (c.day) bits.push(`Day ${c.day}`);
    if (c.sheets) bits.push(`${c.sheets} call sheet${c.sheets === 1 ? '' : 's'}`);
    if (!bits.length) bits.push('nothing attached');
    const where = [row.intExt, row.location, row.dayNight].filter(Boolean).join(' · ');
    list.append(h('li.bd-bin-item', { 'data-bin': e.id }, [
      h('div.bd-bin-copy', {}, [
        h('strong', { text: `Scene ${row.number || '—'}` }),
        h('span.bd-bin-slug', { text: e.heading || where || 'No heading' }),
        h('span.bd-bin-meta', { text: bits.join(' · ') + (e.reason === 'hand' ? ' · deleted here' : ' · heading removed from the script') })
      ]),
      h('div.bd-bin-acts', {}, [
        h('button.btn', { type: 'button', 'data-action': 'bin-restore', text: 'Restore' }),
        h('button.btn.danger.bd-bin-del', { type: 'button', 'data-action': 'bin-delete', text: 'Delete for good' })
      ])
    ]));
  }
  wrap.append(list);
  wrap.append(h('button.btn.bd-bin-empty', { type: 'button', 'data-action': 'bin-empty', text: 'Empty bin' }));
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
    tagging.append(h('button.btn.bd-add', { type: 'button', 'data-action': 'scene-add', text: '+  Add scene' }));
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
  main.append(renderScriptOverview(scenes, { from: new URLSearchParams(location.search).get('from') }), renderOverview(scenes, STATUS), list, renderSuggestions(scenes), renderSongs(scenes), renderElements());

  mountPathBar(main);   // the pre-production path, above the tool and Back / Next below it
  app.replaceChildren(main);
  applySceneFilter();
  hydrateScriptParts(wireScriptParts);
  if (focus) {
    const node = document.querySelector(focus);
    if (node) node.focus();
  }
  mountStageGuide(document.getElementById('main'), { stage: 'preprod' });   // the blueprint's questions for this stage
  mountShell();
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
/** Is this heading id in the script right now? A row restored while
    its heading is gone comes back unlinked, or the next sync on the
    Write page would bin it again. */
function headingInScript(id) {
  if (!id) return false;
  try { return loadScript().elements.some((el) => el && el.id === id && el.type === 'scene' && String(el.text || '').trim()); }
  catch (e) { return false; }
}
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
  const bits = [`${t.scenes} scene${t.scenes === 1 ? '' : 's'}`];
  if (t.shots) bits.push(`${t.shots} shot${t.shots === 1 ? '' : 's'}`);
  if (t.frames) bits.push(`${t.frames} frame${t.frames === 1 ? '' : 's'}`);
  if (t.sheets) bits.push(`${t.sheets} call-sheet place${t.sheets === 1 ? '' : 's'}`);
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
const sceneValue = (el) => el.dataset.sceneField === 'eighths'
  ? Math.max(0, parseInt(el.value, 10) || 0)
  : el.dataset.sceneField === 'number' ? el.value.trim() : el.value;
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
delegate(document, 'keydown', '[data-action-key="el-add"]', (e, el) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const cat = el.previousElementSibling.value;
  if (!el.value.trim()) return;
  const id = sceneIdOf(el);
  Scenes.tagElement(id, cat, el.value);
  // Back into the same scene's field, for the next element.
  render(inScene(id, '[data-action-key="el-add"]'));
});

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

const songValue = (el) => {
  const key = el.dataset.songField;
  if (key === 'days') return Math.max(0, parseFloat(el.value) || 0);
  if (key === 'dancers') return Math.max(0, parseInt(el.value, 10) || 0);
  return el.value;
};
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
  const a = res.applied, t = res.totals;
  const said = a.empty
    ? 'The script has no scene headings yet, so there was nothing to break down.'
    : 'Broke down ' + t.scenes + (t.scenes === 1 ? ' scene' : ' scenes') + ', '
      + res.characters.length + (res.characters.length === 1 ? ' character' : ' characters') + ' and '
      + t.locations + (t.locations === 1 ? ' location' : ' locations') + '.'
      + (a.castTagged ? ' Tagged ' + a.castTagged + ' cast from the dialogue cues.' : '');
  STATUS = said;
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
delegate(document, 'click', '[data-action=run-breakdown]', async () => {
  let res;
  try { res = runBreakdown(); } catch (e) { console.warn('[breakdown] run', e); StudioUI.toast('The breakdown could not run on this script.', { type: 'error' }); return; }
  await flushStorage().catch(() => {});
  toastRun(res);
  render('#overview');
});
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
delegate(document, 'click', '[data-action=run-breakdown-script]', async () => {
  let res;
  try { res = runBreakdown(); } catch (e) { console.warn('[breakdown] run', e); StudioUI.toast('The breakdown could not run on this script.', { type: 'error' }); return; }
  await flushStorage().catch(() => {});
  scriptDoc = null;
  toastRun(res);
  render('#script');
});

render();
