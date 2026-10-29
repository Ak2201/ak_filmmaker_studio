/* ============================================================
   INVOICES — the buyer's list (Plan tab) and the console's list
   ------------------------------------------------------------
   Schema §28. Both read RPCs (my_invoices, admin_list_invoices); the PDF
   is drawn in the browser by src/lib/invoice-pdf.js, imported only when
   a button is clicked. Self-contained: one mount line in settings.js,
   one in admin.js.

   The console's list also says whether the receipt e-mail went
   (invoices.emailed_at, schema §35) and offers RESEND RECEIPT, which
   asks first: it writes to a customer.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { admin as billingAdmin } from '../lib/billing.js';
import { fmtMinor } from '../lib/price-model.js';
import { ask } from './dialog.js';
import { listInvoices } from '../lib/admin-api.js';
import { isMissing, errorSentence } from '../lib/gate.js';
import '../styles/gate.css';
import '../styles/motion.css';

const S = { mine: { state: 'idle', rows: [] }, all: { state: 'idle', rows: [] } };
let rerender = () => {};
let faded = false;   // first draw only; settings redraws main often
const rows = { mine: new Map(), all: new Map() };

async function load(kind) {
  const c = window.StudioCloud;
  S[kind].state = 'loading';
  try {
    const data = await listInvoices(c, kind);
    S[kind] = { state: 'ready', rows: data || [] };
    rows[kind] = new Map(S[kind].rows.map((r) => [r.id, r]));
  } catch (e) {
    /* ONLY "function not found" (PGRST202 / 42883) means §28 has not run.
       A timeout, a dropped connection or a refusal is reported as what it
       was, with a retry: calling every failure "not set up" named a cause
       nobody had checked (CLAUDE.md, "Do not let a message GUESS"). */
    S[kind] = isMissing(e) ? { state: 'missing', rows: [] }
      : { state: 'error', rows: [], error: errorSentence(e, 'The server did not answer.') };
  }
  rerender();
}

const dateOf = (iso) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

function table(kind, withBuyer) {
  const t = h('table.gt-table', {}, [h('thead', {}, [h('tr', {}, [
    h('th', { text: 'Number' }), h('th', { text: 'Date' }), withBuyer ? h('th', { text: 'Buyer' }) : null,
    h('th', { text: 'Plan' }), h('th', { text: 'Amount' }), withBuyer ? h('th', { text: 'Receipt' }) : null, h('th', { text: '' })].filter(Boolean))])]);
  const body = h('tbody');
  for (const r of S[kind].rows) {
    body.append(h('tr', {}, [
      h('td', { text: r.number }), h('td', { text: dateOf(r.issued_at) }), withBuyer ? h('td', { text: r.buyer_email || r.buyer_name }) : null,
      h('td', { text: r.plan_name }), h('td', { text: fmtMinor(r.amount_paise, r.currency === 'USD' ? 'USD' : 'INR') }),
      withBuyer ? h('td', { text: r.emailed_at ? 'Sent ' + dateOf(r.emailed_at) : 'Not sent' }) : null,
      h('td', {}, [h('button.btn', { type: 'button', 'data-action': 'invoice-pdf', 'data-kind': kind, 'data-id': r.id, 'aria-label': 'Download PDF for ' + r.number, text: 'Download PDF' }),
        withBuyer && r.buyer_email && r.razorpay_order_id
          ? h('button.btn', { type: 'button', 'data-action': 'invoice-resend', 'data-id': r.id, 'aria-label': 'Resend the receipt for ' + r.number, text: 'Resend receipt' })
          : null])
    ].filter(Boolean)));
  }
  t.append(body);
  /* In its own sideways scroller, as every other console table is: bare,
     its 34rem min-width pushed the whole page 457px wide at 390. */
  return h('div.gt-scroll', {}, [t]);
}
/* What a failed read says: the observed reason, and the way to try again. */
function failed(kind) {
  return h('div.inv-failed', {}, [
    h('p.gt-meta', { role: 'alert', text: 'The invoices did not load: ' + S[kind].error }),
    h('button.k-btn.k-btn--secondary.k-btn--sm', { type: 'button', 'data-action': 'invoice-retry', 'data-kind': kind, text: 'Try again' })
  ]);
}

