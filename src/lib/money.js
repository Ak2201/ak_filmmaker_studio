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
 * and "5 thousand" (feature.js's copy took it; the others did not),
 * plurals ("2 lakhs", "1.5 crores"), "INR 5000", and a rate tail
 * after the figure ("25k/day", "2 lakh per day").
 * @returns {number} rupees, or 0 for anything unparseable.
 */
export function parseNum(s) {
  if (!s) return 0;
  s = String(s).toLowerCase().replace(/[,\s₹$]/g, '').replace(/rs\.?/g, '').replace(/^inr\.?|inr$/g, '');
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
  //
  // The suffix list takes the PLURAL too — "2 lakhs", "1.5 crores",
  // "12 lacs", "10 thousands" are how Indian English writes them, and
  // without the `s` they fell through to the bare 2, 1.5, 12, 10: a
  // figure 100,000x too small and no warning. ("crs" is not offered:
  // the `rs` strip above has already eaten it.) And a suffix may carry
  // a RATE tail — "/day" or "per day" — which names the unit and not
  // the magnitude: "25k/day" is 25,000, not 25. The tail is only taken
  // whole, after the number and its suffix, so "1500 per roll" is still
  // 1500 and "1 lens day" is still 1.
  const parts = s.match(/^(\d*\.?\d+)(crores?|cr|lakhs?|lacs?|l|thousands?|thou|k)?(?:(?:\/|per)[a-z]+)?$/);
  if (parts) {
    const suffix = parts[2] || '';
    const m = /^(crores?|cr)$/.test(suffix)         ? 10000000
            : /^(lakhs?|lacs?|l)$/.test(suffix)     ? 100000
            : /^(thousands?|thou|k)$/.test(suffix)  ? 1000
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

/* ---- a budget in dollars (21 Oct 2026, BUDGET-USD) ---------------
   A film made outside India budgets in US dollars. The two calls below
   take the budget's currency and, for anything but 'USD', ARE parseNum
   and the rupee figures above, so an Indian budget reads and prints
   exactly as it always did. The dollar half follows the same
   whole-string rule: a suffix counts only when the entire string is a
   number and that suffix, so "1.5k" is 1500, "2m" is 2,000,000,
   "$2,000" is 2000, and "500 per roll" or "3 mins" fall through to the
   number at the front. Indian suffixes are not dollar suffixes: in a
   dollar budget "1.5l" is 1.5, never 150,000. Nothing here converts
   between the two currencies. Named exports only, and the default
   export below is unchanged. */

/** Parse a figure a person typed into a budget in `currency`. */
export function parseAmount(s, currency) {
  if (currency !== 'USD') return parseNum(s);
  if (!s) return 0;
  s = String(s).toLowerCase().replace(/[,\s$]/g, '').replace(/^usd?/, '').replace(/usd$/, '');
  // Same shape as parseNum's: the plural, and a rate tail taken whole
  // after the number and its suffix ("1.5k/day", "500 per day").
  const parts = s.match(/^(\d*\.?\d+)(millions?|mn|m|thousands?|thou|k)?(?:(?:\/|per)[a-z]+)?$/);
  if (parts) {
    const suffix = parts[2] || '';
    return parseFloat(parts[1]) * (/^m/.test(suffix) ? 1000000 : suffix ? 1000 : 1);
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** A budget figure in `currency`: exact and grouped by default
    ('₹ 54,000', '$12,500', a real minus for a negative), or the
    glance-sized magnitude when `short` (fmtINR's '₹ 1.5 L', or
    '$1.25M', '$45k'). */
export function fmtMoney(n, currency, short) {
  if (currency !== 'USD' && short) return fmtINR(n);
  const v = Math.abs(n || 0);
  const sign = n < 0 ? '−' : '';
  if (currency !== 'USD') return sign + '₹ ' + INR.format(Math.round(v));
  if (short && v >= 1000000) return sign + '$' + (v / 1000000).toFixed(2).replace(/\.?0+$/, '') + 'M';
  if (short && v >= 1000) return sign + '$' + Math.round(v / 1000) + 'k';
  return sign + '$' + USD.format(Math.round(v));
}

export default { parseNum, fmtINR, INR, USD };
