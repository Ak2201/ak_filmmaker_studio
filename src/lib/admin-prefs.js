/* ============================================================
   ADMIN PREFS — the console's one stored preference
   ------------------------------------------------------------
   Row density (comfortable | compact), on this browser only. The key is
   owned here; src/ui/admin-kit.js asks for the value and never touches
   storage itself (docs/ARCHITECTURE.md, rule V1). Written on prefs.js,
   so it goes through the same Storage.prototype as before and a storage
   that throws (a private window) answers the default instead.
   ============================================================ */
import { readText, writeText } from './prefs.js';

const DENSITY_KEY = 'fms_admin_density_v1';

/** 'compact' only when that is what was stored; anything else is 'comfortable'. */
export function readAdminDensity() {
  return readText(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable';
}

/** Remember the choice. False when this browser would not keep it. */
export function saveAdminDensity(density) {
  return writeText(DENSITY_KEY, density);
}

export default { readAdminDensity, saveAdminDensity };
