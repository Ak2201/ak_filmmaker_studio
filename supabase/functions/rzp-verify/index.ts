/* ============================================================
   rzp-verify — Checkout succeeded in the browser; prove it, activate
   ------------------------------------------------------------
   Checkout's success handler hands the page three strings. The page
   cannot verify them (that needs the key secret) and must not be
   believed (anyone can POST three strings), so they come here:

     HMAC-SHA256(order_id|payment_id, KEY_SECRET) == signature

   and only then activate_payment(), which is idempotent and shared
   with the webhook — whichever of the two arrives first does the work,
   the other finds it done.

   The caller must be signed in AND be the buyer on the order: a
   signature is proof the payment happened, not proof of who is asking,
   and the response names the plan and expiry.

   THE RECEIPT (schema §35). After activation the receipt e-mail is
   claimed and sent (_shared/mail.js); whichever of this function and
   the webhook claims first sends, the other finds nothing to claim.
   It runs in the background (EdgeRuntime.waitUntil) so the buyer's
   page never waits on Resend, and a mail that fails never fails this.

   The console's RESEND RECEIPT posts { resend_invoice } instead:
   admin_resend_receipt() is called AS THE CALLER, so only an
   administrator gets past it, and then the same claim-and-send runs.

   CURRENCY (schema §56). An order is in INR or USD and its amounts are
   minor units of that currency. The capture names the ROW's currency,
   settleAuthorized() refuses an authorisation in any other one, and
   activate_payment() checks the entity's currency again and records
   whether the card was issued abroad (`international`, `card.country`).

   Secrets: RESEND_API_KEY and MAIL_FROM (docs/BILLING.md §14). Without
   them nothing is claimed and nothing is sent.
   ============================================================ */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyPaymentSignature, verifySubscriptionSignature, basicAuth, settleAuthorized, isoFromUnix } from '../_shared/razorpay.js';
