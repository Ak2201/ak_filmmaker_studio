/* ============================================================
   RAZORPAY — the pure half, shared by the three edge functions
   ------------------------------------------------------------
   Plain JavaScript on purpose: Deno imports it as-is, and so does
   Node, which is how scripts/test-billing.mjs asserts the signature
   maths without a Deno runtime. Nothing here touches Deno.env, the
   database or the network; those stay in each function's index.ts.

   WHAT RAZORPAY SIGNS, and with which secret — the two are easy to mix
   up and each is wrong with the other's key:

     checkout success  HMAC-SHA256( order_id + "|" + payment_id,  KEY_SECRET )
                       -> razorpay_signature in the handler's response
     webhook delivery  HMAC-SHA256( raw request body,  WEBHOOK_SECRET )
                       -> X-Razorpay-Signature header
     subscription      HMAC-SHA256( payment_id + "|" + subscription_id,  KEY_SECRET )
       checkout        (schema §62; note the order of the two ids)

   Both are hex, both compared in constant time. A plain `===` on hex
   strings leaks how many leading characters matched, one byte of
   timing per character.

   AMOUNTS ARE MINOR UNITS. Razorpay's API takes the smallest unit, so
   ₹499 is 49900 paise and $19.50 is 1950 cents. The plans table stores
   paise and plan_prices stores cents, so the number the admin saves is
   the number Razorpay charges, with no rounding in between. Since schema
   §56 an order is in INR or USD, and every *_paise column holds minor
   units OF ITS ROW'S currency (the names were kept; see that section).
   ============================================================ */

const enc = new TextEncoder();

export async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time equality of two hex strings. */
export function timingSafeEqualHex(a, b) {
  a = String(a || '').toLowerCase(); b = String(b || '').toLowerCase();
  if (a.length !== b.length || !a.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The checkout handler's three fields against the KEY secret. */
export async function verifyPaymentSignature({ razorpay_order_id, razorpay_payment_id, razorpay_signature }, keySecret) {
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !keySecret) return false;
  const expected = await hmacHex(keySecret, `${razorpay_order_id}|${razorpay_payment_id}`);
  return timingSafeEqualHex(expected, razorpay_signature);
}

/** A webhook's raw body against the WEBHOOK secret. The body must be
 *  the bytes as received — re-serialising the parsed JSON changes key
 *  order and whitespace and the signature stops matching. */
export async function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  if (!rawBody || !signature || !webhookSecret) return false;
  const expected = await hmacHex(webhookSecret, rawBody);
  return timingSafeEqualHex(expected, signature);
}

/** Basic-auth header for Razorpay's REST API. */
export function basicAuth(keyId, keySecret) {
  return 'Basic ' + btoa(`${keyId}:${keySecret}`);
}

/** A YEAR AT A TIME (schema section 52, owner 21 Oct 2026): a plan is
 *  bought for 365 days and renewed by buying it again (the database stacks
 *  the new year onto the time left). An ORDER is never charged again; when
 *  the console sets a product to auto-renew (§62) it is sold as a
 *  SUBSCRIPTION instead (the helpers at the foot of this file).
 *  Section 18's "for good" ended with it; a grant can still be for good,
 *  but nothing is SOLD that way.
 *
 *  'pass' (schema §61, owner 27 Oct 2026) is the LAUNCH WEEK PASS: a short
 *  paid stretch of one plan (Pro), sold once per person while the owner's
 *  offer is open. The SERVER prices it and sets its length
 *  (billing_settings.pass_paise / pass_days, through quote_pass), so
 *  nothing here knows ₹49 or 7 days. PLAN_DAYS stays the YEAR: every
 *  per-day figure is a year's price over 365. */
export const PERIODS = ['year', 'pass'];
export const PLAN_DAYS = 365;

/** What a year costs a day, in paise (rounded to the paisa): the figure
 *  the pricing pages lead with. 59900 -> 164 ("₹1.64 a day"). */
export function perDayPaise(paise) {
  const n = Number(paise);
  return Number.isFinite(n) && n > 0 ? Math.round(n / PLAN_DAYS) : null;
}

