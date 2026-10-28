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

// SMTP path (a mailbox, e.g. Hostinger's): used only when there is no Resend key
const smtpCalls = [];
const fakeSmtp = (fail) => async (conn, m) => { smtpCalls.push({ conn, m }); if (fail) throw new Error('535 auth'); };
const smtpEnv = { MAIL_FROM: 'Studio <support@x.in>', SMTP_USER: 'support@x.in', SMTP_PASSWORD: 'pw' };
ok(M.mailConfigured(smtpEnv) && !M.mailConfigured({ MAIL_FROM: 'f' }) && M.mailConfigured({ MAIL_FROM: 'f', RESEND_API_KEY: 'k' }) && !M.mailConfigured({ SMTP_USER: 'u', SMTP_PASSWORD: 'p' }),
  'configured = a From address and either a Resend key or an SMTP user and password');
{
  const smtpSvc = fakeSvc({ claim_receipt_email: [inv] });
  const out = await M.sendReceiptOnce(smtpSvc, 'order_1', smtpEnv, { smtpSend: fakeSmtp(false), fetch: async () => { throw new Error('Resend must not be called'); } });
  ok(out.ok && smtpCalls.length === 1, 'no Resend key: one SMTP send, Resend never called');
  ok(smtpCalls[0].conn.host === 'smtp.hostinger.com' && smtpCalls[0].conn.port === 465 && smtpCalls[0].conn.user === 'support@x.in' && smtpCalls[0].conn.pass === 'pw', 'Hostinger on 465 by default');
  ok(smtpCalls[0].m.from === 'Studio <support@x.in>' && smtpCalls[0].m.to === 'buyer@example.com' && smtpCalls[0].m.replyTo === brandJson.supportEmail && smtpCalls[0].m.html && smtpCalls[0].m.text, 'from, to, reply-to, html and text');
  const bad = fakeSvc({ claim_receipt_email: [inv] });
  const fo = await M.sendReceiptOnce(bad, 'order_1', smtpEnv, { smtpSend: fakeSmtp(true) });
  ok(!fo.ok && fo.reason === 'smtp' && bad.log.some(([fn, a]) => fn === 'release_receipt_email' && a.p_invoice === 'inv-1'), 'a failed SMTP send is reported and releases the claim');
  const both = fakeSvc({ claim_receipt_email: [inv] }); calls.length = 0; smtpCalls.length = 0;
  await M.sendReceiptOnce(both, 'order_1', { ...smtpEnv, RESEND_API_KEY: 'k' }, { smtpSend: fakeSmtp(false), fetch: fakeFetch() });
  ok(calls.length === 1 && smtpCalls.length === 0, 'with both set, Resend wins');
  ok(M.mailEnvFrom((k) => ({ SMTP_USER: 'u' })[k]).SMTP_USER === 'u' && M.mailEnvFrom(() => undefined).SMTP_PASSWORD === '', 'mailEnvFrom reads all six variables and defaults to empty');
}

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

