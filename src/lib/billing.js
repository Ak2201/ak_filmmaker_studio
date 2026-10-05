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
import { fmtPaise, priceFor, parseRupees, PERIODS } from '../../supabase/functions/_shared/razorpay.js';

export { fmtPaise, priceFor, parseRupees, PERIODS };

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
/** Public. The secret never leaves the edge functions. */
export const RAZORPAY_KEY_ID = String(env.VITE_RAZORPAY_KEY_ID || '').trim();
export const paymentsConfigured = () => !!RAZORPAY_KEY_ID;

export const PLAN_ORDER = ['free', 'starter', 'indie', 'pro'];
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
export const planName = (id) => ({ free: 'Free', starter: 'Starter', indie: 'Indie', pro: 'Pro' })[id] || id;

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
 * Buy `planId` for `period`. Resolves to { plan, ends_at } once the
 * server has verified and activated; rejects with code 'dismissed' if
 * the buyer closed Checkout. `onStatus(text)` narrates for the UI.
 */
export async function buy(planId, period = 'month', { accountId = null, onStatus = () => {} } = {}) {
  if (!paymentsConfigured()) throw new BillingError('Payments are not switched on for this studio yet.', 'notconfigured');
  if (!PERIODS.includes(period)) throw new BillingError('Choose monthly or yearly.', 'period');
  onStatus('Preparing your order…');
  const [order] = await Promise.all([invoke('rzp-order', { plan: planId, period, account_id: accountId }), loadCheckout()]);
  if (!order || !order.order_id) throw new BillingError('No order came back.', 'edge');

  onStatus('Opening the payment form…');
  const response = await new Promise((resolve, reject) => {
    let settled = false;
    const rz = new window.Razorpay({
      key: order.key_id || RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: order.currency || 'INR',
      order_id: order.order_id,
      name: 'Filmmaker Studio',
      description: `${order.plan_name || planName(planId)} · ${period === 'year' ? 'one year' : 'one month'}`,
      prefill: order.prefill || {},
      notes: { plan: planId, period },
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
  async overview() {
    const sb = await client();
    const { data, error } = await sb.rpc('admin_billing_overview');
    if (error) throw error;
    return data || {};
  }
};

export default { listPlans, refreshPlans, status, buy, admin, cap, hasRoom, isUnlimited, limitSentence, planName, planRank, PLAN_ORDER, isPlanLimit, paymentsConfigured, fmtPaise, priceFor, parseRupees, PERIODS };