/** The one price of a plan, in paise, or null when it is not for sale.
 *  `plan` is a row of the plans table; `price_paise` is section 18's
 *  column, with the yearly figure as the fallback for a row read before
 *  that section ran. A pass is never priced from a plan row: the server
 *  prices it (§61), so priceFor(plan, 'pass') is null. */
export function priceFor(plan, period = 'year') {
  if (!plan || period !== 'year') return null;
  const v = Number.isInteger(plan.price_paise) ? plan.price_paise : plan.yearly_paise;
  return Number.isInteger(v) && v > 0 ? v : null;
}

/** Rupees for display: 49900 -> "₹499", 49950 -> "₹499.50". */
export function fmtPaise(paise) {
  const n = Number(paise) || 0;
  const r = Math.floor(n / 100), p = n % 100;
  const whole = r.toLocaleString('en-IN');
  return '₹' + whole + (p ? '.' + String(p).padStart(2, '0') : '');
}

/* ---- two currencies (schema §56) ------------------------------------
   An order is in rupees or US dollars; the server prices both. These
   print and parse an amount in its own currency. fmtPaise / parseRupees
   above stay exactly as they were, because the client imports them. */
export const CURRENCIES = ['INR', 'USD'];
const SYMBOL = { INR: '₹', USD: '$' };
const GROUPING = { INR: 'en-IN', USD: 'en-US' };

/** The order's currency from a request body: 'INR' when absent, the
 *  canonical code for 'inr' / 'usd', and null for anything else (the
 *  caller answers 400 rather than guess). */
export function orderCurrency(v) {
  if (v === undefined || v === null || v === '') return 'INR';
  const c = String(v).trim().toUpperCase();
  return CURRENCIES.includes(c) ? c : null;
}

/** Minor units for display in their currency: (59900) -> "₹599",
 *  (59950) -> "₹599.50", (1900, 'USD') -> "$19", (1950, 'USD') -> "$19.50",
 *  with Indian grouping for rupees and US grouping for dollars. */
export function fmtMinor(minor, currency = 'INR') {
  const cur = String(currency || 'INR').toUpperCase();
  const n = Math.round(Number(minor) || 0);
  const neg = n < 0, a = Math.abs(n);
  const whole = Math.floor(a / 100), frac = a % 100;
  const body = whole.toLocaleString(GROUPING[cur] || 'en-US') + (frac ? '.' + String(frac).padStart(2, '0') : '');
  return (neg ? '-' : '') + (SYMBOL[cur] ? SYMBOL[cur] + body : cur + ' ' + body);
}

/** What a year costs a day, in minor units of the same currency (the same
 *  rounding as perDayPaise): 1900 cents -> 5 ("$0.05 a day"). */
export function perDayMinor(minor) {
  return perDayPaise(minor);
}

/** "$19.50" / "19.5" / "1,999" -> minor units of `currency`, or null. A
 *  string carrying the OTHER currency's symbol is refused, so "₹19"
 *  typed into a dollar field is not read as $19. For the console. */
export function parseMinor(s, currency = 'INR') {
  const cur = String(currency || 'INR').toUpperCase();
  if (!CURRENCIES.includes(cur)) return null;
  let t = String(s ?? '').trim();
  for (const [c, sym] of Object.entries(SYMBOL)) {
    if (c !== cur && (t.includes(sym) || new RegExp('\\b' + c + '\\b', 'i').test(t))) return null;
  }
  t = t.replace(new RegExp('\\b' + cur + '\\b', 'i'), '').split(SYMBOL[cur]).join('').replace(/[,\s]/g, '');
  const m = t.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0);
}

/** "₹499" / "499" / "499.50" -> paise, or null. For the admin form. */
export function parseRupees(s) {
  const m = String(s ?? '').replace(/[₹,\s]/g, '').match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0);
}

/** A Razorpay receipt id: <= 40 chars, their limit. */
export const receiptFor = (paymentRowId) => ('fms_' + String(paymentRowId).replace(/-/g, '')).slice(0, 40);