/** Plan tab: null until there is something to show. `st` is the
 *  billing_status() reply, which carries NO `deployed` key — that is the
 *  gate's studio_status(). Requiring it here meant my_invoices was never
 *  asked and no buyer ever saw an invoice; a project without §28 already
 *  reads as 'missing' below and draws nothing. */
export function memberInvoicePanel(st, { rerender: rr } = {}) {
  if (rr) rerender = rr;
  if (!st) return null;
  if (S.mine.state === 'idle') load('mine');
  if (S.mine.state === 'error') return h('div.inv-panel', {}, [h('h3.gt-h3', { text: 'Invoices' }), failed('mine')]);
  if (S.mine.state !== 'ready') return null;
  const wrap = h('div.inv-panel', {}, [h('h3.gt-h3', { text: 'Invoices' })]);
  if (!faded) { faded = true; wrap.classList.add('mo-in'); }
  if (!S.mine.rows.length) { wrap.append(h('p.gt-meta', { text: 'Your invoice appears here when a payment goes through.' })); return wrap; }
  wrap.append(table('mine', false));
  return wrap;
}

/** Console: a small section under Billing; null off the admin role. */
export function invoiceAdminSection(section, st, { rerender: rr } = {}) {
  if (rr) rerender = rr;
  if (!st || !st.deployed || st.role !== 'admin') return null;
  const sec = section('invoices', 'Invoices', 'Bills of Supply.', 'Every invoice issued on payment, newest first. Numbers are gapless within a financial year (April to March).');
  if (S.all.state === 'idle') load('all');
  if (S.all.state === 'missing') { sec.append(h('p.gt-meta', { text: 'Invoices are not set up on this project yet (schema §28).' })); return sec; }
  if (S.all.state === 'error') { sec.append(failed('all')); return sec; }
  if (S.all.state !== 'ready') { sec.append(h('p.gt-meta', { text: 'Loading…' })); return sec; }
  sec.append(S.all.rows.length ? table('all', true) : h('p.gt-meta', { text: 'No invoices yet.' }));
  return sec;
}

export function refreshInvoices() { S.mine.state = 'idle'; S.all.state = 'idle'; }

let wired = false;
if (!wired && typeof document !== 'undefined') {
  wired = true;
  delegate(document, 'click', '[data-action="invoice-retry"]', (e, el) => {
    const kind = el.dataset.kind === 'mine' ? 'mine' : 'all';
    S[kind].state = 'idle';
    rerender();
  });
  delegate(document, 'click', '[data-action="invoice-pdf"]', async (e, el) => {
    const inv = rows[el.dataset.kind] && rows[el.dataset.kind].get(el.dataset.id);
    if (!inv) return;
    const m = await import('../lib/invoice-pdf.js');
    m.downloadInvoicePdf(inv);
  });
  delegate(document, 'click', '[data-action="invoice-resend"]', async (e, el) => {
    const inv = rows.all.get(el.dataset.id);
    if (!inv || el.disabled) return;
    if (!await ask({ title: 'Send the receipt again?', body: `${inv.number} goes to ${inv.buyer_email}.`, confirm: 'Send' })) return;
    const toast = (msg, type) => { if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, type ? { type } : undefined); };
    el.disabled = true;
    try {
      const out = await billingAdmin.resendReceipt(inv.id);
      toast(out && out.sent ? `Receipt sent to ${inv.buyer_email}.` : 'Nothing was sent: the invoice has no buyer e-mail.');
      S.all.state = 'idle'; rerender();
    } catch (err) {
      toast(err && err.message ? err.message : 'The receipt could not be sent.', 'error');
    } finally { el.disabled = false; }
  });
}
export default { memberInvoicePanel, invoiceAdminSection, refreshInvoices };
