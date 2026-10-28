/* ============================================================
   SMTP — the Deno-only half of sending a message through a mailbox
   (Hostinger's, normally), for when RESEND_API_KEY is not set.
   ------------------------------------------------------------
   mail.js imports this ONLY on the SMTP path, with a dynamic import(),
   so Node (scripts/test-billing.mjs) never loads it: the tests hand
   sendMail their own `smtpSend` instead.

   PORT 465, implicit TLS. Supabase edge functions refuse outbound ports
   25 and 587, so the usual STARTTLS submission port does not work from
   here; smtp.hostinger.com answers on 465.

   One connection per message, closed in a finally: a receipt is rare
   and a held-open socket in a function that is about to be torn down is
   how a send hangs. Never throws past the caller; mail.js catches.
   ============================================================ */
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

export async function smtpSend({ host, port, user, pass }, { from, to, replyTo, subject, html, text }) {
  const client = new SMTPClient({
    connection: { hostname: host, port, tls: true, auth: { username: user, password: pass } }
  });
  try {
    await client.send({ from, to, replyTo, subject, content: text, html });
  } finally {
    try { await client.close(); } catch { /* already closed */ }
  }
}
