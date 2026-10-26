/* ============================================================
   SHOT DIVISION EXPORT — one scene, or the whole script
   ------------------------------------------------------------
   A view of src/lib/shots.js sitting on src/lib/scenes.js, the
   same way src/pages/visualize.js is. Nothing here stores
   anything and nothing here is a second copy of a shot: the slug
   line, the scene number and the page eighths are read off the
   scene at export time, exactly as the screen reads them, so a
   location renamed in the breakdown is renamed on the sheet.

   TWO SCOPES, ONE BUILDER. `scope` is either a scene id or the
   string 'all'. Everything downstream — the document, the CSV,
   the filename, the subtitle — takes the same scope, because the
   moment "one scene" and "the whole script" are two code paths
   they are two formats, and the one nobody exercises is the one
   that is wrong on the day it is needed.

   WHAT AN AD ACTUALLY CARRIES. Scene number, slug line, page
   length in eighths, and then per shot: the number, the size, the
   angle, the movement, the lens and one line of what we see, with
   a box to tick. The totals at the foot are the ones that get
   read out in the production meeting — how many setups, over how
   many scenes, over how many pages, how many minutes.

   COLUMNS AND LAYOUT (20 Oct 2026). The screen's column menu is
   the export's column list: `columns` (Shots.SHOT_COLUMNS ids)
   picks what the PDF table and the CSV carry, and `layout` turns
   the PDF into a storyboard sheet of four or six panels a page.
   With neither, both renderers are exactly what they always were.

   NO COLOURS, NO SHAPES here. The rules live in
   styles/visualize.css under `body.pdf-shotlist`.
   ============================================================ */
import { h } from './dom.js';
import Scenes, { formatEighths, totalEighths } from './scenes.js';
import Shots, { SHOT_SIZES } from './shots.js';
import { aspectOf } from './board-frames.js';

export const ALL = 'all';

const sizeLabel = (id) => (SHOT_SIZES.find((s) => s.id === id) || { id }).id;
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/** The slug line, read off the scene. Never stored on a shot.
    Same shape as visualize.js's — deliberately, because two
    spellings of one slug line is two slug lines. */
export const slugOf = (scene) =>
  scene.intExt + '. ' + (scene.location || 'Location TBC') + ' — ' + scene.dayNight;

/* ------------------------------------------------------------
   THE ROWS
   ------------------------------------------------------------
   `groups(scope)` returns exactly what both renderers walk:
   [{ scene, shots }], in script order, with the orphan group last
   when the scope is the whole script.

   An orphan — a shot whose scene was deleted in the breakdown —
   is carried into the whole-script export on purpose. Silently
   hidden work is lost work, and a sheet that quietly omits four
   setups is worse than one that says where they came from.
   ------------------------------------------------------------ */
export function groups(scope) {
  const scenes = Scenes.listScenes();
  if (scope && scope !== ALL) {
    const scene = scenes.find((s) => s.id === scope);
    if (!scene) return [];
    return [{ scene, shots: Shots.listShots().filter((s) => s.sceneId === scene.id) }];
  }
  return Shots.shotsByScene(scenes);
}

/** The numbers at the foot, and the line under the title. Derived
    on every call; a stored count goes stale the first time a shot
    is deleted, which is the trap CLAUDE.md names. */
export function summarise(scope) {
  const gs = groups(scope);
  const shots = gs.reduce((n, g) => n + g.shots.length, 0);
  const withShots = gs.filter((g) => g.shots.length).length;
  const eighths = totalEighths(gs.map((g) => g.scene).filter(Boolean));
  const done = gs.reduce((n, g) => n + g.shots.filter((s) => s.done).length, 0);
  const minutes = gs.reduce((n, g) => n + Shots.minutesOf(g.shots).total, 0);
  return { groups: gs.length, scenes: gs.length, withShots, shots, done, eighths, minutes };
}

export function subtitleFor(scope) {
  const s = summarise(scope);
  if (scope && scope !== ALL) {
    const g = groups(scope)[0];
    return (g && g.scene ? 'Scene ' + (g.scene.number || '—') + ' · ' : '')
      + plural(s.shots, 'setup', 'setups');
  }
  return plural(s.shots, 'setup', 'setups')
    + ' · ' + plural(s.withShots, 'scene', 'scenes') + ' covered'
    + ' · ' + formatEighths(s.eighths) + ' pages';
}

export function labelFor(scope) {
  if (!scope || scope === ALL) return 'Shot division — whole script';
  const g = groups(scope)[0];
  return 'Shot division — scene ' + ((g && g.scene && g.scene.number) || '—');
}

