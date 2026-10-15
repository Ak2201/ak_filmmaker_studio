/* ============================================================
   WRITE PREFS — the screenplay pages' per-device settings
   ------------------------------------------------------------
   The view (src/ui/format-guide.js, focus-mode.js, and through
   format-guide's re-exports beat-guide.js and tamil-type.js, and
   src/pages/screenplay.js) never touches storage itself
   (docs/ARCHITECTURE.md, rule V1). It asks here.

   ONE blob, `fms_write_prefs_v1`, shared by several owners — the
   keyboard preset (write-keys.js), the format guide's level, focus
   mode's marker, Tamil typing, the hint strip. So every write is a
   READ, MERGE, WRITE: an owner changes only its own fields and the
   others ride along untouched.

   And one per-TAB list, `fms_write_guide_dismissed`, in
   sessionStorage: the format-guide rules dismissed this session.

   Built on prefs.js, which goes through the same Storage.prototype
   the app always used, so nothing about scoping changes. A failed
   write (private mode, quota) is answered, never thrown — exactly
   what the try/catch around each original write did.
   ============================================================ */
import { readJSON, writeJSON, session } from './prefs.js';

export const WRITE_PREFS_KEY = 'fms_write_prefs_v1';
export const GUIDE_DISMISSED_KEY = 'fms_write_guide_dismissed';

/** The whole blob, as a plain object ({} when absent, unreadable or
    not an object). */
export function readWritePrefs() {
  const v = readJSON(WRITE_PREFS_KEY, {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

/** Merge `patch` into the blob and write it. Answers the merged blob
    (what the caller now holds), whether or not the write landed. */
export function writeWritePrefs(patch) {
  const next = Object.assign(readWritePrefs(), patch);
  writeJSON(WRITE_PREFS_KEY, next);
  return next;
}

/* ---- the hint strip (screenplay.html) ------------------------ */
/** Hints are on unless the writer turned them off (`hints: false`). */
export function writeHintsOn() {
  return readWritePrefs().hints !== false;
}
/** Off is stored as `hints: false`; on removes the field. */
export function setWriteHints(on) {
  const all = readWritePrefs();
  if (on) delete all.hints; else all.hints = false;
  writeJSON(WRITE_PREFS_KEY, all);
}

/* ---- the format guide's dismissed rules, this tab only ------- */
/** The stored list (whatever it parsed to; [] when absent or bad). */
export function readGuideDismissed() {
  return session.readJSON(GUIDE_DISMISSED_KEY, []);
}
export function saveGuideDismissed(ids) {
  return session.writeJSON(GUIDE_DISMISSED_KEY, Array.from(ids));
}
