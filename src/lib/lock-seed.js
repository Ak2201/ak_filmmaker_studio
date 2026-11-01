/* ============================================================
   LOCK SEED — what a locked script seeds into pre-production
   ------------------------------------------------------------
   Phase 2 of the script lock (docs/LOCK-EXTRACT.md §1-2): cast
   contacts, recce cards, draft call sheets and budget lines, all
   by rule from the scene rows. PURE lib: no document, no ui.

   Every plan* writes nothing. Every seed* reads each model once,
   ADDS new records only and never edits one a person typed; "has
   one already" is decided from storage, so a second seed makes
   nothing. Every undo* removes a made record only while it still
   equals what was written (a record edited since is theirs) and
   answers how many it removed.
   ============================================================ */
import {
  blankContact, listContacts, saveContacts,
  blankCallSheet, listCallSheets, saveCallSheets, removeCallSheet, removeContact
} from './contacts.js';
import {
  locationIndex, setRecce, removeRecce, getRecce, hasRecce,
  shootDayOf, dayDate, orderedDayScenes, locationKey
} from './locations.js';
import {
  readCalcData, saveCalcData, maxRowIndex, itemNameOf, scheduleFacts, budgetCurrency
} from './budget-model.js';
import { castMatrix, matchScenes, isConfident, cueName } from './screenplay-analysis.js';
import { readAll as readCosts } from './costs.js';
import { highestLineIndex } from './budget-line-ids.js';
import { firstFreeRow } from './ai-preprod-model.js';
import { contactClaimsName, TO_BE_CAST } from './readiness.js';
import { DAY_NIGHT } from './scenes.js';

const norm = (s) => String(s || '').trim().toLowerCase();

/** JSON with sorted keys, so two records compare by value not by key order. */
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

