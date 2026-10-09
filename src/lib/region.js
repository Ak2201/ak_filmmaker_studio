/* ============================================================
   REGION — India, or everywhere else
   ------------------------------------------------------------
   One fact about this browser: is the person at it making a film in
   India, or somewhere this studio has no verified figures for? It
   decides which modules the map offers and which India-specific
   numbers a page is willing to print. It decides NOTHING about money:
   there is one checkout and it settles in rupees.

   DETECTION IS PRIVACY-PRESERVING BY CONSTRUCTION, not by policy.
   `Intl.DateTimeFormat().resolvedOptions().timeZone` is a string the
   browser already holds; reading it makes NO NETWORK CALL, consults
   NO IP ADDRESS and leaves no trace anywhere. Nothing is sent, so
   there is nothing to disclose, nothing to store on a server and
   nothing a visitor has to consent to. An IP lookup would have been
   one line of code and a privacy policy paragraph.

   IT MATCHES TWO NAMES, AND THAT IS NOT BELT-AND-BRACES. The IANA
   zone was renamed Asia/Kolkata, but ICU still reports the old
   Asia/Calcutta alias on plenty of systems — including, measured on
   9 Oct 2026, the machine this app is developed on. Matching only
   the new name would have read the author's own desk as
   International, and every India-only module would have vanished
   from the one studio anybody was looking at. A legacy alias is not
   an edge case; it is the default on whichever platform never
   updated.

   THE USER'S CHOICE WINS, FOR EVER. Detection is a first guess and
   is consulted ONLY when nothing is stored. Once somebody has
   chosen, nothing re-detects — not a new time zone, not a trip, not
   a reinstall of the browser's locale data.

   WHAT IS STORED, AND WHAT IS NOT
   -------------------------------
   `fms_region_v1`, holding 'IN' or 'INT', written ONLY by an explicit
   choice. A detected answer is NOT persisted, and that is deliberate
   twice over:

     * the key then means exactly one thing — "the person said so" —
       so `chosenRegion()` can tell a guess from a decision without a
       second key or a wrapper object. A stored guess is
       indistinguishable from a stored choice a week later.
     * `npm run verify` asserts ZERO localStorage writes across four
       idle seconds, and a module that recorded its own first read
       would trip it the day it was imported into something that
       renders late. The command palette is forbidden the same thing
       for the same reason.

   It is read through `rawGet`/`rawSet` — NOT through the storage
   proxy — because it is DEVICE-WIDE. Which market you are in is a
   property of where you are sitting, not of the film on screen; a
   project-scoped region would mean one of your films is in India and
   the next one is not. It is not in `SCOPED_KEYS`, and must never be.

   It is in NO REGISTRY, and each absence is a decision:

     GLOBAL_KEYS (backup.js)  a backup file is how work crosses
                              machines and, exactly as often, borders.
                              Carrying the region in it would let a
                              file written in London flip a Chennai
                              studio to International on restore — and
                              the restoring browser had just detected
                              the right answer by itself. This is the
                              same reasoning that keeps the account id
                              and the Drive pointer out: a backup
                              carries WORK, never where the machine is.
     ALL_KEYS (hub.js)        reset erases work. The region is not
                              work, and wiping it would silently undo
                              a deliberate choice — an owner in India
                              who chose International would find
                              themselves back in India for having
                              deleted their projects. The theme and
                              the skin are out of that list for the
                              same reason, and ALL_KEYS lives in
                              hub.js, outside this change's files.
     the Supabase scope list  it never syncs; it is per device.

   Modelled on `fms_studio_theme_v1` throughout: same shape, same
   device scope, same registries (none).
   ============================================================ */
import Store, { rawGet, rawSet, rawRemove } from './store.js';

export const REGION_KEY = 'fms_region_v1';

/** The two markets, in the order the Settings control draws them. */
export const REGIONS = [
  { id: 'IN',  label: 'India',         line: 'Chennai rates, Indian festivals and the certification checks.' },
  { id: 'INT', label: 'International', line: 'The same studio without the India-only parts.' }
];
const VALID = REGIONS.map((r) => r.id);

/* Asia/Kolkata is the current IANA name; Asia/Calcutta is the alias
   several platforms still report. See the header — this is the line
   that would have mis-read the author's own machine. */
const IN_ZONES = /^Asia\/(Kolkata|Calcutta)$/;
/* IST is UTC+5:30, which getTimezoneOffset() reports as -330. Used
   ONLY when the zone name is unavailable (a browser without the
   Intl time-zone field, or one that throws). Not used as a primary
   signal: Sri Lanka shares +5:30. */
const IST_OFFSET = -330;

/** The guess, from nothing but what the browser already knows.
 *  Pure: no storage, no network, no side effect. */
export function detectRegion() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz) return IN_ZONES.test(tz) ? 'IN' : 'INT';
  } catch (e) { /* no Intl time zone: fall through to the offset */ }
  try { return new Date().getTimezoneOffset() === IST_OFFSET ? 'IN' : 'INT'; }
  catch (e) { return 'IN'; }
}

/** What the person CHOSE, or '' if they never have. The one way to
 *  tell a decision from a guess, which is why nothing writes a guess. */
export function chosenRegion() {
  try {
    const v = String(rawGet(REGION_KEY) || '').trim().toUpperCase();
    return VALID.includes(v) ? v : '';
  } catch (e) { return ''; }
}

/** 'IN' | 'INT'. The choice if there is one, otherwise the guess. */
export function region() { return chosenRegion() || detectRegion(); }

export const isIndia = () => region() === 'IN';

/**
 * Choose, permanently. Pass '' or null to go back to detection — the
 * only way the stored value is ever removed, and the reason Settings
 * can offer "use the guess again" without a second key.
 *
 * Returns the region in force afterwards. Notifies `region:changed`
 * only when it actually moved, so a view that re-renders on the event
 * is not re-rendered for a click that chose what was already true.
 */
export function setRegion(r) {
  const before = region();
  const want = String(r || '').trim().toUpperCase();
  if (want && !VALID.includes(want)) throw new Error('Unknown region "' + r + '".');
  try { if (want) rawSet(REGION_KEY, want); else rawRemove(REGION_KEY); }
  catch (e) { /* private mode: the choice holds for this page only */ }
  const now = region();
  if (now !== before) Store.notify('region:changed', now);
  return now;
}

export default { REGION_KEY, REGIONS, region, chosenRegion, detectRegion, setRegion, isIndia };
