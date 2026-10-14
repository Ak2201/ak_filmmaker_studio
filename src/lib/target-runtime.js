/* ============================================================
   THE FILM'S TARGET RUNNING TIME — src/lib/target-runtime.js
   ------------------------------------------------------------
   ONE field (owner, 14 Oct 2026, parity matrix bin C #13): the target
   the producer types on Reports ("Target running time, in minutes",
   `targetMinutes` inside the songs blob, src/lib/songs.js) is THE
   target. The Edit Log once stored its own (`targetMin` in
   fms_edit_v1); a value already there is read as a fallback so it is
   never dropped, but nothing here writes either field — the two pages
   that own them do. No new key.

   targetRuntime() -> { minutes, source }
     minutes  whole minutes, 0 when neither field holds one
     source   'reports' | 'edit' | ''
   ============================================================ */
import { getTargetMinutes } from './songs.js';
import { getTargetMin } from './editlog.js';

export function targetRuntime() {
  let m = 0;
  try { m = getTargetMinutes(); } catch (e) { m = 0; }
  if (m > 0) return { minutes: m, source: 'reports' };
  try { m = getTargetMin(); } catch (e) { m = 0; }
  if (m > 0) return { minutes: m, source: 'edit' };
  return { minutes: 0, source: '' };
}

/** "118 min under the target" / "4 min over the target" / "on target". */
export function targetDelta(estimateMin, targetMin) {
  if (!(targetMin > 0) || !(estimateMin >= 0)) return '';
  const d = Math.round(estimateMin - targetMin);
  if (d === 0) return 'on target';
  return Math.abs(d) + ' min ' + (d > 0 ? 'over' : 'under') + ' the target';
}

export default { targetRuntime, targetDelta };
