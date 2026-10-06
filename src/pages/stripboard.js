/* ============================================================
   STRIPBOARD + DAY OUT OF DAYS
   ------------------------------------------------------------
   Two more views of the ONE scene model (src/lib/scenes.js). Nothing
   here stores a second copy of a scene, a location or a cast name:
   the strips are scenes, the cast rows are Scenes.elementIndex()
   filtered to `cast`, and the only thing this page ever writes is a
   single integer per scene — `shootDay` — through Scenes.updateScene.

   TWO KINDS OF ORDER, AND WHY ONLY ONE OF THEM IS SAVED.

   A physical stripboard is a rack of strips you pull out and re-slot:
   you gather every strip in one location so you shoot it in one go.
   That is a VIEW. The script order is the scene model's order, and it
   is what the breakdown, the sides and the page count all read. If
   sorting the board rewrote the model, a producer who looked at the
   board grouped by location would silently renumber their script.

   So grouping lives in memory (`view.group`) and is thrown away on
   reload — deliberately not persisted, because a new localStorage key
   has to be registered in four places (see the storage contract at the
   top of scenes.js) and a sort order is not worth a storage contract.
   The SCHEDULE — which scenes are shot on which day — is real
   production data, so that goes on the scene.

   COLOUR. The paper board codes a strip by time of day, and this one
   does too, from the phase tokens. It does NOT reach for green and
   yellow the way a printed board does: green is --ok and amber is
   --warn in this palette, and a strip that reads as a status is worse
   than a strip that reads as nothing. INT vs EXT is carried by a badge
   instead — filled for exterior, outlined for interior — which is one
   dimension per channel and legible in all four themes.
   ============================================================ */
import '../lib/store.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/stripboard.css';
import '../styles/print.css';
import '../styles/pdf.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { actionMenu, wireActionBar } from '../ui/actionbar.js';
import { h, delegate } from '../lib/dom.js';
import PDF from '../lib/pdf.js';
import Scenes, { ELEMENT_CATEGORIES, formatEighths, totalEighths } from '../lib/scenes.js';
import * as Songs from '../lib/songs.js';

const app = document.getElementById('app');
const CAST = 'cast';
const castCat = ELEMENT_CATEGORIES.find((c) => c.id === CAST) || { id: CAST, label: 'Cast', hue: 'feature' };

/* View state. Not persisted — see the header. */
const view = { group: 'script' };

const GROUPINGS = [
  { id: 'script',   label: 'Script order' },
  { id: 'location', label: 'Location' },
  { id: 'time',     label: 'Day / night' },
  { id: 'day',      label: 'Shoot day' },
  // A song is shot as a block, usually by its own unit, so seeing its
  // strips together is how its days get scheduled at all.
  { id: 'song',     label: 'Song' }
];

/* Time of day → a phase hue. The class sets --strip-hue in the
   stylesheet; the value itself never appears in JavaScript. */
const TIME_CLASS = {
  DAY: 'tod-day',
  NIGHT: 'tod-night',
  DAWN: 'tod-dawn',
  DUSK: 'tod-dusk',
  CONTINUOUS: 'tod-cont'
};
const TIME_ORDER = ['DAY', 'DAWN', 'DUSK', 'NIGHT', 'CONTINUOUS'];

/* ---- small readers ------------------------------------------
   `shootDay` is a field this page adds to the scene. It may be
   absent on every scene written before today, so it is read through
   one function that always answers an integer: 0 means unscheduled. */
