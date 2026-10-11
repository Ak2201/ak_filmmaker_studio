/* ============================================================
   TRIAL TIME — how a trial's length and what is left of it are said
   ------------------------------------------------------------
   The owner's decision, 11 Oct 2026: there is no free plan to live on,
   only a free TRIAL, and its length is set in HOURS. The database still
   stores minutes (billing_settings.trial_minutes, studio_members.
   trial_minutes — section 30's columns, unchanged, so every row already
   written stays valid); hours are how the console takes the number and
   how every page says it.

   PURE AND IMPORT-FREE, on purpose: the landing page (start.js) shares
   it with the app, so it sits in vite.config.js's `startlib` chunk with
   funnel.js. The day this imports store.js the landing page pays for
   the whole app bundle again (CLAUDE.md, "A PURE module shared with
   CORE is swallowed by CORE").
   ============================================================ */

/** Hours as the console shows them: 0.5, 1, 1.5, 24 — never 1.4999. */
export function minutesToHours(mins) {
  const m = Number(mins);
  if (!(m > 0)) return 0;
  return Math.round((m / 60) * 100) / 100;
}

/** Whole minutes for the database, from hours typed in the console.
 *  Null for anything that is not a positive number. */
export function hoursToMinutes(hours) {
  const h = Number(String(hours == null ? '' : hours).trim().replace(',', '.'));
  if (!Number.isFinite(h) || h <= 0) return null;
  return Math.round(h * 60);
}

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/** A trial's LENGTH in words: "30 minutes", "2 hours", "1.5 hours",
 *  "7 days". Days only once it is two or more whole days. */
export function trialLength(mins) {
  const m = Math.round(Number(mins) || 0);
  if (m <= 0) return '';
  if (m < 60) return plural(m, 'minute', 'minutes');
  if (m >= 2880 && m % 1440 === 0) return plural(m / 1440, 'day', 'days');
  return plural(minutesToHours(m), 'hour', 'hours');
}

/** What is LEFT, for the band: minutes under an hour, hours and
 *  minutes under two days, days and hours beyond. Never seconds — a
 *  ticking second counter is pressure theatre. */
export function timeLeft(ms) {
  const mins = Math.max(0, Math.ceil(Number(ms) / 60000));
  if (mins <= 1) return 'under a minute';
  if (mins < 60) return mins + ' minutes';
  const hrs = Math.floor(mins / 60), rest = mins % 60;
  if (hrs < 48) return hrs + ' h' + (rest ? ' ' + rest + ' min' : '');
  const days = Math.floor(hrs / 24), h = hrs % 24;
  return plural(days, 'day', 'days') + (h ? ' ' + h + ' h' : '');
}

export default { minutesToHours, hoursToMinutes, trialLength, timeLeft };
