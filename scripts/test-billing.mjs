/* ============================================================
   BILLING — the pure half, in Node
   ------------------------------------------------------------
   supabase/functions/_shared/razorpay.js is what decides whether a
   payment is genuine, so it is asserted here against Node's own HMAC
   rather than trusted: the two implementations have to agree on known
   inputs, a one-character change to any field has to fail, and the
   comparison has to be constant-time in shape (same length required,
   no early return on content).

       node scripts/test-billing.mjs      (or: npm run test:billing)
   ============================================================ */
import { createHmac } from 'node:crypto';
import * as R from '../supabase/functions/_shared/razorpay.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const SECRET = 'test_key_secret_8f2k';
const WH = 'whsec_very_secret';
const nodeHmac = (k, m) => createHmac('sha256', k).update(m).digest('hex');

/* ---- HMAC agrees with Node ---- */
eq(await R.hmacHex(SECRET, 'order_ABC|pay_XYZ'), nodeHmac(SECRET, 'order_ABC|pay_XYZ'), 'Web Crypto HMAC matches node:crypto');
eq(await R.hmacHex(WH, '{"event":"payment.captured"}'), nodeHmac(WH, '{"event":"payment.captured"}'), 'HMAC over a JSON body');

/* ---- checkout signature ---- */
const sig = nodeHmac(SECRET, 'order_ABC|pay_XYZ');
ok(await R.verifyPaymentSignature({ razorpay_order_id: 'order_ABC', razorpay_payment_id: 'pay_XYZ', razorpay_signature: sig }, SECRET), 'a genuine checkout signature verifies');
ok(await R.verifyPaymentSignature({ razorpay_order_id: 'order_ABC', razorpay_payment_id: 'pay_XYZ', razorpay_signature: sig.toUpperCase() }, SECRET), 'hex case does not matter');
ok(!(await R.verifyPaymentSignature({ razorpay_order_id: 'order_ABC', razorpay_payment_id: 'pay_XYZ', razorpay_signature: sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0') }, SECRET)), 'one changed character fails');
ok(!(await R.verifyPaymentSignature({ razorpay_order_id: 'order_ABD', razorpay_payment_id: 'pay_XYZ', razorpay_signature: sig }, SECRET)), 'a different order id fails');
ok(!(await R.verifyPaymentSignature({ razorpay_order_id: 'order_ABC', razorpay_payment_id: 'pay_XYZ', razorpay_signature: sig }, 'wrong')), 'the wrong secret fails');
ok(!(await R.verifyPaymentSignature({ razorpay_order_id: 'order_ABC', razorpay_payment_id: 'pay_XYZ', razorpay_signature: '' }, SECRET)), 'an empty signature fails');
ok(!(await R.verifyPaymentSignature({ razorpay_order_id: 'order_ABC', razorpay_payment_id: 'pay_XYZ', razorpay_signature: sig }, '')), 'an empty secret fails (never "verifies" an unconfigured deploy)');
ok(!(await R.verifyPaymentSignature({}, SECRET)), 'missing fields fail');

/* ---- webhook signature ---- */
const body = '{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_1","order_id":"order_1"}}}}';
ok(await R.verifyWebhookSignature(body, nodeHmac(WH, body), WH), 'a genuine webhook verifies');
ok(!(await R.verifyWebhookSignature(body, nodeHmac(SECRET, body), WH)), 'a webhook signed with the KEY secret fails — the two secrets are not interchangeable');
ok(!(await R.verifyWebhookSignature(JSON.stringify(JSON.parse(body), null, 2), nodeHmac(WH, body), WH)), 're-serialised JSON fails: the raw bytes are what is signed');

/* ---- constant-time compare ---- */
ok(R.timingSafeEqualHex('abcd', 'ABCD'), 'equal hex, either case');
ok(!R.timingSafeEqualHex('abcd', 'abc'), 'different lengths are unequal');
ok(!R.timingSafeEqualHex('', ''), 'two empty strings are NOT equal (an unset signature never passes)');

/* ---- periods and prices ---- */
eq(R.periodEnd('2026-01-01T00:00:00.000Z', 'month'), '2026-01-31T00:00:00.000Z', 'a month is 30 days');
eq(R.periodEnd('2026-01-01T00:00:00.000Z', 'year'), '2027-01-01T00:00:00.000Z', 'a year is 365 days');
let threw = false; try { R.periodEnd('2026-01-01T00:00:00.000Z', 'week'); } catch (e) { threw = true; }
ok(threw, 'an unknown period throws rather than charging for nothing');
const plan = { id: 'indie', monthly_paise: 49900, yearly_paise: 499000 };
eq(R.priceFor(plan, 'month'), 49900, 'monthly price');
eq(R.priceFor(plan, 'year'), 499000, 'yearly price');
eq(R.priceFor({ id: 'starter', monthly_paise: 19900, yearly_paise: null }, 'year'), null, 'a period not sold is null, not 0');
eq(R.priceFor({ id: 'free', monthly_paise: 0, yearly_paise: 0 }, 'month'), null, 'a zero price is not for sale');
eq(R.fmtPaise(49900), '₹499', 'paise -> rupees');
eq(R.fmtPaise(49950), '₹499.50', 'with paise');
eq(R.fmtPaise(1234500), '₹12,345', 'Indian grouping');
eq(R.parseRupees('₹499'), 49900, 'rupee string -> paise');
eq(R.parseRupees('499.5'), 49950, 'decimal rupees');
eq(R.parseRupees('1,999'), 199900, 'with a comma');
eq(R.parseRupees('abc'), null, 'not a number');
eq(R.parseRupees('-5'), null, 'negative refused');
ok(R.receiptFor('0f4e2b1a-1111-2222-3333-444455556666').length <= 40, 'receipt within Razorpay’s 40 characters');
ok(R.basicAuth('rzp_test_k', 's') === 'Basic ' + Buffer.from('rzp_test_k:s').toString('base64'), 'basic auth header');

console.log(`${fail ? '✗' : '✓'} billing: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
