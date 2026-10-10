/* ============================================================
   REDUCE MOTION — the device's own switch, beside the OS one.
   Stored in the EXISTING device prefs blob (fms_studio_prefs_v1,
   already in GLOBAL_KEYS / ALL_KEYS) as `reduceMotion: true`; absent
   means Auto, which follows the system. No new key, so no registry
   edit. The blob is merged, never replaced: it also carries `dark`.
   Applying: html.ma-off plus an inline --motion:0 on <html>, which
   motion-app.js and motion.js both respect. Imported first by
   motion-app.js so it runs before anything is veiled.
   ============================================================ */
const KEY = 'fms_studio_prefs_v1';

function read() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || '{}');
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch (e) { return {}; }
}

export const motionReduced = () => read().reduceMotion === true;

/** Low-end signals: data saver or <= 2 GB of memory. Entrance animation off. */
export function lowEndDevice() {
  const n = typeof navigator !== 'undefined' ? navigator : {};
  return !!(n.connection && n.connection.saveData) || (typeof n.deviceMemory === 'number' && n.deviceMemory <= 2);
}

export function applyMotionPref() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const off = motionReduced();
  root.classList.toggle('ma-off', off);
  if (off) root.style.setProperty('--motion', '0'); else root.style.removeProperty('--motion');
}

applyMotionPref();
