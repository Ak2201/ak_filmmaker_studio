/* ============================================================
   CHROME PREFS — the device's own preferences the chrome reads
   ------------------------------------------------------------
   The storage half of src/ui/chrome.js, footer.js, motion-pref.js
   and motion-choice.js. Every key here already existed and keeps its
   exact name, value and JSON shape:

     fms_studio_prefs_v1  the device prefs BLOB (GLOBAL_KEYS / ALL_KEYS).
                          Merged, never replaced: it carries `dark`,
                          `reduceMotion`, `branding` and whatever cloud.js
                          syncs in it.
     fms_studio_theme_v1  the old theme choice. Read for the contract's
                          sake and never written (one theme, dark).
     fms_tour_v1          the guided tour's state; this only asks
                          whether a tour is under way.

   Written on prefs.js, so the store.js proxy sees every call exactly as
   before (none of these keys is project-scoped). Imports only
   prefs.js: motion-pref.js loads it at the very top of the core chunk.
   ============================================================ */
import { readText, readJSON, writeJSON } from './prefs.js';

const PREFS_KEY = 'fms_studio_prefs_v1';
const THEME_KEY = 'fms_studio_theme_v1';
const TOUR_KEY = 'fms_tour_v1';

/** The prefs blob as an object ({} when absent, unreadable or not an object). */
export function readDevicePrefs() {
  const p = readJSON(PREFS_KEY, {});
  return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
}

/** Lay `patch` over the blob; a key whose value is `undefined` is
 *  removed. Answers whether the write went through (private mode: no). */
export function updateDevicePrefs(patch) {
  const p = readDevicePrefs();
  for (const [k, v] of Object.entries(patch || {})) {
    if (v === undefined) delete p[k]; else p[k] = v;
  }
  return writeJSON(PREFS_KEY, p);
}

/* ---- reduce motion ------------------------------------------------ */
/** The device's own Reduce motion switch: absent means Auto. */
export const motionReduced = () => readDevicePrefs().reduceMotion === true;
/** 'reduced' or 'auto' (written on a click only). */
export const saveMotionPref = (mode) => updateDevicePrefs({ reduceMotion: mode === 'reduced' ? true : undefined });

/* ---- the "made with" line ----------------------------------------- */
/** Has the user turned the branding line off? (Whether the plan lets
 *  them is footer.js's question.) */
export const brandingPrefOff = () => readDevicePrefs().branding === 'off';
/** Written on a click only — never on load. */
export const saveBrandingOff = (off) => updateDevicePrefs({ branding: off ? 'off' : undefined });

/* ---- the theme ----------------------------------------------------- */
/** Read the stored theme — and do nothing with it. A stored value is
 *  honoured by being left alone, whatever it says. */
export function touchThemePref() { void readText(THEME_KEY); }

/* ---- the tour ----------------------------------------------------- */
/** Is a guided tour under way on this device? */
export function tourActive() {
  const t = readJSON(TOUR_KEY, null);
  return !!(t && t.active);
}

/* ---- how the shot list is looked at (visualize.html) ---------------
   `shotView` inside the EXISTING device blob: list or board, the
   visible columns, grouping, frames per row, the PDF layout. How this
   device looks at the work, never the work — so it is not in the
   project's shot key, and it is written on a click only (verify's
   idle-write check). Read back shape-checked; anything odd is dropped. */
export function readShotView() {
  const v = readDevicePrefs().shotView;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}
export const saveShotView = (view) => updateDevicePrefs({ shotView: view && typeof view === 'object' ? view : undefined });

export default {
  readDevicePrefs, updateDevicePrefs, motionReduced, saveMotionPref, brandingPrefOff, saveBrandingOff, touchThemePref, tourActive,
  readShotView, saveShotView
};
