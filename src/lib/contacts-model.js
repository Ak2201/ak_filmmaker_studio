/* ============================================================
   CONTACTS PAGE MODEL — a call sheet's facts, derived, no DOM
   ------------------------------------------------------------
   src/pages/contacts.js draws the unit list and the call sheets.
   Everything a sheet SAYS that is not typed into it — the schedule's
   date for its scenes, the places and their recces, the light, the
   late-wrap flag, who is called in which order, the facts the
   WhatsApp message is built from — is derived here from the models
   that own it (contacts.js, scenes.js, locations.js, sun.js, dpr.js,
   recce-geo.js). Derived on every render, stored nowhere: a call
   sheet holds scene ids and contact ids, and nothing else.
   ============================================================ */
import { DEPARTMENTS } from './contacts.js';
import { formatEighths } from './scenes.js';
import Locations from './locations.js';
import Sun from './sun.js';
import DPR from './dpr.js';
import Geo from './recce-geo.js';
/* Pure and import-free: the paperwork's date style (docs/US-MARKET-PLAN.md §A4). */
import { paperDate } from './paper-date.js';

/* A hue per department, so the rule down the side of a card carries
   data instead of decorating. Six hues, nine departments: the three
   that share are the ones nobody confuses on a unit list. */
export const DEPT_HUE = {
  Cast: 'feature',
  Direction: 'plan',
  Camera: 'shorts',
  Sound: 'visualize',
  Art: 'library',
  Costume: 'shoot',
  Makeup: 'visualize',
  Production: 'plan',
  Post: 'shorts'
};
export const hueOf = (dept) => DEPT_HUE[dept] || 'feature';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** '2026-09-28' → '28 September 2026'. No Date object: a shoot day is a
    wall-clock date, and parsing it into an instant moves it a timezone. */
export function prettyDate(iso, prefs) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return iso || 'Date not set';
  /* With the film's prefs, in its style: "12 February 2024" on an
     Indian film, "February 12, 2024" on a US one (US-MARKET-PLAN §A4). */
  if (prefs) return paperDate(m[0], prefs, 'long');
  return Number(m[3]) + ' ' + (MONTHS[Number(m[2]) - 1] || m[2]) + ' ' + m[1];
}

export const slugOf = (scene) =>
  [scene.intExt, scene.location || 'Location TBC'].join('. ') + ' — ' + scene.dayNight;

/** The header's counts: the cast, and the departments in use. */
export function unitCounts(contacts) {
  return {
    cast: contacts.filter((c) => c.department === 'Cast').length,
    depts: new Set(contacts.map((c) => c.department).filter(Boolean)).size
  };
}

/** The department options for a person: the list, plus their own value
    when it is not on it (an older or typed department is kept). */
export function deptOptions(value) {
  return DEPARTMENTS.includes(value) || !value ? DEPARTMENTS : [...DEPARTMENTS, value];
}

/* A number or an address that cannot be dialled or sent to is still
   SAVED — it may be half-typed, or the only thing anybody has — but
   it says so (UX audit L11). The email check is the browser's own
   (`typeMismatch`, read off the element by the view); a phone wants
   six digits and only the characters a number is written with. */
const PHONE_OK = /^[+\d\s().\-\/]*$/;
export function reachProblem(value, type, typeMismatch) {
  const v = String(value || '').trim();
  if (!v) return '';
  if (type === 'email') return typeMismatch ? 'Not an email address' : '';
  const digits = (v.match(/\d/g) || []).length;
  return !PHONE_OK.test(v) || digits < 6 ? 'Not a number anyone can dial' : '';
}

/* ---- the schedule's word on a sheet's date -----------------
   A call sheet carries its own date, and the Plan calendar gives each
   shoot DAY a date; the sheet reads the schedule through its scenes:
   if they all sit on one shoot day, that day's calendar date is the
   schedule's (UX audit M13). */
export function scheduleOf(sheet, scenes) {
  const days = [...new Set(sheet.sceneIds
    .map((id) => scenes.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => Locations.shootDayOf(s))
    .filter((d) => d > 0))].sort((a, b) => a - b);
  if (days.length !== 1) return { days, day: 0, date: '' };
  return { days, day: days[0], date: Locations.dayDate(days[0]) };
}

/** The sheet's scenes, in sheet order. */
export const sheetScenes = (sheet, scenes) => sheet.sceneIds
  .map((id) => scenes.find((s) => s.id === id))
  .filter(Boolean);

/** Total eighths of a list of scenes. */
export const eighthsOf = (list) => list.reduce((a, s) => a + (Number(s.eighths) || 0), 0);

/** The distinct places a sheet's scenes are shot at, in sheet order,
    each with its recce. A place is a scene's location: there is no
    list of them to keep in step. */
