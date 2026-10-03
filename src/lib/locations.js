/* ============================================================
   THE LOCATION / CALENDAR / MEDIA MODEL
   ------------------------------------------------------------
   Three things the Plan and Shoot phases were missing, and NONE of
   them is a new list of scenes. Read the header of src/lib/scenes.js
   first: it says one representation per thing, and this file is the
   test of whether that survived contact with a second module.

   WHAT IS DERIVED, AND WHAT IS STORED.

     a shoot day    DERIVED. `scene.shootDay` is an integer the
                    stripboard writes onto the scene (0 = unscheduled).
                    The set of days, the scenes on each, the pages and
                    the cast are all read back off the scenes.
     a location     DERIVED. The distinct `scene.location` values. The
                    user never retypes a place they already typed on a
                    scene, and renaming it on the scene renames it here.
     a calendar     STORED, but only the thin half: shoot day NUMBER →
                    calendar DATE. One integer key, one "YYYY-MM-DD".
     a recce        STORED, keyed by the location name, holding ONLY
                    what a scene has no field for — address, contact,
                    permission, power, parking, toilets, best time,
                    cost, notes.
     media          STORED in full, because nothing else in the app
                    knows about it. See the honesty note below.

   So this key never contains a scene's location, its day, its pages
   or its cast. If it did, renaming a location in the breakdown would
   leave a recce record describing a place that no longer exists — the
   stranded `sm_N_*` keys on the trap list, wearing a hat.

   A recce whose location HAS gone out of the script is not deleted
   behind the user's back either: `orphanRecces()` surfaces it so they
   can decide. Same for a date on a day that no longer has scenes.
   Silently dropping somebody's recce notes is the worse of the two
   failures in a tool people keep months of work in.

   MEDIA, HONESTLY. This app is local-first, static, and has no server
   and no file storage. It cannot host a photograph. Stuffing a base64
   image into localStorage would blow the ~5MB quota on the third
   still and take every other key on the project down with it. So the
   media store holds LINKS — {id, title, url, kind, notes, linkedTo} —
   and the page says so in as many words. It is an index of where the
   files are, not a copy of them.

   STORAGE CONTRACT. `fms_locations_v1` is registered in the four
   places the scenes.js header lists:
     1. SCOPED_KEYS in src/lib/store.js  — namespaced per project
     2. PROJECT_KEYS in src/lib/backup.js — included in backups
     3. ALL_KEYS in src/pages/hub.js     — cleared by reset
     4. the scope check in supabase-schema.sql — allowed to sync
   All four are already done for this key.

   Dates are the plain "YYYY-MM-DD" an <input type="date"> gives back.
   No Date objects in storage: a shoot date is a day on a wall
   calendar, not an instant, and round-tripping it through a timezone
   is how it ends up being yesterday.
   ============================================================ */
import Store from './store.js';
import { listScenes, totalEighths } from './scenes.js';

export const LOCATIONS_KEY = 'fms_locations_v1';

/* Where a location stands with whoever owns it. `tone` is a semantic
   class, never a hue: approved is --ok and refused is --danger, and
   neither is one of the six phase colours. */
export const PERMISSIONS = [
  { id: 'unknown',   label: 'Not asked yet', tone: 'none' },
  { id: 'scouting',  label: 'Scouting',      tone: 'open' },
  { id: 'requested', label: 'Asked',         tone: 'open' },
  { id: 'approved',  label: 'Approved',      tone: 'ok'   },
  { id: 'refused',   label: 'Refused',       tone: 'no'   }
];

export const MEDIA_KINDS = [
  'Reference image', 'Recce photos', 'Video', 'Audio',
  'Document', 'Folder', 'Other'
];

