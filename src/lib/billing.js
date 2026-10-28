/* ============================================================
   BILLING — plans, the current plan, and paying for one
   ------------------------------------------------------------
   The browser's half of schema section 16 and the three Razorpay edge
   functions. It can READ (the active plans, billing_status()) and it
   can START a purchase; everything that decides anything — the price,
   the signature, the activation, the limits — happens on the server.

   WHAT A PURCHASE LOOKS LIKE FROM HERE
     1. rzp-order (edge function)  -> order id, amount, public key id
     2. Razorpay Checkout opens over the page; the buyer pays
     3. rzp-verify (edge function) -> HMAC checked, plan activated
     4. billing_status() re-read; cloud.js runGate() re-run, because
        PAYING GRANTS ENTRY and a non-member who just paid is a member
   If 3 never happens (tab closed), the webhook does the same activation
   server-side, and the next billing_status() shows it.

   THE CHECKOUT SCRIPT is loaded from checkout.razorpay.com on demand,
   never at page load: a page about shots should not pay for a payment
   form it may never open. Its origin is in connect-src/script-src/
   frame-src in BOTH vercel.json and netlify.toml, or the browser
   refuses it before anything here runs.

   Nothing here writes to localStorage. The plan is a fact about the
   account and is read from the server every time.
   ============================================================ */
import Store from './store.js';
import { BRAND } from './brand.js';
import { errorSentence } from './gate.js';
import { bumpEvent, countTrialStart, countPassBuy, trialOffer } from './funnel.js';
import { passNow, passFacts, passRefusal } from './pass-view.js';
import { offerTerms, readMode } from './offer-terms.js';
import { PLAN_ORDER, planName } from './plans.js';
import { fmtPaise, priceFor, perDayPaise, PLAN_DAYS, parseRupees, PERIODS, normalisePromo, isPromoShaped, promoLabel } from '../../supabase/functions/_shared/razorpay.js';

export { fmtPaise, priceFor, perDayPaise, PLAN_DAYS, parseRupees, PERIODS, normalisePromo, isPromoShaped, promoLabel };

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
/** Public. The secret never leaves the edge functions. */
export const RAZORPAY_KEY_ID = String(env.VITE_RAZORPAY_KEY_ID || '').trim();
export const paymentsConfigured = () => !!RAZORPAY_KEY_ID;

/* The tier ids and names are pure (src/lib/plans.js) so the build can
   stamp them into start.html; re-exported here for every caller. */
export { PLAN_ORDER, planName };
export const planRank = (id) => Math.max(0, PLAN_ORDER.indexOf(id));

const cloud = () => window.StudioCloud || null;
/* The console's owner-only dollar writers (setUsdPrice / setUsdCheckout)
   live in billing-admin.js over admin-api.js's usdCall, not in this CORE
   file, so the first paint of every other page does not carry them
   (scripts/budget.json, us/market 22 Oct 2026). */
async function client() {
  const c = cloud();
  if (!c || !c.ensureClient) throw new Error('Cloud is not available on this page.');
  const sb = await c.ensureClient();
  if (!sb) throw new Error('This build has no cloud project configured.');
  return sb;
}

/** The plans table, in display order. Cached for the page; invalidated
 *  by refreshPlans() after an admin edit. */
let _plans = null;
export async function listPlans({ fresh = false } = {}) {
  if (_plans && !fresh) return _plans;
  const sb = await client();
  const { data, error } = await sb.from('plans').select('*').order('sort');
  if (error) throw error;
  _plans = (data || []).map((p) => ({ ...p, limits: p.limits || {} }));
  return _plans;
}
export const refreshPlans = () => listPlans({ fresh: true });

/** billing_status(): plan, limits, usage, account, recent payments. */
export async function status() {
  const sb = await client();
  const { data, error } = await sb.rpc('billing_status');
  if (error) throw error;
  return data || null;
}

/**
 * quote_order() (schema section 20): what `planId` costs with `code`.
 * Resolves to { ok, amount_paise, list_paise, discount_paise, code,
 * reason, sentence }. A refused code is NOT an error — ok is false and
 * `sentence` says why — so the card can print it. The number here is
 * for display; the order re-quotes server-side and the client never
 * sends a price.
 */
export async function quote(planId, code, currency) {
  const sb = await client();
  const args = { p_plan: planId, p_code: normalisePromo(code) || null };
  /* §56 (docs/US-MARKET-PLAN.md §C3): the 3-arg quote_order prices a
     currency. A database without §56 answers PGRST202 for it, and the
     2-arg rupee quote is then the honest answer (the order is in rupees
     too, because rzp-order is priced by the same database). The answer
     carries `currency`; an older one has none and is rupees. */
  if (currency === 'USD') {
    const r = await sb.rpc('quote_order', { ...args, p_currency: 'USD' });
    if (!r.error) return r.data || null;
    if (r.error.code !== 'PGRST202') throw r.error;
  }
  const { data, error } = await sb.rpc('quote_order', args);
  if (error) throw error;
  return data || null;
}

