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
   many scenes, over how many pages.

   NO COLOURS, NO SHAPES here. The rules live in
   styles/visualize.css under `body.pdf-shotlist`.
   ============================================================ */
import { h } from './dom.js';
import Scenes, { formatEighths, totalEighths } from './scenes.js';
import Shots, { SHOT_SIZES } from './shots.js';

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
  return { groups: gs.length, scenes: gs.length, withShots, shots, done, eighths };
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
   ------------------------------------------------------------ */
const COLUMNS = [
  ['Shot', 'vz-pr-c-no'],
  ['Size', 'vz-pr-c-spec'],
  ['Angle', 'vz-pr-c-spec'],
  ['Move', 'vz-pr-c-spec'],
  ['Lens', 'vz-pr-c-spec'],
  ['What we see', 'vz-pr-c-desc'],
  ['✓', 'vz-pr-c-done']
];

function sceneBlock(group) {
  const scene = group.scene;
  const block = h('section.vz-pr-scene');

  block.append(h('div.vz-pr-head', {}, [
    h('span.vz-pr-no', { text: scene ? (scene.number || '—') : '!' }),
    h('span.vz-pr-slug', {
      text: scene ? slugOf(scene) : 'Scene deleted in the breakdown'
    }),
    h('span.vz-pr-meta', {
      text: (scene ? formatEighths(scene.eighths) + ' pages · ' : '')
          + (group.shots.length ? plural(group.shots.length, 'setup', 'setups') : 'no setups')
    })
  ]));

  if (scene && scene.synopsis) {
    block.append(h('p.vz-pr-syn', { text: scene.synopsis }));
  }

  if (!group.shots.length) {
    block.append(h('p.vz-pr-none', { text: 'No shot division for this scene yet.' }));
    return block;
  }

  const table = h('table.vz-pr-table');
  const head = h('tr');
  COLUMNS.forEach(([label, cls]) => head.append(h('th.' + cls, { scope: 'col', text: label })));
  table.append(h('thead', {}, [head]));

  const body = h('tbody');
  group.shots.forEach((shot, i) => {
    const row = h('tr');
    row.append(h('td.vz-pr-c-no', { text: shot.number || String(i + 1) }));
    row.append(h('td.vz-pr-c-spec', { text: sizeLabel(shot.size) }));
    row.append(h('td.vz-pr-c-spec', { text: shot.angle }));
    row.append(h('td.vz-pr-c-spec', { text: shot.movement }));
    row.append(h('td.vz-pr-c-spec', { text: shot.lens || '—' }));
    row.append(h('td.vz-pr-c-desc', { text: shot.description || '—' }));
    row.append(h('td.vz-pr-c-done', { text: shot.done ? '✓' : '☐' }));
    body.append(row);
  });
  table.append(body);
  block.append(table);
  return block;
}

/**
 * The shot division as a document. Returns a detached
 * `div.vz-print`; visualize.js appends it for the duration of one
 * print job and removes it again.
 */
export function buildDocument(scope) {
  const root = h('div.vz-print');
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
    root.append(sceneBlock(group));
  }

  const s = summarise(scope);
  root.append(h('div.vz-pr-total', {}, [
    h('span', { text: plural(s.shots, 'setup', 'setups') }),
    h('span', { text: plural(s.withShots, 'scene', 'scenes') + ' covered' }),
    h('span', { text: formatEighths(s.eighths) + ' pages' }),
    h('span', { text: s.done + ' in the can' })
  ]));
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
  'Shot', 'Size', 'Angle', 'Movement', 'Lens', 'What we see', 'Status', 'Drafted by'
];

export function toCSV(scope) {
  const rows = [CSV_HEADER];
  for (const group of groups(scope)) {
    const scene = group.scene;
    for (const [i, shot] of group.shots.entries()) {
      rows.push([
        scene ? (scene.number || '') : 'orphan',
        scene ? slugOf(scene) : 'Scene deleted in the breakdown',
        scene ? scene.intExt : '',
        scene ? scene.dayNight : '',
        scene ? scene.location : '',
        scene ? formatEighths(scene.eighths) : '',
        shot.number || String(i + 1),
        sizeLabel(shot.size),
        shot.angle,
        shot.movement,
        shot.lens,
        shot.description,
        shot.done ? 'in the can' : 'to shoot',
        shot.ai ? 'AI draft' : 'you'
      ]);
    }
  }
  /* CRLF, because that is what the RFC says and what a spreadsheet
     on a Windows desk opens without a dialog. */
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export default {
  ALL, groups, summarise, subtitleFor, labelFor, slugOf,
  buildDocument, toCSV, CSV_HEADER
};
