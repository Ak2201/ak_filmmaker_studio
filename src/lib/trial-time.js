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

/** What is LEFT, in WORDS, for sentences (purchase.js and others):
 *  minutes under an hour, hours and minutes under two days, days and
 *  hours beyond. Never seconds — a sentence does not tick. The sidebar's
 *  live clock is countdown() below, which does show seconds (owner,
 *  12 Oct 2026). */
export function timeLeft(ms) {
  const mins = Math.max(0, Math.ceil(Number(ms) / 60000));
  if (mins <= 1) return 'under a minute';
  if (mins < 60) return mins + ' minutes';
  const hrs = Math.floor(mins / 60), rest = mins % 60;
  if (hrs < 48) return hrs + ' h' + (rest ? ' ' + rest + ' min' : '');
  const days = Math.floor(hrs / 24), h = hrs % 24;
  return plural(days, 'day', 'days') + (h ? ' ' + h + ' h' : '');
}

/** The LIVE clock, for the sidebar timer (owner, 12 Oct 2026: seconds
 *  ALWAYS — this reverses the 11 Oct "no ticking counter" note).
 *  Under an hour 'm:ss' (28:41, 0:00), under a day 'h:mm:ss' (5:12:09),
 *  a day or more '6d 4h'. Whole seconds are rounded UP so the clock
 *  reads 0:00 only when the time is really up. Never negative. */
export function countdown(ms) {
  const n = Number(ms);
  const secs = Math.max(0, Math.ceil((Number.isFinite(n) ? n : 0) / 1000));
  const pad = (v) => (v < 10 ? '0' : '') + v;
  if (secs >= 86400) {
    return Math.floor(secs / 86400) + 'd ' + Math.floor((secs % 86400) / 3600) + 'h';
  }
  if (secs >= 3600) {
    return Math.floor(secs / 3600) + ':' + pad(Math.floor((secs % 3600) / 60)) + ':' + pad(secs % 60);
  }
  return Math.floor(secs / 60) + ':' + pad(secs % 60);
}

/** "1 second ago", "40 seconds ago", "1 minute ago", "2 hours ago",
 *  "3 days ago": how long since a device was last seen (the takeover
 *  prompt). Singular where it is one, and a bigger unit past an hour. */
export function ago(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const say = (n, unit) => n + ' ' + unit + (n === 1 ? '' : 's') + ' ago';
  if (s < 60) return say(s, 'second');
  const m = Math.round(s / 60);
  if (m < 60) return say(m, 'minute');
  const h = Math.round(s / 3600);
  if (h < 24) return say(h, 'hour');
  return say(Math.round(s / 86400), 'day');
}

export default { minutesToHours, hoursToMinutes, trialLength, timeLeft, countdown, ago };
