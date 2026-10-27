/* ============================================================
   rzp-webhook — Razorpay tells us what happened, whether or not the
   buyer's tab survived
   ------------------------------------------------------------
   Configured in the Razorpay dashboard with this function's URL and a
   WEBHOOK secret (a different secret from the key secret — the two are
   not interchangeable, and scripts/test-billing.mjs asserts as much).
   Deploy with --no-verify-jwt: Razorpay does not carry a Supabase JWT,
   the signature over the raw body is the credential.

     payment.captured  -> activate_payment()   (idempotent)
     payment.failed    -> mark_payment_failed()
     refund.processed  -> record_refund() + mark_payment_refunded()  (ends the plan today)
     refund.failed     -> record_refund()   (schema section 27; rzp-refund starts refunds)

   The payment entity is passed whole as p_raw.payment, and since
   schema section 20 activate_payment() compares its `amount` with the
   row's — which, with a promo code, is the DISCOUNTED amount. A
   mismatch is refused (22023) and logged; the row stays 'created'.
   Since schema §56 the same goes for the entity's `currency` against
   the order's (INR or USD), and activate_payment() records the card's
   `international` flag and `card.country` from this entity — a later
   delivery fills them in if rzp-verify got there first without them.
   Recorded, never blocked: an international card on a rupee order pays.

   AUTO-RENEW (schema §62), register these events too:
     subscription.charged   -> apply_subscription_charge() (idempotent on the
                               payment id; price-locked) + the charge receipt
     payment.captured with a subscription_id -> the same
     subscription.authenticated / activated / pending / halted / cancelled /
     completed (and paused, resumed, expired) -> mark_subscription_status(),
                               which never takes a paid day away
   The x-razorpay-event-id header is logged for every subscription event.

   Anything else is acknowledged and ignored. The body is read as TEXT
   first and verified as those exact bytes; parsing before verifying
   would change nothing here, but re-serialising would, and the order
   of operations is the whole safety argument.

   E-MAIL (schema §35, _shared/mail.js): after payment.captured the
   receipt, after refund.processed / refund.failed the refund update.
   Each is claimed before it is sent, so a redelivery or rzp-verify
   racing this function sends nothing twice. It is awaited (the
   function's answer can wait; Razorpay allows seconds), and a mail
   that fails is logged, released for a retry, and never turns the
   delivery into a 5xx.
   ============================================================ */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyWebhookSignature, statusForEvent, subscriptionOfPayment, isoFromUnix } from '../_shared/razorpay.js';
import { sendReceiptOnce, sendRefundOnce, sendChargeReceiptOnce } from '../_shared/mail.js';

