/* ============================================================
   rzp-remind — the pre-charge reminder for auto-pay (schema §63)
   ------------------------------------------------------------
   POST, from a scheduler (pg_cron + pg_net, or the GitHub Actions
   workflow .github/workflows/renewal-reminders.yml), hourly. Deployed
   with --no-verify-jwt: a scheduler has no user session, so the guard is
   the shared secret in the `x-cron-secret` header, compared in constant
   time with the CRON_SECRET secret (checkCronSecret in _shared/mail.js).

     503  CRON_SECRET is not set (nothing can call it), or Resend is not
          configured — in which case NOTHING IS CLAIMED, so no cycle is
          marked reminded without a mail and the next run after Resend is
          set up sends them
     401  wrong or missing x-cron-secret
     405  anything but POST
     200  { sent, failed, skipped }

   1. claim_renewal_reminders (service role): every live, not-cancelling
      subscription whose next charge is within 48 hours and that has not
      been reminded for THAT charge, stamped as reminded in the same
      statement, so two runs at once never send one twice.
   2. one e-mail each (renewalReminderMail), Resend Idempotency-Key
      remind-<row>-<charge date> as a second guard.
   3. release_renewal_reminder for each send that failed, so the next run
      tries it again.

   Razorpay (and the bank) send their own pre-debit notice under the RBI
   e-mandate rules; this is an extra courtesy and is never in the payment
   path.
   ============================================================ */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { checkCronSecret, sendRenewalReminders, mailEnvFrom, mailConfigured } from '../_shared/mail.js';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const auth = await checkCronSecret(req.headers.get('x-cron-secret') ?? '', Deno.env.get('CRON_SECRET') ?? '');
  if (auth === 'unset') return json(503, { error: 'CRON_SECRET is not set on this project.' });
  if (auth !== 'ok') return json(401, { error: 'bad cron secret' });

  const env = mailEnvFrom((k) => Deno.env.get(k));
  if (!mailConfigured(env)) {
    return json(503, { error: 'Mail is not configured (MAIL_FROM and RESEND_API_KEY, or SMTP_USER and SMTP_PASSWORD); nothing was claimed.', sent: 0, failed: 0 });
  }

  const svc = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const out = await sendRenewalReminders(svc, env);
  if (out.reason === 'claim' || out.reason === 'error') {
    console.warn('[rzp-remind]', out.reason, out.detail ?? '');
    return json(500, { error: 'The reminders could not be claimed.', sent: out.sent, failed: out.failed });
  }
  if (out.failed) console.warn('[rzp-remind] sends failed and were released:', out.failed);
  return json(200, { sent: out.sent, failed: out.failed, skipped: out.skipped });
});
