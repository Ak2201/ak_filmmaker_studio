/* ============================================================
   REGION CORE — India or everywhere else, as PURE functions
   ------------------------------------------------------------
   docs/US-MARKET-PLAN.md §A and §B are the contract this implements.
   src/lib/region.js (CORE, imports store.js) re-exports everything here
   and adds the two things that need the store: the device's stored
   choice (`fms_region_v1`) and the per-project setter.

   IMPORT-FREE ON PURPOSE. start.html, pricing.html and the other public
   pages need the visitor guess to pick a currency, and they must not
   ship the app (the startlib trap in CLAUDE.md). vite.config.js puts
   this file in a chunk of its own, `region` — not `startlib`, which is
   on every page and would then carry the shop's guess and currency
   helpers into the Library's first paint (it did, on us/market, 22 Oct
   2026: 1.6 KB over scripts/budget.json). The day it imports anything,
   that stops being safe and nothing fails — keep it that way.

   THE TWO VALUES ARE 'IN' AND 'INT'. 'INT' is what `fms_region_v1`
   has held since 9 Oct 2026 (src/lib/region.js), so it is a value in a
   storage contract and is not respelt. 'INTL' and 'international' are
   READ as 'INT' (normaliseRegion), never written.

   THREE DIFFERENT QUESTIONS, kept apart on purpose:

     the DEVICE's market   `fms_region_v1` — which modules the map
                           offers (navmodel.js). Unchanged by this file.
     a PROJECT's region    the `region` field on its entry in
                           `fms_studio_projects_v1` — the film's
                           paperwork: currency, paper, dates, and the
                           India-only material inside that film's pages.
     the PRICING currency  what the shop quotes this visitor: their own
                           pick (`payCurrency` in fms_studio_prefs_v1),
                           else the device's chosen market, else the
                           guess. Never a network geo call.

   Nothing here writes on load. The only writer is writePayCurrency(),
   called from a click.
   ============================================================ */

export const REGION_IDS = ['IN', 'INT'];
export const CURRENCIES = ['INR', 'USD'];
export const PAPERS = ['A4', 'Letter'];

/* The prefs blob's name, restated rather than imported (import-free).
   It is GLOBAL_KEYS.studio_prefs in backup.js and ALL_KEYS on the hub
   already; `payCurrency` is one more field inside it, not a key. */
export const PREFS_KEY = 'fms_studio_prefs_v1';

/** 'IN' | 'INT' | '' for anything else. Accepts 'INTL' / 'international'
 *  as 'INT' so a hand-written value cannot land as a third region. */
export function normaliseRegion(v) {
  const s = String(v == null ? '' : v).trim().toUpperCase();
  if (s === 'IN' || s === 'INDIA') return 'IN';
  if (s === 'INT' || s === 'INTL' || s === 'INTERNATIONAL') return 'INT';
  return '';
}

export const normaliseCurrency = (v) => {
  const s = String(v == null ? '' : v).trim().toUpperCase();
  return CURRENCIES.includes(s) ? s : '';
};

/* Asia/Kolkata is the IANA name; Asia/Calcutta the alias ICU still
   reports on many systems (region.js's header has the measurement). */
const IN_ZONE = /^Asia\/(Kolkata|Calcutta)$/;
/* A zone that says nothing about where the person is: a server, a
   privacy-hardened browser (resistFingerprinting reports UTC), a VM. */
const NO_ZONE = /^(UTC|GMT|Etc\/.*|Universal|Zulu)$/i;
/* IST is UTC+5:30 = getTimezoneOffset() -330. Last resort only: Sri
   Lanka shares the offset. */
const IST_OFFSET = -330;

