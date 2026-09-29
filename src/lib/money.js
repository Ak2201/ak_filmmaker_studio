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

   Anchoring alone was the first fix and it was not enough; see
   parseNum for the case that survived it, and for why the test is a
   whole-string match rather than a suffix test.

   library.js was fixed; hub.js's copy never was, so the hub's
   budget figure and the calculator's could disagree about the same
   data. A third caller then appeared on the dashboard. Three copies
   of one rule is the condition that produced the bug, so the rule
   now lives once, here.
   ============================================================ */

/**
 * Parse a rate or day count a person typed, in Indian notation.
 * Accepts "25,000", "Rs. 25000", "25k", "1.5 lakh", "2 cr", "₹3L",
 * and "5 thousand" (feature.js's copy took it; the others did not).
 * @returns {number} rupees, or 0 for anything unparseable.
 */
export function parseNum(s) {
  if (!s) return 0;
  s = String(s).toLowerCase().replace(/[,\s₹$]/g, '').replace(/rs\.?/g, '');
  // Anchoring is necessary but NOT sufficient, which is the part that
  // is easy to lose. /(lakh|lac|l)$/ is anchored and still fires on
  // "1500 per roll", because the last letter of "roll" is an l — so a
  // ₹1,500 line read as ₹15,00,00,000 on every page at once, which is
  // worse than the two pages disagreeing, not better.
  //
  // A suffix is only a suffix when the WHOLE string is a number
  // followed by it and nothing else. A rate with words in it falls
  // through to the number at the front, so "1500 per roll" is 1500
  // and "3 days" is 3, while "crew 500" stays 0 (no leading number).
  const parts = s.match(/^(\d*\.?\d+)(crore|cr|lakh|lac|l|thousand|thou|k)?$/);
  if (parts) {
    const suffix = parts[2] || '';
    const m = /^(crore|cr)$/.test(suffix)          ? 10000000
            : /^(lakh|lac|l)$/.test(suffix)        ? 100000
            : /^(thousand|thou|k)$/.test(suffix)   ? 1000
            : 1;
    return parseFloat(parts[1]) * m;
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
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

/** Western grouping, for the one thing in the studio that is not
    priced in rupees: international festival entry fees, which are
    quoted and charged in dollars. It lives here rather than in the
    festival page for the reason the whole file exists — a number
    formatter written where it is needed is a number formatter
    written twice by the third caller. Nothing converts between the
    two; a dollar total and a rupee total are reported side by side,
    because adding them would require a rate nobody has. */
export const USD = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export default { parseNum, fmtINR, INR, USD };