/** `limits[key]`: a number, or null/undefined for unlimited. */
export const cap = (limits, key) => (limits && Number.isInteger(limits[key]) ? limits[key] : null);
/** Is there room under the cap? */
export const hasRoom = (limits, key, used) => { const c = cap(limits, key); return c === null || used < c; };
export const isUnlimited = (limits, key) => cap(limits, key) === null;

/** Sentence for a limit the user has hit. */
export function limitSentence(plan, limits, key) {
  const c = cap(limits, key);
  const name = planName(plan);
  const noun = { projects: 'cloud project', shares: 'live share link', collaborators: 'collaborator per film', seats: 'seat' }[key] || key;
  if (c === null) return '';
  return `Your ${name} plan allows ${c} ${noun}${c === 1 ? '' : 's'}.`;
}

/** A P0402 from the database: the plan said no. */
export const isPlanLimit = (err) => !!err && (err.code === 'P0402' || /plan (syncs|allows)|which allows/i.test(String(err.message || '')));

/* ---- Checkout ------------------------------------------------- */

let _checkoutReady = null;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve();
  if (_checkoutReady) return _checkoutReady;
  _checkoutReady = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { _checkoutReady = null; reject(new Error('The payment form could not be loaded. Check your connection and try again.')); };
    document.head.append(s);
  });
  return _checkoutReady;
}

export class BillingError extends Error {
  constructor(message, code) { super(message); this.code = code || ''; }
}

async function invoke(name, body, { allowPending = false } = {}) {
  const sb = await client();
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    // supabase-js wraps a non-2xx as FunctionsHttpError with the Response on `context`.
    let detail = '';
    let hint = '';
    try { const j = await error.context?.json?.(); detail = (j && j.error) || ''; hint = (j && typeof j.reason === 'string' && j.reason) || (j && typeof j.hint === 'string' && j.hint) || ''; } catch (e) { /* no body */ }
    /* A 401 is the session not being accepted: retrying cannot work, so
       the sentence says to sign in again rather than "try again". */
    const status = error.context && error.context.status;
    const fallback = status === 401
      ? 'Your sign-in was not accepted. Sign out, sign in again, and then retry.'
      : 'The payment service answered with an error. Try again in a moment.';
    const err = new BillingError(detail || errorSentence(error, fallback), 'edge');
    /* A refusal the server NAMED in `reason` (§61's pass: 'disabled' |
       'closed' | 'inr_only' | 'used' | 'has_plan' | 'code'; a year's:
       'currency', 'downgrade', …), for a caller that words it. */
    err.hint = hint;
    /* Whether the SERVER said this (a sentence in the body) or nothing
       came back at all — a dropped connection, a gateway timeout. After
       a payment the two mean different things; see buy(). */
    err.answered = !!detail;
    throw err;
  }
  // §51: rzp-verify answers 202 { pending } when Razorpay has authorized but
  // not yet captured the money — not a failure, and not a reason to pay again.
  /* A subscription's verify answers 200 { ok, pending } by design: the
     signature is checked and the webhook applies the charge. */
  if (data && data.pending && !(allowPending && data.ok === true)) throw new BillingError(data.error || 'Your payment is still being confirmed.', 'pending');
  if (data && data.error) throw new BillingError(data.error, 'edge');
  return data;
}

/**
 * Buy `planId` for a year (schema section 52: renewing stacks a year onto
 * the time left; nothing is charged automatically).
 * Resolves to { plan, account_id } once the server has verified and
 * activated; rejects with code 'dismissed' if the buyer closed
 * Checkout. `onStatus(text)` narrates for the UI. `code` is a promo
 * code (section 20): the server re-quotes it and a refused one comes
 * back as an edge error with the sentence to show. `currency` is the
 * ORDER's currency, 'INR' or 'USD' (§56): the client chooses the
 * currency and never the amount, and sends 'USD' only once the server
 * has said dollars are charged (price-model.js orderCurrency()).
 */
/** The card's sentence for a yearly purchase that auto-renew cannot carry
 *  (an upgrade credited with the year running, or a year bought right
 *  after a weekly auto-pay was stopped): it is paid once. */
export const UPGRADE_ONCE = 'This upgrade is paid once; auto-pay can start at your next renewal.';

