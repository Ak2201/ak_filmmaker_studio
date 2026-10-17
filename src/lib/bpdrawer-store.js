/* ============================================================
   BLUEPRINT DRAWER STORE — the guide drawer's read and merge-write
   ------------------------------------------------------------
   Moved out of src/ui/blueprint-drawer.js when the view and the logic
   were split (docs/ARCHITECTURE.md). The drawer reads the open
   project's blueprint blob, lays its pending answers over it and writes
   it back — through the proxy, so it is the open project's blob and the
   save is announced exactly as the blueprint page's own is.

   Deliberately NOT src/lib/blueprint-store.js's readFields/writeFields,
   though it is the same rule: the drawer keys by the blob's storage key
   (not by namespace) and has always accepted any stored object, and a
   moved function keeps its behaviour byte for byte.
   ============================================================ */
import { readText, writeText } from './prefs.js';

/** The stored blueprint blob under `key`, or {}. */
export function readBlueprintBlob(key) {
  try { const v = JSON.parse(readText(key, null) || '{}'); return v && typeof v === 'object' ? v : {}; }
  catch (e) { return {}; }
}

/** Read the blob, lay `pending` over it, write it back.
 *  @returns {boolean} whether the write went through (the proxy reports
 *  a refused write itself). */
export function mergeIntoBlueprintBlob(key, pending) {
  const blob = readBlueprintBlob(key);
  Object.assign(blob, pending);
  return writeText(key, JSON.stringify(blob));
}

export default { readBlueprintBlob, mergeIntoBlueprintBlob };
