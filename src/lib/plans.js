/* ============================================================
   PLANS — the tier ids, their order and their display names
   ------------------------------------------------------------
   PURE, and kept that way on purpose: billing.js imports store.js and
   reads window, so the build cannot evaluate it, and start.html's
   "Pricing" section is stamped at BUILD time (vite.config.js,
   `fms-start-figures`) from this one constant. billing.js re-exports
   both, so every app caller is unchanged. Names and order only — the
   PRICES live in the server's plans table and nowhere in the client.
   ============================================================ */
export const PLAN_ORDER = ['free', 'starter', 'indie', 'pro'];

export const PLAN_NAMES = { free: 'Free', starter: 'Basic', indie: 'Intermediate', pro: 'Pro' };

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

export const planName = (id) => PLAN_NAMES[id] || id;
