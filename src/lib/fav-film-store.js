/* ============================================================
   FAVOURITE FILM — the device's demo choice, read without studies.js
   ------------------------------------------------------------
   src/ui/fav-film.js draws the picker before the case studies (about
   100 KB) have loaded, so it cannot ask studies.js favouriteSlug() yet.
   With no project open it falls back to the device's demo choice, which
   lives under studies.js's own key — read here, so the view never touches
   storage (docs/ARCHITECTURE.md). scripts/test-bible.mjs checks the key
   agrees with studies.js. Read only; studies.js selectDemo() writes it.

   Import-free apart from prefs.js, so it costs the picker nothing.
   ============================================================ */
import { readText } from './prefs.js';

export const DEMO_KEY = 'fms_studio_demo_v1';   // studies.js's key

/** The device's demo slug, or null when none is stored or storage is blocked. */
export function readDemoFavourite(key = DEMO_KEY) {
  return readText(key, null);
}

export default { DEMO_KEY, readDemoFavourite };
