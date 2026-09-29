/* ============================================================
   MONEY — one parser, one formatter, for the whole studio
   ------------------------------------------------------------
   This exists because there were three copies and they disagreed.

   THE TRAP, WHICH IS NAMED IN CLAUDE.md AND WAS STILL LIVE IN TWO
   PLACES. Suffix tests must be ANCHORED to the end of the string.
   The original was:

     if (/cr|crore/i.test(s))       m = 10000000;
     else if (/l|lakh|lac/i.test(s)) m = 100000;
     else if (/k/i.test(s))          m = 1000;

   Unanchored, every one of those matches mid-word:
     "1 lens day"  -> the bare `l`  -> x 100000
     "crew 500"    -> the `cr`      -> x 10000000
     "bank 200"    -> the `k`       -> x 1000

   library.js was fixed; hub.js's copy never was, so the hub's
   budget figure and the calculator's could disagree about the same
   data. A third caller then appeared on the dashboard. Three copies
   of one rule is the condition that produced the bug, so the rule
   now lives once, here.
   ============================================================ */

/**
 * Parse a rate or day count a person typed, in Indian notation.
 * Accepts "25,000", "Rs. 25000", "25k", "1.5 lakh", "2 cr", "₹3L".
 * @returns {number} rupees, or 0 for anything unparseable.
 */
export function parseNum(s) {
  if (!s) return 0;
  s = String(s).toLowerCase().replace(/[,\s₹$]/g, '').replace(/rs\.?/g, '');
  let m = 1;
  if (/(cr|crore)$/.test(s))        { m = 10000000; s = s.replace(/(crore|cr)$/, ''); }
  else if (/(lakh|lac|l)$/.test(s)) { m = 100000;   s = s.replace(/(lakh|lac|l)$/, ''); }
  else if (/k$/.test(s))            { m = 1000;     s = s.replace(/k$/, ''); }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n * m;
}

/** Abbreviated — lossy by design. Glanceable magnitude only. */
export function fmtINR(n) {
  if (!n) return '₹ 0';
  if (n >= 10000000) return '₹ ' + (n / 10000000).toFixed(2).replace(/\.?0+$/, '') + ' Cr';
  if (n >= 100000)   return '₹ ' + (n / 100000).toFixed(2).replace(/\.?0+$/, '') + ' L';
  if (n >= 1000)     return '₹ ' + Math.round(n / 1000) + 'k';
  return '₹ ' + Math.round(n);
}

/** Exact, grouped Indian-notation figure. Use where the number matters. */
export const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export default { parseNum, fmtINR, INR };
