/* ============================================================
   rzp-order — the buyer picks a plan; this makes the Razorpay order
   ------------------------------------------------------------
   Runs as the service role (schema section 16.6 is written for it) and
   does three things, in an order that can fail safely at any point:

     1. who is asking — the caller's Supabase JWT, verified by asking
        Auth for the user; the body is trusted for nothing but the plan
        id, the period, a promo CODE (schema section 20), the CURRENCY
        ('INR' or 'USD', schema §56 — never an amount) and (optionally)
        which organisation they own;
     2. create_pending_payment() — the PRICE COMES FROM THE DATABASE,
        never from the request: an upgrade is priced as the difference
        from what this buyer already paid (section 21), the code is
        re-quoted there, the
        discounted amount is what the row records and what Razorpay is
        asked for, and the row exists before Razorpay is called, so a
        crash between the two leaves a 'created' row and never a
        charge without a record;
     3. POST /v1/orders at Razorpay with the key secret, then
        attach_razorpay_order(). The browser gets back only what
        Checkout needs: order id, amount, currency, the PUBLIC key id.

   CURRENCY (schema §56). The browser may ask for 'USD'; the database
   prices it from the owner's dollar figures and refuses it (400) while
   billing_settings.usd_checkout is off. The Razorpay order is created in
   the row's currency, and the amount is minor units of it. A rupee order
   is sent WITHOUT p_currency, so this function also works against a
   database where §56 has not run yet (the five-argument form).

   THE LAUNCH PASS (schema §61). period 'pass' is accepted; the plan id in
   the body is ignored for it (the pass is billing_settings.pass_plan), the
   amount and the days are the database's, and every refusal — switched
   off, closed, not rupees, already used, already on a plan, a promo code —
   comes back as 400 { error: <sentence>, reason: <the SQL hint> }.

   Secrets (set with `supabase secrets set`, never in the repo):
     RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the
   platform. docs/BILLING.md is the runbook.
   ============================================================ */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { basicAuth, PERIODS, receiptFor, normalisePromo, orderCurrency, attachOrder, failPending } from '../_shared/razorpay.js';

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

  let body: { plan?: string; period?: string; account_id?: string; code?: string; currency?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const plan = String(body.plan ?? '');
  /* 'lifetime' is what a page cached from before §52 still sends; it is a
     year now, so the purchase goes through rather than failing. */
  const asked = String(body.period ?? 'year');
  const period = asked === 'lifetime' ? 'year' : asked;
  const code = normalisePromo(body.code) || null;
  if (!PERIODS.includes(period)) return json(400, { error: 'Plans are bought a year at a time, or as the launch pass; there is no monthly period.', reason: 'period' });
  const currency = orderCurrency(body.currency);
  if (!currency) return json(400, { error: 'Orders are in rupees (INR) or US dollars (USD).' });

  // 2. the intent, priced by the database (the code re-quoted there; a
  //    refused code is a 22023 whose message is the sentence to show)
  const svc = createClient(url, serviceKey);
  const { data: pend, error: pendErr } = await svc.rpc('create_pending_payment', {
    p_user: user.id, p_plan: plan, p_period: period, p_account: body.account_id ?? null, p_code: code,
    ...(currency === 'INR' ? {} : { p_currency: currency })
  });
  /* `reason` is the refusal's HINT (schema §56 and §61): for a pass
     'disabled' | 'closed' | 'inr_only' | 'used' | 'has_plan' | 'code', for a
     year 'currency' | 'currency_closed' | 'same_plan' | 'downgrade' or a
     promo reason. The page branches on it; `error` is the sentence to show. */
  if (pendErr) return json(pendErr.code === '42501' ? 403 : 400, { error: pendErr.message, reason: pendErr.hint ?? null });
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
    // By the row's own id: there is no order id to find it by (failPending).
    await failPending(svc, row.payment_id, order);
    return json(502, { error: 'Razorpay did not create the order.', detail: order?.error?.description ?? null });
  }
  // The row must know the order before Checkout sees it (attachOrder).
  const att = await attachOrder({
    attach: () => svc.rpc('attach_razorpay_order', { p_payment: row.payment_id, p_order_id: order.id }),
    abandon: () => failPending(svc, row.payment_id, { attach_failed: order.id })
  });
  if (!att.ok) return json(502, { error: 'Could not record the order. Nothing was charged; try again.' });

  const list = row.list_paise ?? row.amount_paise, discount = row.discount_paise ?? 0, credit = row.credit_paise ?? 0;
  return json(200, {
    order_id: order.id, amount: order.amount, currency: order.currency, key_id: keyId,
    plan, period, plan_name: row.plan_name, payment_id: row.payment_id,
    // minor units of `currency` (paise or cents); the _paise names are kept for older pages
    list_paise: list, discount_paise: discount, promo_code: row.promo_code ?? null,
    credit_paise: credit,   // section 21: what an upgrade took off for plans already paid for
    amount_minor: row.amount_paise, list_minor: list, discount_minor: discount, credit_minor: credit,
    prefill: { email: user.email ?? '', name: user.user_metadata?.full_name ?? '' }
  });
});
