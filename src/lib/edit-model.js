/* ============================================================
   EDIT LOG PAGE MODEL — what edit.html derives, no DOM
   ------------------------------------------------------------
   src/lib/editlog.js owns every decision about what "owed" means and
   stores the cut's word on each scene. This file is the arithmetic
   and the sentences src/pages/edit.js lays out around it: the filter
   a row passes, the verdict line, the pick-up labels, the running
   time against the target, the sync check, the cut timeline, and
   the links API the page's forms call. Derived; nothing stored here
   that editlog.js does not already store.
   ============================================================ */
import Edit from './editlog.js';
import Analysis, { formatDuration } from './screenplay-analysis.js';
import { loadScript } from './script.js';
import Store from './store.js';

export const FILTERS = [
  { id: 'all',   label: 'All scenes' },
  { id: 'owed',  label: 'Still owed' },
  { id: 'can',   label: 'In the can' },
  { id: 'cut',   label: 'In the cut' },
  { id: 'out',   label: 'Cut out' }
];

export const slug = (s) => {
  const parts = [s.intExt, s.location || 'NO LOCATION'].filter(Boolean).join(' ');
  return parts + (s.dayNight ? ' — ' + s.dayNight : '');
};

/** Whether a coverage row shows under filter `which`. */
export function passes(row, which) {
  switch (which) {
    case 'owed': return row.owed;
    case 'can':  return row.need && row.got === 'full';
    case 'cut':  return row.edit.cut === 'in' || row.edit.cut === 'locked';
    case 'out':  return row.edit.cut === 'out';
    default:     return true;
  }
}

/** The verdict in a sentence, only when there is something to say. */
export function verdictLine(row) {
  const st = row.scene.shotState || '';
  if (row.conflict) return 'Dropped on the day, but the cut has it. One of those two is wrong.';
  if (row.waste) return 'Shot, then cut. Coverage the film will not use.';
  if (row.edit.cut === 'out') return '';
  if (st === 'dropped') return 'Dropped on the day. Mark it cut out, or the cut is waiting on nothing.';
  if (row.got === 'none') return 'Not shot yet.';
  if (row.got === 'part') return 'Part shot — pick-ups owed before this scene can lock.';
  if (row.setupsOpen) return 'In the can on the set’s word; the shot list still has setups unticked.';
  return '';
}

/** "3 of 5 setups ticked" */
export const setupsText = (row) =>
  row.done + ' of ' + row.planned + (row.planned === 1 ? ' setup' : ' setups') + ' ticked';

/** Hang each scene's pick-ups on its coverage row (as `row.pickups`),
    and number the pick-ups by their place in the stored list. Returns
    that numbering: id → 1-based position. */
export function attachPickups(cov, data) {
  const byScene = new Map();
  data.pickups.forEach((p) => {
    if (!byScene.has(p.sceneId)) byScene.set(p.sceneId, []);
    byScene.get(p.sceneId).push(p);
  });
  cov.rows.forEach((r) => { r.pickups = byScene.get(r.scene.id) || []; });
  return new Map(data.pickups.map((p, i) => [p.id, i + 1]));
}

/* "PU-03": the pick-up's place in the stored list, derived — a label for
   talking about the item, not an id anything stores. */
export const puLabel = (order, p) => 'PU-' + String(order.get(p.id) || 0).padStart(2, '0');

/** The open pick-ups' scenes, as the note under the figure ("Sc 4, Sc 9 +2"). */
export function pickupNote(cov, scenes) {
  const pkScenes = [];
  cov.openPickups.forEach((p) => {
    const sc = scenes.find((x) => x.id === p.sceneId);
    const n = sc ? 'Sc ' + (sc.number || '—') : '';
    if (n && !pkScenes.includes(n)) pkScenes.push(n);
  });
  return cov.counts.pickups
    ? (pkScenes.length ? pkScenes.slice(0, 3).join(', ') + (pkScenes.length > 3 ? ' +' + (pkScenes.length - 3) : '') : 'owed by the editor')
    : '';
}

/* Estimated seconds per scene, from the script's own words. Empty when
   there is no script to read, so nothing is drawn rather than guessed. */
export function secondsByScene(scenes) {
  try {
    const els = loadScript().elements || [];
    if (!els) return {};
    const out = {};
    Analysis.screenTime(scenes, els).rows.forEach((r) => { out[r.scene.id] = r.seconds; });
    return out;
  } catch (e) { return {}; }
}

