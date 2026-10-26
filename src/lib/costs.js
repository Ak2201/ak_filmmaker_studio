/* ============================================================
   THE COST MODEL — what was spent, against what was planned
   ------------------------------------------------------------
   The estimator (src/ui/budget.js, `fms_library_calc_v1`) is the
   PLAN. This file is everything that happens to money after it:
   petty-cash floats and the daily expense log, crew fees and the
   advances paid against them, the contingency the cost report adds,
   the department a line belongs to on the top sheet, and the user's
   own figures for the crew wage table.

   STORAGE CONTRACT. ONE new per-project key, `fms_costs_v1`, holding
   several collections — the pattern contacts.js set with people and
   call sheets under one key. Registered in SCOPED_KEYS (store.js),
   PROJECT_KEYS (backup.js), ALL_KEYS (hub.js) and SCOPE_BY_KEY
   (cloud.js) as scope `costs`, which schema section 24 adds.

     expenses       [{ id, date, shootDay, line, category, amount,
                       gstPct, vendor, gstin, paidBy, method, note,
                       receipt, createdAt }]
     floats         [{ id, date, to, amount, method, note }]
     crew           { <contactId>: { feeType, fee, days, tdsPct,
                                     line, wageRow, note } }
     payments       [{ id, contactId, date, amount, method, note }]
     lines          { <ci_n>: { dept } }   a line's department, when
                                           the person moved it
     settings       { contingencyPct }
     versions       [{ id, name, note, lockedAt, estimate, atl, btl,
                       contingency, grand, days, lines:[{id,name,dept,
                       days,rate,estimate}] }]   LOCKED budget snapshots:
                       immutable (no update function), removable only.
                       `lines[id]` may also carry `scales` (true/false):
                       whether the line grows with shoot days.
     wageOverrides  { <wage row id>: { bata, callHours, otRule } }

   WHAT IS NOT STORED, and must never be: every total, balance,
   variance, % used, days worked, TDS figure, GST split, top-sheet
   subtotal and account number. They are derived on every call from
   the rows above plus the estimator, the contacts and the schedule —
   a stored total is a second representation and the first edit makes
   it a lie.

   IDENTITY. A crew record is keyed by CONTACT ID (contacts.js), never
   by a name: rename the person and the ledger follows. A budget line
   is the estimator's own row id, `ci_<n>` — the calculator never
   renumbers a row (reset clears them all), so the id is stable for
   exactly as long as the line exists. An expense on a line that was
   reset away keeps its id and shows as "not on a budget line" rather
   than being silently dropped from the actuals.

   MONEY. Every figure a person TYPES goes through parseNum (money.js)
   once, at the moment it is stored, and is stored as a plain number.
   "1.5k" becomes 1500 and stays 1500; there is no second parser here.

   GST CONVENTION. An expense `amount` is what LEFT THE POCKET — the
   bill total, tax included — because that is the number on a petty-
   cash slip. `gstPct` says how much of it was GST; the split is
   derived (gstSplit). The cost report shows both with and without.

   TDS CONVENTION. A crew `payment` is the cash the person received.
   TDS is withheld on top of it, payable to the government, so the
   cost of a payment to the production is amount ÷ (1 − tds%): a
   ₹9,000 payment with 10% TDS cost ₹10,000, and the ₹1,000 is owed
   to the department, not to the person.
   ============================================================ */
import rates from '../data/rates.chennai.2024.json';
import { parseNum, parseAmount } from './money.js';
import { normaliseCurrency, projectRegion, currencyForRegion } from './region-core.js';
import Store from './store.js';
import { newId as uid } from './record-id.js';

export const COSTS_KEY = 'fms_costs_v1';
export const CALC_KEY = 'fms_library_calc_v1';

export const CATEGORIES = [
  { id: 'batta',     label: 'Batta' },
  { id: 'food',      label: 'Food' },
  { id: 'transport', label: 'Transport / fuel' },
  { id: 'location',  label: 'Location' },
  { id: 'props',     label: 'Props' },
  { id: 'misc',      label: 'Misc' }
];
export const METHODS = [
  { id: 'cash', label: 'Cash' },
  { id: 'upi',  label: 'UPI' },
  { id: 'card', label: 'Card' },
  { id: 'bank', label: 'Bank transfer' }
];
export const GST_RATES = [0, 5, 12, 18, 28];
export const TDS_RATES = [0, 1, 2, 10];

/* THE DEPARTMENTS OF THE TOP SHEET, with the account numbers the
   Movie Magic-style export prints. `group` is the line the financier
   reads first: above the line (story, producers, director, cast),
   below it (the shoot), post, and the rest. The numbers are this
   app's own chart of accounts, in the 1000s / 2000s / 3000s / 4000s
   shape every budgeting package uses — not any studio's. */
export const DEPTS = [
  { id: 'story',     acct: '1100', label: 'Story & screenplay',   group: 'atl' },
  { id: 'producers', acct: '1200', label: 'Producers',            group: 'atl' },
  { id: 'direction', acct: '1300', label: 'Direction',            group: 'atl' },
  { id: 'cast',      acct: '1400', label: 'Cast',                 group: 'atl' },
  { id: 'crew',      acct: '2100', label: 'Production crew',      group: 'btl' },
  { id: 'camera',    acct: '2200', label: 'Camera',               group: 'btl' },
  { id: 'lighting',  acct: '2300', label: 'Lighting & grip',      group: 'btl' },
  { id: 'sound',     acct: '2400', label: 'Sound',                group: 'btl' },
  { id: 'art',       acct: '2500', label: 'Art, costume & make-up', group: 'btl' },
  { id: 'locations', acct: '2600', label: 'Locations',            group: 'btl' },
  { id: 'transport', acct: '2700', label: 'Transport & power',    group: 'btl' },
  { id: 'food',      acct: '2800', label: 'Food & batta',         group: 'btl' },
  { id: 'post',      acct: '3100', label: 'Post, music & VFX',    group: 'post' },
  { id: 'other',     acct: '4100', label: 'General & other',      group: 'other' }
];
export const GROUPS = [
  { id: 'atl',   label: 'Above the line' },
  { id: 'btl',   label: 'Below the line — production' },
  { id: 'post',  label: 'Below the line — post' },
  { id: 'other', label: 'Below the line — other' }
];
const DEPT = new Map(DEPTS.map((d) => [d.id, d]));
export const deptOf = (id) => DEPT.get(id) || DEPT.get('other');

