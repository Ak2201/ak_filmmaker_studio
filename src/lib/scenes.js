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
   Cast, props, vehicles, stunts and sound take the PRD 2.0 FR-603
   colour coding (red / blue / yellow / yellow / green) through the
   `el-*` category hues; the rest keep the hues they always had. The
   category ids are storage keys inside every scene's `elements` — the
   hue may change, the id may not. */
export const ELEMENT_CATEGORIES = [
  { id: 'cast',      label: 'Cast',            hue: 'el-cast' },
  { id: 'extras',    label: 'Background',      hue: 'shorts' },
  { id: 'props',     label: 'Props',           hue: 'el-props' },
  { id: 'wardrobe',  label: 'Wardrobe',        hue: 'visualize' },
  { id: 'makeup',    label: 'Hair & Makeup',   hue: 'plan' },
  { id: 'vehicles',  label: 'Vehicles',        hue: 'el-vehicles' },
  { id: 'stunts',    label: 'Stunts',          hue: 'el-vehicles' },
  { id: 'vfx',       label: 'VFX',             hue: 'visualize' },
  { id: 'sound',     label: 'Sound',           hue: 'el-sound' },
  { id: 'animals',   label: 'Animals',         hue: 'plan' },
  { id: 'special',   label: 'Special Equipment', hue: 'shoot' }
];

const uid = () =>
  (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

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

/** Eighths as the industry writes them: 2 4/8, or 3/8 for under a page. */
export function formatEighths(e) {
  const n = Math.max(0, Math.round(Number(e) || 0));
  const pages = Math.floor(n / 8);
  const rem = n % 8;
  if (!pages && !rem) return '0';
  if (!pages) return `${rem}/8`;
  if (!rem) return String(pages);
  return `${pages} ${rem}/8`;
}

export function totalEighths(scenes) {
  return (scenes || listScenes()).reduce((a, s) => a + (Number(s.eighths) || 0), 0);
}

export default {
  SCENES_KEY, INT_EXT, DAY_NIGHT, ELEMENT_CATEGORIES, SHOT_STATES, shotLabel,
  blankScene, listScenes, saveScenes, addScene, updateScene, removeScene, moveScene,
  rawScenes, writeRawScenes,
  tagElement, untagElement, tagMany, untagMany, elementIndex, formatEighths, totalEighths
};
