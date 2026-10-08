/* ============================================================
   SAMPLE FIGURES — the numbers quoted about the Dragon sample
   ------------------------------------------------------------
   PURE: no store.js, no DOM, no localStorage. Two readers, one
   derivation (CLAUDE.md rule 2):

   - the hub (src/pages/hub/first-run.js and hub.js), at runtime, for
     the first-run panel, the "sample is open" toast and the sample
     blueprint's day count;
   - the BUILD (vite.config.js, the `fms-start-figures` plugin), which
     stamps them into start.html's markup so the landing page keeps
     its words with scripts off and still cannot drift from the file.

   So this module may import only other pure modules — vite.config.js
   evaluates it in Node, where store.js's Storage patch would throw.
   formatEighths and locationKey live here for that reason and are
   re-exported by scenes.js and locations.js, whose callers are
   unchanged.
   ============================================================ */

/** Eighths as the industry writes them: 2 4/8, or 3/8 for under a page. */
export function formatEighths(e) {
  const n = Math.max(0, Math.round(Number(e) || 0));
  const pages = Math.floor(n / 8);
  const rem = n % 8;
  if (!pages && !rem) return '0';
  if (!pages) return `${rem}/8`;
  if (!rem) return String(pages);
  return `${pages} ${rem}/8`;
}

/** The key a recce record is filed under. Case and stray spaces must
    not make two records for one place, so the key is normalised and
    the DISPLAY name always comes back off the scene. */
export function locationKey(name) {
  return String(name || '').trim().toLowerCase();
}

/** Every figure the studio quotes about a sample file, derived from
    its rows: scenes, pages (formatted), shoot days (distinct positive
    `shootDay`s), locations (distinct by locationKey, as the location
    index counts them), the unit (contacts) and the call sheets. */
export function sampleFigures(sample) {
  const scenes = (sample && sample.scenes) || [];
  const eighths = scenes.reduce((a, s) => a + (Number(s.eighths) || 0), 0);
  const days = new Set(scenes
    .map((s) => parseInt(s.shootDay, 10))
    .filter((n) => Number.isFinite(n) && n > 0)).size;
  const locations = new Set(scenes
    .map((s) => locationKey(s.location))
    .filter(Boolean)).size;
  return {
    scenes: scenes.length,
    eighths,
    pages: formatEighths(eighths),
    days,
    locations,
    unit: ((sample && sample.contacts) || []).length,
    callSheets: ((sample && sample.callSheets) || []).length
  };
}