/* ---- auto-renew: subscriptions (schema §62) ---- */
{
  const fs = await import('node:fs');
  const ssig = nodeHmac(SECRET, 'pay_S1|sub_S1');
  const sb = { razorpay_payment_id: 'pay_S1', razorpay_subscription_id: 'sub_S1', razorpay_signature: ssig };
  ok(await R.verifySubscriptionSignature(sb, SECRET), 'a genuine subscription checkout signature verifies (payment_id|subscription_id)');
  ok(!(await R.verifySubscriptionSignature({ ...sb, razorpay_signature: nodeHmac(SECRET, 'sub_S1|pay_S1') }, SECRET)), 'the ids the other way round (an order\'s order) fail');
  ok(!(await R.verifySubscriptionSignature({ ...sb, razorpay_subscription_id: 'sub_S2' }, SECRET)), 'a different subscription id fails');
  ok(!(await R.verifySubscriptionSignature({ ...sb, razorpay_signature: ssig.slice(0, -1) + (ssig.endsWith('0') ? '1' : '0') }, SECRET)), 'one changed character fails');
  ok(!(await R.verifySubscriptionSignature(sb, WH)), 'the webhook secret fails: checkout is signed with the KEY secret');
  ok(!(await R.verifySubscriptionSignature(sb, '')), 'an empty secret fails');
  ok(!(await R.verifySubscriptionSignature({ razorpay_payment_id: 'pay_S1', razorpay_signature: ssig }, SECRET)), 'a missing subscription id fails');
  ok(!(await R.verifyPaymentSignature({ razorpay_order_id: 'sub_S1', razorpay_payment_id: 'pay_S1', razorpay_signature: ssig }, SECRET)),
    'a subscription signature is not accepted as an order signature');

  eq(R.rzpPeriod('pass', 7), { period: 'daily', interval: 7 }, 'a pass is a daily plan with the pass\'s days as the interval');
  eq(R.rzpPeriod('year'), { period: 'yearly', interval: 1 }, 'a year is a yearly plan, interval 1');
  eq(R.rzpPeriod('pass', 0), null, 'a pass of no days is refused');
  eq(R.maxTotalCount('year'), R.MAX_YEARS, 'a year runs MAX_YEARS cycles');
  eq(R.maxTotalCount('pass', 7), Math.floor(R.MAX_YEARS * 365 / 7), 'a 7-day pass runs MAX_YEARS of weeks');
  const pb = R.planBody({ product: 'pass', period: 'pass', days: 7, amountMinor: 4900, currency: 'INR', planName: 'Pro' });
  ok(pb.period === 'daily' && pb.interval === 7 && pb.item.amount === 4900 && pb.item.currency === 'INR' && pb.item.name === 'Pro, 7-day pass',
    'planBody: daily × 7, ₹49, named "Pro, 7-day pass"');
  eq(R.planBody({ product: 'pass', period: 'pass', days: 7, amountMinor: 50, planName: 'Pro' }), null, 'planBody refuses under Razorpay\'s minimum');
  const desc = R.subscriptionDescription({ planName: 'Pro', period: 'pass', days: 7, amountMinor: 9900, currency: 'INR' });
  ok(desc.includes('₹99') && desc.includes('every 7 days') && /cancel anytime/i.test(desc), 'the Checkout description states the amount, how often and "cancel anytime"');
  ok(R.subscriptionDescription({ planName: 'Basic', period: 'year', amountMinor: 59900 }).includes('every year'), 'a yearly description says every year');
  const sbody = R.subscriptionBody({ planId: 'plan_1', period: 'pass', days: 7, rowId: 'row-1', userId: 'u-1', product: 'pass' });
  ok(sbody.plan_id === 'plan_1' && sbody.customer_notify === 1 && sbody.total_count === R.maxTotalCount('pass', 7)
     && sbody.notes.subscription_row_id === 'row-1' && sbody.notes.user_id === 'u-1' && sbody.notes.product === 'pass' && !('start_at' in sbody),
    'subscriptionBody: the plan, the max count, customer_notify 1, the notes, and no start_at (charged at authentication)');
  eq(R.subscriptionBody({ planId: '', period: 'pass', days: 7 }), null, 'no plan, no subscription');
  eq(R.cancelBody('active'), { cancel_at_cycle_end: 1 }, 'a running subscription is cancelled at the end of the cycle');
  eq(R.cancelBody('created'), { cancel_at_cycle_end: 0 }, 'one never authenticated is cancelled at once');
  eq(R.statusForEvent('subscription.activated'), 'active', 'subscription.activated means active');
  eq(R.statusForEvent('subscription.charged'), 'active', 'subscription.charged means active');
  eq(R.statusForEvent('subscription.paused'), 'halted', 'paused reads as halted');
  eq(R.statusForEvent('subscription.halted'), 'halted', 'halted');
  eq(R.statusForEvent('subscription.weird', { status: 'cancelled' }), 'cancelled', 'an unknown event falls back to the entity\'s status');
  eq(R.statusForEvent('payment.captured', { status: 'nope' }), null, 'anything else is no status');
  eq(R.subscriptionOfPayment({ id: 'p', subscription_id: 'sub_9' }), 'sub_9', 'a payment entity names its subscription');
  eq(R.subscriptionOfPayment({ id: 'p' }), null, 'an order payment names none');
  eq(R.isoFromUnix(1761523200), '2025-10-27T00:00:00.000Z', 'Razorpay seconds become ISO');

  const Ms = await import('../supabase/functions/_shared/mail.js');
  const cinv = { id: 'inv-9', number: 'FMS/2026-27/000042', buyer_email: 'sub@example.com', buyer_name: 'Sub', plan_name: 'Pro',
    period: 'pass', sub_period: 'pass', amount_paise: 9900, currency: 'INR', paid_at: '2026-10-27T10:00:00Z',
    valid_from: '2026-10-27T10:00:00Z', valid_until: '2026-11-03T10:00:00Z', razorpay_payment_id: 'pay_C1',
    renews: true, renews_at: '2026-11-03T10:00:00Z', renew_minor: 9900, renew_currency: 'INR', every_days: 7 };
  const cm = Ms.chargeReceiptMail(cinv);
  ok(cm.text.includes('Renews on 3 November 2026 at ₹99. Cancel anytime with Razorpay, in your mandate e-mail or your bank / UPI app.'),
    'a charge receipt says "Renews on <date> at <amount>. Cancel anytime with Razorpay, in your mandate e-mail or your bank / UPI app."');
  ok(!/nothing renews/i.test(cm.text) && cm.text.includes('7-day pass') && cm.text.includes('FMS/2026-27/000042') && cm.text.includes(Ms.REFUND_TERMS),
    'it never says "nothing renews", names the 7-day pass and the invoice, and keeps the refund terms');
  const off = Ms.chargeReceiptMail({ ...cinv, renews: false });
  ok(off.text.includes('Auto-pay is off. Nothing more will be charged') && !off.text.includes('Renews on'), 'after a cancel the receipt says nothing more will be charged');
  ok(Ms.chargeReceiptMail({ ...cinv, period: 'year', sub_period: 'year', plan_name: 'Basic', valid_until: '2027-10-27T10:00:00Z', renews_at: '2027-10-27T10:00:00Z', renew_minor: 59900, amount_paise: 59900 })
       .text.includes('Renews on 27 October 2027 at ₹599'), 'a yearly charge receipt names the next year\'s date and amount');
  ok(Ms.receiptMail({ ...cinv, renews: undefined }).text.includes('nothing renews automatically'), 'a ONE-TIME pass receipt is unchanged ("nothing renews")');
  const xm = Ms.cancelMail({ subscription_row_id: 'r1', email: 'sub@example.com', period: 'pass', days: 7, plan_name: 'Pro', amount_minor: 9900, currency: 'INR', current_end: '2026-11-03T10:00:00Z' });
  ok(xm.subject === 'Auto-pay cancelled' && xm.text.includes('Nothing more will be charged') && xm.text.includes('3 November 2026')
     && xm.text.includes('₹99 every 7 days') && /does not refund/.test(xm.text),
    'the cancellation mail: nothing more charged, access until the date, what it was, no refund for a cancel');
  eq(Ms.cancelMail({ email: '' }), null, 'no e-mail, no cancellation mail');
  const rem = Ms.renewalReminderMail({ email: 'sub@example.com', plan_name: 'Pro', period: 'pass', days: 7, amount_minor: 9900, currency: 'INR', next_charge_at: '2026-11-03T10:00:00Z' });
  ok(rem.subject.includes('3 November 2026') && rem.text.includes('₹99') && rem.text.includes('Razorpay'), 'the pre-charge reminder names the date, the amount and where to cancel');
  eq(Ms.renewalReminderMail({ email: 'x@y.in' }), null, 'no next charge date, no reminder');

  /* ---- §63: the reminder is sent, once per cycle ---- */
  ok(rem.text.includes('Cancel anytime in your Razorpay mandate e-mail or your bank / UPI app; nothing more is charged after you cancel')
     && rem.subject.includes('₹99') && rem.text.includes('every 7 days') && rem.text.includes(Ms.REFUND_TERMS),
    'the reminder says where to cancel and that nothing more is charged after, with the amount, the repeat and the refund terms');
  const remRow = { subscription_row_id: 'sub-row-1', email: 'sub@example.com', name: 'Rina', product: 'starter', plan_name: 'Basic',
    period: 'year', days: 365, amount_minor: 59900, currency: 'INR', next_charge_at: '2027-10-27T10:00:00+00:00' };
  const ry = Ms.renewalReminderMail(remRow);
  ok(ry.text.startsWith(FB.name) && ry.text.includes('Hi Rina,') && ry.text.includes('Basic plan') && ry.text.includes('₹599 on 27 October 2027')
     && ry.text.includes('every year'), 'a claim row (name, plan_name, year) words a yearly reminder');
  ok(Ms.renewalReminderMail({ ...remRow, currency: 'USD', amount_minor: 1900 }).text.includes('$19'), 'a dollar subscription is reminded in dollars');
  ok(!Ms.renewalReminderMail({ ...remRow, name: '<b>x</b>' }).html.includes('<b>x</b>'), 'the name is escaped in the HTML');

  eq(await Ms.checkCronSecret('s3cret-value', ''), 'unset', 'cron: no CRON_SECRET configured is "unset" (503), never a pass');
  eq(await Ms.checkCronSecret('', ''), 'unset', 'cron: an empty header against an empty secret is still "unset"');
  eq(await Ms.checkCronSecret('s3cret-value', 's3cret-value'), 'ok', 'cron: the right secret passes');
  eq(await Ms.checkCronSecret('s3cret-valuE', 's3cret-value'), 'bad', 'cron: one changed character fails');
  eq(await Ms.checkCronSecret('s3cret', 's3cret-value'), 'bad', 'cron: a prefix fails');
  eq(await Ms.checkCronSecret('', 's3cret-value'), 'bad', 'cron: a missing header fails');

  const rfake = (rows, fail = {}) => { const log = []; return { log, rpc: async (fn, args) => { log.push([fn, args]); return fail[fn] ? { data: null, error: { message: fail[fn] } } : { data: rows[fn] ?? null, error: null }; } }; };
  const r0 = rfake({ claim_renewal_reminders: [remRow] });
  const n0 = await Ms.sendRenewalReminders(r0, {});
  ok(n0.reason === 'not-configured' && r0.log.length === 0, 'reminders: with no Resend key NOTHING is claimed (no cycle marked reminded without a mail)');
  const sentTo = [];
  const r1 = rfake({ claim_renewal_reminders: [remRow, { ...remRow, subscription_row_id: 'sub-row-2', email: 'b@x.in' }] });
  const n1 = await Ms.sendRenewalReminders(r1, { RESEND_API_KEY: 'k', MAIL_FROM: 'f' },
    { fetch: async (u, init) => { sentTo.push(init); return new Response('{"id":"e"}', { status: 200 }); } });
  ok(n1.ok && n1.sent === 2 && n1.failed === 0 && r1.log[0][0] === 'claim_renewal_reminders' && r1.log[0][1].p_within === '48 hours'
     && !r1.log.some(([fn]) => fn === 'release_renewal_reminder'), 'reminders: claimed first (48 hours), each sent, nothing released');
  ok(sentTo[0].headers['Idempotency-Key'] === 'remind-sub-row-1-2027-10-27T10:00:00.000Z', 'reminders: Resend key is remind-<row>-<charge date>, one per cycle');
  const r2 = rfake({ claim_renewal_reminders: [remRow, { ...remRow, subscription_row_id: 'sub-row-2' }] });
  let k = 0;
  const n2 = await Ms.sendRenewalReminders(r2, { RESEND_API_KEY: 'k', MAIL_FROM: 'f' },
    { fetch: async () => new Response('x', { status: k++ ? 200 : 500 }) });
  ok(!n2.ok && n2.sent === 1 && n2.failed === 1
     && r2.log.filter(([fn]) => fn === 'release_renewal_reminder').length === 1
     && r2.log.some(([fn, a]) => fn === 'release_renewal_reminder' && a.p_row === 'sub-row-1' && a.p_for === remRow.next_charge_at),
    'reminders: a failed send releases ITS cycle (row + charge date) and the rest still go');
  const r3 = rfake({}, { claim_renewal_reminders: 'boom' });
  ok((await Ms.sendRenewalReminders(r3, { RESEND_API_KEY: 'k', MAIL_FROM: 'f' })).reason === 'claim', 'reminders: a claim error is reported, never thrown');
  ok((await Ms.sendRenewalReminders(rfake({ claim_renewal_reminders: [] }), { RESEND_API_KEY: 'k', MAIL_FROM: 'f' })).sent === 0, 'reminders: nothing due, nothing sent');

  const remind = fs.readFileSync(new URL('../supabase/functions/rzp-remind/index.ts', import.meta.url), 'utf8');
  ok(/x-cron-secret/.test(remind) && /checkCronSecret\(/.test(remind) && /json\(503/.test(remind) && /json\(401/.test(remind) && /'POST only'/.test(remind),
    'rzp-remind: POST only, x-cron-secret checked (503 unset, 401 wrong)');
  ok(remind.indexOf('RESEND_API_KEY') < remind.indexOf('sendRenewalReminders(svc'), 'rzp-remind: refuses before claiming when mail is not configured');
  const wf = fs.readFileSync(new URL('../.github/workflows/renewal-reminders.yml', import.meta.url), 'utf8');
  ok(/cron: '17 \* \* \* \*'/.test(wf) && /workflow_dispatch/.test(wf) && /exit 0/.test(wf) && /x-cron-secret: \$CRON_SECRET/.test(wf),
    'the workflow runs hourly at :17, can be run by hand, and no-ops without its secrets');
  const s63 = fs.readFileSync(new URL('../supabase/schema/schema-63-renewal-reminders.sql', import.meta.url), 'utf8');
  ok(/add column if not exists reminded_for timestamptz/.test(s63) && /skip locked/.test(s63)
     && /grant  execute on function public\.claim_renewal_reminders\(interval, int\)\s+to service_role/.test(s63)
     && !/claim_renewal_reminders[^;]*to (anon|authenticated)/.test(s63),
    'schema §63: one column, a SKIP LOCKED claim, service role only');
  const cfake = (rows) => { const log = []; return { log, rpc: async (fn, args) => { log.push([fn, args]); return { data: rows[fn] ?? null, error: null }; } }; };
  const cs = cfake({ claim_charge_receipt_email: cinv });
  const cout = await Ms.sendChargeReceiptOnce(cs, 'pay_C1', { RESEND_API_KEY: 'k', MAIL_FROM: 'f' }, { fetch: async () => new Response('{"id":"e"}', { status: 200 }) });
  ok(cout.ok && cs.log[0][0] === 'claim_charge_receipt_email' && cs.log[0][1].p_rzp_payment_id === 'pay_C1', 'sendChargeReceiptOnce claims by the payment id, then sends');
  const cs2 = cfake({ claim_charge_receipt_email: cinv });
  await Ms.sendChargeReceiptOnce(cs2, 'pay_C1', { RESEND_API_KEY: 'k', MAIL_FROM: 'f' }, { fetch: async () => new Response('no', { status: 500 }) });
  ok(cs2.log.some(([fn, a]) => fn === 'release_receipt_email' && a.p_invoice === 'inv-9'), 'a failed send releases the claim');
  const cs3 = cfake({});
  ok((await Ms.sendChargeReceiptOnce(cs3, 'pay_C1', {})).reason === 'not-configured' && cs3.log.length === 0, 'unconfigured mail claims nothing');

  const src = (f) => fs.readFileSync(new URL(`../supabase/functions/${f}`, import.meta.url), 'utf8');
  const subscribe = src('rzp-subscribe/index.ts'), cancel = src('rzp-cancel/index.ts'), verify = src('rzp-verify/index.ts'), hook = src('rzp-webhook/index.ts');
  ok(!/body\.amount/.test(subscribe) && /create_pending_subscription/.test(subscribe), 'rzp-subscribe never reads an amount; the database prices it');
  ok(subscribe.indexOf("'set_subscription_rzp_ids'") > subscribe.indexOf("rzp('subscriptions'") && subscribe.indexOf("'set_subscription_rzp_ids'") < subscribe.indexOf('json(200'),
    'rzp-subscribe stores Razorpay\'s id before it hands it to Checkout');
  ok(/rzp_plan_for/.test(subscribe) && /remember_rzp_plan/.test(subscribe), 'rzp-subscribe finds or makes the plan for the exact price (the lock)');
  ok(/verifySubscriptionSignature\(body, keySecret\)/.test(verify) && !/\/capture`[\s\S]{0,40}razorpay_subscription_id/.test(verify),
    'rzp-verify checks a subscription signature and does not capture');
  ok(/request_cancel_subscription/.test(cancel) && /admin_cancel_subscription/.test(cancel) && /asUser\.rpc\('admin_cancel_subscription'/.test(cancel),
    'rzp-cancel marks the cancel AS THE CALLER (the database decides who may)');
  ok(/undo_cancel_subscription/.test(cancel), 'rzp-cancel undoes its mark when Razorpay does not confirm');
  ok(/'subscription\.charged'/.test(hook) && /apply_subscription_charge/.test(hook) && /mark_subscription_status/.test(hook) && /x-razorpay-event-id/.test(hook),
    'rzp-webhook applies subscription.charged, records statuses and logs the event id');
  ok(/case 'payment\.captured'[\s\S]{0,200}subscriptionOfPayment/.test(hook), 'payment.captured with a subscription goes to the charge, not to activate_payment');

  const s62 = fs.readFileSync(new URL('../supabase/schema/schema-62-autorenew.sql', import.meta.url), 'utf8');
  ok(/pass_mode text not null default 'once'/.test(s62) && /plan_mode text not null default 'once'/.test(s62), 'schema §62: both modes default to once');
  ok(!/\b(?:4900|9900|59900)\b/.test(s62.replace(/^\s*--.*$/gm, '').replace(/coalesce\(s\.pass_paise, 4900\)/, '')), 'schema §62 hard-codes no price (the subscription takes the server\'s)');
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