export async function buy(planId, period = 'year', { accountId = null, onStatus = () => {}, code = null, currency = 'INR', description = '', shownMode = null, passStopped = false } = {}) {
  if (!paymentsConfigured()) throw new BillingError('Payments are not switched on for this studio yet.', 'notconfigured');
  /* 'pass' is named here as well as in PERIODS: the shared list gains it
     with §61's edge functions, and this file must not refuse the pass in
     the meantime. The server still decides (rzp-order re-checks). */
  if (!PERIODS.includes(period) && period !== 'pass') throw new BillingError('Plans are bought a year at a time.', 'period');
  const isPass = period === 'pass';
  /* ONE-TIME OR AUTO-RENEW is the SERVER's (billing_settings §62), read
     fresh here: the card said one or the other, and if the owner changed
     it since, the buyer is told before anything opens — never charged on
     terms the card did not state. A server without §62 says neither, and
     that buys the one-time way, as it always has. */
  const modes = await offerModes({ fresh: true });
  const mode = isPass ? modes.pass : modes.plan;
  if (shownMode && mode && shownMode !== mode) {
    try { Store.notify('billing:changed', null); } catch (e) { /* nobody listening */ }
    throw new BillingError('The terms of this offer changed a moment ago. Read the card again before you pay; nothing was charged.', 'terms');
  }
  /* A SUBSCRIPTION CANNOT CARRY AN UPGRADE CREDIT (§62 quote_subscription
     'upgrade'), and a weekly auto-pay just stopped still counts as live
     until its period ends ('subscribed'): either way the year is bought
     the one-time way (create_pending_payment works in either mode), and
     the result says so (`paidOnce`). */
  let paidOnce = false;
  if (mode === 'renew') {
    try { return await subscribe(planId, period, { accountId, onStatus, currency: isPass ? 'INR' : currency }); }
    catch (e) {
      if (isPass || !e || !(e.hint === 'upgrade' || (e.hint === 'subscribed' && passStopped))) throw e;
      paidOnce = true;
      onStatus(UPGRADE_ONCE);
    }
  }
  const termsMode = paidOnce ? 'once' : mode;
  bumpEvent('checkout_start');   // §29 daily count, fire-and-forget
  onStatus('Preparing your order…');
  /* The pass takes no promo code and is sold in rupees only (quote_pass). */
  const [order] = await Promise.all([invoke('rzp-order', isPass
    ? { plan: planId, period, account_id: accountId, currency: 'INR' }
    : { plan: planId, period, account_id: accountId, code: normalisePromo(code) || null, currency: currency === 'USD' ? 'USD' : 'INR' }), loadCheckout()]);
  if (!order || !order.order_id) throw new BillingError('No order came back.', 'edge');

  onStatus('Opening the payment form…');
  const response = await new Promise((resolve, reject) => {
    let settled = false;
    const rz = new window.Razorpay({
      key: order.key_id || RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency || 'INR',
      order_id: order.order_id,
      name: BRAND.name,
      /* THE MARK ON THE PAYMENT FORM. Checkout is Razorpay's own
         iframe on THEIR origin, so this has to be an absolute,
         publicly reachable URL — a relative path or a localhost one
         resolves to nothing and the form just draws without a logo,
         silently. That silence is why it was missing: nothing errors,
         the payment works, and the only symptom is a buyer handing
         over money to a form with no name on it.

         Built from BRAND.host rather than written out, so it follows
         a domain move with everything else instead of becoming one
         more place the old address survives. 192px square is what
         Razorpay draws it at. */
      image: `https://${BRAND.host}/icons/icon-192.png`,
      description: description || `${order.plan_name || planName(planId)} · ${onceTerms(order, termsMode)}${order.promo_code ? ' · code ' + order.promo_code : ''}`,
      prefill: order.prefill || {},
      notes: { plan: planId, period, promo_code: order.promo_code || '' },
      ...(themeColour() ? { theme: { color: themeColour() } } : {}),
      handler: (resp) => { settled = true; resolve(resp); },
      modal: { ondismiss: () => {
        if (settled) return;
        settled = true;
        reject(failure
          ? new BillingError(failure, 'failed')
          : new BillingError('Payment cancelled. Nothing was charged.', 'dismissed'));
      } }
    });
    /* Checkout keeps its form open after a failed attempt so the buyer
       can retry. Rejecting here made a retry that then SUCCEEDED land on
       an already-rejected promise: rzp-verify never ran, the card said
       "did not go through" and BUY came back while the webhook activated
       the plan — an invitation to pay twice. Remember the failure; the
       promise settles on success or on the form closing. */
    let failure = '';
    rz.on('payment.failed', (e) => {
      failure = (e && e.error && e.error.description) || 'The payment did not go through. Nothing was charged.';
    });
    rz.open();
  });

  onStatus('Confirming with the studio…');
  let result;
  try {
    result = await invoke('rzp-verify', {
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature
    });
  } catch (err) {
    throw afterPayment(err, planId);
  }
  if (isPass) countPassBuy(); else bumpEvent('purchase');
  Store.notify('billing:changed', result);
  // Paying grants entry: a non-member is a member now. Ask the gate again.
  try { const c = cloud(); if (c && c.runGate) await c.runGate(); } catch (e) { /* the status call will say */ }
  return paidOnce && result && typeof result === 'object' ? { ...result, paidOnce: true } : result;
}

