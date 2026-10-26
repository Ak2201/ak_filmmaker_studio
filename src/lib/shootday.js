/* ============================================================
   SHOOT DAY — the only screen that is about TODAY
   ------------------------------------------------------------
   Every other scene-derived view answers a planning question:
   what is in the film, what order, who is needed, what it costs.
   This one answers "what are we shooting now, and did we get it",
   and the difference changes what it is allowed to assume.

   IT IS THE ONE VIEW THAT WRITES BACK. The chain has run one way
   until now — scenes feed the breakdown, the stripboard, the day
   out of days and the call sheet, and none of them tell the scene
   anything. Marking a scene shot is the day answering the plan.
   That is one new FIELD on an existing record (scenes.shotState),
   not a new model and not a new key: blankScene() spreads under
   every stored row, so scenes written before it exist read back as
   unshot.

   NO CLOCK IN THE DERIVATION. pickDay() looks at today's date, and
   that is a choice a CALLER makes, not something baked into a
   report — the oracle cannot hold a clock, and a function whose
   answer changes at midnight is one that cannot be tested. So the
   date comparison lives in one named function and everything else
   takes a day number.

   NOTHING HERE IS SORTED BY SCENE NUMBER. Scenes come back in the
   order the stripboard put them, because that IS the shooting
   order and re-sorting would quietly discard the AD's work.
   ============================================================ */
import Scenes, { totalEighths, formatEighths, ELEMENT_CATEGORIES } from './scenes.js';
import Locations from './locations.js';

/** Done enough to not shoot again. 'part' is NOT done. */
const isDone = (s) => s.shotState === 'shot' || s.shotState === 'dropped';
/** Shot, and so in the can. A dropped scene is settled for the day
 *  (isDone) but was never filmed, so it is not counted as shot — the
 *  DPR counts the two apart and the shoot day must agree with it. */
const isShot = (s) => s.shotState === 'shot';

/**
 * Every shoot day with its own progress.
 *
 * Built on calendarDays(), which already groups scenes by day and
 * collects that day's cast and locations — this adds only the
 * question calendarDays has no reason to ask.
 */
export function days(scenes) {
  const list = scenes || Scenes.listScenes();
  return Locations.calendarDays(list).map((d) => {
    const done  = d.scenes.filter(isDone);
    const shot  = d.scenes.filter(isShot);
    const total = totalEighths(d.scenes);
    return {
      ...d,
      done:      done.length,
      shot:      shot.length,
      eighthsShot: totalEighths(shot),
      pagesShot:   formatEighths(totalEighths(shot)),
      remaining: d.scenes.length - done.length,
      complete:  d.scenes.length > 0 && done.length === d.scenes.length,
      eighthsDone:  totalEighths(done),
      eighthsTotal: total,
      pagesDone:  formatEighths(totalEighths(done)),
      pagesTotal: formatEighths(total)
    };
  });
}

/**
 * Which day to open on.
 *
 * Today by date if one matches, else the first day with work left,
 * else the last day — a wrapped shoot should open on the end of it
 * rather than bouncing back to day one.
 *
 * `now` is a parameter so a test can pin it. The default is the
 * only place in this module that reads a clock.
 */
export function pickDay(scenes, now) {
  const all = days(scenes);
  if (!all.length) return 0;
  const today = toISODate(now || new Date());
  const match = all.find((d) => String(d.date || '').slice(0, 10) === today);
  if (match) return match.day;
  const next = all.find((d) => !d.complete);
  return (next || all[all.length - 1]).day;
}

/** `?day=N` from a query string, or null. The one way a link says
 *  which shoot day to open (the DPR and the shoot day pass it both ways). */
export function dayFromSearch(search) {
  try { return parseInt(new URLSearchParams(search).get('day'), 10) || null; } catch (e) { return null; }
}

/**
 * "Day 05 of 18". Day NUMBERS are never compacted — a day emptied on
 * the stripboard leaves a gap — while the count is the days that still
 * have scenes, so a bare "Day N of M" can read "Day 18 of 17". When the
 * number and the position differ, the position is said instead:
 * "Day 18 · 17 of 17". `pad` formats a number (identity by default).
 */
export function dayOfLabel(day, all, pad = String, sep = ' of ') {
  const n = Number(day && day.day != null ? day.day : day);
  const list = all || [];
  const pos = list.findIndex((d) => d.day === n) + 1;
  if (!pos || pos === n) return 'Day ' + pad(n) + sep + pad(list.length);
  return 'Day ' + pad(n) + ' · ' + pos + sep + list.length;
}

/** Local calendar date, not UTC — the day the person is standing in. */
export function toISODate(d) {
  const z = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}

/** One day, with its scenes in shooting order. */
export function detail(day, scenes) {
  const all = days(scenes);
  return all.find((d) => d.day === Number(day)) || null;
}

