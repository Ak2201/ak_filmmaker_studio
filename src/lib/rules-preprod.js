/* ============================================================
   RULES — Pre-production, with no AI
   ------------------------------------------------------------
   docs/RULES-BREAKDOWN.md lane A: the no-AI twins of four Desk tasks
   (shoot-order, recce-notes, budget-estimate, callsheet-notes). Every
   function here is PURE: facts in, proposals out. No document, no
   storage, no import of ai*.js or ai-stamp.js (scripts/test-rules-
   preprod.mjs greps for it). src/lib/local-tasks-preprod.js reads the
   models and writes through the same plan/undo helpers the AI tasks
   use; nothing here writes anything.

   Deterministic: the same input is the same output, with every sort
   key spelled out and script order last. Nothing is invented: a line
   is proposed only when a real fact in the schedule, the breakdown or
   the rate card triggers it, and each says what it was read from.
   Phrases and thresholds live in src/data/recce-checks.json and
   budget-template.json, never in code.
   ============================================================ */
import checks from '../data/recce-checks.json';
import template from '../data/budget-template.json';
import { formatEighths } from './sample-figures.js';
import { fmtMoney } from './money.js';
import { minutesOf, isPastSunset } from './sun.js';
import { matchScenes, isConfident, castMatrix, cueName, niceName } from './screenplay-analysis.js';

const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');
// a line's identity: the crowd size in "(peak N)" moves, the line does not
const lineKey = (s) => norm(String(s == null ? '' : s).replace(/\s*\(peak\s*\d+\)\s*$/i, ''));
const oneLine = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const list = (v) => [].concat(v == null ? [] : v).map((x) => oneLine(x, 80)).filter(Boolean);
const fill = (t, vars) => String(t).replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? '' : String(vars[k])));
const dayOf = (s) => { const n = parseInt(s && s.shootDay, 10); return Number.isFinite(n) && n > 0 ? n : 0; };
const nums = (ss) => ss.map((s) => String(s.number || '').trim() || '—').join(', ');
const catOf = (s, c) => list((s && s.elements && s.elements[c]) || []);
const isNight = (s) => String(s.dayNight || '').toUpperCase().includes('NIGHT');
const isInt = (s) => String(s.intExt || '').toUpperCase().includes('INT');
const isExt = (s) => String(s.intExt || '').toUpperCase().includes('EXT');
const peakOf = (tags) => tags.reduce((m, t) => { const x = /\((\d+)\)/.exec(String(t)); return x ? Math.max(m, +x[1]) : m; }, 0);

/** The order a time of day is named in (scenes.js DAY_NIGHT; the test pins it). */
export const DAY_NIGHT_ORDER = ['DAY', 'NIGHT', 'DAWN', 'DUSK', 'CONTINUOUS'];
/** The recce fields a rules line may fill (the AI path's own list; the test pins it). */
export const RECCE_FIELDS = ['notes', 'bestTime', 'power', 'parking', 'toilets'];
export const RECCE_PREFIX = checks.prefix;
export const MIDPOINT_LABEL = template.midpointLabel;
/** The call sheet's notes box holds this much (the AI path's own limit; the test pins it). */
export const NOTES_MAX = 800;
/** A day's page target when none is set (dpr.js DEFAULT_PAGE_TARGET; the test pins it). */
export const DEFAULT_PAGE_TARGET = 39;

/* ============================================================
   1. shoot-order
   ============================================================ */

const sameLocation = (s) => oneLine(s.location, 80).toLowerCase();

/** Within a place: day before night, then exterior before interior, then script order. */
const inPlaceKey = (s) => [isNight(s) ? 1 : 0, isExt(s) ? 0 : isInt(s) ? 2 : 1];

function castOverlap(a, b) {
  if (!a || !b) return 0;
  let n = 0;
  for (const c of a) if (b.has(c)) n += 1;
  return n;
}

