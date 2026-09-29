/* ============================================================
   THE FESTIVAL SUBMISSION MODEL
   ------------------------------------------------------------
   src/data/festivals.json is a CATALOGUE: eighteen festivals, what
   they want, roughly when. It is reference copy and it is the same
   for every user. This file is the other half — what THIS filmmaker
   did about them: which ones they are targeting, what they sent and
   when, what it cost, and what came back.

   One representation per thing (CLAUDE.md's trap list). A submission
   stores the catalogue entry's `name` as its `festival` and nothing
   else from it: no copied description, no copied fee range, no
   copied deadline text. Copy the deadline onto the submission and
   the day the catalogue is corrected the tracker keeps warning
   about the wrong date. The one date a submission does own is the
   deadline the USER typed, because a real deadline is a real date
   and "~Feb each year" is not one.

   STORAGE CONTRACT. `fms_festivals_v1` is a NEW key, and a new
   key has to be registered in four places or it silently misbehaves:
     1. SCOPED_KEYS in src/lib/store.js  — namespaced per project
     2. PROJECT_KEYS in src/pages/hub.js — included in backups
     3. ALL_KEYS in src/pages/hub.js     — cleared by reset
     4. the scope check in supabase-schema.sql — allowed to sync
   Miss #2 and a filmmaker's whole submission campaign is absent
   from the file that calls itself a full studio backup. That exact
   bug has already happened in this repo once, to the crew list.

   ONE KEY, TWO COLLECTIONS — the submissions, and the campaign's
   own premiere decision, which is a fact about the film rather than
   about any one festival and has nowhere else to live.

   THE PREMIERE RULE IS THE POINT.
   The short blueprint's standing advice is: never online-premiere
   before a top-tier rejection. Posting to YouTube or Vimeo is a
   world premiere, and a world premiere disqualifies you from every
   festival that requires one — which is every Tier 1 on the list.
   A tracker that lets someone schedule an online release while six
   premiere-holding submissions are still undecided, and says
   nothing, is worse than no tracker: it has made the mistake look
   organised. `premiereConflicts()` below is that check, and the
   page renders it whether or not the user asked.

   Dates are the plain 'YYYY-MM-DD' an <input type="date"> hands
   back. No Date objects in storage: a deadline is a date on a
   calendar, not an instant, and round-tripping it through a
   timezone is how it ends up a day out.
   ============================================================ */
import './store.js';
import catalogue from '../data/festivals.json';
import checks from '../data/festivals.checks.json';

export const FESTIVALS_KEY = 'fms_festivals_v1';

/* The life of a submission, in order. `live` means the festival is
   still holding a claim on your premiere; `decided` means an answer
   came back. They are not opposites — SELECTED is both. */
export const STATUSES = [
  { id: 'target',      label: 'Targeting',      live: false, decided: false },
  { id: 'submitted',   label: 'Submitted',      live: true,  decided: false },
  { id: 'competition', label: 'In competition', live: true,  decided: false },
  { id: 'selected',    label: 'Selected',       live: true,  decided: true  },
  { id: 'rejected',    label: 'Rejected',       live: false, decided: true  },
  { id: 'withdrawn',   label: 'Withdrawn',      live: false, decided: true  }
];

const STATUS_BY_ID = new Map(STATUSES.map((s) => [s.id, s]));
export const statusMeta = (id) => STATUS_BY_ID.get(id) || STATUSES[0];

export const CURRENCIES = ['USD', 'INR'];

