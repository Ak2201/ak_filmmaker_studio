/* ============================================================
   DEVICE MOTION — the "Reduce motion" switch, read for a PUBLIC page
   ------------------------------------------------------------
   src/lib/chrome-prefs.js owns fms_studio_prefs_v1 and its
   motionReduced() is what the studio reads. A public page cannot import
   it: it sits in the studio's CORE chunk, and prove:growth asserts no
   studio chunk reaches a public page. So this is the same answer, READ
   ONLY and import-free: `reduceMotion: true` in the device prefs blob.
   It never writes. (28 Oct 2026)
   ============================================================ */
export function deviceReducedMotion() {
  try {
    const p = JSON.parse(localStorage.getItem('fms_studio_prefs_v1') || '{}');
    return !!(p && typeof p === 'object' && p.reduceMotion === true);
  } catch (e) { return false; }
}
