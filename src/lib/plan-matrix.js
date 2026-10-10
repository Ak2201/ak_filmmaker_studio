/* The plan feature matrix as an admin's `features` seed. Kept out of
   plans.js (which is in the CORE chunk) so the matrix JSON never rides on
   every page's first paint. Reference only: live gating reads the
   database's plans.features. */
import matrix from '../data/plan-matrix.json';


/** The `features` object an admin would seed for a plan: {key:false,...} for
 *  every gated key the plan lacks (sample_only is true where it applies).
 *  Reference only — live gating reads the database. */
export function matrixFeatures(planId) {
  const out = {};
  for (const r of matrix.features) {
    if (r.kind === 'limit') continue;
    const has = r.plans.includes(planId);
    if (r.inverted) { if (has) out[r.key] = true; }
    else if (!has) out[r.key] = false;
  }
  return out;
}

