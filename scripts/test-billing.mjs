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
eq(R.PERIODS, ['year', 'pass'], 'two periods are sold: a year, and (§61) the launch pass');
eq(R.PLAN_DAYS, 365, 'a year is 365 days (PLAN_DAYS is the year; the pass length is the server\'s)');
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
eq(R.priceFor(plan, 'pass'), null, 'a pass is never priced from a plan row: the server prices it (§61 quote_pass)');
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
ok(rf.text.includes('fresh free trial') && !rf.text.includes('pass'), 'a year\'s refund mail still describes the refund trial');

/* ---- the launch pass (schema §61): worded from the row's own dates ---- */
{
  const pinv = { ...inv, plan_name: 'Pro', amount_paise: 4900, period: 'pass',
    valid_from: '2026-10-27T10:00:00Z', valid_until: '2026-11-03T10:00:00Z' };
  const pm = M.receiptMail(pinv);
  ok(pm.subject.includes('7-day pass') && pm.subject.includes('FMS/2026-27/000007'), 'pass receipt subject: "7-day pass" and the invoice');
  ok(pm.text.includes('7-day pass (until 3 November 2026)') && pm.text.includes('₹49'), 'pass receipt: "7-day pass (until …)" and ₹49');
  ok(!pm.text.includes('1 year') && !pm.text.includes('for a year'), 'a pass receipt never says a year');
  const p10 = M.receiptMail({ ...pinv, valid_until: '2026-11-06T10:00:00Z' });
  ok(p10.text.includes('10-day pass (until 6 November 2026)'), 'the length is read from the dates, never typed (10 days)');
  ok(M.receiptMail({ ...pinv, valid_from: null, valid_until: null }).text.includes('launch pass'), 'a pass with no dates says "launch pass", not a guessed length');
  const yr = M.receiptMail({ ...inv, valid_until: '2027-10-11T10:00:00Z' });
  ok(yr.text.includes('1 year (valid until 11 October 2027)'), 'a year\'s receipt reads the invoice\'s valid_until (§57)');
  const pr = M.refundMail({ refund_id: 'r2', status: 'processed', amount_paise: 4900, buyer_email: 'b@x.in', plan_name: 'Pro',
    period: 'pass', starts_at: pinv.valid_from, ends_at: pinv.valid_until });
  ok(pr.text.includes('7-day pass this payment bought') && pr.text.includes('does not come with a free trial')
     && !pr.text.includes('fresh free trial'), 'pass refund mail: the pass comes off and no trial follows');
}

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