export function placesOf(onSheet) {
  const seen = new Set();
  const out = [];
  for (const s of onSheet) {
    const name = Locations.locationName(s);
    const key = Locations.locationKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name, recce: Locations.getRecce(name) });
  }
  return out;
}

/** The date the sheet is for: its own, else the schedule's. */
export function sheetDateOf(sheet, scenes) {
  return sheet.date || scheduleOf(sheet, scenes).date || '';
}

/* What this device's clock was offset by on that date, for a place
   outside India (sun.js reads India as IST without asking). */
function deviceOffsetOn(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTimezoneOffset() : new Date().getTimezoneOffset();
}

/** { light, place } for the sheet's date at its first pinned place, or
    null with no date. Chennai stands in, flagged, for a place with no pin. */
export function lightOf(sheet, scenes) {
  const date = sheetDateOf(sheet, scenes);
  if (!date) return null;
  const place = Geo.placeFor(placesOf(sheetScenes(sheet, scenes)));
  const light = Sun.daylight(date, place, { deviceOffset: deviceOffsetOn(date) });
  return light ? { light, place } : null;
}

export function lightNote(lit) {
  return lit.place.fallback
    ? 'Times for Chennai (' + lit.light.zone + ') — no location on this sheet has a pin yet. Add one under Route & safety.'
    : 'Times at ' + lit.place.name + ', ' + lit.light.zone + '. Golden hour: the sun between 4° below and 6° above the horizon.';
}

/** The wrap the flag judges: the later of the sheet's planned wrap and
    the DPR's wrap for the single shoot day its scenes sit on. */
export function wrapOf(sheet, onSheet) {
  const days = [...new Set(onSheet.map((s) => Locations.shootDayOf(s)).filter((d) => d > 0))];
  return DPR.laterWrap(sheet.wrap, days.length === 1 ? DPR.getDPR(days[0]).wrap : '');
}

/** The scenes that need daylight when the wrap is after sunset.
    No wrap typed, no flag: the check judges a time somebody wrote down. */
export function lateScenes(sheet, onSheet, light) {
  if (!Sun.isPastSunset(wrapOf(sheet, onSheet), light)) return [];
  return onSheet.filter(Sun.needsDaylight);
}
export function lateText(sheet, onSheet, light, late) {
  return 'Wrap ' + wrapOf(sheet, onSheet) + ' is after sunset (' + light.sunset + '). '
    + (late.length === 1 ? 'Exterior scene ' : 'Exterior scenes ')
    + late.map((s) => s.number || '—').join(', ')
    + ' need the light — shoot ' + (late.length === 1 ? 'it' : 'them') + ' before ' + light.sunset + '.';
}

/* ---- route & safety ------------------------------------------- */
export const ROUTE_FIELDS = [
  ['address', 'Address', 'Where the van goes — a pin, a landmark, a street'],
  ['parking', 'Parking', 'Where the unit parks, and how far the carry is'],
  ['hospital', 'Nearest hospital', 'Name, distance, casualty phone'],
  ['police', 'Nearest police station', 'Station, and its number']
];
export const pinText = (pin) => pin ? 'Pinned at ' + pin.lat + ', ' + pin.lng
  : 'No pin yet — sunrise and sunset fall back to Chennai.';

/** Why a pasted pin was refused — a short link carries no coordinates. */
export const pinRefusal = (text) => /goo\.gl|maps\.app/i.test(text)
  ? 'A short link carries no coordinates. Open it, then paste the long address-bar link.'
  : 'No coordinates in that. Paste a Google Maps link, or two numbers like 13.0827, 80.2707.';

/** A device position rounded to six places, as the strings a recce holds. */
export function roundedPin(coords) {
  const lat = Math.round(coords.latitude * 1e6) / 1e6;
  const lng = Math.round(coords.longitude * 1e6) / 1e6;
  return { lat: String(lat), lng: String(lng) };
}

/* ---- who is called ---------------------------------------------- */

/** Who is called, in the order the paper lists them. */
export function calledOf(sheet, contacts) {
  const byId = Object.fromEntries(contacts.map((c) => [c.id, c]));
  return Object.keys(sheet.calls)
    .map((id) => byId[id])
    .filter(Boolean)
    .sort((a, b) => {
      const da = DEPARTMENTS.indexOf(a.department);
      const db = DEPARTMENTS.indexOf(b.department);
      return da === db ? String(a.name).localeCompare(String(b.name)) : da - db;
    });
}

/** The called list as two groups, cast then crew, each in call-time
    order (a person without their own time is called at the general
    call). Derived from the contact's department; nothing is stored. */
export function groupCalled(sheet, called) {
  const at = (c) => sheet.calls[c.id] || sheet.generalCall || '99:99';
  const byCall = (a, b) => at(a).localeCompare(at(b)) || String(a.name).localeCompare(String(b.name));
  return [
    { label: 'Cast', people: called.filter((c) => c.department === 'Cast').sort(byCall) },
    { label: 'Crew', people: called.filter((c) => c.department !== 'Cast').sort(byCall) }
  ].filter((g) => g.people.length);
}

