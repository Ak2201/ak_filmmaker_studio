/* ============================================================
   THE LIGHT ON A RECCE CARD — sunrise, sunset, and the late-wrap flag
   ------------------------------------------------------------
   For ONE location: the sun on each of its shoot days that has a date,
   and a warning on a day whose planned wrap falls after sunset while an
   exterior daylight scene is still to be shot at that place.

   PURE. Everything it reads is passed in, so Node can test it
   (scripts/test-sun.mjs) and nothing here touches storage. The page
   hands over the recce, the location's days and a function that says
   what the day's wrap is.

   WHAT IT WILL NOT DO. It never falls back to a city. src/lib/sun.js
   offers Chennai for a place with no pin and the call sheet and the
   shoot day say so out loud; on a recce card, which is the page where
   the pin is entered, the honest answer for an unpinned place is
   nothing at all — `pinned: false` and no rows. And it raises the flag
   only on a wrap somebody wrote down (call sheet or DPR): no wrap
   typed, no flag, the same rule the other two flags follow.

   WHAT THE FLAG MEANS. The day wraps after sunset here, and this place
   still has an exterior, not-night scene on that day. The schedule has
   no per-scene clock times, so it cannot say WHEN the exterior is
   shot; it says what is true — the day outlasts the light, and these
   scenes need it — and leaves the ordering to the stripboard.
   ============================================================ */
import Sun from './sun.js';
import { coordsOf } from './recce-geo.js';

const settled = (s) => s && (s.shotState === 'shot' || s.shotState === 'dropped');

/**
 * @param {object}   a
 * @param {object}   a.recce        the location's recce record (lat/lng strings)
 * @param {Array}    a.days         [{ day, date, scenes }] — this location's
 *                                  shoot days, scenes being ONLY those shot here
 * @param {Function} a.wrapOf       (dayNumber) → "HH:MM" or '' — the day's later wrap
 * @param {Function} [a.deviceOffset] (iso) → minutes west; default Sun.deviceOffsetOn
 * @returns {{ pinned: boolean, place: ({lat,lng}|null), rows: Array, undated: number }}
 *   rows: [{ day, date, light, wrap, flag }] where flag is null or
 *   { wrap, sunset, scenes: [scene numbers] }
 */
export function recceLight({ recce, days = [], wrapOf = () => '', deviceOffset = Sun.deviceOffsetOn } = {}) {
  const place = coordsOf(recce);
  if (!place) return { pinned: false, place: null, rows: [], undated: 0 };
  const rows = [];
  let undated = 0;
  for (const d of days) {
    if (!d || !d.date) { undated += 1; continue; }
    const light = Sun.daylight(d.date, place, { deviceOffset: deviceOffset(d.date) });
    if (!light) { undated += 1; continue; }
    const wrap = String(wrapOf(d.day) || '').trim();
    let flag = null;
    if (wrap && Sun.isPastSunset(wrap, light)) {
      const ext = (d.scenes || []).filter((s) => Sun.needsDaylight(s) && !settled(s));
      if (ext.length) flag = { wrap, sunset: light.sunset, scenes: ext.map((s) => String(s.number || '').trim() || '—') };
    }
    rows.push({ day: d.day, date: d.date, light, wrap, flag });
  }
  rows.sort((a, b) => a.day - b.day);
  return { pinned: true, place, rows, undated };
}

export default { recceLight };
