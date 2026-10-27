/* ============================================================
   PLAN MODEL — the derivations plan.html draws
   ------------------------------------------------------------
   Everything on the Shoot Calendar & Locations page that does not
   need the DOM: how a shoot date is written out, the weekday, which
   dates clash, the daylight on a recce card, which options a media
   row's selects offer, and whether a typed value is complete enough
   to save. src/pages/plan.js builds the screen from these and owns
   nothing but the view.

   Stores nothing. Every read goes through the models that own the
   data (scenes.js, locations.js, contacts.js, dpr.js), exactly as the
   page did, so the same keys are read in the same project scope.
   ============================================================ */
import Scenes, { formatEighths } from './scenes.js';
import Locations, { PERMISSIONS, MEDIA_KINDS } from './locations.js';
import Shoot from './shootday.js';
import Contacts from './contacts.js';
import DPR from './dpr.js';
import { recceLight } from './recce-light.js';
import { paperDate } from './paper-date.js';

const permById = Object.fromEntries(PERMISSIONS.map((p) => [p.id, p]));
/** The permission record for an id, the first one for anything unknown. */
export const permOf = (id) => permById[id] || PERMISSIONS[0];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* '2026-01-12' → '12 January 2026'. Built by hand from the string, the
   same way contacts.js does it: a shoot date is a wall-clock day, and
   parsing it into an instant is how it lands a timezone away. */
export function prettyDate(iso, prefs) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  /* In the film's own style when it has one ("February 12, 2024" on a US
     film); a film with no region keeps the table below, byte for byte. */
  if (prefs && prefs.dateStyle) return paperDate(m[0], prefs, 'long');
  return Number(m[3]) + ' ' + (MONTHS[Number(m[2]) - 1] || m[2]) + ' ' + m[1];
}

/* The weekday IS worth computing — a shoot day that lands on a Sunday
   costs a different amount. UTC throughout so the arithmetic cannot
   drift across a date boundary. */
export function weekdayOf(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? '' : WEEKDAYS[d.getUTCDay()];
}

export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
export const pagesOf = (e) => formatEighths(e) + ' ' + (e === 8 ? 'page' : 'pages');
export const slugOf = (scene) => scene.intExt + '. ' + (Locations.locationName(scene) || 'Location TBC')
  + ' — ' + scene.dayNight;

/* A date used by two shoot days is almost always a slip, and the only
   place it is visible is the calendar. Counted once, read per card:
   date → how many days carry it. */
export function dateClashes(days) {
  const clashes = new Map();
  days.filter((d) => d.date).forEach((d) => clashes.set(d.date, (clashes.get(d.date) || 0) + 1));
  return clashes;
}

/* A later shoot day dated BEFORE an earlier one is almost always a typo
   (2024-01-01 for 2024-02-01), and the stripboard's span, the strip on
   Shoot Day and the one-liner all rest on the dates as typed. Day number
   follows shooting order, so: day → the number of the earlier day whose
   date is the latest one it falls behind. Dated days only, in day order. */
export function datesBehind(days) {
  const behind = new Map();
  let top = null;
  [...days].filter((d) => d.date).sort((a, b) => a.day - b.day).forEach((d) => {
    if (top && d.date < top.date) behind.set(d.day, top.day);
    else top = d;
  });
  return behind;
}

/** How many shoot days have a date. */
export const datedCount = (days) => days.filter((d) => d.date).length;

/** The line beside a day's date field: weekday, date, and a clash. */
export function dayWhen(entry, clashes, prefs, behind) {
  if (!entry.date) return 'No date yet';
  const parts = [weekdayOf(entry.date), prettyDate(entry.date, prefs)].filter(Boolean);
  const shared = clashes && clashes.get(entry.date) > 1;
  const early = behind && behind.get(entry.day);
  return parts.join(' · ') + (shared ? ' · shared with another day' : '')
    + (early ? ' · dated before Day ' + early : '');
}

/** "Sunday · 12 January 2026", or the raw value when it is not a date. */
export const orphanDateLabel = (o, prefs) => [weekdayOf(o.date), prettyDate(o.date, prefs)].filter(Boolean).join(' · ') || o.date;

/* ---- the light on a recce card ---------------------------------
   Sunrise, sunset and golden hour for each of this location's shoot
   days that has a date, at THIS location's own map pin — and a warning
   when a day's planned wrap falls after sunset while an exterior
   daylight scene is still to shoot here (src/lib/recce-light.js, pure).
   A location with no pin gets no times and no guess. The wrap is the
   one somebody wrote on the day's call sheet or its DPR (the same two
   the call sheet and the shoot day read); none typed, no warning.
   Derived on render, stored nowhere. */