/* ------------------------------------------------------------
   RENDERER 1 — the document
   ------------------------------------------------------------
   opts = {
     columns  the shot-list columns to print (Shots.SHOT_COLUMNS ids;
              the screen's column menu passes its own choice). Absent
              means every column, which is what the sheet always was.
     layout   'list' (the table), 'grid4' or 'grid6' (a storyboard
              sheet: four or six panels to a page, a frame each).
     imageFor (frame) => an image URL already held by this page visit,
              or ''. The page passes the Drive pictures it has on
              screen; the builder never fetches anything itself.
   }
   ------------------------------------------------------------ */
export const LAYOUTS = [
  { id: 'list',  label: 'List' },
  { id: 'grid4', label: '4-grid' },
  { id: 'grid6', label: '6-grid' }
];
export const layoutOf = (id) => (LAYOUTS.some((l) => l.id === id) ? id : 'list');

/** Rig and camera in one cell: "Gimbal · Cam A". Both read off the shot
    and the map; a camera deleted from the map prints nothing. */
function rigText(shot, cams) {
  const cam = Shots.camOf(shot, cams);
  return [String(shot.rig || '').trim(), cam ? cam.name : ''].filter(Boolean).join(' · ');
}

/* Every printable column: its head, its cell class and its text. */
const PRINT_COLS = {
  size:        ['Size', 'vz-pr-c-spec', (s) => sizeLabel(s.size)],
  angle:       ['Angle', 'vz-pr-c-spec', (s) => s.angle],
  movement:    ['Move', 'vz-pr-c-spec', (s) => s.movement],
  lens:        ['Lens', 'vz-pr-c-spec', (s) => s.lens || '—'],
  rig:         ['Light / rig', 'vz-pr-c-spec', (s, cams, cols) =>
    (cols.includes('setup') ? String(s.rig || '').trim() : rigText(s, cams)) || '—'],
  setup:       ['Setup', 'vz-pr-c-spec', (s, cams) => Shots.setupOf(s, cams) || '—'],
  mins:        ['Min', 'vz-pr-c-min', (s) => { const m = Shots.shotMinutes(s); return m ? String(m) : '—'; }],
  description: ['What we see', 'vz-pr-c-desc', (s) => s.description || '—'],
  done:        ['✓', 'vz-pr-c-done', (s) => (s.done ? '✓' : '☐')]
};

function sceneMeta(group) {
  const t = Shots.formatMinutes(Shots.minutesOf(group.shots).total);
  return (group.scene ? formatEighths(group.scene.eighths) + ' pages · ' : '')
    + (group.shots.length ? plural(group.shots.length, 'setup', 'setups') : 'no setups')
    + (t ? ' · ' + t : '');
}

function sceneHead(group) {
  const scene = group.scene;
  return h('div.vz-pr-head', {}, [
    h('span.vz-pr-no', { text: scene ? (scene.number || '—') : '!' }),
    h('span.vz-pr-slug', { text: scene ? slugOf(scene) : 'Scene deleted in the breakdown' }),
    h('span.vz-pr-meta', { text: sceneMeta(group) })
  ]);
}

function sceneBlock(group, cols) {
  const scene = group.scene;
  const block = h('section.vz-pr-scene');
  block.append(sceneHead(group));

  if (scene && scene.synopsis) {
    block.append(h('p.vz-pr-syn', { text: scene.synopsis }));
  }

  if (!group.shots.length) {
    block.append(h('p.vz-pr-none', { text: 'No shot division for this scene yet.' }));
    return block;
  }

  const table = h('table.vz-pr-table');
  const head = h('tr');
  head.append(h('th.vz-pr-c-no', { scope: 'col', text: 'Shot' }));
  cols.forEach((id) => head.append(h('th.' + PRINT_COLS[id][1], { scope: 'col', text: PRINT_COLS[id][0] })));
  table.append(h('thead', {}, [head]));

  const body = h('tbody');
  const cams = scene ? Shots.sceneCameras(scene.id) : [];
  group.shots.forEach((shot, i) => {
    const row = h('tr');
    row.append(h('td.vz-pr-c-no', { text: shot.number || String(i + 1) }));
    cols.forEach((id) => row.append(h('td.' + PRINT_COLS[id][1], { text: PRINT_COLS[id][2](shot, cams, cols) })));
    body.append(row);
  });
  table.append(body);
  block.append(table);
  return block;
}

/** The panels of a storyboard sheet for one scene: a panel per frame,
    and one per shot that has no frame yet (an empty box to draw in). */
export function panelsOf(group, byShot = Shots.framesByShot()) {
  const out = [];
  group.shots.forEach((shot, i) => {
    const frames = byShot.get(shot.id) || [];
    if (!frames.length) out.push({ shot, i, frame: null, n: 0 });
    frames.forEach((frame, n) => out.push({ shot, i, frame, n }));
  });
  return out;
}

