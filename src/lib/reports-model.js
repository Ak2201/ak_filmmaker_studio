/* ============================================================
   REPORTS MODEL — the arithmetic on the scenes, no DOM
   ------------------------------------------------------------
   src/pages/reports.js draws the production reports, the sides, the
   screen time, the cast matrix, the one-liner, the DPR and the kit.
   Every count, split, grouping and sentence those views print that
   does not need the page is here, derived from the scene model on
   every call. A report is an opinion about data, never a second copy
   of it — nothing in this file stores anything.
   ============================================================ */
import { ELEMENT_CATEGORIES } from './scenes.js';
import { formatDuration } from './screenplay-analysis.js';
import Locations from './locations.js';
import DPR from './dpr.js';
import { dayFromSearch } from './shootday.js';
import { loadStory } from './story.js';
import { resolveBeat, actsOf, qualify } from './beat-outline.js';
/* Pure and import-free: the paperwork's date style (docs/US-MARKET-PLAN.md §A4). */
import { paperDate } from './paper-date.js';
/* Pure, no imports: the formula guard every CSV in the studio shares. */
import { csvCell } from './admin-format.js';

/* Hue = data. A bucket's colour says WHICH bucket, and the same
   bucket is the same colour in the card and in the table. Nothing
   here is coloured to look nice. */
export const IE_HUE = { INT: 'shorts', EXT: 'plan', 'INT/EXT': 'visualize' };
export const DN_HUE = { DAY: 'library', NIGHT: 'visualize', DAWN: 'plan', DUSK: 'shoot', CONTINUOUS: 'shorts' };

export const NO_LOCATION = 'Unassigned';

export const catById = Object.fromEntries(ELEMENT_CATEGORIES.map((c) => [c.id, c]));

/** Display number for a scene: what the user typed, else its place. */
export function sceneNumbers(scenes) {
  return new Map(scenes.map((s, i) => [s.id, String(s.number || i + 1)]));
}

/** Count and measure the scenes by one enum field, in the enum's order. */
export function tally(scenes, field, order) {
  const rows = new Map(order.map((k) => [k, { key: k, count: 0, eighths: 0 }]));
  for (const s of scenes) {
    const key = s[field] || order[0];
    if (!rows.has(key)) rows.set(key, { key, count: 0, eighths: 0 });
    const row = rows.get(key);
    row.count += 1;
    row.eighths += Number(s.eighths) || 0;
  }
  return [...rows.values()].filter((r) => r.count > 0);
}

/** The element index, folded into its categories. */
export function byCategory(index) {
  const rows = new Map();
  for (const item of index) {
    if (!rows.has(item.category)) rows.set(item.category, { category: item.category, names: 0, appearances: 0 });
    const row = rows.get(item.category);
    row.names += 1;
    row.appearances += item.scenes.length;
  }
  // Report them in the order a 1st AD reads a breakdown sheet.
  return ELEMENT_CATEGORIES.map((c) => rows.get(c.id)).filter(Boolean);
}

/* A no-break space inside each pair: in a narrow column "EXT 1 · INT 2"
   broke as "INT" over "2", which reads as a count for the next row. */
export const mix = (counts) => Object.entries(counts).map(([k, n]) => k + ' ' + n).join(' · ');
export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

export function slugOf(scene) {
  const place = String(scene.location || '').trim() || 'LOCATION TBD';
  return [scene.intExt, place, scene.dayNight].join(' · ');
}

/** How many distinct locations the scenes name (case-insensitive). */
export const locationCount = (scenes) =>
  new Set(scenes.map((s) => String(s.location || '').trim().toLowerCase()).filter(Boolean)).size;

/** "3 of 12 selected" */
export const selectionLabel = (selected, scenes) =>
  selected.size + ' of ' + scenes.length + ' selected';

/** Where a screen-time row's estimate was read from. */
export const readFrom = (r) =>
  (r.method !== 'script' ? 'page count' : r.how === 'position' ? 'script, by position' : 'script');

/* ---- running time with the songs, against a target ----------
   The per-act target is the target times the act's conventional
   share in the Story page's framework (frameworks.json pacing).
   Scenes reach an act through their `beatId`; a song through its
   linked scenes, else its own Save the Cat placement. */