const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  return parseNum(v);
};
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);
const round2 = (n) => Math.round(n * 100) / 100;

/* ---- shapes ------------------------------------------------- */

export function blankExpense(patch = {}) {
  return {
    id: uid('x'), date: '', shootDay: 0, line: '', category: 'misc',
    amount: 0, gstPct: 0, vendor: '', gstin: '', paidBy: '', method: 'cash',
    note: '', receipt: '', createdAt: '', ...patch
  };
}
export function blankFloat(patch = {}) {
  return { id: uid('f'), date: '', to: '', amount: 0, method: 'cash', note: '', ...patch };
}
export function blankCrew(patch = {}) {
  return { feeType: 'day', fee: 0, days: '', tdsPct: 0, line: '', wageRow: '', note: '', ...patch };
}
export function blankPayment(patch = {}) {
  return { id: uid('p'), contactId: '', date: '', amount: 0, method: 'bank', note: '', ...patch };
}

/** Normalise what a person typed into a stored row. One place, so the
    parse happens once and the stored value is always a number. */
function cleanExpense(x) {
  const e = { ...blankExpense(), ...x };
  e.amount = Math.max(0, num(e.amount));
  e.gstPct = oneOf(Number(e.gstPct) || 0, GST_RATES, 0);
  e.shootDay = Math.max(0, parseInt(e.shootDay, 10) || 0);
  e.category = oneOf(e.category, CATEGORIES.map((c) => c.id), 'misc');
  e.method = oneOf(e.method, METHODS.map((m) => m.id), 'cash');
  for (const k of ['date', 'line', 'vendor', 'gstin', 'paidBy', 'note', 'receipt']) e[k] = String(e[k] || '').trim();
  e.gstin = e.gstin.toUpperCase();
  return e;
}
function cleanFloat(x) {
  const f = { ...blankFloat(), ...x };
  f.amount = Math.max(0, num(f.amount));
  f.method = oneOf(f.method, METHODS.map((m) => m.id), 'cash');
  for (const k of ['date', 'to', 'note']) f[k] = String(f[k] || '').trim();
  return f;
}
function cleanPayment(x) {
  const p = { ...blankPayment(), ...x };
  p.amount = Math.max(0, num(p.amount));
  p.method = oneOf(p.method, METHODS.map((m) => m.id), 'bank');
  for (const k of ['contactId', 'date', 'note']) p[k] = String(p[k] || '').trim();
  return p;
}
function cleanCrew(x) {
  const c = { ...blankCrew(), ...x };
  c.feeType = oneOf(c.feeType, ['day', 'lump'], 'day');
  c.fee = Math.max(0, num(c.fee));
  // '' means "derive it"; a typed number (0 included) is the person's word.
  c.days = (c.days === '' || c.days === null || c.days === undefined) ? '' : Math.max(0, num(c.days));
  c.tdsPct = Math.min(100, Math.max(0, Number(c.tdsPct) || 0));
  for (const k of ['line', 'wageRow', 'note']) c[k] = String(c[k] || '').trim();
  return c;
}

/* ---- storage ------------------------------------------------- */

const EMPTY = () => ({ expenses: [], floats: [], crew: {}, payments: [], lines: {}, settings: {}, wageOverrides: {}, versions: [] });
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Everything under the key, shape-guaranteed. Reading never writes. */
export function readAll() {
  let raw = null;
  try { raw = localStorage.getItem(COSTS_KEY); } catch (e) { /* private mode */ }
  if (!raw) return EMPTY();
  try {
    const p = JSON.parse(raw) || {};
    // An empty array is truthy; check the shape, never the truthiness.
    return {
      expenses: Array.isArray(p.expenses) ? p.expenses : [],
      floats: Array.isArray(p.floats) ? p.floats : [],
      crew: isObj(p.crew) ? p.crew : {},
      payments: Array.isArray(p.payments) ? p.payments : [],
      lines: isObj(p.lines) ? p.lines : {},
      settings: isObj(p.settings) ? p.settings : {},
      wageOverrides: isObj(p.wageOverrides) ? p.wageOverrides : {},
      versions: Array.isArray(p.versions) ? p.versions : []
    };
  } catch (e) {
    return EMPTY();
  }
}

/** Read-modify-write ONE collection: the others are left exactly as
    they were, the lesson of contacts.js's two collections. */
function writePart(name, value) {
  const before = readAll();
  const all = { ...before, [name]: value };
  /* The first money written here fixes the cost tabs' currency (see
     THE BUDGET'S CURRENCY below), so a later change of the film's
     region cannot relabel rupees as dollars. A blob that already held
     money before this field existed has none, and reads as INR. */
  if (!normaliseCurrency(all.settings.currency) && costsHasContent(all) && !costsHasContent(before)) {
    all.settings = { ...all.settings, currency: resolveCurrency({ calc: readCalc(), costs: before, project: projectCurrency() }) };
  }
  try { localStorage.setItem(COSTS_KEY, JSON.stringify(all)); return true; } catch (e) { return false; }
}

