/* ============================================================
   WHERE FILMS ARE KEPT — the console's calls (schema §66)
   ------------------------------------------------------------
   The view (src/ui/storage-admin.js) asks; this calls, through
   cloud-api.js, as docs/ARCHITECTURE.md V2 requires. Same shape as
   coedit-api.js.
     readStorageMode()     → { mode: 'supabase'|'drive', missing }
                             missing: §66 has not run (reads as supabase,
                             the side that changes nothing)
     setStorageMode(mode)  → the mode as the server now holds it
     storageOverview()     → counts only (admin_storage_overview), or null
                             when §66 has not run
   ============================================================ */
import { rpc } from './cloud-api.js';

export const STORAGE_MODES = ['supabase', 'drive'];
const isMissing = (e) => !!e && (e.code === 'PGRST202' || e.code === '42883' || /Could not find|does not exist/i.test(String(e.message || '')));

/** 'drive' only when the server says exactly that; anything else is the
 *  existing path. The client fails TOWARD supabase, never toward drive. */
export const normaliseMode = (v) => (v === 'drive' ? 'drive' : 'supabase');

export async function readStorageMode() {
  const { data, error } = await rpc('get_storage_mode');
  if (error) {
    if (isMissing(error)) return { mode: 'supabase', missing: true };
    throw new Error(error.message || 'The storage mode could not be read.');
  }
  return { mode: normaliseMode(data), missing: false };
}

export async function setStorageMode(mode) {
  if (!STORAGE_MODES.includes(mode)) throw new Error('The storage mode is supabase or drive.');
  const { data, error } = await rpc('admin_set_storage_mode', { p_mode: mode });
  if (error) throw new Error(error.message || 'The storage mode was not changed.');
  return normaliseMode(data);
}

export async function storageOverview() {
  const { data, error } = await rpc('admin_storage_overview');
  if (error) {
    if (isMissing(error)) return null;
    throw new Error(error.message || 'The storage overview could not be read.');
  }
  return data && typeof data === 'object' ? data : null;
}

export default { STORAGE_MODES, normaliseMode, readStorageMode, setStorageMode, storageOverview };
