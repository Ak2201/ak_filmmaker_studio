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
     2. PROJECT_KEYS in src/pages/hub.js — included in backups
     3. ALL_KEYS in src/pages/hub.js     — cleared by reset
     4. the scope check in supabase-schema.sql — allowed to sync
   Miss #2 and a user's scenes are absent from the file that calls
   itself a full studio backup. That bug has already happened here once.

   Eighths are the industry unit: a script page is 8/8. Stored as an
   integer count of eighths so arithmetic stays exact — 1/8 + 1/8 must
   equal 2/8, which it does not in floating point.
   ============================================================ */
import Store from './store.js';

export const SCENES_KEY = 'fms_scenes_v1';

export const INT_EXT    = ['INT', 'EXT', 'INT/EXT'];
export const DAY_NIGHT  = ['DAY', 'NIGHT', 'DAWN', 'DUSK', 'CONTINUOUS'];

/* The standard breakdown categories, in the order a 1st AD reads them.
   Colour is a hue token name, not a value — tokens.css owns the value. */
export const ELEMENT_CATEGORIES = [
  { id: 'cast',      label: 'Cast',            hue: 'feature' },
  { id: 'extras',    label: 'Background',      hue: 'shorts' },
  { id: 'props',     label: 'Props',           hue: 'library' },
  { id: 'wardrobe',  label: 'Wardrobe',        hue: 'visualize' },
  { id: 'makeup',    label: 'Hair & Makeup',   hue: 'plan' },
  { id: 'vehicles',  label: 'Vehicles',        hue: 'shoot' },
  { id: 'stunts',    label: 'Stunts',          hue: 'feature' },
  { id: 'vfx',       label: 'VFX',             hue: 'visualize' },
  { id: 'sound',     label: 'Sound',           hue: 'shorts' },
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
    eighths: 8,          // integer eighths of a page; 8 = one full page
    pageNumber: '',
    elements: {},        // { categoryId: [name, …] }
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
  const scene = blankScene({ number: String(scenes.length + 1), ...patch });
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

export function removeScene(id) {
  const scenes = listScenes().filter((s) => s.id !== id);
  saveScenes(scenes);
  return scenes;
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
  SCENES_KEY, INT_EXT, DAY_NIGHT, ELEMENT_CATEGORIES,
  blankScene, listScenes, saveScenes, addScene, updateScene, removeScene, moveScene,
  tagElement, untagElement, elementIndex, formatEighths, totalEighths
};