/* ---- rzp-verify captures only what will be applied (§53, audit bug 8) ---- */
{
  const order = [];
  const can = (v) => async () => { order.push('can'); return v; };
  const cap = (v) => async () => { order.push('capture'); return v; };
  const ent = { amount: 59900, status: 'authorized' };
  let out = await R.settleAuthorized({ entity: ent, amountPaise: 59900, canActivate: can({ ok: false, reason: 'exhausted', sentence: 'used up' }), capture: cap({ status: 'captured' }) });
  eq(out.kind, 'refused', 'an order activation would refuse is not captured');
  eq(order, ['can'], '... the check runs and /capture is never called');
  ok(out.reason === 'exhausted' && out.sentence === 'used up', '... and the buyer is told why');
  order.length = 0;
  out = await R.settleAuthorized({ entity: ent, amountPaise: 59900, canActivate: can({ ok: true }), capture: cap({ status: 'captured', id: 'pay_1' }) });
  ok(out.kind === 'captured' && out.entity.id === 'pay_1', 'an order that will apply is captured');
  eq(order, ['can', 'capture'], '... the check comes BEFORE the capture');
  order.length = 0;
  out = await R.settleAuthorized({ entity: ent, amountPaise: 79900, canActivate: can({ ok: true }), capture: cap({ status: 'captured' }) });
  ok(out.kind === 'mismatch' && order.length === 0, 'an amount that does not match is neither checked nor captured');
  order.length = 0;
  out = await R.settleAuthorized({ entity: ent, amountPaise: 59900, canActivate: async () => { order.push('can'); throw new Error('down'); }, capture: cap({ status: 'captured' }) });
  ok(out.kind === 'pending' && !order.includes('capture'), 'a check that cannot be asked is not a yes: nothing is captured');
  out = await R.settleAuthorized({ entity: ent, amountPaise: 59900, canActivate: can({ ok: true }), capture: async () => { throw new Error('down'); } });
  eq(out.kind, 'pending', 'a capture that throws is pending, not captured');
  /* rzp-order: an attach that fails is a refusal, never an order handed out */
  const steps = [];
  let att = await R.attachOrder({ attach: async () => { steps.push('attach'); return { data: null, error: null }; }, abandon: async () => { steps.push('abandon'); } });
  ok(att.ok === true && steps.join() === 'attach', 'attachOrder: a clean attach is ok and abandons nothing');
  steps.length = 0;
  att = await R.attachOrder({ attach: async () => { steps.push('attach'); return { data: null, error: { message: 'timeout' } }; }, abandon: async () => { steps.push('abandon'); } });
  ok(att.ok === false && att.error.message === 'timeout' && steps.join() === 'attach,abandon', 'attachOrder: an rpc { error } is a refusal and the pending row is marked');
  att = await R.attachOrder({ attach: async () => { throw new Error('down'); }, abandon: async () => { throw new Error('also down'); } });
  ok(att.ok === false, 'attachOrder: an attach that throws is a refusal, even when the mark throws too');
  const orderSrc = (await import('node:fs')).readFileSync(new URL('../supabase/functions/rzp-order/index.ts', import.meta.url), 'utf8');
  const iAtt = orderSrc.indexOf('attachOrder({'), i200 = orderSrc.indexOf('return json(200');
  ok(iAtt > 0 && i200 > iAtt && /if \(!att\.ok\) return json\(502/.test(orderSrc.slice(iAtt, i200)) && !/await svc\.rpc\('attach_razorpay_order'/.test(orderSrc),
    'rzp-order checks the attach (attachOrder) and answers 502 before it returns the order to Checkout');
  // A failed order create marks the pending row by ITS OWN id, which frees
  // the promo hold quote_for counts; mark_payment_failed(null) matched nothing.
  {
    const calls = [];
    const fake = { from: (t) => ({ update: (p) => { const c = { t, p, eq: [] }; calls.push(c); const q = { eq: (k, v) => { c.eq.push([k, v]); return q; }, then: (res) => res({ error: null }) }; return q; } }) };
    await R.failPending(fake, 'pay_1', { error: { description: 'bad' } });
    eq(calls.map((c) => [c.t, c.p.status, c.p.raw?.error?.description, c.eq]), [['payments', 'failed', 'bad', [['id', 'pay_1'], ['status', 'created']]]], 'failPending: the row is marked failed by its id, and only while still created');
    calls.length = 0;
    await R.failPending(fake, 'pay_2', null);
    ok(calls.length === 1 && !('raw' in calls[0].p), 'failPending: no order body keeps the row\'s raw');
    let threw = false;
    try { await R.failPending({ from: () => { throw new Error('down'); } }, 'pay_3', null); } catch { threw = true; }
    ok(!threw, 'failPending never throws out to the 502');
    const iFail = orderSrc.indexOf('if (!r.ok || !order?.id)');
    ok(iFail > 0 && /failPending\(svc, row\.payment_id, order\)/.test(orderSrc.slice(iFail, iAtt)) && !/mark_payment_failed/.test(orderSrc),
      'rzp-order marks a failed order create by the row id, not mark_payment_failed(null)');
    ok(/abandon: \(\) => failPending\(svc, row\.payment_id/.test(orderSrc), 'the attach refusal reuses the same mark');
  }
  const verifySrc = (await import('node:fs')).readFileSync(new URL('../supabase/functions/rzp-verify/index.ts', import.meta.url), 'utf8');
  ok(/settleAuthorized\(/.test(verifySrc) && /payment_can_activate/.test(verifySrc) && !/\/capture`/.test(verifySrc.slice(0, verifySrc.indexOf('payment_can_activate'))),
    'rzp-verify routes the authorised branch through settleAuthorized, asking payment_can_activate before any /capture');
  ok(/unapplied_reason/.test(verifySrc), 'rzp-verify reports a payment recorded without its plan instead of "ok"');
}

/* ---- rzp-refund: only an answer may be recorded as failed (§53, audit bug 9) ---- */
eq(R.refundOutcome({ threw: true }), 'unknown', 'a call that threw is unknown, never failed');
eq(R.refundOutcome({ status: 200, body: { id: 'rfnd_1', status: 'pending' } }), 'created', 'a 200 with a refund is created');
eq(R.refundOutcome({ status: 200, body: null }), 'unknown', 'a 200 whose body did not parse is unknown');
eq(R.refundOutcome({ status: 400, body: { error: { description: 'The amount exceeds' } } }), 'refused', 'a 4xx with an error is a refusal');
eq(R.refundOutcome({ status: 502, body: { error: { description: 'bad gateway' } } }), 'unknown', 'a 5xx is unknown: the refund may have been made');
eq(R.refundOutcome({ status: 400, body: null }), 'unknown', 'a 4xx with no body is unknown');
eq(R.refundByReceipt({ items: [{ id: 'rfnd_a', receipt: 'x' }, { id: 'rfnd_b', receipt: 'rid-1' }] }, 'rid-1')?.id, 'rfnd_b', 'the refund made under our receipt is found');
eq(R.refundByReceipt({ items: [{ id: 'rfnd_a', receipt: 'x' }] }, 'rid-1'), null, 'none under our receipt -> null');
eq(R.refundByReceipt(null, 'rid-1'), null, 'no list -> null');
{
  const refundSrc = (await import('node:fs')).readFileSync(new URL('../supabase/functions/rzp-refund/index.ts', import.meta.url), 'utf8');
  ok(/refundOutcome\(/.test(refundSrc) && /refundByReceipt\(/.test(refundSrc), 'rzp-refund classifies the answer and looks for the refund by receipt');
  ok(!/Razorpay could not be reached\.' \} \};\s*\}\s*\/\/ 4\./.test(refundSrc), 'rzp-refund no longer turns a thrown call into a recorded failure');
}

/* ---- two currencies (schema §56, docs/US-MARKET-PLAN.md §C5) ---- */
eq(R.CURRENCIES, ['INR', 'USD'], 'an order is in INR or USD, nothing else');
eq(R.orderCurrency(undefined), 'INR', 'no currency in the body is a rupee order');
eq(R.orderCurrency(''), 'INR', 'an empty currency is a rupee order');
eq(R.orderCurrency(' usd '), 'USD', 'usd, any case, is USD');
eq(R.orderCurrency('EUR'), null, 'any other currency is refused (rzp-order answers 400)');
eq(R.orderCurrency(840), null, 'a number is not a currency');
eq(R.fmtMinor(59900), '₹599', 'fmtMinor: rupees by default');
eq(R.fmtMinor(59950, 'INR'), '₹599.50', 'fmtMinor: with paise');
eq(R.fmtMinor(1234500, 'INR'), '₹12,345', 'fmtMinor: Indian grouping for rupees');
eq(R.fmtMinor(1250000000, 'INR'), '₹1,25,00,000', 'fmtMinor: lakh and crore grouping');
eq(R.fmtMinor(1900, 'USD'), '$19', 'fmtMinor: whole dollars');
eq(R.fmtMinor(1950, 'usd'), '$19.50', 'fmtMinor: dollars and cents, any case');
eq(R.fmtMinor(123456700, 'USD'), '$1,234,567', 'fmtMinor: US grouping for dollars');
eq(R.fmtMinor(5, 'USD'), '$0.05', 'fmtMinor: five cents');
eq(R.fmtMinor(59900, 'INR'), R.fmtPaise(59900), 'fmtMinor agrees with fmtPaise on rupees');
eq(R.fmtPaise(1950), '₹19.50', 'fmtPaise is unchanged (the client imports it)');
eq(R.perDayMinor(1900), 5, 'perDayMinor: $19 a year is $0.05 a day');
eq(R.perDayMinor(59900), R.perDayPaise(59900), 'perDayMinor rounds exactly as perDayPaise');
eq(R.perDayMinor(0), null, 'perDayMinor: nothing a day for a price that is not for sale');
eq(R.parseMinor('$19.50', 'USD'), 1950, 'parseMinor: $19.50 -> 1950 cents');
eq(R.parseMinor('19.5', 'USD'), 1950, 'parseMinor: one decimal is tens of cents');
eq(R.parseMinor('USD 1,999', 'USD'), 199900, 'parseMinor: a code and grouping');
eq(R.parseMinor('₹19', 'USD'), null, 'parseMinor: a rupee figure in a dollar field is refused, never read as $19');
eq(R.parseMinor('$19', 'INR'), null, 'parseMinor: and the other way round');
eq(R.parseMinor('₹599.50', 'INR'), 59950, 'parseMinor: rupees');
eq(R.parseMinor('19.505', 'USD'), null, 'parseMinor: three decimals is not a price');
eq(R.parseMinor('19 dollars', 'USD'), null, 'parseMinor: words are not a price');
eq(R.parseMinor('', 'USD'), null, 'parseMinor: empty is null');
eq(R.parseMinor('19', 'EUR'), null, 'parseMinor: no third currency');
eq(R.parseRupees('₹499.50'), 49950, 'parseRupees is unchanged');
{
  const order = [];
  const ent = { amount: 2400, currency: 'USD', status: 'authorized' };
  let out = await R.settleAuthorized({ entity: ent, amountPaise: 2400, currency: 'INR',
    canActivate: async () => { order.push('can'); return { ok: true }; }, capture: async () => { order.push('capture'); return { status: 'captured' }; } });
  ok(out.kind === 'mismatch' && order.length === 0, 'settleAuthorized: an authorisation in another currency is neither checked nor captured');
  out = await R.settleAuthorized({ entity: ent, amountPaise: 2400, currency: 'usd',
    canActivate: async () => ({ ok: true }), capture: async () => ({ status: 'captured', id: 'pay_u' }) });
  ok(out.kind === 'captured', 'settleAuthorized: the same currency (any case) is captured');
  out = await R.settleAuthorized({ entity: { amount: 59900, status: 'authorized' }, amountPaise: 59900,
    canActivate: async () => ({ ok: true }), capture: async () => ({ status: 'captured' }) });
  ok(out.kind === 'captured', 'settleAuthorized: a caller that names no currency behaves as before');
}
{
  const usdInv = { ...inv, amount_paise: 2400, currency: 'USD' };
  const um = M.receiptMail(usdInv);
  ok(um.text.includes('$24') && !um.text.includes('₹'), 'a dollar receipt prints dollars, and no rupee sign');
  ok(M.receiptMail(inv).text.includes('₹799'), 'an invoice with no currency (before §56) is rupees');
  const ur = M.refundMail({ status: 'processed', amount_paise: 1950, currency: 'USD', buyer_email: 'b@x.com', plan_name: 'Basic' });
  ok(ur.subject === 'Refund processed: $19.50' && ur.text.includes('Your refund of $19.50'), 'a dollar refund mail prints $19.50');
  ok(M.refundMail({ status: 'processed', amount_paise: 79900, buyer_email: 'b@x.in' }).subject === 'Refund processed: ₹799', 'a refund claim with no currency is rupees');
}
{
  const fs = await import('node:fs');
  const src = (f) => fs.readFileSync(new URL(`../supabase/functions/${f}`, import.meta.url), 'utf8');
  const order = src('rzp-order/index.ts'), verify = src('rzp-verify/index.ts'), refund = src('rzp-refund/index.ts');
  ok(/orderCurrency\(body\.currency\)/.test(order) && /json\(400/.test(order.slice(order.indexOf('orderCurrency(body.currency)'))),
    'rzp-order reads the currency from the body through orderCurrency, and answers 400 for any other');
  ok(/currency === 'INR' \? \{\} : \{ p_currency: currency \}/.test(order),
    'rzp-order sends p_currency only for dollars, so a rupee order works on a database without §56');
  ok(/currency: row\.currency/.test(order) && /amount: row\.amount_paise/.test(order),
    'rzp-order creates the Razorpay order in the ROW\'s currency and amount, never the body\'s');
  ok(!/body\.amount/.test(order), 'rzp-order never reads an amount from the request');
  ok(/amount_minor: row\.amount_paise/.test(order), 'rzp-order answers the _minor mirrors beside the _paise keys');
  ok(/currency: pay\.currency \|\| 'INR'/.test(verify) && /settleAuthorized\(\{[\s\S]*?currency: pay\.currency/.test(verify),
    'rzp-verify captures in the payment\'s currency and has settleAuthorized check it');
  ok(/body\.amount_minor \?\? body\.amount_paise/.test(refund) && /currency: intent\.currency/.test(refund),
    'rzp-refund takes amount_minor (or the older amount_paise) and answers the payment\'s currency');
  const sql = fs.readFileSync(new URL('../supabase/schema/schema-56-usd-checkout.sql', import.meta.url), 'utf8');
  ok(!/\b(?:1900|2900|3900)\b/.test(sql.replace(/^\s*--.*$/gm, '')), 'schema §56 hard-codes no dollar price (the owner types them)');
  ok(/admin_set_usd_checkout/.test(sql) && /require_role\(array\['owner'\]\)/.test(sql), 'schema §56: the switch exists and is owner only');
}

console.log(`${fail ? '✗' : '✓'} billing: ${pass} passed, ${fail} failed`);

/* ---- the client half: purchase-model, buy(), the plan cards ----
   In its own process, because it registers a module loader (a store.js
   stub, an import.meta.env for billing.js) that this file must not run
   under. */
{
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, [new URL('./test-billing-client.mjs', import.meta.url).pathname], { stdio: 'inherit' });
  if (r.status !== 0) fail++;
}
process.exit(fail ? 1 : 0);