/* ---- expenses ----------------------------------------------- */
export const listExpenses = () => readAll().expenses.map(cleanExpense);
export function addExpense(patch) {
  const e = cleanExpense({ ...patch, id: undefined });
  e.id = blankExpense().id;
  if (!e.createdAt) e.createdAt = new Date().toISOString();
  writePart('expenses', [...readAll().expenses, e]);
  return e;
}
export function updateExpense(id, patch) {
  const list = readAll().expenses;
  const i = list.findIndex((x) => x && x.id === id);
  if (i < 0) return null;
  list[i] = cleanExpense({ ...list[i], ...patch, id });
  writePart('expenses', list);
  return list[i];
}
export function removeExpense(id) {
  const list = readAll().expenses;
  const gone = list.find((x) => x && x.id === id) || null;
  writePart('expenses', list.filter((x) => x && x.id !== id));
  return gone;
}
/** Undo of a removal: puts the exact row back where it was. */
export function restoreExpense(row, index) {
  if (!row || !row.id) return;
  const list = readAll().expenses.filter((x) => x && x.id !== row.id);
  list.splice(Math.min(Math.max(0, index | 0), list.length), 0, row);
  writePart('expenses', list);
}

/* ---- locked budget versions ---------------------------------- */
const cleanVersionLine = (l) => {
  const x = isObj(l) ? l : {};
  return { id: String(x.id ?? ''), name: String(x.name ?? ''), dept: String(x.dept ?? 'other'),
    days: num(x.days), rate: num(x.rate), estimate: num(x.estimate) };
};
function cleanVersion(v) {
  const x = isObj(v) ? v : {};
  return {
    id: String(x.id ?? ''), name: String(x.name ?? ''), note: String(x.note ?? ''),
    lockedAt: String(x.lockedAt ?? ''),
    estimate: num(x.estimate), atl: num(x.atl), btl: num(x.btl),
    contingency: num(x.contingency), grand: num(x.grand), days: num(x.days),
    lines: (Array.isArray(x.lines) ? x.lines : []).map(cleanVersionLine)
  };
}
/** The numbers worth freezing, from what the report already derived. PURE. */
export function snapshotBudget({ lines = [], report, days = 0 } = {}) {
  const rep = report || costReport({ lines: [] });
  const top = topSheet(rep);
  const d = Number(days);
  return {
    estimate: num(rep.totals && rep.totals.estimate), atl: top.atl, btl: top.btl,
    contingency: top.contingency, grand: top.grand,
    days: Number.isFinite(d) && d > 0 ? d : 0,
    lines: (Array.isArray(lines) ? lines : []).map((l) => ({
      id: l.id, name: l.name, dept: l.dept, days: num(l.days), rate: num(l.rate), estimate: num(l.estimate)
    }))
  };
}
export const listVersions = () => readAll().versions.map(cleanVersion);
/** Lock a snapshot. Immutable by construction: there is no update. */
export function lockVersion({ name, note, snapshot } = {}) {
  const list = readAll().versions;
  const v = {
    ...cleanVersion(snapshot || {}),                  // a copy, never an alias
    id: uid('v'),
    name: String(name || '').trim() || 'Budget v' + (list.length + 1),
    note: String(note || ''),
    lockedAt: new Date().toISOString()
  };
  writePart('versions', [...list, v]);
  return cleanVersion(v);
}
export function removeVersion(id) {
  const list = readAll().versions;
  const gone = list.find((x) => x && x.id === id) || null;
  writePart('versions', list.filter((x) => x && x.id !== id));
  return gone ? cleanVersion(gone) : null;
}
/** Undo of a removal: back at its position, idempotent on id. */
export function restoreVersion(row, index) {
  if (!row || !row.id) return;
  const list = readAll().versions.filter((x) => x && x.id !== row.id);
  list.splice(Math.min(Math.max(0, index | 0), list.length), 0, cleanVersion(row));
  writePart('versions', list);
}
/** A locked version against the budget as it stands. PURE, mutates nothing. */
export function compareVersion(version, lines = [], grandNow = null) {
  const v = cleanVersion(version);
  const now = (Array.isArray(lines) ? lines : []).map(cleanVersionLine).map((l) => ({ ...l, estimate: round2(l.days * l.rate) }));
  const nowIds = new Map(now.map((l) => [l.id, l]));
  const thenIds = new Map(v.lines.map((l) => [l.id, l]));
  const sumBy = (list) => { const m = new Map(); for (const l of list) m.set(l.dept, (m.get(l.dept) || 0) + l.estimate); return m; };
  const dThen = sumBy(v.lines), dNow = sumBy(now);
  const depts = [];
  for (const d of DEPTS) {
    const then = round2(dThen.get(d.id) || 0), nw = round2(dNow.get(d.id) || 0);
    if (then || nw) depts.push({ id: d.id, label: d.label, then, now: nw, delta: round2(nw - then) });
  }
  const changed = [];
  for (const l of now) {
    const o = thenIds.get(l.id);
    if (o && round2(o.estimate) !== l.estimate) changed.push({ id: l.id, name: l.name, then: round2(o.estimate), now: l.estimate, delta: round2(l.estimate - o.estimate) });
  }
  const tThen = round2(v.lines.reduce((s, l) => s + l.estimate, 0));
  const tNow = round2(now.reduce((s, l) => s + l.estimate, 0));
  return {
    total: { then: tThen, now: tNow, delta: round2(tNow - tThen) },
    // With contingency: the figure the card and the Lock button print.
    grand: grandNow === null ? null : { then: v.grand, now: round2(grandNow), delta: round2(grandNow - v.grand) },
    depts,
    lines: {
      added: now.filter((l) => !thenIds.has(l.id)),
      removed: v.lines.filter((l) => !nowIds.has(l.id)),
      changed
    }
  };
}

/* ---- floats -------------------------------------------------- */
export const listFloats = () => readAll().floats.map(cleanFloat);
export function addFloat(patch) {
  const f = cleanFloat({ ...patch });
  f.id = blankFloat().id;
  writePart('floats', [...readAll().floats, f]);
  return f;
}
export function removeFloat(id) {
  writePart('floats', readAll().floats.filter((x) => x && x.id !== id));
}