/** A cue's capitals read as "Ravi"; a name already in mixed case is left. */
function niceName(name) {
  const s = String(name || '').trim();
  if (/[a-z]/.test(s)) return s;
  return s.toLowerCase().replace(/(^|[\s'’-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}

/* ---- cast contacts -------------------------------------------- */

/** Speaking characters, read only through CONFIDENT scene/heading pairs: a
    cue counts only in a confident slice, and a character's scenes are those
    that list them in the Breakdown or hold a confident cue. A position-only
    guess adds no speaker and no day. */
function speakingCast(scenes, elements) {
  const list = scenes || [];
  const cued = new Map();                                // scene id -> cue keys in its confident slice
  matchScenes(list, elements).pairs.forEach((p) => {
    if (!p.slice || !isConfident(p.how)) return;
    const ks = new Set();
    (p.slice.elements || []).forEach((el) => { if (el.type === 'character') { const k = cueName(el.text); if (k) ks.add(k); } });
    cued.set(p.scene.id, ks);
  });
  const heard = new Set();
  cued.forEach((ks) => ks.forEach((k) => heard.add(k)));
  const out = [];
  castMatrix(list, elements).characters.forEach((c) => {
    if (!c.lines || !heard.has(c.key)) return;
    const own = new Set(list.filter((s) => (s.elements && s.elements.cast || []).some((n) => cueName(n) === c.key)).map((s) => s.id));
    const ids = [...c.scenes].filter((id) => own.has(id) || (cued.get(id) && cued.get(id).has(c.key)));
    out.push({ ...c, scenes: new Set(ids) });
  });
  return out;
}

/** Speaking characters (a cue in a confident scene) nobody claims yet. */
function missingSpeakers(scenes, elements, contacts) {
  const all = speakingCast(scenes, elements);
  const taken = [...contacts];
  const out = [];
  for (const c of all) {
    if (taken.some((k) => contactClaimsName(k, c.name))) continue;
    out.push(c);
    taken.push({ role: c.name, name: '' });          // two spellings of one cue make one contact
  }
  return { speakers: all.length, missing: out };
}

export function planCastContacts({ scenes, elements } = {}) {
  return missingSpeakers(scenes, elements, listContacts()).missing.length;
}

export function seedCastContacts({ scenes, elements } = {}) {
  const contacts = listContacts();
  const { speakers, missing } = missingSpeakers(scenes, elements, contacts);
  if (!missing.length) return { made: [], speakers };
  const made = missing.map((c) => blankContact({
    name: TO_BE_CAST,
    role: niceName(c.name),
    department: 'Cast',
    notes: 'To be cast. Added from the script lock.'
  }));
  saveContacts([...contacts, ...made]);
  return { made: made.map((c) => ({ id: c.id, name: c.name, role: c.role })), speakers };
}

export function undoCastContacts(made) {
  const now = listContacts();
  const onSheet = new Set();                              // a sheet still naming them is the person's work
  listCallSheets().forEach((sh) => Object.keys((sh && sh.calls) || {}).forEach((id) => onSheet.add(id)));
  let n = 0;
  for (const m of made || []) {
    if (onSheet.has(m.id)) continue;
    const c = now.find((x) => x.id === m.id);
    const untouched = c && c.name === m.name && c.role === m.role && c.department === 'Cast'
      && c.notes === 'To be cast. Added from the script lock.' && !c.phone && !c.email;
    if (!untouched) continue;
    removeContact(m.id);                                  // also clears its call-sheet entries
    n++;
  }
  return n;
}

/* ---- recce ----------------------------------------------------- */

function bestTimeOf(scenes) {
  const seen = new Set(scenes.map((s) => String(s.dayNight || '').trim().toUpperCase()).filter(Boolean));
  const known = DAY_NIGHT.filter((d) => seen.has(d));
  const other = [...seen].filter((d) => !DAY_NIGHT.includes(d)).sort();
  const words = [...known, ...other].map((w) => w.toLowerCase());
  const text = words.join(' and ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function recceRows(scenes) {
  return locationIndex(scenes).filter((row) => !hasRecce(row.name));
}

export function planRecce(scenes) {
  return recceRows(scenes).length;
}

export function seedRecce(scenes) {
  const made = [];
  for (const row of recceRows(scenes)) {
    const bestTime = bestTimeOf(row.scenes);
    if (!setRecce(row.name, bestTime ? { bestTime } : {})) continue;
    made.push({ key: locationKey(row.name), name: row.name, record: getRecce(row.name) });
  }
  return { made };
}

export function undoRecce(made) {
  let n = 0;
  for (const m of made || []) {
    if (!hasRecce(m.name) || stable(getRecce(m.name)) !== stable(m.record)) continue;
    removeRecce(m.name);
    n++;
  }
  return n;
}

/* ---- call sheets ------------------------------------------------ */

function sheetPatches(scenes) {
  const list = scenes || [];
  const used = new Set();
  listCallSheets().forEach((s) => (s.sceneIds || []).forEach((id) => used.add(id)));
  const days = [...new Set(list.map(shootDayOf).filter((d) => d > 0))].sort((a, b) => a - b);
  const contacts = listContacts();
  const out = [];
  for (const d of days) {
    const here = orderedDayScenes(d, list);
    if (!here.length || here.some((s) => used.has(s.id))) continue;
    const names = [];
    here.forEach((s) => ((s.elements && s.elements.cast) || []).forEach((n) => { if (norm(n)) names.push(n); }));
    const calls = {};
    contacts.forEach((c) => { if (names.some((n) => contactClaimsName(c, n))) calls[c.id] = ''; });
    const places = [];
    here.forEach((s) => {
      const p = String(s.location || '').trim();
      if (p && !places.some((x) => norm(x) === norm(p))) places.push(p);
    });
    out.push({
      day: d,
      patch: {
        title: 'Shoot day ' + d,
        date: dayDate(d) || '',
        location: places.join(' / '),
        sceneIds: here.map((s) => s.id),
        calls
      }
    });
  }
  return out;
}

export function planCallSheets(scenes) {
  return sheetPatches(scenes).length;
}

export function seedCallSheets(scenes) {
  const todo = sheetPatches(scenes);
  if (!todo.length) return { made: [] };
  const made = todo.map((t) => ({ day: t.day, sheet: blankCallSheet(t.patch) }));
  saveCallSheets([...listCallSheets(), ...made.map((m) => m.sheet)]);
  return { made: made.map((m) => ({ id: m.sheet.id, day: m.day, sheet: m.sheet })) };
}

export function undoCallSheets(made) {
  const now = listCallSheets();
  let n = 0;
  for (const m of made || []) {
    const s = now.find((x) => x.id === m.id);
    if (!s || stable({ ...blankCallSheet(), ...m.sheet }) !== stable(s)) continue;
    removeCallSheet(m.id);
    n++;
  }
  return n;
}

/* ---- budget lines ----------------------------------------------- */

function readCalc() {
  try { return readCalcData() || {}; } catch (e) { return {}; }
}

/** The lines the schedule and the Breakdown imply, each with days > 0 and
    no existing row of that name. Rates are never part of a line. */
function lineList(scenes, elements, data) {
  const list = scenes || [];
  const dayOf = shootDayOf;
  const daysOf = (ss) => new Set(ss.map(dayOf).filter((d) => d > 0)).size;
  const lines = [];
  const unit = scheduleFacts().totalDays;
  lines.push({ custom: 'Unit shoot days', days: unit });

  const byId = new Map(list.map((s) => [s.id, s]));
  speakingCast(list, elements).forEach((c) => {
    lines.push({ custom: 'Cast: ' + niceName(c.name), days: daysOf([...c.scenes].map((id) => byId.get(id)).filter(Boolean)) });
  });

  const withExtras = list.filter((s) => s.elements && (s.elements.extras || []).length);
  let peak = 0;
  withExtras.forEach((s) => s.elements.extras.forEach((t) => {
    const m = String(t).match(/\((\d+)\)/);
    if (m) peak = Math.max(peak, +m[1]);
  }));
  lines.push({ custom: 'Background extras' + (peak ? ' (peak ' + peak + ')' : ''), days: daysOf(withExtras) });

  const vehicles = new Map();
  list.forEach((s) => ((s.elements && s.elements.vehicles) || []).forEach((v) => {
    const k = norm(v);
    if (!k) return;
    if (!vehicles.has(k)) vehicles.set(k, { name: String(v).trim(), scenes: [] });
    vehicles.get(k).scenes.push(s);
  }));
  vehicles.forEach((v) => lines.push({ custom: 'Vehicle: ' + v.name, days: daysOf(v.scenes) }));

  locationIndex(list).forEach((row) => lines.push({ custom: 'Location: ' + row.name, days: row.days.length }));

  const have = new Set();
  Object.keys(data).forEach((k) => {
    const m = k.match(/^ci_(\d+)_item$/) || k.match(/^ci_(\d+)_custom$/);
    if (!m) return;
    const name = itemNameOf(data['ci_' + m[1] + '_custom'], data['ci_' + m[1] + '_item']);
    if (name) have.add(name.toLowerCase());
  });
  return lines.filter((l) => {
    const k = l.custom.toLowerCase();
    if (!(l.days > 0) || have.has(k)) return false;
    have.add(k);
    return true;
  });
}

export function planBudgetLines({ scenes, elements } = {}) {
  return lineList(scenes, elements, readCalc()).length;
}

export function seedBudgetLines({ scenes, elements } = {}) {
  const data = readCalc();
  const lines = lineList(scenes, elements, data);
  if (!lines.length) return { made: [], currency: budgetCurrency() };
  const next = { ...data };
  /* above every number either blob ever used: a retired ci_n is never reissued */
  let n = firstFreeRow(maxRowIndex(data), highestLineIndex(data, readCosts())) - 1;
  const made = lines.map((l) => {
    n += 1;
    next['ci_' + n + '_item'] = 'Other (custom)';
    next['ci_' + n + '_custom'] = l.custom;
    next['ci_' + n + '_days'] = String(l.days);
    return { n, custom: l.custom, days: l.days };
  });
  saveCalcData(next);
  return { made, currency: budgetCurrency() };
}

export function undoBudgetLines(made) {
  const data = readCalc();
  const next = { ...data };
  let removed = 0;
  for (const m of made || []) {
    const p = 'ci_' + m.n + '_';
    const rate = String(data[p + 'rate'] == null ? '' : data[p + 'rate']).trim();
    if (data[p + 'custom'] !== m.custom || String(data[p + 'days']) !== String(m.days) || rate) continue;
    ['item', 'custom', 'days', 'rate'].forEach((f) => { delete next[p + f]; });
    removed++;
  }
  if (removed) saveCalcData(next);
  return removed;
}
