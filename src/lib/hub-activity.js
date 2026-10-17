/* ============================================================
   HUB ACTIVITY — the studio's activity log, and "when was this last
   backed up", as a model
   ------------------------------------------------------------
   The log (`fms_studio_activity_v1`, scoped per project by store.js's
   proxy) used to be read and written in five places: hub.js, the
   Backup menu, the activity log view, the dashboard and the status bar.
   They read it here now; the key name lives in src/lib/hub-keys.js.

   Behaviour is byte for byte what each caller did: same key, same JSON
   shape `{ entries: [{ts, where, what, url}], lastSnap }`, same thirty-
   line cap with the newest backup line kept past it. Everything goes
   through src/lib/prefs.js, which uses the same Storage.prototype the
   app always used, so the project proxy still scopes the key.

   Light on purpose (prefs.js and hub-keys.js only): the Backup menu and
   the status bar import this on every page.
   ============================================================ */
import { readText, writeText, readJSON, writeJSON } from './prefs.js';
import { ACTIVITY_KEY, DRIVE_STATE_KEY_COPY, FEATURE_URL, SHORT_URL, LIBRARY_URL } from './hub-keys.js';

export const ACTIVITY_LIMIT = 30;

const isBackupLine = (e) => e && /^Exported full studio backup/.test(String(e.what || ''));

/** A stored JSON object, or {} — the hub's old parseStorage(): an
 *  absent or unparseable value reads as {}, a stored `null` as null. */
export function readStoredObject(key) {
  return readJSON(key, {});
}

/** The whole log object (may carry `lastSnap`). */
export function readActivityLog() {
  return readStoredObject(ACTIVITY_KEY);
}

/** The log's entries, newest first. */
export function activityEntries() {
  const log = readActivityLog();
  return Array.isArray(log.entries) ? log.entries : [];
}

/** Write the whole log object back. @returns {boolean} */
export function saveActivityLog(log) {
  return writeJSON(ACTIVITY_KEY, log);
}

/* The newest "Exported full studio backup" line is how the Backup menu
   (src/ui/topbar-backup.js) knows when you last backed up. The log holds
   thirty lines, so a backup followed by thirty edits would otherwise fall
   off the end and the menu would claim you had never made one. The newest
   backup line is kept past the cap; it is one line, and it is a fact. */
export function capLog(arr) {
  const kept = arr.slice(0, ACTIVITY_LIMIT);
  if (!kept.some(isBackupLine)) {
    const old = arr.slice(ACTIVITY_LIMIT).find(isBackupLine);
    if (old) kept.push(old);
  }
  return kept;
}

/** The hub's log write: one line at the top, capped. An unreadable log
 *  is replaced (as the hub always did). */
export function logActivity(where, what, url) {
  const log = readActivityLog();
  const arr = Array.isArray(log.entries) ? log.entries : [];
  arr.unshift({ ts: Date.now(), where, what, url });
  log.entries = capLog(arr);
  saveActivityLog(log);
}

/** The Backup menu's log write: the same line and cap, but an
 *  unreadable log is left alone and nothing ever throws — a log line is
 *  not worth a failed backup. */
export function logActivitySafe(where, what, url) {
  try {
    const raw = readText(ACTIVITY_KEY, null);
    const log = raw ? JSON.parse(raw) : {};
    const arr = Array.isArray(log.entries) ? log.entries : [];
    arr.unshift({ ts: Date.now(), where, what, url });
    log.entries = capLog(arr);
    writeText(ACTIVITY_KEY, JSON.stringify(log));
  } catch (e) { /* a log line is not worth a failed backup */ }
}

/** Empty the log ("Clear log"); keeps any other field on it. */
export function clearActivityLog() {
  const log = readActivityLog();
  log.entries = [];
  saveActivityLog(log);
}

/* ---- where an entry links to -------------------------------------- */
const RENAMED = {
  'arunak-filmmaker-blueprint.html': FEATURE_URL,
  'arunak-shortfilm-blueprint.html': SHORT_URL,
  'arunak-filmmaker-library.html':   LIBRARY_URL
};

/** Old rows point at the legacy files; bare fragments belong to the hub. */
export function activityHref(url) {
  if (!url) return url;
  if (url.startsWith('#')) return 'index.html' + url;
  for (const [oldName, newName] of Object.entries(RENAMED)) {
    if (url.startsWith(oldName)) return newName + url.slice(oldName.length);
  }
  return url;
}

/* ---- BACKUP HEALTH (reads only) ------------------------------------ */

/** When Drive last synced (ms), or NaN while Drive is not connected or
 *  has never synced. Reads drive-sync.js's own state; writes nothing. */
export function driveSyncedAt() {
  try {
    const d = JSON.parse(readText(DRIVE_STATE_KEY_COPY, null) || '{}') || {};
    return d.enabled && d.fileId && d.syncedAt ? Date.parse(d.syncedAt) : NaN;
  } catch (e) { return NaN; }
}

/** "When was this studio last backed up?" — the newer of the activity
 *  log's newest "Exported full studio backup" line and Drive's
 *  `syncedAt`. An import is not a backup and is not counted.
 *  @returns {{at:number, via:'file'|'drive'}|null} */
export function lastBackup() {
  let best = 0; let via = '';
  try {
    const log = JSON.parse(readText(ACTIVITY_KEY, null) || '{}') || {};
    for (const e of (Array.isArray(log.entries) ? log.entries : [])) {
      if (e && typeof e.ts === 'number' && /^Exported full studio backup/.test(String(e.what || '')) && e.ts > best) { best = e.ts; via = 'file'; }
    }
  } catch (e) { /* an unreadable log reads as never */ }
  const t = driveSyncedAt();
  if (Number.isFinite(t) && t > best) { best = t; via = 'drive'; }
  return best ? { at: best, via } : null;
}

export default {
  ACTIVITY_LIMIT, readStoredObject, readActivityLog, activityEntries, saveActivityLog, capLog,
  logActivity, logActivitySafe, clearActivityLog, activityHref, driveSyncedAt, lastBackup
};
