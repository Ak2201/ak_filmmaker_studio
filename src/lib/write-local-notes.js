/* ============================================================
   LOCAL NOTES — a private note per field, on this device
   ------------------------------------------------------------
   `fms_note_<fieldKey>`: the note a writer leaves on a blueprint
   field or a script line, kept in this browser only. The comments
   panel (src/ui/comments.js) and the Notes overview
   (src/ui/script-notes.js) draw them; this module is the only view
   door to them (docs/ARCHITECTURE.md, rule V1).

   Keys are passed WHOLE (prefix + field key), because the panel's
   prefix is per-page config. NOTE_PREFIX is the one every page uses
   today. Do not change it: it is a contract with saved notes.
   ============================================================ */
import { readText, writeText, removeKey } from './prefs.js';

export const NOTE_PREFIX = 'fms_note_';

/** Whether a non-empty note is stored under this key. */
export function hasLocalNote(fullKey) {
  return !!readText(fullKey, '');
}
/** The note under this key, or ''. */
export function readLocalNote(fullKey) {
  return readText(fullKey, '') || '';
}
/** Store the note, or remove the key when it is blank. Never throws:
    private mode or a full quota leaves the panel working. */
export function writeLocalNote(fullKey, value) {
  try {
    if (value.trim()) writeText(fullKey, value);
    else removeKey(fullKey);
  } catch (e) { /* a value that is not a string: nothing is written, as before */ }
}
