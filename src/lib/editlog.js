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
import { cleanLinks, withLink, withoutLink } from './links.js';

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
  const e = { cut: '', note: '', sync: false, ...patch };
  if (!cutIds.includes(e.cut)) e.cut = '';
  e.note = String(e.note || '');
  /* Audio synced to picture: one flag on the scene's own edit row. */
  e.sync = e.sync === true;
  /* Where the dailies / the scene's cut review live (links.js). An
     older row with no `links` reads back []. */
  e.links = cleanLinks(e.links);
  return e;
}

/* ---- timecode ------------------------------------------------
   Notes on a cut are pinned to a time in it. Seconds, whole, are
   the stored form; text is only how a person types and reads it. */
const MAX_TC = 359999;   // 99:59:59

/** Seconds from 'S', 'M:SS', 'H:MM:SS' or 'HH:MM:SS:FF' (frames are
    ignored — a note is not frame-accurate). null for anything else:
    garbage, negatives, seconds over 59 with a colon, minutes over 59
    once hours are given. A whole number is taken as seconds. */
export function parseTimecode(str) {
  if (typeof str === 'number') {
    return Number.isInteger(str) && str >= 0 && str <= MAX_TC ? str : null;
  }
  const s = String(str == null ? '' : str).trim();
  if (!/^\d{1,6}(:\d{1,3}){0,3}$/.test(s)) return null;
  const p = s.split(':').map(Number);
  let sec;
  if (p.length === 1) sec = p[0];
  else if (p.length === 2) { if (p[1] > 59) return null; sec = p[0] * 60 + p[1]; }
  else {
    if (p[1] > 59 || p[2] > 59) return null;
    sec = p[0] * 3600 + p[1] * 60 + p[2];
  }
  return sec <= MAX_TC ? sec : null;
}

/** 'M:SS' under an hour, 'H:MM:SS' from an hour up: 42 -> '0:42',
    3725 -> '1:02:05'. */