function panel({ shot, i, frame, n }, cols, imageFor, cams) {
  const label = (shot.number || String(i + 1)) + (frame ? String.fromCharCode(97 + n) : '');
  const spec = ['size', 'angle', 'movement', 'lens', 'setup', 'mins']
    .filter((id) => cols.includes(id))
    .map((id) => PRINT_COLS[id][2](shot, cams, cols))
    .filter((t) => t && t !== '—');
  const pic = frame && imageFor ? imageFor(frame) : '';
  const box = h('div.vz-pr-pic', { 'data-aspect': frame ? aspectOf(frame.aspect) : '16:9' });
  if (pic) box.append(h('img', { src: pic, alt: 'Frame ' + label }));
  else if (frame && frame.ref && !/^drive:/.test(String(frame.ref))) box.append(h('p.vz-pr-ref', { text: String(frame.ref) }));
  const lines = [];
  const action = frame ? Shots.frameAction(frame) : '';
  if (action) lines.push(['Action', action]);
  if (frame && frame.dialogue) lines.push(['Dialogue', frame.dialogue]);
  if (frame && frame.camera) lines.push(['Camera', frame.camera]);
  if (!lines.length && cols.includes('description') && shot.description) lines.push(['', shot.description]);
  return h('div.vz-pr-panel', {}, [
    box,
    h('div.vz-pr-cap', {}, [
      h('strong.vz-pr-cap-no', { text: label }),
      h('span.vz-pr-cap-spec', { text: spec.join(' · ') }),
      cols.includes('done') ? h('span.vz-pr-cap-done', { text: shot.done ? '✓' : '☐' }) : null
    ].filter(Boolean)),
    ...lines.map(([k, v]) => h('p.vz-pr-line', {}, [k ? h('b', { text: k + ' ' }) : null, h('span', { text: v })].filter(Boolean)))
  ]);
}

function gridBlock(group, cols, layout, imageFor) {
  const block = h('section.vz-pr-scene.vz-pr-board');
  block.append(sceneHead(group));
  const cams = group.scene ? Shots.sceneCameras(group.scene.id) : [];
  const grid = h('div.vz-pr-grid.vz-pr-' + layout);
  for (const p of panelsOf(group)) grid.append(panel(p, cols, imageFor, cams));
  block.append(grid);
  return block;
}

/**
 * The shot division as a document. Returns a detached
 * `div.vz-print`; visualize.js appends it for the duration of one
 * print job and removes it again.
 */
export function buildDocument(scope, opts = {}) {
  const cols = Shots.cleanColumns(opts.columns || Shots.SHOT_COLUMNS.map((c) => c.id));
  const layout = layoutOf(opts.layout);
  const root = h('div.vz-print.vz-print-' + layout);
  const gs = groups(scope);

  if (!gs.length || !gs.some((g) => g.shots.length)) {
    root.append(h('p.vz-pr-none', {
      text: 'No shots to export yet. Add a shot to a scene and it appears here.'
    }));
    return root;
  }

  for (const group of gs) {
    /* A whole-script export skips the scenes nobody has covered:
       eighty empty tables is not a document. A single-scene export
       does not, because the user asked for that one scene and an
       empty sheet is the honest answer. */
    if (!group.shots.length && (!scope || scope === ALL)) continue;
    root.append(layout === 'list' || !group.shots.length
      ? sceneBlock(group, cols)
      : gridBlock(group, cols, layout, opts.imageFor));
  }

  const s = summarise(scope);
  const time = Shots.formatMinutes(s.minutes);
  root.append(h('div.vz-pr-total', {}, [
    h('span', { text: plural(s.shots, 'setup', 'setups') }),
    h('span', { text: plural(s.withShots, 'scene', 'scenes') + ' covered' }),
    h('span', { text: formatEighths(s.eighths) + ' pages' }),
    h('span', { text: s.done + ' in the can' }),
    time ? h('span', { text: time + ' estimated' }) : null
  ].filter(Boolean)));
  return root;
}

/* ------------------------------------------------------------
   RENDERER 2 — CSV
   ------------------------------------------------------------
   A bonus, not the deliverable: the project's export direction is
   PDF. It is here because a shot list is the one document in the
   studio somebody genuinely does want in a spreadsheet, to sort
   by lens or by location before a hire.

   Every field is quoted and every quote is doubled. Half-escaping
   a CSV is how a description containing a comma becomes two
   columns three months after anybody remembers writing this.
   ------------------------------------------------------------ */
const csvCell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';

export const CSV_HEADER = [
  'Scene', 'Slug', 'Int/Ext', 'Time', 'Location', 'Scene pages',
  'Shot', 'Size', 'Angle', 'Movement', 'Lens', 'Lighting / rig', 'Camera', 'What we see', 'Status', 'Drafted by',
  // Added after the first sixteen, never between them: a template that
  // maps the old columns by position must keep reading them.
  'Setup', 'Minutes'
];

/* The CSV's shot columns, by Shots.SHOT_COLUMNS id. Setup brings the
   camera column with it: the two halves of "where the camera is". */
