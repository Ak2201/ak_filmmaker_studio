/* ============================================================
   PASS VIEW — what the studio says about the launch pass
   ------------------------------------------------------------
   The app's half of the launch pass (owner, 27 Oct 2026). pass-offer.js
   is the contract: it reads the server's `pass` block and runs the
   countdown on the server's clock. This file builds on it and adds the
   three questions the studio pages ask, each failing CLOSED:

     passPhase()   is the offer running, has the launch offer ENDED, or
                   is there no pass at all ('off')?
     mayBuyPass()  may THIS signed-in account buy it (once per person,
                   never on top of a yearly plan)?
     passRefusal() the sentence for each refusal rzp-order gives.

   WHY 'ended' AND 'off' ARE TWO ANSWERS. The public block says only
   `open`. start_trial() refuses a signup trial while the pass is
   ENABLED, deadline passed or not — so a closed offer whose deadline or
   cap is visibly reached is a pass that still retires the free trial,
   and the page says "The launch offer has ended". A block that is
   closed with no deadline and no cap reached is a switched-off pass:
   the old world, where the trial may still be offered. Anything
   unreadable is 'off' for the pass (no offer) — and a page that would
   offer a TRIAL in 'off' still asks the server, whose start_trial()
   refusal ('pass') is printed, never guessed.

   PURE. Imports pass-offer.js and offer-terms.js only (both import-free).
   ============================================================ */
import { readPass, passState, passPrice, passLength, countdownText, leftText } from './pass-offer.js';
import { offerTerms, readMode, renewsText, cancelledText } from './offer-terms.js';

export { passPrice, passLength, countdownText, leftText };

/** 'open' | 'ended' | 'off'. `offer` is { raw, readAt } (billing.js
 *  passOffer()) or null. */
export function passPhase(offer, nowMs = Date.now()) {
  if (!offer || !offer.raw) return 'off';
  const st = passState(offer.raw, nowMs, offer.readAt || nowMs);
  if (st.state === 'open') return 'open';
  if (st.state === 'none') return 'off';
  const p = st.pass;
  if (p.open) return 'ended';                      // open on the server, ended by the clock or the count
  const serverNow = p.serverNow != null ? p.serverNow + Math.max(0, nowMs - (offer.readAt || nowMs)) : nowMs;
  if (p.endsAt != null && p.endsAt <= serverNow) return 'ended';
  if (p.cap != null && p.left != null && p.left <= 0) return 'ended';
  return 'off';
}

/** passState() for an offer as billing.js hands it, or { state: 'none' }. */
export const passNow = (offer, nowMs = Date.now()) =>
  (offer && offer.raw ? passState(offer.raw, nowMs, offer.readAt || nowMs) : { state: 'none' });

/** The pass's facts for display ({ price, length, plan, days }) or null. */
export function passFacts(offer) {
  const p = offer && offer.raw ? readPass(offer.raw) : null;
  return p ? { price: passPrice(p), length: passLength(p), plan: p.plan, days: p.days } : null;
}

/** One-time or auto-renew, as the SERVER publishes it (pass.mode, §62),
 *  or null when it does not say. */
export const passMode = (offer) => (offer && offer.raw ? readMode(offer.raw.mode) : null);

/** The pass's terms through offer-terms.js — the one place renewal is
 *  worded: { line, short, renews, neutral, mode }. An unknown mode gives
 *  the price and the length only. */
export function passTerms(offer) {
  const f = passFacts(offer);
  return f ? offerTerms(passMode(offer), f.price, 'pass', f.days) : offerTerms(null, '', 'pass', 0);
}

/** A yearly plan (or a grant) is running: the pass is never sold on top
 *  of one (quote_pass 'has_plan'). A running PASS is not a plan here. */
export function holdsPlan(st) {
  if (!st || !st.plan || st.plan === 'free') return false;
  if (st.plan_period === 'pass' || st.pass_active === true) return false;
  return true;
}