/**
 * Plan the unscheduled and open-day scenes into shoot days.
 *
 *   facts      shootOrderFacts() output: only scenes that may move, plus
 *              lockedDays (days that have begun shooting)
 *   castOf     (sceneFact) -> names, default the fact's own `cast`
 *   songOf     (sceneFact) -> song id, default the fact's own `songId`
 *   pageTarget a day's eighths; none set means DEFAULT_PAGE_TARGET
 *
 * One place at a time, the longest first (ties go to the place whose
 * cast overlaps the last one's, fewer actor days); inside a place day
 * before night and exterior before interior; one song's scenes run
 * together; a day takes whole places while they fit the target and
 * splits a place only when it cannot fit a day on its own. A day number
 * never reuses a locked one. Returns { items, note } where an item is
 * { id: 'd<day>', day, sceneIds, text, detail } (the AI shoot-order's
 * own shape, so its planPlacements() takes it as it is).
 */
export function proposeShootOrder(facts, { castOf, songOf, pageTarget } = {}) {
  const scenes = (facts && facts.scenes) || [];
  if (!scenes.length) return { items: [], note: '' };
  const cast = castOf || ((s) => s.cast || []);
  const song = songOf || ((s) => s.songId || '');
  const target = pageTarget > 0 ? pageTarget : DEFAULT_PAGE_TARGET;
  const locked = new Set((facts && facts.lockedDays) || []);
  const eighths = (s) => { const n = Number(s.eighths); return Number.isFinite(n) && n > 0 ? n : 8; };
  const at = new Map(scenes.map((s, i) => [s.id, i]));        // script order, last

  // 1. group by place
  const places = new Map();
  for (const s of scenes) {
    const key = sameLocation(s) || '\u0000none';
    if (!places.has(key)) places.set(key, { key, name: oneLine(s.location, 80) || 'No location', scenes: [], total: 0, first: at.get(s.id), cast: new Set() });
    const p = places.get(key);
    p.scenes.push(s);
    p.total += eighths(s);
    list(cast(s)).forEach((c) => p.cast.add(c));
  }
  for (const p of places.values()) {
    p.scenes.sort((a, b) => {
      const ka = inPlaceKey(a), kb = inPlaceKey(b);
      return (ka[0] - kb[0]) || (ka[1] - kb[1]) || (at.get(a.id) - at.get(b.id));
    });
  }

  // 2. longest first; among equal lengths, the place sharing most cast with the last one
  const remaining = [...places.values()].sort((a, b) => (b.total - a.total) || (a.first - b.first));
  const ordered = [];
  while (remaining.length) {
    const top = remaining[0].total;
    const tied = remaining.filter((p) => p.total === top);
    const prev = ordered[ordered.length - 1];
    tied.sort((a, b) => (castOverlap(prev && prev.cast, b.cast) - castOverlap(prev && prev.cast, a.cast))
      || (a.first - b.first) || (a.key < b.key ? -1 : 1));
    const pick = tied[0];
    ordered.push(pick);
    remaining.splice(remaining.indexOf(pick), 1);
  }

  // 3. one song's scenes run together, where its first scene falls
  const flat = ordered.flatMap((p) => p.scenes.map((s) => ({ s, place: p })));
  const bySong = new Map();
  for (const e of flat) { const k = String(song(e.s) || ''); if (k) { if (!bySong.has(k)) bySong.set(k, []); bySong.get(k).push(e); } }
  const placed = new Set();
  const units = [];                                              // a unit never splits unless it is longer than a day
  for (const e of flat) {
    if (placed.has(e.s.id)) continue;
    const k = String(song(e.s) || '');
    const group = k ? bySong.get(k).slice().sort((a, b) => at.get(a.s.id) - at.get(b.s.id)) : [e];
    group.forEach((g) => placed.add(g.s.id));
    units.push({ members: group, total: group.reduce((n, g) => n + eighths(g.s), 0), place: e.place });
  }

  // 4. pack into days
  const days = [];
  let dayNo = 0;
  const nextDay = () => { do { dayNo += 1; } while (locked.has(dayNo)); return dayNo; };
  let cur = null;
  const open = () => { cur = { day: nextDay(), scenes: [], total: 0, places: [] }; days.push(cur); };
  const add = (g, place) => {
    cur.scenes.push(g.s); cur.total += eighths(g.s);
    if (!cur.places.includes(place)) cur.places.push(place);
  };
  let lastPlace = null;
  for (const u of units) {
    if (!cur) open();
    const room = target - cur.total;
    const newPlace = u.place !== lastPlace;
    // a new place that fits a day of its own but not what is left of this one starts a new day
    if (cur.scenes.length && newPlace && u.place.total <= target && u.place.total > room) open();
    else if (cur.scenes.length && u.total > room && u.total <= target) open();
    for (const g of u.members) {
      if (cur.scenes.length && cur.total + eighths(g.s) > target && u.total > target) open();   // only an over-long unit splits
      add(g, g.place);
    }
    lastPlace = u.place;
  }

  const items = days.map((d) => {
    const names = d.places.map((p) => p.name);
    const castNames = [...new Set(d.scenes.flatMap((s) => list(cast(s))))];
    const night = d.scenes.filter(isNight).length;
    const when = night === d.scenes.length ? 'night' : night ? 'day and night' : 'day';
    const head = names.length === 1 ? 'Same location: ' + names[0] : 'Locations: ' + names.join(', ');
    const who = castNames.length ? ' · cast ' + castNames.slice(0, 6).join(', ') + (castNames.length > 6 ? ' +' + (castNames.length - 6) + ' more' : '') : '';
    return {
      id: 'd' + d.day, day: d.day, sceneIds: d.scenes.map((s) => s.id),
      text: 'Day ' + d.day + ': Sc ' + nums(d.scenes),
      detail: head + ' · ' + when + ' · ' + formatEighths(d.total) + (d.total === 8 ? ' page' : ' pages') + who
    };
  });
  const lockedNote = locked.size ? ' Days that have begun shooting (' + [...locked].sort((a, b) => a - b).join(', ') + ') are not touched.' : '';
  return {
    items,
    note: 'Planned by rules: ' + plural(scenes.length, 'scene', 'scenes') + ' over ' + plural(items.length, 'day', 'days')
      + ', up to ' + formatEighths(target) + ' pages a day. Places longest first, nights after days, exteriors before interiors, a song’s scenes together.' + lockedNote
  };
}

