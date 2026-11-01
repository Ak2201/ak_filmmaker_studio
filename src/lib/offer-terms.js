/* ============================================================
   OFFER TERMS — the one place an offer's renewal terms are worded
   (27 Oct 2026)
   ------------------------------------------------------------
   The owner chooses in the console, per product, whether a purchase is
   ONE-TIME or AUTO-RENEW (billing_settings.pass_mode / plan_mode,
   schema §62). The buyer never picks; they are told, plainly, before
   they pay. Every surface that states a price states its terms through
   this file, so "nothing renews" and "renews until you cancel" can
   never disagree with the mode the server is actually selling.

   Rules the wording keeps (consumer law, and this repo's honesty rule):
   - cancelling is done at the mandate (the Razorpay e-mail link, or the
     bank / UPI app), never in the app: CANCEL_AT_MANDATE says so, so
     "cancel anytime" stays truthful;
   - an auto-renew line ALWAYS says how often, at what amount, and
     "cancel anytime" — in the same sentence as the price;
   - a one-time line says it does not renew;
   - an unknown mode says NEITHER (it never guesses): the caller shows
     the price with `neutral`, and checkout is where the mode is read.

   The server's shape (trial_offer() / price_notice()):
     pass: { ..., mode: 'once' | 'renew' }     plan_mode: 'once' | 'renew'

   PURE AND IMPORT-FREE (startlib with pass-offer.js). Import nothing.
   ============================================================ */

export const MODES = Object.freeze(['once', 'renew']);

/** 'once' | 'renew' | null (unknown — never guessed). */
export function readMode(v) { return v === 'once' || v === 'renew' ? v : null; }

/** "every 7 days" / "every year" / "every day". */
export function everyText(period, days) {
  if (period === 'year') return 'every year';
  const d = Math.round(Number(days));
  if (!(d > 0)) return '';
  return d === 1 ? 'every day' : 'every ' + d + ' days';
}

/** "for 7 days" / "for a year". */
export function forText(period, days) {
  if (period === 'year') return 'for a year';
  const d = Math.round(Number(days));
  if (!(d > 0)) return '';
  return d === 1 ? 'for 1 day' : 'for ' + d + ' days';
}

/**
 * The terms for one offer.
 *   mode    'once' | 'renew' | anything else (unknown)
 *   price   the display price, already formatted ("₹99")
 *   period  'pass' | 'year'
 *   days    the pass length (ignored for a year)
 * Returns { mode, line, short, renews, neutral }:
 *   line    the full sentence for a card or a checkout description
 *   short   a compact chip ("Renews every 7 days · cancel anytime")
 *   renews  true / false / null (unknown)
 *   neutral the price and length only, for an unknown mode
 */
export function offerTerms(mode, price, period, days) {
  const m = readMode(mode);
  const p = String(price || '').trim();
  const every = everyText(period, days), span = forText(period, days);
  const neutral = [p, span].filter(Boolean).join(' ');
  if (m === 'renew' && every) {
    return {
      mode: m, renews: true, neutral,
      line: (p ? p + ' ' : '') + every + ' · renews until you cancel · cancel anytime',
      short: 'Renews ' + every + ' · cancel anytime'
    };
  }
  if (m === 'once' && span) {
    return {
      mode: m, renews: false, neutral,
      line: (p ? p + ' ' : '') + span + ' · one payment, nothing renews',
      short: 'One payment · nothing renews'
    };
  }
  return { mode: null, renews: null, neutral, line: neutral, short: '' };
}

/** Where a cancel happens: at the mandate, never in the app (owner, 28 Oct 2026). */
export const CANCEL_AT_MANDATE = 'To cancel, use the link in your Razorpay mandate e-mail or your bank / UPI app.';

/** After a cancel: "Auto-pay off · access until 3 Nov 2026". */
export function cancelledText(untilLabel) {
  return 'Auto-pay off · access until ' + String(untilLabel || '').trim();
}

/** A running auto-pay: "Renews 3 Nov 2026 · ₹99". */
export function renewsText(dateLabel, price) {
  return 'Renews ' + String(dateLabel || '').trim() + (price ? ' · ' + price : '');
}

export default { CANCEL_AT_MANDATE, MODES, readMode, everyText, forText, offerTerms, cancelledText, renewsText };
