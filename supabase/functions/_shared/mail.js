/* ============================================================
   MAIL — the receipt and refund e-mails, sent through Resend
   ------------------------------------------------------------
   Plain JavaScript for the same reason as razorpay.js: Deno imports it
   as-is and Node tests it (scripts/test-billing.mjs). Nothing here
   reads Deno.env; each function passes its env in, so a test can pass
   a fake one and a fake fetch.

   SENT EXACTLY ONCE. rzp-verify and rzp-webhook both see a capture, and
   whichever arrives first activates it. Mailing follows the same rule
   one step later: schema §35's claim_receipt_email() stamps
   invoices.emailed_at with `where emailed_at is null`, so only one
   caller gets the row back and only that caller sends. A failed send
   releases the claim, so Razorpay's retry or the console's RESEND can
   try again. Resend's Idempotency-Key is a second guard on the same
   invoice, not the first one.

   NEVER IN THE PAYMENT PATH. Every function here catches everything
   it can and answers { ok:false, reason }; a mail that could not go
   must not turn a captured payment into a 500, which Razorpay would
   retry for a day.

   The From address is the MAIL_FROM secret, normally
   "<brand> <support@<host>>". The domain must be verified in Resend
   (docs/BILLING.md §14) or Resend refuses with 403.

   Brand values come from ./brand.js, which test:billing holds equal to
   src/data/brand.json.

   AMOUNTS ARE PRINTED IN THEIR OWN CURRENCY (schema §56): an invoice row
   and a claim_refund_email() row both carry `currency`, and the amount is
   minor units of it — cents for a dollar sale, paise for a rupee one. A
   row from before §56 has no currency on the refund claim and is INR.
   ============================================================ */
import { BRAND } from './brand.js';
import { fmtMinor } from './razorpay.js';
import { REFUND_TERMS } from './terms.js';

export { REFUND_TERMS };

export const RESEND_URL = 'https://api.resend.com/emails';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const site = (p = '') => `https://${BRAND.host}/${p}`;
const dateIST = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
};