/* The one-time checkout's terms line: offerTerms() with the ORDER's own
   figure ('once' says it does not renew; a server without §62 says only
   the price and the length). */
function onceTerms(order, mode) {
  const price = Number.isInteger(order.amount) ? fmtMinor(order.amount, order.currency) : '';
  const t = offerTerms(mode, price, order.period === 'pass' ? 'pass' : 'year', order.days);
  return t.line || '1 year, full access';
}
/* "₹7,999" / "$12.50": a price-model.js fmtMinor() twin. Not imported:
   price-model.js is not in CORE, and CORE (this file) importing a page
   chunk reorders module evaluation on every page (the site gate's veil
   lifted before it answered, prove:gate). */
function fmtMinor(minor, currency) {
  const usd = currency === 'USD';
  const n = Math.round(Number(minor) || 0);
  const whole = Math.floor(Math.abs(n) / 100), frac = Math.abs(n) % 100;
  return (n < 0 ? '-' : '') + (usd ? '$' : '₹') + whole.toLocaleString(usd ? 'en-US' : 'en-IN') + (frac ? '.' + String(frac).padStart(2, '0') : '');
}

/* ---- auto-renew (§62) ---------------------------------------------
   A SUBSCRIPTION, for a product the owner has set to auto-renew. The
   same shape as an order, one step longer:
     1. rzp-subscribe (edge function) -> subscription id, key, amount
     2. Razorpay Checkout opens with that subscription_id; the buyer
        authorises the mandate and the first charge
     3. rzp-verify checks HMAC(payment_id|subscription_id) and answers
        { ok, pending }: the WEBHOOK applies the charge (Razorpay
        captures a subscription charge itself)
     4. billing_status() is polled until the charge has landed; if it
        has not by the last poll, the error is afterPayment()'s "do not
        pay again" and the page keeps re-reading.
   The checkout's description is offerTerms('renew', …): how often, the
   amount and "cancel anytime", in the one sentence. */
const POLL_MS = [800, 1500, 2500, 4000, 6000, 8000];
async function subscribe(planId, period, { accountId, onStatus, currency }) {
  bumpEvent('checkout_start');
  onStatus('Preparing your auto-pay…');
  const timer1 = setTimeout(() => { onStatus('Connecting to secure payment gateway…'); }, 2000);
  const timer2 = setTimeout(() => { onStatus('Almost ready…'); }, 4500);

  const product = period === 'pass' ? 'pass' : planId;
  const requestSub = () => invoke('rzp-subscribe', { product, account_id: accountId, currency: currency === 'USD' ? 'USD' : 'INR' });

  const ask = requestSub().catch(async (e) => {
    /* If a user closed a previous checkout session and clicked Buy again within 5s,
       the edge function's 5-second threshold hasn't expired yet, causing hint: 'subscribed'.
       If the user does not actually have an active auto-pay subscription, reset and retry once. */
    if (e && e.hint === 'subscribed') {
      let st = null;
      try { st = await status(); } catch (err) { st = null; }
      const ap = autopayOf(st);
      if (!ap || (!ap.live && !ap.open)) {
        onStatus('Resetting previous payment session…');
        await new Promise((r) => setTimeout(r, 4200));
        return requestSub();
      }
    }
    /* the two refusals only a subscription has; a plan's other reasons
       are rzp-order's and come back with the server's own sentence */
    if (e && product !== 'pass' && (e.hint === 'renew_off' || e.hint === 'subscribed')) e.message = passRefusal(e.hint, e.message);
    if (e && e.hint === 'renew_off') { _passAt = 0; try { Store.notify('billing:changed', null); } catch (x) { /* nobody listening */ } }
    throw e;
  });

  let sub = null;
  try {
    const [res] = await Promise.all([ask, loadCheckout()]);
    sub = res;
  } finally {
    clearTimeout(timer1);
    clearTimeout(timer2);
  }
  if (!sub || !sub.subscription_id) throw new BillingError('No subscription came back.', 'edge');
  const price = Number.isInteger(sub.amount) ? fmtMinor(sub.amount, sub.currency) : '';
  const terms = offerTerms('renew', price, sub.period === 'year' ? 'year' : 'pass', sub.days);
  onStatus('Opening the payment form…');
  const response = await new Promise((resolve, reject) => {
    let settled = false;
    let failure = '';
    const rz = new window.Razorpay({
      key: sub.key || RAZORPAY_KEY_ID,
      subscription_id: sub.subscription_id,
      recurring: true,
      name: BRAND.name,
      image: `https://${BRAND.host}/icons/icon-192.png`,
      description: (period === 'pass' ? 'The whole studio · ' : (sub.plan_name || planName(planId)) + ' · ') + (terms.line || sub.description || ''),
      prefill: sub.prefill || {},
      notes: { product, period },
      ...(themeColour() ? { theme: { color: themeColour() } } : {}),
      handler: (resp) => { settled = true; resolve(resp); },
      modal: { ondismiss: () => {
        if (settled) return;
        settled = true;
        reject(failure ? new BillingError(failure, 'failed') : new BillingError('Payment cancelled. Nothing was charged.', 'dismissed'));
      } }
    });
    rz.on('payment.failed', (e) => { failure = (e && e.error && e.error.description) || 'The payment did not go through. Nothing was charged.'; });
    rz.open();
  });
  onStatus('Confirming with the studio…');
  try {
    await invoke('rzp-verify', {
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_subscription_id: response.razorpay_subscription_id,
      razorpay_signature: response.razorpay_signature
    }, { allowPending: true });
  } catch (err) {
    throw afterPayment(err, planId);
  }
  /* The charge is the webhook's to apply: wait for it to land. */
  let st = null;
  for (const ms of POLL_MS) {
    await new Promise((r) => setTimeout(r, ms));
    let got = null;
    try { got = await status(); } catch (e) { got = null; }
    if (landed(got, product)) { st = got; break; }
  }
  if (!st) throw afterPayment(new BillingError('Your payment is still being confirmed.', 'pending'), planId);
  if (period === 'pass') countPassBuy(); else bumpEvent('purchase');
  Store.notify('billing:changed', st);
  try { const c = cloud(); if (c && c.runGate) await c.runGate(); } catch (e) { /* the status call will say */ }
  return { ok: true, plan: st.plan, account_id: st.account_id, autopay: st.autopay || null };
}
/* Has the first charge of `product` arrived on this account? */
function landed(st, product) {
  if (!st) return false;
  if (product === 'pass') return st.pass_active === true || st.plan_period === 'pass';
  return st.plan === product && !st.lapsed;
}