/* ---- crew and payments --------------------------------------- */
export function listCrew() {
  const out = {};
  for (const [id, rec] of Object.entries(readAll().crew)) out[id] = cleanCrew(rec);
  return out;
}
export function getCrew(contactId) { return cleanCrew(readAll().crew[contactId] || {}); }
export function setCrew(contactId, patch) {
  if (!contactId) return null;
  const crew = { ...readAll().crew };
  crew[contactId] = cleanCrew({ ...(crew[contactId] || {}), ...patch });
  writePart('crew', crew);
  return crew[contactId];
}
export function removeCrew(contactId) {
  const all = readAll();
  const crew = { ...all.crew };
  delete crew[contactId];
  writePart('crew', crew);
  writePart('payments', all.payments.filter((p) => p && p.contactId !== contactId));
}
export const listPayments = () => readAll().payments.map(cleanPayment);
export function addPayment(patch) {
  const p = cleanPayment(patch);
  p.id = blankPayment().id;
  writePart('payments', [...readAll().payments, p]);
  return p;
}
export function removePayment(id) {
  writePart('payments', readAll().payments.filter((x) => x && x.id !== id));
}

/* ---- line departments, settings, wage overrides --------------- */
/* A line's meta is { dept?, scales? }: either field alone is enough to
   keep the entry; with neither, the entry goes (back to derived). */
function writeLineMeta(lineId, patch) {
  const lines = { ...readAll().lines };
  const m = { ...(isObj(lines[lineId]) ? lines[lineId] : {}), ...patch };
  if (!m.dept || !DEPT.has(m.dept)) delete m.dept;      // back to the derived default
  if (typeof m.scales !== 'boolean') delete m.scales;
  if (Object.keys(m).length) lines[lineId] = m; else delete lines[lineId];
  writePart('lines', lines);
}
export function setLineDept(lineId, dept) {
  writeLineMeta(lineId, { dept: dept && DEPT.has(dept) ? dept : undefined });
}
/** true / false = the person's word on whether the line scales with
    shoot days; null clears it (undecided). */
export function setLineScales(lineId, value) {
  writeLineMeta(lineId, { scales: typeof value === 'boolean' ? value : undefined });
}
export function getSettings() {
  const s = readAll().settings;
  return { contingencyPct: Math.min(100, Math.max(0, Number(s.contingencyPct) || 0)), currency: normaliseCurrency(s.currency) };
}
export function setSettings(patch) {
  const s = { ...readAll().settings, ...patch };
  if ('contingencyPct' in patch) s.contingencyPct = Math.min(100, Math.max(0, num(patch.contingencyPct)));
  if ('currency' in patch) { s.currency = normaliseCurrency(patch.currency); if (!s.currency) delete s.currency; }
  writePart('settings', s);
}
export function setWageOverride(rowId, patch) {
  const all = { ...readAll().wageOverrides };
  const next = { ...(all[rowId] || {}), ...patch };
  for (const k of Object.keys(next)) {
    const v = next[k];
    if (v === '' || v === null || v === undefined) delete next[k];
    else if (k === 'bata' || k === 'callHours') next[k] = Math.max(0, num(v));
    else next[k] = String(v).trim();
  }
  if (Object.keys(next).length) all[rowId] = next; else delete all[rowId];
  writePart('wageOverrides', all);
}

/* ============================================================
   DERIVATIONS — pure, and none of them writes
   ============================================================ */

/* THE PRESET NAMES ARE NOT THE TABLE'S NAMES. Moved here from
   src/ui/budget.js, which still uses it for the rate hint: the cost
   report needs the same map to know which rate-card section a preset
   line sits in, and two copies of one map is the drift the trap list
   is about. Both JSON files are regenerated by `npm run extract`,
   which is why the map lives in code and not in either of them. */
export const PRESET_ROW = {
  'Blackmagic 6K Pro':         'Blackmagic Pocket 6K Pro',
  'Canon C500 II':             'Canon C500 Mark II',
  'Cooke S4 lens kit':         'Cooke S4/i (set)',
  'Atlas Anamorphic set':      'Atlas Orion Anamorphics (set)',
  'Vintage Lomo Anamorphic':   'Vintage Lomo Anamorphic (set)',
  'Sigma Cine Primes':         'Zeiss CP.3 / Sigma Cine Primes',
  'Angenieux Optimo zoom':     'Angenieux Optimo 24-290 zoom',
  'HMI 2.5K':                  'HMI 2.5K (with ballast, head)',
  'LED panel kit':             'LED panel kits (e.g. Litepanels, ARRI SkyPanel)',
  'Tungsten 5K':               'Tungsten 5K / 10K',
  'Tungsten 10K':              'Tungsten 5K / 10K',
  'Diffusion / flag kit':      'Diffusion / flag / negative kit',
  'Mini jib':                  'Mini jib (8-12 ft)',
  'Steadicam + operator':      'Steadicam rig + operator',
  'Gimbal (Ronin) + op':       'DJI Ronin 2 / RS3 Pro + op',
  'Drone + pilot':             'Drone (DJI Inspire 3) + pilot',
  'Sound recordist + kit':     'Production sound recordist + full kit',
  'Comtek/IFB':                'Comtek / IFB system',
  'Generator 30 KVA':          'Generator 30 KVA (with operator)',
  'Camera car':                'Camera car / track car',
  'DOP':                       'DOP (mid-level)',
  'Production Designer':       'Production Designer (mid)',
  'Costume Designer':          'Costume Designer (mid)',
  'Sound Designer':            'Sound Designer / Supervisor',
  'Focus Puller':              'Focus Puller / 1st AC',
  'Electrician (each)':        'Electrician / spot crew',
  'Sound mix studio (Atmos)':  'Atmos mix studio',
  'DI / color grade':          'Color grade (DI suite)',
  'VFX shot':                  'VFX (per shot, simple cleanup)'
};
export const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const PRESET_ROW_NORM = new Map(Object.entries(PRESET_ROW).map(([p, r]) => [norm(p), norm(r)]));
/** The rate table's own key for a line's name: a preset's row, else the name. */
export const rowKey = (name) => { const k = norm(name); return PRESET_ROW_NORM.get(k) || k; };

