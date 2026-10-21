/* ============================================================
   THE ESTIMATOR'S LINE IDS — which `ci_<n>` a new row may take
   ------------------------------------------------------------
   A budget line's identity is its row number: `ci_<n>` is what an
   expense, a crew record, a department move (fms_costs_v1 `lines`)
   and a locked version all point at. Reset used to clear the rows
   and count from 1 again, so the next "Catering" in row 3 inherited
   every rupee logged against the "ARRI Alexa 35" that had been ci_3
   — and a locked version reported one changed line instead of one
   removed and one added. Nothing showed the money moving.

   So a number, once used, is never handed out again. The high-water
   mark is the highest `ci_<n>` named ANYWHERE: the estimator's blob
   before it is cleared, and every reference in the cost blob. Spend
   on a line that was reset away then keeps its old id and shows as
   "not on a budget line", which is what costs.js always promised.

   Pure: no storage, no imports. The caller reads both blobs.
   Existing ids are never renamed — only NEW rows move up.
   ============================================================ */

const idx = (s) => {
  const m = /^ci_(\d+)(?:_|$)/.exec(String(s == null ? '' : s));
  return m ? +m[1] : 0;
};
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** The highest row number either blob names (0 when neither names one). */
export function highestLineIndex(calc = {}, costs = {}) {
  let max = 0;
  const see = (s) => { const n = idx(s); if (n > max) max = n; };
  if (isObj(calc)) Object.keys(calc).forEach(see);
  if (isObj(costs)) {
    if (isObj(costs.lines)) Object.keys(costs.lines).forEach(see);
    if (Array.isArray(costs.expenses)) costs.expenses.forEach((e) => e && see(e.line));
    if (isObj(costs.crew)) Object.values(costs.crew).forEach((r) => r && see(r.line));
    if (Array.isArray(costs.versions)) costs.versions.forEach((v) => {
      if (v && Array.isArray(v.lines)) v.lines.forEach((l) => l && see(l.id));
    });
  }
  return max;
}

/** The rows a saved blob should be drawn as: from its LOWEST row
    number to its highest, at least `min` rows. A blob that starts at
    ci_1 (every estimate saved before this) draws exactly as it did;
    one written after a reset starts above the old ids and does not
    draw empty rows 1..n that would hand them out again. */
export function rowSpan(calc = {}, min = 5) {
  let lo = 0, hi = 0;
  if (isObj(calc)) Object.keys(calc).forEach((k) => {
    const n = /^ci_(\d+)_/.exec(k) ? idx(k) : 0;
    if (!n) return;
    if (!lo || n < lo) lo = n;
    if (n > hi) hi = n;
  });
  if (!lo) return { start: 1, count: min };
  return { start: lo, count: Math.max(hi - lo + 1, min) };
}
