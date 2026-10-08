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
import { bumpEvent } from './funnel.js';
import { PLAN_ORDER, planName } from './plans.js';
import { fmtPaise, priceFor, parseRupees, PERIODS, normalisePromo, isPromoShaped, promoLabel } from '../../supabase/functions/_shared/razorpay.js';

export { fmtPaise, priceFor, parseRupees, PERIODS, normalisePromo, isPromoShaped, promoLabel };

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
/** Public. The secret never leaves the edge functions. */
export const RAZORPAY_KEY_ID = String(env.VITE_RAZORPAY_KEY_ID || '').trim();
export const paymentsConfigured = () => !!RAZORPAY_KEY_ID;

/* The tier ids and names are pure (src/lib/plans.js) so the build can
   stamp them into start.html; re-exported here for every caller. */
export { PLAN_ORDER, planName };
export const planRank = (id) => Math.max(0, PLAN_ORDER.indexOf(id));

const cloud = () => window.StudioCloud || null;
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
export async function quote(planId, code) {
  const sb = await client();
  const { data, error } = await sb.rpc('quote_order', { p_plan: planId, p_code: normalisePromo(code) || null });
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

async function invoke(name, body) {
  const sb = await client();
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    // supabase-js wraps a non-2xx as FunctionsHttpError with the Response on `context`.
    let detail = '';
    try { const j = await error.context?.json?.(); detail = (j && j.error) || ''; } catch (e) { /* no body */ }
    throw new BillingError(detail || error.message || 'The payment service did not answer.', 'edge');
  }
  if (data && data.error) throw new BillingError(data.error, 'edge');
  return data;
}

/**
 * Buy `planId`, for good (schema section 18: one payment, no period).
 * Resolves to { plan, account_id } once the server has verified and
 * activated; rejects with code 'dismissed' if the buyer closed
 * Checkout. `onStatus(text)` narrates for the UI. `code` is a promo
 * code (section 20): the server re-quotes it and a refused one comes
 * back as an edge error with the sentence to show.
 */
export async function buy(planId, period = 'lifetime', { accountId = null, onStatus = () => {}, code = null } = {}) {
  if (!paymentsConfigured()) throw new BillingError('Payments are not switched on for this studio yet.', 'notconfigured');
  if (!PERIODS.includes(period)) throw new BillingError('Plans are bought once, for good.', 'period');
  bumpEvent('checkout_start');   // §29 daily count, fire-and-forget
  onStatus('Preparing your order…');
  const [order] = await Promise.all([invoke('rzp-order', { plan: planId, period, account_id: accountId, code: normalisePromo(code) || null }), loadCheckout()]);
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
      description: `${order.plan_name || planName(planId)} · full access, one payment${order.promo_code ? ' · code ' + order.promo_code : ''}`,
      prefill: order.prefill || {},
      notes: { plan: planId, period, promo_code: order.promo_code || '' },
      ...(themeColour() ? { theme: { color: themeColour() } } : {}),
      handler: (resp) => { settled = true; resolve(resp); },
      modal: { ondismiss: () => { if (!settled) reject(new BillingError('Payment cancelled. Nothing was charged.', 'dismissed')); } }
    });
    rz.on('payment.failed', (e) => {
      if (settled) return;
      settled = true;
      reject(new BillingError((e && e.error && e.error.description) || 'The payment did not go through. Nothing was charged.', 'failed'));
    });
    rz.open();
  });

  onStatus('Confirming with the studio…');
  const result = await invoke('rzp-verify', {
    razorpay_order_id: response.razorpay_order_id,
    razorpay_payment_id: response.razorpay_payment_id,
    razorpay_signature: response.razorpay_signature
  });
  bumpEvent('purchase');
  Store.notify('billing:changed', result);
  // Paying grants entry: a non-member is a member now. Ask the gate again.
  try { const c = cloud(); if (c && c.runGate) await c.runGate(); } catch (e) { /* the status call will say */ }
  return result;
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

/* ---- admin ---------------------------------------------------- */

export const admin = {
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

export default { requestRefund, myRefundStatus, refundRequestsEnabled, isRefundsMissing, REFUND_CATEGORIES, listPlans, refreshPlans, status, quote, buy, admin, cap, hasRoom, isUnlimited, limitSentence, planName, planRank, PLAN_ORDER, isPlanLimit, paymentsConfigured, fmtPaise, priceFor, parseRupees, PERIODS, normalisePromo, isPromoShaped, promoLabel };
