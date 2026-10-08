/* ============================================================
   THE SUN — sunrise, sunset and golden hour, offline
   ------------------------------------------------------------
   The NOAA solar calculator's algorithm (the one behind the NOAA
   spreadsheet: Meeus, abridged), in plain arithmetic. No network, no
   library, no clock: every function here takes the date and the place
   it is asked about, so a test can pin both and the answer cannot
   change at midnight.

   PURE, AND IT STORES NOTHING. A sunrise is derived from a date and a
   pair of coordinates the recce already holds; writing it down would
   be a second representation that goes stale the day the date moves.

   WHAT THE NUMBERS MEAN.
     sunrise / sunset   the upper limb on the horizon, with standard
                        refraction: the sun's centre at -0.833°.
     golden hour        the sun between -4° and +6° — the band a
                        cinematographer means by it, and the band
                        astral and most planners use. Morning runs
                        from -4° rising to +6°; evening from +6°
                        setting to -4°.

   Times come back as MINUTES AFTER 00:00 UTC of the date asked for
   (they may be negative or past 1440 east and west of Greenwich), and
   `atOffset()` turns them into a wall clock. Which wall clock is the
   caller's decision — see `offsetFor()` — because a shoot in Chennai
   happens in IST whatever timezone the laptop planning it is in.

   Accuracy: within a minute of the NOAA calculator at these latitudes,
   tested against fixed values for Chennai in scripts/test-sun.mjs.
   Inside the polar circles a day can have no sunrise at all; the
   affected fields come back null rather than as a fiction.
   ============================================================ */

const RAD = Math.PI / 180;
/* A coordinate as a number — and a blank one as NaN, never 0: 0,0 is a
   real place, in the Gulf of Guinea, and Number('') is 0. */
const coord = (v) => (v === null || v === undefined || String(v).trim() === '' ? NaN : Number(v));
const DEG = 180 / Math.PI;

/** Chennai, for when a location has no coordinates yet. Every caller
    that falls back to it must SAY so — a sunset computed for the wrong
    city is worse than none if nobody can tell. */
export const CHENNAI = Object.freeze({ lat: 13.0827, lng: 80.2707, label: 'Chennai' });

/** Elevations, in degrees, of the events this module answers for. */
export const ELEVATION = Object.freeze({ horizon: -0.833, goldenLow: -4, goldenHigh: 6 });

/** '2026-06-21' → its Julian Day at 00:00 UTC, or NaN. No Date object:
    a shoot date is a wall-calendar day, and parsing it through a
    timezone is how it turns into yesterday. */
export function julianDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').slice(0, 10));
  if (!m) return NaN;
  let y = +m[1], mo = +m[2];
  const d = +m[3];
  const inMonth = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  if (!inMonth || d < 1 || d > inMonth) return NaN;
  if (mo <= 2) { y -= 1; mo += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (mo + 1)) + d + b - 1524.5;
}

/** The sun's declination (degrees) and the equation of time (minutes)
    at Julian Day `jd`. NOAA's formulation, term for term. */
export function solarPosition(jd) {
  const t = (jd - 2451545) / 36525;
  const l0 = ((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360 + 360) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c = Math.sin(m * RAD) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * m * RAD) * (0.019993 - 0.000101 * t)
    + Math.sin(3 * m * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(eps * RAD) * Math.sin(lambda * RAD)) * DEG;
  const y = Math.tan((eps / 2) * RAD) ** 2;
  const eot = 4 * DEG * (
    y * Math.sin(2 * l0 * RAD)
    - 2 * e * Math.sin(m * RAD)
    + 4 * e * y * Math.sin(m * RAD) * Math.cos(2 * l0 * RAD)
    - 0.5 * y * y * Math.sin(4 * l0 * RAD)
    - 1.25 * e * e * Math.sin(2 * m * RAD)
  );
  return { decl, eot };
}

/* Minutes after 00:00 UTC at which the sun's centre crosses
   `elevation` degrees, rising (`rising` true) or setting. Starts from
   solar noon and re-evaluates the sun's position AT the estimate, twice
   — NOAA's spreadsheet uses the noon position for both events, which
   costs up to a minute at dawn; two passes take that back. null when
   the sun never reaches that elevation that day. */
function crossing(jd0, lat, lng, elevation, rising) {
  let minutes = 720 - 4 * lng - solarPosition(jd0 + 0.5).eot;
  for (let pass = 0; pass < 3; pass++) {
    const { decl, eot } = solarPosition(jd0 + minutes / 1440);
    const cosH = (Math.sin(elevation * RAD) - Math.sin(lat * RAD) * Math.sin(decl * RAD))
      / (Math.cos(lat * RAD) * Math.cos(decl * RAD));
    if (cosH > 1 || cosH < -1) return null;
    const ha = Math.acos(cosH) * DEG;
    minutes = 720 - 4 * (lng + (rising ? ha : -ha)) - eot;
  }
  return minutes;
}

