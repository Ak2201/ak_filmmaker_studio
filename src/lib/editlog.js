/* ============================================================
   EDIT LOG — what was shot against what the cut needs
   ------------------------------------------------------------
   The shoot day answers the plan: shoot.html marks a scene shot,
   part-shot or dropped. This module asks the next question, the
   one the editor asks on the first morning in the suite — which of
   those marks does the cut actually need, and what is still owed?

   TWO SOURCES, ONE OPINION EACH, AND THIS FILE ADDS A THIRD.
     the set    `scene.shotState`, written only by shoot.html. What
                was GOT. This module never writes it: the rule that
                shoot.html is the only view that writes to a scene
                is kept, because an editor marking a scene "shot"
                from the suite would be the suite claiming to have
                been on the floor.
     the plan   the shot list in shots.js, with its `done` flag per
                shot. What was INTENDED, setup by setup.
     the cut    stored HERE, per scene: is it in the assembly, is it
                locked, or has the edit let it go. Plus a note, and
                a list of pick-ups the editor is owed.

   WHY THE CUT STATE IS ITS OWN KEY AND NOT A FIFTH shotState. A
   scene "dropped" on the day and a scene "cut out" in the edit are
   different facts with different owners — the 1st AD and the editor
   — and they disagree all the time: a scene shot in full and cut
   anyway, a scene dropped on the floor that the cut still wants.
   The disagreement IS the report. One field cannot carry two
   opinions, so the shoot keeps its field and the cut keeps this.

   WHAT IS DERIVED. Everything in coverage(): the per-scene verdict,
   the pages in the can, the pages owed, the conflicts. None of it
   is stored, for the reason readiness.js gives — two copies of the
   same answer drift within a day. The only stored facts are the
   three an editor TYPES: cut state, note, pick-ups.

   STORAGE CONTRACT. `fms_edit_v1` is a new key and is registered in
   all five places: SCOPED_KEYS (store.js), PROJECT_KEYS (backup.js),
   ALL_KEYS (hub.js), SCOPE_BY_KEY (cloud.js) and the scope CHECK in
   supabase-schema.sql (section 16). Miss one and it either leaks
   across projects, vanishes from backups, survives a reset, never
   syncs, or is refused by Postgres.
   ============================================================ */
import './store.js';   // must evaluate before anything reads localStorage
import Scenes, { totalEighths, formatEighths } from './scenes.js';
import { listShots } from './shots.js';

export const EDIT_KEY = 'fms_edit_v1';

/* Where a scene stands in the cut. '' is the honest default — the
   edit has not said anything about it yet. */
export const CUT_STATES = [
  { id: '',       label: 'Not in cut yet', tone: 'none' },
  { id: 'in',     label: 'In the cut',     tone: 'ok'   },
  { id: 'locked', label: 'Locked',         tone: 'ok'   },
  { id: 'out',    label: 'Cut out',        tone: 'none' }
];
const cutIds = CUT_STATES.map((c) => c.id);
export const cutLabel = (id) => (CUT_STATES.find((c) => c.id === id) || CUT_STATES[0]).label;

let seq = 0;
const uid = () => 'pk' + Date.now().toString(36) + (seq++).toString(36);

export function blankSceneEdit(patch = {}) {
  const e = { cut: '', note: '', ...patch };
  if (!cutIds.includes(e.cut)) e.cut = '';
  e.note = String(e.note || '');
  return e;
}

export function blankPickup(patch = {}) {
  return {
    id: uid(),
    sceneId: '',
    what: '',
    done: false,
    at: new Date().toISOString(),
    ...patch
  };
}

/* ---- persistence --------------------------------------------
   Plain localStorage so store.js's proxy scopes it to the open
   project. Shape-checked on the way in: `scenes` must be a plain
   object and `pickups` an array, and anything else reads as empty
   rather than throwing at render. */
function readAll() {
  let raw = null;
  try { raw = localStorage.getItem(EDIT_KEY); } catch (e) { /* private mode */ }
  if (!raw) return { scenes: {}, pickups: [] };
  try {
    const p = JSON.parse(raw);
    return {
      scenes: (p && p.scenes && typeof p.scenes === 'object' && !Array.isArray(p.scenes)) ? p.scenes : {},
      pickups: Array.isArray(p && p.pickups) ? p.pickups : []
    };
  } catch (e) {
    return { scenes: {}, pickups: [] };
  }
}

function writeAll(data) {
  try { localStorage.setItem(EDIT_KEY, JSON.stringify(data)); return true; }
  catch (e) { return false; }
}

export function loadEdit() {
  const d = readAll();
  const scenes = {};
  Object.keys(d.scenes).forEach((id) => { scenes[id] = blankSceneEdit(d.scenes[id]); });
  return { scenes, pickups: d.pickups.map((p) => blankPickup(p)) };
}

