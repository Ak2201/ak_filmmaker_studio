/* ============================================================
   REPORTS — the numbers, and the sides
   ------------------------------------------------------------
   Two views of the SAME scene model (src/lib/scenes.js), and not a
   byte of storage of their own. Everything below — the eighths, the
   INT/EXT split, the location table, the element counts, the sides —
   is computed from Scenes.listScenes() on every render. A report is
   an opinion about data, never a second copy of it; the stranded
   `sm_N_*` keys on the trap list are what the other choice costs.

   The one piece of state here is which scenes the user has ticked for
   sides, and it is deliberately in memory only. It is a view of a
   moment, not work anyone would mourn, and a new localStorage key has
   to be registered in four places (see the storage contract at the top
   of scenes.js) before it behaves. A checkbox is not worth that.

   Both views print. The reports print as tables; the sides print as
   one block per scene with `break-inside: avoid`, which is what a
   1st AD photocopies at 6am. The rules live in styles/reports.css —
   print.css is the shared setup and is not edited per page.
   ============================================================ */
import '../lib/store.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/reports.css';
import '../styles/pdf.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { actionMenu, wireActionBar } from '../ui/actionbar.js';
import { h, delegate } from '../lib/dom.js';
import PDF from '../lib/pdf.js';
import Scenes, {
  INT_EXT, DAY_NIGHT, ELEMENT_CATEGORIES, formatEighths, totalEighths
} from '../lib/scenes.js';
import { loadScript } from '../lib/script.js';
import Analysis, { formatDuration } from '../lib/screenplay-analysis.js';
import Locations, { byLocation } from '../lib/locations.js';
import Shoot from '../lib/shootday.js';
import DPR from '../lib/dpr.js';
import { offlineSupported, offlineStatus, makeOffline, SHOOT_PACK } from '../lib/pwa.js';
import { listSongs, updateSong, durationSeconds, getTargetMinutes, setTargetMinutes, kindLabel } from '../lib/songs.js';
import { loadStory } from '../lib/story.js';
import { resolveBeat, actsOf, qualify } from '../lib/beat-outline.js';
import '../styles/runtime.css';

const app = document.getElementById('app');
const catById = Object.fromEntries(ELEMENT_CATEGORIES.map((c) => [c.id, c]));

/* Hue = data. A bucket's colour says WHICH bucket, and the same
   bucket is the same colour in the card and in the table. Nothing
   here is coloured to look nice. */
const IE_HUE = { INT: 'shorts', EXT: 'plan', 'INT/EXT': 'visualize' };
const DN_HUE = { DAY: 'library', NIGHT: 'visualize', DAWN: 'plan', DUSK: 'shoot', CONTINUOUS: 'shorts' };

const NO_LOCATION = 'Unassigned';

/* Which scenes are on the sides. Null until the first render, then a
   Set of scene ids; see the note at the top about why this is not
   persisted. */
let selected = null;

/* ---- derivations — all of them, every render ---------------- */

/** Display number for a scene: what the user typed, else its place. */
function sceneNumbers(scenes) {
  return new Map(scenes.map((s, i) => [s.id, String(s.number || i + 1)]));
}

/** Count and measure the scenes by one enum field, in the enum's order. */
function tally(scenes, field, order) {
  const rows = new Map(order.map((k) => [k, { key: k, count: 0, eighths: 0 }]));
  for (const s of scenes) {
    const key = s[field] || order[0];
    if (!rows.has(key)) rows.set(key, { key, count: 0, eighths: 0 });
    const row = rows.get(key);
    row.count += 1;
    row.eighths += Number(s.eighths) || 0;
  }
  return [...rows.values()].filter((r) => r.count > 0);
}

/** The element index, folded into its categories. */
function byCategory(index) {
  const rows = new Map();
  for (const item of index) {
    if (!rows.has(item.category)) rows.set(item.category, { category: item.category, names: 0, appearances: 0 });
    const row = rows.get(item.category);
    row.names += 1;
    row.appearances += item.scenes.length;
  }
  // Report them in the order a 1st AD reads a breakdown sheet.
  return ELEMENT_CATEGORIES.map((c) => rows.get(c.id)).filter(Boolean);
}

/* A no-break space inside each pair: in a narrow column "EXT 1 · INT 2"
   broke as "INT" over "2", which reads as a count for the next row. */
const mix = (counts) => Object.entries(counts).map(([k, n]) => k + '\u00a0' + n).join(' · ');
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

function slugOf(scene) {
  const place = String(scene.location || '').trim() || 'LOCATION TBD';
  return [scene.intExt, place, scene.dayNight].join(' · ');
}

/* ---- header ------------------------------------------------- */
function renderHeader(scenes) {
  const eighths = totalEighths(scenes);
  const night = totalEighths(scenes.filter((s) => s.dayNight === 'NIGHT'));
  return h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Reports · from your scenes' }),
    h('h1.bd-title', { text: 'Reports & Sides.' }),
    h('p.bd-deck', {
      text: 'Every number on this page is counted from the scene breakdown the '
          + 'moment you open it. Change a scene there and the reports change here '
          + '— there is nothing to regenerate, and nothing to keep in step.'
    }),
    h('div.bd-stats', {}, [
      stat(String(scenes.length), scenes.length === 1 ? 'scene' : 'scenes'),
      stat(formatEighths(eighths), 'pages'),
      stat(formatEighths(night), 'night pages'),
      stat(String(new Set(scenes.map((s) => String(s.location || '').trim().toLowerCase()).filter(Boolean)).size), 'locations'),
      stat(String(Scenes.elementIndex().length), 'elements')
    ])
  ]);
}
const stat = (value, label) =>
  h('div.bd-stat', {}, [h('strong', { text: value }), h('span', { text: label })]);

/* ---- the teaching empty state ------------------------------- */
function renderEmpty() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '▤', 'aria-hidden': 'true' }),
    h('h2', { text: 'Reports need scenes' }),
    h('p', {
      text: 'A report is arithmetic on the breakdown — it cannot invent what has '
          + 'not been typed. Add the scenes once and every number on this page, '
          + 'and every page of sides, builds itself from them.'
    }),
    h('div.bd-how', {}, [
      how('1', 'Break the script down', 'One line per scene on the breakdown page: INT or EXT, day or night, where, and how long in eighths.'),
      how('2', 'Tag what each scene needs', 'Cast, props, wardrobe, vehicles. The element counts below are that tagging, counted.'),
      how('3', 'Print what the day needs', 'Tick the scenes being shot and the sides come out with slug, length, synopsis and elements.')
    ]),
    h('div.bd-example', {}, [
      h('span.bd-example-film', { text: 'Why it matters' }),
      h('span', {
        text: ' A line producer asks three questions — how many pages, how many '
            + 'night pages, and how many days at each location. All three are on '
            + 'this page the moment the breakdown exists, and none of them are '
            + 'worth answering twice by hand.'
      })
    ]),
    h('a.btn.primary.bd-cta', { href: './breakdown.html', text: 'Go to the breakdown  →' })
  ]);
}
const how = (n, title, body) =>
  h('div.bd-how-step', {}, [
    h('span.bd-how-num', { text: n }),
    h('strong', { text: title }),
    h('p', { text: body })
  ]);

/* ---- reports ------------------------------------------------ */
function distCard(title, note, rows, hues, total) {
  const card = h('article.rp-card');
  card.append(h('p.bd-eyebrow', { text: title }), h('p.rp-card-note', { text: note }));
  const list = h('div.rp-dist');
  for (const row of rows) {
    const pct = total ? (row.count / total) * 100 : 0;
    const fill = h('span.rp-meter-fill');
    fill.style.width = Math.max(2, pct).toFixed(1) + '%';
    list.append(h('div.rp-dist-row.hue-' + (hues[row.key] || 'feature'), {}, [
      h('span.rp-dist-key', { text: row.key }),
      h('span.rp-meter', { 'aria-hidden': 'true' }, [fill]),
      h('span.rp-dist-val', {
        text: plural(row.count, 'scene', 'scenes') + ' · ' + formatEighths(row.eighths) + ' pp'
      })
    ]));
  }
  card.append(list);
  return card;
}

const th = (text, cls) => h('th' + (cls ? '.' + cls : ''), { scope: 'col', text });
const td = (text, cls) => h('td' + (cls ? '.' + cls : ''), { text });