export function locationLight(loc) {
  const all = Scenes.listScenes();
  const dates = Locations.listDayDates();
  let sheets = [];
  try { sheets = Contacts.listCallSheets(); } catch (e) { sheets = []; }
  const byDay = new Map();
  loc.scenes.forEach((s) => {
    const d = Locations.shootDayOf(s);
    if (!d) return;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(s);
  });
  const days = [...byDay.entries()].map(([day, scenes]) => ({ day, date: dates[String(day)] || '', scenes }));
  const wrapOf = (day) => {
    const sheet = Shoot.sheetsForDay(day, sheets, all)[0];
    return DPR.laterWrap(sheet && sheet.wrap, DPR.getDPR(day).wrap);
  };
  return { out: recceLight({ recce: loc.recce, days, wrapOf }), days };
}

/** One daylight row's times: "Sunrise 06:10 · Sunset 18:02 · Golden hour …". */
export function lightTimes(light) {
  const parts = ['Sunrise ' + (light.sunrise || '—'), 'Sunset ' + (light.sunset || '—')];
  if (light.goldenPm) parts.push('Golden hour ' + light.goldenPm);
  return parts.join(' · ') + ' (' + light.zone + ')';
}

/** The after-sunset warning on a daylight row, in words. */
export function lightFlagText(day, flag) {
  return 'Day ' + day + ' is planned to wrap at ' + flag.wrap + ', after sunset (' + flag.sunset + '). '
    + (flag.scenes.length === 1 ? 'Exterior scene ' : 'Exterior scenes ') + flag.scenes.join(', ')
    + ' here need' + (flag.scenes.length === 1 ? 's' : '') + ' daylight; place '
    + (flag.scenes.length === 1 ? 'it' : 'them') + ' early in the day or move the wrap.';
}

/* ---- the map pin ------------------------------------------------ */

/** Why a typed map pin was refused — a short link carries no coordinates. */
export const pinRefusal = (text) => (/goo\.gl|maps\.app/i.test(text)
  ? 'A short link carries no coordinates. Paste the long address-bar link.'
  : 'No coordinates in that. Paste a Maps link, or two numbers like 13.0827, 80.2707.');

/* ---- the date field ---------------------------------------------
   A typed date is three segments, and a year still being typed reads
   as 0002, 0020, 0202 on the way to 2026 — not a date. */
export const isWholeDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && parseInt(v, 10) >= 1000;

/** Should this field value be saved now? A complete date at once; an
    empty value only once the field is left. */
export const dateReady = (value, leaving) => (value ? isWholeDate(value) : leaving);

/** Whether `value` is already the stored date of shoot day `day`. */
export function dateUnchanged(day, value) {
  const current = Locations.calendarDays(Scenes.listScenes()).find((d) => d.day === day);
  return !!(current && (current.date || '') === value);
}

/* ---- media ------------------------------------------------------- */

/** Only an http(s) link is offered as clickable. Anything else — a
    drive path, a note to self — is stored and shown, but this app is
    not going to pretend it can open it. */
export function isOpenable(url) {
  return /^https?:\/\/\S+$/i.test(String(url || '').trim());
}

/** The kinds a media row offers: the list, plus a stored kind it lacks. */
export const kindOptions = (value) => (MEDIA_KINDS.includes(value) || !value ? MEDIA_KINDS : [...MEDIA_KINDS, value]);

/** What a reference can be linked to: [{ value, label }], in order.
    Stores a token — 'loc:<key>' or 'day:<n>' — never a copy of the name,
    so renaming a location in the breakdown renames it on every link.
    A token pointing at something that has gone stays selectable and
    says so, rather than silently resetting the choice to none. */
export function linkOptions(value, scenes) {
  const out = [];
  const seen = new Set();
  const add = (val, label) => { seen.add(val); out.push({ value: val, label }); };
  add('', 'Not linked');
  Locations.locationIndex(scenes).forEach((l) => add(Locations.locationLink(l.name), l.name));
  Locations.calendarDays(scenes).forEach((d) => add(Locations.dayLink(d.day), 'Day ' + d.day));
  if (value && !seen.has(value)) add(value, (Locations.linkLabel(value, scenes) || value) + ' — no longer in the script');
  return out;
}

/** The media item's title for a confirm sentence: ' "Title"' or ''. */
export function mediaLabel(id) {
  const item = Locations.listMedia().find((m) => m.id === id);
  return item && item.title ? ' "' + item.title + '"' : '';
}