export function formatTimecode(seconds) {
  const n = Number(seconds);
  const t = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sc = t % 60;
  const two = (x) => String(x).padStart(2, '0');
  return h ? h + ':' + two(m) + ':' + two(sc) : m + ':' + two(sc);
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
/* The cut's target length, whole minutes; 0 = none set. */
function cleanTarget(v) {
  const n = Math.round(Number(v) || 0);
  return n > 0 && n <= 600 ? n : 0;
}

function readAll() {
  const empty = () => ({ scenes: {}, pickups: [], cuts: [], dayLinks: {}, targetMin: 0 });
  let raw = null;
  try { raw = localStorage.getItem(EDIT_KEY); } catch (e) { /* private mode */ }
  if (!raw) return empty();
  try {
    const p = JSON.parse(raw);
    const plain = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
    return {
      scenes: plain(p && p.scenes) ? p.scenes : {},
      pickups: Array.isArray(p && p.pickups) ? p.pickups : [],
      cuts: Array.isArray(p && p.cuts) ? p.cuts : [],
      dayLinks: plain(p && p.dayLinks) ? p.dayLinks : {},
      targetMin: cleanTarget(p && p.targetMin)
    };
  } catch (e) {
    return empty();
  }
}

/* EVERY collection in the blob is listed here. A writer that read the
   blob and wrote back only the collections it knew silently dropped the
   rest (the trap shots.js and costs.js each hit), so there is exactly
   one writer and it takes the whole shape. `cuts` and `dayLinks` are
   left out when empty, which keeps an older blob byte-identical across
   a read-modify-write that does not touch them. */
function writeAll(data) {
  const out = { scenes: data.scenes, pickups: data.pickups };
  if (data.cuts && data.cuts.length) out.cuts = data.cuts;
  if (data.dayLinks && Object.keys(data.dayLinks).length) out.dayLinks = data.dayLinks;
  /* The target is a member of the blob like any other: a writer that
     does not mention it keeps what is stored. */
  const target = data.targetMin === undefined ? readAll().targetMin : cleanTarget(data.targetMin);
  if (target) out.targetMin = target;
  try { localStorage.setItem(EDIT_KEY, JSON.stringify(out)); return true; }
  catch (e) { return false; }
}

/* ---- cut versions -------------------------------------------- */
let cseq = 0;
const cid = (p) => p + Date.now().toString(36) + (cseq++).toString(36);

export function blankCutNote(patch = {}) {
  const n = { id: cid('cn'), tc: 0, sceneId: '', text: '', done: false, ...patch };
  const tc = Number(n.tc);
  n.tc = Number.isFinite(tc) && tc > 0 ? Math.min(Math.floor(tc), MAX_TC) : 0;
  n.sceneId = String(n.sceneId || '');
  n.text = String(n.text || '');
  n.done = !!n.done;
  return n;
}

export function blankCut(patch = {}) {
  const c = { id: cid('cut'), name: '', date: '', note: '', links: [], notes: [], ...patch };
  c.name = String(c.name || '').trim();
  c.date = /^\d{4}-\d{2}-\d{2}$/.test(String(c.date || '')) ? c.date : '';
  c.note = String(c.note || '');
  c.links = cleanLinks(c.links);
  c.notes = sortNotes((Array.isArray(c.notes) ? c.notes : []).map((n) => blankCutNote(n)));
  return c;
}

/* Stable: equal timecodes keep their stored (creation) order. */
function sortNotes(list) {
  return list.map((n, i) => [n, i]).sort((a, b) => a[0].tc - b[0].tc || a[1] - b[1]).map((x) => x[0]);
}

/* Day links: { "3": [link, …] }, keyed by the shoot-day number. */
function cleanDayLinks(o) {
  const out = {};
  Object.keys(o || {}).forEach((k) => {
    if (!/^[1-9]\d{0,3}$/.test(k)) return;
    const l = cleanLinks(o[k]);
    if (l.length) out[k] = l;
  });
  return out;
}

export function loadEdit() {
  const d = readAll();
  const scenes = {};
  Object.keys(d.scenes).forEach((id) => { scenes[id] = blankSceneEdit(d.scenes[id]); });
  return {
    scenes,
    pickups: d.pickups.map((p) => blankPickup(p)),
    cuts: d.cuts.filter((c) => c && typeof c === 'object').map((c) => blankCut(c)),
    dayLinks: cleanDayLinks(d.dayLinks),
    ...(d.targetMin ? { targetMin: d.targetMin } : {})
  };
}

/** The cut's target length in minutes (0 = not set). */
export function getTargetMin(data) { return (data || loadEdit()).targetMin || 0; }
export function setTargetMin(minutes) {
  const d = loadEdit();
  d.targetMin = cleanTarget(minutes);
  writeAll(d);
  return d.targetMin;
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
  if (!next.cut && !next.note && !next.links.length && !next.sync) delete d.scenes[sceneId];
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

/** Put a removed pick-up back at its old place — the Undo on the
    page's remove. A pick-up already there (a double Undo) is left. */
export function restorePickup(row, index) {
  if (!row || !row.id) return null;
  const d = loadEdit();
  if (d.pickups.some((p) => p.id === row.id)) return null;
  const at = Math.max(0, Math.min(Number(index) || 0, d.pickups.length));
  d.pickups.splice(at, 0, blankPickup(row));
  writeAll(d);
  return row;
}

/* ---- links on a scene's cut review (dailies) ------------------- */
export function addSceneLink(sceneId, link) {
  const d = loadEdit();
  const cur = d.scenes[sceneId] || blankSceneEdit();
  const r = withLink(cur.links, link);
  if (r.added) { d.scenes[sceneId] = { ...cur, links: r.links }; writeAll(d); }
  return r;
}

export function removeSceneLink(sceneId, linkId) {
  const d = loadEdit();
  const cur = d.scenes[sceneId];
  if (!cur) return [];
  const links = withoutLink(cur.links, linkId);
  const next = { ...cur, links };
  if (!next.cut && !next.note && !links.length) delete d.scenes[sceneId];
  else d.scenes[sceneId] = next;
  writeAll(d);
  return links;
}

/* ---- dailies per shoot day ------------------------------------ */
const dayKey = (day) => { const n = Math.floor(Number(day)); return n >= 1 && n <= 9999 ? String(n) : ''; };

export function dayLinks(day, data) {
  return ((data || loadEdit()).dayLinks[dayKey(day)]) || [];
}

export function addDayLink(day, link) {
  const k = dayKey(day);
  if (!k) return { links: [], added: null, why: 'That is not a shoot day.' };
  const d = loadEdit();
  const r = withLink(d.dayLinks[k], link);
  if (r.added) { d.dayLinks[k] = r.links; writeAll(d); }
  return r;
}

export function removeDayLink(day, linkId) {
  const k = dayKey(day);
  const d = loadEdit();
  if (!k || !d.dayLinks[k]) return [];
  const links = withoutLink(d.dayLinks[k], linkId);
  if (links.length) d.dayLinks[k] = links; else delete d.dayLinks[k];
  writeAll(d);
  return links;
}

/* ---- cut versions: Assembly, Rough cut v1 … -------------------- */
export function listCuts(data) { return (data || loadEdit()).cuts; }

export function addCut({ name, date, note } = {}) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  const d = loadEdit();
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(String(date || ''));
  const c = blankCut({ name: clean, date: ok ? date : new Date().toISOString().slice(0, 10), note });
  d.cuts.push(c);
  writeAll(d);
  return c;
}

export function updateCut(id, patch = {}) {
  const d = loadEdit();
  const i = d.cuts.findIndex((c) => c.id === id);
  if (i < 0) return null;
  /* Notes are changed through the note functions only; a patch cannot
     replace the list from under them. */
  const { notes, id: _id, ...rest } = patch;
  const next = blankCut({ ...d.cuts[i], ...rest, id });
  if (!next.name) next.name = d.cuts[i].name;
  d.cuts[i] = next;
  writeAll(d);
  return next;
}

export function removeCut(id) {
  const d = loadEdit();
  d.cuts = d.cuts.filter((c) => c.id !== id);
  writeAll(d);
  return d.cuts;
}

/** Undo for removeCut: the cut, with its notes and links, at its old
    place. A cut already there (a double Undo) is left. */
export function restoreCut(row, index) {
  if (!row || !row.id) return null;
  const d = loadEdit();
  if (d.cuts.some((c) => c.id === row.id)) return null;
  const at = Math.max(0, Math.min(Number(index) || 0, d.cuts.length));
  d.cuts.splice(at, 0, blankCut(row));
  writeAll(d);
  return row;
}

export function addCutLink(cutId, link) {
  const d = loadEdit();
  const c = d.cuts.find((x) => x.id === cutId);
  if (!c) return { links: [], added: null, why: 'That cut is gone.' };
  const r = withLink(c.links, link);
  if (r.added) { c.links = r.links; writeAll(d); }
  return r;
}

export function removeCutLink(cutId, linkId) {
  const d = loadEdit();
  const c = d.cuts.find((x) => x.id === cutId);
  if (!c) return [];
  c.links = withoutLink(c.links, linkId);
  writeAll(d);
  return c.links;
}

/** A note on a cut. `tc` is seconds or text a person typed; a timecode
    that does not parse, or no text, adds nothing and returns null. */
export function addCutNote(cutId, { tc, sceneId, text } = {}) {
  const sec = parseTimecode(tc);
  const clean = String(text || '').trim();
  if (sec == null || !clean) return null;
  const d = loadEdit();
  const c = d.cuts.find((x) => x.id === cutId);
  if (!c) return null;
  const n = blankCutNote({ tc: sec, sceneId: sceneId || '', text: clean });
  c.notes.push(n);
  writeAll(d);
  return n;
}

export function updateCutNote(cutId, noteId, patch = {}) {
  const d = loadEdit();
  const c = d.cuts.find((x) => x.id === cutId);
  const i = c ? c.notes.findIndex((n) => n.id === noteId) : -1;
  if (i < 0) return null;
  const p = { ...patch };
  if ('tc' in p) { const sec = parseTimecode(p.tc); if (sec == null) delete p.tc; else p.tc = sec; }
  if ('text' in p) { p.text = String(p.text || '').trim(); if (!p.text) delete p.text; }
  c.notes[i] = blankCutNote({ ...c.notes[i], ...p, id: noteId });
  writeAll(d);
  return c.notes[i];
}

export function removeCutNote(cutId, noteId) {
  const d = loadEdit();
  const c = d.cuts.find((x) => x.id === cutId);
  if (!c) return [];
  c.notes = c.notes.filter((n) => n.id !== noteId);
  writeAll(d);
  return c.notes;
}

/** Undo for removeCutNote. Notes read back sorted, so the position is
    only the tie-break among equal timecodes. */
export function restoreCutNote(cutId, row, index) {
  if (!row || !row.id) return null;
  const d = loadEdit();
  const c = d.cuts.find((x) => x.id === cutId);
  if (!c || c.notes.some((n) => n.id === row.id)) return null;
  c.notes.splice(Math.max(0, Math.min(Number(index) || 0, c.notes.length)), 0, blankCutNote(row));
  writeAll(d);
  return row;
}

/** A cut's notes as plain text for an email: a heading, the open
    notes in time order, then the done ones marked. `sceneLabel` maps a
    sceneId to its label ('Sc 12'); '' or absent leaves the scene out. */
export function cutNotesText(cut, sceneLabel) {
  const c = cut || {};
  const notes = sortNotes(Array.isArray(c.notes) ? c.notes : []);
  const line = (n, mark) => {
    const label = typeof sceneLabel === 'function' && n.sceneId ? String(sceneLabel(n.sceneId) || '') : '';
    return (mark ? '[done] ' : '') + formatTimecode(n.tc) + '  ' + (label ? label + ' — ' : '') + n.text;
  };
  const head = [c.name || 'Cut', c.date].filter(Boolean).join(' · ');
  if (!notes.length) return head + '\n\nNo notes.';
  const open = notes.filter((n) => !n.done).map((n) => line(n, false));
  const done = notes.filter((n) => n.done).map((n) => line(n, true));
  return [head, '', ...open, ...(open.length && done.length ? [''] : []), ...done].join('\n');
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
  /* Pick-ups whose scene is no longer in the list — written before
     deletes went through the bin, or by a path that skipped it. No
     row draws them, so they are returned for the page to list on
     their own, or they could never be ticked or removed. */
  const ids = new Set(all.map((s) => s.id));
  const orphans = ed.pickups.filter((p) => !ids.has(p.sceneId));

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
    orphans,
    /* The film can lock picture when nothing the cut needs is still
       owed, no scene it claims was dropped, and the editor has no
       pick-up open — an open pick-up IS something owed, typed by the
       one person who knows it is. */
    ready: rows.length > 0 && owed.length === 0 && conflicts.length === 0
      && openPickups.length === 0
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
  /* Cut notes that name the scene go with it: raw rows, the cut they
     sat in and their place in that cut's stored list. */
  const notes = [];
  const cuts = d.cuts.map((c) => {
    if (!c || !Array.isArray(c.notes) || !c.notes.some((n) => n && n.sceneId === sceneId)) return c;
    const rest = [];
    c.notes.forEach((n, index) => {
      if (n && n.sceneId === sceneId) notes.push({ cutId: c.id, index, row: n });
      else rest.push(n);
    });
    return { ...c, notes: rest };
  });
  if (scene || pickups.length || notes.length) {
    const scenes = {};
    keys.forEach((k) => { if (k !== sceneId) scenes[k] = d.scenes[k]; });
    writeAll({ scenes, pickups: keep, cuts, dayLinks: d.dayLinks });
  }
  /* `notes` is only present when there are some, so an entry binned
     with none is the shape it always was. */
  return notes.length ? { scene, pickups, notes } : { scene, pickups };
}

/** Put back what takeSceneOut() took. A note written for the scene in
    the meantime is kept rather than overwritten. */
export function putSceneBack(sceneId, snap) {
  const snapNotes = (snap && snap.notes) || [];
  if (!snap || (!snap.scene && !(snap.pickups || []).length && !snapNotes.length)) return 0;
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
  /* A cut deleted in the meantime has nowhere for its notes to go;
     they stay in the bin entry's hands and are not counted. */
  const cuts = d.cuts.map((c) => (c && Array.isArray(c.notes) ? { ...c, notes: c.notes.slice() } : c));
  for (const { cutId, index, row } of snapNotes) {
    const c = cuts.find((x) => x && x.id === cutId);
    if (!c || !row || !Array.isArray(c.notes) || c.notes.some((x) => x && x.id === row.id)) continue;
    c.notes.splice(Math.min(index, c.notes.length), 0, row);
    n++;
  }
  if (n) writeAll({ scenes, pickups, cuts, dayLinks: d.dayLinks });
  return n;
}

/**
 * The running time of the cut as it stands: the scenes the editor has
 * marked In the cut or Locked, at the screen-time ESTIMATE the script
 * gives each (`secondsOf`: scene id -> seconds). A song with a length
 * REPLACES the estimate of the scenes linked to it, counted once; a song
 * with none adds nothing and is counted in `songsUntimed`. Nothing here
 * is stored.
 *   songs  [{ id, seconds }]
 */
export function cutRunTime(cov, secondsOf, songs) {
  const rows = ((cov && cov.rows) || []).filter((r) => r.edit.cut === 'in' || r.edit.cut === 'locked');
  const timed = new Map((songs || []).filter((x) => Number(x.seconds) > 0).map((x) => [x.id, Math.round(Number(x.seconds))]));
  const linked = new Set();
  const untimed = new Set();
  let sceneSeconds = 0;
  for (const r of rows) {
    const sid = r.scene.songId;
    if (sid && timed.has(sid)) { linked.add(sid); continue; }
    if (sid) untimed.add(sid);
    sceneSeconds += Number(secondsOf && secondsOf[r.scene.id]) || 0;
  }
  let songSeconds = 0;
  linked.forEach((id) => { songSeconds += timed.get(id); });
  return { seconds: sceneSeconds + songSeconds, sceneSeconds, songSeconds, scenes: rows.length, songsUntimed: untimed.size };
}

/* ---- CSV ------------------------------------------------------
   One row per scene, script order. A cell that opens with = + - @ is
   prefixed with an apostrophe so a note typed as a formula opens in a
   spreadsheet as text. */
const csvCell = (v) => {
  let t = String(v == null ? '' : v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return '"' + t.replace(/"/g, '""') + '"';
};
export const CSV_HEADER = ['Scene', 'Slug', 'Pages', 'Set got', 'Cut status', 'Audio synced',
  'Estimated seconds', 'Setups done', 'Setups planned', 'Editor note', 'Open pick-ups'];
export function toCSV(cov, secondsOf = {}) {
  const got = { full: 'Shot', part: 'Part shot', none: 'Not shot' };
  const rows = [CSV_HEADER];
  for (const r of cov.rows) {
    const s = r.scene;
    const mine = cov.openPickups.filter((p) => p.sceneId === s.id);
    rows.push([
      s.number || '',
      [s.intExt, s.location || 'Location TBC', s.dayNight].filter(Boolean).join(' · '),
      formatEighths(s.eighths || 0),
      s.shotState === 'dropped' ? 'Dropped' : got[r.got],
      cutLabel(r.edit.cut),
      r.edit.sync ? 'Yes' : 'No',
      secondsOf[s.id] != null ? secondsOf[s.id] : '',
      r.done, r.planned,
      r.edit.note,
      mine.map((p) => p.what || '').filter(Boolean).join(' | ')
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export default {
  getTargetMin, setTargetMin, cutRunTime, toCSV,
  EDIT_KEY, CUT_STATES, cutLabel, takeSceneOut, putSceneBack,
  blankSceneEdit, blankPickup, loadEdit, sceneEdit, setSceneEdit,
  listPickups, addPickup, updatePickup, removePickup, restorePickup,
  parseTimecode, formatTimecode, addSceneLink, removeSceneLink,
  dayLinks, addDayLink, removeDayLink,
  listCuts, addCut, updateCut, removeCut, restoreCut, addCutLink, removeCutLink,
  addCutNote, updateCutNote, removeCutNote, restoreCutNote, cutNotesText,
  verdict, coverage, pickupText
};