/**
 * Mark a scene, or clear it by passing ''.
 *
 * Writes through updateScene so the storage proxy, the save event
 * and every subscriber behave exactly as they do for any other
 * scene edit. Nothing special happens on the day.
 */
export function mark(sceneId, state) {
  const ok = ['', 'shot', 'part', 'dropped'];
  const next = ok.includes(state) ? state : '';
  return Scenes.updateScene(sceneId, {
    shotState: next,
    shotAt: next ? new Date().toISOString() : ''
  });
}

/** The whole production, for a line that says how far in we are. */
export function overall(scenes) {
  const list = scenes || Scenes.listScenes();
  const done = list.filter(isDone);
  const shot = list.filter(isShot);
  return {
    scenes: list.length,
    done: done.length,
    shot: shot.length,
    eighthsShot: totalEighths(shot),
    pagesShot: formatEighths(totalEighths(shot)),
    eighthsDone: totalEighths(done),
    eighthsTotal: totalEighths(list),
    pagesDone: formatEighths(totalEighths(done)),
    pagesTotal: formatEighths(totalEighths(list))
  };
}

/**
 * The call sheets that are THIS day's: every scene they hold sits on
 * shoot day `day`. Read-only, derived on the call — the same rule the
 * call sheet uses to read its schedule date, so the two pages agree on
 * which sheet a day has. A sheet with a planned wrap sorts first,
 * because that is the time the sunset check reads.
 */
export function sheetsForDay(day, sheets, scenes) {
  const n = Number(day) || 0;
  if (!n) return [];
  const list = scenes || Scenes.listScenes();
  const byId = new Map(list.map((s) => [s.id, s]));
  return (sheets || []).filter((sheet) => {
    const on = (sheet.sceneIds || []).map((id) => byId.get(id)).filter(Boolean);
    return on.length > 0 && on.every((s) => Locations.shootDayOf(s) === n);
  }).sort((a, b) => (b.wrap ? 1 : 0) - (a.wrap ? 1 : 0));
}

/* ---- the takes log ---------------------------------------------
   One optional field on the scene record (`takes`, see blankScene):
   a list of { n, circled, note, at }. Appended on the floor, never on
   load; a scene with no log reads back []. The three writers go through
   updateScene() like mark() does, so the save event and every
   subscriber behave as for any scene edit. */

/** Shape-guaranteed: a hand-edited or damaged blob reads as what it can. */
export function cleanTakes(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  raw.forEach((t) => {
    if (!t || typeof t !== 'object') return;
    const n = parseInt(t.n, 10);
    if (!Number.isFinite(n) || n < 1 || out.some((x) => x.n === n)) return;
    out.push({ n, circled: !!t.circled, note: String(t.note || ''), at: String(t.at || '') });
  });
  return out.sort((a, b) => a.n - b.n);
}

export const takesOf = (scene) => cleanTakes(scene && scene.takes);

/** "4 takes", "4 takes (Take 3 circled)", "4 takes (Takes 2, 3 circled)"; '' with none. */
export function takesLine(scene) {
  const t = takesOf(scene);
  if (!t.length) return '';
  const c = t.filter((x) => x.circled).map((x) => x.n);
  const head = t.length + (t.length === 1 ? ' take' : ' takes');
  if (!c.length) return head;
  return head + ' (' + (c.length === 1 ? 'Take ' : 'Takes ') + c.join(', ') + ' circled)';
}

function writeTakes(sceneId, fn) {
  const scene = Scenes.listScenes().find((s) => s.id === sceneId);
  if (!scene) return null;
  return Scenes.updateScene(sceneId, { takes: fn(takesOf(scene)) });
}

/** The next take: one past the highest number logged. */
export function logTake(sceneId, { circled = false, note = '' } = {}) {
  return writeTakes(sceneId, (t) => t.concat({
    n: t.reduce((m, x) => Math.max(m, x.n), 0) + 1,
    circled: !!circled, note: String(note || ''), at: new Date().toISOString()
  }));
}

/** Circle or un-circle one take. */
export function circleTake(sceneId, n) {
  return writeTakes(sceneId, (t) => t.map((x) => (x.n === Number(n) ? { ...x, circled: !x.circled } : x)));
}

/** Take the last take back off: the undo for a mis-tap. */
export function undoTake(sceneId) {
  return writeTakes(sceneId, (t) => t.slice(0, -1));
}

/* ---- the floor note ---------------------------------------------
   One free-text field on the scene record (`floorNote`, see
   blankScene). Written only here, on a press of Save, never on load;
   an empty note clears the field rather than storing whitespace. */
export const FLOOR_NOTE_MAX = 2000;

export function cleanNote(raw) {
  return String(raw == null ? '' : raw).replace(/\r\n?/g, '\n').trim().slice(0, FLOOR_NOTE_MAX);
}

export const floorNoteOf = (scene) => cleanNote(scene && scene.floorNote);

