/* ============================================================
   rzp-refund — an administrator refunds a captured payment
   ------------------------------------------------------------
   Called from the admin console's REFUND button and from APPROVE on a
   customer's refund request (schema section 27). Runs with the caller's
   JWT in the Authorization header and the service role in the function.

     1. who — Auth is asked who the JWT belongs to; then
        require_role(['finance']) is called AS THAT CALLER, the same check
        the finance console RPCs make (owner always passes; support and
        non-admins get 403). Nobody else gets past here, whatever the
        browser showed, and begin_refund() re-checks the actor's role.
     2. begin_refund() — under a row lock on the payment: it must be
        'paid' (captured), not refunded and with no refund in flight,
        the amount between 1 minor unit and what was paid (default: all), a
        reason given, and a request (if one is named) still open. It
        writes the intent as an 'initiated' refunds row BEFORE Razorpay
        is called, so a crash leaves a record, never a refund without one.
     3. POST /v1/payments/{id}/refund — Basic auth, the key secret from
        the environment. The refunds row id is the `receipt` and the
        X-Refund-Idempotency header; notes carry the reason and the
        admin's e-mail.
     4. record_refund() — 'pending' or 'processed' as Razorpay says;
        'failed' (with the error) ONLY when Razorpay answered with a
        refusal, which leaves the payment and any request untouched and
        allows a retry.
     NO ANSWER IS NOT A REFUSAL (§53, audit bug 9). A call that threw,
        a 5xx, or a 2xx with no refund in it may have made the refund.
        Recording that as 'failed' let the retry go out under a NEW
        idempotency key and refund twice. Now Razorpay is asked which
        refunds the payment has, by our receipt (the refunds row id); a
        match is recorded as itself, and no match leaves the row
        'initiated'. begin_refund hands that row back to a retry made a
        minute or more later, so the retry carries the SAME key. A linked
        request reads 'refunded' only once the refund is processed;
        while it is pending the request is 'approved' (section 50).

   CURRENCY (schema §55). A refund is in the currency of the payment it
   refunds, and Razorpay refunds in the original currency; begin_refund()
   names it (`currency`) and the refunds row is stamped with it. The
   amount is minor units of that currency, and the answer says which.

   WHO ENDS THE PLAN. record_refund() calls mark_payment_refunded() when
   the status is 'processed'; the refund.processed WEBHOOK calls
   record_refund() and mark_payment_refunded() too. Both paths are
   idempotent (the refunds row is upserted by the Razorpay refund id;
   mark_payment_refunded returns at once for a payment already
   'refunded'), so whichever arrives first does the work and the other
   changes nothing. A normal-speed refund answers 'pending' here and
   the webhook finishes it.

   Secrets (set with `supabase secrets set`, never in the repo), reused:
     RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
   SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
   provided by the platform. docs/BILLING.md is the runbook.
   ============================================================ */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { basicAuth, refundOutcome, refundByReceipt } from '../_shared/razorpay.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const keyId = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
  if (!keyId || !keySecret) return json(503, { error: 'Payments are not configured on this studio yet.' });

  // 1. who, and are they an administrator (asked of the database, as them)
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'Sign in first.' });
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: auth } } });
  const { data: who, error: whoErr } = await asUser.auth.getUser();
  if (whoErr || !who?.user) return json(401, { error: 'Sign in first.' });
  const admin = who.user;
  // The console's role matrix (schema sections 45/46): a refund is a
  // finance decision, and an owner always passes. require_role() raises
  // 42501 for a non-admin and for any other role. begin_refund() asks the
  // same question of p_admin again (section 50), so this is not the only gate.
  const { error: roleErr } = await asUser.rpc('require_role', { p_roles: ['finance'] });
  if (roleErr) return json(403, { error: roleErr.message || 'Administrators only.' });

  let body: { payment_id?: string; amount_paise?: number | null; amount_minor?: number | null; reason?: string; request_id?: string | null } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const paymentId = String(body.payment_id ?? '');
  const reason = String(body.reason ?? '').trim();
  // minor units of the PAYMENT's currency (schema §55): paise for a rupee
  // payment, cents for a dollar one. `amount_paise` is the name older
  // console builds send; `amount_minor` says the same thing.
  const given = body.amount_minor ?? body.amount_paise;
  const amount = given == null ? null : Number(given);
  if (!paymentId) return json(400, { error: 'Which payment?' });
  if (!reason) return json(400, { error: 'A reason is required.' });
  if (amount !== null && (!Number.isInteger(amount) || amount < 1)) return json(400, { error: 'The amount is a whole number of minor units of the payment\'s currency (paise or cents), at least 1.' });

  // 2. the intent, checked and written under a lock
  const svc = createClient(url, serviceKey);
  const { data: began, error: beginErr } = await svc.rpc('begin_refund', {
    p_payment: paymentId, p_amount: amount, p_reason: reason, p_admin: admin.id, p_request: body.request_id ?? null
  });
  if (beginErr) return json(beginErr.code === '42501' ? 403 : 400, { error: beginErr.message });
  const intent = Array.isArray(began) ? began[0] : began;
  if (!intent?.refund_id) return json(500, { error: 'Could not record the refund.' });

  // 3. Razorpay
  const rzpAuth = basicAuth(keyId, keySecret);
  const pid = encodeURIComponent(intent.razorpay_payment_id);
  let rz: any = null, outcome = 'unknown';
  try {
    const r = await fetch(`https://api.razorpay.com/v1/payments/${pid}/refund`, {
      method: 'POST',
      headers: { Authorization: rzpAuth, 'Content-Type': 'application/json', 'X-Refund-Idempotency': intent.refund_id },
      body: JSON.stringify({
        amount: intent.amount_paise, speed: 'normal', receipt: intent.refund_id,
        notes: { reason: reason.slice(0, 200), refunded_by: admin.email ?? admin.id, payment_id: paymentId, request_id: body.request_id ?? '' }
      })
    });
    rz = await r.json().catch(() => null);
    outcome = refundOutcome({ status: r.status, body: rz });
  } catch {
    outcome = refundOutcome({ threw: true });
  }
  if (outcome === 'unknown') {
    // Did the refund happen? Ask by our receipt before saying anything.
    const listed = await fetch(`https://api.razorpay.com/v1/payments/${pid}/refunds?count=100`, { headers: { Authorization: rzpAuth } })
      .then((x) => (x.ok ? x.json() : null)).catch(() => null);
    const found = refundByReceipt(listed, intent.refund_id);
    if (found) { rz = found; outcome = 'created'; }
    else {
      // Nothing recorded as failed: the row stays 'initiated' and blocks a
      // second refund; a retry after a minute reuses its key (begin_refund).
      return json(502, { error: 'Razorpay did not answer clearly, so this refund is not marked failed. Check the payment in the Razorpay dashboard; pressing REFUND again in a minute retries the SAME refund and cannot pay twice.', unknown: true, refund_id: intent.refund_id });
    }
  }

  // 4. what happened, recorded
  if (outcome === 'refused') {
    const why = rz?.error?.description ?? 'Razorpay refused the refund.';
    await svc.rpc('record_refund', { p_refund: intent.refund_id, p_payment_rzp: intent.razorpay_payment_id, p_rzp_refund: null, p_status: 'failed', p_amount: intent.amount_paise, p_error: why, p_raw: rz });
    return json(502, { error: why });
  }
  const status = rz.status === 'processed' ? 'processed' : rz.status === 'failed' ? 'failed' : 'pending';
  const { error: recErr } = await svc.rpc('record_refund', {
    p_refund: intent.refund_id, p_payment_rzp: intent.razorpay_payment_id, p_rzp_refund: rz.id, p_status: status,
    p_amount: rz.amount ?? intent.amount_paise, p_error: status === 'failed' ? 'Razorpay marked the refund failed.' : null, p_raw: rz
  });
  if (recErr) console.error('[rzp-refund] record', recErr.message);   // the webhook will settle it
  const refunded = rz.amount ?? intent.amount_paise;
  return json(200, { ok: true, refund_id: rz.id, status, amount_paise: refunded, amount_minor: refunded,
    currency: intent.currency ?? rz.currency ?? 'INR', email: intent.email, plan_ended: status === 'processed' });
});