/** One message as Resend wants it, or null when there is no recipient. */
function message(to, subject, rows, paras) {
  if (!to || !/@/.test(String(to))) return null;
  const table = rows.filter(([, v]) => v).map(([k, v]) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#555">${esc(k)}</td><td style="padding:4px 0"><strong>${esc(v)}</strong></td></tr>`).join('');
  const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;max-width:560px">`
    + `<p style="font-size:18px;margin:0 0 16px"><strong>${esc(BRAND.name)}</strong></p>`
    + paras.map((p) => `<p>${p.html ?? esc(p)}</p>`).join('')
    + (table ? `<table style="border-collapse:collapse;margin:16px 0">${table}</table>` : '')
    + `<p style="color:#555;font-size:13px">${esc(REFUND_TERMS)} Full policy: <a href="${site('refund')}">${site('refund')}</a></p>`
    + `<p style="color:#555;font-size:13px">Questions? Reply to this e-mail or write to ${esc(BRAND.supportEmail)}.</p>`
    + `</body></html>`;
  const text = [BRAND.name, '', ...paras.map((p) => p.text ?? p), '',
    ...rows.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`), '',
    `${REFUND_TERMS} Full policy: ${site('refund')}`, '',
    `Questions? Reply to this e-mail or write to ${BRAND.supportEmail}.`].join('\n');
  return { to: String(to).trim(), subject, html, text };
}

/** The receipt, from a claim_receipt_email() row (an invoices row). */
export function receiptMail(inv) {
  if (!inv) return null;
  const link = site('purchase');
  return message(inv.buyer_email, `Payment received: ${inv.plan_name} plan (${inv.number})`, [
    ['Invoice', inv.number],
    ['Plan', `${inv.plan_name}, 1 year${inv.ends_at ? ' (valid until ' + dateIST(inv.ends_at) + ')' : ''}. Nothing renews automatically.`],
    ['Amount paid', fmtMinor(inv.amount_paise, inv.currency || 'INR')],
    ['Date', dateIST(inv.paid_at || inv.issued_at)],
    ['Razorpay payment ID', inv.razorpay_payment_id]
  ], [
    `Hi ${inv.buyer_name || 'there'},`,
    `Thank you for your purchase. Your ${inv.plan_name} plan is active on your account now, for a year. When it is close to ending, buy the next year from your plan page; nothing is charged automatically.`,
    { html: `You can download the invoice as a PDF from <a href="${link}">your plan page</a> at any time.`,
      text: `You can download the invoice as a PDF from your plan page at any time: ${link}` }
  ]);
}

/** A refund update, from a claim_refund_email() row. */
export function refundMail(r) {
  if (!r) return null;
  const done = r.status === 'processed';
  const amount = fmtMinor(r.amount_paise, r.currency || 'INR');
  return message(r.buyer_email, done ? `Refund processed: ${amount}` : 'Your refund could not be completed', [
    ['Refund amount', amount],
    ['Plan', r.plan_name],
    ['Invoice', r.invoice_number],
    ['Razorpay refund ID', r.razorpay_refund_id]
  ], done ? [
    `Hi ${r.buyer_name || 'there'},`,
    `Your refund of ${amount} has been processed and is on its way to your original payment method. Razorpay refunds usually arrive in 5 to 7 working days.`,
    `The year of the ${r.plan_name || ''} plan this payment bought has been taken off your account. If no paid time is left, your account has been given a fresh free trial, as the refund policy describes.`
  ] : [
    `Hi ${r.buyer_name || 'there'},`,
    `Your refund of ${amount} could not be completed by the payment provider. No money has left your account for it, and we are looking into it.`,
    'We will write again once it has gone through.'
  ]);
}

/** POST one message to Resend. Never throws. */
export async function sendMail(msg, { apiKey, from, idempotencyKey, fetch: f = globalThis.fetch } = {}) {
  if (!msg) return { ok: false, reason: 'no-recipient' };
  if (!apiKey || !from) return { ok: false, reason: 'not-configured' };
  try {
    const res = await f(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
                 ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
      body: JSON.stringify({ from, to: [msg.to], reply_to: BRAND.supportEmail, subject: msg.subject, html: msg.html, text: msg.text })
    });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.text()).slice(0, 300); } catch { /* no body */ }
      return { ok: false, reason: `resend ${res.status}`, detail };
    }
    const j = await res.json().catch(() => ({}));
    return { ok: true, id: j.id || null };
  } catch (e) {
    return { ok: false, reason: 'network', detail: String(e && e.message || e) };
  }
}

const one = (data) => (Array.isArray(data) ? data[0] : data) || null;
const cfg = (env) => ({ apiKey: env.RESEND_API_KEY || '', from: env.MAIL_FROM || '' });

/** Claim, send, and release on failure. `svc` is a service-role client
 *  (anything with .rpc). Never throws. */
export async function sendReceiptOnce(svc, orderId, env = {}, opts = {}) {
  const { apiKey, from } = cfg(env);
  if (!apiKey || !from) return { ok: false, reason: 'not-configured' };   // claim nothing: mail later, once it is set up
  try {
    const { data, error } = await svc.rpc('claim_receipt_email', { p_order_id: orderId });
    if (error) return { ok: false, reason: 'claim', detail: error.message };
    const inv = one(data);
    if (!inv || !inv.id) return { ok: true, skipped: 'already-sent-or-no-invoice' };
    const out = await sendMail(receiptMail(inv), { apiKey, from, idempotencyKey: 'receipt-' + inv.id, ...opts });
    if (!out.ok) await svc.rpc('release_receipt_email', { p_invoice: inv.id });
    return out;
  } catch (e) {
    return { ok: false, reason: 'error', detail: String(e && e.message || e) };
  }
}

export async function sendRefundOnce(svc, rzpRefundId, status, env = {}, opts = {}) {
  const { apiKey, from } = cfg(env);
  if (!apiKey || !from) return { ok: false, reason: 'not-configured' };
  try {
    const { data, error } = await svc.rpc('claim_refund_email', { p_rzp_refund: rzpRefundId, p_status: status });
    if (error) return { ok: false, reason: 'claim', detail: error.message };
    const r = one(data);
    if (!r || !r.refund_id) return { ok: true, skipped: 'already-sent-or-no-refund' };
    const out = await sendMail(refundMail(r), { apiKey, from, idempotencyKey: `refund-${r.refund_id}-${r.status}`, ...opts });
    if (!out.ok) await svc.rpc('release_refund_email', { p_refund: r.refund_id });
    return out;
  } catch (e) {
    return { ok: false, reason: 'error', detail: String(e && e.message || e) };
  }
}
