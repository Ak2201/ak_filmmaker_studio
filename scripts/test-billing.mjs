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

/* ---- one price, for a year (section 52) ---- */
eq(R.PERIODS, ['year'], 'the only period sold is a year');
eq(R.PLAN_DAYS, 365, 'a year is 365 days');
ok(!('periodEnd' in R), 'the client never computes an expiry; the database does (apply_plan)');
eq(R.perDayPaise(59900), 164, '₹599 a year is ₹1.64 a day');
eq(R.perDayPaise(79900), 219, '₹799 a year is ₹2.19 a day');
eq(R.perDayPaise(99900), 274, '₹999 a year is ₹2.74 a day');
eq(R.fmtPaise(R.perDayPaise(59900)), '₹1.64', 'and prints as ₹1.64');
eq(R.perDayPaise(0), null, 'nothing a day for a price that is not for sale');
const plan = { id: 'indie', price_paise: 799900, monthly_paise: 49900, yearly_paise: 499000 };
eq(R.priceFor(plan), 799900, 'the price is price_paise, not a period column');
eq(R.priceFor(plan, 'year'), 799900, 'asked for explicitly');
eq(R.priceFor(plan, 'lifetime'), null, '"for good" is not sold any more');
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

/* ---- receipt and refund e-mails (schema §35, _shared/mail.js) ---- */
const M = await import('../supabase/functions/_shared/mail.js');
const { BRAND: FB } = await import('../supabase/functions/_shared/brand.js');
const brandJson = JSON.parse((await import('node:fs')).readFileSync(new URL('../src/data/brand.json', import.meta.url), 'utf8'));
for (const k of ['name', 'host', 'supportEmail', 'seller']) eq(FB[k], brandJson[k], `functions' brand.${k} matches src/data/brand.json`);

const inv = { id: 'inv-1', number: 'FMS/2026-27/000007', buyer_email: 'buyer@example.com', buyer_name: '<b>Ana</b> & Co',
  plan_name: 'Intermediate', amount_paise: 79900, issued_at: '2026-10-11T10:00:00Z', paid_at: '2026-10-11T09:59:00Z', razorpay_payment_id: 'pay_ABC' };
const rm = M.receiptMail(inv);
ok(rm && rm.to === 'buyer@example.com', 'receipt goes to the invoice e-mail');
ok(rm.subject.includes('FMS/2026-27/000007') && rm.subject.includes('Intermediate'), 'receipt subject names the plan and the invoice');
ok(rm.html.includes('₹799') && rm.text.includes('₹799'), 'receipt prints ₹ from paise');
ok(rm.html.includes('&lt;b&gt;Ana&lt;/b&gt; &amp; Co') && !rm.html.includes('<b>Ana'), 'receipt HTML escapes the buyer name');
ok(rm.html.includes(M.REFUND_TERMS) && rm.text.includes(M.REFUND_TERMS), 'receipt carries the refund terms');
ok(rm.text.includes(`https://${brandJson.host}/refund`) && rm.text.includes(`https://${brandJson.host}/purchase`), 'receipt links the policy and the plan page');
ok(rm.text.includes('11 October 2026') && rm.text.includes('pay_ABC'), 'receipt dates in IST and names the payment id');
eq(M.receiptMail({ ...inv, buyer_email: '' }), null, 'no e-mail, no message');
const rf = M.refundMail({ refund_id: 'r1', status: 'processed', amount_paise: 79900, buyer_email: 'b@x.in', plan_name: 'Intermediate', invoice_number: 'FMS/2026-27/000007' });
ok(rf.subject.startsWith('Refund processed') && rf.text.includes('5 to 7 working days') && rf.text.includes('FMS/2026-27/000007'), 'processed refund mail');
ok(M.refundMail({ status: 'failed', amount_paise: 100, buyer_email: 'b@x.in' }).subject.includes('could not be completed'), 'failed refund mail');

const calls = [];
const fakeFetch = (status = 200) => async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ id: 'em_1' }), { status }); };
eq((await M.sendMail(rm, { apiKey: '', from: 'x' })).reason, 'not-configured', 'no key: nothing is sent');
calls.length = 0;
const sent = await M.sendMail(rm, { apiKey: 're_k', from: 'Studio <support@x.in>', idempotencyKey: 'receipt-inv-1', fetch: fakeFetch() });
ok(sent.ok && calls.length === 1 && calls[0].url === M.RESEND_URL, 'a configured send makes one Resend call');
ok(calls[0].init.headers.Authorization === 'Bearer re_k' && calls[0].init.headers['Idempotency-Key'] === 'receipt-inv-1', 'bearer key and idempotency key');
const sentBody = JSON.parse(calls[0].init.body);
ok(sentBody.from === 'Studio <support@x.in>' && sentBody.reply_to === brandJson.supportEmail && sentBody.to[0] === 'buyer@example.com', 'from, reply-to, to');
eq((await M.sendMail(rm, { apiKey: 'k', from: 'f', fetch: fakeFetch(403) })).reason, 'resend 403', 'a refusal is reported, not thrown');
eq((await M.sendMail(rm, { apiKey: 'k', from: 'f', fetch: async () => { throw new Error('down'); } })).reason, 'network', 'a network failure is reported, not thrown');

// claim -> send -> release on failure, against a fake service client
const fakeSvc = (rowsByFn) => { const log = []; return { log, rpc: async (fn, args) => { log.push([fn, args]); return { data: rowsByFn[fn] ?? null, error: null }; } }; };
const env = { RESEND_API_KEY: 'k', MAIL_FROM: 'f' };
let svc = fakeSvc({ claim_receipt_email: [inv] }); calls.length = 0;
ok((await M.sendReceiptOnce(svc, 'order_1', env, { fetch: fakeFetch() })).ok && calls.length === 1, 'claimed -> one mail');
ok(!svc.log.some(([fn]) => fn === 'release_receipt_email'), '... and no release');
svc = fakeSvc({ claim_receipt_email: [] }); calls.length = 0;
ok((await M.sendReceiptOnce(svc, 'order_1', env, { fetch: fakeFetch() })).skipped && calls.length === 0, 'nothing to claim -> no mail (the other caller sent it)');
svc = fakeSvc({ claim_receipt_email: [inv] });
const failed = await M.sendReceiptOnce(svc, 'order_1', env, { fetch: fakeFetch(500) });
ok(!failed.ok && svc.log.some(([fn, a]) => fn === 'release_receipt_email' && a.p_invoice === 'inv-1'), 'a failed send releases the claim');
svc = fakeSvc({ claim_receipt_email: [inv] });
ok((await M.sendReceiptOnce(svc, 'order_1', {})).reason === 'not-configured' && svc.log.length === 0, 'no key: nothing is claimed either');
svc = { rpc: async () => { throw new Error('boom'); } };
eq((await M.sendReceiptOnce(svc, 'o', env)).reason, 'error', 'a throwing client never throws out');
svc = fakeSvc({ claim_refund_email: [{ refund_id: 'r1', status: 'processed', amount_paise: 100, buyer_email: 'b@x.in' }] }); calls.length = 0;
ok((await M.sendRefundOnce(svc, 'rfnd_1', 'processed', env, { fetch: fakeFetch() })).ok && calls.length === 1, 'refund claimed -> one mail');
eq(JSON.parse(calls[0].init.body).subject.startsWith('Refund processed'), true, '... the processed one');
ok(calls[0].init.headers['Idempotency-Key'] === 'refund-r1-processed', 'refund idempotency key carries the status');

console.log(`${fail ? '✗' : '✓'} billing: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
