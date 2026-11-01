/* ============================================================
   THE SCENE MODEL
   ------------------------------------------------------------
   One representation of a scene, which every downstream module is a
   view of: breakdowns, elements, stripboard, sides, shot lists, day out
   of days, call sheets. Build it once or build ten islands — CLAUDE.md
   open item 2 says the same thing, and the export/reset defects found
   earlier were exactly what islands cost.

   STORAGE CONTRACT. `fms_scenes_v1` is a new key, and a new key has
   to be registered in four places or it silently misbehaves:
     1. SCOPED_KEYS in src/lib/store.js  — namespaced per project
     2. PROJECT_KEYS in src/lib/backup.js — included in backups
     3. ALL_KEYS in src/pages/hub.js     — cleared by reset
     4. the scope check in supabase-schema.sql — allowed to sync
   Miss #2 and a user's scenes are absent from the file that calls
   itself a full studio backup. That bug has already happened here once.

   Eighths are the industry unit: a script page is 8/8. Stored as an
   integer count of eighths so arithmetic stays exact — 1/8 + 1/8 must
   equal 2/8, which it does not in floating point.
   ============================================================ */
import Store from './store.js';
import { binScene } from './scene-bin.js';
import { formatEighths } from './sample-figures.js';
import { newId } from './record-id.js';
import { undoAppend } from './notes-model.js';   // pure

export const SCENES_KEY = 'fms_scenes_v1';

export const INT_EXT    = ['INT', 'EXT', 'INT/EXT'];
export const DAY_NIGHT  = ['DAY', 'NIGHT', 'DAWN', 'DUSK', 'CONTINUOUS'];

/* The shoot-day states, in the order the buttons offer them. `tone`
   is the semantic colour family, never a volume hue — see the note
   in CLAUDE.md about ok/warn/danger and the six phase hues. */
export const SHOT_STATES = [
  { id: 'shot',    label: 'Shot',    tone: 'ok'   },
  { id: 'part',    label: 'Part',    tone: 'warn' },
  { id: 'dropped', label: 'Dropped', tone: 'none' }
];
export const shotLabel = (id) =>
  (SHOT_STATES.find((s) => s.id === id) || { label: 'Not shot' }).label;

/* The standard breakdown categories, in the order a 1st AD reads them.
   Colour is a hue token name, not a value — tokens.css owns the value.
   Every category takes an `el-*` hue in the industry colour code (owner,
   20 Oct 2026: cast red, stunts orange, background green, SFX blue,
   props violet, vehicles and animals pink, sound brown); `mark` is the
   paper sheet's traditional mark for the three that were never a
   colour. The category ids are storage keys inside every scene's
   `elements` — the hue may change, the id may not. */
export const ELEMENT_CATEGORIES = [
  { id: 'cast',      label: 'Cast',            hue: 'el-cast' },
  { id: 'extras',    label: 'Background',      hue: 'el-extras' },
  { id: 'props',     label: 'Props',           hue: 'el-props' },
  { id: 'setdressing', label: 'Set Dressing',  hue: 'el-dressing' },
  { id: 'wardrobe',  label: 'Wardrobe',        hue: 'el-wardrobe', mark: '◯' },
  { id: 'makeup',    label: 'Hair & Makeup',   hue: 'el-makeup', mark: '✱' },
  { id: 'vehicles',  label: 'Vehicles',        hue: 'el-vehicles' },
  { id: 'stunts',    label: 'Stunts',          hue: 'el-stunts' },
  { id: 'sfx',       label: 'SFX',             hue: 'el-sfx' },
  { id: 'vfx',       label: 'VFX',             hue: 'el-vfx' },
  { id: 'sound',     label: 'Sound',           hue: 'el-sound' },
  { id: 'animals',   label: 'Animals',         hue: 'el-animals' },
  { id: 'special',   label: 'Special Equipment', hue: 'el-special', mark: '▢' }
];

const uid = () => newId('s');

/** "INT KITCHEN — NIGHT": a scene's heading as the shoot day and the edit
    log print it. shoot-model.js and edit-model.js both re-export this one. */
export function slug(s) {
  const parts = [s.intExt, s.location || 'NO LOCATION'].filter(Boolean).join(' ');
  return parts + (s.dayNight ? ' — ' + s.dayNight : '');
}