const SECTION_BY_ROW = (() => {
  const m = new Map();
  for (const sec of rates.sections || []) for (const r of sec.rows || []) if (!m.has(norm(r.item))) m.set(norm(r.item), sec.id);
  return m;
})();
/** The rate-card section a line's item sits in, or ''. */
export const sectionOf = (name) => SECTION_BY_ROW.get(rowKey(name)) || '';

/* Words first, section second. A keyword says what the line IS
   ("Lead actor fee" is cast wherever it was typed); a section only
   says which table the preset came from, and the crew table holds a
   production designer who belongs with art. Order matters: "music
   director" and "art director" are caught before "director". */
const KEYWORDS = [
  [/music|composer|\bmix|\bdi\b|grade|vfx|\bedit|dubbing|\bpost\b|subtitle|censor|dcp/, 'post'],
  [/art director|production designer|costume|make-?up|hair|wardrobe|\bart\b|set (build|work)|props?\b/, 'art'],
  [/(?<!line |executive line )producer/, 'producers'],
  [/writer|story|screenplay|dialogue|rights|script/, 'story'],
  [/\bactor|actress|\bcast\b|hero|heroine|artist|junior|extras?\b|villain|\blead\b/, 'cast'],
  // An assistant director is production staff, below the line; the
  // director is above it. Caught first, so "assistant director" never
  // reaches the bare /director/ rule.
  [/\bad\b|assistant director|production manager|line producer/, 'crew'],
  [/director(?! of photography)/, 'direction'],
  [/generator|\bvan\b|\bcar\b|vehicle|fuel|diesel|transport|travel|caravan/, 'transport'],
  [/\bdop\b|cinematograph|focus puller|camera|\blens/, 'camera'],
  [/gaffer|electrician|lighting|\blights?\b/, 'lighting'],
  [/location|permit|permission|\brent\b|venue/, 'locations'],
  [/food|catering|meal|batta|\bbata\b|\btea\b/, 'food'],
  [/sound|boom|comtek|ifb|recordist/, 'sound']
];
const SECTION_DEPT = {
  'camera-bodies': 'camera', 'lens-kits': 'camera', 'lighting-and-grip': 'lighting',
  'sound-and-power': 'sound', 'crew-daily-rates': 'crew', 'music-and-post': 'post'
};
/** The department a line belongs to when nobody has said otherwise. */
export function defaultDept(name) {
  const s = String(name || '').toLowerCase();
  for (const [re, dept] of KEYWORDS) if (re.test(s)) return dept;
  return SECTION_DEPT[sectionOf(name)] || 'other';
}

/** The department for a contact's own department name (contacts.js). */
export function deptForContact(department) {
  return ({ Cast: 'cast', Direction: 'direction', Camera: 'camera', Sound: 'sound', Art: 'art',
    Costume: 'art', Makeup: 'art', Production: 'crew', Post: 'post' })[department] || 'crew';
}
const CATEGORY_DEPT = { batta: 'food', food: 'food', transport: 'transport', location: 'locations', props: 'art', misc: 'other' };
export const deptForCategory = (cat) => CATEGORY_DEPT[cat] || 'other';

/** The estimator's lines, read from its own stored blob (never the DOM).
    Every row that names an item or carries a figure, in row order. */
export function estimateLines(calc, lineMeta = {}) {
  const blob = isObj(calc) ? calc : {};
  // A dollar estimate's "2m" is two million; a rupee one is parsed as it always was.
  const cur = normaliseCurrency(blob[CALC_CURRENCY]) || 'INR';
  const amt = (s) => parseAmount(s, cur);
  const ns = new Set();
  for (const k of Object.keys(blob)) { const m = k.match(/^ci_(\d+)_/); if (m) ns.add(+m[1]); }
  const out = [];
  for (const n of [...ns].sort((a, b) => a - b)) {
    const g = (f) => String(blob[`ci_${n}_${f}`] || '').trim();
    const item = g('item');
    const name = g('custom') || (item && item !== 'Other (custom)' ? item : '');
    // A negative day count or rate is not a price: it counts as nothing
    // (the estimator flags the field) rather than taking money off the budget.
    const days = Math.max(0, amt(g('days')));
    const rate = Math.max(0, amt(g('rate')));
    if (!name && !rate && !days) continue;
    const id = 'ci_' + n;
    const meta = lineMeta[id] || {};
    const dept = DEPT.has(meta.dept) ? meta.dept : defaultDept(name);
    out.push({ id, n, name: name || 'Line ' + n, days, rate, estimate: days * rate, dept, deptSet: DEPT.has(meta.dept),
      scales: typeof meta.scales === 'boolean' ? meta.scales : null });
  }
  return out;
}

/** Read the estimator's blob from storage. */
export function readCalc() {
  try { return JSON.parse(localStorage.getItem(CALC_KEY) || '{}') || {}; } catch (e) { return {}; }
}

/* ---- THE BUDGET'S CURRENCY (BUDGET-USD, 21 Oct 2026) -------------
   A budget is in rupees or in US dollars, and that is a fact about
   the BUDGET, stored inside the two records it already has — no new
   key: `ci_currency` in the estimator's blob (fms_library_calc_v1;
   every `ci_<n>_…` reader matches a digit after `ci_`, so none of
   them sees it) and `settings.currency` in fms_costs_v1.

   It is set ONCE, from the film's region (the currency currentProjectPrefs() would give), by
   the first write that puts money in the record — saveCalcData() in
   budget-model.js and writePart() above. After that a change of the
   film's region never converts or relabels it; only the budget page's
   deliberate switch does, and that changes the label alone.

   A record with money in it and no field is a budget from before the
   field existed. It is INR, read back exactly as it always was. */
export const CALC_CURRENCY = 'ci_currency';

/** Does the estimator's blob hold anything a person typed? */
export const calcHasContent = (calc) => isObj(calc) && Object.keys(calc).some((k) =>
  /^ci_\d+_/.test(k) && String(calc[k] == null ? '' : calc[k]).trim() !== '');