export function runtimeGroups(scenes) {
  let fwId = '';
  try { fwId = loadStory().framework || ''; } catch (e) { fwId = ''; }
  let acts = [];
  try { acts = actsOf(fwId); } catch (e) { acts = []; }
  const actOf = new Map();
  const beatOrder = new Map();
  let n = 0;
  acts.forEach((a) => a.beats.forEach((b) => { actOf.set(b.id, a); beatOrder.set(b.id, n++); }));
  const beatOfId = (id) => { try { const r = resolveBeat(id, fwId); return r ? r.beat : null; } catch (e) { return null; } };
  const songBeat = (song) => {
    const linked = scenes.find((s) => s.songId === song.id && beatOfId(s.beatId));
    if (linked) return beatOfId(linked.beatId);
    const p = String(song.placement || '');
    if (!p) return null;
    return beatOfId(p.includes(':') ? p : qualify('save_the_cat', p));
  };
  const actGroup = (b) => {
    const a = b && actOf.get(b.id);
    return a ? { key: 'act' + a.act, label: a.label, order: a.act, share: a.share } : null;
  };
  const beatGroup = (b) => (b && actOf.has(b.id)
    ? { key: 'beat:' + b.id, label: b.label + ' · ' + actOf.get(b.id).label, order: beatOrder.get(b.id), share: 0 }
    : null);
  return {
    byAct: { groupOf: (s) => actGroup(beatOfId(s && s.beatId)), songGroupOf: (s) => actGroup(songBeat(s)) },
    byBeat: { groupOf: (s) => beatGroup(beatOfId(s && s.beatId)), songGroupOf: (s) => beatGroup(songBeat(s)) }
  };
}

export function fmtDelta(d) {
  if (!d) return 'on target';
  return (d > 0 ? '+' : '−') + formatDuration(Math.abs(d));
}

/** The label under the difference figure. */
export function deltaLabel(targetMin, delta) {
  return targetMin ? (delta > 0 ? 'over the target' : delta < 0 ? 'under the target' : 'difference') : 'difference';
}

/** What the songs did to the estimate, as sentences. */
export function runtimeNotes(est, songCount) {
  const said = [];
  if (!songCount) said.push('No songs on the list, so this is the script estimate alone.');
  else {
    said.push(`${plural(est.songsTimed, 'song has', 'songs have')} a length, adding ${formatDuration(est.songSeconds)}.`);
    if (est.songsUntimed) said.push(`${plural(est.songsUntimed, 'song has', 'songs have')} no length yet and add${est.songsUntimed === 1 ? 's' : ''} nothing — give each one below.`);
    if (est.coveredScenes) said.push(`${plural(est.coveredScenes, 'scene linked to a timed song uses', 'scenes linked to timed songs use')} the song’s length instead of the page estimate, so nothing is counted twice.`);
  }
  return said.join(' ');
}

/* ---- the shoot days --------------------------------------------- */

/** The `?day=N` a link opened the page at, or null. */
export { dayFromSearch };

/** The day to open: `want` when it is one of `days`, else `pick()`. */
export function openDay(want, days, pick) {
  if (!days.length) return 0;
  return !want || !days.some((d) => d.day === want) ? pick() : want;
}

/* "2026-11-02" → "Mon 2 Nov". Built from the parts: `new Date(iso)`
   reads a bare date as UTC midnight and prints yesterday west of
   Greenwich. Anything that is not a date prints as typed. */
