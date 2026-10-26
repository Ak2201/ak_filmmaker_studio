/* ============================================================
   VISUALIZE MODEL — the derivations visualize.html draws
   ------------------------------------------------------------
   Everything on the Shots & Frames page that does not need the DOM:
   the header's figures, the coverage filter, which scenes a draft
   reads and what it found, the words a draft run reports, the
   confirm sentences, the export's file stem and the lookbook's undo.
   src/pages/visualize.js builds the screen from these and keeps only
   view state (the filter, the density, the ticked scenes).

   Stores nothing of its own. The two writes here (removing a draft's
   shots, putting a removed reference back) go through src/lib/shots.js
   exactly as the page did, so the same key is written the same way.
   ============================================================ */
import Shots, { SHOT_SIZES } from './shots.js';
import { formatEighths } from './scenes.js';
import Script from './script.js';
import { describeMatch } from './screenplay-analysis.js';
import { jobFor } from './shot-rules.js';

export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

export const sizeLabel = (id) => (SHOT_SIZES.find((s) => s.id === id) || { id }).id;

/** The slug line, read off the scene. Never stored on a shot. */
export const slugOf = (scene) =>
  scene.intExt + '. ' + (scene.location || 'Location TBC') + ' — ' + scene.dayNight;

/** A shot's size and lens, as a board card's head prints them. */
export const shotSpec = (shot) => [sizeLabel(shot.size), String(shot.lens || '').trim()].filter(Boolean).join(' · ');

/** The most used lens across the shots that name one, or null. Derived. */
export function primaryLens(shots) {
  const n = new Map();
  for (const s of shots) {
    const l = String(s.lens || '').trim();
    if (l) n.set(l, (n.get(l) || 0) + 1);
  }
  let best = '', most = 0;
  for (const [l, c] of n) if (c > most) { best = l; most = c; }
  return best ? { lens: best, count: most } : null;
}

/* The header's figures. Only scenes that still exist count as covered: a
   shot left behind by a deleted scene would otherwise push the numerator
   past the denominator — "3 / 2 scenes covered". */
export function headerFigures(scenes, shots, boards) {
  const live = new Set(scenes.map((s) => s.id));
  return {
    covered: new Set(shots.map((s) => s.sceneId).filter((id) => live.has(id))).size,
    refs: Shots.countEntries(boards),
    done: shots.filter((s) => s.done).length,
    lens: primaryLens(shots)
  };
}

/** How many scenes the shots are spread across. */
export const sceneSpread = (shots) => new Set(shots.map((s) => s.sceneId)).size;

/* ---- the coverage filter ------------------------------------------ */
export const COV_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'todo', label: 'To shoot' },
  { value: 'done', label: 'In the can' }
];
/** Whether a shot shows under a filter ('all' | 'todo' | 'done'). */
export const keepShot = (filter, shot) => filter === 'all' || (filter === 'done' ? !!shot.done : !shot.done);

/* ---- the draft's scene plan ---------------------------------------
   Which script text goes with which scene is matchScenes()'s answer (the
   page asks it, with the script it loaded). Each row is a scene, its
   slice, how it was matched and how many shots it already has. */
export function scenePlan(script, match, shots) {
  const counted = new Map();
  for (const s of shots) counted.set(s.sceneId, (counted.get(s.sceneId) || 0) + 1);

  const rows = match.pairs.map(({ scene, slice, how }) => ({
    scene, slice, how,
    existing: counted.get(scene.id) || 0
  }));
  return {
    hasScript: script.elements.length > 0,
    pages: Script.pageCount(script.elements),
    rows,
    bySceneId: new Map(rows.map((r) => [r.scene.id, r])),
    notes: describeMatch(match)
  };
}

/** The meta line beside a scene in the draft picker. */
export const pickMeta = (row) =>
  (!row.slice ? 'synopsis only'
    : row.how === 'position' ? 'script matched by position, check it' : 'script matched')
  + (row.existing ? ' · ' + plural(row.existing, 'shot', 'shots') + ' already' : '');

/** "3 scenes selected · 4 2/8 pages" for the ticked scenes. */
export const pickedSummary = (scenes, picked) =>
  plural(picked.size, 'scene', 'scenes') + ' selected · '
  + formatEighths(scenes.filter((s) => picked.has(s.id))
    .reduce((a, s) => a + (Number(s.eighths) || 0), 0)) + ' pages';

/** The scenes with no shots yet: what the picker ticks on first sight. */
export const uncoveredIds = (plan) => new Set(plan.rows.filter((r) => !r.existing).map((r) => r.scene.id));

/** The basic breakdown's jobs for the ticked scenes, and how many of
    them had no script to read. */
export function basicJobs(chosen, plan) {
  const jobs = chosen
    .map((scene) => ({ scene, slice: (plan.bySceneId.get(scene.id) || {}).slice || null }))
    .filter((r) => r.slice)
    .map((r) => jobFor(r.scene, r.slice));
  return { jobs, noScript: chosen.length - jobs.length };
}

/** The basic breakdown's result, written: one shot per draft, marked. */
export function addBasicShots(byScene) {
  const made = [];
  for (const [sceneId, list] of byScene) {
    for (const draft of list) {
      made.push(Shots.addShot(sceneId, { ...draft, rules: true }).id);
    }
  }
  return made;
}

