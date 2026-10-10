/* ============================================================
   BLUEPRINT STORE — the merge-write for the two blueprint blobs
   ------------------------------------------------------------
   feature.js and short.js save by rebuilding their WHOLE blob from the
   fields on their page. Any other page that wrote the same blob that
   way would delete every answer it does not render. So everything
   outside those two pages reads and writes here: read the blob, change
   only the keys it was handed, write it back. Same rule as the
   drawer's flush() in src/ui/blueprint-drawer.js, extracted so the
   Story Bible and the stage guides share it.

   Through the storage proxy, on purpose: the keys are in SCOPED_KEYS,
   so this is always the OPEN project's blob, and the write is
   announced exactly as the blueprint page's own is.

   The keys and value conventions are a contract with saved work
   (CLAUDE.md invariant 1). Nothing here renames anything.
   ============================================================ */
import '../lib/store.js';

export const BLOBS = {
  feature: 'fms_filmmaker_combined_v1',
  /* steps 25–32 render under the `production` ns on feature.html and
     save into the same blob */
  production: 'fms_filmmaker_combined_v1',
  short: 'fms_shortfilm_blueprint_v1'
};

export function blobKey(ns) {
  const k = BLOBS[ns];
  if (!k) throw new Error('blueprint-store: unknown ns ' + ns);
  return k;
}

function readBlob(key) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch (e) { return {}; }
}

/** @returns {object} key → stored value ('' / false when absent). */
export function readFields(ns, keys) {
  const blob = readBlob(blobKey(ns));
  const out = {};
  for (const k of keys || []) out[k] = Object.prototype.hasOwnProperty.call(blob, k) ? blob[k] : '';
  return out;
}

/** Every stored value — for derivations (progress, AI context). */
export function readAll(ns) { return readBlob(blobKey(ns)); }

/** Lay `patch` over the stored blob and write it back. Keys not in
 *  `patch` are untouched — that is the whole point of this module.
 *  @returns {boolean} whether the write went through. */
export function writeFields(ns, patch) {
  if (!patch || typeof patch !== 'object') return false;
  const keys = Object.keys(patch);
  if (!keys.length) return true;
  const key = blobKey(ns);
  const blob = readBlob(key);
  for (const k of keys) blob[k] = patch[k];
  try { localStorage.setItem(key, JSON.stringify(blob)); return true; }
  catch (e) { return false; /* the proxy reports a refused write */ }
}

export default { BLOBS, blobKey, readFields, readAll, writeFields };