function shootDayOf(scene) {
  const n = parseInt(scene.shootDay, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
const castOf = (scene) => (scene.elements && scene.elements[CAST]) || [];
const locationOf = (scene) => String(scene.location || '').trim();

/** Every day number in use, ascending. */
function shootDays(scenes) {
  return [...new Set(scenes.map(shootDayOf).filter(Boolean))].sort((a, b) => a - b);
}

/* ---- header -------------------------------------------------- */
function renderHeader(scenes) {
  const days = shootDays(scenes);
  const unscheduled = scenes.filter((s) => !shootDayOf(s)).length;
  const eighths = totalEighths(scenes);
  return h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Stripboard · the schedule' }),
    h('h1.bd-title', { text: 'The Board.' }),
    h('p.bd-deck', {
      text: 'One strip per scene, straight from the breakdown. Group them the way '
          + 'you will shoot them — everything in one location together, every night '
          + 'exterior together — then hand each group a shoot day. The day out of '
          + 'days below builds itself from that.'
    }),
    h('div.bd-stats', {}, [
      stat(String(scenes.length), scenes.length === 1 ? 'strip' : 'strips'),
      stat(formatEighths(eighths), eighths === 8 ? 'page' : 'pages'),
      stat(String(days.length), days.length === 1 ? 'shoot day' : 'shoot days'),
      stat(String(unscheduled), 'unscheduled')
    ])
  ]);
}
const stat = (value, label) =>
  h('div.bd-stat', {}, [h('strong', { text: value }), h('span', { text: label })]);

/* ---- the teaching empty state -------------------------------
   Same shape as the breakdown's: an empty module explains what it is
   for rather than showing a blank rack. It cannot offer "add a strip",
   because a strip is not a thing you add here — it is a scene. */
function renderEmpty() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '▤', 'aria-hidden': 'true' }),
    h('h2', { text: 'The board needs scenes first' }),
    h('p', {
      text: 'A stripboard is not a second document — it is the scene list stood on '
          + 'its side. Every strip here is one scene from the breakdown, so there is '
          + 'nothing to type on this page that you have not already typed once.'
    }),
    h('div.bd-how', {}, [
      how('1', 'Break the script down', 'List the scenes with INT/EXT, time, location and length. That is the breakdown page.'),
      how('2', 'Tag the cast', 'Who is in each scene. The day out of days is built entirely from those tags.'),
      how('3', 'Come back and schedule', 'Group the strips by location, hand each group a day, and the schedule is done.')
    ]),
    h('div.bd-example', {}, [
      h('span.bd-example-film', { text: 'Why it works this way' }),
      h('span', {
        text: ' A scene that moves on the board must not move in the script. '
            + 'Grouping here is a way of looking; the only thing the board writes '
            + 'back to a scene is the day you shoot it.'
      })
    ]),
    h('a.btn.primary.bd-cta', { href: 'breakdown.html#scenes', text: 'Go to the breakdown  →' })
  ]);
}
const how = (n, title, body) =>
  h('div.bd-how-step', {}, [
    h('span.bd-how-num', { text: n }),
    h('strong', { text: title }),
    h('p', { text: body })
  ]);

/* Songs, indexed by id, read once per grouping pass rather than once
   per scene — groupScenes runs over every strip on the board. */
let _songCache = null;
const songById = () => (_songCache || (_songCache = Object.fromEntries(
  Songs.listSongs().map((sg) => [sg.id, sg])
)));

/* ---- grouping — a view, never a write ------------------------ */
function groupScenes(scenes, mode) {
  if (mode === 'script') {
    return [{ key: 'script', label: 'Script order', scenes }];
  }
  const buckets = new Map();
  const put = (key, label, scene) => {
    if (!buckets.has(key)) buckets.set(key, { key, label, scenes: [] });
    buckets.get(key).scenes.push(scene);
  };

  for (const scene of scenes) {
    if (mode === 'location') {
      const loc = locationOf(scene);
      put(loc ? loc.toLowerCase() : '￿', loc || 'Location not set', scene);
    } else if (mode === 'time') {
      const label = `${scene.intExt} · ${scene.dayNight}`;
      put(label, label, scene);
    } else if (mode === 'song') {
      /* Reads songs.js and writes nothing, like every other grouping
         here. The sort key is the song's POSITION, not its title, so
         the blocks come out in the order a producer counts them —
         "song three" means the third one. */
      const sg = songById()[scene.songId];
      if (sg) {
        const n = parseInt(sg.number, 10);
        put(Number.isFinite(n) ? n : 9e8,
          (sg.number ? sg.number + '. ' : '') + (sg.title || Songs.kindLabel(sg.kind)), scene);
      } else {
        put(Infinity, 'Not part of a song', scene);
      }
    } else {
      const d = shootDayOf(scene);
      put(d ? d : Infinity, d ? `Day ${d}` : 'Not scheduled yet', scene);
    }
  }

  const groups = [...buckets.values()];
  if (mode === 'day' || mode === 'song') {
    groups.sort((a, b) => a.key - b.key);
  } else if (mode === 'time') {
    const rank = (g) => {
      const [ie, tod] = g.key.split(' · ');
      const t = TIME_ORDER.indexOf(tod);
      return (t < 0 ? TIME_ORDER.length : t) * 10 + (ie === 'EXT' ? 1 : ie === 'INT/EXT' ? 2 : 0);
    };
    groups.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label));
  } else {
    groups.sort((a, b) => String(a.key).localeCompare(String(b.key)));
  }
  return groups;
}