/** Does the costs record hold any money (expenses, floats, payments, crew)? */
export const costsHasContent = (all) => !!all &&
  ((all.expenses || []).length + (all.floats || []).length + (all.payments || []).length > 0
    || (isObj(all.crew) && Object.keys(all.crew).length > 0));

/** The budget's currency, pure: the estimator's stored word, then the
    cost record's, then INR for a budget that has money and no word
    (written before the field), then the film's currency for an empty
    one. */
export function resolveCurrency({ calc, costs, project } = {}) {
  const a = normaliseCurrency(isObj(calc) ? calc[CALC_CURRENCY] : '');
  if (a) return a;
  const b = normaliseCurrency(costs && isObj(costs.settings) ? costs.settings.currency : '');
  if (b) return b;
  if (calcHasContent(calc) || costsHasContent(costs)) return 'INR';
  return normaliseCurrency(project) || 'INR';
}

/** The open film's currency, from its region entry — what
    currentProjectPrefs().currency answers for an open film, worked out
    from region-core.js and the Store so this file does not import
    region.js. INR with no film open, or when it cannot say. */
export function projectCurrency() {
  try {
    const entry = Store.currentProject && Store.currentProject();
    return entry ? currencyForRegion(projectRegion(entry)) : 'INR';
  } catch (e) { return 'INR'; }
}

/** The open budget's currency, read from storage. Reading never writes. */
export const budgetCurrency = () => resolveCurrency({ calc: readCalc(), costs: readAll(), project: projectCurrency() });

/** The GST inside a tax-inclusive amount. */
export function gstSplit(amount, pct) {
  const gross = num(amount);
  const p = Number(pct) || 0;
  const tax = p > 0 ? round2(gross * p / (100 + p)) : 0;
  return { gross, tax, net: round2(gross - tax) };
}

/** What a crew payment cost the production, TDS included. */
export function paymentCost(amount, tdsPct) {
  const a = num(amount);
  const t = Math.min(99, Math.max(0, Number(tdsPct) || 0));
  const cost = t ? round2(a / (1 - t / 100)) : a;
  return { paid: a, tds: round2(cost - a), cost };
}

/** One person's identity key for the float ledger: a contact id or a typed name. */
const whoKey = (v) => String(v || '').trim().toLowerCase();

/**
 * Petty-cash balances: per person, money issued to them as floats less
 * what they paid out of it. A negative balance is money they put in
 * themselves and are owed back. Expenses with no `paidBy` came from the
 * office and touch no float.
 * @param nameOf (id) => display name, for a contact id
 */
export function floatBalances(floats, expenses, nameOf = (x) => x) {
  const rows = new Map();
  const at = (who) => {
    const k = whoKey(who);
    if (!rows.has(k)) rows.set(k, { who: String(who).trim(), name: nameOf(String(who).trim()) || String(who).trim(), issued: 0, spent: 0, count: 0 });
    return rows.get(k);
  };
  for (const f of floats) if (whoKey(f.to)) at(f.to).issued += num(f.amount);
  for (const e of expenses) if (whoKey(e.paidBy)) { const r = at(e.paidBy); r.spent += num(e.amount); r.count++; }
  const people = [...rows.values()].map((r) => ({ ...r, balance: round2(r.issued - r.spent) }))
    .sort((a, b) => b.issued - a.issued || a.name.localeCompare(b.name));
  const issued = people.reduce((s, r) => s + r.issued, 0);
  const spentFromFloats = people.filter((r) => r.issued > 0).reduce((s, r) => s + Math.min(r.spent, r.issued), 0);
  const office = expenses.filter((e) => !whoKey(e.paidBy)).reduce((s, e) => s + num(e.amount), 0);
  return {
    people,
    issued,
    spent: people.reduce((s, r) => s + r.spent, 0),
    inHand: round2(people.reduce((s, r) => s + Math.max(0, r.balance), 0)),
    owedBack: round2(people.reduce((s, r) => s + Math.max(0, -r.balance), 0)),
    spentFromFloats,
    office
  };
}

/* ---- days worked ---------------------------------------------- */

/** The names a cast contact might appear under in a scene's cast list:
    their own name, their role, and the role up to its first dash or
    bracket ("RAGAVAN — 'Dragon'" → "RAGAVAN"). */
