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
     refund.processed  -> mark_payment_refunded()  (ends the plan today)

   Anything else is acknowledged and ignored. The body is read as TEXT
   first and verified as those exact bytes; parsing before verifying
   would change nothing here, but re-serialising would, and the order
   of operations is the whole safety argument.
   ============================================================ */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyWebhookSignature } from '../_shared/razorpay.js';

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
  try {
    switch (evt?.event) {
      case 'payment.captured': {
        if (!payment?.order_id || !payment?.id) break;
        const { error } = await svc.rpc('activate_payment', { p_order_id: payment.order_id, p_payment_id: payment.id, p_raw: { source: 'webhook', event: evt.event, payment } });
        // 'No payment with that order id' means an order this studio did
        // not create (another product on the same Razorpay account); say
        // 200 so Razorpay stops retrying, and log it.
        if (error) console.warn('[rzp-webhook] activate', error.message);
        break;
      }
      case 'payment.failed': {
        if (payment?.order_id) await svc.rpc('mark_payment_failed', { p_order_id: payment.order_id, p_raw: { event: evt.event, payment } });
        break;
      }
      case 'refund.processed': {
        if (refund?.payment_id) await svc.rpc('mark_payment_refunded', { p_payment_id: refund.payment_id, p_raw: { event: evt.event, refund } });
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