function locationTable(rows, scenes) {
  const table = h('table.scene-table.rp-table');
  table.append(h('caption.rp-caption', {
    text: 'Scenes and page count per location — the order a schedule gets built in.'
  }));
  table.append(h('thead', {}, [h('tr', {}, [
    th('Location'), th('Scenes'), th('Pages'), th('Int / Ext'), th('Day / Night'), th('Scene numbers')
  ])]));
  const body = h('tbody');
  for (const row of rows) {
    body.append(h('tr', {}, [
      td(row.name, 'loc'),
      td(String(row.count), 'numeric'),
      td(formatEighths(row.eighths), 'numeric'),
      td(mix(row.ie), 'mono'),
      td(mix(row.dn), 'mono'),
      td(row.numbers.join(', '), 'scenes-in')
    ]));
  }
  table.append(body);
  table.append(h('tfoot', {}, [h('tr', {}, [
    td(plural(rows.length, 'location', 'locations'), 'loc'),
    td(String(scenes.length), 'numeric'),
    td(formatEighths(totalEighths(scenes)), 'numeric'),
    td(''), td(''), td('')
  ])]));
  return table;
}

function elementTable(index, numbers) {
  const table = h('table.scene-table.rp-table');
  table.append(h('caption.rp-caption', {
    text: 'Every tagged element and the scenes it appears in. Tagged once on the breakdown, counted here.'
  }));
  table.append(h('thead', {}, [h('tr', {}, [
    th('Element'), th('Category'), th('Scenes'), th('Appears in')
  ])]));
  const body = h('tbody');
  for (const item of index) {
    const cat = catById[item.category] || { label: item.category, hue: 'feature' };
    body.append(h('tr', {}, [
      td(item.name, 'loc'),
      h('td.hue-' + cat.hue, {}, [h('span.rp-cat-tag', { text: cat.label })]),
      td(String(item.scenes.length), 'numeric'),
      td(item.scenes.map((s) => numbers.get(s.id) || s.number).join(', '), 'scenes-in')
    ]));
  }
  table.append(body);
  return table;
}

function renderReports(scenes, numbers) {
  const sec = h('section.rp-sec', { id: 'reports' });
  sec.append(
    h('p.bd-eyebrow', { text: 'Production reports' }),
    h('h2.bd-h2', { text: 'What the schedule is made of.' }),
    h('p.bd-sub', {
      text: 'Totals, the interior/exterior and day/night splits, every location '
          + 'and every tagged element — the five things a 1st AD and a line '
          + 'producer ask for before anything else.'
    }),
    /* One named menu rather than two more buttons. The toolbar went
       from twenty flat controls to seven on purpose (see
       ui/actionbar.js) and a second top-level button per view is how
       that creeps back. */
    h('div.rp-tools.rp-noprint.pdf-menu-host', {}, [
      actionMenu('Export', [
        { label: 'Print the reports', action: 'print-reports' },
        { label: 'Save as PDF',       action: 'pdf-reports', hint: 'A4' }
      ])
    ])
  );

  sec.append(h('div.rp-cards', {}, [
    distCard(
      'Interior / Exterior',
      'Exteriors are the weather risk and the permit; the split is the first thing a line producer reads.',
      tally(scenes, 'intExt', INT_EXT), IE_HUE, scenes.length
    ),
    distCard(
      'Day / Night',
      'Night pages cost more than day pages. Counted separately because they are budgeted separately.',
      tally(scenes, 'dayNight', DAY_NIGHT), DN_HUE, scenes.length
    )
  ]));

  sec.append(h('h3.rp-h3', { text: 'By location' }));
  sec.append(locationTable(byLocation(scenes, numbers, NO_LOCATION), scenes));

  const index = Scenes.elementIndex();
  sec.append(h('h3.rp-h3', { text: 'Elements' }));
  if (!index.length) {
    sec.append(h('p.bd-none', {
      text: 'Nothing tagged yet. Tag cast, props or wardrobe on any scene in the '
          + 'breakdown and the counts and the index appear here.'
    }));
    return sec;
  }

  const cats = byCategory(index);
  const grid = h('div.bd-el-grid');
  for (const row of cats) {
    const cat = catById[row.category] || { label: row.category, hue: 'feature' };
    grid.append(h('div.bd-el.hue-' + cat.hue, {}, [
      h('span.bd-el-cat', { text: cat.label }),
      h('strong.bd-el-name', { text: String(row.names) }),
      h('span.bd-el-scenes', {
        text: (row.names === 1 ? 'name · ' : 'distinct · ') + plural(row.appearances, 'appearance', 'appearances')
      })
    ]));
  }
  sec.append(grid, elementTable(index, numbers));
  return sec;
}

/* ---- sides -------------------------------------------------- */
function sideBlock(scene, number) {
  const block = h('article.rp-side');
  block.append(h('div.rp-side-bar', {}, [
    h('span.rp-side-no', { text: number }),
    h('span.rp-side-slug', { text: slugOf(scene) }),
    h('span.rp-side-pages', { text: formatEighths(scene.eighths) + ' pp' })
  ]));

  const synopsis = String(scene.synopsis || '').trim();
  block.append(h('p.rp-side-syn' + (synopsis ? '' : '.is-empty'), {
    text: synopsis || 'No synopsis written for this scene yet.'
  }));

  const els = h('div.rp-side-els');
  let any = false;
  for (const cat of ELEMENT_CATEGORIES) {
    const names = scene.elements[cat.id] || [];
    if (!names.length) continue;
    any = true;
    els.append(h('div.rp-side-el.hue-' + cat.hue, {}, [
      h('span.rp-side-el-cat', { text: cat.label }),
      h('span.rp-side-el-names', { text: names.join(', ') })
    ]));
  }
  if (any) block.append(els);
  return block;
}

/** The printable block. Rebuilt whenever the selection changes. */
function sidesBody(scenes, numbers) {
  const chosen = scenes.filter((s) => selected.has(s.id));
  if (!chosen.length) {
    return [h('p.bd-none', {
      text: 'No scenes ticked. Tick the scenes being shot and they appear here, '
          + 'in script order, ready to print.'
    })];
  }
  const out = [h('div.rp-sides-head', {}, [
    h('span.rp-sides-title', { text: 'Sides' }),
    h('span.rp-sides-meta', {
      text: plural(chosen.length, 'scene', 'scenes') + ' · ' + formatEighths(totalEighths(chosen)) + ' pages'
    })
  ])];
  for (const scene of chosen) out.push(sideBlock(scene, numbers.get(scene.id)));
  return out;
}

const selectionLabel = (scenes) =>
  selected.size + ' of ' + scenes.length + ' selected';

function renderSides(scenes, numbers) {
  const sec = h('section.rp-sec', { id: 'sides' });
  sec.append(
    h('p.bd-eyebrow.rp-noprint', { text: 'Sides' }),
    h('h2.bd-h2.rp-noprint', { text: 'Pages for the day.' }),
    h('p.bd-sub.rp-noprint', {
      text: 'Tick the scenes being shot. Each one prints with its slug line, its '
          + 'length, what happens and everything tagged to it — one block per '
          + 'scene, never split across a page.'
    }),
    h('div.rp-tools.rp-noprint.pdf-menu-host', {}, [
      h('button.btn', { type: 'button', 'data-action': 'sides-all', text: 'Select all' }),
      h('button.btn', { type: 'button', 'data-action': 'sides-none', text: 'Clear' }),
      h('span.rp-count', { id: 'rp-sides-count', text: selectionLabel(scenes) }),
      h('span.rp-spacer'),
      actionMenu('Export', [
        { label: 'Print the sides', action: 'print-sides' },
        { label: 'Save as PDF',     action: 'pdf-sides', hint: 'A4' }
      ], { align: 'right' })
    ])
  );

  const picker = h('div.rp-picker.rp-noprint', { role: 'group', 'aria-label': 'Scenes to include in the sides' });
  for (const scene of scenes) {
    const number = numbers.get(scene.id);
    const box = h('input', {
      type: 'checkbox', 'data-action': 'side-toggle', 'data-scene': scene.id,
      'aria-label': 'Include scene ' + number + ' in the sides'
    });
    box.checked = selected.has(scene.id);
    picker.append(h('label.rp-pick', {}, [
      box,
      h('span.rp-pick-no', { text: number }),
      h('span.rp-pick-slug', { text: slugOf(scene) }),
      h('span.rp-pick-pages', { text: formatEighths(scene.eighths) })
    ]));
  }
  sec.append(picker);
  sec.append(h('div.rp-sides-out', { id: 'rp-sides-out' }, sidesBody(scenes, numbers)));
  return sec;
}

/** Selection changed: redraw only the block, so the checkbox keeps focus. */
function refreshSides() {
  const scenes = Scenes.listScenes();
  const numbers = sceneNumbers(scenes);
  const out = document.getElementById('rp-sides-out');
  if (out) out.replaceChildren(...sidesBody(scenes, numbers));
  const count = document.getElementById('rp-sides-count');
  if (count) count.textContent = selectionLabel(scenes);
}