/* ============================================================
   2. recce-notes
   ============================================================ */

const blankField = (recce, k) => !String((recce && recce[k]) || '').trim();

function bestTimeWords(scenes) {
  const seen = new Set(scenes.map((s) => String(s.dayNight || '').trim().toUpperCase()).filter(Boolean));
  const known = DAY_NIGHT_ORDER.filter((d) => seen.has(d));
  const other = [...seen].filter((d) => !DAY_NIGHT_ORDER.includes(d)).sort();
  const text = [...known, ...other].map((w) => w.toLowerCase()).join(' and ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

/**
 * The recce checklist: "To check: …" lines for the BLANK fields of
 * RECCE_FIELDS, each only when a fact triggers it. Never a statement
 * about the place itself.
 *
 *   places   locationIndex() rows: { name, key, scenes, eighths, recce }
 *   tagsOf   (scene) -> { category: [names] }, default the scene's elements
 *   extrasOf (scene) -> the largest background crowd named, default read from "Name (40)"
 *   light    (place) -> { day, sunrise, sunset } | null (calculated, from the pin and a dated day)
 *
 * Returns { items: [{ id, location, key, field, text, group, groupLabel }] }:
 * one per blank field with a fact behind it; a place with none gets none.
 */
export function proposeRecce(places, { tagsOf, extrasOf, light } = {}) {
  const t = checks.thresholds;
  const R = checks.recce;
  const tags = tagsOf || ((s) => (s && s.elements) || {});
  const crowd = extrasOf || ((s) => peakOf(list(tags(s).extras || [])));
  const items = [];
  for (const p of places || []) {
    const scenes = p.scenes || [];
    if (!scenes.length) continue;
    const name = String(p.name || '');
    const tagged = (s, cats) => cats.flatMap((c) => list((tags(s) || {})[c] || []));
    const push = (field, body) => items.push({
      id: 'r' + items.length, location: name, key: p.key || norm(name), field, text: RECCE_PREFIX + body,
      group: p.key || norm(name), groupLabel: name
    });
    const nightN = scenes.filter(isNight).length;
    const intN = scenes.filter(isInt).length;
    const peak = scenes.reduce((m, s) => Math.max(m, Number(crowd(s)) || 0), 0);
    const crowdScenes = scenes.filter((s) => (Number(crowd(s)) || 0) > 0);
    const vehicleScenes = scenes.filter((s) => tagged(s, checks.tagCategories.parking).length);
    const powerTags = [...new Set(scenes.flatMap((s) => tagged(s, checks.tagCategories.power)))];
    const pages = (Number(p.eighths) || scenes.reduce((n, s) => n + (Number(s.eighths) || 0), 0));

    if (blankField(p.recce, 'bestTime')) {
      const mix = bestTimeWords(scenes);
      if (mix) {
        const l = light ? light(p) : null;
        push('bestTime', fill(R.bestTime, {
          mix,
          light: l && l.sunrise ? fill(R.bestTimeLight, l) : ''
        }));
      }
    }
    if (blankField(p.recce, 'power') && (intN || nightN || powerTags.length)) {
      const why = [];
      if (intN) why.push(fill(R.powerWhy.interior, { count: plural(intN, 'scene', 'scenes') }));
      if (nightN) why.push(fill(R.powerWhy.night, { count: plural(nightN, 'scene', 'scenes') }));
      if (powerTags.length) why.push(fill(R.powerWhy.tags, { what: powerTags.slice(0, 4).join(', ') }));
      push('power', fill(R.power, { why: why.join('; ') }));
    }
    if (blankField(p.recce, 'parking') && (vehicleScenes.length || peak >= t.extrasParking)) {
      const what = [];
      if (vehicleScenes.length) {
        what.push(fill(R.parkingWhat.vehicles, {
          sc: nums(vehicleScenes), names: [...new Set(vehicleScenes.flatMap((s) => tagged(s, checks.tagCategories.parking)))].slice(0, 4).join(', ')
        }));
      }
      if (peak >= t.extrasParking) what.push(fill(R.parkingWhat.extras, { peak, sc: nums(crowdScenes) }));
      push('parking', fill(R.parking, { what: what.join(' and ') }));
    }
    if (blankField(p.recce, 'toilets') && (peak >= t.extrasToilets || scenes.length >= t.scenesToilets || pages >= t.eighthsToilets)) {
      const because = peak >= t.extrasToilets
        ? fill(R.toiletsBecause.extras, { peak, sc: nums(crowdScenes) })
        : fill(R.toiletsBecause.load, { count: plural(scenes.length, 'scene', 'scenes'), pages: formatEighths(pages) + (pages === 8 ? ' page' : ' pages') });
      push('toilets', fill(R.toilets, { because }));
    }
    if (blankField(p.recce, 'notes') && scenes.length >= t.scenesNotes) {
      const bits = [];
      if (nightN) bits.push(nightN + ' at night');
      if (intN && intN < scenes.length) bits.push(intN + ' interior');
      if (vehicleScenes.length) bits.push('vehicle in Sc ' + nums(vehicleScenes));
      if (peak > 0) bits.push('background of ' + peak + ' in Sc ' + nums(crowdScenes));
      const stunts = scenes.filter((s) => catOf(s, 'stunts').length);
      if (stunts.length) bits.push('stunts in Sc ' + nums(stunts));
      bits.push(formatEighths(pages) + (pages === 8 ? ' page' : ' pages'));
      push('notes', fill(R.notes, { count: plural(scenes.length, 'scene', 'scenes'), detail: bits.join('; ') }));
    }
  }
  return { items };
}

/* ============================================================
   3. budget-estimate
   ============================================================ */

/** The speaking cast the script and the breakdown agree on (lock-seed.js reads them the same way). */
function speakingCast(scenes, elements) {
  const cued = new Map();
  matchScenes(scenes, elements).pairs.forEach((p) => {
    if (!p.slice || !isConfident(p.how)) return;
    const ks = new Set();
    (p.slice.elements || []).forEach((el) => { if (el.type === 'character') { const k = cueName(el.text); if (k) ks.add(k); } });
    cued.set(p.scene.id, ks);
  });
  const heard = new Set();
  cued.forEach((ks) => ks.forEach((k) => heard.add(k)));
  const out = [];
  castMatrix(scenes, elements).characters.forEach((c) => {
    if (!c.lines || !heard.has(c.key)) return;
    const own = new Set(scenes.filter((s) => (s.elements && s.elements.cast || []).some((n) => cueName(n) === c.key)).map((s) => s.id));
    out.push({ ...c, scenes: new Set([...c.scenes].filter((id) => own.has(id) || (cued.get(id) && cued.get(id).has(c.key)))) });
  });
  return out;
}

/** The per-day band a preset has on the rate card, in the budget's currency, or null. */
export function rateBand(name, currency, rates, rowKey = norm) {
  const key = rowKey(name);
  if (currency === 'USD') {
    const row = ((rates && rates.us && rates.us.rows) || []).find((r) => rowKey(r.item) === key);
    const p = (row && row.prices) || {};
    const week = Number(p['7']), three = Number(p['3']);
    return week > 0 && three > 0 ? { low: Math.round(week / 7), high: Math.round(three / 3) } : null;
  }
  for (const sec of (rates && rates.india && rates.india.sections) || []) {
    const row = (sec.rows || []).find((r) => rowKey(r.item) === key);
    if (row && row.low > 0 && row.high > 0) return { low: row.low, high: row.high };
  }
  return null;
}

/**
 * Budget lines the schedule implies: the lock's own lines (unit days,
 * speaking cast, background, vehicles, locations) plus the template's
 * count-triggered ones. DAYS come from the schedule; a name already on
 * the sheet is skipped. Each line shows its rate-card band; the RATE is
 * blank unless `midpoint` is on, and then it is exactly the middle of
 * the band, labelled as an estimate. No band means no rate. Never a
 * multiplier. Percent rows (contingency) stay with the page.
 *
 * Returns { items: [{ id, text, detail, line: {item, custom, days, rate}, band, basis, midpoint }], note }.
 */
export function proposeBudget({ schedule, scenes, elements, presets, rates, region, currency, existing, midpoint = false, rowKey = norm } = {}) {
  const list0 = scenes || [];
  const cur = currency === 'USD' ? 'USD' : 'INR';   // the sheet's own currency, never the film's region
  const taken = new Set(list(existing || []).map(lineKey));
  const presetBy = new Map(list(presets || []).filter((p) => !/^other\b/i.test(p)).map((p) => [norm(p), p]));
  const days = (ss) => new Set(ss.map(dayOf).filter((d) => d > 0)).size;
  const unit = Number(schedule && (schedule.totalDays || schedule.days)) || 0;
  const raw = [];
  const line = (o) => raw.push(o);

  // the lock's lines
  line({ custom: 'Unit shoot days', days: unit, basis: 'Scheduled shoot days.' });
  const byId = new Map(list0.map((s) => [s.id, s]));
  speakingCast(list0, elements || []).forEach((c) => {
    const ss = [...c.scenes].map((id) => byId.get(id)).filter(Boolean);
    line({ custom: 'Cast: ' + niceName(c.name), days: days(ss), basis: 'Speaks in ' + plural(ss.length, 'scene', 'scenes') + '.' });
  });
  const withExtras = list0.filter((s) => catOf(s, 'extras').length);
  const peak = peakOf(withExtras.flatMap((s) => catOf(s, 'extras')));
  line({ custom: 'Background extras' + (peak ? ' (peak ' + peak + ')' : ''), days: days(withExtras), basis: plural(withExtras.length, 'scene', 'scenes') + ' tag background.' });
  const vehicles = new Map();
  list0.forEach((s) => catOf(s, 'vehicles').forEach((v) => {
    const k = v.toLowerCase();
    if (!vehicles.has(k)) vehicles.set(k, { name: v, scenes: [] });
    vehicles.get(k).scenes.push(s);
  }));
  vehicles.forEach((v) => line({ custom: 'Vehicle: ' + v.name, days: days(v.scenes), basis: 'In ' + plural(v.scenes.length, 'scene', 'scenes') + '.' }));
  const places = new Map();
  list0.forEach((s) => {
    const n = oneLine(s.location, 80); if (!n) return;
    const k = n.toLowerCase();
    if (!places.has(k)) places.set(k, { name: n, scenes: [] });
    places.get(k).scenes.push(s);
  });
  places.forEach((p) => line({ custom: 'Location: ' + niceName(p.name), days: days(p.scenes), basis: plural(p.scenes.length, 'scene', 'scenes') + ' are set here.' }));

  // the template's lines, by count
  const counts = {
    shootDays: unit,
    nightScenes: list0.filter((s) => dayOf(s) && isNight(s)),
    vehicleScenes: list0.filter((s) => dayOf(s) && catOf(s, 'vehicles').length),
    stuntScenes: list0.filter((s) => dayOf(s) && catOf(s, 'stunts').length),
    sfxScenes: list0.filter((s) => dayOf(s) && catOf(s, 'sfx').length)
  };
  const daysFor = { shootDays: unit, nightDays: days(counts.nightScenes), vehicleDays: days(counts.vehicleScenes), stuntDays: days(counts.stuntScenes), sfxDays: days(counts.sfxScenes) };
  const sceneSet = { nightDays: counts.nightScenes, vehicleDays: counts.vehicleScenes, stuntDays: counts.stuntScenes, sfxDays: counts.sfxScenes };
  for (const t of template.lines) {
    const need = t.needs || {};
    const met = Object.entries(need).every(([k, min]) => (Array.isArray(counts[k]) ? counts[k].length : counts[k]) >= min);
    if (!met) continue;
    const ss = sceneSet[t.days] || [];
    const preset = t.item ? presetBy.get(norm(t.item)) : '';
    if (t.item && !preset) continue;                         // a template line must be a preset the sheet knows
    line({
      item: preset || '', custom: preset ? '' : t.custom, days: daysFor[t.days] || 0,
      basis: fill(t.basis, { count: plural(ss.length, 'scene', 'scenes'), days: plural(daysFor[t.days] || 0, 'day', 'days') })
    });
  }

  // choose: days > 0, a name not on the sheet or already chosen
  const items = [];
  for (const l of raw) {
    const name = l.custom || l.item;
    const k = lineKey(name);
    if (!(l.days > 0) || !k || taken.has(k)) continue;
    taken.add(k);
    const band = l.item ? rateBand(l.item, cur, rates, rowKey) : null;
    const mid = band ? (band.low + band.high) / 2 : null;
    const rate = midpoint && mid != null ? String(mid) : '';
    const bandText = band
      ? 'Rate card: ' + fmtMoney(band.low, cur) + ' to ' + fmtMoney(band.high, cur) + ' a day'
        + (midpoint ? '; ' + fmtMoney(mid, cur) + ' used (' + MIDPOINT_LABEL + ').' : '; the rate is left blank for you.')
      : (l.item ? 'No rate card band; the rate is left blank for you.' : 'The rate is left blank for you.');
    items.push({
      id: 'b' + items.length,
      text: name + ', ' + l.days + (l.days === 1 ? ' day' : ' days'),
      detail: oneLine(l.basis, 200) + ' ' + bandText,
      line: { item: l.item || (l.custom ? 'Other (custom)' : ''), custom: l.custom || '', days: String(l.days), rate },
      band, basis: l.basis, midpoint: rate ? Number(rate) : null
    });
  }
  return {
    items,
    note: 'Drafted by rules from the schedule: days are the schedule’s, rates are '
      + (midpoint ? 'the rate card’s midpoint where a band exists (' + MIDPOINT_LABEL + '), blank otherwise. ' : 'blank, with the rate card’s band shown where there is one. ')
      + 'Ticked lines are added as new rows; no existing line is changed. Contingency and other percent rows stay on the page.'
  };
}

/* ============================================================
   4. callsheet-notes
   ============================================================ */

/**
 * One line per fact present on the call sheet, none invented, clipped
 * to NOTES_MAX.
 *
 *   facts        callsheetFacts(): light {sunrise, sunset, zone, fallback}, wrap,
 *                scenes [{number, slug, pages}], pagesTotal
 *   tagsByScene  { [sceneNumber]: { dayNight, intExt, vehicles[], animals[], stunts[], sfx[] } }
 *   ages         { [sceneNumber]: [{ name, age }] } the child artists agesIn() found
 *   moves        dpr.js impliedMoves() output: [{ after (a scene number), from, to }]
 *
 * Returns { notes: [line, …], text } where text is the lines joined for
 * the notes box and never longer than NOTES_MAX.
 */
export function proposeCallsheetNotes(facts, { tagsByScene = {}, ages = {}, moves = [] } = {}) {
  const C = checks.callsheet;
  const f = facts || {};
  const onSheet = (f.scenes || []).map((s) => ({ no: String(s.number || '').trim(), tags: tagsByScene[String(s.number || '').trim()] || {} }));
  const which = (pred) => onSheet.filter((s) => s.no && pred(s)).map((s) => s.no);
  const lines = [];
  const light = f.light && f.light.sunrise && f.light.sunset ? f.light : null;
  const sun = light ? { sunsetMinutes: minutesOf(light.sunset) } : null;

  if (light) {
    lines.push(fill(C.light, {
      sunrise: light.sunrise, sunset: light.sunset, zone: light.zone ? ' ' + light.zone : '', fallback: light.fallback ? C.lightFallback : ''
    }).replace(/ \./, '.'));
  }
  const night = which((s) => String(s.tags.dayNight || '').toUpperCase().includes('NIGHT'));
  if (night.length) lines.push(fill(C.night, { sc: night.join(', '), are: night.length === 1 ? 'is' : 'are' }));
  const wrap = String(f.wrap || '').trim();
  if (wrap && sun && isPastSunset(wrap, sun)) {
    if (night.length) lines.push(fill(C.wrapAfterSunset, { wrap, sunset: light.sunset }));
    const day = which((s) => /EXT/i.test(String(s.tags.intExt || '')) && !/NIGHT/i.test(String(s.tags.dayNight || '')));
    if (day.length) lines.push(fill(C.daylightRisk, { sc: day.join(', '), wrap, sunset: light.sunset }));
  }
  const mv = (moves || []).filter((m) => m && m.from && m.to);
  mv.slice(0, 3).forEach((m) => lines.push(fill(C.move, { from: m.from, to: m.to, after: m.after })));
  if (mv.length > 3) lines.push(fill(C.moreMoves, { n: mv.length - 3 }));
  const names = (cat) => [...new Set(onSheet.flatMap((s) => list(s.tags[cat] || [])))].slice(0, 4).join(', ');
  for (const [cat, key] of [['vehicles', 'vehicles'], ['animals', 'animals']]) {
    const sc = which((s) => list(s.tags[cat] || []).length);
    if (sc.length) lines.push(fill(C[key], { names: names(cat), sc: sc.join(', ') }));
  }
  const stunts = which((s) => list(s.tags.stunts || []).length);
  if (stunts.length) lines.push(fill(C.stunts, { sc: stunts.join(', ') }));
  const sfx = which((s) => list(s.tags.sfx || []).length);
  if (sfx.length) lines.push(fill(C.sfx, { sc: sfx.join(', ') }));
  const kids = onSheet.filter((s) => s.no && (ages[s.no] || []).length);
  if (kids.length) {
    const who = [...new Set(kids.flatMap((s) => ages[s.no].map((a) => oneLine(a.name, 40) + ', ' + a.age)))].slice(0, 4).join('; ');
    lines.push(fill(C.child, { names: who, sc: kids.map((s) => s.no).join(', ') }));
  }
  const n = (f.scenes || []).length;
  if (n && f.pagesTotal) lines.push(fill(C.pages, { pages: f.pagesTotal + (String(f.pagesTotal) === '1' ? ' page' : ' pages'), count: plural(n, 'scene', 'scenes') }));

  // clip: whole lines first, so no line is cut in half
  const kept = [];
  let len = 0;
  for (const l of lines) {
    const next = len + (kept.length ? 1 : 0) + l.length;
    if (next > NOTES_MAX) break;
    kept.push(l); len = next;
  }
  return { notes: kept, text: kept.join('\n'), dropped: lines.length - kept.length };
}

export default { proposeShootOrder, proposeRecce, proposeBudget, proposeCallsheetNotes, rateBand };
