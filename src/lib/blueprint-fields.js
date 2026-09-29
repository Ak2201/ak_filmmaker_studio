/* ============================================================
   BLUEPRINT FIELDS — how many fields a blueprint actually has
   ------------------------------------------------------------
   The denominator for "how far along is this project", derived from
   the step data rather than counted from whatever happens to be in
   localStorage. That distinction is the whole reason this file
   exists.

   hub.js used to compute its progress like this:

     keys.forEach(k => { ... total++; if (nonEmpty) filled++; });
     pct = filled / total

   where `keys` was Object.keys of the SAVED BLOB. So a project with
   eleven saved fields, all of them non-empty, read 100% complete and
   the hub's resume card offered it as "ready to shoot". The
   dashboard, deriving properly, said 3% for the same project. Two
   numbers for one fact, and the wrong one was on the landing page.

   TWO SOURCES OF FIELD NAMES, and missing either one skews the
   answer badly:

     `key` properties on the asks and checklist items the renderer
     builds from structured blocks, and

     data-key attributes inside `raw` blocks — the elements the
     extractors could not model, re-inserted verbatim. There are 145
     of those on the feature blueprint alone, so a count that ignored
     them would report a filled project as roughly a third done.
   ============================================================ */

import featureData from '../data/steps.feature.json';
import prodData from '../data/steps.production.json';
import shortData from '../data/steps.short.json';

const DATA_KEY_RE = /data-key\s*=\s*(?:"([^"]+)"|'([^']+)')/g;

/** Walk any step-shaped structure and collect every field name in it. */
export function harvestKeys(node, out = new Set()) {
  if (Array.isArray(node)) {
    for (const item of node) harvestKeys(item, out);
    return out;
  }
  if (!node || typeof node !== 'object') return out;
  for (const [prop, value] of Object.entries(node)) {
    if (typeof value === 'string') {
      if (prop === 'key') { out.add(value); continue; }
      DATA_KEY_RE.lastIndex = 0;
      let m;
      while ((m = DATA_KEY_RE.exec(value)) !== null) out.add(m[1] || m[2]);
      continue;
    }
    harvestKeys(value, out);
  }
  return out;
}

/* Computed once — the step data is a build-time import and cannot
   change while the page is open. */
let featureSet = null;
let shortSet = null;

/** Every field the FEATURE blueprint declares, all 32 steps of it. */
export function featureKeys() {
  if (!featureSet) {
    featureSet = new Set();
    harvestKeys(featureData.vol1, featureSet);
    harvestKeys(featureData.vol2, featureSet);
    harvestKeys(prodData.production, featureSet);
    harvestKeys(prodData.post, featureSet);
  }
  return featureSet;
}

/** Every field the SHORT blueprint declares, including the beats,
    which live in their own array and are rendered by `beatviz`. */
export function shortKeys() {
  if (!shortSet) {
    shortSet = new Set();
    harvestKeys(shortData.steps, shortSet);
    harvestKeys(shortData.beats, shortSet);
  }
  return shortSet;
}

/** The blueprint's own rule for "filled": a non-empty string, or a
    ticked checklist item. Kept here so two pages cannot disagree. */
export function isFilled(v) {
  if (typeof v === 'string') return v.trim().length > 0;
  return v === true;
}

/** done / total against a declared field set. */
export function progressAgainst(keys, data) {
  let done = 0;
  for (const k of keys) if (isFilled(data[k])) done++;
  return { done, total: keys.size, pct: keys.size ? Math.round((done / keys.size) * 100) : 0 };
}

export default { harvestKeys, featureKeys, shortKeys, isFilled, progressAgainst };