/** A scene with every field present, so callers never guard for undefined. */
export function blankScene(patch = {}) {
  return {
    id: uid(),
    number: '',
    intExt: 'INT',
    dayNight: 'DAY',
    location: '',
    synopsis: '',
    songId: '',          // links this scene to a row in songs.js, or ''
    eighths: 8,          // integer eighths of a page; 8 = one full page
    pageNumber: '',
    elements: {},        // { categoryId: [name, …] }
    /* WHAT HAPPENED TO THIS SCENE ON THE DAY. Added for shoot.html
       and deliberately a FIELD rather than a new key: listScenes()
       spreads blankScene() under every stored row, so a scene
       written before this existed reads back with shotState '' and
       needs no migration. Exactly how songId arrived.

       Four states rather than a boolean, because "we got some of
       it" is the commonest outcome of a shoot day and a tool that
       cannot say so gets lied to. '' = not shot, 'shot' = complete,
       'part' = pick-ups owed, 'dropped' = cut from the film. */
    shotState: '',
    shotAt: '',          // ISO, when it was last marked
    /* THE TAKES LOGGED ON THE DAY, for shoot.html's roster: a list of
       { n, circled, note, at }, appended by src/lib/shootday.js
       (logTake / circleTake / undoTake). A FIELD spread under every
       stored row, like shotState: older rows read back [] and no
       migration or new key exists. */
    takes: [],
    /* THE FLOOR'S NOTE ON THIS SCENE, typed on shoot.html ("insert on
       the door lock still owed", "wind on boom, wild track taken").
       Free text, one per scene. A FIELD spread under every stored row,
       like shotState and takes: older rows read back '' and no
       migration or new key exists (owner, 14 Oct 2026, item #29).
       Written only by src/lib/shootday.js setFloorNote(). */
    floorNote: '',
    /* WHICH STORY BEAT THIS SCENE SERVES, for the write page's Outline
       tab (src/lib/beat-outline.js). Framework-qualified —
       'save_the_cat:midpoint', never a bare 'midpoint' — so switching
       framework on the Story page cannot re-point it at another
       framework's beat of the same name. Same arrival as songId and
       shotState: a field spread under every stored row, so older rows
       read back '' and no migration exists. Written only when a person
       links, drags or drafts a scene; never on load. */
    beatId: '',
    /* THE SCRIPT HEADING THIS ROW IS, by the element's stable id
       (src/lib/script.js). Set by src/lib/scene-sync.js when the
       script drives the scene list: a new heading adds its row, an
       edited heading updates the heading-derived fields, a deleted one
       sends the row and everything hung on it to the bin
       (src/lib/scene-bin.js). '' is a row typed by hand on the
       Breakdown, which the script never touches. Same arrival as
       songId and beatId: spread under every stored row, so older rows
       read back '' and no migration exists. */
    scriptElId: '',
    /* A script reader's one-line note on this scene, and whether the
       story loses nothing without it. Written only when somebody accepts
       the Desk's scene-notes task; the note rests on a verified quote.
       Fields spread under older rows, so no migration. */
    readerNote: '',
    cutCandidate: false,
    ...patch
  };
}