const uid = () =>
  (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

/** The key a recce record is filed under. Case and stray spaces must
    not make two records for one place, so the key is normalised and
    the DISPLAY name always comes back off the scene. */
export function locationKey(name) {
  return String(name || '').trim().toLowerCase();
}

/** A recce record with every field present, so callers never guard. */
export function blankRecce(patch = {}) {
  return {
    address: '',
    contact: '',
    permission: PERMISSIONS[0].id,
    power: '',
    parking: '',
    toilets: '',
    bestTime: '',
    cost: '',
    notes: '',
    ...patch
  };
}

/** A media reference with every field present. `url` is whatever the
    user pasted; nothing is fetched, uploaded or validated into a
    promise that this app cannot keep. */
export function blankMedia(patch = {}) {
  return {
    id: uid(),
    title: '',
    url: '',
    kind: MEDIA_KINDS[0],
    notes: '',
    linkedTo: '',
    ...patch
  };
}

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Everything persisted under this key, shape-guaranteed.
    An empty array is truthy and an empty object is truthy — both are
    on the trap list — so every collection is type-checked, not
    truth-checked. */
function readAll() {
  let raw = null;
  try { raw = localStorage.getItem(LOCATIONS_KEY); } catch (e) { /* private mode */ }
  const empty = { days: {}, recces: {}, media: [] };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) || {};
    return {
      days:   isPlainObject(parsed.days)   ? parsed.days   : {},
      recces: isPlainObject(parsed.recces) ? parsed.recces : {},
      media:  Array.isArray(parsed.media)  ? parsed.media  : []
    };
  } catch (e) {
    return empty;
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(LOCATIONS_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

/* One key, three collections — so every write is read-modify-write.
   A naive write drops whichever collection the caller wasn't holding,
   which is the defect the contacts model documents at length. */
function patchAll(patch) {
  return writeAll({ ...readAll(), ...patch });
}

/* ---- the scene side, read only -------------------------------
   `shootDay` is written by the stripboard and may be absent on every
   scene saved before that page existed, so it is read through one
   function that always answers an integer. 0 means unscheduled. This
   duplicates three lines of stripboard.js on purpose: a reader is not
   a representation, and importing a page module into a lib would be
   the actual mistake. */
export function shootDayOf(scene) {
  const n = parseInt(scene && scene.shootDay, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
export const locationName = (scene) => String((scene && scene.location) || '').trim();
export const castOf = (scene) => (scene && scene.elements && scene.elements.cast) || [];

/* ---- the calendar --------------------------------------------- */

/** The stored map, shape-guaranteed: { "3": "2026-01-12" }. */
export function listDayDates() {
  const days = readAll().days;
  const out = {};
  for (const [k, v] of Object.entries(days)) {
    if (typeof v === 'string' && v) out[String(parseInt(k, 10) || 0)] = v;
  }
  delete out['0'];
  return out;
}

export function dayDate(day) {
  return listDayDates()[String(day)] || '';
}

/** Give a shoot day a date, or clear it. Clearing DELETES the entry
    rather than storing an empty string: an empty value that lingers is
    a stranded key, and the trap list is explicit about those. */
export function setDayDate(day, iso) {
  const n = parseInt(day, 10);
  if (!Number.isFinite(n) || n <= 0) return false;
  const days = { ...readAll().days };
  const clean = String(iso || '').trim();
  if (clean) days[String(n)] = clean;
  else delete days[String(n)];
  return patchAll({ days });
}

/**
 * The shooting calendar: one entry per shoot day in use, ascending,
 * each carrying its scenes, its locations, its page total and its
 * cast. Every field but `date` is computed from the scenes on the
 * spot — which is why moving a scene on the stripboard rewrites this
 * page and nothing here has to be told.
 */
export function calendarDays(scenes) {
  const list = scenes || listScenes();
  const dates = listDayDates();
  const buckets = new Map();
  for (const scene of list) {
    const day = shootDayOf(scene);
    if (!day) continue;
    if (!buckets.has(day)) buckets.set(day, []);
    buckets.get(day).push(scene);
  }
  return [...buckets.keys()].sort((a, b) => a - b).map((day) => {
    const dayScenes = buckets.get(day);
    const cast = [];
    for (const scene of dayScenes) {
      for (const name of castOf(scene)) {
        if (!cast.some((n) => n.toLowerCase() === String(name).toLowerCase())) cast.push(name);
      }
    }
    const locations = [];
    for (const scene of dayScenes) {
      const name = locationName(scene);
      if (name && !locations.some((n) => locationKey(n) === locationKey(name))) locations.push(name);
    }
    return {
      day,
      date: dates[String(day)] || '',
      scenes: dayScenes,
      eighths: totalEighths(dayScenes),
      locations,
      cast
    };
  });
}

/** Scenes with no shoot day. They belong on the stripboard, not here. */
export function unscheduledScenes(scenes) {
  return (scenes || listScenes()).filter((s) => !shootDayOf(s));
}

/** Dates stored against a day that no longer has any scenes. Surfaced,
    never silently swept: the date may be the only record that the
    unit is booked that morning. */
export function orphanDays(scenes) {
  const live = new Set(calendarDays(scenes).map((d) => d.day));
  return Object.entries(listDayDates())
    .map(([k, date]) => ({ day: parseInt(k, 10), date }))
    .filter((d) => d.day > 0 && !live.has(d.day))
    .sort((a, b) => a.day - b.day);
}

/* ---- locations ------------------------------------------------ */

export function getRecce(name) {
  const stored = readAll().recces[locationKey(name)];
  return blankRecce(isPlainObject(stored) ? stored : {});
}

/** Merge a patch into one location's recce record. Creates it on first
    write; there is no "add a location", because a location is a scene's
    location and adding one here would be the second representation. */
export function setRecce(name, patch) {
  const key = locationKey(name);
  if (!key) return false;
  const recces = { ...readAll().recces };
  recces[key] = { ...getRecce(key), ...patch };
  return patchAll({ recces });
}

export function removeRecce(name) {
  const recces = { ...readAll().recces };
  delete recces[locationKey(name)];
  return patchAll({ recces });
}

/**
 * The location index: every distinct place in the script, with the
 * scenes shot there, the pages, the days it falls on, and the recce
 * record filed against it. Longest first — the order a schedule gets
 * built in, and the same order the reports page uses.
 */
export function locationIndex(scenes) {
  const list = scenes || listScenes();
  const rows = new Map();
  for (const scene of list) {
    const name = locationName(scene);
    if (!name) continue;
    const key = locationKey(name);
    if (!rows.has(key)) rows.set(key, { key, name, scenes: [], days: new Set() });
    const row = rows.get(key);
    row.scenes.push(scene);
    const day = shootDayOf(scene);
    if (day) row.days.add(day);
  }
  return [...rows.values()]
    .map((row) => ({
      key: row.key,
      name: row.name,
      scenes: row.scenes,
      eighths: totalEighths(row.scenes),
      days: [...row.days].sort((a, b) => a - b),
      unscheduled: row.scenes.filter((s) => !shootDayOf(s)).length,
      recce: getRecce(row.key)
    }))
    .sort((a, b) => b.eighths - a.eighths || b.scenes.length - a.scenes.length
      || a.name.localeCompare(b.name));
}

/** Scenes with no location typed on them yet. */
export function unplacedScenes(scenes) {
  return (scenes || listScenes()).filter((s) => !locationName(s));
}

/** Recce records for places no scene mentions any more — renamed in
    the breakdown, or their last scene deleted. */
export function orphanRecces(scenes) {
  const live = new Set(locationIndex(scenes).map((l) => l.key));
  return Object.entries(readAll().recces)
    .filter(([key, value]) => key && !live.has(key) && isPlainObject(value))
    .map(([key, value]) => ({ key, recce: blankRecce(value) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/* ---- media ----------------------------------------------------- */

export function listMedia() {
  return readAll().media
    .filter(isPlainObject)
    .map((m) => ({ ...blankMedia(), ...m }));
}

export function saveMedia(media) {
  return patchAll({ media });
}

export function addMedia(patch) {
  const media = listMedia();
  const item = blankMedia(patch);
  media.push(item);
  saveMedia(media);
  return item;
}

export function updateMedia(id, patch) {
  const media = listMedia();
  const i = media.findIndex((m) => m.id === id);
  if (i < 0) return null;
  media[i] = { ...media[i], ...patch, id };   // id is not patchable
  saveMedia(media);
  return media[i];
}

export function removeMedia(id) {
  const media = listMedia().filter((m) => m.id !== id);
  saveMedia(media);
  return media;
}

/* What a media item points at, as a token rather than a copy:
   '' (nothing), 'loc:<location key>' or 'day:<n>'. The label is
   looked up at render time, so renaming a location on a scene renames
   it on every link that points there. */
export const LINK_NONE = '';
export const locationLink = (name) => 'loc:' + locationKey(name);
export const dayLink = (day) => 'day:' + parseInt(day, 10);

/** Resolve a link token to a label, or null when it points nowhere. */
export function linkLabel(token, scenes) {
  const value = String(token || '');
  if (!value) return null;
  if (value.startsWith('day:')) {
    const n = parseInt(value.slice(4), 10);
    return Number.isFinite(n) && n > 0 ? 'Day ' + n : null;
  }
  if (value.startsWith('loc:')) {
    const key = value.slice(4);
    const hit = locationIndex(scenes).find((l) => l.key === key);
    return hit ? hit.name : null;
  }
  return null;
}

export default {
  LOCATIONS_KEY, PERMISSIONS, MEDIA_KINDS,
  locationKey, blankRecce, blankMedia,
  shootDayOf, locationName, castOf,
  listDayDates, dayDate, setDayDate, calendarDays, unscheduledScenes, orphanDays,
  getRecce, setRecce, removeRecce, locationIndex, unplacedScenes, orphanRecces,
  listMedia, saveMedia, addMedia, updateMedia, removeMedia,
  LINK_NONE, locationLink, dayLink, linkLabel
};
