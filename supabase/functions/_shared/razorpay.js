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

   Both are hex, both compared in constant time. A plain `===` on hex
   strings leaks how many leading characters matched, one byte of
   timing per character.

   AMOUNTS ARE PAISE. Razorpay's API takes the smallest unit, so ₹499
   is 49900. The plans table stores paise too, so the number the admin
   saves is the number Razorpay charges, with no rounding in between.
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

/** FULL-TIME ACCESS (schema section 18): a plan is bought once and kept
 *  for good. There is one period, and it never ends. The month/year
 *  model this replaced lived in PERIOD_DAYS and periodEnd(); both are
 *  gone, so nothing can compute an expiry by accident. */
export const PERIODS = ['lifetime'];

/** The one price of a plan, in paise, or null when it is not for sale.
 *  `plan` is a row of the plans table; `price_paise` is section 18's
 *  column, with the yearly figure as the fallback for a row read before
 *  that section ran. */
export function priceFor(plan, period = 'lifetime') {
  if (!plan || !PERIODS.includes(period)) return null;
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

/** "₹499" / "499" / "499.50" -> paise, or null. For the admin form. */
export function parseRupees(s) {
  const m = String(s ?? '').replace(/[₹,\s]/g, '').match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0);
}

/** A Razorpay receipt id: <= 40 chars, their limit. */
export const receiptFor = (paymentRowId) => ('fms_' + String(paymentRowId).replace(/-/g, '')).slice(0, 40);
