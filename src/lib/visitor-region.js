/* ============================================================
   VISITOR REGION — which lines a public page shows this visitor
   ------------------------------------------------------------
   REGION-CONTENT (docs/US-MARKET-PLAN.md §E). The public pages
   (start, pricing, product-*) load no store.js, so the device's own
   stated market (`fms_region_v1`, written only by Settings → Region)
   is read raw here; with nothing stated, region-core.js's local guess
   (time zone, then language, then offset — never a network call,
   never an IP) decides. Reads only, never writes.

   Imports region-core.js alone (pure, startlib), and nothing in CORE
   imports this file, so it can never pull the app onto a public page.
   ============================================================ */
import { guessVisitorRegion, normaliseRegion } from './region-core.js';

const DEVICE_REGION_KEY = 'fms_region_v1';   // region.js REGION_KEY, restated (no store import)

/** 'IN' | 'INT' for the visitor on this page. `storage` and `env` are
 *  for tests; omitted, the browser's own are read. */
export function visitorRegion({ storage, env } = {}) {
  let chosen = '';
  try {
    const s = storage || globalThis.localStorage;
    chosen = normaliseRegion(s && s.getItem(DEVICE_REGION_KEY));
  } catch (e) { /* no storage: the guess decides */ }
  return chosen || guessVisitorRegion(env);
}
