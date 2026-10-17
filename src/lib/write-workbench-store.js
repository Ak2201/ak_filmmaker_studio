/* ============================================================
   WORKBENCH STORE — the logline / beats / scratch notes per film
   ------------------------------------------------------------
   `fms_workbench_v1` holds ONE object for every film, keyed by the
   film's slug; src/ui/workbench.js owns one slot of it at a time.
   This module is the only place that reads or writes the key
   (docs/ARCHITECTURE.md, rule V1).
   ============================================================ */
import { readText, writeText } from './prefs.js';

export const WORKBENCH_KEY = 'fms_workbench_v1';

/* Everything on the way in is a type guard. An empty array is
   truthy and JSON on disk is whatever the last version wrote, so
   "it parsed" is not the same as "it is the shape I expect". */
export function readWorkbenchAll() {
  const raw = readText(WORKBENCH_KEY, null);
  if (typeof raw !== 'string' || !raw) return {};
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed;
}

/** Write the whole blob. Answers false when storage refused it (full
    or blocked), so the panel can say so. */
export function saveWorkbenchAll(all) {
  let raw;
  try { raw = JSON.stringify(all); } catch (e) { return false; }
  return writeText(WORKBENCH_KEY, raw);
}
