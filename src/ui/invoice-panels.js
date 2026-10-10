/* ============================================================
   INVOICES — the buyer's list (Plan tab) and the console's list
   ------------------------------------------------------------
   Schema §28. Both read RPCs (my_invoices, admin_list_invoices); the PDF
   is drawn in the browser by src/lib/invoice-pdf.js, imported only when
   a button is clicked. Self-contained: one mount line in settings.js,
   one in admin.js.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { fmtPaise } from '../lib/billing.js';
import '../styles/motion.css';

const S = { mine: { state: 'idle', rows: [] }, all: { state: 'idle', rows: [] } };
let rerender = () => {};
let faded = false;   // first draw only; settings redraws main often
const rows = { mine: new Map(), all: new Map() };

async function load(kind) {
  const c = window.StudioCloud;
  S[kind].state = 'loading';
  try {
    const sb = c && c.ensureClient ? await c.ensureClient() : null;
    if (!sb) throw new Error('no cloud');
    const { data, error } = await sb.rpc(kind === 'mine' ? 'my_invoices' : 'admin_list_invoices');
    if (error) throw error;
    S[kind] = { state: 'ready', rows: data || [] };
    rows[kind] = new Map(S[kind].rows.map((r) => [r.id, r]));
  } catch (e) {
    // A project that has not run §28 yet answers "function not found": say nothing.
    S[kind] = { state: 'missing', rows: [] };
  }
  rerender();
}

const dateOf = (iso) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

function table(kind, withBuyer) {
  const t = h('table.gt-table', {}, [h('thead', {}, [h('tr', {}, [
    h('th', { text: 'Number' }), h('th', { text: 'Date' }), withBuyer ? h('th', { text: 'Buyer' }) : null,
    h('th', { text: 'Plan' }), h('th', { text: 'Amount' }), h('th', { text: '' })].filter(Boolean))])]);
  const body = h('tbody');
  for (const r of S[kind].rows) {
    body.append(h('tr', {}, [
      h('td', { text: r.number }), h('td', { text: dateOf(r.issued_at) }), withBuyer ? h('td', { text: r.buyer_email || r.buyer_name }) : null,
      h('td', { text: r.plan_name }), h('td', { text: fmtPaise(r.amount_paise) }),
      h('td', {}, [h('button.btn', { type: 'button', 'data-action': 'invoice-pdf', 'data-kind': kind, 'data-id': r.id, 'aria-label': 'Download PDF for ' + r.number, text: 'DOWNLOAD PDF' })])
    ].filter(Boolean)));
  }
  t.append(body);
  return t;
}

/** Plan tab: null until there is something to show. */
export function memberInvoicePanel(st, { rerender: rr } = {}) {
  if (rr) rerender = rr;
  if (!st || !st.deployed) return null;
  if (S.mine.state === 'idle') load('mine');
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
  if (S.all.state !== 'ready') { sec.append(h('p.gt-meta', { text: 'Loading…' })); return sec; }
  sec.append(S.all.rows.length ? table('all', true) : h('p.gt-meta', { text: 'No invoices yet.' }));
  return sec;
}

export function refreshInvoices() { S.mine.state = 'idle'; S.all.state = 'idle'; }

let wired = false;
if (!wired && typeof document !== 'undefined') {
  wired = true;
  delegate(document, 'click', '[data-action="invoice-pdf"]', async (e, el) => {
    const inv = rows[el.dataset.kind] && rows[el.dataset.kind].get(el.dataset.id);
    if (!inv) return;
    const m = await import('../lib/invoice-pdf.js');
    m.downloadInvoicePdf(inv);
  });
}
export default { memberInvoicePanel, invoiceAdminSection, refreshInvoices };