/** A person's call as the sheet prints it. */
export const callLabel = (sheet, c) =>
  sheet.calls[c.id] || (sheet.generalCall ? sheet.generalCall + ' (general)' : 'General call');

/** The sheet's facts, looked up now, for callsheet-text.js. `film` is
    the project's title (the view asks pdf.js for it). */
export function factsOf(sheet, scenes, film, prefs) {
  const onSheet = sheetScenes(sheet, scenes);
  const sched = scheduleOf(sheet, scenes);
  const places = placesOf(onSheet);
  const lit = lightOf(sheet, scenes);
  const first = places.find((p) => Geo.coordsOf(p.recce)) || places.find((p) => p.recce.address) || null;
  const mapUrl = first ? Geo.recceMapsLink(first.name, first.recce)
    : Geo.mapsLink({ address: sheet.location || (places[0] ? places[0].name : '') });
  const eighths = eighthsOf(onSheet);
  const date = sheetDateOf(sheet, scenes);
  return {
    film,
    title: sheet.title || 'Shoot day',
    dayNumber: sched.day || 0,
    date: date ? prettyDate(date, prefs) : '',
    generalCall: sheet.generalCall,
    wrap: sheet.wrap,
    location: sheet.location || (places[0] ? places[0].name : ''),
    mapUrl,
    /* The pin can belong to a LATER place on the sheet (the first with
       coordinates or an address); name it when it is not the place the
       Location line gives, or the crew is sent to the wrong set. */
    mapPlace: first && !sheet.location && places[0] && first.name !== places[0].name ? first.name : '',
    light: lit ? { ...lit.light, fallback: lit.place.fallback } : null,
    safety: places.map((p) => ({ place: p.name, hospital: p.recce.hospital, police: p.recce.police })),
    scenes: onSheet.map((s) => ({ number: s.number, slug: slugOf(s), pages: formatEighths(s.eighths) })),
    pagesTotal: formatEighths(eighths),
    notes: sheet.notes
  };
}

export const personOf = (sheet, c) =>
  ({ name: c.name, role: c.role, department: c.department, call: sheet.calls[c.id] || '' });

/** WhatsApp markdown as runs: one array per line, each run
    `{ bold, text }`. The view turns them into nodes, text only. */
export function waRuns(text) {
  return String(text).split('\n').map((line) => line.split(/(\*[^*\n]+\*)/)
    .map((part) => (/^\*[^*\n]+\*$/.test(part) ? { bold: true, text: part.slice(1, -1) } : { bold: false, text: part }))
    .filter((r) => r.bold || r.text));
}

/** What a NEW call sheet starts from: the first shoot day (calendarDays()
    output) that no sheet claims yet — a sheet claims a day by listing its
    scenes, the same reading as readiness.js's day-callsheet check — with
    that day's scenes ticked, its date and its places. Null when every day
    has a sheet (or nothing is scheduled), and the sheet starts blank.
    It was always blank, titled "Shoot day <count + 1>": with Day 1 and
    Day 14 on sheets, "New shoot day" made a sheet called "Shoot day 3"
    that was not Day 3 and carried none of Day 2's scenes. */
export function nextSheetPatch(sheets, days) {
  const covered = new Set();
  (sheets || []).forEach((s) => (s.sceneIds || []).forEach((id) => covered.add(id)));
  const d = (days || []).find((x) => !(x.scenes || []).some((sc) => covered.has(sc.id)));
  if (!d) return null;
  return {
    title: 'Day ' + d.day,
    date: d.date || '',
    location: (d.locations || []).join(' · '),
    sceneIds: d.scenes.map((sc) => sc.id)
  };
}

/** The sheet's title without a leading "<project> —". */
export function dayName(title, project) {
  const t = String(title || '').trim();
  const p = String(project || '').trim();
  const rest = p && t.toLowerCase().startsWith(p.toLowerCase()) ? t.slice(p.length) : '';
  // Only at a separator: "Dragonfly Day 2" is not "Dragon" + "fly Day 2".
  if (/^\s*[—–:·|-]\s*\S/.test(rest)) return rest.replace(/^\s*[—–:·|-]\s*/, '');
  return t || 'Shoot day';
}

export default {
  DEPT_HUE, hueOf, prettyDate, slugOf, unitCounts, deptOptions, reachProblem, scheduleOf, sheetScenes, eighthsOf,
  placesOf, sheetDateOf, lightOf, lightNote, wrapOf, lateScenes, lateText, ROUTE_FIELDS, pinText, pinRefusal,
  roundedPin, calledOf, groupCalled, callLabel, factsOf, personOf, waRuns, dayName, nextSheetPatch
};
