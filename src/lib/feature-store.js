/* ============================================================
   FEATURE STORE — what the Feature Blueprint page keeps, and where
   ------------------------------------------------------------
   The page (src/pages/feature.js) is a VIEW: it never touches
   localStorage itself (docs/ARCHITECTURE.md, rule V1). This module
   owns the three key names that page has always used and answers
   in domain words.

     the blueprint blob   BLUEPRINT_KEY (blueprint-context.js) — the
                          same string the AI context and the guide
                          drawer read; imported, never retyped
     the page prefs       fms_filmmaker_prefs_v1   { dark }
     the private notes    fms_note_<data-key>      (comments.js writes)

   Every call goes through src/lib/prefs.js, i.e. the same
   Storage.prototype the page always used, so store.js's project
   proxy scopes the blob to the open project exactly as before.
   Nothing here renames or migrates a key (invariant 1).
   ============================================================ */
import { readText, writeText, removeKey, readJSON, writeJSON, keys } from './prefs.js';
import { BLUEPRINT_KEY } from './blueprint-context.js';

export const FEATURE_BLUEPRINT_KEY = BLUEPRINT_KEY;
export const FEATURE_PREF_KEY = 'fms_filmmaker_prefs_v1';
export const NOTE_PREFIX = 'fms_note_';

/** The blob exactly as stored ('' when there is none or storage is
    unreadable). The page compares it to tell whether another tab or
    the guide drawer changed it. */
export function readBlueprintBlob() {
  return readText(FEATURE_BLUEPRINT_KEY, '') || '';
}

/** The blob parsed. THROWS on a corrupt blob, as the page's own
    `JSON.parse(getItem || '{}')` always did — loadData() reports that
    as "load failed" rather than loading a blank desk over it. */
export function readBlueprintData() {
  return JSON.parse(readBlueprintBlob() || '{}');
}

/** The blob parsed, and never a throw: unreadable reads as blank. */
export function peekBlueprintData() {
  try { return JSON.parse(readBlueprintBlob() || '{}') || {}; }
  catch (e) { return {}; }
}

/** Write an already-serialised blob. Answers false when the browser
    refused it (quota, private mode, blocked origin). */
export function saveBlueprintBlob(blob) {
  return writeText(FEATURE_BLUEPRINT_KEY, blob);
}

/** Replace the whole blueprint with `data`. THROWS when the browser
    refuses the write, so an import can say it failed. */
export function replaceBlueprintData(data) {
  if (!writeText(FEATURE_BLUEPRINT_KEY, JSON.stringify(data))) {
    throw new Error('this browser refused to save it (storage full or blocked)');
  }
}

/** Remove the blob (Reset this blueprint). */
export function clearBlueprintData() {
  removeKey(FEATURE_BLUEPRINT_KEY);
}

/** Whether a `storage` event's key is this blob (the proxy suffixes it
    per project, so the match is a prefix). */
export function isBlueprintStorageKey(key) {
  return !!key && key.indexOf(FEATURE_BLUEPRINT_KEY) === 0;
}

/** The page's own prefs: `{ dark }`. null when unreadable or corrupt. */
export function readFeaturePrefs() {
  return readJSON(FEATURE_PREF_KEY, {});
}

export function saveFeaturePrefs(prefs) {
  return writeJSON(FEATURE_PREF_KEY, prefs);
}

/** How many private field notes this browser holds. */
export function countPrivateNotes() {
  return keys().filter((k) => String(k).startsWith(NOTE_PREFIX)).length;
}