export function shortDate(iso, long, prefs) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  /* With the film's prefs, in ITS style (these print on the sides, the
     one-liner and the DPR): "Wednesday, 21 October 2026" / "Wed, 21 Oct"
     on an Indian film, "Wednesday, October 21, 2026" / "Wed, Oct 21" on
     a US one. Without, the device's locale, as before. */
  if (prefs && prefs.dateStyle) return paperDate(m[0], prefs, long ? 'weekdayLong' : 'weekdayShort');
  return d.toLocaleDateString(undefined, long
    ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
    : { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The DPR's six figures, as [value, label] pairs. */
export function dprStatValues(sum) {
  return [
    [sum.shot.length + ' / ' + sum.planned.length, 'scenes shot'],
    [sum.pagesShot + ' / ' + sum.pagesPlanned, 'pages shot'],
    [String(sum.part.length), 'part shot'],
    [String(sum.dropped.length), 'dropped'],
    [DPR.cleanSetups(sum.record.setups) || '—', 'setups'],
    [sum.delayMinutes ? DPR.formatMinutes(sum.delayMinutes) : '—', 'lost to delays']
  ];
}

export function calcLine(sum) {
  const bits = [];
  if (sum.dayMinutes != null) bits.push('Call to wrap ' + DPR.formatMinutes(sum.dayMinutes));
  if (sum.lunchMinutes != null) bits.push('lunch ' + DPR.formatMinutes(sum.lunchMinutes));
  if (sum.workMinutes != null && sum.lunchMinutes != null) bits.push('worked ' + DPR.formatMinutes(sum.workMinutes));
  if (sum.callToFirstShot != null) bits.push('call to first shot ' + DPR.formatMinutes(sum.callToFirstShot));
  const warn = (sum.warnings || []).join(' ');
  const line = bits.length ? bits.join(' · ') + '.' : 'Type the call and wrap times and the day’s length works itself out.';
  return warn ? line + ' ' + warn : line;
}

export function kitTitle(day, tally, prefs) {
  return `Day ${day}` + (Locations.dayDate(day) ? ' · ' + shortDate(Locations.dayDate(day), true, prefs) : '')
    + ` · ${plural(tally.items, 'item', 'items')} · ${tally.picked} picked up · ${tally.back} returned`;
}

/** The subtitle of a day PDF: the whole shoot for the one-liner, else the day. */
export function dayPdfSubtitle(scope, day, shootDays, pages, prefs) {
  return scope === 'oneliner'
    ? plural(shootDays, 'shoot day', 'shoot days') + ' · ' + pages + ' pages'
    : 'Day ' + day + (Locations.dayDate(day) ? ' · ' + shortDate(Locations.dayDate(day), true, prefs) : '');
}

export const PACK_LABEL = { 'shoot.html': 'Shoot day', 'contacts.html': 'Call sheets', 'reports.html': 'Reports, sides and DPR' };

/** One line of the offline list. */
export function offlineRowText(r) {
  return (PACK_LABEL[r.page] || r.page) + ' — ' + (r.ready
    ? 'ready offline (' + r.files + ' ' + (r.files === 1 ? 'file' : 'files') + (r.clean ? ', both addresses' : '') + ')'
    : 'not kept yet');
}

/* ---- CSV: screen time and the cast matrix ------------------
   A spreadsheet's view of the two tables on reports.html. BOM first so
   Excel reads a Tamil name as Tamil; CRLF rows; csvCell() quotes and
   defuses a formula. Times are SECONDS (a number a sheet can add up),
   never "1:05", which Excel reads as a clock time. Nothing is stored. */
const csvRows = (rows) => '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
const numOf = (numbers, s) => (numbers && numbers.get(s.id)) || s.number || '';

export const SCREEN_TIME_CSV_HEADER = ['Scene', 'Slug line', 'Estimate (seconds)', 'By pages (seconds)', 'Dialogue words', 'Read from'];
export function screenTimeCSV(st, numbers) {
  const rows = ((st && st.rows) || []).map((r) => [
    numOf(numbers, r.scene), r.heading || slugOf(r.scene), r.seconds, r.byPage,
    r.method === 'script' ? r.dialogueWords : '', readFrom(r)
  ]);
  return csvRows([SCREEN_TIME_CSV_HEADER, ...rows]);
}

/** Characters down, scenes across: 1 where the character is in the scene,
    blank where not, and a last row counting the cast each scene calls. */
export function castMatrixCSV(cm, numbers) {
  const cols = (cm && cm.density) || [];
  const head = ['Character', 'Scenes', ...cols.map((d) => numOf(numbers, d.scene))];
  const rows = ((cm && cm.characters) || []).map((c) => [
    c.name, c.scenes.size, ...cols.map((d) => (c.scenes.has(d.scene.id) ? 1 : ''))
  ]);
  return csvRows([head, ...rows, ['Cast called', '', ...cols.map((d) => d.count)]]);
}

export default {
  screenTimeCSV, castMatrixCSV,
  IE_HUE, DN_HUE, NO_LOCATION, catById, sceneNumbers, tally, byCategory, mix, plural, slugOf, locationCount,
  selectionLabel, readFrom, runtimeGroups, fmtDelta, deltaLabel, runtimeNotes, dayFromSearch, openDay, shortDate,
  dprStatValues, calcLine, kitTitle, dayPdfSubtitle, PACK_LABEL, offlineRowText
};
