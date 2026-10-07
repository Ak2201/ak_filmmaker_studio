/* ============================================================
   THE SHOOT DAY'S OWN RECORDS — DPR, banners, kit, the one-liner
   ------------------------------------------------------------
   Four things a production keeps per SHOOT DAY, and not one of them
   is a scene field. Read src/lib/shootday.js and the DAY RECORDS
   note in src/lib/locations.js first: shoot.html is the only view
   that writes to a scene, so everything here is either stored as a
   fact about the DAY (inside fms_locations_v1, keyed by day number —
   no new storage key) or derived on the spot.

     the DPR        STORED: the times (crew call, first shot, lunch,
                    camera wrap, wrap), setups, weather, notes, the
                    delays and the incidents — what the day DID.
                    DERIVED: scenes and pages planned against shot.
                    Planned is the day's scenes (the stripboard's
                    schedule); shot is shoot.html's mark on each of
                    them (`shotState`). This file READS that mark and
                    never writes it: the set's word is final, and a
                    report that could overrule it would be a second
                    opinion about the same fact.
     banners        STORED: day-level strips — a company move (from →
                    to), a travel day, a holding day, a note — each
                    anchored AFTER a scene of its day ('' = the top of
                    the day, '$end' = after the day). Anchored to a
                    scene id rather than an index, so dragging strips
                    about on the board keeps a move between the two
                    scenes it was written between; a banner whose
                    scene has left the day falls to the end of it
                    rather than vanishing.
     kit            STORED: per day, per department, the list — item,
                    qty, vendor, picked up, returned. SEEDED (once, on
                    request) from the budget estimator's rows; after
                    that it is the day's own list, because a tick for
                    "picked up on day 3" is not a fact the estimator
                    has anywhere to keep.
     the one-liner  DERIVED entirely: the whole shoot, one line per
                    scene, with day banners and per-day page totals.

   NO CLOCK. Nothing here reads today's date; a caller passes a day.
   ============================================================ */
import Scenes, { totalEighths, formatEighths, ELEMENT_CATEGORIES } from './scenes.js';
import Locations from './locations.js';
import Shoot from './shootday.js';

const uid = (p) =>
  (globalThis.crypto && crypto.randomUUID)
    ? p + crypto.randomUUID().slice(0, 8)
    : p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (v == null ? '' : String(v));

/* ---- times ------------------------------------------------------ */

/** "07:30" → 450; anything else → null. A time a person typed into an
    <input type="time"> is local wall-clock, so no Date is involved. */