/* ---- one strip ----------------------------------------------- */
function renderStrip(scene, maxDay) {
  const tod = TIME_CLASS[scene.dayNight] || 'tod-day';
  const strip = h(`article.sb-strip.${tod}`, { 'data-scene': scene.id });

  strip.append(
    h('span.sb-no', { text: scene.number || '—' }),
    h('span.sb-ie' + (scene.intExt === 'INT' ? '' : '.is-ext'), { text: scene.intExt }),
    h('span.sb-slug', { text: locationOf(scene) || 'Location not set' }),
    h('span.sb-tod', { text: scene.dayNight }),
    h('span.sb-pages', {
      text: formatEighths(scene.eighths),
      title: `${scene.eighths} eighths of a page`
    }),
    dayPicker(scene, maxDay)
  );

  const cast = castOf(scene);
  const row = h('div.sb-cast');
  if (!cast.length) {
    row.append(h('span.sb-cast-none', { text: 'No cast tagged — this scene is invisible to the day out of days.' }));
  } else {
    row.append(h('span.sb-cast-lab', { text: castCat.label }));
    cast.forEach((name) => row.append(h('span.sb-cast-chip', { text: name })));
  }
  strip.append(row);

  if (scene.synopsis) strip.append(h('p.sb-synopsis', { text: scene.synopsis }));
  return strip;
}

/** Scheduling control. The one thing on this page that writes. */
function dayPicker(scene, maxDay) {
  const current = shootDayOf(scene);
  const wrap = h('label.sb-day');
  // "Shoot day", not "Day": the strip already carries a DAY/NIGHT, and
  // two labels reading DAY on one strip meant two different things.
  wrap.append(h('span.sb-day-lab', { text: 'Shoot day' }));
  const sel = h('select.sb-day-sel', {
    'data-strip-field': 'shootDay',
    'aria-label': `Shoot day for scene ${scene.number || ''}`.trim()
  });
  const none = h('option', { value: '0', text: '—' });
  if (!current) none.selected = true;
  sel.append(none);
  // Existing days, plus exactly one beyond the last: enough to start a
  // new day without a separate "add a day" control that would need its
  // own empty state.
  for (let d = 1; d <= Math.max(maxDay + 1, current + 1); d += 1) {
    const opt = h('option', { value: String(d), text: d > maxDay ? `${d} · new` : String(d) });
    if (d === current) opt.selected = true;
    sel.append(opt);
  }
  wrap.append(sel);
  return wrap;
}

