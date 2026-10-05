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
   ============================================================ */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { verifyPaymentSignature } from '../_shared/razorpay.js';

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
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
  if (!keySecret) return json(503, { error: 'Payments are not configured on this studio yet.' });

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'Sign in first.' });
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return json(401, { error: 'Sign in first.' });

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const ok = await verifyPaymentSignature(body, keySecret);
  if (!ok) return json(400, { error: 'The payment could not be verified. If money left your account, it will be matched within a few minutes or refunded by Razorpay.' });

  const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: pay } = await svc.from('payments').select('user_id').eq('razorpay_order_id', body.razorpay_order_id).maybeSingle();
  if (!pay) return json(404, { error: 'No such order.' });
  if (pay.user_id !== who.user.id) return json(403, { error: 'That order belongs to another account.' });

  const { data, error } = await svc.rpc('activate_payment', {
    p_order_id: body.razorpay_order_id, p_payment_id: body.razorpay_payment_id, p_raw: { source: 'verify', ...body }
  });
  if (error) return json(400, { error: error.message });
  const row = Array.isArray(data) ? data[0] : data;
  return json(200, { ok: true, plan: row?.plan_id, ends_at: row?.ends_at, account_id: row?.account_id, already: !!row?.already });
});