export function sceneEdit(sceneId, data) {
  const d = data || loadEdit();
  return d.scenes[sceneId] || blankSceneEdit();
}

/** Set the cut state or the note for a scene. Writes nothing to the
    scene itself — see the header. */
export function setSceneEdit(sceneId, patch) {
  const d = loadEdit();
  const next = blankSceneEdit({ ...(d.scenes[sceneId] || {}), ...patch });
  /* A scene with nothing said about it is not stored at all, so the
     blob does not grow a row per scene the editor never touched. */
  if (!next.cut && !next.note) delete d.scenes[sceneId];
  else d.scenes[sceneId] = next;
  writeAll(d);
  return next;
}

export function listPickups(data) {
  return (data || loadEdit()).pickups;
}

export function addPickup(sceneId, what) {
  const clean = String(what || '').trim();
  if (!clean) return null;
  const d = loadEdit();
  const p = blankPickup({ sceneId: sceneId || '', what: clean });
  d.pickups.push(p);
  writeAll(d);
  return p;
}

export function updatePickup(id, patch) {
  const d = loadEdit();
  const i = d.pickups.findIndex((p) => p.id === id);
  if (i < 0) return null;
  d.pickups[i] = blankPickup({ ...d.pickups[i], ...patch, id });
  writeAll(d);
  return d.pickups[i];
}

export function removePickup(id) {
  const d = loadEdit();
  d.pickups = d.pickups.filter((p) => p.id !== id);
  writeAll(d);
  return d.pickups;
}

/* ---- derived ------------------------------------------------
   Everything below READS. */

/**
 * The verdict on one scene, from the three sources.
 *
 *   need    the cut wants this scene: not cut out in the edit, and
 *           not dropped on the floor UNLESS the edit has already
 *           claimed it (then the two disagree, and `conflict` says so)
 *   got     'full' | 'part' | 'none' — what the set delivered
 *   owed    need && got !== 'full'. THE SET'S WORD IS FINAL: a scene
 *           the 1st AD marked shot is in the can even if the shot
 *           list still has setups unticked — the ticks are a
 *           planning tool nobody maintains on the floor, and letting
 *           them overrule the mark would make the headline number
 *           answer to a checkbox instead of to the day. Unticked
 *           setups are reported (`setupsOpen`) as a note, never as
 *           a debt.
 *   waste   shot (in full or part) and then cut out: coverage the
 *           film will not use. Not a fault, but worth a line.
 */
export function verdict(scene, shots, edit) {
  const cut = edit.cut;
  const st = scene.shotState || '';
  const got = st === 'shot' ? 'full' : st === 'part' ? 'part' : 'none';
  const planned = shots.length;
  const done = shots.filter((s) => s.done).length;
  const need = cut !== 'out' && (st !== 'dropped' || cut === 'in' || cut === 'locked');
  const conflict = st === 'dropped' && (cut === 'in' || cut === 'locked');
  const setupsOpen = planned > done;
  const owed = need && got !== 'full';
  const waste = cut === 'out' && (st === 'shot' || st === 'part');
  return { need, got, owed, waste, conflict, planned, done, setupsOpen };
}

/**
 * The whole film, scene by scene, in script order. Script order and
 * not shooting order: the suite works from the script, and the
 * shoot day already shows the other ordering.
 */
export function coverage(scenes, shots, edit) {
  const all = scenes || Scenes.listScenes();
  const sh = shots || listShots();
  const ed = edit || loadEdit();
  const byScene = new Map();
  sh.forEach((s) => {
    if (!byScene.has(s.sceneId)) byScene.set(s.sceneId, []);
    byScene.get(s.sceneId).push(s);
  });
  const rows = all.map((scene) => {
    const mine = byScene.get(scene.id) || [];
    const e = sceneEdit(scene.id, ed);
    return { scene, shots: mine, edit: e, ...verdict(scene, mine, e) };
  });

  const need = rows.filter((r) => r.need);
  const inCan = need.filter((r) => r.got === 'full');
  const owed = rows.filter((r) => r.owed);
  const partial = rows.filter((r) => r.need && r.got === 'part');
  const missing = rows.filter((r) => r.need && r.got === 'none');
  const dropped = rows.filter((r) => (r.scene.shotState || '') === 'dropped');
  const out = rows.filter((r) => r.edit.cut === 'out');
  const locked = rows.filter((r) => r.edit.cut === 'locked');
  const inCut = rows.filter((r) => r.edit.cut === 'in' || r.edit.cut === 'locked');
  const waste = rows.filter((r) => r.waste);
  const conflicts = rows.filter((r) => r.conflict);
  const openPickups = ed.pickups.filter((p) => !p.done);

  const eighths = (list) => totalEighths(list.map((r) => r.scene));
  return {
    rows,
    counts: {
      scenes: rows.length,
      need: need.length,
      inCan: inCan.length,
      owed: owed.length,
      partial: partial.length,
      missing: missing.length,
      dropped: dropped.length,
      out: out.length,
      inCut: inCut.length,
      locked: locked.length,
      waste: waste.length,
      conflicts: conflicts.length,
      pickups: openPickups.length
    },
    pages: {
      need: formatEighths(eighths(need)),
      inCan: formatEighths(eighths(inCan)),
      owed: formatEighths(eighths(owed)),
      eighthsNeed: eighths(need),
      eighthsInCan: eighths(inCan),
      eighthsOwed: eighths(owed)
    },
    conflicts,
    waste,
    openPickups,
    /* The film can lock picture when nothing the cut needs is still
       owed and no scene it claims was dropped. */
    ready: rows.length > 0 && owed.length === 0 && conflicts.length === 0
  };
}