export function castNames(contact) {
  const out = new Set();
  const add = (s) => { const t = String(s || '').trim().toLowerCase(); if (t) out.add(t); };
  add(contact && contact.name);
  const role = String((contact && contact.role) || '');
  add(role);
  add(role.split(/\s[—–-]\s|[(,/]/)[0]);
  return out;
}

/**
 * Days worked, DERIVED: for a cast member, the shoot days whose cast
 * list names them (the day out of days); for anyone else, the call
 * sheets they are called on. `days` is calendarDays() output.
 */
export function derivedDays(contact, days = [], callSheets = []) {
  if (!contact) return { days: 0, source: '' };
  if (contact.department === 'Cast') {
    const names = castNames(contact);
    const n = days.filter((d) => (d.cast || []).some((c) => names.has(String(c).trim().toLowerCase()))).length;
    if (n) return { days: n, source: 'schedule' };
  }
  const n = callSheets.filter((s) => s && s.calls && Object.prototype.hasOwnProperty.call(s.calls, contact.id)).length;
  return n ? { days: n, source: 'call sheets' } : { days: 0, source: '' };
}

/**
 * One person's account: what they are owed, what has been paid, what
 * is still due. `rec` is a crew record; `paid` their payments.
 */
export function crewAccount(rec, payments = [], derived = { days: 0, source: '' }) {
  const r = cleanCrew(rec || {});
  const entered = r.days !== '';
  const days = entered ? r.days : derived.days;
  const gross = r.feeType === 'lump' ? r.fee : r.fee * days;
  const tds = round2(gross * r.tdsPct / 100);
  const net = round2(gross - tds);
  const paid = payments.reduce((s, p) => s + num(p.amount), 0);
  return {
    feeType: r.feeType, fee: r.fee, tdsPct: r.tdsPct,
    days, daysSource: entered ? 'entered' : derived.source,
    gross, tds, net, paid,
    tdsOnPaid: payments.reduce((s, p) => s + paymentCost(p.amount, r.tdsPct).tds, 0),
    balance: round2(net - paid)
  };
}

/**
 * THE COST REPORT. Estimate against actual, per line and per
 * department, with contingency on top of the estimate. Everything is
 * derived from the arguments; nothing is read or written here.
 *
 *   lines     estimateLines() output
 *   expenses  listExpenses()
 *   crew      { contactId: crewRecord }
 *   payments  listPayments()
 *   contacts  listContacts() — for the department a crew payment
 *             falls in when its record names no line
 */
export function costReport({ lines = [], expenses = [], crew = {}, payments = [], contacts = [], contingencyPct = 0 } = {}) {
  const byLine = new Map(lines.map((l) => [l.id, { ...l, actual: 0, actualNet: 0, gst: 0, tds: 0, crewPaid: 0, spend: 0, count: 0 }]));
  // Spend with no line it still exists on — grouped by department, so
  // the money is visible in the right place and never dropped.
  const loose = new Map();
  const looseAt = (dept, kind) => {
    const k = dept + ':' + kind;
    if (!loose.has(k)) loose.set(k, { id: 'unbudgeted:' + k, name: kind === 'crew' ? 'Crew not on a budget line' : 'Spend not on a budget line', dept, estimate: 0, actual: 0, actualNet: 0, gst: 0, tds: 0, crewPaid: 0, spend: 0, count: 0, unbudgeted: true, days: 0, rate: 0 });
    return loose.get(k);
  };
  for (const e of expenses) {
    const s = gstSplit(e.amount, e.gstPct);
    const row = byLine.get(e.line) || looseAt(deptForCategory(e.category), 'spend');
    row.actual += s.gross; row.actualNet += s.net; row.gst += s.tax; row.spend += s.gross; row.count++;
  }
  const contactById = new Map(contacts.map((c) => [c.id, c]));
  for (const p of payments) {
    const rec = cleanCrew(crew[p.contactId] || {});
    const c = paymentCost(p.amount, rec.tdsPct);
    const contact = contactById.get(p.contactId);
    const row = byLine.get(rec.line) || looseAt(deptForContact(contact && contact.department), 'crew');
    row.actual += c.cost; row.actualNet += c.cost; row.tds += c.tds; row.crewPaid += c.paid; row.count++;
  }
  const finish = (r) => ({
    ...r,
    actual: round2(r.actual), actualNet: round2(r.actualNet), gst: round2(r.gst), tds: round2(r.tds),
    variance: round2(r.estimate - r.actual),
    pctUsed: r.estimate > 0 ? Math.round((r.actual / r.estimate) * 100) : (r.actual > 0 ? null : 0),
    over: r.actual > r.estimate + 0.005
  });
  const all = [...byLine.values(), ...loose.values()].map(finish);
  const sum = (list, k) => round2(list.reduce((s, r) => s + (r[k] || 0), 0));
  const depts = DEPTS.map((d) => {
    const rows = all.filter((r) => r.dept === d.id);
    return {
      ...d, lines: rows,
      estimate: sum(rows, 'estimate'), actual: sum(rows, 'actual'), actualNet: sum(rows, 'actualNet'),
      gst: sum(rows, 'gst'), tds: sum(rows, 'tds')
    };
  }).filter((d) => d.lines.length).map((d) => ({
    ...d, variance: round2(d.estimate - d.actual),
    pctUsed: d.estimate > 0 ? Math.round((d.actual / d.estimate) * 100) : (d.actual > 0 ? null : 0),
    over: d.actual > d.estimate + 0.005
  }));
  const estimate = sum(depts, 'estimate');
  const pct = Math.min(100, Math.max(0, Number(contingencyPct) || 0));
  const contingency = round2(estimate * pct / 100);
  const actual = sum(depts, 'actual');
  const withCont = round2(estimate + contingency);
  return {
    depts,
    over: all.filter((r) => r.over),
    totals: {
      estimate, contingencyPct: pct, contingency, estimateWithContingency: withCont,
      actual, actualNet: sum(depts, 'actualNet'), gst: sum(depts, 'gst'), tds: sum(depts, 'tds'),
      variance: round2(withCont - actual),
      pctUsed: withCont > 0 ? Math.round((actual / withCont) * 100) : 0,
      contingencyUsed: round2(Math.max(0, actual - estimate))
    }
  };
}

/** THE HEADER FIGURES: four numbers read off the cost report, nothing stored.
 *  approved     estimate plus contingency (the ceiling spend is judged against)
 *  actual       everything logged so far, GST-inclusive, crew at cost
 *  remaining    approved minus actual; negative means over, `over` says so
 *  contingency  the pool, how much of it overspend beyond the base estimate
 *               has eaten, and what is left */
export function budgetKpis(report) {
  const t = (report && report.totals) || {};
  const approved = round2(t.estimateWithContingency || 0);
  const actual = round2(t.actual || 0);
  const pool = round2(t.contingency || 0);
  const used = Math.min(pool, round2(t.contingencyUsed || 0));
  return {
    approved, actual,
    pctUsed: approved > 0 ? Math.round((actual / approved) * 100) : 0,
    remaining: round2(approved - actual),
    over: actual > Math.max(approved, 0) + 0.005,
    contingency: { pct: t.contingencyPct || 0, pool, used, left: round2(pool - used) }
  };
}

/** THE TOP SHEET: the cost report folded to departments and groups. */
export function topSheet(report) {
  const groups = GROUPS.map((g) => {
    const depts = report.depts.filter((d) => d.group === g.id && d.estimate);
    return { ...g, depts, estimate: round2(depts.reduce((s, d) => s + d.estimate, 0)), actual: round2(depts.reduce((s, d) => s + d.actual, 0)) };
  });
  const atl = groups.find((g) => g.id === 'atl').estimate;
  const btl = round2(groups.filter((g) => g.id !== 'atl').reduce((s, g) => s + g.estimate, 0));
  const t = report.totals;
  return {
    groups,
    atl, btl,
    subtotal: t.estimate,
    contingencyPct: t.contingencyPct, contingency: t.contingency,
    grand: t.estimateWithContingency,
    atlShare: t.estimate > 0 ? Math.round((atl / t.estimate) * 100) : 0
  };
}

/* ---- the wage table ---------------------------------------------- */

/** A wage row with the person's override on top; `overridden` says which fields. */
export function wageRows(table, overrides = {}) {
  const rows = [table.general, ...(table.rows || [])].filter(Boolean);
  return rows.map((r) => {
    const o = overrides[r.id] || {};
    return {
      ...r,
      bata: o.bata !== undefined ? o.bata : r.bata,
      callHours: o.callHours !== undefined ? o.callHours : (r.callHours ?? null),
      otRule: o.otRule !== undefined ? o.otRule : (r.otRule ?? null),
      published: { bata: r.bata, callHours: r.callHours ?? null, otRule: r.otRule ?? null },
      overridden: Object.keys(o)
    };
  });
}

/* ---- CSV, the Movie Magic-style export ---------------------------- */

const csvCell = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s;
};
export const toCSV = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/* A money column names its currency in a DOLLAR budget, so a $ sheet
   cannot be read as rupees. A rupee budget's headers are unchanged:
   a film with no region exports exactly what it always did. */