/* ---- promo codes (schema section 20) --------------------------------
   The DATABASE decides what a code is worth — quote_order() — and these
   two helpers exist so the client and the test fixtures spell things
   the same way it does. promoPrice() is a copy of public.promo_price()
   for the fake Supabase and the Node tests; nothing in the browser
   computes a price from it. */

/** What the buyer typed, as the database stores a code: upper-case, no
 *  whitespace. '' when nothing is left. */
export const normalisePromo = (s) => String(s ?? '').replace(/\s+/g, '').toUpperCase();

/** Looks like a code at all? Same pattern as the table's CHECK. */
export const isPromoShaped = (s) => /^[A-Z0-9][A-Z0-9-]{2,31}$/.test(normalisePromo(s));

/** Razorpay's minimum order, in paise. */
export const MIN_ORDER_PAISE = 100;

/** The list price less a percentage (floored) or a flat amount; never
 *  below MIN_ORDER_PAISE and never above the list. Mirrors
 *  public.promo_price() exactly, including integer division. */
export function promoPrice(listPaise, percentOff, amountOffPaise) {
  if (!Number.isInteger(listPaise)) return null;
  const off = Number.isInteger(percentOff) ? Math.floor((listPaise * percentOff) / 100)
            : Number.isInteger(amountOffPaise) ? amountOffPaise : 0;
  return Math.min(listPaise, Math.max(MIN_ORDER_PAISE, listPaise - off));
}

/** The console's one-line description of a code's discount. */
export function promoLabel(code) {
  if (!code) return '';
  if (Number.isInteger(code.percent_off)) return `${code.percent_off}% off`;
  if (Number.isInteger(code.amount_off_paise)) return `${fmtPaise(code.amount_off_paise)} off`;
  return '';
}

/* ---- capture only what will be applied (schema §53, audit bug 8) -------
   rzp-verify reads the payment back; when it is only AUTHORIZED it is
   rzp-verify that collects the money. It used to capture first and let
   activate_payment refuse afterwards (a promo code used up, a credit
   gone), which left a buyer charged with no plan. The order matters, so
   it lives here, where scripts/test-billing.mjs can watch it:

     1. the amount (and, since §56, the currency) must match the order
                                         -> else nothing is captured
     2. payment_can_activate(order)      -> else nothing is captured, and
                                            Razorpay releases the hold
     3. only then POST /capture

   `canActivate` and `capture` are the two network calls, passed in.
   Returns { kind: 'mismatch' | 'refused' | 'captured' | 'pending', … }. */
export async function settleAuthorized({ entity, amountPaise, currency = null, canActivate, capture }) {
  if (Number(entity?.amount) !== Number(amountPaise)) return { kind: 'mismatch' };
  // §56: an order priced in one currency is never captured in another
  if (currency && entity?.currency && String(entity.currency).toUpperCase() !== String(currency).toUpperCase()) return { kind: 'mismatch' };
  let verdict = null;
  try { verdict = await canActivate(); } catch { verdict = null; }
  // Not knowing is not a yes: the authorisation keeps, and the webhook
  // (or the buyer's next press) tries again.
  if (!verdict) return { kind: 'pending' };
  if (verdict.ok !== true) return { kind: 'refused', reason: verdict.reason ?? null, sentence: verdict.sentence ?? null };
  let capped = null;
  try { capped = await capture(); } catch { capped = null; }
  return capped && capped.status === 'captured' ? { kind: 'captured', entity: capped } : { kind: 'pending' };
}

/* ---- the order is only handed out once the row knows it (audit) -------
   attach_razorpay_order() is the ONLY writer of payments.razorpay_order_id,
   and rzp-verify and the webhook find the row by that id alone. supabase-js
   rpc() returns { error } rather than throwing, so an attach that failed
   used to be ignored and Checkout opened on an order no row named: the
   buyer could pay and get no plan, with nothing to match the money to.
   An attach that fails (or throws) is a refusal: `abandon` marks the row
   (best effort; never throws out of here) and the caller answers 502, so
   the Razorpay order is never paid and simply expires.
   `attach` and `abandon` are the two database calls, passed in.
   Returns { ok: true } or { ok: false, error }. */