const uid = () =>
  (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'fs_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

/* ---- the catalogue, as the tracker needs to read it ---------
   Two files, one reading. festivals.json is the 2023 blueprint's
   own list, and `npm run extract` rewrites it byte-for-byte from
   legacy/ on every run — so a date checked in 2026 cannot be stored
   there; the next extraction would delete it without saying so.
   festivals.checks.json is the hand-maintained overlay that holds
   the verification, and this function is the only place the two are
   put together. Downstream code sees one entry with a `check` on it.

   `premiereRequired` is DERIVED, not a second field in the JSON:
   a festival requires a premiere exactly when the catalogue states
   a premiere rule for it. Storing the boolean too would be the
   same thing written twice, and the two would eventually disagree. */
export const CHECKED_ON = checks.lastChecked || '';

export function catalogueEntries() {
  const byName = checks.festivals || {};
  return (catalogue.festivals || []).map((f) => ({
    ...f,
    premiereRequired: !!f.premiereRule,
    check: byName[f.name] || { status: 'not-checked' }
  }));
}

export function catalogueEntry(name) {
  return catalogueEntries().find((f) => f.name === name) || null;
}

/**
 * The next deadline a checked festival actually has, as a date —
 * the soonest one strictly after `fromISO`. Returns null when the
 * festival was not checked, or when every checked deadline has
 * already gone: seeding a row with a date in the past would have
 * the tracker open shouting about a deadline nobody chose.
 */
export function nextCheckedDeadline(name, fromISO = todayISO()) {
  const entry = catalogueEntry(name);
  const list = (entry && entry.check && entry.check.deadlines) || [];
  if (!Array.isArray(list)) return null;
  const future = list
    .filter((d) => d && d.date && d.date > fromISO)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return future[0] || null;
}

/** A submission with every field present, so callers never guard. */
export function blankSubmission(patch = {}) {
  return {
    id: uid(),
    festival: '',      // the catalogue `name`, or anything the user types
    tier: 0,           // 1/2/3 from the catalogue, 0 for a festival not on it
    premiereRequired: false,
    status: 'target',
    deadline: '',      // YYYY-MM-DD — the real one, that the user looked up
    submittedOn: '',
    resultOn: '',
    fee: '',           // as typed; parsed with money.js, never re-parsed here
    currency: 'USD',
    notes: '',
    ...patch
  };
}

/** Seed a submission from a catalogue entry, carrying nothing that
    the catalogue can change out from under it except the name — and
    a deadline, but ONLY a real dated one that was verified and has
    not passed. The blueprint's "~Feb each year" is not a date and is
    never copied here: a tracker that counts down to an approximation
    is making something up, and the user would have no way to tell. */
export function fromCatalogue(name) {
  const entry = catalogueEntry(name);
  const next = nextCheckedDeadline(name);
  return blankSubmission({
    festival: name,
    tier: entry ? entry.tier : 0,
    premiereRequired: entry ? entry.premiereRequired : false,
    deadline: next ? next.date : '',
    notes: next ? `${next.label} (checked ${CHECKED_ON})` : ''
  });
}

/** The campaign's own premiere decision. */
export function blankPremiere(patch = {}) {
  return { onlineDate: '', note: '', ...patch };
}

/* ---- persistence ------------------------------------------- */

function readAll() {
  let raw = null;
  try { raw = localStorage.getItem(FESTIVALS_KEY); } catch (e) { /* private mode */ }
  const empty = { submissions: [], premiere: blankPremiere() };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) || {};
    return {
      // An empty array is truthy. Check Array.isArray, or a returning
      // user gets a table with no rows and no way to add one.
      submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
      premiere: blankPremiere(parsed.premiere && typeof parsed.premiere === 'object'
        ? parsed.premiere : {})
    };
  } catch (e) {
    return empty;
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(FESTIVALS_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function listSubmissions() {
  return readAll().submissions.map((s) => ({ ...blankSubmission(), ...s }));
}

/** Read-modify-write: the two collections share one key, and a naive
    whole-blob write drops whichever one the caller wasn't holding. */
export function saveSubmissions(submissions) {
  const all = readAll();
  return writeAll({ ...all, submissions });
}

export function addSubmission(patch) {
  const list = listSubmissions();
  const row = blankSubmission(patch);
  list.push(row);
  saveSubmissions(list);
  return row;
}

export function updateSubmission(id, patch) {
  const list = listSubmissions();
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, id };
  saveSubmissions(list);
  return list[i];
}

export function removeSubmission(id) {
  const list = listSubmissions();
  const next = list.filter((s) => s.id !== id);
  if (next.length === list.length) return false;
  saveSubmissions(next);
  return true;
}

export function getPremiere() {
  return readAll().premiere;
}

export function savePremiere(patch) {
  const all = readAll();
  const premiere = blankPremiere({ ...all.premiere, ...patch });
  writeAll({ ...all, premiere });
  return premiere;
}

/* ---- dates -------------------------------------------------
   'YYYY-MM-DD' compares correctly as a string, which is most of
   why the format is worth keeping. Only the day COUNT needs real
   arithmetic, and it is done in UTC on purpose: both operands are
   built the same way, so the difference is exact whole days and
   never 23 or 25 hours across a DST boundary. */

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function todayISO(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Whole days from `fromISO` to `isoDate`. Negative = already past. */
export function daysUntil(isoDate, fromISO = todayISO()) {
  const a = ISO.exec(String(isoDate || ''));
  const b = ISO.exec(String(fromISO || ''));
  if (!a || !b) return null;
  const ms = Date.UTC(+a[1], +a[2] - 1, +a[3]) - Date.UTC(+b[1], +b[2] - 1, +b[3]);
  return Math.round(ms / 86400000);
}

/** "in 12 days" / "tomorrow" / "today" / "8 days ago". */
export function relativeDays(n) {
  if (n === null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

/* ---- what the tracker is for ------------------------------- */

/**
 * The soonest deadline still worth acting on: a dated submission
 * that has not been sent and has not been abandoned. A deadline on
 * a festival you already submitted to is history, not a warning.
 */
export function nextDeadline(list = listSubmissions(), fromISO = todayISO()) {
  const open = list
    .filter((s) => s.deadline && s.status === 'target')
    .map((s) => ({ submission: s, days: daysUntil(s.deadline, fromISO) }))
    .filter((d) => d.days !== null)
    .sort((a, b) => a.days - b.days);
  if (!open.length) return null;
  // A deadline already gone is the more urgent news, so past ones sort
  // first and are returned as-is rather than skipped.
  return open[0];
}

/** Every dated, unsent target, soonest first — past ones included. */
export function upcomingDeadlines(list = listSubmissions(), fromISO = todayISO()) {
  return list
    .filter((s) => s.deadline && s.status === 'target')
    .map((s) => ({ submission: s, days: daysUntil(s.deadline, fromISO) }))
    .filter((d) => d.days !== null)
    .sort((a, b) => a.days - b.days);
}

/** Submissions still holding a claim on the film's premiere. */
export function premiereHolders(list = listSubmissions()) {
  return list.filter((s) =>
    s.premiereRequired && !statusMeta(s.status).decided);
}

/**
 * THE RULE THE BLUEPRINT ALREADY TEACHES, enforced.
 *
 * Returns the reasons an online premiere would cost the filmmaker
 * something, given what is on the board right now. An empty array
 * means the coast is clear — which is itself worth saying, because
 * "no warning" and "not checked" look identical on a screen.
 */
export function premiereConflicts(
  list = listSubmissions(), premiere = getPremiere(), fromISO = todayISO()
) {
  const out = [];
  const holders = premiereHolders(list);
  if (!holders.length) return out;

  const names = holders.map((s) => s.festival || 'an untitled entry');
  const undecided = holders.filter((s) => !statusMeta(s.status).decided
                                       && s.status !== 'target');

  if (premiere.onlineDate) {
    const days = daysUntil(premiere.onlineDate, fromISO);
    out.push({
      level: 'danger',
      code: 'online-premiere-scheduled',
      text: `An online premiere is set for ${premiere.onlineDate} (${relativeDays(days)}), `
          + `and ${holders.length} premiere-requiring ${holders.length === 1 ? 'festival has' : 'festivals have'} `
          + `not answered yet: ${names.join(', ')}. Posting the film online is a world `
          + `premiere and disqualifies every one of them. Wait for the rejections.`
    });
  } else {
    out.push({
      level: 'warn',
      code: 'premiere-held',
      text: `${holders.length} premiere-requiring ${holders.length === 1 ? 'festival is' : 'festivals are'} `
          + `still open: ${names.join(', ')}. Do not post the film anywhere public — `
          + `not YouTube, not Vimeo, not a password-free link — until they have said no.`
    });
  }

  if (undecided.length && undecided.length < holders.length) {
    out.push({
      level: 'warn',
      code: 'targets-not-sent',
      text: `${holders.length - undecided.length} premiere-requiring `
          + `${holders.length - undecided.length === 1 ? 'festival is' : 'festivals are'} `
          + `still only a target. Submit or drop them — an unsent target holds your `
          + `premiere in your own head and nowhere else.`
    });
  }
  return out;
}

/** Counts by status id, every status present (a zero is information). */
export function statusCounts(list = listSubmissions()) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s.id, 0]));
  for (const s of list) {
    if (counts[s.status] === undefined) counts[s.status] = 0;
    counts[s.status]++;
  }
  return counts;
}

export default {
  FESTIVALS_KEY, STATUSES, CURRENCIES, statusMeta,
  catalogueEntries, catalogueEntry, blankSubmission, fromCatalogue,
  listSubmissions, saveSubmissions, addSubmission, updateSubmission,
  removeSubmission, getPremiere, savePremiere, blankPremiere,
  todayISO, daysUntil, relativeDays,
  nextDeadline, upcomingDeadlines, premiereHolders, premiereConflicts,
  statusCounts
};