/**
 * The pick-up list as plain text, for a message to the 1st AD. It
 * carries both kinds: the scenes the set itself called partial, and
 * what the editor typed. Nothing in it is a stored number.
 */
export function pickupText(cov, pickups) {
  const c = cov || coverage();
  const list = pickups || c.openPickups;
  const lines = [];
  const slug = (s) => [s.number ? 'Sc ' + s.number : 'Scene', [s.intExt, s.location].filter(Boolean).join(' ')]
    .filter(Boolean).join(' · ');
  const partial = c.rows.filter((r) => r.need && r.got === 'part');
  const missing = c.rows.filter((r) => r.need && r.got === 'none');
  if (missing.length) {
    lines.push('NOT YET SHOT');
    missing.forEach((r) => lines.push('  ' + slug(r.scene)));
  }
  if (partial.length) {
    lines.push((lines.length ? '\n' : '') + 'PART SHOT — pick-ups owed');
    partial.forEach((r) => lines.push('  ' + slug(r.scene)));
  }
  if (list.length) {
    lines.push((lines.length ? '\n' : '') + 'FROM THE SUITE');
    const byId = new Map(c.rows.map((r) => [r.scene.id, r.scene]));
    list.forEach((p) => {
      const s = byId.get(p.sceneId);
      lines.push('  ' + (s ? slug(s) + ' — ' : '') + p.what);
    });
  }
  return lines.join('\n');
}

/* ---- a scene leaving for the bin, and coming back --------------
   The cut's word on a scene and the pick-ups owed on it go with the
   scene into the bin (src/lib/scene-bin.js) and come back with it.
   Raw values and positions, including the key's place in the
   `scenes` map, so a restore writes the bytes that were there. */
export function takeSceneOut(sceneId) {
  const d = readAll();
  const keys = Object.keys(d.scenes);
  const at = keys.indexOf(sceneId);
  const scene = at >= 0 ? { index: at, value: d.scenes[sceneId] } : null;
  const pickups = [];
  const keep = [];
  d.pickups.forEach((p, index) => {
    if (p && p.sceneId === sceneId) pickups.push({ index, row: p });
    else keep.push(p);
  });
  if (scene || pickups.length) {
    const scenes = {};
    keys.forEach((k) => { if (k !== sceneId) scenes[k] = d.scenes[k]; });
    writeAll({ scenes, pickups: keep });
  }
  return { scene, pickups };
}

/** Put back what takeSceneOut() took. A note written for the scene in
    the meantime is kept rather than overwritten. */
export function putSceneBack(sceneId, snap) {
  if (!snap || (!snap.scene && !(snap.pickups || []).length)) return 0;
  const d = readAll();
  let n = 0;
  let scenes = d.scenes;
  if (snap.scene && !(sceneId in d.scenes)) {
    const entries = Object.entries(d.scenes);
    entries.splice(Math.min(snap.scene.index, entries.length), 0, [sceneId, snap.scene.value]);
    scenes = Object.fromEntries(entries);
    n++;
  }
  const pickups = d.pickups.slice();
  const have = new Set(pickups.map((p) => p && p.id));
  for (const { index, row } of snap.pickups || []) {
    if (!row || have.has(row.id)) continue;
    pickups.splice(Math.min(index, pickups.length), 0, row);
    n++;
  }
  if (n) writeAll({ scenes, pickups });
  return n;
}

export default {
  EDIT_KEY, CUT_STATES, cutLabel, takeSceneOut, putSceneBack,
  blankSceneEdit, blankPickup, loadEdit, sceneEdit, setSceneEdit,
  listPickups, addPickup, updatePickup, removePickup,
  verdict, coverage, pickupText
};