/** May this account buy the pass? Every key has to be PRESENT to be
 *  believed: billing_status() from a server without §61 has no
 *  `pass_used`, and that reads as "no" (it cannot sell one either).
 *  `st` null = signed out: the person is not known yet, so the offer
 *  stands and the sign-in comes first. */
export function mayBuyPass(st) {
  if (st == null) return true;
  if (typeof st.pass_used !== 'boolean') return false;
  if (st.pass_used || st.pass_active === true) return false;
  if (st.disabled === true) return false;
  return !holdsPlan(st);
}

/** A pass is running on this account (billing_status()). */
export const onPass = (st) => !!(st && (st.pass_active === true || st.plan_period === 'pass'));

/** The sentence for rzp-order's refusal hint. `fallback` is the server's
 *  own sentence, used when the hint is not one of the six. */
export function passRefusal(hint, fallback) {
  return {
    disabled: 'The launch pass is not on sale right now. The yearly plans are below.',
    closed: 'The launch offer has ended. The yearly plans are below.',
    inr_only: 'The launch pass is sold in Indian rupees only. Switch the prices to rupees to buy it.',
    used: 'You have already had the launch pass on this account. It is once per person; a yearly plan keeps the studio open.',
    has_plan: 'You already have a yearly plan, so the pass is not needed.',
    code: 'A promo code does not apply to the launch pass. Buy it without one.',
    renew_off: 'The terms of this offer changed a moment ago. Read the card again before you pay; nothing was charged.',
    subscribed: 'Auto-pay is already on for this account. Cancel it with Razorpay, the payment service.'
  }[hint] || fallback || 'The pass could not be bought just now. Please try again.';
}

/** "Try it for ₹49" — the one label for the pass's buy button. */
export const passCta = (facts) => (facts && facts.price ? 'Try it for ' + facts.price : 'Try the whole studio');

/** The length of the pass this account bought, in days, from its own
 *  paid payment's span (§52's starts_at / ends_at), or null. */
export function passDays(st) {
  const p = st && Array.isArray(st.payments) && st.payments.find((x) => x && x.period === 'pass' && x.status === 'paid' && x.starts_at && x.ends_at);
  const d = p ? Math.round((Date.parse(p.ends_at) - Date.parse(p.starts_at)) / 86400000) : NaN;
  return d > 0 ? d : null;
}

/** "7-day pass" for a pass of `days` (null → "Launch pass"). */
export const passName = (days) => (days > 0 ? days + '-day pass' : 'Launch pass');

/** "3 Nov 2026" for an ISO time; '' for none. */
export function dayLabel(iso) {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
}

/** THE AUTO-PAY CARD (§62), from billing.js autopayOf(): null when there
 *  is nothing to say, else { led: [word, tone], name, line, canCancel,
 *  until }. `nameOf(product)` names the plan or the pass. The words are
 *  offer-terms.js's (renewsText / cancelledText); nothing here claims a
 *  mode of its own. `now` is a time in ms. */
export function autopaySummary(ap, nameOf, now = Date.now()) {
  if (!ap) return null;
  const name = nameOf ? nameOf(ap.product) : ap.product;
  const until = dayLabel(ap.currentEnd);
  if (ap.live) {
    const due = ap.status === 'halted' || ap.status === 'pending';
    return {
      led: due ? ['Payment due', 'warn'] : ['Auto-pay on', 'ok'],
      name,
      line: renewsText(dayLabel(ap.nextChargeAt || ap.currentEnd), ap.price),
      note: due ? 'The last charge did not go through. Razorpay tries again; your access runs to ' + (until || 'the end of the period paid for') + ' either way.' : '',
      canCancel: true,
      until
    };
  }
  const ends = ap.currentEnd ? Date.parse(ap.currentEnd) : NaN;
  if (Number.isFinite(ends) && ends > now) return { led: ['Auto-pay off', 'warn'], name, line: cancelledText(until), note: '', canCancel: false, until };
  return null;
}

export default { dayLabel, autopaySummary, passPhase, passNow, passFacts, passMode, passTerms, holdsPlan, mayBuyPass, onPass, passRefusal, passCta, passName, passDays, passPrice, passLength, countdownText, leftText };