export async function attachOrder({ attach, abandon }) {
  let res;
  try { res = await attach(); } catch (e) { res = { error: e || new Error('attach threw') }; }
  if (!res?.error) return { ok: true };
  try { await abandon(); } catch { /* the 502 matters more than the mark */ }
  return { ok: false, error: res.error };
}

/* ---- a pending row whose order will never be paid ----
   The one way rzp-order gives up on a 'created' row: by ITS OWN id. The
   order-create failure used to call mark_payment_failed with a null order
   id, and `razorpay_order_id = null` matches nothing, so the row stayed
   'created' — and quote_for counts other buyers' 'created' rows from the
   last hour as held uses of a limited promo code, so one failed order
   made a max_uses = 1 code read 'exhausted' to everybody for an hour.
   'failed' frees that hold and is the record the comment promised.
   Only a row still 'created' moves. Best effort: never throws, because
   the 502 the caller is about to send matters more than the mark. */
export async function failPending(svc, paymentId, raw) {
  try {
    // A null `raw` keeps what the row had, as mark_payment_failed's coalesce did.
    const patch = raw == null ? { status: 'failed' } : { status: 'failed', raw };
    await svc.from('payments').update(patch).eq('id', paymentId).eq('status', 'created');
  } catch { /* the 502 matters more than the mark */ }
}

/* ---- a refund's answer, or the lack of one (schema §53, audit bug 9) ----
   Only an ANSWER from Razorpay may be recorded as 'failed', because
   'failed' lets the console try again under a NEW idempotency key. A call
   that threw, a 5xx, or a 2xx with no refund in it says nothing about
   whether the refund was made: that is 'unknown', the intent row stays
   'initiated', and begin_refund hands the same row (the same key) to the
   retry. */
export function refundOutcome({ threw = false, status = 0, body = null } = {}) {
  if (threw) return 'unknown';
  if (status >= 200 && status < 300) return body && body.id ? 'created' : 'unknown';
  if (status >= 400 && status < 500 && body && body.error) return 'refused';
  return 'unknown';
}

/** The refund made under our receipt (the refunds row id), from Razorpay's
 *  GET /payments/{id}/refunds answer ({ items: [...] }), or null. */
export function refundByReceipt(list, receipt) {
  const items = Array.isArray(list) ? list : Array.isArray(list?.items) ? list.items : [];
  return (receipt && items.find((x) => x && x.receipt === receipt)) || null;
}

/* ---- auto-renew: Razorpay Subscriptions (schema §62) -------------------
   The owner chooses per product, in the console, whether a purchase is
   one-time (an ORDER, everything above) or auto-renew (a SUBSCRIPTION,
   below). The database prices a subscription and locks it
   (create_pending_subscription); these helpers only shape what Razorpay is
   sent and check what it signs.

   WHAT RAZORPAY SIGNS for a subscription's checkout — the fields are the
   other way round from an order's, and with the KEY secret:

     HMAC-SHA256( payment_id + "|" + subscription_id,  KEY_SECRET )

   ONE RAZORPAY PLAN PER PRICE. A Razorpay plan cannot be edited, so each
   (product, period, days, amount, currency) gets its own, made lazily and
   cached in rzp_plans: a console price change makes a new plan for NEW
   subscribers and leaves every running one at its own amount (the lock).
     pass  period 'daily',  interval = the pass's days (a 'weekly' plan is
           fixed at 7, and the console's day count is not)
     year  period 'yearly', interval 1
   total_count is MAX_YEARS of cycles, which is "until you cancel" for
   every practical purpose and inside the mandate lengths the banks accept.
   Change MAX_YEARS here if Razorpay says the account allows otherwise. */

/** The subscription checkout's three fields against the KEY secret. */
export async function verifySubscriptionSignature({ razorpay_payment_id, razorpay_subscription_id, razorpay_signature }, keySecret) {
  if (!razorpay_payment_id || !razorpay_subscription_id || !razorpay_signature || !keySecret) return false;
  const expected = await hmacHex(keySecret, `${razorpay_payment_id}|${razorpay_subscription_id}`);
  return timingSafeEqualHex(expected, razorpay_signature);
}