const mailEnv = () => ({ RESEND_API_KEY: Deno.env.get('RESEND_API_KEY') ?? '', MAIL_FROM: Deno.env.get('MAIL_FROM') ?? '' });
const logMail = (what: string) => (m: { ok: boolean; reason?: string; detail?: string }) => {
  if (!m.ok && m.reason !== 'not-configured') console.warn('[rzp-webhook] ' + what, m.reason, m.detail ?? '');
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST only', { status: 405 });
  const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? '';
  if (!secret) return new Response('webhook secret not configured', { status: 503 });

  const raw = await req.text();
  const sig = req.headers.get('x-razorpay-signature') ?? '';
  if (!(await verifyWebhookSignature(raw, sig, secret))) return new Response('bad signature', { status: 401 });

  let evt: any = null;
  try { evt = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  const payment = evt?.payload?.payment?.entity;
  const refund = evt?.payload?.refund?.entity;
  const subscription = evt?.payload?.subscription?.entity;
  const eventId = req.headers.get('x-razorpay-event-id') ?? '';
  /* §62: one subscription charge, from subscription.charged or a
     payment.captured that names its subscription. Idempotent on the
     payment id, so the two events (and rzp-verify) apply it once. A 22023
     (an unknown subscription, a charge for another amount) cannot be
     changed by a retry: logged, answered 200. Anything else is a 5xx. */
  const charge = async (subId: string, pay: any) => {
    const { data, error } = await svc.rpc('apply_subscription_charge', {
      p_rzp_subscription_id: subId, p_rzp_payment_id: pay.id, p_amount_minor: Number(pay.amount), p_currency: pay.currency,
      p_paid_at: isoFromUnix(pay.created_at), p_event: { source: 'webhook', event: evt.event, event_id: eventId, payment: pay, subscription: subscription ?? null }
    });
    if (error && error.code !== '22023') throw new Error('apply_subscription_charge: ' + error.message);
    if (error) { console.warn('[rzp-webhook] charge', eventId, error.message, error.hint ?? ''); return; }
    if (data && !data.applied) console.warn('[rzp-webhook] charge recorded, not applied', eventId, data.unapplied_reason);
    logMail('charge receipt')(await sendChargeReceiptOnce(svc, pay.id, mailEnv()));
  };
  try {
    if (String(evt?.event || '').startsWith('subscription.')) {
      if (eventId) console.log('[rzp-webhook] event', eventId, evt.event, subscription?.id ?? '');
      if (!subscription?.id) return new Response('ok', { status: 200 });
      if (evt.event === 'subscription.charged' && payment?.id) await charge(subscription.id, payment);
      const status = statusForEvent(evt.event, subscription);
      if (status) {
        const { error } = await svc.rpc('mark_subscription_status', { p_rzp_subscription_id: subscription.id, p_status: status, p_payload: { event: evt.event, event_id: eventId, subscription } });
        if (error && error.code !== '22023') throw new Error('mark_subscription_status: ' + error.message);
        if (error) console.warn('[rzp-webhook] status', eventId, error.message);
      }
      return new Response('ok', { status: 200 });
    }
    switch (evt?.event) {
      case 'payment.captured': {
        // §62: a subscription's charge has no order of ours
        const subId = subscriptionOfPayment(payment);
        if (subId && payment?.id) { if (eventId) console.log('[rzp-webhook] event', eventId, evt.event, subId); await charge(subId, payment); break; }
        if (!payment?.order_id || !payment?.id) break;
        const { error } = await svc.rpc('activate_payment', { p_order_id: payment.order_id, p_payment_id: payment.id, p_raw: { source: 'webhook', event: evt.event, payment } });
        // 'No payment with that order id' means an order this studio did
        // not create (another product on the same Razorpay account); say
        // 200 so Razorpay stops retrying, and log it. That and the other
        // refusals (amount mismatch, a payment already refunded) are 22023,
        // and a retry cannot change them. Anything else — a timeout, a
        // dropped connection — must reach the 5xx below: rpc() RETURNS its
        // error rather than throwing it, so without this a transient
        // failure answered 200 and the captured payment never activated.
        if (error && error.code !== '22023') throw new Error('activate: ' + error.message);
        if (error) console.warn('[rzp-webhook] activate', error.message);
        else logMail('receipt')(await sendReceiptOnce(svc, payment.order_id, mailEnv()));
        break;
      }
      case 'payment.failed': {
        if (payment?.order_id) await svc.rpc('mark_payment_failed', { p_order_id: payment.order_id, p_raw: { event: evt.event, payment } });
        break;
      }
      case 'refund.processed': {
        if (refund?.payment_id) {
          // Section 27: settle the refunds row (also records a refund made in the
          // Razorpay dashboard), then end the plan. mark_payment_refunded is a
          // no-op for a payment already 'refunded', so rzp-refund's own call and
          // this one never process anything twice. record_refund is tried
          // first and its absence (section 27 not run) must not lose the refund.
          const raw = { event: evt.event, refund };
          const rec = await svc.rpc('record_refund', { p_refund: null, p_payment_rzp: refund.payment_id, p_rzp_refund: refund.id ?? null, p_status: 'processed', p_amount: refund.amount ?? null, p_error: null, p_raw: raw });
          if (rec.error) console.warn('[rzp-webhook] record_refund', rec.error.message);
          // It refuses nothing (a no-op when already refunded), so ANY error is
          // a failure to end the plan, and Razorpay must deliver it again.
          const mark = await svc.rpc('mark_payment_refunded', { p_payment_id: refund.payment_id, p_raw: raw });
          if (mark.error) throw new Error('mark_payment_refunded: ' + mark.error.message);
          if (refund.id) logMail('refund')(await sendRefundOnce(svc, refund.id, 'processed', mailEnv()));
        }
        break;
      }
      case 'refund.failed': {
        if (refund?.payment_id) {
          const rec = await svc.rpc('record_refund', { p_refund: null, p_payment_rzp: refund.payment_id, p_rzp_refund: refund.id ?? null, p_status: 'failed', p_amount: refund.amount ?? null, p_error: 'Razorpay marked the refund failed.', p_raw: { event: evt.event, refund } });
          if (rec.error) console.warn('[rzp-webhook] record_refund', rec.error.message);
          if (refund.id) logMail('refund')(await sendRefundOnce(svc, refund.id, 'failed', mailEnv()));
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error('[rzp-webhook]', e);
    return new Response('error', { status: 500 });   // Razorpay retries on 5xx
  }
  return new Response('ok', { status: 200 });
});
