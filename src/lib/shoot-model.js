/* ============================================================
   SHOOT DAY — the page's logic, without the page
   ------------------------------------------------------------
   src/lib/shootday.js owns what a day IS. This file holds what
   src/pages/shoot.js used to work out for itself that needs no DOM:
   the slug line, the floor-needs facts, the dates the page prints,
   the day's light and the solar timeline's geometry, the exteriors a
   late wrap puts in the dark, and the times row. Nothing here touches
   `document` (docs/ARCHITECTURE.md, rule L2) or imports the view (L1).
   ============================================================ */
import Locations from './locations.js';
import Sun from './sun.js';
import Geo from './recce-geo.js';

/* slug — the scene heading as the floor reads it — lives in scenes.js,
   shared with edit-model.js; re-exported so callers keep this name. */
export { slug } from './scenes.js';

export const STATE_WORD = { shot: 'Shot', part: 'Part-shot', dropped: 'Dropped' };

/** The scenes still to shoot on a day, in its order. */
export const incompleteScenes = (scenes) => scenes.filter((x) => x.shotState !== 'shot' && x.shotState !== 'dropped');

/** The floor-needs facts, as [label, value] pairs. `n` is
 *  Shoot.sceneNeeds(); a fact with nothing behind it is left out. */
export function needsFacts(n) {
  const facts = [];
  if (n.setups) facts.push(['Setups', n.setupsDone + ' of ' + n.setups + ' ticked']);
  if (n.cameras.length) facts.push(['Cameras', n.cameras.join(', ')]);
  if (n.lenses.length) facts.push(['Lenses', n.lenses.join(', ')]);
  if (n.rigs.length) facts.push(['Rig', n.rigs.join(', ')]);
  return facts;
}

/* "2024-02-12" is how the date is stored, not how anybody reads it.
   Built from the parts rather than `new Date(iso)`, which reads a
   bare ISO date as UTC midnight and prints the day before west of
   Greenwich. Anything that is not a date prints as typed. */
export function niceDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
/* "12 Feb" — the day strip's date, built from the parts like niceDate. */
export function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** The day's locations with their recce notes. */
export const placesOf = (locations) => locations.map((name) => ({ name, recce: Locations.getRecce(name) }));

/** The day's light and the place it is for; null when the day has no date. */
export function lightFor(day) {
  if (!day.date) return null;
  const place = Geo.placeFor(placesOf(day.locations));
  const light = Sun.daylight(day.date, place, { deviceOffset: Sun.deviceOffsetOn(day.date) });
  return light ? { light, place } : null;
}

export const mins = (t) => Sun.minutesOf(String(t || '').slice(0, 5));
export const rangeOf = (span) => {
  const m = /^(\d{2}:\d{2})–(\d{2}:\d{2})$/.exec(span || '');
  return m ? [mins(m[1]), mins(m[2])] : null;
};
export const pct = (v) => (Math.round(v * 1000) / 10) + '%';
export const clockOf = (m) => Sun.clock(m);

/* The solar timeline's geometry: the day's bar, drawn from sunrise,
   sunset and the two golden-hour spans of src/lib/sun.js, with the crew
   call and the wrap placed on it when somebody has written them down.
   Nothing on it is invented: an absent time is an absent tick. The
   window is the call (or an hour before sunrise) to the wrap (or two
   hours after sunset), widened to whole hours. `now` is the minute of
   the day when the open day is today, else null.

   Returns { from, to, span, segs: [{ a, b, cls, label, width }],
   ticks: [{ text, cls, left, side }] } — `side` is '.is-r', '.is-l' or ''. */
export function timelinePlan(light, { crewCall, wrapTime, now = null }) {
  const rise = light.sunriseMinutes, set = light.sunsetMinutes;
  const call = mins(crewCall), wrapM = mins(wrapTime);
  const from = Math.floor(Math.min(call == null ? rise - 60 : call, rise - 60) / 60) * 60;
  const to = Math.ceil(Math.max(wrapM == null ? set + 120 : wrapM, set + 60) / 60) * 60;
  const span = to - from;
  const at = (m) => (m - from) / span;
  const gAm = rangeOf(light.goldenAm), gPm = rangeOf(light.goldenPm);
  const segs = [];
  const seg = (a, b, cls, label) => { if (b > a) segs.push({ a, b, cls, label, width: pct((b - a) / span) }); };
  seg(from, rise, 'is-dark', 'Before sunrise');
  if (gAm) { seg(rise, gAm[1], 'is-gold', 'Golden hour, morning'); seg(gAm[1], gPm ? gPm[0] : set, 'is-day', 'Daylight'); }
  else seg(rise, gPm ? gPm[0] : set, 'is-day', 'Daylight');
  if (gPm) { seg(gPm[0], Math.min(gPm[1], to), 'is-gold', 'Golden hour, evening'); seg(Math.min(gPm[1], to), set, 'is-day', 'Daylight'); }
  seg(set, to, 'is-dark', 'After sunset');
  const ticks = [];
  const tick = (m, text, cls) => {
    if (m == null) return;
    const t = at(m);
    if (t < 0 || t > 1) return;
    ticks.push({ text, cls, left: pct(t), side: t > 0.82 ? '.is-r' : t < 0.18 ? '.is-l' : '' });
  };
  tick(call, clockOf(call) + ' call', 'is-call');
  tick(wrapM, clockOf(wrapM) + ' wrap', 'is-wrap');
  if (now != null && now >= from && now <= to) tick(now, '▲ now ' + clockOf(now), 'is-now');
  return { from, to, span, segs, ticks };
}

/** The exteriors still to shoot on a day whose planned wrap is after
 *  sunset — the scenes that need the light. null when the wrap is not
 *  late (or nobody has written one down). */
export function lateExteriors(dayScenes, plannedWrap, light) {
  if (!plannedWrap || !Sun.isPastSunset(plannedWrap, light)) return null;
  return dayScenes.filter((s) => Sun.needsDaylight(s) && s.shotState !== 'shot' && s.shotState !== 'dropped');
}

/** Crew call, first shot, lunch and wrap as [label, value] pairs, read
 *  off the day's DPR with the call sheet's call and planned wrap
 *  standing in. A time nobody has written is ''. */
export function timesCells(rec, crewCall, plannedWrap) {
  const lunch = rec.lunchIn && rec.lunchOut ? rec.lunchIn + '–' + rec.lunchOut : rec.lunchIn || rec.lunchOut || '';
  return [
    ['Crew call', crewCall],
    ['First shot', rec.firstShot],
    ['Lunch break', lunch],
    ['Wrap', plannedWrap || rec.cameraWrap]
  ];
}

/** The wrap card's note, from Shoot.wrapEstimate()'s kind. */
export const wrapNote = (kind) =>
  kind === 'planned' ? 'planned wrap' : kind === 'estimate' ? 'estimated from call and pages' : 'no call or wrap set yet';