/** Stop auto-pay. Nothing more is charged; access runs to the end of the
 *  period already paid for. Resolves to { ok, current_end }. */
export async function cancelAutopay() {
  const out = await invoke('rzp-cancel', {});
  Store.notify('billing:changed', null);
  return out || { ok: true, current_end: null };
}

/** billing_status().autopay, normalised, or null when there is none (or
 *  the server has no §62). `live` = it will charge again; `open` = not
 *  yet ended (a cancelled one runs to its period end). */
const LIVE = ['created', 'authenticated', 'active', 'pending', 'halted'];
export function autopayOf(st) {
  const a = st && st.autopay;
  if (!a || typeof a !== 'object' || typeof a.status !== 'string') return null;
  const minor = Number.isInteger(a.amount_minor) ? a.amount_minor : null;
  return {
    status: a.status,
    product: a.product || '',
    period: a.period === 'year' || a.period === 'pass' ? a.period : (a.product === 'pass' ? 'pass' : 'year'),
    amountMinor: minor,
    currency: a.currency === 'USD' ? 'USD' : 'INR',
    price: minor != null ? fmtMinor(minor, a.currency) : '',
    currentEnd: a.current_end || null,
    nextChargeAt: a.next_charge_at || null,
    cancelAtEnd: a.cancel_at_period_end === true,
    live: LIVE.includes(a.status) && a.cancel_at_period_end !== true,
    open: LIVE.includes(a.status)
  };
}

/* MONEY HAS MOVED AND THE STUDIO HAS NOT SAID YES. Checkout returned a
   payment, then rzp-verify answered 202 { pending } (authorized, capture
   not yet seen), failed on the network, or refused. Rejecting the buy
   like any other failure put the same BUY button back over billing
   read BEFORE the payment — nothing refreshed it, because the notify
   and the gate run sat after the await that threw — while the webhook
   activated the first payment in the background. A second press was a
   second order at full price, stacked as a second year (§52): the
   payment.failed note below calls that an invitation to pay twice.

   So the error says it came AFTER a payment (`afterPayment`), and
   whether the outcome is still UNKNOWN (`unconfirmed`: pending, or no
   answer at all) as against a sentence the server gave. The cards hold
   the plan on "confirming" for an unconfirmed one. Billing is re-read
   now and three more times as the webhook has time to land, so the
   page moves on by itself when the plan arrives. */