/* ---- print -------------------------------------------------- */
/* One view at a time. The body class is what styles/reports.css keys
   its @media print rules off, and it comes off again afterwards so a
   later Ctrl-P prints the whole page. */
function printOnly(cls) {
  const body = document.body;
  body.classList.add(cls);
  const clear = () => {
    body.classList.remove(cls);
    window.removeEventListener('afterprint', clear);
  };
  window.addEventListener('afterprint', clear);
  window.print();
  // Safari fires afterprint unreliably; belt and braces.
  setTimeout(clear, 1000);
}

/* ---- PDF -----------------------------------------------------
   Same two views, through the print pipeline with a page setup, a
   running band and a filename. The body classes above are what
   reports.css already keys off, so lib/pdf.js is handed them
   rather than growing a second copy of these rules. */
function pdfReports() {
  const scenes = Scenes.listScenes();
  PDF.exportPDF({
    scope: 'reports',
    subtitle: plural(scenes.length, 'scene', 'scenes')
            + ' · ' + formatEighths(totalEighths(scenes)) + ' pages'
  });
}

function pdfSides() {
  const scenes = Scenes.listScenes();
  const chosen = scenes.filter((s) => selected.has(s.id));
  PDF.exportPDF({
    scope: 'sides',
    subtitle: plural(chosen.length, 'scene', 'scenes')
            + ' · ' + formatEighths(totalEighths(chosen)) + ' pages'
  });
}

/* ---- screen time (PRD 2.0 FR-602) ---------------------------
   An ESTIMATE, and the section says so in its first sentence. Beside
   every figure sits the page-a-minute rule it refines, so a reader can
   see when the two disagree — a dialogue-heavy page plays long, a page
   of terse action plays longer than its words — rather than trusting
   one number with no context. */
function renderScreenTime(scenes, numbers) {
  const sec = h('section.rp-sec', { id: 'screentime' });
  sec.append(
    h('p.bd-eyebrow', { text: 'Screen time' }),
    h('h2.bd-h2', { text: 'How long it will play.' }),
    h('p.bd-sub', { text: 'An estimate per scene from the script: dialogue at speaking pace, action by the rhythm of its sentences, '
      + 'two seconds to establish each heading. The page-a-minute figure is beside it; a scene with no script text uses that alone.' })
  );
  if (!scenes.length) {
    sec.append(h('p.bd-none', { text: 'No scenes yet. Import or write a script and the estimate appears here, scene by scene.' }));
    return sec;
  }
  const st = Analysis.screenTime(scenes, loadScript().elements);
  sec.append(h('div.bd-stats.rp-stats', {}, [
    stat(formatDuration(st.total), 'estimated running time'),
    stat(formatDuration(st.byPage), 'by page count'),
    stat(st.fromScript + ' / ' + scenes.length, 'scenes read from the script')
  ]));
  /* With the songs counted, against the film's target: see
     runtimeEstimate() for why a timed song REPLACES its scenes. */
  sec.append(renderRuntime(st, scenes, numbers));
  wireRuntime();
  /* The pairing is by heading, not by position (matchScenes()), and
     whatever it could not pair is said here rather than guessed at. */
  const notes = Analysis.describeMatch(st.match);
  if (notes.length) sec.append(h('p.bd-match-note', { text: notes.join(' ') }));
  const table = h('table.scene-table.rp-table');
  table.append(h('caption.rp-caption', { text: 'Estimated screen time per scene, against the page-a-minute rule.' }));
  table.append(h('thead', {}, [h('tr', {}, [th('Scene'), th('Slug line'), th('Estimate', 'numeric'), th('By pages', 'numeric'), th('Dialogue words', 'numeric'), th('Read from')])]));
  const body = h('tbody');
  for (const r of st.rows) {
    body.append(h('tr', {}, [
      td(numbers.get(r.scene.id) || r.scene.number || '\u2014', 'mono'),
      td(r.heading || slugOf(r.scene), 'loc'),
      td(formatDuration(r.seconds), 'numeric'),
      td(formatDuration(r.byPage), 'numeric'),
      td(r.method === 'script' ? String(r.dialogueWords) : '\u2014', 'numeric'),
      td(r.method !== 'script' ? 'page count' : r.how === 'position' ? 'script, by position' : 'script', 'mono')
    ]));
  }
  table.append(body);
  sec.append(h('div.rp-scroll', {}, [table]));
  return sec;
}

/* ---- running time with the songs, against a target ----------
   The estimate above is read off the pages, and a song is barely on
   the page. So the songs' own lengths are added (a timed song stands
   in for the scenes linked to it — runtimeEstimate()), and the sum
   is set against a target the producer types, overall and per act.

   The per-act target is the target times the act's conventional
   share in the Story page's framework (frameworks.json pacing), the
   same share the Write page's outline meter uses. Scenes reach an
   act through their `beatId`; a song through its linked scenes, else
   its own Save the Cat placement. Everything here is derived on
   render; the only things stored are what a person types — the
   target (inside the songs blob) and each song's length (a field on
   the song). */
function runtimeGroups(scenes) {
  let fwId = '';
  try { fwId = loadStory().framework || ''; } catch (e) { fwId = ''; }
  let acts = [];
  try { acts = actsOf(fwId); } catch (e) { acts = []; }
  const actOf = new Map();
  const beatOrder = new Map();
  let n = 0;
  acts.forEach((a) => a.beats.forEach((b) => { actOf.set(b.id, a); beatOrder.set(b.id, n++); }));
  const beatOfId = (id) => { try { const r = resolveBeat(id, fwId); return r ? r.beat : null; } catch (e) { return null; } };
  const songBeat = (song) => {
    const linked = scenes.find((s) => s.songId === song.id && beatOfId(s.beatId));
    if (linked) return beatOfId(linked.beatId);
    const p = String(song.placement || '');
    if (!p) return null;
    return beatOfId(p.includes(':') ? p : qualify('save_the_cat', p));
  };
  const actGroup = (b) => {
    const a = b && actOf.get(b.id);
    return a ? { key: 'act' + a.act, label: a.label, order: a.act, share: a.share } : null;
  };
  const beatGroup = (b) => (b && actOf.has(b.id)
    ? { key: 'beat:' + b.id, label: b.label + ' · ' + actOf.get(b.id).label, order: beatOrder.get(b.id), share: 0 }
    : null);
  return {
    byAct: { groupOf: (s) => actGroup(beatOfId(s && s.beatId)), songGroupOf: (s) => actGroup(songBeat(s)) },
    byBeat: { groupOf: (s) => beatGroup(beatOfId(s && s.beatId)), songGroupOf: (s) => beatGroup(songBeat(s)) }
  };
}

function fmtDelta(d) {
  if (!d) return 'on target';
  return (d > 0 ? '+' : '−') + formatDuration(Math.abs(d));
}

