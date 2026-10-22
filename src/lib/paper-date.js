/* ============================================================
   PAPER DATE — the dates production paperwork prints
   ------------------------------------------------------------
   docs/US-MARKET-PLAN.md §A4: a film's paperwork prints its dates in
   the film's style — an Indian film "21 Oct 2026", a US one
   "Oct 21, 2026" — from `prefs.dateStyle` (region.js
   currentProjectPrefs()).

   WHY THIS IS NOT region-core.js's formatPaperDate(), which the
   contract names as the one way. It gives the same answers for the
   styles they share (scripts/test-paperwork.mjs asserts that, date by
   date, so the two cannot drift) — the difference is WHERE the code
   lives. region-core.js is in the `startlib` chunk, which every page
   loads, and the bundler keeps a function in the chunk its module is
   assigned to. Calling formatPaperDate from the stripboard put 1.2KB
   on the Library's first paint, which had 246 bytes to spare under
   scripts/budget.json. This file is imported only by the paperwork
   pages and pdf.js, so it rides in their chunks. Fold the two together
   when formatPaperDate leaves startlib (no public page prints a date)
   or the budget is deliberately recaptured.

   THE SAME GOES FOR paperPrefsOf() below, region-core's projectPrefs()
   reduced to the two fields paperwork reads (paper, dateStyle): calling
   currentProjectPrefs() from region.js made projectPrefs, regionPrefs
   and normaliseRegion live in startlib and cost every page ~560 bytes.
   test:paperwork holds it equal to projectPrefs() over every kind of
   entry.

   PURE and import-free. A 'YYYY-MM-DD' is a DAY, not an instant: it is
   built at local noon so no zone can move it to the day before.
   ============================================================ */

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

function asDate(d) {
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  const m = DAY.exec(String(d || ''));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t;
}

/* 'US' and 'IN' are the two styles a film can ASK for. A film with no
   region of its own (every film made before regions existed) asks for
   neither: dateStyle '' keeps the device's own locale, which is what its
   paperwork printed before (US-MARKET-PLAN §A3: "nothing changes for
   it"). Callers whose old output was a fixed table check
   `prefs.dateStyle` and keep their table. No prefs at all reads as the
   studio default, Indian. */
const localeOf = (prefs) => (!prefs ? 'en-IN' : prefs.dateStyle === 'US' ? 'en-US' : prefs.dateStyle === 'IN' ? 'en-IN' : undefined);

const OPTS = {
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  numeric: { day: '2-digit', month: '2-digit', year: 'numeric' },
  dayMonth: { day: 'numeric', month: 'short' }
};

/**
 * A date for paperwork, in the film's style. '' for something that is
 * not a date.
 *   'medium'   IN: 21 Oct 2026            US: Oct 21, 2026
 *   'long'     IN: 21 October 2026        US: October 21, 2026
 *   'numeric'  IN: 21/10/2026             US: 10/21/2026
 *   'dayMonth' IN: 21 Oct                 US: Oct 21
 *   'weekday'  IN: Wed, 21 Oct 2026       US: Wed, Oct 21, 2026
 *   'weekdayShort' IN: Wed, 21 Oct        US: Wed, Oct 21
 *   'weekdayLong'  IN: Wednesday, 21 October 2026   US: Wednesday, October 21, 2026
 * The weekday styles are COMPOSED (weekday + ', ' + the date), because
 * Intl's en-IN puts a comma after the month when asked for both at once
 * ("Wed, 21 Oct, 2026").
 */
export function paperDate(d, prefs, style = 'medium') {
  const t = asDate(d);
  if (!t) return '';
  const locale = localeOf(prefs);
  try {
    if (style === 'weekday' || style === 'weekdayShort' || style === 'weekdayLong') {
      const wd = new Intl.DateTimeFormat(locale, { weekday: style === 'weekdayLong' ? 'long' : 'short' }).format(t);
      const rest = style === 'weekdayLong' ? 'long' : style === 'weekdayShort' ? 'dayMonth' : 'medium';
      return wd + ', ' + new Intl.DateTimeFormat(locale, OPTS[rest]).format(t);
    }
    return new Intl.DateTimeFormat(locale, OPTS[style] || OPTS.medium).format(t);
  } catch (e) {
    return t.toDateString();
  }
}

const INT_NAMES = ['INT', 'INTL', 'INTERNATIONAL'];
const isInt = (v) => INT_NAMES.includes(String(v == null ? '' : v).trim().toUpperCase());
const isRegion = (v) => isInt(v) || ['IN', 'INDIA'].includes(String(v == null ? '' : v).trim().toUpperCase());

/**
 * { paper, dateStyle } for one film's entry in fms_studio_projects_v1 —
 * exactly projectPrefs(entry, device)'s two fields (region-core.js):
 * a film with no region prints A4; an INT film Letter and US dates;
 * `entry.paper` ('A4' | 'Letter') overrides the paper. DATES differ from
 * projectPrefs() in one case on purpose: a film that carries no region
 * (explicit false) gets dateStyle '' — the date style it had before
 * regions existed — and only a film stamped 'IN' is forced to Indian
 * dates. With NO entry (no project open), the device's market decides
 * the paper; the dates are the device's unless that market is INT.
 */
export function paperPrefsOf(entry, deviceRegion) {
  const e = entry || { region: deviceRegion };
  const explicit = !!entry && isRegion(entry.region);
  const intl = isRegion(e.region) && isInt(e.region);
  const paper = e.paper === 'A4' || e.paper === 'Letter' ? e.paper : (intl ? 'Letter' : 'A4');
  return { paper, dateStyle: intl ? 'US' : explicit ? 'IN' : '' };
}
