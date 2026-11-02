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
/** A paused tour (stopped part-way, neither finished nor skipped): the
 *  account menu says "Resume the tour" for it. Reads only. */
export function tourResumable() {
  const t = readJSON(TOUR_KEY, null);
  return !!(t && !t.active && !t.finished && !t.dismissed && parseInt(t.step, 10) > 0);
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

/* ---- how the Beat Sheet is looked at (story.html) ------------------
   `beatView` inside the same device blob: 'lanes' (design B, the
   default) or 'spine' (design C). A way of looking at the outline, not
   the outline — so it never goes into fms_story_v1, and it is written
   on a click only. Anything else reads back as 'lanes'. */
export const BEAT_VIEWS = ['lanes', 'spine'];
export function readBeatView() {
  const v = readDevicePrefs().beatView;
  return BEAT_VIEWS.includes(v) ? v : 'lanes';
}
export const saveBeatView = (view) => updateDevicePrefs({ beatView: BEAT_VIEWS.includes(view) ? view : undefined });

/* ---- automatic (CONT'D) in the Screenplay Writer ------------------
   `autoContd` inside the same device blob. Final Draft marks a speaker
   who speaks again after only action, in the same scene, with (CONT'D)
   — on the page and in the print, never in what the writer typed. ON
   unless turned off, so the blob holds `autoContd: false` and nothing
   else: absent is the default, and a write happens only on a click. */
export const autoContdOn = () => readDevicePrefs().autoContd !== false;
export const saveAutoContd = (on) => updateDevicePrefs({ autoContd: on ? undefined : false });

/* ---- the Screenplay Writer's typewriter scrolling ------------------
   `typewriter: true` inside the same device blob. A way of looking at
   the page, never part of the script; written on a click only. */
export const readTypewriter = () => readDevicePrefs().typewriter === true;
export const saveTypewriter = (on) => updateDevicePrefs({ typewriter: on ? true : undefined });

/* ---- the Screenplay Writer's helpers (wave 2, L5) ----------------
   All inside the same device blob, written on a click or a change only.
   `dictation`: { on, noticed } — OFF until the writer switches it on
   (Chrome sends the audio to Google, and the one-time notice says so);
   `macros`: the list from src/lib/macros.js, stored only when it differs
   from the defaults; `readAloud`: the table read's voices and options
   (src/lib/read-aloud.js cleans it on read). */
export function readDictation() {
  const d = readDevicePrefs().dictation;
  return { on: !!(d && d.on === true), noticed: !!(d && d.noticed === true) };
}
export const saveDictation = (patch) => {
  const cur = readDictation();
  const next = { ...cur, ...(patch || {}) };
  return updateDevicePrefs({ dictation: next.on || next.noticed ? { on: !!next.on, noticed: !!next.noticed } : undefined });
};
export const readMacrosPref = () => readDevicePrefs().macros;
/* `undefined` removes the pref (the defaults); an EMPTY list is stored: a
   writer who cleared every macro must not get the defaults back. */
export const saveMacrosPref = (list) => updateDevicePrefs({ macros: Array.isArray(list) ? list : undefined });
export const readReadAloudPref = () => readDevicePrefs().readAloud;
export const saveReadAloudPref = (obj) => updateDevicePrefs({ readAloud: obj && typeof obj === 'object' ? obj : undefined });

/* ---- fit to page (the Screenplay Writer's "cheat") ----------------
   `fitPage: { <projectId>: n }` inside the same device blob: how many
   extra lines a page the PDF may fit by nudging the margins and the
   leading (src/lib/fit-page.js, 0..4). An export setting for this
   device, never part of the script, and written on a click only. Read
   back clamped; anything odd reads as 0 (no cheat). */
const FIT_MAX = 4;
export function readFitPage(pid) {
  const v = readDevicePrefs().fitPage;
  const n = v && typeof v === 'object' && !Array.isArray(v) ? Math.floor(Number(v[String(pid || '')])) : 0;
  return Number.isFinite(n) ? Math.max(0, Math.min(FIT_MAX, n)) : 0;
}
export function saveFitPage(pid, lines) {
  const cur = readDevicePrefs().fitPage;
  const map = cur && typeof cur === 'object' && !Array.isArray(cur) ? { ...cur } : {};
  const n = Math.max(0, Math.min(FIT_MAX, Math.floor(Number(lines) || 0)));
  if (n) map[String(pid || '')] = n; else delete map[String(pid || '')];
  return updateDevicePrefs({ fitPage: Object.keys(map).length ? map : undefined });
}

export default {
  readDictation, saveDictation, readMacrosPref, saveMacrosPref, readReadAloudPref, saveReadAloudPref,
  readFitPage, saveFitPage,
  autoContdOn, saveAutoContd,
  readDevicePrefs, updateDevicePrefs, motionReduced, saveMotionPref, brandingPrefOff, saveBrandingOff, touchThemePref, tourActive, tourResumable,
  readShotView, saveShotView, readBeatView, saveBeatView, readTypewriter, saveTypewriter
};