function renderRuntime(st, scenes, numbers) {
  const box = h('div.rt-box', { id: 'runtime' });
  const songs = listSongs();
  const targetMin = getTargetMinutes();
  const groups = runtimeGroups(scenes);
  const songIn = songs.map((s) => ({ id: s.id, seconds: durationSeconds(s), placement: s.placement }));
  const est = Analysis.runtimeEstimate(st, songIn, { targetSeconds: targetMin * 60, ...groups.byAct });
  const byBeat = Analysis.runtimeEstimate(st, songIn, { targetSeconds: 0, ...groups.byBeat });

  box.append(h('h3.rp-h3', { text: 'With the songs, against your target' }));

  const field = h('div.rt-field');
  field.append(h('label', { for: 'rt-target', text: 'Target running time, in minutes' }));
  const input = h('input#rt-target.rt-target', {
    type: 'number', min: '1', max: '600', step: '1', inputmode: 'numeric',
    placeholder: 'e.g. 140', 'data-rt-field': 'target'
  });
  input.value = targetMin ? String(targetMin) : '';
  field.append(input);
  box.append(field);

  box.append(h('div.bd-stats.rp-stats', {}, [
    stat(formatDuration(est.total), 'estimated, songs included'),
    stat(targetMin ? formatDuration(est.target) : '—', targetMin ? 'target' : 'no target set'),
    stat(targetMin ? fmtDelta(est.delta) : '—', targetMin ? (est.delta > 0 ? 'over the target' : est.delta < 0 ? 'under the target' : 'difference') : 'difference')
  ]));

  const said = [];
  if (!songs.length) said.push('No songs on the list, so this is the page estimate alone.');
  else {
    said.push(`${plural(est.songsTimed, 'song has', 'songs have')} a length, adding ${formatDuration(est.songSeconds)}.`);
    if (est.songsUntimed) said.push(`${plural(est.songsUntimed, 'song has', 'songs have')} no length yet and add${est.songsUntimed === 1 ? 's' : ''} nothing — give each one below.`);
    if (est.coveredScenes) said.push(`${plural(est.coveredScenes, 'scene linked to a timed song uses', 'scenes linked to timed songs use')} the song’s length instead of the page estimate, so nothing is counted twice.`);
  }
  box.append(h('p.bd-match-note', { text: said.join(' ') }));

  if (songs.length) {
    const t = h('table.scene-table.rp-table.rt-songs');
    t.append(h('caption.rp-caption', { text: 'Each song’s length, as m:ss (4:30). The recording decides it, not the page.' }));
    t.append(h('thead', {}, [h('tr', {}, [th('No.'), th('Song'), th('Kind'), th('Length'), th('Linked scenes', 'numeric')])]));
    const body = h('tbody');
    for (const s of songs) {
      const linked = scenes.filter((x) => x.songId === s.id);
      const name = String(s.title || '').trim() || 'Untitled song';
      const len = h('input.rt-len', {
        type: 'text', inputmode: 'decimal', placeholder: '4:30', autocomplete: 'off',
        'data-rt-field': 'song-duration', 'data-song': s.id,
        'aria-label': 'Length of song ' + (s.number || '') + ': ' + name
      });
      len.value = s.duration || '';
      body.append(h('tr', {}, [
        td(String(s.number || ''), 'mono'),
        td(name, 'loc'),
        td(kindLabel(s.kind)),
        h('td', {}, [len]),
        td(linked.length ? linked.map((x) => numbers.get(x.id) || x.number).join(', ') : '—', 'numeric')
      ]));
    }
    t.append(body);
    box.append(h('div.rp-scroll', {}, [t]));
  }

  if (est.groups.length) {
    const t = h('table.scene-table.rp-table.rt-acts');
    t.append(h('caption.rp-caption', { text: targetMin
      ? 'Per act, against the target split by each act’s conventional share of the story framework.'
      : 'Per act. Set a target above to see each act against its share of it.' }));
    t.append(h('thead', {}, [h('tr', {}, [th('Act'), th('Scenes', 'numeric'), th('Songs', 'numeric'), th('Estimate', 'numeric'), th('Target', 'numeric'), th('Difference', 'numeric')])]));
    const body = h('tbody');
    const row = (g, label) => h('tr', {}, [
      h('th.loc', { scope: 'row', text: label }),
      td(String(g.sceneCount), 'numeric'), td(String(g.songCount), 'numeric'),
      td(formatDuration(g.seconds), 'numeric'),
      td(g.target ? formatDuration(g.target) : '—', 'numeric'),
      td(g.target ? fmtDelta(g.delta) : '—', 'numeric')
    ]);
    est.groups.forEach((g) => body.append(row(g, g.label)));
    if (est.ungrouped) body.append(row(est.ungrouped, 'Not linked to a beat'));
    t.append(body);
    box.append(h('div.rp-scroll', {}, [t]));
  } else {
    box.append(h('p.bd-none', { text: 'No scene is linked to a story beat yet, so there is no per-act split. '
      + 'Link scenes to beats on the Write page’s Outline and each act appears here against its share of the target.' }));
  }

  if (byBeat.groups.length) {
    const t = h('table.scene-table.rp-table.rt-beats');
    t.append(h('caption.rp-caption', { text: 'Per beat, in story order. A beat has no target of its own; the act does.' }));
    t.append(h('thead', {}, [h('tr', {}, [th('Beat'), th('Scenes', 'numeric'), th('Songs', 'numeric'), th('Estimate', 'numeric'), th('Share of the film', 'numeric')])]));
    const body = h('tbody');
    byBeat.groups.forEach((g) => body.append(h('tr', {}, [
      h('th.loc', { scope: 'row', text: g.label }),
      td(String(g.sceneCount), 'numeric'), td(String(g.songCount), 'numeric'),
      td(formatDuration(g.seconds), 'numeric'),
      td(byBeat.total ? Math.round((g.seconds / byBeat.total) * 100) + '%' : '—', 'numeric')
    ])));
    t.append(body);
    box.append(h('div.rp-scroll', {}, [t]));
  }
  return box;
}

/* Wired once, from renderScreenTime(). A change saves, then the
   runtime box alone is rebuilt — after the focus has moved, so a Tab
   out of one length lands in the next one rather than being thrown
   back to the top of the page. */
function wireRuntime() {
  if (wireRuntime.done) return;
  wireRuntime.done = true;
  delegate(document, 'change', '[data-rt-field]', (e, el) => {
    const f = el.getAttribute('data-rt-field');
    if (f === 'target') setTargetMinutes(el.value);
    else if (f === 'song-duration') updateSong(el.getAttribute('data-song'), { duration: el.value });
    else return;
    setTimeout(() => {
      const old = document.getElementById('runtime');
      if (!old) return;
      const a = document.activeElement;
      const again = a && a.closest && a.closest('#runtime') && a.getAttribute('data-rt-field')
        ? '[data-rt-field="' + a.getAttribute('data-rt-field') + '"]'
          + (a.getAttribute('data-song') ? '[data-song="' + CSS.escape(a.getAttribute('data-song')) + '"]' : '')
        : null;
      const scenes = Scenes.listScenes();
      old.replaceWith(renderRuntime(Analysis.screenTime(scenes, loadScript().elements), scenes, sceneNumbers(scenes)));
      if (again) { const n = document.querySelector(again); if (n) n.focus(); }
    }, 0);
  });
}

/* ---- the cast matrix (PRD 2.0 FR-604) ------------------------
   Characters down, scenes across. A character is in a scene if the
   breakdown tags them OR the script gives them a cue there — the union,
   because an unfinished breakdown and an unwritten scene are both
   ordinary. Dense scenes (many of the cast at once) are the expensive
   days to schedule, so they are named, not just shaded. */
function renderCastMatrix(scenes, numbers) {
  const sec = h('section.rp-sec', { id: 'cast-matrix' });
  sec.append(
    h('p.bd-eyebrow', { text: 'Cast matrix' }),
    h('h2.bd-h2', { text: 'Who is in what, and with whom.' }),
    h('p.bd-sub', { text: 'Every character against every scene, from the breakdown\u2019s cast tags and the script\u2019s cues. '
      + 'The pairs who share the most scenes and the scenes that call the most of the cast are the scheduling constraints.' })
  );
  const cm = scenes.length ? Analysis.castMatrix(scenes, loadScript().elements) : null;
  if (!cm || !cm.characters.length) {
    sec.append(h('p.bd-none', { text: 'No cast yet. Tag cast on the breakdown or write character cues in the script, and the grid fills in.' }));
    return sec;
  }
  const notes = Analysis.describeMatch(cm.match);
  if (notes.length) sec.append(h('p.bd-match-note', { text: 'Cues are read only from scenes matched to a heading. ' + notes.join(' ') }));
  const table = h('table.scene-table.rp-table.rp-matrix');
  table.append(h('caption.rp-caption', { text: `${plural(cm.characters.length, 'character', 'characters')} across ${plural(scenes.length, 'scene', 'scenes')}. \u25CF in the scene; the last row counts the cast each scene calls.` }));
  const head = h('tr', {}, [th('Character'), th('Scenes', 'numeric')]);
  cm.density.forEach((d) => head.append(h('th.rp-mx-col' + (d.high ? '.is-dense' : ''), { scope: 'col', text: numbers.get(d.scene.id) || d.scene.number || '\u2014' })));
  table.append(h('thead', {}, [head]));
  const body = h('tbody');
  for (const c of cm.characters) {
    const row = h('tr', {}, [h('th.loc', { scope: 'row', text: c.name }), td(String(c.scenes.size), 'numeric')]);
    cm.density.forEach((d) => {
      const on = c.scenes.has(d.scene.id);
      row.append(h('td.rp-mx-cell' + (on ? '.is-on' : '') + (d.high ? '.is-dense' : ''), {
        text: on ? '\u25CF' : '', 'aria-label': on ? `${c.name} in scene ${numbers.get(d.scene.id) || d.scene.number}` : undefined
      }));
    });
    body.append(row);
  }
  const foot = h('tr', {}, [h('th.loc', { scope: 'row', text: 'Cast called' }), td('')]);
  cm.density.forEach((d) => foot.append(td(String(d.count), 'numeric' + (d.high ? ' is-dense' : ''))));
  table.append(body, h('tfoot', {}, [foot]));
  sec.append(h('div.rp-scroll', {}, [table]));

  const cols = h('div.rp-mx-notes');
  const pairs = cm.interactions.slice(0, 8);
  const pl = h('div.rp-mx-note', {}, [h('h3.rp-h3', { text: 'Most scenes together' })]);
  if (pairs.length) {
    const ol = h('ol.rp-mx-list');
    pairs.forEach((p) => ol.append(h('li', { text: `${p.a.name} & ${p.b.name} \u2014 ${plural(p.shared, 'scene', 'scenes')}` })));
    pl.append(ol);
  } else pl.append(h('p.bd-none', { text: 'No two characters share a scene yet.' }));
  const dense = cm.density.filter((d) => d.high);
  const dl = h('div.rp-mx-note', {}, [h('h3.rp-h3', { text: `Dense scenes (${cm.threshold}+ cast)` })]);
  if (dense.length) {
    const ol = h('ol.rp-mx-list');
    dense.forEach((d) => ol.append(h('li', { text: `Scene ${numbers.get(d.scene.id) || d.scene.number} \u2014 ${slugOf(d.scene)}: ${d.count} cast` })));
    dl.append(ol);
  } else dl.append(h('p.bd-none', { text: 'No scene calls more than a handful of the cast.' }));
  cols.append(pl, dl);
  sec.append(cols);
  return sec;
}