/** The note under the running time of the cut, against `target` minutes. */
export function runNote(run, target) {
  const bits = ['estimate from the script and page lengths · ' + run.scenes + (run.scenes === 1 ? ' scene' : ' scenes') + ' in the cut'];
  if (run.songsUntimed) bits.push(run.songsUntimed + (run.songsUntimed === 1 ? ' song has' : ' songs have') + ' no length yet');
  if (target) {
    const diff = run.seconds - target * 60;
    bits.push(diff === 0 ? 'on target' : formatDuration(Math.abs(diff)) + (diff > 0 ? ' over' : ' under') + ' the ' + target + ' min target');
  }
  return bits.join(' · ');
}

/** The pre-dub sync check: scenes in the cut, and how many are synced. */
export function syncCheck(cov) {
  const inCut = cov.rows.filter((r) => r.edit.cut === 'in' || r.edit.cut === 'locked');
  const synced = inCut.filter((r) => r.edit.sync).length;
  const left = inCut.length - synced;
  return {
    inCut: inCut.length,
    synced,
    note: synced === inCut.length
      ? 'Every scene in the cut is marked synced.'
      : left + (left === 1 ? ' scene in the cut is' : ' scenes in the cut are') + ' not marked synced yet.'
  };
}

/** The open project's format, or '' (a short hides feature-only items). */
export function projectFormat() {
  try { const pr = Store.currentProject && Store.currentProject(); return (pr && pr.format) || ''; } catch (e) { return ''; }
}

/** The deliverables panel's figures, from the lazily loaded catalogue. */
export function deliverablesSummary(Deliverables, fmt) {
  const items = Deliverables.listItems(fmt);
  const prog = Deliverables.progress(items);
  const open = items.filter((i) => i.state === 'todo' || i.state === 'doing');
  return { items, prog, open };
}

/** The cuts, newest first. */
export const cutsNewestFirst = (data) =>
  data.cuts.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));

/** A cut's line on the timeline: its date and its note count. */
export const cutMeta = (c) =>
  [c.date, c.notes.length ? c.notes.length + (c.notes.length === 1 ? ' note' : ' notes') : ''].filter(Boolean).join(' · ');

/** The conflict notice's sentence. */
export const conflictBody = (r) => 'Marked dropped on the shoot day, but the cut still has it'
  + (r.edit.cut === 'locked' ? ' (locked)' : '') + '. One of those two is wrong. '
  + 'Either the cut lets the scene go, or the day out of days gets a pick-up day — decide it here, not in the grade.';

/** The edit log as CSV text, with the byte-order mark a spreadsheet
    needs to read it as UTF-8. */
export function csvText(scenes, shots) {
  const cov = Edit.coverage(scenes, shots, Edit.loadEdit());
  return '﻿' + Edit.toCSV(cov, secondsByScene(scenes));
}

/* ---- links: a scene's dailies, a shoot day's, a cut's ----------- */
export const linkApi = {
  scene: { add: (id, l) => Edit.addSceneLink(id, l), del: (id, lid) => Edit.removeSceneLink(id, lid) },
  day:   { add: (id, l) => Edit.addDayLink(id, l),   del: (id, lid) => Edit.removeDayLink(id, lid) },
  cut:   { add: (id, l) => Edit.addCutLink(id, l),   del: (id, lid) => Edit.removeCutLink(id, lid) }
};

export const storedLinks = (scope, id) => (scope === 'scene' ? Edit.sceneEdit(id).links
  : scope === 'day' ? Edit.dayLinks(id)
  : ((Edit.listCuts().find((c) => c.id === id) || {}).links || []));

/** Put a removed link back at its old position: the links that sat
    after it come off and go back on behind it, in their order. */
export function restoreLink(scope, id, before, at, gone) {
  const after = before.slice(at + 1);
  after.forEach((l) => linkApi[scope].del(id, l.id));
  [gone, ...after].forEach((l) => linkApi[scope].add(id, l));
}

export default {
  FILTERS, slug, passes, verdictLine, setupsText, attachPickups, puLabel, pickupNote, secondsByScene, runNote,
  syncCheck, projectFormat, deliverablesSummary, cutsNewestFirst, cutMeta, conflictBody, csvText,
  linkApi, storedLinks, restoreLink
};