/* ---- the board ----------------------------------------------- */
function renderBoard(scenes) {
  const wrap = h('section.sb-board', { id: 'stripboard' });
  wrap.append(
    h('h2.bd-h2', { text: 'Stripboard' }),
    h('p.bd-sub', {
      text: 'Grouping is how you are looking at the board, not how the script reads — '
          + 'the scene order in the breakdown never moves.'
    })
  );

  const controls = h('div.sb-controls');
  const seg = h('div.sb-seg', { role: 'group', 'aria-label': 'Group strips by' });
  seg.append(h('span.sb-seg-lab', { text: 'Group by' }));
  GROUPINGS.forEach((g) => {
    const on = view.group === g.id;
    seg.append(h('button.sb-seg-btn' + (on ? '.is-on' : ''), {
      type: 'button', 'data-action': 'sb-group', 'data-group': g.id,
      'aria-pressed': String(on), text: g.label
    }));
  });
  /* The board and the day out of days are two documents, and both
     are wider than they are tall — so both go out landscape. The
     export sits in a named menu beside the two scheduling actions
     rather than as two more buttons on the row. */
  controls.append(seg, h('div.sb-acts.pdf-menu-host', {}, [
    h('button.sb-btn', { type: 'button', 'data-action': 'sb-auto', text: 'Schedule by location' }),
    h('button.sb-btn.is-danger', { type: 'button', 'data-action': 'sb-clear', text: 'Clear days' }),
    actionMenu('Export', [
      { label: 'Stripboard as PDF',      action: 'pdf-board', hint: 'landscape' },
      { label: 'Day Out of Days as PDF', action: 'pdf-dood',  hint: 'landscape' },
      '---',
      { label: 'Print this page',        action: 'sb-print' }
    ], { align: 'right' })
  ]));
  wrap.append(controls, legend());

  const maxDay = shootDays(scenes).reduce((a, b) => Math.max(a, b), 0);
  for (const group of groupScenes(scenes, view.group)) {
    const eighths = totalEighths(group.scenes);
    const section = h('div.sb-group');
    section.append(h('div.sb-group-head', {}, [
      h('h3.sb-group-name', { text: group.label }),
      h('span.sb-group-meta', {
        text: `${group.scenes.length} ${group.scenes.length === 1 ? 'scene' : 'scenes'} · ${formatEighths(eighths)} ${eighths === 8 ? 'page' : 'pages'}`
      })
    ]));
    const rack = h('div.sb-rack');
    group.scenes.forEach((s) => rack.append(renderStrip(s, maxDay)));
    section.append(rack);
    wrap.append(section);
  }
  return wrap;
}

function legend() {
  const l = h('div.sb-legend', { 'aria-label': 'Strip colour key' });
  l.append(h('span.sb-legend-lab', { text: 'Key' }));
  [['DAY', 'tod-day'], ['DAWN', 'tod-dawn'], ['DUSK', 'tod-dusk'], ['NIGHT', 'tod-night'], ['CONTINUOUS', 'tod-cont']]
    .forEach(([label, cls]) => {
      l.append(h(`span.sb-legend-item.${cls}`, {}, [h('span.sb-legend-chip'), h('span', { text: label })]));
    });
  l.append(h('span.sb-legend-item', {}, [
    h('span.sb-ie.is-ext', { text: 'EXT' }),
    h('span', { text: 'filled badge is exterior' })
  ]));
  return l;
}

/* ---- day out of days -----------------------------------------
   The classic grid: cast down the side, shoot days across the top.
   SW on the first day a performer works, W on every working day after
   it, H on a day inside their span that they do NOT work (they are on
   hold and still being paid — that is the whole reason this report
   exists), WF on the last. SWF when the whole part is one day.

   Every value is computed here and none of it is stored. Move a scene
   to another day and the entire grid is different, which is exactly
   why nobody should be maintaining it by hand in a spreadsheet. */
const MARK = { start: 'SW', work: 'W', hold: 'H', finish: 'WF', only: 'SWF' };

function doodRows(scenes, days) {
  const dayOf = new Map(scenes.map((s) => [s.id, shootDayOf(s)]));
  return Scenes.elementIndex()
    .filter((item) => item.category === CAST)
    .map((item) => {
      const working = new Set(
        item.scenes.map((s) => dayOf.get(s.id)).filter((d) => d && d > 0)
      );
      const sorted = [...working].sort((a, b) => a - b);
      const first = sorted[0] || 0;
      const last = sorted[sorted.length - 1] || 0;
      let hold = 0;
      const cells = days.map((d) => {
        if (working.has(d)) {
          if (first === last) return { day: d, mark: MARK.only, kind: 'only' };
          if (d === first) return { day: d, mark: MARK.start, kind: 'start' };
          if (d === last) return { day: d, mark: MARK.finish, kind: 'finish' };
          return { day: d, mark: MARK.work, kind: 'work' };
        }
        if (first && d > first && d < last) { hold += 1; return { day: d, mark: MARK.hold, kind: 'hold' }; }
        return { day: d, mark: '', kind: 'off' };
      });
      return {
        name: item.name,
        scenes: item.scenes.length,
        work: working.size,
        hold,
        span: first ? (last - first + 1) : 0,
        cells
      };
    })
    .sort((a, b) => b.work - a.work || a.name.localeCompare(b.name));
}