/* ============================================================
   THE SHOOT DAYS — one-liner, DPR, equipment
   ------------------------------------------------------------
   Three more views, and the first two pieces of this page that
   STORE anything: the DPR and the kit are facts about a shoot day,
   kept inside fms_locations_v1 by src/lib/dpr.js (no new key). The
   scenes are still only read — planned against shot is shoot.html's
   mark, and this page has no control that changes it.

   Which day is open is memory only, like the sides selection; the
   one way in from outside is `?day=N`, which the shoot day's
   "End of day → DPR" link passes.
   ============================================================ */
let rpDay = (() => {
  try { return parseInt(new URLSearchParams(location.search).get('day'), 10) || null; } catch (e) { return null; }
})();

function openDayOf(days) {
  if (!days.length) return 0;
  if (!rpDay || !days.some((d) => d.day === rpDay)) rpDay = Shoot.pickDay();
  return rpDay;
}

/* "2026-11-02" → "Mon 2 Nov". Built from the parts: `new Date(iso)`
   reads a bare date as UTC midnight and prints yesterday west of
   Greenwich. Anything that is not a date prints as typed. */
function shortDate(iso, long) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.toLocaleDateString(undefined, long
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { weekday: 'short', day: 'numeric', month: 'short' });
}

function dayPicker(id, days, day) {
  const sel = h('select.rp-day-sel', { id, 'data-action': 'rp-day' });
  for (const d of days) {
    const o = h('option', { value: String(d.day), text: 'Day ' + d.day + (d.date ? ' · ' + shortDate(d.date) : '') });
    if (d.day === day) o.selected = true;
    sel.append(o);
  }
  return h('span.rp-day', {}, [h('label.rp-day-lab', { for: id, text: 'Shoot day' }), sel]);
}

const noDays = (what) => h('p.bd-none', {}, [
  h('span', { text: 'No scene is on a shoot day yet. ' + what + ' ' }),
  h('a', { href: 'stripboard.html#stripboard', text: 'Schedule them on the stripboard →' })
]);

/* ---- the one-liner ------------------------------------------ */
function renderOneLiner(scenes) {
  const sec = h('section.rp-sec', { id: 'oneliner', 'data-tab-label': 'One-liner' });
  sec.append(
    h('p.bd-eyebrow.rp-noprint', { text: 'One-liner' }),
    h('h2.bd-h2.rp-noprint', { text: 'The whole shoot, one line a scene.' }),
    h('p.bd-sub.rp-noprint', {
      text: 'Day by day in shooting order: scene, interior or exterior, day or night, where, how long in '
          + 'eighths and the cast by number — with the board’s banners in place and a page total under every day.'
    })
  );
  if (!scenes.length) {
    sec.append(h('p.bd-none', { text: 'No scenes yet. The one-liner is the schedule printed small; it needs scenes on days.' }));
    return sec;
  }
  sec.append(h('div.rp-tools.rp-noprint.pdf-menu-host', {}, [
    actionMenu('Export', [
      { label: 'Print the one-liner', action: 'print-oneliner' },
      { label: 'Save as PDF',         action: 'pdf-oneliner', hint: 'A4' }
    ])
  ]));
  const ol = DPR.oneLiner(scenes);
  const target = DPR.pageTarget();
  if (!ol.days.length) sec.append(noDays('Until then every scene is listed below as unscheduled.'));

  const table = h('table.scene-table.rp-table.rp-ol');
  table.append(h('caption.rp-caption', {
    text: `${plural(ol.days.length, 'shoot day', 'shoot days')} · ${formatEighths(ol.eighths)} pages · cast by number, key below`
  }));
  table.append(h('thead', {}, [h('tr', {}, [
    th('Day'), th('Date'), th('Sc'), th('I/E'), th('D/N'), th('Set'), th('Pages', 'numeric'), th('Cast')
  ])]));
  const line = (dayNo, date, r) => h('tr.rp-ol-row', {}, [
    td(dayNo ? 'D' + dayNo : '—', 'mono'),
    td(date ? shortDate(date) : '', 'mono'),
    td(r.number || '—', 'mono'),
    td(r.intExt, 'mono'), td(r.dayNight, 'mono'),
    td(r.slug || 'Location not set', 'loc'),
    td(r.pages, 'numeric'),
    td(r.cast.join(', '), 'mono')
  ]);
  const band = (cls, text) => h('tr.' + cls, {}, [h('th', { scope: 'rowgroup', colspan: '8', text })]);
  for (const d of ol.days) {
    const body = h('tbody.rp-ol-day');
    const over = DPR.dayLoad(d.eighths, target).over;
    body.append(band('rp-ol-head', `Day ${d.day}` + (d.date ? ' · ' + shortDate(d.date, true) : '')));
    for (const it of d.items) {
      if (it.type === 'scene') body.append(line(d.day, d.date, it));
      else body.append(h('tr.rp-ol-banner', {}, [h('td', { colspan: '8', text: DPR.bannerText(it.banner) })]));
    }
    body.append(h('tr.rp-ol-total' + (over ? '.is-over' : ''), {}, [
      h('td', { colspan: '6', text: `End of Day ${d.day}` + (over ? ` · over the ${formatEighths(target)}-page target` : '') }),
      td(d.pages, 'numeric'), td('')
    ]));
    table.append(body);
  }
  if (ol.unscheduled.length) {
    const body = h('tbody.rp-ol-day');
    body.append(band('rp-ol-head', 'Not scheduled yet'));
    ol.unscheduled.forEach((r) => body.append(line(0, '', r)));
    table.append(body);
  }
  sec.append(h('div.rp-scroll', {}, [table]));
  if (ol.legend.length) {
    const key = h('p.rp-ol-key');
    key.append(h('strong', { text: 'Cast: ' }));
    key.append(h('span', { text: ol.legend.map((c) => c.number + ' ' + c.name).join(' · ') }));
    sec.append(key, h('p.rp-card-note', { text: 'Numbered by scene count, most first, from the breakdown’s cast tags — they renumber if the tagging changes.' }));
  }
  return sec;
}

/* ---- the DPR ------------------------------------------------ */
function renderDPR(scenes) {
  const sec = h('section.rp-sec', { id: 'dpr', 'data-tab-label': 'DPR' });
  fillDPR(sec, scenes);
  return sec;
}

