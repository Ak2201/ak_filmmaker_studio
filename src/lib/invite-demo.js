/* ============================================================
   INVITE DEMO — where a demo link's visitor is taken
   ------------------------------------------------------------
   An admin makes one standard invite code labelled "Demo" and copies
   invite.html#code=CODE&demo=1 (src/ui/gate-ui.js draws that). Whoever
   opens it is let in on the code alone, and `demo=1` says where to take
   them: the Dragon sample, opened on a device that has no film yet, and
   then the dashboard — or straight to the dashboard when the device
   already has films, which are never touched.

   sessionStorage only; nothing here is a stored key. The two names are
   the contract with sitegate.js, which reads `fms_demo_land` on the hub.
   ============================================================ */
import Store from './store.js';
import { session } from './prefs.js';

export const DEMO_PENDING_KEY = 'fms_demo_pending';
export const DEMO_LAND_KEY = 'fms_demo_land';

export function demoPending() { return session.readText(DEMO_PENDING_KEY) === '1'; }
export function markDemoPending() { session.writeText(DEMO_PENDING_KEY, '1'); }

/** Where a code-only visitor goes next. Returns the address. */
export function enterAddress() {
  if (!demoPending()) return 'index.html';
  session.removeKey(DEMO_PENDING_KEY);
  let n = 0;
  try { n = Store.listProjects().length; } catch (e) { n = 0; }
  if (n > 0) return 'dashboard.html';
  session.writeText(DEMO_LAND_KEY, '1');
  return 'index.html?sample=1';
}

export default { DEMO_PENDING_KEY, DEMO_LAND_KEY, demoPending, markDemoPending, enterAddress };