const RECHECK_MS = [0, 5000, 15000, 45000];
function afterPayment(err, planId) {
  const e = err instanceof BillingError ? err : new BillingError((err && err.message) || 'The payment service did not answer.', 'edge');
  e.afterPayment = true;
  e.plan = planId;
  e.unconfirmed = e.code === 'pending' || !e.answered;
  if (e.unconfirmed && e.code !== 'pending') {
    e.message = 'Your payment went through, but the studio could not confirm it yet. Do not pay again — this page will update when it is confirmed. If it does not, write to us and quote the payment.';
  }
  for (const ms of RECHECK_MS) {
    setTimeout(() => {
      try { Store.notify('billing:changed', null); } catch (x) { /* nobody listening */ }
      try { const c = cloud(); if (c && c.runGate) c.runGate(); } catch (x) { /* the status call will say */ }
    }, ms);
  }
  return e;
}

/* Checkout is Razorpay's iframe, so it takes a literal rather than a
   token; the literal is READ from --brand, never typed here. If the
   token is missing the form keeps Razorpay's own colour. */
function themeColour() {
  try { return getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(); }
  catch (e) { return ''; }
}

/* ---- refunds (schema section 27) ------------------------------
   A customer can only ASK. The money moves in the rzp-refund edge
   function, which an administrator calls; the server re-checks the
   role, the payment and the amount. Supabase stays lazy: every one of
   these goes through client() first. A database where section 27 has
   not run answers PGRST202 / 42P01 — callers treat that as "no refund
   features here", see isRefundsMissing(). */
export const REFUND_CATEGORIES = [
  ['duplicate_charge', 'I was charged twice'],
  ['not_delivered', 'I was charged but my plan did not arrive'],
  ['legal', 'Another ground the law gives me'],
  ['other', 'Something else']
];
export const isRefundsMissing = (e) => !!e && (e.code === 'PGRST202' || e.code === '42P01' || /Could not find|does not exist/i.test(String(e.message || '')));

/** The switch, public: should Settings draw the request block at all? */
export async function refundRequestsEnabled() {
  const sb = await client();
  const { data, error } = await sb.rpc('refund_requests_enabled');
  if (error) throw error;
  return data === true;
}
/** { enabled, eligible, can_request, payment, latest } for the signed-in account. */
export async function myRefundStatus() {
  const sb = await client();
  const { data, error } = await sb.rpc('my_refund_status');
  if (error) throw error;
  return data || null;
}
/** File a request (not a refund). Resolves to the new request row. */
export async function requestRefund(paymentId, category, message = '') {
  const sb = await client();
  const { data, error } = await sb.rpc('request_refund', { p_payment_id: paymentId, p_category: category, p_message: String(message || '').trim() });
  if (error) throw error;
  return data;
}

/* ---- the trial (§30) -------------------------------------------- */

/** Claim this account's trial. Called once, on the first landing after a
 *  sign-in, by whoever notices the user is a stranger.
 *
 *  IT DOES NOT THROW for the ordinary refusals. The server answers
 *  { started: false, reason: 'used' | 'paid' | 'disabled' } for "you have
 *  had one", "you have already bought" and "the owner switched trials
 *  off", because this runs on every landing and a caller that had to
 *  try/catch to tell the wall from the studio would get it wrong once.
 *  It DOES throw for the three exceptional cases — not signed in,
 *  disabled, declined — which are 42501s and deserve a sentence.
 *
 *  On a success the member row now exists, so the caller must run the
 *  gate again (cloud.runGate()) before the app will open: that row is
 *  what sitegate.js reads. Billing.buy() does the same two-step. */
export async function startTrial() {
  const sb = await client();
  const { data, error } = await sb.rpc('start_trial');
  if (error) throw error;
  if (data && data.started === true) countTrialStart();   // §58 daily count, fire-and-forget
  return data || { started: false, reason: 'unknown' };
}

/* ---- the launch pass (§61) --------------------------------------
   A paid week of the whole studio, sold as a launch offer with a real
   end (src/lib/pass-offer.js says what "true scarcity" means here). The
   offer is public — trial_offer().pass, anon, the same for every
   visitor — so it is read with funnel.js's plain fetch, and a page that
   only shows it never loads the SDK. */

let _pass = null;          // { raw, readAt } | null, once asked
let _passAsk = null;       // the in-flight read (shared, like ensureClient)
let _passAt = 0;
const PASS_FRESH_MS = 60000;
/** The pass offer as { raw, readAt } — `raw` is the server's block,
 *  `readAt` the local time it arrived (passState() measures the
 *  countdown from the server's `now` plus the time since) — or null
 *  when there is none to show. FAILS CLOSED: unconfigured, offline, a
 *  database without §61, a malformed block, all null. Never throws. */