const CSV_COLS = {
  size: [['Size'], (s) => [sizeLabel(s.size)]],
  angle: [['Angle'], (s) => [s.angle]],
  movement: [['Movement'], (s) => [s.movement]],
  lens: [['Lens'], (s) => [s.lens]],
  rig: [['Lighting / rig'], (s) => [s.rig]],
  setup: [['Setup', 'Camera'], (s, cams) => [Shots.setupOf(s, cams), (Shots.camOf(s, cams) || {}).name || '']],
  mins: [['Minutes'], (s) => { const m = Shots.shotMinutes(s); return [m ? String(m) : '']; }],
  description: [['What we see'], (s) => [s.description]],
  done: [['Status'], (s) => [s.done ? 'in the can' : 'to shoot']]
};
const SCENE_HEAD = CSV_HEADER.slice(0, 7);

/** The CSV. With no `columns` (what the page exports) it is one fixed
    schema, CSV_HEADER: the old sixteen columns in their old places, then
    Setup and Minutes; it never varies with a device's column prefs. With
    `columns`: the scene columns, the shot number, the
    chosen columns in table order, and who drafted it. */
export function toCSV(scope, opts = {}) {
  const pick = opts.columns ? Shots.cleanColumns(opts.columns) : null;
  const rows = [pick ? [...SCENE_HEAD, ...pick.flatMap((id) => CSV_COLS[id][0]), 'Drafted by'] : CSV_HEADER];
  for (const group of groups(scope)) {
    const scene = group.scene;
    const cams = scene ? Shots.sceneCameras(scene.id) : [];
    for (const [i, shot] of group.shots.entries()) {
      const lead = [
        scene ? (scene.number || '') : 'orphan',
        scene ? slugOf(scene) : 'Scene deleted in the breakdown',
        scene ? scene.intExt : '',
        scene ? scene.dayNight : '',
        scene ? scene.location : '',
        scene ? formatEighths(scene.eighths) : '',
        shot.number || String(i + 1)
      ];
      const by = shot.ai ? 'AI draft' : 'you';
      if (pick) {
        rows.push([...lead, ...pick.flatMap((id) => CSV_COLS[id][1](shot, cams)), by]);
        continue;
      }
      rows.push([
        ...lead,
        sizeLabel(shot.size),
        shot.angle,
        shot.movement,
        shot.lens,
        shot.rig,
        (Shots.camOf(shot, cams) || {}).name || '',
        shot.description,
        shot.done ? 'in the can' : 'to shoot',
        by,
        Shots.setupOf(shot, cams),
        (() => { const m = Shots.shotMinutes(shot); return m ? String(m) : ''; })()
      ]);
    }
  }
  /* CRLF, because that is what the RFC says and what a spreadsheet
     on a Windows desk opens without a dialog. The BOM first, like every
     other CSV in the studio: without it Excel opens the file in the
     system code page and every em-dash in a slug and every Tamil
     description comes out garbled. */
  return '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/* ------------------------------------------------------------
   RENDERER 3 — the frame pictures, for a ZIP
   ------------------------------------------------------------
   Only frames whose ref is `drive:<fileId>` have a picture to send:
   a link is somebody else's file and a description has no bytes.
   The page downloads each file (src/ui/drive-image.js) and zips them
   with src/lib/zip-write.js; this only says WHICH files and what each
   is called inside the archive — scene folder, shot and frame letter,
   in board order, so the ZIP sorts the way the board reads.
   ------------------------------------------------------------ */
const safePart = (v) => String(v ?? '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
const DRIVE_ID = /^drive:([A-Za-z0-9_-]{8,})$/;

export function frameFiles(scope, byShot = Shots.framesByShot()) {
  const out = [];
  const used = new Set();
  for (const group of groups(scope)) {
    const folder = group.scene ? 'scene-' + safePart(group.scene.number || group.scene.id) : 'scene-deleted';
    group.shots.forEach((shot, i) => {
      (byShot.get(shot.id) || []).forEach((frame, n) => {
        const m = String(frame.ref || '').trim().match(DRIVE_ID);
        if (!m) return;
        let stem = folder + '/shot-' + safePart(shot.number || String(i + 1)) + String.fromCharCode(97 + (n % 26));
        while (used.has(stem)) stem += '_';
        used.add(stem);
        out.push({ fileId: m[1], frameId: frame.id, stem });
      });
    });
  }
  return out;
}

/** The extension a picture's MIME type is saved under. */
export const extFor = (mime) => ({ 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' })[String(mime || '').toLowerCase()] || '.jpg';

export default {
  ALL, groups, summarise, subtitleFor, labelFor, slugOf, LAYOUTS, layoutOf, panelsOf,
  buildDocument, toCSV, CSV_HEADER, frameFiles, extFor
};