export const basicNoneMatched = (chosenCount) =>
  'The basic breakdown needs script pages to read, and the ticked '
  + (chosenCount === 1 ? 'scene has' : 'scenes have') + ' none matched. Nothing was added.';

export const basicDoneStatus = (made, sceneCount, noScript) =>
  plural(made, 'shot', 'shots') + ' drafted by the basic breakdown'
  + ' across ' + plural(sceneCount, 'scene', 'scenes')
  + (noScript ? ' — ' + plural(noScript, 'ticked scene', 'ticked scenes') + ' had no script to read' : '')
  + '. Every one of them is marked Basic and editable.';

export const aiDraftStatus = (n) => (n
  ? plural(n, 'shot', 'shots') + ' drafted by AI. Every one of them is marked and editable.'
  : '');

/* What a drafted shot looked like when it was written, so the undo can
   tell a shot nobody touched from one the writer has since edited. The
   number is left out of the comparison: moving or deleting a sibling
   renumbers a scene in auto order, and that is not the writer's edit. */
const draftFace = (s) => { const { number, ...rest } = s; return JSON.stringify(s.numLocked ? s : rest); };
export function draftSnapshot(ids) {
  const want = new Set(ids);
  return new Map(Shots.listShots().filter((s) => want.has(s.id)).map((s) => [s.id, draftFace(s)]));
}

/** Undo a draft: remove those shots, keep everything else — and keep a
    drafted shot the writer has edited since (it differs from `snap`) or
    has drawn a frame for, because the confirm promises that anything
    written or edited since is kept. Since a shot with a frame stays,
    no frame is ever left pointing at a removed shot. Returns
    { removed, kept } as id lists. */
export function removeShotIds(ids, snap) {
  const gone = new Set(ids);
  const framed = new Set(Shots.listFrames().map((f) => f.shotId));
  const removed = [];
  const kept = [];
  for (const s of Shots.listShots()) {
    if (!gone.has(s.id)) continue;
    const edited = framed.has(s.id) || (snap && snap.has(s.id) && snap.get(s.id) !== draftFace(s));
    (edited ? kept : removed).push(s.id);
  }
  const out = new Set(removed);
  Shots.saveShots(Shots.listShots().filter((s) => !out.has(s.id)));
  return { removed, kept };
}

/* ---- confirm sentences --------------------------------------------- */
export function shotDeleteQuestion(id) {
  const shot = Shots.listShots().find((s) => s.id === id);
  const frames = Shots.listFrames().filter((f) => f.shotId === id).length;
  const no = shot && String(shot.number || '').trim();
  const text = shot ? String(shot.description || '').replace(/\s+/g, ' ').trim() : '';
  // Cut on a word and say it was cut, never mid-word inside the quotes.
  const cut = text.length > 40 ? text.slice(0, 41).replace(/\s+\S*$/, '').replace(/[\s,.;:—-]+$/, '') + '…' : text;
  const label = (no ? ' ' + no : '') + (cut ? ' “' + cut + '”' : '');
  const also = frames ? ' Its ' + plural(frames, 'frame goes', 'frames go') + ' with it.' : '';
  return 'Delete shot' + label + '?' + also;
}

export function boardDeleteQuestion(id) {
  const board = Shots.listBoards().find((b) => b.id === id);
  const n = board ? board.entries.length : 0;
  const also = n ? ' Its ' + plural(n, 'reference goes', 'references go') + ' with it.' : '';
  return 'Delete the board "' + ((board && board.name) || 'untitled') + '"?' + also;
}

/* ---- the storyboard ------------------------------------------------ */
/** The slate's top-left mark: shot number, frame letter, size. */
export const frameBadge = (shot, i) => (shot.number || '—') + String.fromCharCode(97 + i) + '  ' + sizeLabel(shot.size);
/** The slate's rig line: the rig and the blocking camera, if any. */
export const rigLabel = (shot, cam) => [String(shot.rig || '').trim(), cam ? cam.name : ''].filter(Boolean).join(' · ');
/** How many frames a scene's shots carry. */
export const framesIn = (shots, byShot) => shots.reduce((n, s) => n + (byShot.get(s.id) || []).length, 0);

/* ---- the lookbook's undo ------------------------------------------- */
/** Where a reference sits on its board, and the entry itself. */
export function findEntry(boardId, entryId) {
  const board = Shots.listBoards().find((b) => b.id === boardId);
  const at = board ? board.entries.findIndex((x) => x.id === entryId) : -1;
  return { at, gone: at >= 0 ? board.entries[at] : null };
}
/** Put a removed reference back in its old place. False when there is
    nothing to do (the board went, or the entry is already back). */
export function restoreEntry(boardId, gone, at) {
  const boards = Shots.listBoards();
  const b = boards.find((x) => x.id === boardId);
  if (!b || b.entries.some((x) => x.id === gone.id)) return false;
  b.entries.splice(Math.min(at, b.entries.length), 0, gone);
  Shots.saveBoards(boards);
  return true;
}

/* ---- export -------------------------------------------------------- */
/** A filename stem from the project's title. */
export const fileStem = (title) =>
  String(title || 'shot-division')
    .replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'shot_division';
