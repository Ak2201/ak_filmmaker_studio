/* ============================================================
   HUB RESET — the studio-wide erase
   ------------------------------------------------------------
   The storage half of "Erase everything on this device" moved here from
   src/pages/hub/backup-menu.js. What to ask the person, the Drive file,
   the cloud pause and the wording stay with the Backup menu; this file
   only touches storage. The RESET list itself (ALL_KEYS) stays the
   page's, in src/pages/hub/all-keys.js, and is handed in.

   STUDIO-WIDE, NOT PROJECT-WIDE. store.js's proxy scopes every
   SCOPED_KEYS read and write to the OPEN project, so an erase that went
   through localStorage.getItem/removeItem by name would erase one film
   and call it everything (CLAUDE.md, "The storage proxy scopes
   studio-wide operations"). So, exactly as before:
     - every project in EVERY namespace: listAllProjects() is the
       caller's list, and purgeProjectEverywhere() its eraser;
     - every `fms_` key on disk, by its base name AND by its suffixed
       name (an orphan blob whose project is no longer listed), through
       rawRemove(), which bypasses the proxy;
     - every per-namespace open-project pointer (currentPointerKeys());
     - the private notes (`note_…`), by their own prefix.
   ============================================================ */
import Store from './store.js';
import { NOTE_PREFIX } from './backup.js';
import { keys as storedKeys, removeKey } from './prefs.js';
import { STUDIO_PREFS_KEY } from './hub-keys.js';

/* Kept through an erase: credentials and access, not work. The AI key
   (a credential), the account identity and the Supabase destination
   (erasing them signs the user out), the invite code and device
   session (the site gate would bounce a code-only visitor). The
   Supabase SESSION is `sb-*-auth-token`, never an `fms_` key, so the
   prefix sweep cannot touch it. */
export const KEEP_ON_ERASE = new Set([
  'fms_ai_key_v1', 'fms_studio_account_v1', 'fms_supabase_cfg_v1',
  'fms_invite_code_v1', 'fms_device_session_v1'
]);

/** Every project in every namespace — what an erase counts and erases. */
export function projectsToErase() {
  return Store.listAllProjects();
}

/**
 * Erase this device's studio: the storage half of "Erase everything".
 * Then pause cloud sync in the device prefs (cloudSync:'off') AFTER the
 * prefs wipe, so the next load neither pulls the account back nor
 * pushes the empty studio over it.
 * @param {object} o
 * @param {object[]} o.projects  projectsToErase(), read before any prompt
 * @param {string[]} o.allKeys   the reset list (ALL_KEYS, or [] from the band)
 */
export function eraseDeviceStorage({ projects, allKeys = [] }) {
  projects.forEach((p) => Store.purgeProjectEverywhere(p.id));
  const keys = new Set(allKeys);
  for (const k of storedKeys()) {
    if (!k || !k.startsWith('fms_')) continue;
    keys.add(k.replace(/__.*$/, ''));
    /* And the suffixed key itself: a blob whose project id is no longer
       in the list (an earlier orphan) is not reached by purging the
       listed projects, and removing only its base name leaves it — and
       its IndexedDB bytes — behind an "erases EVERYTHING". */
    if (k.includes('__')) keys.add(k);
  }
  keys.forEach((k) => { if (!KEEP_ON_ERASE.has(k)) Store.rawRemove(k); });
  Store.currentPointerKeys().forEach((k) => Store.rawRemove(k));
  const notes = [];
  for (const k of storedKeys()) {
    if (k && k.startsWith(NOTE_PREFIX)) notes.push(k);
  }
  notes.forEach((k) => removeKey(k));

  /* Pause cloud sync AFTER the prefs wipe. Signed in, an unpaused
     sync would pull the account's projects straight back or push the
     empty studio over them. Turning sync on again pulls them back. */
  try {
    let p = {};
    try { p = JSON.parse(Store.rawGet(STUDIO_PREFS_KEY) || '{}') || {}; } catch (e) { p = {}; }
    p.cloudSync = 'off';
    Store.rawSet(STUDIO_PREFS_KEY, JSON.stringify(p));
  } catch (e) { /* storage refused */ }
}

export default { KEEP_ON_ERASE, projectsToErase, eraseDeviceStorage };