function fillDPR(sec, scenes) {
  const list = scenes || Scenes.listScenes();
  const out = [
    h('p.bd-eyebrow.rp-noprint', { text: 'Daily production report' }),
    h('h2.bd-h2.rp-noprint', { text: 'What the day did.' }),
    h('p.bd-sub.rp-noprint', {
      text: 'Times, setups, delays, incidents and weather are typed here. What was planned and what was shot are '
          + 'not: they come from the schedule and from the marks made on the shoot day, so the report cannot '
          + 'disagree with the floor.'
    })
  ];
  const days = Shoot.days(list);
  if (!days.length) {
    out.push(noDays('The report is written against a day.'), offlineBlock());
    sec.replaceChildren(...out);
    paintOffline();
    return;
  }
  const day = openDayOf(days);
  const d = days.find((x) => x.day === day) || days[0];
  const sum = DPR.dprSummary(d.day, list);
  const rec = sum.record;
  const numbers = sceneNumbers(list);

  out.push(h('div.rp-tools.rp-noprint.pdf-menu-host', {}, [
    dayPicker('rp-dpr-day', days, d.day),
    h('a.btn', { href: 'shoot.html', text: 'Mark scenes on the shoot day' }),
    h('span.rp-spacer'),
    actionMenu('Export', [
      { label: 'Print the DPR', action: 'print-dpr' },
      { label: 'Save as PDF',   action: 'pdf-dpr', hint: 'A4' }
    ], { align: 'right' })
  ]));

  const sheet = h('div.rp-dpr', { 'data-day': String(d.day) });
  sheet.append(h('h3.rp-dpr-title', {
    text: `Day ${d.day} of ${days.length}` + (d.date ? ' · ' + shortDate(d.date, true) : ' · no date set')
        + (d.locations.length ? ' · ' + d.locations.join(', ') : '')
  }));
  sheet.append(h('div.bd-stats.rp-stats', { id: 'rp-dpr-derived' }, dprStats(sum)));

  /* Times. `type="time"` gives a phone its wheel and stores "07:30". */
  const times = h('div.rp-dpr-times');
  for (const f of DPR.DPR_TIMES) {
    const id = 'dpr-' + f.id;
    const input = h('input.rp-in', { id, type: 'time', 'data-dpr-field': f.id });
    input.value = rec[f.id];
    times.append(h('div.rp-field', {}, [h('label.rp-label', { for: id, text: f.label }), input]));
  }
  sheet.append(h('h4.rp-h4', { text: 'Times' }), times, h('p.rp-dpr-calc', { id: 'rp-dpr-calc', text: calcLine(sum) }));

  /* Planned against shot — read from the shoot day, never edited here. */
  sheet.append(h('h4.rp-h4', { text: 'Scenes planned and shot' }));
  const st = h('table.scene-table.rp-table.rp-dpr-scenes');
  st.append(h('thead', {}, [h('tr', {}, [th('Scene'), th('Slug line'), th('Pages', 'numeric'), th('On the day')])]));
  const sb = h('tbody');
  for (const s of sum.planned) {
    sb.append(h('tr', {}, [
      td(numbers.get(s.id) || s.number || '—', 'mono'),
      td(slugOf(s), 'loc'),
      td(formatEighths(s.eighths), 'numeric'),
      h('td', {}, [h('span.rp-mark.is-' + (s.shotState || 'none'), { text: s.shotState ? Scenes.shotLabel(s.shotState) : 'Not marked' })])
    ]));
  }
  st.append(sb);
  sheet.append(h('div.rp-scroll', {}, [st]));
  if (sum.pickups.length) {
    sheet.append(h('p.rp-card-note', {
      text: 'Also marked on this date, from other days: '
          + sum.pickups.map((s) => 'scene ' + (numbers.get(s.id) || s.number) + ' (Day ' + Locations.shootDayOf(s) + ')').join(', ') + '.'
    }));
  }

  /* Setups and weather. */
  const setups = h('input.rp-in', { id: 'dpr-setups', type: 'number', min: '0', inputmode: 'numeric', 'data-dpr-field': 'setups' });
  setups.value = rec.setups;
  const weather = h('input.rp-in', { id: 'dpr-weather', type: 'text', placeholder: 'Clear, 34°, rain after 4pm', 'data-dpr-field': 'weather' });
  weather.value = rec.weather;
  sheet.append(h('div.rp-dpr-times', {}, [
    h('div.rp-field', {}, [h('label.rp-label', { for: 'dpr-setups', text: 'Setups' }), setups]),
    h('div.rp-field.is-wide', {}, [h('label.rp-label', { for: 'dpr-weather', text: 'Weather' }), weather])
  ]));

  /* Delays. */
  sheet.append(h('h4.rp-h4', { text: 'Delays' }));
  const dl = h('div.rp-rows');
  if (!rec.delays.length) dl.append(h('p.rp-card-note', { text: 'No delays logged.' }));
  rec.delays.forEach((x, i) => {
    const reason = h('select.rp-in', { 'data-dpr-delay': x.id, 'data-field': 'reason', 'aria-label': 'Delay ' + (i + 1) + ' reason' });
    const reasons = DPR.DELAY_REASONS.includes(x.reason) ? DPR.DELAY_REASONS : DPR.DELAY_REASONS.concat(x.reason);
    reasons.forEach((r) => { const o = h('option', { value: r, text: r }); if (r === x.reason) o.selected = true; reason.append(o); });
    const mins = h('input.rp-in.rp-in-num', { type: 'number', min: '0', inputmode: 'numeric', 'data-dpr-delay': x.id, 'data-field': 'minutes', 'aria-label': 'Delay ' + (i + 1) + ' minutes', placeholder: 'min' });
    mins.value = x.minutes;
    const note = h('input.rp-in', { type: 'text', 'data-dpr-delay': x.id, 'data-field': 'note', 'aria-label': 'Delay ' + (i + 1) + ' note', placeholder: 'What happened' });
    note.value = x.note;
    dl.append(h('div.rp-row', {}, [reason, mins, note,
      h('button.btn.rp-x', { type: 'button', 'data-action': 'dpr-delay-remove', 'data-id': x.id, 'aria-label': 'Remove delay ' + (i + 1), text: 'Remove' })]));
  });
  dl.append(h('button.btn.rp-noprint', { type: 'button', 'data-action': 'dpr-delay-add', text: '+ Add a delay' }));
  sheet.append(dl);

  /* Injuries and incidents. */
  sheet.append(h('h4.rp-h4', { text: 'Injuries and incidents' }));
  const inc = h('div.rp-rows');
  if (!rec.incidents.length) inc.append(h('p.rp-card-note', { text: 'None reported.' }));
  rec.incidents.forEach((x, i) => {
    const what = h('input.rp-in', { type: 'text', 'data-dpr-incident': x.id, 'data-field': 'what', 'aria-label': 'Incident ' + (i + 1), placeholder: 'What happened, to whom' });
    what.value = x.what;
    const act = h('input.rp-in', { type: 'text', 'data-dpr-incident': x.id, 'data-field': 'action', 'aria-label': 'Incident ' + (i + 1) + ' action taken', placeholder: 'Action taken' });
    act.value = x.action;
    inc.append(h('div.rp-row.is-two', {}, [what, act,
      h('button.btn.rp-x', { type: 'button', 'data-action': 'dpr-incident-remove', 'data-id': x.id, 'aria-label': 'Remove incident ' + (i + 1), text: 'Remove' })]));
  });
  inc.append(h('button.btn.rp-noprint', { type: 'button', 'data-action': 'dpr-incident-add', text: '+ Add an incident' }));
  sheet.append(inc);

  const notes = h('textarea.rp-in.rp-notes', { id: 'dpr-notes', rows: '4', 'data-dpr-field': 'notes', placeholder: 'Anything the producer should read tonight' });
  notes.value = rec.notes;
  sheet.append(h('h4.rp-h4', {}, [h('label', { for: 'dpr-notes', text: 'Notes' })]), notes);

  out.push(sheet, offlineBlock());
  sec.replaceChildren(...out);
  paintOffline();
}

function dprStats(sum) {
  return [
    stat(sum.shot.length + ' / ' + sum.planned.length, 'scenes shot'),
    stat(sum.pagesShot + ' / ' + sum.pagesPlanned, 'pages shot'),
    stat(String(sum.part.length), 'part shot'),
    stat(String(sum.dropped.length), 'dropped'),
    stat(sum.record.setups || '—', 'setups'),
    stat(sum.delayMinutes ? DPR.formatMinutes(sum.delayMinutes) : '—', 'lost to delays')
  ];
}

function calcLine(sum) {
  const bits = [];
  if (sum.dayMinutes != null) bits.push('Call to wrap ' + DPR.formatMinutes(sum.dayMinutes));
  if (sum.lunchMinutes != null) bits.push('lunch ' + DPR.formatMinutes(sum.lunchMinutes));
  if (sum.workMinutes != null && sum.lunchMinutes != null) bits.push('worked ' + DPR.formatMinutes(sum.workMinutes));
  if (sum.callToFirstShot != null) bits.push('call to first shot ' + DPR.formatMinutes(sum.callToFirstShot));
  return bits.length ? bits.join(' · ') + '.' : 'Type the call and wrap times and the day’s length works itself out.';
}

/** A field changed: redraw only the numbers, so focus stays put. */
function refreshDPRNumbers() {
  const sheet = document.querySelector('.rp-dpr[data-day]');
  if (!sheet) return;
  const sum = DPR.dprSummary(parseInt(sheet.dataset.day, 10));
  const box = document.getElementById('rp-dpr-derived');
  if (box) box.replaceChildren(...dprStats(sum));
  const calc = document.getElementById('rp-dpr-calc');
  if (calc) calc.textContent = calcLine(sum);
}

