/* ============================================================
   rzp-cancel — stop auto-pay (schema §62)
   ------------------------------------------------------------
   POST {}                       the caller's own live subscription
   POST { subscription_id }      the console: any row (our row id), for an
                                 owner or finance administrator

   1. the mark, AS THE CALLER, so the database decides who may:
      request_cancel_subscription() (own) or admin_cancel_subscription(id)
      (owner/finance, audited). It sets cancel_at_period_end and returns
      { subscription_row_id, rzp_subscription_id, current_end, already, … }.
   2. Razorpay: POST /v1/subscriptions/{id}/cancel, { cancel_at_cycle_end:
      1 } for a running subscription (nothing more is charged; the paid
      period runs out), 0 for one never authenticated. If Razorpay refuses
      or cannot be reached, the mark this request made is undone
      (undo_cancel_subscription) and this answers 502, so the page never
      says "auto-pay off" while Razorpay would still charge.
   3. the confirmation e-mail, for the request that made the mark.

   Access is never shortened: no cancel removes a paid day (§62).
   200 { ok: true, current_end, already }
   ============================================================ */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { basicAuth, cancelBody } from '../_shared/razorpay.js';
import { sendCancelMail } from '../_shared/mail.js';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
const background = (p: Promise<unknown>) => {
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p); else p.catch(() => {});
};
const mailEnv = () => ({ RESEND_API_KEY: Deno.env.get('RESEND_API_KEY') ?? '', MAIL_FROM: Deno.env.get('MAIL_FROM') ?? '' });

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
  const keyId = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
  const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
  if (!keyId || !keySecret) return json(503, { error: 'Payments are not configured on this studio yet.' });

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'Sign in first.' });
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: auth } } });
  const { data: who } = await asUser.auth.getUser();
  if (!who?.user) return json(401, { error: 'Sign in first.' });

  let body: { subscription_id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  // 1. the mark, as the caller
  const marked = body.subscription_id
    ? await asUser.rpc('admin_cancel_subscription', { p_id: body.subscription_id })
    : await asUser.rpc('request_cancel_subscription');
  if (marked.error) {
    return json(marked.error.code === '42501' ? 403 : 400, { error: marked.error.message, reason: marked.error.hint ?? null });
  }
  const c = (Array.isArray(marked.data) ? marked.data[0] : marked.data) || {};
  const svc = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  // 2. Razorpay
  if (c.rzp_subscription_id) {
    const r = await fetch(`https://api.razorpay.com/v1/subscriptions/${encodeURIComponent(c.rzp_subscription_id)}/cancel`, {
      method: 'POST',
      headers: { Authorization: basicAuth(keyId, keySecret), 'Content-Type': 'application/json' },
      body: JSON.stringify(cancelBody(c.status))
    }).catch(() => null);
    const out = r ? await r.json().catch(() => null) : null;
    // Razorpay answers 400 for a subscription it has already cancelled:
    // that is the state asked for, not a failure.
    const done = !!r?.ok || (r?.status === 400 && /cancel/i.test(String(out?.error?.description ?? '')));
    if (!done) {
      if (!c.already) {
        try { await svc.rpc('undo_cancel_subscription', { p_id: c.subscription_row_id }); } catch { /* the 502 matters more */ }
      }
      return json(502, { error: 'Razorpay did not confirm the cancellation, so auto-pay is still on. Try again in a minute.', detail: out?.error?.description ?? null });
    }
    if (out?.status) {
      try { await svc.rpc('mark_subscription_status', { p_rzp_subscription_id: c.rzp_subscription_id, p_status: out.status, p_payload: { source: 'cancel', subscription: out } }); } catch { /* the webhook says it too */ }
    }
  } else {
    // never reached Razorpay: there is nothing to stop there
    try { await svc.from('subscriptions').update({ status: 'cancelled' }).eq('id', c.subscription_row_id).eq('status', 'created'); } catch { /* best effort */ }
  }

  // 3. the confirmation, once
  if (!c.already && c.email) {
    const { data: pl } = await svc.from('subscriptions').select('days, plan_id, plans(name)').eq('id', c.subscription_row_id).maybeSingle();
    background(sendCancelMail({ ...c, days: pl?.days, plan_name: (pl as any)?.plans?.name ?? null }, mailEnv()).then((m) => {
      if (!m.ok && m.reason !== 'not-configured') console.warn('[rzp-cancel] mail', m.reason, m.detail ?? '');
    }));
  }
  return json(200, { ok: true, current_end: c.current_end ?? null, already: !!c.already });
});
