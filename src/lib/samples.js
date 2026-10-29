/* ============================================================
   SAMPLES — the registry of sample projects.
   ------------------------------------------------------------
   Two samples ship: Dragon (the default, and the one the landing
   page, the trial auto-open and ?sample=1 mean) and The Dark Knight.
   Every place that offers "the sample" reads this list for its
   labels, ids and titles, so a third is one entry here and no page
   edit.

   The static part is tiny literals (id, title, label, blurb, format) so
   a page that only draws a picker pays nothing for the data. The main
   JSON, the script and the story are all lazy: `loadData` / `loadScript`
   / `loadStory` are dynamic
   imports with literal paths, which is the only form Vite follows.
   Both are in vite.config.js's lazy exception and are checked by
   scripts/check-ai-lazy.mjs; neither may land in CORE.

   Scene, contact, shot… ids are built from `id` in hub.js
   (`${id}-sc-<number>`), so Dragon's stay `dragon-sc-<number>`.

   PURE: imports only JSON. No store.js, no DOM.
   ============================================================ */

export const SAMPLES = [
  {
    id: 'dragon',
    title: 'Dragon',
    label: 'Dragon (2025)',
    blurb: 'A Tamil campus-to-corporate drama, scene by scene.',
    format: 'feature',
    /* Both samples are Chennai productions in rupees, so they say so:
       with no region a sample followed the DEVICE, and on a device set
       to International Tamil typing told the Dragon sample it was "set
       to be made elsewhere" (QA r2). */
    region: 'IN',
    loadData:   () => import('../data/sample.dragon.json'),
    loadScript: () => import('../data/sample.dragon.script.json'),
    loadStory:  () => import('../data/sample.dragon.story.json')
  },
  {
    id: 'darkknight',
    title: 'The Dark Knight',
    label: 'The Dark Knight (2008)',
    blurb: 'A crime epic, imagined as a Chennai unit’s production, in rupees.',
    format: 'feature',
    region: 'IN',
    loadData:   () => import('../data/sample.darkknight.json'),
    loadScript: () => import('../data/sample.darkknight.script.json'),
    loadStory:  () => import('../data/sample.darkknight.story.json')
  }
];

export const DEFAULT_SAMPLE = 'dragon';

export function sampleById(id) {
  return SAMPLES.find((s) => s.id === id) || null;
}

export function isSampleTitle(title) {
  return SAMPLES.some((s) => s.title === title);
}

export default { SAMPLES, DEFAULT_SAMPLE, sampleById, isSampleTitle };
