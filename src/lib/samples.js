/* ============================================================
   SAMPLES — the registry of sample projects.
   ------------------------------------------------------------
   Two samples ship: Dragon (the default, and the one the landing
   page, the trial auto-open and ?sample=1 mean) and The Dark Knight.
   Every place that offers "the sample" reads this list for its
   labels, ids and titles, so a third is one entry here and no page
   edit.

   `data` is a STATIC import of the small main JSON (it sits in the
   `data-sample` chunk, vite.config.js). The script and the story are
   the big files and stay lazy: `loadScript` / `loadStory` are dynamic
   imports with literal paths, which is the only form Vite follows.
   Both are in vite.config.js's lazy exception and are checked by
   scripts/check-ai-lazy.mjs; neither may land in CORE.

   Scene, contact, shot… ids are built from `id` in hub.js
   (`${id}-sc-<number>`), so Dragon's stay `dragon-sc-<number>`.

   PURE: imports only JSON. No store.js, no DOM.
   ============================================================ */
import dragon from '../data/sample.dragon.json';
import darkknight from '../data/sample.darkknight.json';

export const SAMPLES = [
  {
    id: 'dragon',
    title: dragon.title,
    label: 'Dragon (2025)',
    blurb: 'A Tamil campus-to-corporate drama, scene by scene.',
    format: 'feature',
    data: dragon,
    loadScript: () => import('../data/sample.dragon.script.json'),
    loadStory:  () => import('../data/sample.dragon.story.json')
  },
  {
    id: 'darkknight',
    title: darkknight.title,
    label: 'The Dark Knight (2008)',
    blurb: 'A crime epic, imagined as a Chennai unit’s production, in rupees.',
    format: 'feature',
    data: darkknight,
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

export function isSampleProject(p) {
  return !!p && isSampleTitle(p.title);
}

export default { SAMPLES, DEFAULT_SAMPLE, sampleById, isSampleTitle, isSampleProject };