export function passOffer({ fresh = false } = {}) {
  if (!fresh && _passAsk) return _passAsk;
  if (!fresh && _passAt && Date.now() - _passAt < PASS_FRESH_MS) return Promise.resolve(_pass);
  _passAsk = trialOffer().then((t) => {
    _modes = modesFrom(t);
    const raw = t && t.pass && typeof t.pass === 'object' ? t.pass : null;
    _pass = raw && passFacts({ raw }) ? { raw, readAt: Date.now() } : null;
    _passAt = Date.now();
    return _pass;
  }, () => { _pass = null; _modes = NO_MODES; _passAt = Date.now(); return null; })
    .finally(() => { _passAsk = null; });
  return _passAsk;
}
/** The last answer passOffer() got, synchronously (null before one). */
export const cachedPassOffer = () => _pass;

/* THE MODES (§62): one-time or auto-renew, per product, the owner's
   choice in the console, published by trial_offer() (pass.mode and
   plan_mode). Read from the same answer as the pass. null = the server
   did not say (no §62): a card then states neither, and buying takes
   the one-time path it always took. */
const NO_MODES = Object.freeze({ pass: null, plan: null, known: false });
let _modes = NO_MODES;
function modesFrom(t) {
  if (!t || typeof t !== 'object') return NO_MODES;
  return { pass: readMode(t.pass && t.pass.mode), plan: readMode(t.plan_mode), known: true };
}
/** { pass, plan } — each 'once' | 'renew' | null. Never throws. */
export async function offerModes({ fresh = false } = {}) {
  await passOffer({ fresh });
  return _modes;
}
/** The last modes read, synchronously (both null before a read). */
export const cachedModes = () => _modes;
/** Has a read of the modes come back yet (either way)? */
export const modesRead = () => _passAt > 0;

/** Buy the launch pass for this account. The price, the length and the
 *  plan are the SERVER's: the client names only the period. Refusals
 *  arrive as a BillingError whose message is the sentence to show (the
 *  hint words it: passRefusal()). */
export async function buyPass({ accountId = null, onStatus = () => {}, shownMode = null } = {}) {
  const offer = await passOffer({ fresh: true });
  const st = passNow(offer);
  if (st.state !== 'open') {
    throw new BillingError(passRefusal(st.state === 'closed' ? 'closed' : 'disabled'), st.state === 'closed' ? 'closed' : 'disabled');
  }
  const f = passFacts(offer);
  const t = offerTerms(readMode(offer.raw && offer.raw.mode), f.price, 'pass', f.days);
  try {
    return await buy(f.plan, 'pass', { accountId, onStatus, currency: 'INR', shownMode, description: 'The whole studio · ' + (t.line || f.length) });
  } catch (e) {
    if (e && e.hint) e.message = passRefusal(e.hint, e.message);
    if (e && e.hint === 'closed') _passAt = 0;   // the next read asks again
    throw e;
  }
}

/** price_notice() (§30.7): what every active plan costs RIGHT NOW, what
 *  it will cost, when that changes, and how many founding seats are
 *  gone. `{ seats_total, seats_taken, plans:[{id,name,price_paise,
 *  next_price_paise,next_price_at,rising}] }`.
 *
 *  Anon-callable, because the signed-out landing page reads it — but it
 *  is the CONSOLE's read as well, and deliberately the same one: an
 *  owner about to make a public commitment should be looking at the
 *  figures the public is looking at, not at a second query that could
 *  disagree. `seats_total` and `seats_taken` are null when no rise is
 *  pending; the server publishes the buyer count only while a countdown
 *  is on screen explaining what it means. */
export async function priceNotice(currency) {
  const sb = await client();
  /* price_notice(text) (§31, §56): the same keys plus one currency's
     display figures and `usd_checkout`. The zero-argument call is §30's
     and stays exactly as it was. */
  const { data, error } = await sb.rpc('price_notice', currency ? { p_currency: currency } : undefined);
  if (error) throw error;
  return data || null;
}

/* ---- admin ---------------------------------------------------- */

