/* ============================================================
   VISITOR REGION — which lines a public page shows this visitor
   ------------------------------------------------------------
   REGION-CONTENT (docs/US-MARKET-PLAN.md §E). The public pages
   (start, pricing, product-*) load no store.js, so the device's own
   stated market (`fms_region_v1`, written only by Settings → Region)
   is read raw here; with nothing stated, the visitor guess of §B
   decides (time zone, then language, then offset — never a network
   call, never an IP). Reads only, never writes.

   WHY THE GUESS IS RESTATED HERE rather than imported from
   region-core.js guessVisitorRegion(). region-core.js sits in the
   `startlib` chunk, which EVERY page loads, and a function there costs
   first paint everywhere the moment anything calls it; on 21-22 Oct
   2026 the Library had about 500 bytes to spare under
   scripts/budget.json and calling guessVisitorRegion() from here put
   it over. This file is imported by the public pages alone, so its
   copy costs nothing in the app. `npm run test:region-content` asserts
   the two answer the same across the §B matrix; the day a public page
   calls guessVisitorRegion() anyway (PRICING-CLIENT's pricingCurrency()
   does), delete the copy and import it.
   ============================================================ */

const DEVICE_REGION_KEY = 'fms_region_v1';   // region.js REGION_KEY, restated (no store import)
const IN_ZONE = /^Asia\/(Kolkata|Calcutta)$/;
const NO_ZONE = /^(UTC|GMT|Etc\/.*|Universal|Zulu)$/i;

function own(v) {
  const s = String(v == null ? '' : v).trim().toUpperCase();
  return s === 'IN' || s === 'INDIA' ? 'IN' : (s === 'INT' || s === 'INTL' || s === 'INTERNATIONAL' ? 'INT' : '');
}

/** §B, restated: region-core.js guessVisitorRegion() with an `env`. */
export function guessHere(env) {
  const e = env || {};
  if (!env) {
    try { e.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (x) { /* no zone */ }
    try { const n = globalThis.navigator; e.languages = n ? Array.from(n.languages && n.languages.length ? n.languages : [n.language]).filter(Boolean) : []; } catch (x) { /* none */ }
    try { e.offset = new Date().getTimezoneOffset(); } catch (x) { /* none */ }
  }
  const tz = String(e.timeZone || '');
  if (tz && !NO_ZONE.test(tz)) return IN_ZONE.test(tz) ? 'IN' : 'INT';
  for (const tag of e.languages || []) {
    const m = /^[a-z]{2,3}(?:-[A-Za-z]{4})?-([A-Za-z]{2}|\d{3})\b/.exec(String(tag || ''));
    if (m) return m[1].toUpperCase() === 'IN' ? 'IN' : 'INT';
  }
  return e.offset === -330 ? 'IN' : 'INT';
}

/** 'IN' | 'INT' for the visitor on this page. `storage` and `env` are
 *  for tests; omitted, the browser's own are read. */
export function visitorRegion({ storage, env } = {}) {
  let chosen = '';
  try {
    const s = storage || globalThis.localStorage;
    chosen = own(s && s.getItem(DEVICE_REGION_KEY));
  } catch (e) { /* no storage: the guess decides */ }
  return chosen || guessHere(env);
}
