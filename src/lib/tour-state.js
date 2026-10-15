/* ============================================================
   TOUR STATE — where the onboarding tour is, as a model
   ------------------------------------------------------------
   Moved out of src/ui/tour.js when the view and the logic were split
   (docs/ARCHITECTURE.md). `fms_tour_v1` is in GLOBAL_KEYS (a backup
   carries it) and in the reset list (a wiped studio offers the tour
   again). Read freely; written only by a user action — the idle-write
   assertion in verify and prove:growth both hold the tour to that.

   The step count is a PARAMETER: the steps are content (src/data/
   tour.json), which the view loads.
   ============================================================ */
import { readText, writeText } from './prefs.js';

export const TOUR_KEY = 'fms_tour_v1';

/** A stored step, clamped to 0 … stepCount-1 (0 when not a number). */
export function clampStep(n, stepCount) {
  const i = parseInt(n, 10);
  return Number.isFinite(i) ? Math.max(0, Math.min(stepCount - 1, i)) : 0;
}

/** The tour's place; blocked or garbled storage reads as a fresh tour. */
export function readTourState(stepCount) {
  try {
    const t = JSON.parse(readText(TOUR_KEY, null) || 'null');
    if (t && typeof t === 'object' && !Array.isArray(t)) {
      return { active: !!t.active, step: clampStep(t.step, stepCount), dismissed: !!t.dismissed, finished: !!t.finished, hideList: !!t.hideList };
    }
  } catch (e) { /* blocked or garbled: a fresh tour */ }
  return { active: false, step: 0, dismissed: false, finished: false, hideList: false };
}

/** Lay `patch` over the stored place and write it back (private mode:
 *  the write is skipped and the tour still runs this page). */
export function writeTourState(patch, stepCount) {
  const next = { v: 1, ...readTourState(stepCount), ...patch };
  writeText(TOUR_KEY, JSON.stringify(next));
  return next;
}

export default { TOUR_KEY, clampStep, readTourState, writeTourState };