function browserEnv() {
  const env = { timeZone: '', languages: [], offset: null };
  try { env.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { /* no Intl zone */ }
  try {
    const nav = globalThis.navigator;
    if (nav) env.languages = (nav.languages && nav.languages.length ? Array.from(nav.languages) : [nav.language]).filter(Boolean);
  } catch (e) { /* no navigator */ }
  try { env.offset = new Date().getTimezoneOffset(); } catch (e) { /* no Date offset */ }
  return env;
}

/**
 * The visitor's region, from what the browser already holds. PURE when
 * `env` is passed ({ timeZone, languages, offset }); reads the browser
 * when it is not. No storage, no network.
 *
 *   1. a meaningful time zone DECIDES: Kolkata/Calcutta → IN, any other
 *      → INT. A diaspora browser in Dubai with `en-IN` is abroad and pays
 *      in dollars; a zone is where the machine is, a language is only
 *      who the person is.
 *   2. no zone, or a zone that says nothing (UTC, Etc/*): the first
 *      language with a region subtag decides (`en-IN`, `ta-IN` → IN; any
 *      other region → INT).
 *   3. still nothing: the UTC offset (-330 → IN).
 *   4. still nothing: INT.
 */
export function guessVisitorRegion(env) {
  const e = env || browserEnv();
  const tz = String(e.timeZone || '');
  if (tz && !NO_ZONE.test(tz)) return IN_ZONE.test(tz) ? 'IN' : 'INT';
  for (const tag of e.languages || []) {
    const m = /^[a-z]{2,3}(?:-[A-Za-z]{4})?-([A-Za-z]{2}|\d{3})\b/.exec(String(tag || ''));
    if (m) return m[1].toUpperCase() === 'IN' ? 'IN' : 'INT';
  }
  if (e.offset === IST_OFFSET) return 'IN';
  return 'INT';
}

export const currencyForRegion = (r) => (normaliseRegion(r) === 'INT' ? 'USD' : 'INR');

/**
 * Everything a page derives from a region. Stored nowhere.
 *   currency          'INR' | 'USD'
 *   paper             'A4' | 'Letter'
 *   dateStyle         'IN' (21 Oct 2026, 21/10/2026) | 'US' (Oct 21, 2026, 10/21/2026)
 *   locale            the Intl locale for numbers and dates
 *   showIndiaContent  CBFC, Tamil hints, rupee examples, the Chennai card
 * An unknown region reads as IN: the studio's behaviour before regions.
 */
export function regionPrefs(region) {
  const r = normaliseRegion(region) || 'IN';
  return r === 'INT'
    ? { region: 'INT', currency: 'USD', paper: 'Letter', dateStyle: 'US', locale: 'en-US', showIndiaContent: false }
    : { region: 'IN', currency: 'INR', paper: 'A4', dateStyle: 'IN', locale: 'en-IN', showIndiaContent: true };
}

/** A project's region from its entry: the `region` field, or 'IN' for
 *  an entry written before the field existed (nothing changes for the
 *  films people already have). */
export function projectRegion(entry) {
  return (entry && normaliseRegion(entry.region)) || 'IN';
}

/**
 * The prefs a page uses for one film. Two exceptions to plain
 * regionPrefs(projectRegion(entry)), both so nothing moves for a film
 * that predates regions:
 *   - an entry with NO region keeps showing or hiding India-only
 *     material by the DEVICE's market, which is what deliverables.js
 *     did before this file (isIndia()). Paperwork stays A4 / INR / IN.
 *   - `entry.paper` ('A4' | 'Letter'), when set, overrides the paper
 *     alone (a London film is INT and A4).
 */
export function projectPrefs(entry, deviceRegion) {
  const own = entry && normaliseRegion(entry.region);
  const p = regionPrefs(own || 'IN');
  if (!own) p.showIndiaContent = normaliseRegion(deviceRegion) !== 'INT';
  if (entry && PAPERS.includes(entry.paper)) p.paper = entry.paper;
  p.explicit = !!own;
  return p;
}

/** The region a NEW project is created with: the device's stated
 *  choice if there is one, else the guess. */
export function newProjectRegion({ chosen, guess } = {}) {
  return normaliseRegion(chosen) || normaliseRegion(guess) || guessVisitorRegion();
}

/**
 * The currency the shop quotes. The buyer's own pick on the purchase
 * page wins, then the device's chosen market, then the guess. This is
 * DISPLAY and the CHOICE of order currency only — the server prices
 * whichever currency is asked for (docs/US-MARKET-PLAN.md §C).
 */
export function pricingCurrency({ override, chosen, guess } = {}) {
  return normaliseCurrency(override)
    || currencyForRegion(normaliseRegion(chosen) || normaliseRegion(guess) || guessVisitorRegion());
}

function store(s) {
  if (s) return s;
  try { return globalThis.localStorage || null; } catch (e) { return null; }
}
function readPrefs(s) {
  try {
    const p = JSON.parse(store(s).getItem(PREFS_KEY) || '{}');
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch (e) { return {}; }
}

/** The buyer's own currency pick ('INR' | 'USD' | ''). */
export function readPayCurrency(storage) {
  return normaliseCurrency(readPrefs(storage).payCurrency);
}

/** Record the buyer's pick, merged into the prefs blob (never replacing
 *  it). '' clears it. ONLY on a click. Answers whether it stuck. */
export function writePayCurrency(cur, storage) {
  const s = store(storage);
  if (!s) return false;
  const want = normaliseCurrency(cur);
  if (cur && !want) return false;
  const p = readPrefs(s);
  if (want) p.payCurrency = want; else delete p.payCurrency;
  try { s.setItem(PREFS_KEY, JSON.stringify(p)); return true; } catch (e) { return false; }
}

/* ---- dates on paperwork --------------------------------------- */
const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;
/* A 'YYYY-MM-DD' is a DAY, not an instant: built at local noon so no
   zone can move it to the day before. */
function asDate(d) {
  if (d instanceof Date) return d;
  const m = DAY.exec(String(d || ''));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t;
}

/**
 * A date for paperwork, in the prefs' style.
 *   'long'    IN: 21 October 2026       US: October 21, 2026
 *   'medium'  IN: 21 Oct 2026           US: Oct 21, 2026
 *   'numeric' IN: 21/10/2026            US: 10/21/2026
 *   'weekday' IN: Wed, 21 Oct 2026      US: Wed, Oct 21, 2026
 * '' for something that is not a date.
 */
export function formatPaperDate(d, prefs, style = 'medium') {
  const t = asDate(d);
  if (!t) return '';
  const locale = (prefs && prefs.dateStyle === 'US') ? 'en-US' : 'en-IN';
  const opts = style === 'numeric' ? { day: '2-digit', month: '2-digit', year: 'numeric' }
    : style === 'long' ? { day: 'numeric', month: 'long', year: 'numeric' }
    : style === 'weekday' ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  try { return new Intl.DateTimeFormat(locale, opts).format(t); } catch (e) { return t.toDateString(); }
}

/* No default export on purpose: a default object keeps every function
   alive in every page's first paint (startlib is on all of them), where
   named imports let the bundler drop what a page never calls. */
