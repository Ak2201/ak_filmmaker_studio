/* ============================================================
   rzp-order — the buyer picks a plan; this makes the Razorpay order
   ------------------------------------------------------------
   Runs as the service role (schema section 16.6 is written for it) and
   does three things, in an order that can fail safely at any point:

     1. who is asking — the caller's Supabase JWT, verified by asking
        Auth for the user; the body is trusted for nothing but the plan
        id, the period, a promo CODE (schema section 20) and
        (optionally) which organisation they own;
     2. create_pending_payment() — the PRICE COMES FROM THE DATABASE,
        never from the request: the code is re-quoted there, the
        discounted amount is what the row records and what Razorpay is
        asked for, and the row exists before Razorpay is called, so a
        crash between the two leaves a 'created' row and never a
        charge without a record;
     3. POST /v1/orders at Razorpay with the key secret, then
        attach_razorpay_order(). The browser gets back only what
        Checkout needs: order id, amount, currency, the PUBLIC key id.

   Secrets (set with `supabase secrets set`, never in the repo):
     RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the
   platform. docs/BILLING.md is the runbook.
   ============================================================ */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { basicAuth, PERIODS, receiptFor, normalisePromo } from '../_shared/razorpay.js';

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

  // 1. who
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'Sign in first.' });
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: auth } } });
  const { data: who, error: whoErr } = await asUser.auth.getUser();
  if (whoErr || !who?.user) return json(401, { error: 'Sign in first.' });
  const user = who.user;

  let body: { plan?: string; period?: string; account_id?: string; code?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const plan = String(body.plan ?? '');
  const period = String(body.period ?? 'lifetime');
  const code = normalisePromo(body.code) || null;
  if (!PERIODS.includes(period)) return json(400, { error: 'Plans are bought once, for good; there is no monthly or yearly period.' });

  // 2. the intent, priced by the database (the code re-quoted there; a
  //    refused code is a 22023 whose message is the sentence to show)
  const svc = createClient(url, serviceKey);
  const { data: pend, error: pendErr } = await svc.rpc('create_pending_payment', {
    p_user: user.id, p_plan: plan, p_period: period, p_account: body.account_id ?? null, p_code: code
  });
  if (pendErr) return json(pendErr.code === '42501' ? 403 : 400, { error: pendErr.message });
  const row = Array.isArray(pend) ? pend[0] : pend;
  if (!row?.payment_id) return json(500, { error: 'Could not record the payment.' });

  // 3. the order
  const r = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: basicAuth(keyId, keySecret), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: row.amount_paise, currency: row.currency, receipt: receiptFor(row.payment_id),
      notes: { payment_id: row.payment_id, user_id: user.id, plan, period, promo_code: row.promo_code ?? '' }
    })
  });
  const order = await r.json().catch(() => null);
  if (!r.ok || !order?.id) {
    await svc.rpc('mark_payment_failed', { p_order_id: null, p_raw: order });
    return json(502, { error: 'Razorpay did not create the order.', detail: order?.error?.description ?? null });
  }
  await svc.rpc('attach_razorpay_order', { p_payment: row.payment_id, p_order_id: order.id });

  return json(200, {
    order_id: order.id, amount: order.amount, currency: order.currency, key_id: keyId,
    plan, period, plan_name: row.plan_name, payment_id: row.payment_id,
    list_paise: row.list_paise ?? row.amount_paise, discount_paise: row.discount_paise ?? 0, promo_code: row.promo_code ?? null,
    prefill: { email: user.email ?? '', name: user.user_metadata?.full_name ?? '' }
  });
});