export const MAX_YEARS = 10;
export const SUBSCRIPTION_STATUSES = ['created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired'];

/** Razorpay's period and interval for one of ours, or null. */
export function rzpPeriod(period, days) {
  if (period === 'year') return { period: 'yearly', interval: 1 };
  const d = Math.round(Number(days));
  if (period === 'pass' && d >= 1 && d <= 366) return { period: 'daily', interval: d };
  return null;
}

/** How many cycles: MAX_YEARS of them (at least 1), or null. */
export function maxTotalCount(period, days) {
  if (period === 'year') return MAX_YEARS;
  const d = Math.round(Number(days));
  return period === 'pass' && d >= 1 ? Math.max(1, Math.floor((MAX_YEARS * 365) / d)) : null;
}

const everyWords = (period, days) => {
  if (period === 'year') return 'every year';
  const d = Math.round(Number(days));
  return d === 1 ? 'every day' : `every ${d} days`;
};

/** "Pro, 7-day pass" / "Basic, yearly plan" (a plan item, Checkout's name). */
export function subscriptionName(planName, period, days) {
  const n = String(planName || '').trim() || 'Plan';
  return period === 'year' ? `${n}, yearly plan` : `${n}, ${Math.round(Number(days))}-day pass`;
}

/** Checkout's description: the price, how often, and "cancel anytime". */
export function subscriptionDescription({ planName, period, days, amountMinor, currency = 'INR' }) {
  return `${subscriptionName(planName, period, days)}: ${fmtMinor(amountMinor, currency)} ${everyWords(period, days)} until you cancel. Cancel anytime.`;
}

/** POST /v1/plans body, or null for a shape Razorpay cannot take. */
export function planBody({ product, period, days, amountMinor, currency = 'INR', planName }) {
  const p = rzpPeriod(period, days);
  const amount = Math.round(Number(amountMinor));
  if (!p || !(amount >= MIN_ORDER_PAISE)) return null;
  return {
    ...p,
    item: { name: subscriptionName(planName, period, days), amount, currency: String(currency).toUpperCase(),
            description: subscriptionDescription({ planName, period, days, amountMinor: amount, currency }) },
    notes: { product: String(product), period: String(period), days: period === 'pass' ? String(Math.round(Number(days))) : '' }
  };
}

/** POST /v1/subscriptions body. customer_notify 1: Razorpay sends the
 *  mandate's own notices (the RBI pre-debit notice among them). No
 *  start_at: the first charge is taken at authentication, so access starts
 *  at once and the first charge is the plan's own amount. */
export function subscriptionBody({ planId, period, days, rowId, userId, product }) {
  const total = maxTotalCount(period, days);
  if (!planId || !total) return null;
  return { plan_id: planId, total_count: total, customer_notify: 1,
           notes: { subscription_row_id: String(rowId), user_id: String(userId), product: String(product) } };
}

/** POST /v1/subscriptions/{id}/cancel body: at the end of the cycle for a
 *  running one, at once for one that never started (nothing is due). */
export function cancelBody(status) {
  return { cancel_at_cycle_end: ['active', 'pending', 'halted'].includes(status) ? 1 : 0 };
}

/** The status a subscription.* webhook event means, or null. The event
 *  name decides (the entity can lag it); the entity is the fallback. */
export function statusForEvent(event, entity) {
  const m = /^subscription\.(\w+)$/.exec(String(event || ''));
  const map = { authenticated: 'authenticated', activated: 'active', charged: 'active', pending: 'pending', halted: 'halted',
                cancelled: 'cancelled', completed: 'completed', expired: 'expired', paused: 'halted', resumed: 'active' };
  if (m && map[m[1]]) return map[m[1]];
  const s = String(entity?.status || '');
  return SUBSCRIPTION_STATUSES.includes(s) ? s : null;
}

/** The Razorpay subscription a payment entity belongs to, when it says. */
export function subscriptionOfPayment(payment) {
  return (payment && (payment.subscription_id || payment.notes?.subscription_id)) || null;
}

/** A Razorpay unix-seconds timestamp as ISO, or null. */
export function isoFromUnix(sec) {
  const n = Number(sec);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null;
}