/* ---- the offline pack ----------------------------------------
   The day's DATA is already on this device — it is localStorage.
   What a location with no signal loses is the PAGES: the shoot day,
   the call sheets and this one, by every address they are opened at.
   pwa.js asks the service worker to keep them, and the list below is
   read back out of the caches rather than promised. */
function offlineBlock() {
  return h('div.rp-offline.rp-noprint', { id: 'rp-offline' }, [
    h('h3.rp-h3', { text: 'Offline on set' }),
    h('p.rp-card-note', {
      text: 'Locations rarely have signal. This keeps the shoot day, the call sheets and the reports in this '
          + 'browser so they open with no network. The scenes and reports are already stored on this device; '
          + 'it is the pages themselves that need keeping.'
    }),
    h('button.btn.primary', { type: 'button', 'data-action': 'rp-offline', text: 'Make today available offline' }),
    h('ul.rp-offline-list', { id: 'rp-offline-list', 'aria-live': 'polite' })
  ]);
}

const PACK_LABEL = { 'shoot.html': 'Shoot day', 'contacts.html': 'Call sheets', 'reports.html': 'Reports, sides and DPR' };

function paintOffline(rows, note) {
  const ul = document.getElementById('rp-offline-list');
  if (!ul) return;
  if (!offlineSupported()) {
    ul.replaceChildren(h('li.rp-off.is-none', {
      text: 'No service worker is running on this page, so nothing can be kept offline here. Open the live site (or the installed app) once and try again.'
    }));
    return;
  }
  const draw = (list) => ul.replaceChildren(...list.map((r) => h('li.rp-off.' + (r.ready ? 'is-ok' : 'is-none'), {
    text: (PACK_LABEL[r.page] || r.page) + ' — ' + (r.ready
      ? 'ready offline (' + r.files + ' ' + (r.files === 1 ? 'file' : 'files') + (r.clean ? ', both addresses' : '') + ')'
      : 'not kept yet')
  })).concat(note ? [h('li.rp-off.is-note', { text: note })] : []));
  if (rows) { draw(rows); return; }
  offlineStatus(SHOOT_PACK).then(draw).catch(() => {});
}

/* ---- the kit ------------------------------------------------ */
function renderKit(scenes) {
  const sec = h('section.rp-sec', { id: 'kit', 'data-tab-label': 'Equipment' });
  fillKit(sec, scenes);
  return sec;
}

function fillKit(sec, scenes) {
  const list = scenes || Scenes.listScenes();
  const out = [
    h('p.bd-eyebrow.rp-noprint', { text: 'Equipment' }),
    h('h2.bd-h2.rp-noprint', { text: 'What goes on the truck.' }),
    h('p.bd-sub.rp-noprint', {
      text: 'A list per department for each shoot day — item, quantity, vendor, and a tick when it is picked up '
          + 'and when it goes back. Start it from the budget estimator’s kit lines, or from the day before.'
    })
  ];
  const days = Shoot.days(list);
  if (!days.length) { out.push(noDays('Kit is listed against a day.')); sec.replaceChildren(...out); return; }
  const day = openDayOf(days);
  const kit = DPR.getKit(day);
  const tally = DPR.kitTally(kit);
  const lines = DPR.readCalcLines().filter((l) => DPR.classifyEquipment(l.item));
  const prev = [...days].reverse().find((x) => x.day < day && DPR.kitTally(DPR.getKit(x.day)).items);

  const tools = h('div.rp-tools.rp-noprint.pdf-menu-host', {}, [dayPicker('rp-kit-day', days, day)]);
  if (lines.length) {
    tools.append(h('button.btn', { type: 'button', 'data-action': 'kit-seed', text: `Fill from the budget (${lines.length})` }));
  } else {
    tools.append(h('a.btn', { href: 'budget.html', text: 'No kit lines in the budget yet' }));
  }
  if (prev) tools.append(h('button.btn', { type: 'button', 'data-action': 'kit-copy', 'data-from': String(prev.day), text: `Copy from Day ${prev.day}` }));
  tools.append(h('span.rp-spacer'), actionMenu('Export', [
    { label: 'Print the kit list', action: 'print-kit' },
    { label: 'Save as PDF',        action: 'pdf-kit', hint: 'A4' }
  ], { align: 'right' }));
  out.push(tools);

  const sheet = h('div.rp-kit', { 'data-day': String(day) });
  sheet.append(h('h3#rp-kit-title.rp-dpr-title', { text: kitTitle(day, tally) }));
  const grid = h('div.rp-kit-grid');
  for (const dept of DPR.DEPARTMENTS) {
    const card = h('article.rp-card.rp-kit-dept');
    card.append(h('h4.rp-h4', { text: dept.label + (kit[dept.id].length ? ' · ' + kit[dept.id].length : '') }));
    if (kit[dept.id].length) {
      const t = h('table.rp-kit-table');
      t.append(h('thead', {}, [h('tr', {}, [th('Item'), th('Qty'), th('Vendor'), th('Out'), th('Back'), h('th', { scope: 'col' }, [h('span.visually-hidden', { text: 'Remove' })])])]));
      const tb = h('tbody');
      for (const x of kit[dept.id]) {
        const name = x.item || 'item';
        const cell = (field, label, value, extra = {}) => {
          const i = h('input.rp-in', { type: 'text', 'data-kit-item': x.id, 'data-field': field, 'aria-label': label + ' — ' + name, ...extra });
          i.value = value;
          return h('td', {}, [i]);
        };
        const tick = (field, label) => {
          const c = h('input', { type: 'checkbox', 'data-kit-item': x.id, 'data-field': field, 'aria-label': label + ' — ' + name });
          c.checked = !!x[field];
          return h('td.rp-kit-tick', {}, [c]);
        };
        tb.append(h('tr', {}, [
          cell('item', 'Item', x.item),
          cell('qty', 'Quantity', x.qty, { inputmode: 'numeric' }),
          cell('vendor', 'Vendor', x.vendor, { placeholder: 'Vendor' }),
          tick('pickup', 'Picked up'),
          tick('returned', 'Returned'),
          h('td', {}, [h('button.btn.rp-x', { type: 'button', 'data-action': 'kit-remove', 'data-id': x.id, 'aria-label': 'Remove ' + name, text: '×' })])
        ]));
      }
      t.append(tb);
      card.append(h('div.rp-scroll', {}, [t]));
    } else {
      card.append(h('p.rp-card-note', { text: 'Nothing listed.' }));
    }
    const addId = 'kit-add-' + dept.id;
    card.append(h('div.rp-kit-add.rp-noprint', {}, [
      h('input.rp-in', { id: addId, type: 'text', placeholder: 'Add to ' + dept.label.toLowerCase() + '…', 'data-kit-new': dept.id, 'aria-label': 'New ' + dept.label.toLowerCase() + ' item' }),
      h('button.btn', { type: 'button', 'data-action': 'kit-add', 'data-dept': dept.id, text: 'Add' })
    ]));
    grid.append(card);
  }
  sheet.append(grid);
  out.push(sheet);
  sec.replaceChildren(...out);
}

function kitTitle(day, tally) {
  return `Day ${day}` + (Locations.dayDate(day) ? ' · ' + shortDate(Locations.dayDate(day), true) : '')
    + ` · ${plural(tally.items, 'item', 'items')} · ${tally.picked} picked up · ${tally.back} returned`;
}

/** Re-fill one of the day sections in place. The SECTION element is
    kept — tabs.js owns its role and hidden state — only its children
    are replaced. `focus` is a selector to hand focus back to. */
function refill(id, focus) {
  const sec = document.getElementById(id);
  if (!sec) return;
  if (id === 'dpr') fillDPR(sec);
  else if (id === 'kit') fillKit(sec);
  try { StudioUI.autoAriaLabels(); } catch (e) { /* chrome may not be up */ }
  wireActionBar();
  if (focus) { const el = sec.querySelector(focus); if (el) el.focus(); }
}