function renderDood(scenes) {
  const wrap = h('section.sb-dood', { id: 'dood' });
  wrap.append(
    h('h2.bd-h2', { text: 'Day Out of Days' }),
    h('p.bd-sub', {
      text: 'Who is needed, and on which day. Built from the cast tags and the days '
          + 'assigned above — there is nothing to fill in here.'
    })
  );

  const days = shootDays(scenes);
  const rows = doodRows(scenes, days);

  if (!rows.length) {
    wrap.append(h('p.bd-none', {
      text: 'No cast tagged yet. Tag a performer on any scene in the breakdown and a row appears here, '
          + 'with every day they work, hold and finish.'
    }));
    return wrap;
  }
  if (!days.length) {
    wrap.append(h('p.bd-none', {
      text: 'No shoot days assigned yet. Give a strip a day above — or use "Schedule by location" — '
          + 'and the grid fills itself in.'
    }));
    return wrap;
  }

  const scroll = h('div.sb-dood-scroll');
  const table = h('table.sb-grid');
  const thead = h('thead');
  const hr = h('tr');
  hr.append(h('th.sb-grid-name', { scope: 'col', text: castCat.label }));
  days.forEach((d) => hr.append(h('th.sb-grid-day', { scope: 'col', text: String(d) })));
  hr.append(
    h('th.sb-grid-tot', { scope: 'col', title: 'Days worked', text: 'W' }),
    h('th.sb-grid-tot', { scope: 'col', title: 'Days on hold', text: 'H' }),
    h('th.sb-grid-tot', { scope: 'col', title: 'Days from start to finish — the days the part is on the payroll', text: 'Total' })
  );
  thead.append(hr);

  const tbody = h('tbody');
  for (const row of rows) {
    const tr = h('tr');
    tr.append(h('th.sb-grid-name', { scope: 'row' }, [
      h('strong', { text: row.name }),
      h('span.sb-grid-sub', { text: `${row.scenes} ${row.scenes === 1 ? 'scene' : 'scenes'}` })
    ]));
    row.cells.forEach((c) => tr.append(h(`td.sb-cell.is-${c.kind}`, {
      text: c.mark,
      title: c.mark ? `Day ${c.day} · ${LONG[c.kind]}` : `Day ${c.day} · not needed`
    })));
    tr.append(
      h('td.sb-grid-tot', { text: String(row.work) }),
      h('td.sb-grid-tot', { text: String(row.hold) }),
      h('td.sb-grid-tot', { text: String(row.span) })
    );
    tbody.append(tr);
  }
  table.append(thead, tbody);
  scroll.append(table);
  wrap.append(scroll, h('p.sb-note', {
    text: 'SW starts work · W works · H is held between two working days · WF finishes · '
        + 'SWF is a single-day part. Scenes with no shoot day are not counted.'
  }));
  return wrap;
}
const LONG = {
  start: 'starts work', work: 'works', hold: 'on hold', finish: 'works and finishes',
  only: 'starts, works and finishes', off: 'not needed'
};