/**
 * The day's light at one place.
 *
 *   sunTimes('2026-06-21', 13.0827, 80.2707)
 *   → { noon, sunrise, sunset, goldenAm: [start, end], goldenPm: [start, end] }
 *
 * Every time in minutes after 00:00 UTC of that date. null for an
 * unreadable date or coordinates; individual events null when the sun
 * does not reach them (polar day or night).
 */
export function sunTimes(iso, lat, lng) {
  const jd0 = julianDay(iso);
  const la = coord(lat), lo = coord(lng);
  if (!Number.isFinite(jd0) || !validLatLng(la, lo)) return null;
  const noon = 720 - 4 * lo - solarPosition(jd0 + 0.5 - lo / 360).eot;
  const at = (el, rising) => crossing(jd0, la, lo, el, rising);
  const pair = (a, b) => (a === null || b === null ? null : [a, b]);
  return {
    noon,
    sunrise: at(ELEVATION.horizon, true),
    sunset: at(ELEVATION.horizon, false),
    goldenAm: pair(at(ELEVATION.goldenLow, true), at(ELEVATION.goldenHigh, true)),
    goldenPm: pair(at(ELEVATION.goldenHigh, false), at(ELEVATION.goldenLow, false))
  };
}

export function validLatLng(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/* India, as a box: the mainland, the Andamans and Lakshadweep. Inside
   it the answer is IST without asking anybody — one zone, no DST. */
function inIndia(lat, lng) {
  return lat >= 6 && lat <= 37.5 && lng >= 68 && lng <= 97.5;
}

/**
 * The wall clock a place's times should be read on, as minutes EAST of
 * UTC, with a short label. IST for anywhere in India; otherwise the
 * offset `deviceOffset` reports (minutes WEST, the way Date's
 * getTimezoneOffset() gives it) and the label says it is this device's.
 */
export function offsetFor(lat, lng, deviceOffset) {
  if (inIndia(Number(lat), Number(lng))) return { minutes: 330, label: 'IST' };
  const west = Number(deviceOffset);
  return { minutes: Number.isFinite(west) ? -west : 0, label: 'this device’s time' };
}

/** UTC minutes → wall-clock minutes in 0..1439 at `offset` east. */
export function atOffset(utcMinutes, offset) {
  if (utcMinutes === null || !Number.isFinite(utcMinutes)) return null;
  return ((Math.round(utcMinutes + offset) % 1440) + 1440) % 1440;
}

/** 395 → '06:35'. null → ''. */
export function clock(minutes) {
  if (minutes === null || !Number.isFinite(minutes)) return '';
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

/** '18:40' → 1120; anything else → null. What `<input type="time">`
    stores, read back without a Date. */
export function minutesOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const hh = +m[1], mm = +m[2];
  return hh < 24 && mm < 60 ? hh * 60 + mm : null;
}

/**
 * Everything a page prints, at once, as wall-clock strings.
 *
 *   daylight('2026-01-15', { lat, lng }, { deviceOffset })
 *   → { sunrise:'06:35', sunset:'18:01', goldenAm:'06:20–07:04',
 *       goldenPm:'17:31–18:15', zone:'IST', sunsetMinutes: 1081 }
 *
 * null when the date or the place cannot be read.
 */
export function daylight(iso, place, opts = {}) {
  const lat = coord(place && place.lat), lng = coord(place && place.lng);
  const raw = sunTimes(iso, lat, lng);
  if (!raw) return null;
  const zone = offsetFor(lat, lng, opts.deviceOffset);
  const local = (v) => atOffset(v, zone.minutes);
  const span = (p) => (p ? clock(local(p[0])) + '–' + clock(local(p[1])) : '');
  return {
    sunrise: clock(local(raw.sunrise)),
    sunset: clock(local(raw.sunset)),
    goldenAm: span(raw.goldenAm),
    goldenPm: span(raw.goldenPm),
    zone: zone.label,
    sunriseMinutes: local(raw.sunrise),
    sunsetMinutes: local(raw.sunset)
  };
}

/** Is a planned "HH:MM" after sunset? false when either is unknown —
    the flag is raised on a time somebody wrote down, never on a guess. */
export function isPastSunset(hhmm, light) {
  const t = minutesOf(hhmm);
  if (t === null || !light || light.sunsetMinutes === null || light.sunsetMinutes === undefined) return false;
  return t > light.sunsetMinutes;
}

/** A scene that needs the daylight: exterior, and not written for
    night. "INT/EXT" counts — half of it is outside. */
export function needsDaylight(scene) {
  const ie = String((scene && scene.intExt) || '').toUpperCase();
  const dn = String((scene && scene.dayNight) || '').toUpperCase();
  return ie.includes('EXT') && !dn.includes('NIGHT');
}

export default {
  CHENNAI, ELEVATION, julianDay, solarPosition, sunTimes, validLatLng,
  offsetFor, atOffset, clock, minutesOf, daylight, isPastSunset, needsDaylight
};