/* ---- render ------------------------------------------------- */
function render() {
  const scenes = Scenes.listScenes();
  const ids = new Set(scenes.map((s) => s.id));
  // First visit selects everything, which is the useful default; after
  // that, drop ids for scenes that no longer exist.
  if (selected === null) selected = new Set(ids);
  else for (const id of [...selected]) if (!ids.has(id)) selected.delete(id);

  const numbers = sceneNumbers(scenes);
  const main = h('main', { id: 'main' });
  main.append(renderHeader(scenes));

  /* #reports and #sides are nav destinations (navigation.json), so
     they have to exist before any scene does — otherwise the phase
     menu resolves to nothing on exactly the studio that has never
     seen this page. See the note in breakdown.js's render(). */
  if (!scenes.length) {
    main.append(
      h('section.rp-sec', { id: 'reports' }, [renderEmpty()]),
      h('section.rp-sec', { id: 'sides' }, [
        h('p.bd-eyebrow.rp-noprint', { text: 'Sides' }),
        h('h2.bd-h2.rp-noprint', { text: 'Pages for the day.' }),
        h('p.bd-sub.rp-noprint', {
          text: 'Nothing to print yet. Once the breakdown has scenes you tick the '
              + 'ones being shot and each prints with its slug line, its length, '
              + 'what happens and everything tagged to it.'
        })
      ])
    );
  } else main.append(renderReports(scenes, numbers), renderSides(scenes, numbers));
  main.append(renderScreenTime(scenes, numbers), renderCastMatrix(scenes, numbers));
  main.append(renderOneLiner(scenes), renderDPR(scenes), renderKit(scenes));

  app.replaceChildren(main);
  mountShell();
  wireActionBar();
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[reports] chrome', e); }
}

/* ---- events — delegated, no inline handlers ----------------- */
delegate(document, 'change', '[data-action="side-toggle"]', (e, el) => {
  const id = el.dataset.scene;
  if (el.checked) selected.add(id); else selected.delete(id);
  refreshSides();
});
delegate(document, 'click', '[data-action="sides-all"]', () => {
  selected = new Set(Scenes.listScenes().map((s) => s.id));
  document.querySelectorAll('.rp-picker input[type="checkbox"]').forEach((b) => { b.checked = true; });
  refreshSides();
});
delegate(document, 'click', '[data-action="sides-none"]', () => {
  selected.clear();
  document.querySelectorAll('.rp-picker input[type="checkbox"]').forEach((b) => { b.checked = false; });
  refreshSides();
});
delegate(document, 'click', '[data-action="print-sides"]',   () => printOnly('rp-print-sides'));
delegate(document, 'click', '[data-action="print-reports"]', () => printOnly('rp-print-reports'));
delegate(document, 'click', '[data-action="pdf-sides"]',     () => pdfSides());
delegate(document, 'click', '[data-action="pdf-reports"]',   () => pdfReports());

/* ---- the shoot days: one-liner, DPR, kit -------------------- */
const dayPdf = (scope, label, cls) => () => PDF.exportPDF({
  scope, label, setup: 'a4', classes: [cls],
  subtitle: scope === 'oneliner'
    ? plural(Shoot.days().length, 'shoot day', 'shoot days') + ' · ' + formatEighths(totalEighths(Scenes.listScenes())) + ' pages'
    : 'Day ' + rpDay + (Locations.dayDate(rpDay) ? ' · ' + shortDate(Locations.dayDate(rpDay), true) : '')
});
delegate(document, 'click', '[data-action="print-oneliner"]', () => printOnly('rp-print-oneliner'));
delegate(document, 'click', '[data-action="print-dpr"]',      () => printOnly('rp-print-dpr'));
delegate(document, 'click', '[data-action="print-kit"]',      () => printOnly('rp-print-kit'));
delegate(document, 'click', '[data-action="pdf-oneliner"]', dayPdf('oneliner', 'One-liner', 'rp-print-oneliner'));
delegate(document, 'click', '[data-action="pdf-dpr"]',      dayPdf('dpr', 'Daily production report', 'rp-print-dpr'));
delegate(document, 'click', '[data-action="pdf-kit"]',      dayPdf('kit', 'Equipment', 'rp-print-kit'));

delegate(document, 'change', '[data-action="rp-day"]', (e, el) => {
  rpDay = parseInt(el.value, 10) || rpDay;
  const id = el.id;
  refill('dpr'); refill('kit');
  const again = document.getElementById(id);
  if (again) again.focus();
});

const dprDay = () => parseInt((document.querySelector('.rp-dpr[data-day]') || {}).dataset?.day, 10) || rpDay;
const kitDay = () => parseInt((document.querySelector('.rp-kit[data-day]') || {}).dataset?.day, 10) || rpDay;

delegate(document, 'change', '[data-dpr-field]', (e, el) => {
  DPR.saveDPR(dprDay(), { [el.dataset.dprField]: el.value });
  refreshDPRNumbers();
});
delegate(document, 'change', '[data-dpr-delay]', (e, el) => {
  DPR.updateDelay(dprDay(), el.dataset.dprDelay, { [el.dataset.field]: el.value });
  refreshDPRNumbers();
});
delegate(document, 'change', '[data-dpr-incident]', (e, el) => {
  DPR.updateIncident(dprDay(), el.dataset.dprIncident, { [el.dataset.field]: el.value });
});
delegate(document, 'click', '[data-action="dpr-delay-add"]', () => {
  const x = DPR.addDelay(dprDay());
  refill('dpr', `[data-dpr-delay="${CSS.escape(x.id)}"]`);
});
delegate(document, 'click', '[data-action="dpr-incident-add"]', () => {
  const x = DPR.addIncident(dprDay());
  refill('dpr', `[data-dpr-incident="${CSS.escape(x.id)}"]`);
});
delegate(document, 'click', '[data-action="dpr-delay-remove"]', (e, el) => {
  DPR.removeDelay(dprDay(), el.dataset.id);
  refill('dpr', '[data-action="dpr-delay-add"]');
});
delegate(document, 'click', '[data-action="dpr-incident-remove"]', (e, el) => {
  DPR.removeIncident(dprDay(), el.dataset.id);
  refill('dpr', '[data-action="dpr-incident-add"]');
});

delegate(document, 'change', '[data-kit-item]', (e, el) => {
  const field = el.dataset.field;
  const value = el.type === 'checkbox' ? el.checked : el.value;
  DPR.updateKitItem(kitDay(), el.dataset.kitItem, { [field]: value });
  /* A tick changes only the tally; the row stays where the finger is. */
  const title = document.getElementById('rp-kit-title');
  if (title) title.textContent = kitTitle(kitDay(), DPR.kitTally(DPR.getKit(kitDay())));
});
function addKit(dept) {
  const input = document.querySelector(`[data-kit-new="${dept}"]`);
  const name = input ? input.value.trim() : '';
  if (!name) { if (input) input.focus(); return; }
  DPR.addKitItem(kitDay(), dept, { item: name });
  refill('kit', `[data-kit-new="${dept}"]`);
}
delegate(document, 'click', '[data-action="kit-add"]', (e, el) => addKit(el.dataset.dept));
delegate(document, 'keydown', '[data-kit-new]', (e, el) => {
  if (e.key === 'Enter') { e.preventDefault(); addKit(el.dataset.kitNew); }
});
delegate(document, 'click', '[data-action="kit-remove"]', (e, el) => {
  DPR.removeKitItem(kitDay(), el.dataset.id);
  refill('kit', '#rp-kit-day');
});
delegate(document, 'click', '[data-action="kit-seed"]', () => {
  const n = DPR.seedKitFromCalc(kitDay());
  refill('kit', '#rp-kit-day');
  toast(n ? `Added ${plural(n, 'line', 'lines')} from the budget.` : 'Every budget kit line is already on this day.');
});
delegate(document, 'click', '[data-action="kit-copy"]', (e, el) => {
  const from = parseInt(el.dataset.from, 10);
  const n = DPR.copyKit(from, kitDay());
  refill('kit', '#rp-kit-day');
  toast(n ? `Copied ${plural(n, 'item', 'items')} from Day ${from}, ticks cleared.` : `Everything on Day ${from} is already here.`);
});

delegate(document, 'click', '[data-action="rp-offline"]', (e, el) => {
  if (!offlineSupported()) { paintOffline(); return; }
  el.disabled = true;
  el.textContent = 'Keeping the pages…';
  makeOffline(SHOOT_PACK)
    .then((rows) => {
      const all = rows.every((r) => r.ready);
      paintOffline(rows, all ? 'Done. Turn on airplane mode and open the shoot day to check.' : 'Some pages could not be kept; try again with a connection.');
      toast(all ? 'Today is available offline.' : 'Some pages could not be kept offline.', { type: all ? 'info' : 'error' });
    })
    .catch(() => paintOffline(null, 'The service worker did not answer. Reload once and try again.'))
    .finally(() => { el.disabled = false; el.textContent = 'Make today available offline'; });
});

function toast(message, opts) {
  try { StudioUI.toast(message, Object.assign({ type: 'info' }, opts || {})); } catch (e) { /* chrome may not be up */ }
}

render();