/* ---- render --------------------------------------------------- */
function render() {
  // Dropped every render, not every page load. A cache that outlives
  // the data it mirrors is the thing that goes stale and then lies —
  // visualize.js kept a page-local copy of "does a key exist" and it
  // was wrong the moment the key changed anywhere else.
  _songCache = null;
  const scenes = Scenes.listScenes();
  const main = h('main', { id: 'main' });
  main.append(renderHeader(scenes));

  /* #stripboard and #dood are nav destinations (navigation.json), so
     they have to exist before any scene does — otherwise the phase
     menu resolves to nothing on exactly the studio that has never
     seen this page. See the note in breakdown.js's render(). */
  if (!scenes.length) {
    main.append(
      h('section.sb-board', { id: 'stripboard' }, [renderEmpty()]),
      h('section.sb-dood', { id: 'dood' }, [
        h('h2.bd-h2', { text: 'Day Out of Days' }),
        h('p.bd-sub', {
          text: 'Who is needed, and on which day. It builds itself from the cast '
              + 'tags and the shoot days on the breakdown, so there is nothing to '
              + 'fill in here and nothing to show until there are scenes.'
        })
      ])
    );
  } else {
    main.append(renderBoard(scenes), renderDood(scenes));
  }

  app.replaceChildren(main);
  mountShell();
  wireActionBar();
  // Chrome initialises at import time, when #app is still empty — the
  // trap short.js fell into. Re-init after every render.
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[stripboard] chrome', e); }
}

/* ---- events — delegated, no inline handlers ------------------- */
const sceneIdOf = (el) => el.closest('[data-scene]')?.dataset.scene;

delegate(document, 'click', '[data-action="sb-group"]', (e, el) => {
  view.group = el.dataset.group;
  render();
});

delegate(document, 'change', '[data-strip-field="shootDay"]', (e, el) => {
  const day = Math.max(0, parseInt(el.value, 10) || 0);
  Scenes.updateScene(sceneIdOf(el), { shootDay: day });
  render();
});

/* Schedule by location: the first pass a 1st AD does by hand. Scenes
   in one place are shot together, in script order, and each place
   becomes a day. It is a starting point, not a schedule — which is
   why it says so before it overwrites anything. */
delegate(document, 'click', '[data-action="sb-auto"]', () => {
  const scenes = Scenes.listScenes();
  if (!scenes.length) return;
  const already = scenes.filter((s) => shootDayOf(s)).length;
  if (already && !confirm(
    `${already} ${already === 1 ? 'scene already has' : 'scenes already have'} a shoot day. `
    + 'Re-schedule every scene by location?'
  )) return;

  const dayFor = new Map();
  for (const scene of scenes) {
    const key = locationOf(scene).toLowerCase() || '￿';
    if (!dayFor.has(key)) dayFor.set(key, dayFor.size + 1);
    Scenes.updateScene(scene.id, { shootDay: dayFor.get(key) });
  }
  view.group = 'day';
  render();
  toast(`Scheduled into ${dayFor.size} ${dayFor.size === 1 ? 'day' : 'days'}, one per location.`);
});

delegate(document, 'click', '[data-action="sb-clear"]', () => {
  const scenes = Scenes.listScenes().filter((s) => shootDayOf(s));
  if (!scenes.length) return;
  if (!confirm(`Clear the shoot day from ${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'}? The scenes themselves are untouched.`)) return;
  scenes.forEach((s) => Scenes.updateScene(s.id, { shootDay: 0 }));
  render();
});

/* ---- PDF -----------------------------------------------------
   Landscape, one document at a time. Neither of these two had any
   print rules at all before — a board printed with the app rail
   down the side and the shoot-day select as an empty box — so the
   whole treatment lives in styles/pdf.css. */
function boardSummary(scenes) {
  const days = shootDays(scenes).length;
  return `${scenes.length} ${scenes.length === 1 ? 'scene' : 'scenes'} · `
       + `${formatEighths(totalEighths(scenes))} pages · `
       + `${days} ${days === 1 ? 'shoot day' : 'shoot days'}`;
}

delegate(document, 'click', '[data-action="pdf-board"]', () => {
  PDF.exportPDF({ scope: 'board', subtitle: boardSummary(Scenes.listScenes()) });
});

delegate(document, 'click', '[data-action="pdf-dood"]', () => {
  PDF.exportPDF({ scope: 'dood', subtitle: boardSummary(Scenes.listScenes()) });
});

delegate(document, 'click', '[data-action="sb-print"]', () => window.print());

function toast(message) {
  try { StudioUI.toast(message, { type: 'info' }); } catch (e) { /* chrome may not be up */ }
}

render();