export function setFloorNote(sceneId, text) {
  const scene = Scenes.listScenes().find((s) => s.id === sceneId);
  if (!scene) return null;
  const next = cleanNote(text);
  if (next === floorNoteOf(scene)) return scene;   // nothing changed, nothing written
  return Scenes.updateScene(sceneId, { floorNote: next });
}

/* ---- what the scene needs on the floor (PURE, derived) ---------
   The breakdown's tagged elements other than cast (the card prints
   cast on its own line), in ELEMENT_CATEGORIES order, and the shot
   list's coverage for the scene: setups ticked, lenses, rigs and the
   blocking map's cameras. Only what somebody tagged or typed; an
   untagged category is absent, never "none". */
export function sceneNeeds(scene, shots, cameras) {
  const els = (scene && scene.elements) || {};
  const tags = [];
  ELEMENT_CATEGORIES.forEach((c) => {
    if (c.id === 'cast') return;
    const list = Array.isArray(els[c.id]) ? els[c.id].map((x) => String(x || '').trim()).filter(Boolean) : [];
    list.forEach((name) => tags.push({ cat: c.id, label: c.label, name }));
  });
  const mine = (shots || []).filter((s) => s.sceneId === (scene && scene.id));
  const uniq = (xs) => [...new Set(xs.map((x) => String(x || '').trim()).filter(Boolean))];
  return {
    tags,
    setups: mine.length,
    setupsDone: mine.filter((s) => s.done).length,
    lenses: uniq(mine.map((s) => s.lens)),
    rigs: uniq(mine.map((s) => s.rig)),
    cameras: uniq((cameras || []).map((c) => c.name || c.label))
  };
}

/* ---- the nearest help (PURE) -----------------------------------
   The recce's free-text hospital and police lines for each of the
   day's locations, with a dialable number when the text holds one.
   The distance the prototypes print is not stored, so it is not shown. */
export function phoneIn(text) {
  /* EVERY digit run is a candidate, not only the first: a distance
     ("1.5 - 2 km") ahead of the number must not hide it. Exactly six
     digits is an Indian PIN code ("Chennai 600 006"), and a Call button
     that dials the postcode on an emergency panel is worse than none. */
  const re = /\+?\d[\d\s().-]{5,}\d/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const digits = m[0].replace(/[^\d+]/g, '');
    const n = digits.replace(/\D/g, '').length;
    if (n >= 7) return digits;
  }
  return '';
}

export function nearestHelp(places) {
  return (places || []).map(({ name, recce }) => {
    const r = recce || {};
    const rows = [];
    if (String(r.hospital || '').trim()) rows.push({ kind: 'hospital', text: String(r.hospital).trim(), tel: phoneIn(r.hospital) });
    if (String(r.police || '').trim()) rows.push({ kind: 'police', text: String(r.police).trim(), tel: phoneIn(r.police) });
    return { name, rows };
  }).filter((p) => p.rows.length);
}

/* ---- the floor monitor's numbers (all PURE) -------------------- */

/** Scenes not yet done: the work that is left. 'part' stays on the list. */
export function scenesLeft(dayRow) {
  return dayRow ? dayRow.remaining : 0;
}

/**
 * The wrap to show. A PLANNED wrap (the call sheet's or the DPR's, a
 * time somebody wrote down) wins and says so. Without one, a wrap is
 * ESTIMATED only when the crew call is known: the call plus a working
 * day scaled by this day's pages over the page target. Nothing known,
 * nothing shown. `now`-free: it never reads a clock.
 */
export function wrapEstimate({ plannedWrap, crewCall, eighths, target, dayHours } = {}) {
  const hm = (m) => String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  const mins = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '').trim()); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
  if (mins(plannedWrap) !== null) return { time: String(plannedWrap).trim().slice(0, 5), kind: 'planned' };
  const call = mins(crewCall);
  const e = Number(eighths) || 0, t = Number(target) || 0, hrs = Number(dayHours) || 0;
  if (call === null || !e || !t || !hrs) return { time: '', kind: '' };
  return { time: hm(call + Math.round((e / t) * hrs * 60)), kind: 'estimate' };
}

/**
 * Where the day's marks fall on a 0..1 line from `from` to `to` minutes
 * (clamped), for the solar timeline. Anything not a time is null.
 */
export function timelineAt(hhmm, from, to) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '').trim());
  if (!m || to <= from) return null;
  const v = (+m[1] * 60 + +m[2] - from) / (to - from);
  return Math.max(0, Math.min(1, v));
}

export default { days, pickDay, detail, mark, overall, toISODate, dayFromSearch, dayOfLabel, sheetsForDay,
  cleanTakes, takesOf, takesLine, logTake, circleTake, undoTake, scenesLeft, wrapEstimate, timelineAt,
  cleanNote, floorNoteOf, setFloorNote, sceneNeeds, phoneIn, nearestHelp };
