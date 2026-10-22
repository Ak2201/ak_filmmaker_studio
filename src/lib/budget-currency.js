/* ============================================================
   BUDGET CURRENCY — which currency the open budget is in, for the
   summaries that print it outside the budget page (the hub's Library
   card, the dashboard's Budget stat and chain card).
   ------------------------------------------------------------
   costs.js resolveCurrency() is the rule: the estimator's ci_currency,
   then the cost record's settings.currency, INR for a budget with money
   and no word (written before the field), the film's own currency for an
   empty one. Restated here rather than imported because costs.js is the
   budget page's module and would drag itself into the hub and the
   dashboard; and kept OUT of hub-status.js, because the dashboard
   importing that module merged it with journey.js into one shared chunk
   and put 3.8 KB on the Library's first paint. test:budget-usd holds
   calcCurrency() to resolveCurrency() over every kind of record.

   Reads only, never writes.
   ============================================================ */
import Store from './store.js';
import { readJSON } from './prefs.js';
import { normaliseCurrency, currencyForRegion, projectRegion } from './region-core.js';

const CALC_KEY = 'fms_library_calc_v1';   // hub-keys.js LIB_CALC_KEY / costs.js CALC_KEY
const COSTS_KEY = 'fms_costs_v1';         // costs.js COSTS_KEY

/** The budget's currency, pure. `entry` is the film's projects-list entry. */
export function calcCurrency(calc, costs, entry) {
  const a = normaliseCurrency(calc && calc.ci_currency);
  if (a) return a;
  const b = normaliseCurrency(costs && costs.settings && costs.settings.currency);
  if (b) return b;
  const hasCalc = !!calc && Object.keys(calc).some((k) => /^ci_\d+_/.test(k) && String(calc[k] == null ? '' : calc[k]).trim() !== '');
  const hasCosts = !!costs && ((costs.expenses || []).length + (costs.floats || []).length + (costs.payments || []).length > 0
    || (!!costs.crew && typeof costs.crew === 'object' && Object.keys(costs.crew).length > 0));
  if (hasCalc || hasCosts) return 'INR';
  try { return entry ? currencyForRegion(projectRegion(entry)) : 'INR'; } catch (e) { return 'INR'; }
}

/** The open budget's currency, from storage. `calc` may be passed when
 *  the caller has already read the estimator's blob. */
export function openBudgetCurrency(calc) {
  let entry = null;
  try { entry = Store.currentProject ? Store.currentProject() : null; } catch (e) { /* no store */ }
  let c = calc;
  if (!c) { try { c = readJSON(CALC_KEY, {}); } catch (e) { c = {}; } }
  let costs = null;
  try { costs = readJSON(COSTS_KEY, null); } catch (e) { costs = null; }
  return calcCurrency(c, costs, entry);
}

export default { calcCurrency, openBudgetCurrency };