export function toMinutes(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(str(t).trim());
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** Minutes from a to b; across midnight when b is earlier (a night
    shoot wraps "before" it called). null when either is missing. */
export function span(a, b) {
  const x = toMinutes(a), y = toMinutes(b);
  if (x == null || y == null) return null;
  return y >= x ? y - x : y + 1440 - x;
}

export function formatMinutes(min) {
  if (min == null || !Number.isFinite(min)) return '—';
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  return h ? h + 'h ' + String(m % 60).padStart(2, '0') + 'm' : (m % 60) + 'm';
}

/* ---- the DPR ---------------------------------------------------- */

/** The time fields, in the order a DPR is read. */
export const DPR_TIMES = [
  { id: 'crewCall',   label: 'Crew call' },
  { id: 'firstShot',  label: 'First shot' },
  { id: 'lunchIn',    label: 'Lunch in' },
  { id: 'lunchOut',   label: 'Lunch out' },
  { id: 'cameraWrap', label: 'Camera wrap' },
  { id: 'wrap',       label: 'Wrap' }
];

export const DELAY_REASONS = [
  'Weather', 'Light', 'Location / permission', 'Cast late', 'Crew late',
  'Equipment', 'Technical', 'Make-up / costume', 'Meal', 'Other'
];

const TEXT_FIELDS = ['setups', 'weather', 'notes'];

export function blankDelay(patch = {}) {
  return { id: uid('dl_'), reason: DELAY_REASONS[0], minutes: '', note: '', ...patch };
}
export function blankIncident(patch = {}) {
  return { id: uid('in_'), what: '', action: '', ...patch };
}

/** A DPR with every field present, so callers never guard. */
export function blankDPR(patch = {}) {
  const out = { setups: '', weather: '', notes: '', delays: [], incidents: [] };
  for (const f of DPR_TIMES) out[f.id] = '';
  return { ...out, ...patch };
}

function cleanDPR(raw) {
  const d = blankDPR();
  if (!isPlainObject(raw)) return d;
  for (const f of DPR_TIMES) d[f.id] = str(raw[f.id]);
  for (const f of TEXT_FIELDS) d[f] = str(raw[f]);
  d.delays = (Array.isArray(raw.delays) ? raw.delays : []).filter(isPlainObject)
    .map((x) => ({ ...blankDelay(), ...x, reason: str(x.reason) || 'Other', minutes: str(x.minutes), note: str(x.note) }));
  d.incidents = (Array.isArray(raw.incidents) ? raw.incidents : []).filter(isPlainObject)
    .map((x) => ({ ...blankIncident(), ...x, what: str(x.what), action: str(x.action) }));
  return d;
}

/** What gets stored: only the fields with something in them. A DPR
    nobody has filled in is no record at all, not a record of blanks. */
function compactDPR(d) {
  const out = {};
  for (const f of DPR_TIMES) if (d[f.id]) out[f.id] = d[f.id];
  for (const f of TEXT_FIELDS) if (String(d[f] || '').trim()) out[f] = d[f];
  if (d.delays.length) out.delays = d.delays;
  if (d.incidents.length) out.incidents = d.incidents;
  return out;
}

export function getDPR(day) {
  return cleanDPR(Locations.dayRecord('dpr', day));
}

/** Merge a patch into one day's DPR. Unknown fields are dropped. */
export function saveDPR(day, patch) {
  const next = cleanDPR({ ...getDPR(day), ...(patch || {}) });
  return Locations.setDayRecord('dpr', day, compactDPR(next));
}

function listOp(field, blank) {
  return {
    add(day, patch) {
      const d = getDPR(day);
      const item = blank(patch);
      d[field] = d[field].concat(item);
      saveDPR(day, { [field]: d[field] });
      return item;
    },
    update(day, id, patch) {
      const d = getDPR(day);
      const i = d[field].findIndex((x) => x.id === id);
      if (i < 0) return null;
      d[field][i] = { ...d[field][i], ...patch, id };
      saveDPR(day, { [field]: d[field] });
      return d[field][i];
    },
    remove(day, id) {
      const d = getDPR(day);
      saveDPR(day, { [field]: d[field].filter((x) => x.id !== id) });
    }
  };
}
const delayOps = listOp('delays', blankDelay);
const incidentOps = listOp('incidents', blankIncident);
export const addDelay = delayOps.add, updateDelay = delayOps.update, removeDelay = delayOps.remove;
export const addIncident = incidentOps.add, updateIncident = incidentOps.update, removeIncident = incidentOps.remove;

/** Local "YYYY-MM-DD" of an ISO instant — the day the mark was made. */
function localDate(iso) {
  const t = Date.parse(str(iso));
  return Number.isFinite(t) ? Shoot.toISODate(new Date(t)) : '';
}

/**
 * The derived half of a DPR. Planned is the day's schedule; shot is
 * the set's marks on those scenes. `pickups` are scenes scheduled on
 * ANOTHER day whose mark was made on this day's date — the commonest
 * way a schedule and a shoot part company, and only knowable when the
 * day has a date.
 */
export function dprSummary(day, scenes) {
  const list = scenes || Scenes.listScenes();
  const d = Shoot.detail(day, list);
  const planned = d ? d.scenes : [];
  const by = (st) => planned.filter((s) => (s.shotState || '') === st);
  const shot = by('shot'), part = by('part'), dropped = by('dropped');
  const unmarked = planned.filter((s) => !s.shotState);
  const date = Locations.dayDate(day);
  const pickups = date
    ? list.filter((s) => Locations.shootDayOf(s) !== Number(day)
        && (s.shotState === 'shot' || s.shotState === 'part')
        && localDate(s.shotAt) === date)
    : [];
  const rec = getDPR(day);
  const delayMinutes = rec.delays.reduce((n, x) => n + (parseInt(x.minutes, 10) || 0), 0);
  const lunch = span(rec.lunchIn, rec.lunchOut);
  const length = span(rec.crewCall, rec.wrap);
  return {
    day: Number(day),
    date,
    planned, shot, part, dropped, unmarked, pickups,
    eighthsPlanned: totalEighths(planned),
    eighthsShot: totalEighths(shot),
    eighthsPart: totalEighths(part),
    pagesPlanned: formatEighths(totalEighths(planned)),
    pagesShot: formatEighths(totalEighths(shot)),
    pagesPart: formatEighths(totalEighths(part)),
    delayMinutes,
    lunchMinutes: lunch,
    dayMinutes: length,
    workMinutes: length == null ? null : length - (lunch || 0),
    callToFirstShot: span(rec.crewCall, rec.firstShot),
    record: rec
  };
}

/* ---- banners ---------------------------------------------------- */

export const BANNER_KINDS = [
  { id: 'move',    label: 'Company move' },
  { id: 'travel',  label: 'Travel day' },
  { id: 'holiday', label: 'Holding / day off' },
  { id: 'note',    label: 'Note' }
];
export const bannerLabel = (kind) => (BANNER_KINDS.find((k) => k.id === kind) || BANNER_KINDS[3]).label;
export const AFTER_DAY = '$end';

export function blankBanner(patch = {}) {
  const kind = BANNER_KINDS.some((k) => k.id === patch.kind) ? patch.kind : 'note';
  return {
    id: uid('bn_'), from: '', to: '', text: '',
    after: kind === 'travel' || kind === 'holiday' ? AFTER_DAY : '',
    ...patch, kind
  };
}

export function listBanners(day) {
  const raw = Locations.dayRecord('banners', day) || [];
  return raw.filter(isPlainObject).map((b) => {
    const clean = blankBanner({ ...b, kind: b.kind });
    clean.from = str(clean.from); clean.to = str(clean.to); clean.text = str(clean.text); clean.after = str(clean.after);
    return clean;
  });
}

export function allBanners() {
  const out = {};
  for (const day of Object.keys(Locations.listDayRecords('banners'))) {
    const list = listBanners(day);
    if (list.length) out[day] = list;
  }
  return out;
}

export function addBanner(day, patch) {
  const b = blankBanner(patch);
  Locations.setDayRecord('banners', day, listBanners(day).concat(b));
  return b;
}
export function updateBanner(day, id, patch) {
  const list = listBanners(day);
  const i = list.findIndex((b) => b.id === id);
  if (i < 0) return null;
  list[i] = blankBanner({ ...list[i], ...patch, id });
  Locations.setDayRecord('banners', day, list);
  return list[i];
}
export function removeBanner(day, id) {
  return Locations.setDayRecord('banners', day, listBanners(day).filter((b) => b.id !== id));
}

/** One-line words for a banner, the same on the board and the one-liner. */
export function bannerText(b) {
  const label = bannerLabel(b.kind);
  if (b.kind === 'move' && (b.from || b.to)) {
    const route = [b.from || '?', b.to || '?'].join(' → ');
    return label + ': ' + route + (b.text ? ' — ' + b.text : '');
  }
  return label + (b.text ? ': ' + b.text : '');
}

/**
 * PURE. A day's scenes and banners as one sequence, the order the
 * board and the one-liner draw them in: '' banners first, each scene
 * followed by the banners anchored after it, then the end-of-day
 * banners and any whose scene is no longer on this day.
 */
export function layoutDay(dayScenes, banners) {
  const list = Array.isArray(banners) ? banners : [];
  const ids = new Set(dayScenes.map((s) => s.id));
  const out = [];
  for (const b of list) if (!b.after) out.push({ type: 'banner', banner: b });
  for (const s of dayScenes) {
    out.push({ type: 'scene', scene: s });
    for (const b of list) if (b.after === s.id) out.push({ type: 'banner', banner: b });
  }
  for (const b of list) if (b.after && !ids.has(b.after)) out.push({ type: 'banner', banner: b });
  return out;
}

/** PURE. Where the location changes between consecutive scenes of a
    day — the company moves the day implies, as { after, from, to }. */
export function impliedMoves(dayScenes) {
  const out = [];
  for (let i = 1; i < dayScenes.length; i++) {
    const a = Locations.locationName(dayScenes[i - 1]);
    const b = Locations.locationName(dayScenes[i]);
    if (a && b && Locations.locationKey(a) !== Locations.locationKey(b)) {
      out.push({ after: dayScenes[i - 1].id, from: a, to: b });
    }
  }
  return out;
}

/* ---- load ------------------------------------------------------- */

/** 4 7/8 pages: a full but honest day for an indie feature. */
export const DEFAULT_PAGE_TARGET = 39;
/** The working day the hours estimate assumes. Said where it is shown. */
export const DAY_HOURS = 12;

export function pageTarget() {
  return Locations.schedulePrefs().pageTarget || DEFAULT_PAGE_TARGET;
}
export function setPageTarget(eighths) {
  const n = parseInt(eighths, 10);
  return Locations.setSchedulePrefs({ pageTarget: n > 0 && n !== DEFAULT_PAGE_TARGET ? n : null });
}

/** PURE. Is this day heavier than the target? */
export function dayLoad(eighths, target = DEFAULT_PAGE_TARGET) {
  const e = Number(eighths) || 0;
  const t = Number(target) || DEFAULT_PAGE_TARGET;
  return { eighths: e, target: t, over: e > t, ratio: t ? e / t : 0 };
}

/**
 * PURE. Shooting hours for a day from its ESTIMATED SCREEN TIME: at
 * the target pace a DAY_HOURS day yields `target` eighths, and a page
 * plays about a minute — so a day's screen minutes, over the minutes
 * the target yields, times the day. An estimate built on an estimate,
 * and labelled as one wherever it is shown. null with no screen time.
 */
export function estimateHours(screenSeconds, target = DEFAULT_PAGE_TARGET) {
  const sec = Number(screenSeconds);
  if (!Number.isFinite(sec) || sec <= 0) return null;
  const minutesPerDay = (Number(target) || DEFAULT_PAGE_TARGET) / 8;
  return (sec / 60) / minutesPerDay * DAY_HOURS;
}

/* ---- the kit ---------------------------------------------------- */

export const DEPARTMENTS = [
  { id: 'camera',   label: 'Camera' },
  { id: 'lighting', label: 'Lighting' },
  { id: 'grip',     label: 'Grip' },
  { id: 'sound',    label: 'Sound' },
  { id: 'art',      label: 'Art' },
  { id: 'costume',  label: 'Costume' }
];
const DEPT_IDS = DEPARTMENTS.map((d) => d.id);

export function blankKitItem(patch = {}) {
  return { id: uid('kt_'), item: '', qty: '1', vendor: '', pickup: false, returned: false, ...patch };
}

export function getKit(day) {
  const raw = Locations.dayRecord('kit', day) || {};
  const out = {};
  for (const id of DEPT_IDS) {
    out[id] = (Array.isArray(raw[id]) ? raw[id] : []).filter(isPlainObject).map((x) => ({
      ...blankKitItem(), ...x,
      item: str(x.item), qty: str(x.qty), vendor: str(x.vendor),
      pickup: x.pickup === true, returned: x.returned === true
    }));
  }
  return out;
}

export function saveKit(day, kit) {
  const out = {};
  for (const id of DEPT_IDS) if (Array.isArray(kit[id]) && kit[id].length) out[id] = kit[id];
  return Locations.setDayRecord('kit', day, out);
}

export function addKitItem(day, dept, patch) {
  if (!DEPT_IDS.includes(dept)) return null;
  const kit = getKit(day);
  const item = blankKitItem(patch);
  kit[dept].push(item);
  saveKit(day, kit);
  return item;
}
export function updateKitItem(day, id, patch) {
  const kit = getKit(day);
  for (const dept of DEPT_IDS) {
    const i = kit[dept].findIndex((x) => x.id === id);
    if (i < 0) continue;
    kit[dept][i] = { ...kit[dept][i], ...patch, id };
    saveKit(day, kit);
    return kit[dept][i];
  }
  return null;
}
export function removeKitItem(day, id) {
  const kit = getKit(day);
  for (const dept of DEPT_IDS) kit[dept] = kit[dept].filter((x) => x.id !== id);
  return saveKit(day, kit);
}

/** Totals for one day's kit: items, and how many are out and back. */
export function kitTally(kit) {
  let items = 0, picked = 0, back = 0;
  for (const id of DEPT_IDS) for (const x of kit[id] || []) {
    items++; if (x.pickup) picked++; if (x.returned) back++;
  }
  return { items, picked, back };
}

/* Which department a budget line belongs to. Keyword rules, most
   specific first; crew, post and transport lines are not kit and
   answer ''. Pure, so the seeding is testable without a page. */
const DEPT_RULES = [
  ['grip',     /dolly|track|jib|crane|grip|slider|apple box|c-stand|steadicam|gimbal|ronin|tripod|rig\b|camera car/],
  ['sound',    /sound recordist|recorder|boom|lav|radio mic|comtek|ifb|\bmic\b|timecode/],
  ['camera',   /alexa|venice|\bred\b|komodo|raptor|canon|c500|\bfx\d|sony|blackmagic|ursa|camera|lens|prime|zoom|anamorphic|cooke|zeiss|sigma|angenieux|lomo|atlas|drone|monitor|follow focus|matte box/],
  ['lighting', /hmi|aputure|\bled\b|tungsten|kino|light|diffusion|flag|generator|gaffer tape|\bkva\b|skypanel|baby|\d+k\b/],
  ['art',      /\bprop|set dress|art\b|paint|signage/],
  ['costume',  /costume|wardrobe|make-?up|hair/]
];
const NOT_KIT = /^(dop|1st ad|2nd ad|production designer|costume designer|editor|sound designer|focus puller|gaffer|production manager|electrician|composer|di \/|vfx|sound mix|production van|other \(custom\))/;

export function classifyEquipment(name) {
  const n = str(name).toLowerCase().trim();
  if (!n || NOT_KIT.test(n)) return '';
  for (const [dept, re] of DEPT_RULES) if (re.test(n)) return dept;
  return '';
}

/** PURE. The estimator's stored blob ({ ci_1_item, ci_1_custom, … })
    as named lines, in row order. A custom name wins over the preset. */
export function calcLines(blob) {
  const data = isPlainObject(blob) ? blob : {};
  const rows = new Map();
  for (const [k, v] of Object.entries(data)) {
    const m = /^ci_(\d+)_(item|custom|days|rate)$/.exec(k);
    if (!m) continue;
    if (!rows.has(+m[1])) rows.set(+m[1], {});
    rows.get(+m[1])[m[2]] = str(v).trim();
  }
  return [...rows.keys()].sort((a, b) => a - b).map((i) => rows.get(i))
    .map((r) => ({ item: r.custom || r.item || '', days: r.days || '' }))
    .filter((r) => r.item && r.item !== 'Other (custom)');
}

export const CALC_KEY = 'fms_library_calc_v1';
export function readCalcLines() {
  try { return calcLines(JSON.parse(localStorage.getItem(CALC_KEY) || '{}')); }
  catch (e) { return []; }
}

/**
 * Add the estimator's kit lines to one day's lists. Lines already on
 * the day (same name, any case) are skipped, so pressing it twice adds
 * nothing the second time. Returns how many were added.
 */
export function seedKitFromCalc(day, lines) {
  const src = lines || readCalcLines();
  const kit = getKit(day);
  const have = new Set(DEPT_IDS.flatMap((d) => kit[d].map((x) => x.item.toLowerCase())));
  let added = 0;
  for (const line of src) {
    const dept = classifyEquipment(line.item);
    if (!dept || have.has(line.item.toLowerCase())) continue;
    kit[dept].push(blankKitItem({ item: line.item }));
    have.add(line.item.toLowerCase());
    added++;
  }
  if (added) saveKit(day, kit);
  return added;
}

/** Copy one day's lists to another, ticks cleared — the next day's
    kit is usually yesterday's, and its pickups have not happened. */
export function copyKit(fromDay, toDay) {
  const src = getKit(fromDay);
  const kit = getKit(toDay);
  const have = new Set(DEPT_IDS.flatMap((d) => kit[d].map((x) => x.item.toLowerCase())));
  let added = 0;
  for (const dept of DEPT_IDS) for (const x of src[dept]) {
    if (have.has(x.item.toLowerCase())) continue;
    kit[dept].push(blankKitItem({ item: x.item, qty: x.qty, vendor: x.vendor }));
    added++;
  }
  if (added) saveKit(toDay, kit);
  return added;
}

/* ---- the one-liner ---------------------------------------------- */

const CAST = (ELEMENT_CATEGORIES.find((c) => c.id === 'cast') || { id: 'cast' }).id;

/**
 * PURE over its input. Cast numbers the way a board assigns them: the
 * performer in the most scenes is 1, ties by first appearance in the
 * script. Derived, never stored — so it renumbers when the tagging
 * changes, which on a one-liner printed today is the honest answer.
 */
export function castNumbers(scenes) {
  const count = new Map();
  const first = new Map();
  const label = new Map();
  scenes.forEach((s, i) => {
    for (const name of (s.elements && s.elements[CAST]) || []) {
      const k = str(name).trim().toLowerCase();
      if (!k) continue;
      count.set(k, (count.get(k) || 0) + 1);
      if (!first.has(k)) { first.set(k, i); label.set(k, str(name).trim()); }
    }
  });
  const order = [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || first.get(a) - first.get(b));
  const map = new Map(order.map((k, i) => [k, i + 1]));
  return {
    of: (name) => map.get(str(name).trim().toLowerCase()) || 0,
    legend: order.map((k, i) => ({ number: i + 1, name: label.get(k), scenes: count.get(k) }))
  };
}

/** The whole shoot, one line per scene, banners in place, a page total
    per day; then whatever is not scheduled yet. */
export function oneLiner(scenes) {
  const list = scenes || Scenes.listScenes();
  const cast = castNumbers(list);
  const banners = allBanners();
  const line = (s) => ({
    scene: s,
    number: s.number || '',
    intExt: s.intExt || '',
    dayNight: s.dayNight || '',
    slug: Locations.locationName(s),
    eighths: Number(s.eighths) || 0,
    pages: formatEighths(Number(s.eighths) || 0),
    cast: Locations.castOf(s).map(cast.of).filter(Boolean).sort((a, b) => a - b)
  });
  const days = Locations.calendarDays(list).map((d) => ({
    day: d.day,
    date: d.date,
    eighths: d.eighths,
    pages: formatEighths(d.eighths),
    items: layoutDay(d.scenes, banners[String(d.day)] || [])
      .map((it) => (it.type === 'scene' ? { type: 'scene', ...line(it.scene) } : it))
  }));
  const unscheduled = Locations.unscheduledScenes(list).map(line);
  return { days, unscheduled, legend: cast.legend, eighths: totalEighths(list) };
}

export default {
  toMinutes, span, formatMinutes,
  DPR_TIMES, DELAY_REASONS, blankDPR, blankDelay, blankIncident, getDPR, saveDPR,
  addDelay, updateDelay, removeDelay, addIncident, updateIncident, removeIncident, dprSummary,
  BANNER_KINDS, AFTER_DAY, bannerLabel, blankBanner, listBanners, allBanners, addBanner, updateBanner,
  removeBanner, bannerText, layoutDay, impliedMoves,
  DEFAULT_PAGE_TARGET, DAY_HOURS, pageTarget, setPageTarget, dayLoad, estimateHours,
  DEPARTMENTS, blankKitItem, getKit, saveKit, addKitItem, updateKitItem, removeKitItem, kitTally,
  classifyEquipment, calcLines, readCalcLines, seedKitFromCalc, copyKit, CALC_KEY,
  castNumbers, oneLiner
};
