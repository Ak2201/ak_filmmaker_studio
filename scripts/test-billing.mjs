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

/* ---- one price, for good (section 18) ---- */
eq(R.PERIODS, ['lifetime'], 'the only period is lifetime');
ok(!('periodEnd' in R) && !('PERIOD_DAYS' in R), 'nothing can compute an expiry any more');
const plan = { id: 'indie', price_paise: 799900, monthly_paise: 49900, yearly_paise: 499000 };
eq(R.priceFor(plan), 799900, 'the price is price_paise, not a period column');
eq(R.priceFor(plan, 'lifetime'), 799900, 'asked for explicitly');
eq(R.priceFor(plan, 'month'), null, 'a month is not a thing that is sold');
eq(R.priceFor({ id: 'starter', yearly_paise: 299900 }), 299900, 'a row read before §18 ran falls back to the yearly figure');
eq(R.priceFor({ id: 'free', price_paise: 0 }), null, 'a zero price is not for sale');
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

/* ---- promo codes (section 20): the helpers the client and the fake share ---- */
eq(R.normalisePromo(' launch 10 '), 'LAUNCH10', 'a code is upper-cased with whitespace removed');
eq(R.normalisePromo(null), '', 'nothing typed is the empty string');
eq(R.normalisePromo('a-b\tc'), 'A-BC', 'tabs go, dashes stay');
ok(R.isPromoShaped('launch10') && R.isPromoShaped('A-1'), 'three or more letters, digits or dashes is code-shaped');
ok(!R.isPromoShaped('ab') && !R.isPromoShaped('-abc') && !R.isPromoShaped('a!b') && !R.isPromoShaped('x'.repeat(33)), 'too short, leading dash, punctuation or 33 chars is not');
eq(R.MIN_ORDER_PAISE, 100, 'Razorpay’s minimum order is ₹1');
eq(R.promoPrice(59900, 10, null), 53910, '10% off 59900 is 53910 (mirrors public.promo_price)');
eq(R.promoPrice(999, 10, null), 900, 'a percentage floors the paise: 999 less 99.9 -> 900');
eq(R.promoPrice(59900, null, 50000), 9900, '₹500 off 59900 is 9900');
eq(R.promoPrice(59900, null, 100000), 100, '₹1000 off a ₹599 plan floors at 100 paise');
eq(R.promoPrice(299900, 100, null), 100, 'a 100% code costs ₹1, never ₹0');
eq(R.promoPrice(50, null, 10), 50, 'a sub-₹1 list price is never raised to the floor');
eq(R.promoPrice(59900, null, null), 59900, 'no discount is the list price');
eq(R.promoPrice(null, 10, null), null, 'no list price, no answer');
eq(R.promoLabel({ percent_off: 10 }), '10% off', 'label for a percentage');
eq(R.promoLabel({ amount_off_paise: 50000 }), '₹500 off', 'label for an amount');
eq(R.promoLabel(null), '', 'label for nothing');

console.log(`${fail ? '✗' : '✓'} billing: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
