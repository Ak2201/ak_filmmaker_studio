/* ============================================================
   PLAN MATRIX — what each plan includes, from src/data/plan-matrix.json
   ------------------------------------------------------------
   THE SINGLE SOURCE (owner, 11 Oct 2026): three plans, each including
   everything below it — Basic writes the film, Intermediate prepares
   it, Pro is everything. Every reader derives from here:

     - schema section 35 (scripts/make-plan-features-sql.mjs) sets the
       live plans.features / limits.extension from matrixFeatures() and
       matrixLimits(); `npm run test:plans` fails if the SQL in
       supabase-schema.sql is not what the script generates;
     - start.html's tier lines and comparison table (vite.config.js,
       fms-start-figures) read addedBy() / planHas();
     - the plan cards' "Adds" line and the purchase success card.

   Live gating still reads the DATABASE (plan-gate.js, billing_status()):
   the console can fine-tune a plan after section 35 has run, and the
   cards draw what the rows say. This file is what the rows START as.

   Kept out of plans.js (CORE) so the matrix never rides on every page's
   first paint. Module rows carry no label: navigation.json has it.
   ============================================================ */
import matrix from '../data/plan-matrix.json';
import nav from '../data/navigation.json';

export const MATRIX = matrix;
/** The PAID plan ids, in order. 'free' is the no-plan state, never sold. */
export const PAID = Object.keys(matrix.plans).filter((id) => id !== 'free');

const NAV_LABEL = (() => {
  const out = {};
  for (const g of nav.global || []) for (const m of g.modules || []) out[m.id] = m.label;
  for (const p of nav.phases || []) for (const m of p.modules || []) out[m.id] = m.label;
  return out;
})();
/** A row's label: its own for a capability, navigation.json's for a module. */
export const labelOf = (row) => (row && (row.label || NAV_LABEL[row.key])) || (row && row.key) || '';

/** Does the plan have the row? (For an inverted row: does the restriction apply?) */
export const planHas = (row, planId) => (row.plans || []).includes(planId);

/** The `features` map a plan is seeded with: every module and capability
 *  explicitly true or false — what the console's SAVE writes — except
 *  `sample_only`, a restriction that is present only where it applies. */
export function matrixFeatures(planId) {
  const out = {};
  for (const r of matrix.features) {
    if (r.kind === 'limit') continue;
    const has = planHas(r, planId);
    if (r.inverted) { if (has) out[r.key] = true; }
    else out[r.key] = has;
  }
  return out;
}

/** The limit rows a plan is seeded with, e.g. { extension: true }. */
export function matrixLimits(planId) {
  const out = {};
  for (const r of matrix.features) if (r.kind === 'limit') out[r.key] = planHas(r, planId);
  return out;
}

/** The rows this PAID plan adds to the paid plan below it (for the first
 *  paid plan: everything it has). Inverted rows are restrictions, never
 *  something a plan "adds". */
export function addedBy(planId) {
  const i = PAID.indexOf(planId);
  if (i < 0) return [];
  const prev = i > 0 ? PAID[i - 1] : null;
  return matrix.features.filter((r) => !r.inverted && planHas(r, planId) && !(prev && planHas(r, prev)));
}

export default { MATRIX, PAID, labelOf, planHas, matrixFeatures, matrixLimits, addedBy };
