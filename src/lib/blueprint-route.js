/* ============================================================
   BLUEPRINT ROUTE — where a blueprint step lives once the
   blueprints are folded into the five stage pages
   ------------------------------------------------------------
   Pure. Reads two JSON files and nothing else: no storage, no DOM,
   no store.js. That is deliberate, so a page may import it for one
   href without paying for the studio CORE chunk (CLAUDE.md, the
   `startlib` trap) and a node test can import it directly.

   DERIVED, NEVER LISTED. Which stage a step belongs to is
   src/data/steps.stages.json (the sidecar the step rail and the
   journey already read); which page a stage lives on is the first
   module of that stage in src/data/navigation.json. A hand-written
   step-to-page table would be wrong by the next edit.

   NAMESPACES. The sidecar keys steps `<ns>:<id>`: `feature` (01-24),
   `production` (25-32, the feature blueprint's second half) and
   `short`. A caller on feature.html holds ids 01-32 under ONE
   namespace, so `feature` + step-25 is looked up under `production`
   when it is not found under `feature`.

   A step that spans two stages (short step 9: preprod AND production)
   answers with its FIRST stage; stagesForStep() returns them all.

   THE HREF. `<stage page>?step=<format>/<id>#guide`, e.g.
   `story.html?step=feature/step-07#guide`. `format` is `feature` or
   `short`; the feature blueprint's 25-32 are `feature/step-25`, since
   a project's format is what the guide renders, not the sidecar's
   internal namespace. Hrefs keep `.html`, like every other href in
   the app; cleanUrls answers them with a 308 and the service worker
   already copes (CLAUDE.md, the redirected-response trap).
   ============================================================ */
import STAGES from '../data/steps.stages.json';
import nav from '../data/navigation.json';

export const GUIDE_FRAGMENT = 'guide';

/** stage id -> page file, from navigation.json: the page of the first
 *  module of each stage. */
const STAGE_PAGE = {};
for (const p of nav.phases) {
  const first = (p.modules || []).find((m) => m.href);
  if (first) STAGE_PAGE[p.id] = String(first.href).split('#')[0];
}

/** Feature cover sections and the stage each opens. */
const COVER_STAGE = {};
for (const part of (STAGES.parts && STAGES.parts.feature) || []) COVER_STAGE[part.cover] = part.stage;

/** Anchors that are not steps and not stage covers: where they go. */
const SPECIAL = { glossary: 'library.html#glossary' };

/** `/feature`, `/feature.html`, `/short/`, `feature.html?x#y` -> 'feature.html'. */
export function pageOf(pathname) {
  let p = String(pathname || '').split('#')[0].split('?')[0];
  p = p.split('/').filter(Boolean).pop() || 'index';
  p = p.toLowerCase().replace(/\.html$/, '');
  return p + '.html';
}

export const stagePage = (stage) => STAGE_PAGE[stage] || null;

function entryOf(ns, stepId) {
  const steps = STAGES.steps || {};
  const id = String(stepId || '');
  return steps[ns + ':' + id]
    || (ns === 'feature' ? steps['production:' + id] : null)
    || (ns === 'production' ? steps['feature:' + id] : null) || null;
}

/** Every stage a step belongs to, in order; [] when unknown. */
export function stagesForStep(ns, stepId) {
  const e = entryOf(ns, stepId);
  if (!e) return [];
  return Array.isArray(e.stage) ? e.stage.slice() : [e.stage];
}

/** `{page, stage}` for a step: its first stage, and that stage's page.
 *  null when the step is unknown. */
export function stageForStep(ns, stepId) {
  const stage = stagesForStep(ns, stepId)[0];
  const page = stage && stagePage(stage);
  return page ? { page, stage } : null;
}

/** The blueprint format an ns belongs to. */
export const formatOf = (ns) => (ns === 'short' ? 'short' : 'feature');

/** `story.html?step=feature/step-07#guide`; null for an unknown step. */
export function guideHref(ns, stepId) {
  const r = stageForStep(ns, stepId);
  if (!r) return null;
  return r.page + '?step=' + formatOf(ns) + '/' + encodeURIComponent(stepId) + '#' + GUIDE_FRAGMENT;
}

/** A stage's guide with no step chosen: `story.html#guide`. */
export function stageGuideHref(stage) {
  const page = stagePage(stage);
  return page ? page + '#' + GUIDE_FRAGMENT : null;
}

/** Where an OLD blueprint hash goes. `fileOrPath` is the blueprint page
 *  being left (feature / short, with or without .html), `hash` the
 *  fragment ('#step-07', '#vol-2', '#glossary', ''). Always answers: an
 *  anchor with no home lands on the first stage's guide. */
export function routeForAnchor(fileOrPath, hash) {
  const page = pageOf(fileOrPath);
  const ns = page === 'short.html' ? 'short' : 'feature';
  const frag = String(hash || '').replace(/^#/, '');
  if (SPECIAL[frag] && ns === 'feature') return SPECIAL[frag];
  if (/^step-\d+$/.test(frag)) {
    const h = guideHref(ns, frag);
    if (h) return h;
  }
  if (ns === 'feature') {
    if (COVER_STAGE[frag]) return stageGuideHref(COVER_STAGE[frag]);
    if (entryOf('feature', frag)) return guideHref('feature', frag);   // treatment-ladder, write-the-draft
  }
  return stageGuideHref('story');
}