/** Everything persisted under the scene key, shape-guaranteed. */
function readAll() {
  let raw = null;
  try { raw = localStorage.getItem(SCENES_KEY); } catch (e) { /* private mode */ }
  if (!raw) return { scenes: [] };
  try {
    const parsed = JSON.parse(raw);
    // An empty array is truthy — the trap that once gave returning users
    // a table with no rows and no way to add one. Check Array.isArray.
    return { scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [] };
  } catch (e) {
    return { scenes: [] };
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(SCENES_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function listScenes() {
  return readAll().scenes.map((s) => ({ ...blankScene(), ...s }));
}

export function saveScenes(scenes) {
  return writeAll({ scenes });
}

export function addScene(patch) {
  const scenes = listScenes();
  /* One past the highest number in use, not length + 1: after a delete
     the count falls below the top number, and length + 1 handed out a
     number another scene already had (UX audit M26). scene-sync.js
     numbers new headings the same way. "12A" counts as 12. */
  const top = scenes.reduce((n, s) => Math.max(n, parseInt(s && s.number, 10) || 0), 0);
  const scene = blankScene({ number: String(top + 1), ...patch });
  scenes.push(scene);
  saveScenes(scenes);
  return scene;
}

export function updateScene(id, patch) {
  const scenes = listScenes();
  const i = scenes.findIndex((s) => s.id === id);
  if (i < 0) return null;
  scenes[i] = { ...scenes[i], ...patch, id };   // id is not patchable
  saveScenes(scenes);
  return scenes[i];
}

/* ---- appending to a scene's reader note ---------------------
   The AI Desk's read-only tools (beat critique, tension notes, the
   audience tests) keep a ticked point that names a scene by APPENDING
   it to that row's `readerNote`, one line each, marked with where it
   came from. Never a replace: the note may hold what a person typed,
   and "fill blanks, never overwrite" is the rule. ONE write for the
   whole Accept (rows re-read first, so a row edited in another tab
   keeps that edit). scene-notes uses it too, so there is ONE append
   path for AI notes on a row. An item may carry `fill` ({field: value})
   for fields set only while blank. Returns one { id, before, after,
   filled } per row touched (`.same` counts points already there), []
   for nothing to do, or null when the write was refused. */
export function appendSceneNotes(list, { from = '' } = {}) {
  const scenes = listScenes();
  const byId = new Map(scenes.map((s, i) => [s.id, i]));
  const changes = new Map();
  let same = 0;
  for (const x of list || []) {
    const t = String((x && x.text) ?? '').trim();
    const i = x ? byId.get(x.id) : undefined;
    if (i == null) continue;
    const row = scenes[i];
    const c = changes.get(row.id) || { id: row.id, before: String(row.readerNote || ''), filled: {} };
    let touched = false;
    const have = String(row.readerNote || '');
    // A point already in the note word for word is not added twice (the
    // same Accept run again, or two tools saying the same thing).
    if (t && !have.includes(t)) {
      const line = (from ? from + ': ' : '') + t;
      scenes[i] = { ...scenes[i], readerNote: have.trim() ? have.replace(/\s+$/, '') + '\n' + line : line };
      touched = true;
    }
    // `fill` sets a field only while it is still blank/false (scene-notes'
    // cutCandidate): a tool may raise a flag, never clear or re-raise one.
    for (const [k, v] of Object.entries((x && x.fill) || {})) {
      if (scenes[i][k] || k in c.filled) continue;
      c.filled[k] = { was: scenes[i][k], now: v };
      scenes[i] = { ...scenes[i], [k]: v };
      touched = true;
    }
    if (!touched) { same++; continue; }
    c.after = String(scenes[i].readerNote || '');
    changes.set(row.id, c);
  }
  const out = [...changes.values()];
  out.same = same;   // how many points were already there (said in the toast)
  if (!out.length) return out;
  return saveScenes(scenes) ? out : null;
}

/* The exact undo of appendSceneNotes(): each row loses ONLY the lines
   that call added (notes-model undoAppend), so a person's edit made
   after the Accept survives the Undo. A row whose note no longer holds
   the appended block exactly once keeps its note and is counted; a
   filled field goes back only while it still holds what was written.
   One write. */
export function undoSceneNotes(changes) {
  if (!Array.isArray(changes) || !changes.length) return 0;
  const want = new Map(changes.map((c) => [c.id, c]));
  let missed = 0;
  const scenes = listScenes().map((s) => {
    const c = want.get(s.id);
    if (!c) return s;
    let out = s;
    if (c.after !== c.before) {
      const back = undoAppend(s.readerNote, c.before, c.after);
      if (back == null) missed++;
      else out = { ...out, readerNote: back };
    }
    for (const [k, f] of Object.entries(c.filled || {})) {
      if (out[k] === f.now) out = { ...out, [k]: f.was };
    }
    return out;
  });
  saveScenes(scenes);
  return missed;
}

/* REMOVING A SCENE GOES THROUGH THE BIN. It used to filter the row
   out and nothing else, which left its shots, frames, call-sheet
   places and edit-log notes pointing at an id that no longer existed —
   orphans every other page then had to explain. Now the one cascade
   the script's deletions use takes the row and every dependent into
   one bin entry (src/lib/scene-bin.js), restorable from the
   Breakdown, deleted for good only when somebody says so. */
export function removeScene(id) {
  binScene(id, { reason: 'hand' });
  return listScenes();
}

/* ---- the raw rows, for the bin ------------------------------
   The stored objects exactly as they are, with no blankScene()
   spread over them, so a row taken into the bin and put back is the
   same bytes it was. Nothing but src/lib/scene-bin.js should need
   these. */
export function rawScenes() {
  return readAll().scenes.slice();
}
export function writeRawScenes(rows) {
  return writeAll({ scenes: rows });
}

export function moveScene(id, delta) {
  const scenes = listScenes();
  const i = scenes.findIndex((s) => s.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= scenes.length) return scenes;
  [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
  saveScenes(scenes);
  return scenes;
}

/** Put a scene at a position in ONE write (a drag lands anywhere in the list,
 *  and N calls to moveScene would be N writes and N autosaves). `toIndex` is
 *  where the scene ends up in the new order, clamped to the list. */
export function reorderScene(id, toIndex) {
  const scenes = listScenes();
  const from = scenes.findIndex((s) => s.id === id);
  if (from < 0) return scenes;
  const to = Math.max(0, Math.min(scenes.length - 1, Number.isFinite(toIndex) ? Math.trunc(toIndex) : from));
  if (to === from) return scenes;
  const [row] = scenes.splice(from, 1);
  scenes.splice(to, 0, row);
  saveScenes(scenes);
  return scenes;
}

/* ---- element tagging ---------------------------------------
   Elements live ON the scene rather than in a separate list keyed by
   scene index. Indices renumber when a scene is reordered, and the
   stranded-key bug on the trap list is exactly what that costs. */
export function tagElement(sceneId, category, name) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  const scenes = listScenes();
  const scene = scenes.find((s) => s.id === sceneId);
  if (!scene) return null;
  const list = Array.isArray(scene.elements[category]) ? scene.elements[category] : [];
  if (!list.some((n) => n.toLowerCase() === clean.toLowerCase())) list.push(clean);
  scene.elements[category] = list;
  saveScenes(scenes);
  return scene;
}

export function untagElement(sceneId, category, name) {
  const scenes = listScenes();
  const scene = scenes.find((s) => s.id === sceneId);
  if (!scene) return null;
  scene.elements[category] = (scene.elements[category] || [])
    .filter((n) => n.toLowerCase() !== String(name).toLowerCase());
  saveScenes(scenes);
  return scene;
}

/* ---- tagging in bulk, and taking exactly that back ---------
   One read and one write for the whole batch, rather than one per
   tag. `tags` is [{ sceneId, category, name }]. Returns the tags that
   were actually ADDED, in the spelling that was stored; a name the
   scene already carried (in any case) is not in it. That list is what
   untagMany() takes, which is what makes an undo exact: it removes the
   strings this call wrote and nothing a person tagged themselves. */
export function tagMany(tags) {
  const scenes = listScenes();
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const added = [];
  for (const t of tags || []) {
    const scene = byId.get(t.sceneId);
    const clean = String(t.name || '').trim();
    if (!scene || !clean || !t.category) continue;
    const list = Array.isArray(scene.elements[t.category]) ? scene.elements[t.category] : [];
    if (list.some((n) => String(n).toLowerCase() === clean.toLowerCase())) continue;
    list.push(clean);
    scene.elements[t.category] = list;
    added.push({ sceneId: scene.id, category: t.category, name: clean });
  }
  if (added.length) saveScenes(scenes);
  return added;
}

/** Remove exactly these tags (exact spelling); returns how many went. */
export function untagMany(tags) {
  const scenes = listScenes();
  const byId = new Map(scenes.map((s) => [s.id, s]));
  let removed = 0;
  for (const t of tags || []) {
    const scene = byId.get(t.sceneId);
    if (!scene) continue;
    const list = scene.elements[t.category] || [];
    const i = list.indexOf(t.name);
    if (i < 0) continue;
    list.splice(i, 1);
    scene.elements[t.category] = list;
    removed++;
  }
  if (removed) saveScenes(scenes);
  return removed;
}

/** The Elements module: every tagged name, with the scenes it appears in.
    Derived, never stored — two copies of this would drift within a day. */
export function elementIndex() {
  const index = {};
  for (const scene of listScenes()) {
    for (const [cat, names] of Object.entries(scene.elements || {})) {
      for (const name of names) {
        const key = cat + '::' + name.toLowerCase();
        if (!index[key]) index[key] = { category: cat, name, scenes: [] };
        index[key].scenes.push({ id: scene.id, number: scene.number });
      }
    }
  }
  return Object.values(index).sort((a, b) =>
    a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category));
}


/* formatEighths is pure and lives in sample-figures.js, so the build
   can import it without store.js; re-exported here for every caller. */
export { formatEighths };

export function totalEighths(scenes) {
  return (scenes || listScenes()).reduce((a, s) => a + (Number(s.eighths) || 0), 0);
}

export default {
  SCENES_KEY, INT_EXT, DAY_NIGHT, ELEMENT_CATEGORIES, SHOT_STATES, shotLabel,
  blankScene, listScenes, saveScenes, addScene, updateScene, removeScene, moveScene, reorderScene,
  rawScenes, writeRawScenes, appendSceneNotes, undoSceneNotes,
  tagElement, untagElement, tagMany, untagMany, elementIndex, formatEighths, totalEighths
};
