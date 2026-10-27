/* ============================================================
   rzp-subscribe — auto-renew: the buyer signs up; this makes the
   Razorpay subscription (schema §62)
   ------------------------------------------------------------
   The twin of rzp-order for a product the console has set to auto-renew
   (billing_settings.pass_mode / plan_mode = 'renew'). In the same order,
   for the same reasons — each step can fail without leaving money behind:

     1. who is asking — the caller's Supabase JWT; the body is trusted for
        the PRODUCT ('pass' or a plan id), the organisation (optional) and
        the currency only, never an amount;
     2. create_pending_subscription() — the database prices it (the full
        price; a subscription carries no credit and no code), locks the
        amount, the days and the plan, and refuses (400 {error, reason}):
        renew_off, subscribed, disabled, closed, inr_only, used, has_plan,
        currency, currency_closed, same_plan, downgrade, upgrade;
     3. the Razorpay plan for that exact price: rzp_plan_for(), else
        POST /v1/plans and remember_rzp_plan() (a race keeps the first);
     4. POST /v1/subscriptions, then set_subscription_rzp_ids(). Only once
        the row knows the subscription is its id handed to Checkout; if
        that write fails the Razorpay subscription is cancelled (it was
        never authenticated, so nothing is charged) and this answers 502.

   200 { subscription_id, key, amount, currency, description, period, days,
         subscription_row_id, product, plan_name, prefill }
   Checkout opens with { key, subscription_id, recurring: true }; its
   success handler posts the three fields to rzp-verify.

   Secrets: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (docs/BILLING.md §26).
   ============================================================ */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { basicAuth, orderCurrency, planBody, subscriptionBody, subscriptionDescription } from '../_shared/razorpay.js';

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

  let body: { product?: string; account_id?: string; currency?: string } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const product = String(body.product ?? '').trim().toLowerCase();
  if (!product) return json(400, { error: 'Choose the pass or a plan.', reason: 'product' });
  const currency = orderCurrency(body.currency);
  if (!currency) return json(400, { error: 'Orders are in rupees (INR) or US dollars (USD).', reason: 'currency' });

  // 2. the pending row, priced and locked by the database
  const svc = createClient(url, serviceKey);
  const { data: pend, error: pendErr } = await svc.rpc('create_pending_subscription', {
    p_user: user.id, p_product: product, p_account: body.account_id ?? null, p_currency: currency
  });
  if (pendErr) return json(pendErr.code === '42501' ? 403 : 400, { error: pendErr.message, reason: pendErr.hint ?? null });
  const row = Array.isArray(pend) ? pend[0] : pend;
  if (!row?.subscription_row_id) return json(500, { error: 'Could not record the subscription.' });
  const giveUp = async (raw: unknown) => {
    // the row never reaches Checkout; it stops counting as live at once
    try { await svc.from('subscriptions').update({ status: 'expired', raw }).eq('id', row.subscription_row_id).eq('status', 'created'); } catch { /* the 502 matters more */ }
  };
  const rzpAuth = basicAuth(keyId, keySecret);
  const rzp = async (path: string, payload: unknown) => {
    const r = await fetch(`https://api.razorpay.com/v1/${path}`, {
      method: 'POST', headers: { Authorization: rzpAuth, 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    return { ok: !!r?.ok, body: j };
  };

  // 3. the Razorpay plan for this exact price (the lock)
  const key = { p_product: row.product, p_period: row.period, p_days: row.days, p_amount: row.amount_minor, p_currency: row.currency };
  let planId: string | null = null;
  const cached = await svc.rpc('rzp_plan_for', key);
  if (!cached.error && cached.data) planId = String(cached.data);
  if (!planId) {
    const pb = planBody({ product: row.product, period: row.period, days: row.days, amountMinor: row.amount_minor, currency: row.currency, planName: row.plan_name });
    if (!pb) { await giveUp({ plan_body: 'refused' }); return json(500, { error: 'This price cannot be set up for auto-pay.' }); }
    const made = await rzp('plans', pb);
    if (!made.ok || !made.body?.id) {
      await giveUp({ plan_failed: made.body?.error ?? null });
      return json(502, { error: 'Razorpay did not create the plan. Nothing was charged; try again.', detail: made.body?.error?.description ?? null });
    }
    const kept = await svc.rpc('remember_rzp_plan', { ...key, p_rzp_plan_id: made.body.id });
    planId = !kept.error && kept.data ? String(kept.data) : made.body.id;
  }

  // 4. the subscription, then its id on the row before Checkout sees it
  const sb = subscriptionBody({ planId, period: row.period, days: row.days, rowId: row.subscription_row_id, userId: user.id, product: row.product });
  const sub = sb ? await rzp('subscriptions', sb) : { ok: false, body: null };
  if (!sub.ok || !sub.body?.id) {
    await giveUp({ subscription_failed: sub.body?.error ?? null });
    return json(502, { error: 'Razorpay did not create the subscription. Nothing was charged; try again.', detail: sub.body?.error?.description ?? null });
  }
  const att = await svc.rpc('set_subscription_rzp_ids', { p_row: row.subscription_row_id, p_rzp_subscription_id: sub.body.id, p_rzp_plan_id: planId });
  if (att.error) {
    // never authenticated, so cancelling it now charges nobody
    await rzp(`subscriptions/${encodeURIComponent(sub.body.id)}/cancel`, { cancel_at_cycle_end: 0 });
    await giveUp({ attach_failed: sub.body.id });
    return json(502, { error: 'Could not record the subscription. Nothing was charged; try again.' });
  }

  return json(200, {
    subscription_id: sub.body.id, key: keyId,
    amount: row.amount_minor, currency: row.currency,
    description: subscriptionDescription({ planName: row.plan_name, period: row.period, days: row.days, amountMinor: row.amount_minor, currency: row.currency }),
    period: row.period, days: row.days,
    subscription_row_id: row.subscription_row_id, product: row.product, plan_name: row.plan_name,
    prefill: { email: user.email ?? '', name: user.user_metadata?.full_name ?? '' }
  });
});