export const admin = {
  /** §30.9. Schedule a plan's price rise, or clear one (`paise` null).
   *  The server REFUSES a new price at or below the current one and a
   *  price with no date; the console refuses both before it gets here,
   *  so the server's sentence is the backstop rather than the UI. `at`
   *  is an ISO string. Resolves to a fresh price_notice(). */
  async setNextPrice(planId, paise, at) {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_set_next_price', {
      p_plan: planId, p_paise: paise == null ? null : Math.round(paise), p_at: at || null
    });
    if (error) throw error;
    _plans = null;
    return data;
  },
  /** §30.9. Support's lever: give one person more time. Unlike
   *  start_trial() this does not refuse a second trial — an
   *  administrator asking for one has already decided. */
  async grantTrial(userId, minutes, note) {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_grant_trial', { p_user: userId, p_minutes: minutes, p_note: note || null });
    if (error) throw error;
    return data;
  },
  async setPlan(id, patch) {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_set_plan', { p_id: id, p_patch: patch });
    if (error) throw error;
    _plans = null;
    return data;
  },
  async listPayments(limit = 200) {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_list_payments', { p_limit: limit });
    if (error) throw error;
    return data || [];
  },
  async grantPlan(userId, planId, days, note) {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_grant_plan', { p_user: userId, p_plan: planId, p_days: days, p_note: note || null });
    if (error) throw error;
    return data;
  },
  /** Refund a captured payment through Razorpay (the rzp-refund edge
   *  function; admin-checked there). `amountPaise` null = in full. A
   *  `requestId` settles that customer request on success. Resolves to
   *  { ok, refund_id, status: 'pending'|'processed', amount_paise, email, plan_ended }. */
  async refund(paymentId, { amountPaise = null, reason, requestId = null } = {}) {
    const out = await invoke('rzp-refund', { payment_id: paymentId, amount_paise: amountPaise, reason, request_id: requestId });
    Store.notify('billing:changed', out);
    return out;
  },
  /** §35. Send one invoice's receipt e-mail again (rzp-verify's
   *  resend path; admin-checked there). Resolves to { ok, sent }. */
  async resendReceipt(invoiceId) {
    return invoke('rzp-verify', { resend_invoice: invoiceId });
  },
  async listRefunds() {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_list_refunds');
    if (error) throw error;
    return data || [];
  },
  async listRefundRequests(status = null) {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_list_refund_requests', { p_status: status });
    if (error) throw error;
    return data || [];
  },
  /** decision: 'declined' (note required) | 'approved' (mark only; the refund is admin.refund). */
  async decideRefundRequest(id, decision, note = null) {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_decide_refund_request', { p_id: id, p_decision: decision, p_note: note });
    if (error) throw error;
    return data;
  },
  async setRefundRequestsEnabled(on) {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_set_refund_requests_enabled', { p_enabled: !!on });
    if (error) throw error;
    return data === true;
  },
  async overview() {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_billing_overview');
    if (error) throw error;
    return data || {};
  },
  /* Promo codes (section 20). The table is closed to the client; these
     two RPCs are the only way to it, and both re-check the admin role. */
  /** §61. The launch pass as the console sees it: { enabled, paise, days,
   *  plan, ends_at, cap, sold, left, open }. Owner and finance only. */
  async passStatus() {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_pass_status');
    if (error) throw error;
    return data || null;
  },
  /** §61. Set the pass. A new price applies to NEW orders only; a payment
   *  already made keeps what it paid. Resolves to the same shape. */
  async setPass({ enabled, paise, days, plan, endsAt, cap }) {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_set_pass', {
      p_enabled: !!enabled, p_paise: paise, p_days: days, p_plan: plan || 'pro', p_ends_at: endsAt || null, p_cap: cap == null ? null : cap
    });
    if (error) throw error;
    _passAt = 0;
    return data || null;
  },
  /** §62. { pass_mode, plan_mode }, each 'once' | 'renew'. */
  async billingModes() {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_billing_modes');
    if (error) throw error;
    return data || null;
  },
  /** §62. Set both modes. NEW purchases only: an auto-pay already running
   *  keeps its price and its schedule. */
  async setBillingModes(passMode, planMode) {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_set_billing_modes', { p_pass_mode: passMode, p_plan_mode: planMode });
    if (error) throw error;
    _passAt = 0;
    return data || null;
  },
  /** §62. The subscriptions, newest first; `filter` a status or null. */
  async listSubscriptions(filter = null) {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_list_subscriptions', { p_status: filter });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  },
  /** §62. Cancel one person's auto-pay at the end of the period paid
   *  (rzp-cancel, admin-checked there). */
  async cancelSubscription(id) {
    const out = await invoke('rzp-cancel', { subscription_id: id });
    Store.notify('billing:changed', null);
    return out;
  },
  async listPromoCodes() {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_list_promo_codes');
    if (error) throw error;
    return data || [];
  },
  /** Create or patch one code. `patch` keys: percent_off, amount_off_paise,
   *  plan_ids (array or null), max_uses, valid_from, valid_until, active, note. */
  async setPromoCode(code, patch) {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_set_promo_code', { p_code: normalisePromo(code), p_patch: patch });
    if (error) throw error;
    return data;
  }
};

export default { startTrial, passOffer, cachedPassOffer, offerModes, cachedModes, modesRead, cancelAutopay, autopayOf, buyPass, priceNotice, requestRefund, myRefundStatus, refundRequestsEnabled, isRefundsMissing, REFUND_CATEGORIES, listPlans, refreshPlans, status, quote, buy, admin, cap, hasRoom, isUnlimited, limitSentence, planName, planRank, PLAN_ORDER, isPlanLimit, paymentsConfigured, fmtPaise, priceFor, perDayPaise, PLAN_DAYS, parseRupees, PERIODS, normalisePromo, isPromoShaped, promoLabel };
