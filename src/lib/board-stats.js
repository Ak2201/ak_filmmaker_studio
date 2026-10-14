/* ============================================================
   BOARD STATS — the stripboard's derived figures (14 Oct 2026)
   ------------------------------------------------------------
   PURE. Every function here takes what the page already read (the
   scenes, calendarDays(), a DPR record, the day's call sheets) and
   answers a figure, or null when the figure has nothing behind it.
   Nothing is stored and nothing is read from storage, so the parity
   pass's new numbers — average pages a day, the calendar span, who is
   working today, the day's call — cannot drift from the model they
   are counted from. `npm run test:stripboard` asserts them.

   REAL DATA ONLY. A figure that cannot be measured is null and the
   page hides it: a six-day week is an assumption, so the span is
   counted from the dates the Plan holds and from nothing else.
   ============================================================ */

const shootDayOf = (scene) => {
  const n = parseInt(scene && scene.shootDay, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const eighthsOf = (scene) => Math.max(0, Number(scene && scene.eighths) || 0);

/** Scheduled pages over shoot days. null with no day in use.
    { eighths, days, avg } — avg is whole eighths, rounded. */
export function pace(scenes) {
  const days = new Set();
  let eighths = 0;
  for (const s of scenes || []) {
    const d = shootDayOf(s);
    if (!d) continue;
    days.add(d);
    eighths += eighthsOf(s);
  }
  if (!days.size) return null;
  return { eighths, days: days.size, avg: Math.round(eighths / days.size) };
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
function dayNumber(iso) {
  const m = ISO.exec(String(iso || ''));
  if (!m) return null;
  return Math.round(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
}

/** The calendar the dated days cover, first date to last. null when no
    day carries a date. { first, last, spanDays, weeks, dated, total } */
export function calendarSpan(calDays) {
  const list = Array.isArray(calDays) ? calDays : [];
  const dated = list.map((d) => ({ iso: String(d.date || '').slice(0, 10), n: dayNumber(d.date) }))
    .filter((d) => d.n != null)
    .sort((a, b) => a.n - b.n);
  if (!dated.length) return null;
  const spanDays = dated[dated.length - 1].n - dated[0].n + 1;
  return {
    first: dated[0].iso,
    last: dated[dated.length - 1].iso,
    spanDays,
    weeks: Math.ceil(spanDays / 7),
    dated: dated.length,
    total: list.length
  };
}

/** The shoot day dated `iso`, or null when no day is. */
export function dayOnDate(calDays, iso) {
  const want = String(iso || '').slice(0, 10);
  if (!want) return null;
  return (calDays || []).find((d) => String(d.date || '').slice(0, 10) === want) || null;
}

/** The day's call time: the DPR's crew call first (what happened),
    the call sheet's general call second (what was planned), '' with
    neither. The same order shoot.html reads them in. */
export function dayCall(dpr, sheets) {
  const crew = String((dpr && dpr.crewCall) || '').trim();
  if (crew) return crew;
  for (const sh of sheets || []) {
    const g = String((sh && sh.generalCall) || '').trim();
    if (g) return g;
  }
  return '';
}

/** Shoot hours as "≈ 2h 15m" (nearest quarter hour), '' for none. */
export function formatHours(hours) {
  const x = Number(hours);
  if (!Number.isFinite(x) || x <= 0) return '';
  const q = Math.max(1, Math.round(x * 4));
  const hh = Math.floor(q / 4), mm = (q % 4) * 15;
  return '≈ ' + (hh ? hh + 'h' + (mm ? ' ' + String(mm).padStart(2, '0') + 'm' : '') : mm + 'm');
}

/** The target runtime in minutes: Reports' field (songs blob
    `targetMinutes`) first, the Edit Log's own stored value as the
    fallback. Both are passed in, so this stays pure. 0 for none. */
export function targetMinutes(reportsMin, editLogMin) {
  const a = Math.round(Number(reportsMin) || 0);
  if (a > 0) return a;
  const b = Math.round(Number(editLogMin) || 0);
  return b > 0 ? b : 0;
}

export default { pace, calendarSpan, dayOnDate, dayCall, formatHours, targetMinutes };
