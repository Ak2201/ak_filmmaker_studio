/* ============================================================
   INVOICE PDF — a Bill of Supply, through the studio's print path
   ------------------------------------------------------------
   Lazy: imported only when someone clicks Download PDF. It builds one
   .inv-doc element, lets src/lib/pdf.js stage the page as the
   'invoice' document (pdf.css hides everything else), prints, and
   removes it again. Live text, not a bitmap.

   The seller block reads src/data/brand.json through brand.js. While
   `gstin` is empty the document says the supplier is not registered
   under GST and shows NO tax lines — it is a Bill of Supply, not a
   tax invoice, and must never be mistaken for one.
   ============================================================ */
import { h } from './dom.js';
import { BRAND } from './brand.js';
import { exportPDF } from './pdf.js';
import { fmtPaise } from '../../supabase/functions/_shared/razorpay.js';

const dateOf = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });

export function buildInvoice(inv) {
  const gst = String(BRAND.gstin || '').trim();
  const seller = [h('strong', { text: BRAND.seller }), BRAND.address ? h('div', { text: BRAND.address }) : null,
    h('div', { text: BRAND.supportEmail }), gst ? h('div', { text: 'GSTIN ' + gst }) : null].filter(Boolean);
  const buyer = [h('strong', { text: inv.buyer_name }), inv.buyer_email ? h('div', { text: inv.buyer_email }) : null,
    inv.buyer_gstin ? h('div', { text: 'GSTIN ' + inv.buyer_gstin }) : null].filter(Boolean);
  return h('div.inv-doc', { role: 'document' }, [
    h('h1', { text: 'Bill of Supply' }),
    h('p.inv-no', { text: `${inv.number} · ${dateOf(inv.issued_at)}` }),
    h('div.inv-cols', {}, [
      h('div', {}, [h('h2', { text: 'Supplier' }), ...seller]),
      h('div', {}, [h('h2', { text: 'Billed to' }), ...buyer])
    ]),
    h('table', {}, [
      h('thead', {}, [h('tr', {}, [h('th', { text: 'Description' }), h('th.inv-amt', { text: 'Amount' })])]),
      h('tbody', {}, [h('tr', {}, [h('td', { text: `${BRAND.name} — ${inv.plan_name} plan (licence, one payment)` }), h('td.inv-amt', { text: fmtPaise(inv.amount_paise) })])]),
      h('tfoot', {}, [h('tr', {}, [h('th', { text: 'Total' }), h('th.inv-amt', { text: fmtPaise(inv.amount_paise) })])])
    ]),
    h('p.inv-note', { text: gst ? 'Bill of Supply.' : 'Bill of Supply — supplier not registered under GST. No tax is charged.' }),
    h('p.inv-note', { text: `Paid online through Razorpay. Questions: ${BRAND.supportEmail}.` })
  ]);
}

export function downloadInvoicePdf(inv) {
  const doc = buildInvoice(inv);
  return exportPDF({
    scope: 'invoice', masthead: false, title: inv.number.replace(/\//g, '-'),
    before: () => document.body.append(doc),
    after: () => doc.remove()
  });
}
