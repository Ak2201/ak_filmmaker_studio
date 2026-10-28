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

   A LAUNCH PASS IS WORDED AS ONE (schema §61). An invoice carries
   `period` (copied from its payment) and its own valid_from / valid_until;
   a refund claim carries the payment's period, starts_at and ends_at. A
   pass prints "7-day pass (until …)" with the length and the date taken
   from THOSE dates — nothing here knows how long a pass is — and its
   refund says no trial follows (§61 keeps the §34 refund trial off a
   pass). A row without a period is a year, as every row before §61 was.

   AUTO-RENEW (schema §62). A one-time purchase keeps its "nothing renews"
   receipt above, word for word. A subscription CHARGE gets
   chargeReceiptMail ("Renews on <date> at <amount>. Cancel anytime in
   Settings → Plan."), a cancel gets cancelMail, and renewalReminderMail
   is the pre-charge reminder, which rzp-remind sends once per billing
   cycle (schema §63: claim_renewal_reminders stamps the cycle first,
   release_renewal_reminder hands back a cycle whose send failed).
   ============================================================ */
import { BRAND } from './brand.js';
import { fmtMinor, hmacHex, timingSafeEqualHex } from './razorpay.js';
import { REFUND_TERMS } from './terms.js';

export { REFUND_TERMS };

export const RESEND_URL = 'https://api.resend.com/emails';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const site = (p = '') => `https://${BRAND.host}/${p}`;
const dateIST = (iso) => {
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
};

/** Whole days from one ISO date to another, or null when either is
 *  missing or the span is not positive. */
const spanDays = (from, until) => {
  const a = new Date(from), b = new Date(until);
  if (!from || !until || isNaN(a) || isNaN(b) || b <= a) return null;
  return Math.round((b - a) / 86400000);
};
/** "7-day pass (until 3 November 2026)", from the row's own dates. */
const passLabel = (from, until) => {
  const n = spanDays(from, until);
  return (n ? `${n}-day pass` : 'launch pass') + (until && dateIST(until) ? ` (until ${dateIST(until)})` : '');
};

/* THE LOOK. A mail client has no stylesheet: every rule is inline and the
   layout is nested tables, so Gmail, Outlook and Apple Mail draw the same
   card. The palette is the app's own (tokens.css): the obsidian ground for
   the band, the violet --brand for the one accent, white card on a soft
   grey page. Light on purpose: a mail is read in whatever the client is,
   and a dark body turns unreadable when the client inverts it. */
const INK = '#14151A', MUTED = '#5B5E6B', HAIR = '#E6E7EC', PAGE = '#F3F4F8', VIOLET = '#7C3AED', BAND = '#0D0E13';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const monogramOf = () => (String(BRAND.name || 'F').match(/[A-Z]/g) || ['F']).slice(0, 2).join('');

/** One message as Resend wants it, or null when there is no recipient.
 *  `extra` (all optional): kicker (the small line over the title),
 *  hero [label, value] (the one figure the mail is about), cta [label, url]
 *  (the one button). */
function message(to, subject, rows, paras, extra = {}) {
  if (!to || !/@/.test(String(to))) return null;
  const shown = rows.filter(([, v]) => v);
  const { kicker, hero, cta } = extra;
  const detail = shown.map(([k, v], i) =>
    `<tr><td style="padding:10px 16px 10px 0;color:${MUTED};font-size:13px;vertical-align:top;${i ? `border-top:1px solid ${HAIR};` : ''}">${esc(k)}</td>`
    + `<td align="right" style="padding:10px 0;font-size:14px;font-weight:600;color:${INK};vertical-align:top;word-break:break-word;${i ? `border-top:1px solid ${HAIR};` : ''}">${esc(v)}</td></tr>`).join('');
  const body = paras.map((p, i) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${i ? '#2B2D36' : INK}">${p.html ?? esc(p)}</p>`).join('');
  const heroBlock = hero && hero[1]
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px"><tr><td style="background:#F6F2FE;border:1px solid #E4D9FB;border-radius:12px;padding:20px 22px">`
      + `<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${VIOLET};font-weight:700">${esc(hero[0])}</div>`
      + `<div style="font-size:34px;line-height:1.15;font-weight:700;color:${INK};margin-top:4px;letter-spacing:-.01em">${esc(hero[1])}</div></td></tr></table>`
    : '';
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 22px"><tr><td style="background:${VIOLET};border-radius:8px"><a href="${esc(cta[1])}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${esc(cta[0])}</a></td></tr></table>`
    : '';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>`
    + `<body style="margin:0;padding:0;background:${PAGE};font-family:${FONT};color:${INK}">`
    + `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(subject)}</div>`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE}"><tr><td align="center" style="padding:28px 12px">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">`
    // the brand band
    + `<tr><td style="background:${BAND};border-radius:14px 14px 0 0;padding:22px 28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>`
    + `<td style="width:38px;height:38px;border:1.5px solid ${VIOLET};border-radius:8px;text-align:center;color:#C4B5FD;font-weight:700;font-size:15px;letter-spacing:-.02em">${esc(monogramOf())}</td>`
    + `<td style="padding-left:12px"><div style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:-.01em">${esc(BRAND.name)}</div>`
    + (BRAND.tagline ? `<div style="color:#9A9CAB;font-size:12px;margin-top:2px">${esc(BRAND.tagline)}</div>` : '')
    + `</td></tr></table></td></tr>`
    + `<tr><td style="height:3px;background:${VIOLET};font-size:0;line-height:0">&nbsp;</td></tr>`
    // the card
    + `<tr><td style="background:#ffffff;padding:30px 28px 10px">`
    + (kicker ? `<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};font-weight:600;margin-bottom:6px">${esc(kicker)}</div>` : '')
    + `<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:${INK};font-weight:700">${esc(subject)}</h1>`
    + heroBlock + body + button
    + (detail ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 20px;border:1px solid ${HAIR};border-radius:12px"><tr><td style="padding:6px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${detail}</table></td></tr></table>` : '')
    + `</td></tr>`
    // the footer
    + `<tr><td style="background:#ffffff;border-radius:0 0 14px 14px;padding:4px 28px 26px"><div style="border-top:1px solid ${HAIR};padding-top:16px">`
    + `<p style="margin:0 0 8px;color:${MUTED};font-size:12.5px;line-height:1.55">${esc(REFUND_TERMS)} Full policy: <a href="${site('refund')}" style="color:${VIOLET}">${site('refund')}</a></p>`
    + `<p style="margin:0;color:${MUTED};font-size:12.5px;line-height:1.55">Questions? Reply to this e-mail or write to <a href="mailto:${esc(BRAND.supportEmail)}" style="color:${VIOLET}">${esc(BRAND.supportEmail)}</a>.</p>`
    + `</div></td></tr></table>`
    + `<p style="margin:16px 0 0;color:#8A8D9B;font-size:12px">${esc(BRAND.name)} &middot; <a href="${site()}" style="color:#8A8D9B">${esc(BRAND.host)}</a></p>`
    + `</td></tr></table></body></html>`;
  const text = [BRAND.name, '', ...paras.map((p) => p.text ?? p), '',
    ...(hero && hero[1] ? [`${hero[0]}: ${hero[1]}`] : []),
    ...shown.map(([k, v]) => `${k}: ${v}`), '',
    ...(cta ? [`${cta[0]}: ${cta[1]}`, ''] : []),
    `${REFUND_TERMS} Full policy: ${site('refund')}`, '',
    `Questions? Reply to this e-mail or write to ${BRAND.supportEmail}.`].join('\n');
  return { to: String(to).trim(), subject, html, text };
}

/** The receipt, from a claim_receipt_email() row (an invoices row). */
export function receiptMail(inv) {
  if (!inv) return null;
  const link = site('purchase');
  // §57: the invoice's own year (valid_until); ends_at for an older caller
  const until = inv.valid_until || inv.ends_at;
  if (inv.period === 'pass') {
    const label = passLabel(inv.valid_from, until);
    return message(inv.buyer_email, `Payment received: ${inv.plan_name} ${label.replace(/ \(.*$/, '')} (${inv.number})`, [
      ['Invoice', inv.number],
      ['Plan', `${inv.plan_name}, ${label}. It ends by itself; nothing renews automatically.`],
      ['Amount paid', fmtMinor(inv.amount_paise, inv.currency || 'INR')],
      ['Date', dateIST(inv.paid_at || inv.issued_at)],
      ['Razorpay payment ID', inv.razorpay_payment_id]
    ], [
      `Hi ${inv.buyer_name || 'there'},`,
      `Thank you for your purchase. Your ${inv.plan_name} ${label} is active on your account now. It ends by itself and nothing is charged automatically. To keep going after it, choose a yearly plan from your plan page; your work stays where it is.`,
      { html: `You can download the invoice as a PDF from <a href="${link}">your plan page</a> at any time.`,
        text: `You can download the invoice as a PDF from your plan page at any time: ${link}` }
    ], { kicker: 'Payment received', hero: ['Amount paid', fmtMinor(inv.amount_paise, inv.currency || 'INR')], cta: ['View your plan', link] });
  }
  return message(inv.buyer_email, `Payment received: ${inv.plan_name} plan (${inv.number})`, [
    ['Invoice', inv.number],
    ['Plan', `${inv.plan_name}, 1 year${until ? ' (valid until ' + dateIST(until) + ')' : ''}. Nothing renews automatically.`],
    ['Amount paid', fmtMinor(inv.amount_paise, inv.currency || 'INR')],
    ['Date', dateIST(inv.paid_at || inv.issued_at)],
    ['Razorpay payment ID', inv.razorpay_payment_id]
  ], [
    `Hi ${inv.buyer_name || 'there'},`,
    `Thank you for your purchase. Your ${inv.plan_name} plan is active on your account now, for a year. When it is close to ending, buy the next year from your plan page; nothing is charged automatically.`,
    { html: `You can download the invoice as a PDF from <a href="${link}">your plan page</a> at any time.`,
      text: `You can download the invoice as a PDF from your plan page at any time: ${link}` }
  ], { kicker: 'Payment received', hero: ['Amount paid', fmtMinor(inv.amount_paise, inv.currency || 'INR')], cta: ['View your plan', link] });
}

/** A refund update, from a claim_refund_email() row. */
export function refundMail(r) {
  if (!r) return null;
  const done = r.status === 'processed';
  const amount = fmtMinor(r.amount_paise, r.currency || 'INR');
  const pass = r.period === 'pass';
  const label = pass ? passLabel(r.starts_at, r.ends_at) : '';
  return message(r.buyer_email, done ? `Refund processed: ${amount}` : 'Your refund could not be completed', [
    ['Refund amount', amount],
    ['Plan', pass ? `${r.plan_name || ''} ${label}`.trim() : r.plan_name],
    ['Invoice', r.invoice_number],
    ['Razorpay refund ID', r.razorpay_refund_id]
  ], done ? [
    `Hi ${r.buyer_name || 'there'},`,
    `Your refund of ${amount} has been processed and is on its way to your original payment method. Razorpay refunds usually arrive in 5 to 7 working days.`,
    pass
      ? `The ${label.replace(/ \(.*$/, '')} this payment bought has been taken off your account. A refunded pass does not come with a free trial, and the pass is once per account.`
      : `The year of the ${r.plan_name || ''} plan this payment bought has been taken off your account. If no paid time is left, your account has been given a fresh free trial, as the refund policy describes.`
  ] : [
    `Hi ${r.buyer_name || 'there'},`,
    `Your refund of ${amount} could not be completed by the payment provider. No money has left your account for it, and we are looking into it.`,
    'We will write again once it has gone through.'
  ], { kicker: done ? 'Refund processed' : 'Refund update', hero: done ? ['Refunded', amount] : null, cta: done ? ['Choose a plan', site('purchase')] : null });
}

/* ---- auto-renew (schema §62) --------------------------------------------
   A subscription CHARGE has its own invoice and its own receipt, claimed by
   the Razorpay payment id (claim_charge_receipt_email) because a charge has
   no order. The row is the invoice plus renews / renews_at / renew_minor /
   renew_currency / every_days / sub_period. The receipt never says "nothing
   renews" for a charge: it says when the next one is, at what amount, and
   where to cancel — or, once a cancel was asked for, that nothing more will
   be charged. */
const everyLabel = (period, days) => {
  if (period === 'year') return 'every year';
  const d = Math.round(Number(days));
  return d === 1 ? 'every day' : d > 1 ? `every ${d} days` : 'every period';
};

/** The receipt for one subscription charge. */
export function chargeReceiptMail(inv) {
  if (!inv) return null;
  const link = site('purchase');
  const until = inv.valid_until || inv.ends_at;
  const pass = (inv.sub_period || inv.period) === 'pass';
  const label = pass ? passLabel(inv.valid_from, until) : `1 year${until ? ' (valid until ' + dateIST(until) + ')' : ''}`;
  const next = inv.renews && inv.renews_at && dateIST(inv.renews_at)
    ? `Renews on ${dateIST(inv.renews_at)} at ${fmtMinor(inv.renew_minor ?? inv.amount_paise, inv.renew_currency || inv.currency || 'INR')}. Cancel anytime in Settings → Plan.`
    : `Auto-pay is off. Nothing more will be charged${until && dateIST(until) ? `, and your access runs until ${dateIST(until)}` : ''}.`;
  const what = pass ? `${inv.plan_name} ${label.replace(/ \(.*$/, '')}` : `${inv.plan_name} plan`;
  return message(inv.buyer_email, `Payment received: ${what}, auto-pay (${inv.number})`, [
    ['Invoice', inv.number],
    ['Plan', `${inv.plan_name}, ${label}.`],
    ['Amount paid', fmtMinor(inv.amount_paise, inv.currency || 'INR')],
    ['Auto-pay', next],
    ['Date', dateIST(inv.paid_at || inv.issued_at)],
    ['Razorpay payment ID', inv.razorpay_payment_id]
  ], [
    `Hi ${inv.buyer_name || 'there'},`,
    `Thank you. Your auto-pay charge for ${what} went through and the time is on your account now.`,
    next,
    { html: `You can download the invoice as a PDF from <a href="${link}">your plan page</a> at any time.`,
      text: `You can download the invoice as a PDF from your plan page at any time: ${link}` }
  ], { kicker: 'Auto-pay receipt', hero: ['Amount paid', fmtMinor(inv.amount_paise, inv.currency || 'INR')], cta: ['View your plan', link] });
}

/** The confirmation that auto-pay was cancelled. `c` is what
 *  request_cancel_subscription / admin_cancel_subscription return
 *  (email, product, period, amount_minor, currency, current_end) plus
 *  optional plan_name, days and buyer_name. */
export function cancelMail(c) {
  if (!c) return null;
  const until = c.current_end && dateIST(c.current_end);
  const what = c.period === 'pass' ? `${c.plan_name || 'Pro'} pass` : `${c.plan_name || 'yearly'} plan`;
  return message(c.email, 'Auto-pay cancelled', [
    ['Plan', what],
    ['Was', c.amount_minor ? `${fmtMinor(c.amount_minor, c.currency || 'INR')} ${everyLabel(c.period, c.days)}` : ''],
    ['Access until', until || '']
  ], [
    `Hi ${c.buyer_name || 'there'},`,
    `Your auto-pay for the ${what} is cancelled. Nothing more will be charged.`,
    until ? `You keep everything you paid for: your access runs until ${until}. After that your work stays where it is, and you can buy again from your plan page whenever you like.`
          : 'You keep everything you paid for. Your work stays where it is, and you can buy again from your plan page whenever you like.',
    'Cancelling does not refund a charge already made; the refund policy below still applies to every charge.'
  ], { kicker: 'Auto-pay', cta: ['Choose a plan', site('purchase')] });
}

/** A reminder before the next charge (the app's own, beside the pre-debit
 *  notice Razorpay sends under the RBI e-mandate rules). `r` is a
 *  claim_renewal_reminders() row (schema §63): email, name (or
 *  buyer_name), plan_name, period, days, amount_minor, currency,
 *  next_charge_at. Sent once per billing cycle by rzp-remind
 *  (sendRenewalReminders below). */
export const CANCEL_PATH = 'Settings → Plan & purchases → Cancel auto-pay';
export function renewalReminderMail(r) {
  if (!r || !r.next_charge_at || !dateIST(r.next_charge_at)) return null;
  const what = r.period === 'pass' ? `${r.plan_name || 'Pro'} pass` : `${r.plan_name || 'yearly'} plan`;
  const amount = fmtMinor(r.amount_minor, r.currency || 'INR');
  const when = dateIST(r.next_charge_at);
  return message(r.email, `Your ${what} renews on ${when}: ${amount}`, [
    ['Plan', what],
    ['Next charge', `${amount} on ${when}`],
    ['Repeats', everyLabel(r.period, r.days)]
  ], [
    `Hi ${r.name || r.buyer_name || 'there'},`,
    `A reminder: your auto-pay will charge ${amount} for the ${what} on ${when}. Nothing needs doing if you want it to continue.`,
    `Cancel anytime in ${CANCEL_PATH}; nothing more is charged after you cancel, and you keep the time already paid for.`,
    { html: `Settings: <a href="${site('settings')}">${site('settings')}</a>`,
      text: `Settings: ${site('settings')}` }
  ], { kicker: 'Upcoming charge', hero: ['Next charge', amount], cta: ['Manage auto-pay', site('settings')] });
}

/** POST one message to Resend. Never throws. */
export async function sendMail(msg, { apiKey, from, smtp, smtpSend, idempotencyKey, fetch: f = globalThis.fetch } = {}) {
  if (!msg) return { ok: false, reason: 'no-recipient' };
  if (!from || !(apiKey || smtp)) return { ok: false, reason: 'not-configured' };
  if (!apiKey) {
    try {
      const send = smtpSend || (await import('./smtp.js')).smtpSend;
      await send(smtp, { from, to: msg.to, replyTo: BRAND.supportEmail, subject: msg.subject, html: msg.html, text: msg.text });
      return { ok: true, id: null };
    } catch (e) {
      return { ok: false, reason: 'smtp', detail: String(e && e.message || e).slice(0, 300) };
    }
  }
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
/** Resend when RESEND_API_KEY is set; otherwise a mailbox over SMTP when
 *  SMTP_USER and SMTP_PASSWORD are (host defaults to Hostinger's, port 465). */
const cfg = (env) => ({
  apiKey: env.RESEND_API_KEY || '',
  from: env.MAIL_FROM || '',
  smtp: env.SMTP_USER && env.SMTP_PASSWORD
    ? { host: env.SMTP_HOST || 'smtp.hostinger.com', port: Number(env.SMTP_PORT) || 465, user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
    : null
});
/** True when something can send: a From address and either transport. */
export const mailConfigured = (env = {}) => { const c = cfg(env); return !!(c.from && (c.apiKey || c.smtp)); };

/** The env every function passes in, read through its own Deno.env.get. */
export const mailEnvFrom = (get) => ({
  RESEND_API_KEY: get('RESEND_API_KEY') ?? '', MAIL_FROM: get('MAIL_FROM') ?? '',
  SMTP_HOST: get('SMTP_HOST') ?? '', SMTP_PORT: get('SMTP_PORT') ?? '',
  SMTP_USER: get('SMTP_USER') ?? '', SMTP_PASSWORD: get('SMTP_PASSWORD') ?? ''
});

/** Claim, send, and release on failure. `svc` is a service-role client
 *  (anything with .rpc). Never throws. */
export async function sendReceiptOnce(svc, orderId, env = {}, opts = {}) {
  const { apiKey, from, smtp } = cfg(env);
  if (!from || !(apiKey || smtp)) return { ok: false, reason: 'not-configured' };   // claim nothing: mail later, once it is set up
  try {
    const { data, error } = await svc.rpc('claim_receipt_email', { p_order_id: orderId });
    if (error) return { ok: false, reason: 'claim', detail: error.message };
    const inv = one(data);
    if (!inv || !inv.id) return { ok: true, skipped: 'already-sent-or-no-invoice' };
    const out = await sendMail(receiptMail(inv), { apiKey, from, smtp, idempotencyKey: 'receipt-' + inv.id, ...opts });
    if (!out.ok) await svc.rpc('release_receipt_email', { p_invoice: inv.id });
    return out;
  } catch (e) {
    return { ok: false, reason: 'error', detail: String(e && e.message || e) };
  }
}

export async function sendRefundOnce(svc, rzpRefundId, status, env = {}, opts = {}) {
  const { apiKey, from, smtp } = cfg(env);
  if (!from || !(apiKey || smtp)) return { ok: false, reason: 'not-configured' };
  try {
    const { data, error } = await svc.rpc('claim_refund_email', { p_rzp_refund: rzpRefundId, p_status: status });
    if (error) return { ok: false, reason: 'claim', detail: error.message };
    const r = one(data);
    if (!r || !r.refund_id) return { ok: true, skipped: 'already-sent-or-no-refund' };
    const out = await sendMail(refundMail(r), { apiKey, from, smtp, idempotencyKey: `refund-${r.refund_id}-${r.status}`, ...opts });
    if (!out.ok) await svc.rpc('release_refund_email', { p_refund: r.refund_id });
    return out;
  } catch (e) {
    return { ok: false, reason: 'error', detail: String(e && e.message || e) };
  }
}

/** §62: the receipt for one subscription charge, by Razorpay payment id.
 *  Claimed first, released on a failed send, like sendReceiptOnce. */
export async function sendChargeReceiptOnce(svc, rzpPaymentId, env = {}, opts = {}) {
  const { apiKey, from, smtp } = cfg(env);
  if (!from || !(apiKey || smtp)) return { ok: false, reason: 'not-configured' };
  try {
    const { data, error } = await svc.rpc('claim_charge_receipt_email', { p_rzp_payment_id: rzpPaymentId });
    if (error) return { ok: false, reason: 'claim', detail: error.message };
    const inv = one(data);
    if (!inv || !inv.id) return { ok: true, skipped: 'already-sent-or-no-invoice' };
    const out = await sendMail(chargeReceiptMail(inv), { apiKey, from, smtp, idempotencyKey: 'receipt-' + inv.id, ...opts });
    if (!out.ok) await svc.rpc('release_receipt_email', { p_invoice: inv.id });
    return out;
  } catch (e) {
    return { ok: false, reason: 'error', detail: String(e && e.message || e) };
  }
}

/** §62: the cancellation confirmation. There is no claim row: rzp-cancel
 *  sends it only for the request that set the flag (already = false), and
 *  Resend's Idempotency-Key covers a retry of that request. Never throws. */
export async function sendCancelMail(c, env = {}, opts = {}) {
  const { apiKey, from, smtp } = cfg(env);
  if (!from || !(apiKey || smtp)) return { ok: false, reason: 'not-configured' };
  try {
    return await sendMail(cancelMail(c), { apiKey, from, smtp, idempotencyKey: 'cancel-' + (c && c.subscription_row_id), ...opts });
  } catch (e) {
    return { ok: false, reason: 'error', detail: String(e && e.message || e) };
  }
}

/* ---- renewal reminders (schema §63) -------------------------------------
   rzp-remind is called by a scheduler, not a person, so it has no JWT: it is
   guarded by a shared secret in the x-cron-secret header. */

/** 'unset' when no CRON_SECRET is configured (the function answers 503),
 *  'bad' when the header does not match (401), 'ok' otherwise. Constant-
 *  time in shape: both sides are HMACed under a fresh random key first, so
 *  the compare is over two equal-length digests whatever was sent. */
export async function checkCronSecret(header, secret) {
  if (!secret) return 'unset';
  if (!header) return 'bad';
  const k = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  const [a, b] = await Promise.all([hmacHex(k, String(header)), hmacHex(k, String(secret))]);
  return timingSafeEqualHex(a, b) ? 'ok' : 'bad';
}

/** Claim this run's reminders, send each, release each one that did not
 *  go. With no Resend key nothing is claimed, so no cycle is marked as
 *  reminded without a mail. Never throws.
 *  -> { ok, sent, failed, skipped, reason?, detail? } */
export async function sendRenewalReminders(svc, env = {}, opts = {}) {
  const { apiKey, from, smtp } = cfg(env);
  if (!from || !(apiKey || smtp)) return { ok: false, reason: 'not-configured', sent: 0, failed: 0, skipped: 0 };
  let sent = 0, failed = 0, skipped = 0;
  try {
    const { data, error } = await svc.rpc('claim_renewal_reminders', { p_within: opts.within || '48 hours', p_limit: opts.limit || 200 });
    if (error) return { ok: false, reason: 'claim', detail: error.message, sent, failed, skipped };
    for (const row of Array.isArray(data) ? data : data ? [data] : []) {
      const msg = renewalReminderMail(row);
      // the claim only returns rows with an e-mail and a date, so a null
      // message is a row this builder cannot word: keep it claimed rather
      // than hand it back to be claimed again every hour
      if (!msg) { skipped++; continue; }
      const out = await sendMail(msg, { apiKey, from, smtp, smtpSend: opts.smtpSend, fetch: opts.fetch,
        idempotencyKey: `remind-${row.subscription_row_id}-${new Date(row.next_charge_at).toISOString()}` });
      if (out.ok) { sent++; continue; }
      failed++;
      try { await svc.rpc('release_renewal_reminder', { p_row: row.subscription_row_id, p_for: row.next_charge_at }); } catch { /* the next run tries the others */ }
    }
    return { ok: failed === 0, sent, failed, skipped };
  } catch (e) {
    return { ok: false, reason: 'error', detail: String(e && e.message || e), sent, failed, skipped };
  }
}
