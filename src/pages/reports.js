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

/** One row per location, longest first — the order a schedule is built in. */
function byLocation(scenes, numbers) {
  const rows = new Map();
  for (const s of scenes) {
    const name = String(s.location || '').trim() || NO_LOCATION;
    const key = name.toLowerCase();
    if (!rows.has(key)) rows.set(key, { name, count: 0, eighths: 0, ie: {}, dn: {}, numbers: [] });
    const row = rows.get(key);
    row.count += 1;
    row.eighths += Number(s.eighths) || 0;
    row.ie[s.intExt] = (row.ie[s.intExt] || 0) + 1;
    row.dn[s.dayNight] = (row.dn[s.dayNight] || 0) + 1;
    row.numbers.push(numbers.get(s.id));
  }
  return [...rows.values()]
    .sort((a, b) => b.eighths - a.eighths || b.count - a.count || a.name.localeCompare(b.name));
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

const mix = (counts) => Object.entries(counts).map(([k, n]) => k + ' ' + n).join(' · ');
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
  sec.append(locationTable(byLocation(scenes, numbers), scenes));

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

render();