const moneyHead = (currency) => (h) => (currency === 'USD' ? h + ' (USD)' : h);

/**
 * The budget as an account-numbered sheet: Account, Description,
 * Amount, Units, Rate, Subtotal — the column set Movie Magic Budgeting
 * and its imitators read. A department header row carries its total;
 * each line is `<acct>-<nn>`. Contingency and the grand total close it.
 */
export function budgetCSV(report, currency) {
  const m = moneyHead(currency);
  const out = [['Account', 'Description', 'Amount', 'Units', m('Rate'), m('Subtotal')]];
  for (const d of report.depts) {
    const lines = d.lines.filter((l) => !l.unbudgeted);
    if (!lines.length) continue;
    out.push([d.acct, d.label.toUpperCase(), '', '', '', d.estimate]);
    lines.forEach((l, i) => {
      out.push([d.acct + '-' + String(i + 1).padStart(2, '0'), l.name, l.days, 'Days', l.rate, l.estimate]);
    });
  }
  const t = report.totals;
  out.push(['', 'SUBTOTAL', '', '', '', t.estimate]);
  out.push(['', 'CONTINGENCY', t.contingencyPct, '%', '', t.contingency]);
  out.push(['', 'GRAND TOTAL', '', '', '', t.estimateWithContingency]);
  return toCSV(out);
}

/** Actuals, one row per budget line (unbudgeted spend included). */
export function actualsCSV(report, currency) {
  const m = moneyHead(currency);
  const out = [['Account', 'Description', ...['Estimate', 'Actual (incl. GST)', 'Actual (excl. GST)', 'GST', 'TDS withheld', 'Variance'].map(m), '% used']];
  for (const d of report.depts) {
    d.lines.forEach((l, i) => {
      out.push([l.unbudgeted ? d.acct + '-UB' : d.acct + '-' + String(i + 1).padStart(2, '0'), l.name, l.estimate, l.actual, l.actualNet, l.gst, l.tds, l.variance, l.pctUsed === null ? '' : l.pctUsed]);
    });
    out.push([d.acct, d.label.toUpperCase() + ' TOTAL', d.estimate, d.actual, d.actualNet, d.gst, d.tds, d.variance, d.pctUsed === null ? '' : d.pctUsed]);
  }
  const t = report.totals;
  out.push(['', 'CONTINGENCY', t.contingency, '', '', '', '', '', '']);
  out.push(['', 'TOTAL', t.estimateWithContingency, t.actual, t.actualNet, t.gst, t.tds, t.variance, t.pctUsed]);
  return toCSV(out);
}

/** Every expense, for the accountant. */
export function expensesCSV(expenses, lineName = (x) => x, nameOf = (x) => x, currency) {
  const m = moneyHead(currency);
  const out = [['Date', 'Shoot day', 'Budget line', 'Category', m('Amount (incl. GST)'), 'GST %', m('GST'), 'Vendor', 'GSTIN', 'Paid by', 'Method', 'Note', 'Receipt']];
  for (const e of expenses) {
    const s = gstSplit(e.amount, e.gstPct);
    out.push([e.date, e.shootDay || '', e.line ? lineName(e.line) : '', (CATEGORIES.find((c) => c.id === e.category) || {}).label || e.category,
      s.gross, e.gstPct, s.tax, e.vendor, e.gstin, e.paidBy ? nameOf(e.paidBy) : '', (METHODS.find((m) => m.id === e.method) || {}).label || e.method, e.note, e.receipt]);
  }
  return toCSV(out);
}

/** A GSTIN's shape: 2 digits, 10-char PAN, entity, Z, check. Shape only. */
export const gstinLooksValid = (s) => /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(s || '').trim().toUpperCase());

export default {
  COSTS_KEY, CATEGORIES, METHODS, GST_RATES, TDS_RATES, DEPTS, GROUPS,
  readAll, listExpenses, addExpense, updateExpense, removeExpense, restoreExpense,
  listFloats, addFloat, removeFloat, listCrew, getCrew, setCrew, removeCrew,
  listPayments, addPayment, removePayment, setLineDept, setLineScales, snapshotBudget, listVersions, lockVersion, removeVersion, restoreVersion, compareVersion, getSettings, setSettings, setWageOverride,
  estimateLines, readCalc, CALC_CURRENCY, calcHasContent, costsHasContent, resolveCurrency, projectCurrency, budgetCurrency, gstSplit, paymentCost, floatBalances, derivedDays, crewAccount,
  costReport, budgetKpis, topSheet, wageRows, budgetCSV, actualsCSV, expensesCSV, gstinLooksValid,
  deptOf, defaultDept, sectionOf, deptForContact, deptForCategory, castNames, toCSV
};