import { sendReceiptOnce, sendChargeReceiptOnce, mailEnvFrom } from '../_shared/mail.js';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const mailEnv = () => mailEnvFrom((k) => Deno.env.get(k));
const background = (p: Promise<unknown>) => {
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p); else p.catch(() => {});
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const PENDING = 'Your payment is still being confirmed by Razorpay. Your plan will appear as soon as the money arrives — usually within a few minutes. You do not need to pay again.';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const keyId = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
  if (!keySecret || !keyId) return json(503, { error: 'Payments are not configured on this studio yet.' });

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'Sign in first.' });
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return json(401, { error: 'Sign in first.' });

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (body.resend_invoice) {
    const { data: orderId, error: rerr } = await asUser.rpc('admin_resend_receipt', { p_invoice: body.resend_invoice });
    if (rerr) return json(rerr.code === '42501' ? 403 : 400, { error: rerr.message });
    const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const out = await sendReceiptOnce(svc, String(orderId), mailEnv());
    if (!out.ok) return json(502, { error: out.reason === 'not-configured' ? 'E-mail is not set up on this studio yet (MAIL_FROM and RESEND_API_KEY, or SMTP_USER and SMTP_PASSWORD).' : `The receipt could not be sent (${out.reason}).` });
    return json(200, { ok: true, sent: !out.skipped });
  }
  /* AUTO-RENEW (schema §62). A subscription's Checkout hands back
     { razorpay_payment_id, razorpay_subscription_id, razorpay_signature },
     signed HMAC(payment_id|subscription_id). Razorpay captures a
     subscription charge itself, so nothing is captured here: the webhook
     (subscription.charged) applies it. If the payment is already captured
     at the locked amount it is applied now — apply_subscription_charge is
     idempotent on the payment id, so the webhook then finds it done. */
  if (body.razorpay_subscription_id) {
    if (!(await verifySubscriptionSignature(body, keySecret))) {
      return json(400, { error: 'The payment could not be verified. If money left your account, it will be matched within a few minutes or refunded by Razorpay.' });
    }
    const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: sub } = await svc.from('subscriptions').select('id, user_id, amount_minor, currency')
      .eq('rzp_subscription_id', body.razorpay_subscription_id).maybeSingle();
    if (!sub) return json(404, { error: 'No such subscription.' });
    if (sub.user_id !== who.user.id) return json(403, { error: 'That subscription belongs to another account.' });
    const pid = encodeURIComponent(body.razorpay_payment_id);
    const got = await fetch(`https://api.razorpay.com/v1/payments/${pid}`, { headers: { Authorization: basicAuth(keyId, keySecret) } }).catch(() => null);
    const entity = got && got.ok ? await got.json().catch(() => null) : null;
    if (entity && entity.status === 'captured' && Number(entity.amount) === Number(sub.amount_minor)
        && String(entity.currency || '').toUpperCase() === String(sub.currency).toUpperCase()) {
      const { data: applied, error: aerr } = await svc.rpc('apply_subscription_charge', {
        p_rzp_subscription_id: body.razorpay_subscription_id, p_rzp_payment_id: body.razorpay_payment_id,
        p_amount_minor: Number(entity.amount), p_currency: entity.currency,
        p_paid_at: isoFromUnix(entity.created_at), p_event: { source: 'verify', payment: entity }
      });
      if (!aerr && applied) {
        background(sendChargeReceiptOnce(svc, body.razorpay_payment_id, mailEnv()).then((m) => {
          if (!m.ok && m.reason !== 'not-configured') console.warn('[rzp-verify] charge receipt', m.reason, m.detail ?? '');
        }));
        if (applied.applied) return json(200, { ok: true, pending: false, plan: applied.plan_id, ends_at: applied.ends_at, account_id: applied.account_id, already: !!applied.already });
      }
      if (aerr) console.warn('[rzp-verify] apply_subscription_charge', aerr.message);
    }
    return json(200, { ok: true, pending: true });
  }

  const ok = await verifyPaymentSignature(body, keySecret);
  if (!ok) return json(400, { error: 'The payment could not be verified. If money left your account, it will be matched within a few minutes or refunded by Razorpay.' });

  const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: pay } = await svc.from('payments').select('user_id, amount_paise, currency, status').eq('razorpay_order_id', body.razorpay_order_id).maybeSingle();
  if (!pay) return json(404, { error: 'No such order.' });
  if (pay.user_id !== who.user.id) return json(403, { error: 'That order belongs to another account.' });

  /* CAPTURED, NOT MERELY AUTHORIZED (security follow-up, §51). Checkout
     signs order_id|payment_id when the payment is AUTHORIZED; whether the
     money is ever collected depends on the account's Payment Capture
     setting, which lives in the Razorpay dashboard. So the payment itself
     is read back: captured -> activate (with the entity, so
     activate_payment's amount check runs); authorized -> capture it for
     exactly the recorded amount, then activate; anything else -> no plan
     here, and the webhook's payment.captured activates it later if the
     money does arrive. A plan is never granted on a signature alone.

     ASK BEFORE CAPTURING (§53, audit bug 8). activate_payment can refuse
     an order whose promo code was used up, or whose upgrade credit has
     gone, since it was priced. It used to be asked only AFTER the money
     was collected, and the buyer was left charged with no plan.
     settleAuthorized() asks payment_can_activate() first and does not
     capture a refused order, so Razorpay releases the hold. One captured
     anyway (auto-capture, or a race in between) is recorded by
     activate_payment as paid with no plan and unapplied_reason set, and
     the buyer can be refunded from Settings or the console. */
  let entity: any = null;
  if (pay.status !== 'paid') {
    const rzpAuth = basicAuth(keyId, keySecret);
    const pid = encodeURIComponent(body.razorpay_payment_id);
    const got = await fetch(`https://api.razorpay.com/v1/payments/${pid}`, { headers: { Authorization: rzpAuth } }).catch(() => null);
    entity = got && got.ok ? await got.json().catch(() => null) : null;
    if (!entity || entity.order_id !== body.razorpay_order_id) {
      return json(202, { ok: false, pending: true, error: PENDING });
    }
    if (entity.status === 'authorized') {
      const settled = await settleAuthorized({
        entity, amountPaise: pay.amount_paise, currency: pay.currency || 'INR',
        canActivate: async () => {
          const { data: verdict, error: verr } = await svc.rpc('payment_can_activate', { p_order_id: body.razorpay_order_id });
          if (verr) throw new Error(verr.message);
          return verdict;
        },
        capture: async () => {
          const cap = await fetch(`https://api.razorpay.com/v1/payments/${pid}/capture`, {
            method: 'POST',
            headers: { Authorization: rzpAuth, 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: Number(pay.amount_paise), currency: pay.currency || 'INR' })
          });
          return cap.ok ? await cap.json().catch(() => null) : null;
        }
      });
      if (settled.kind === 'mismatch') return json(400, { error: 'The payment amount or currency does not match the order. Nothing was collected; Razorpay releases the hold.' });
      if (settled.kind === 'refused') {
        return json(409, { ok: false, refused: settled.reason, error: `${settled.sentence || 'This order can no longer be applied.'} Nothing was collected; Razorpay releases the hold on your money within a few days.` });
      }
      if (settled.kind === 'captured') entity = settled.entity;
    }
    if (entity.status !== 'captured') return json(202, { ok: false, pending: true, error: PENDING });
  }

  const { data, error } = await svc.rpc('activate_payment', {
    p_order_id: body.razorpay_order_id, p_payment_id: body.razorpay_payment_id,
    p_raw: { source: 'verify', ...body, ...(entity ? { payment: entity } : {}) }
  });
  if (error) return json(400, { error: error.message });
  // the money moved either way, so the receipt goes either way
  background(sendReceiptOnce(svc, body.razorpay_order_id, mailEnv()).then((m) => {
    if (!m.ok && m.reason !== 'not-configured') console.warn('[rzp-verify] receipt', m.reason, m.detail ?? '');
  }));
  // §53: captured, recorded, and no plan applied — say so, never "ok"
  const { data: rec } = await svc.from('payments').select('unapplied_reason, promo_code').eq('razorpay_order_id', body.razorpay_order_id).maybeSingle();
  if (rec?.unapplied_reason) {
    const { data: sentence } = await svc.rpc('unapplied_sentence', { p_reason: rec.unapplied_reason, p_code: rec.promo_code ?? null });
    return json(409, { ok: false, refused: rec.unapplied_reason, refundable: true,
      error: `${sentence || 'The plan was not applied.'} Your payment is recorded; ask for a refund from Settings, or write to us.` });
  }
  const row = Array.isArray(data) ? data[0] : data;
  return json(200, { ok: true, plan: row?.plan_id, ends_at: row?.ends_at, account_id: row?.account_id, already: !!row?.already });
});
