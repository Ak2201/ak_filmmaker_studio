/* ============================================================
   INVOICE PDF — a Bill of Supply, through the studio's print path
   ------------------------------------------------------------
   Lazy: imported only when someone clicks Download PDF. It builds one
   .inv-doc element, lets src/lib/pdf.js stage the page as the
   'invoice' document (pdf.css hides everything else), prints, and
   removes it again. Live text, not a bitmap.

   The seller block reads src/data/brand.json through brand.js. It
   names the TRADING name, never the owner (owner, 11 Oct 2026: "I
   don't want my name to be displayed"); `seller` is empty on purpose. While
   `gstin` is empty the document says the supplier is not registered
   under GST and shows NO tax lines — it is a Bill of Supply, not a
   tax invoice, and must never be mistaken for one.

   ONE PAGE, BRANDED (owner, 22 Oct 2026): the rail's monogram tile and
   the name over a violet rule (--print-accent), the supplier, buyer and
   payment facts side by side, the year the payment bought ("Plan valid",
   from schema §57's valid_from / valid_until, left out when absent) and
   what that year comes to a day, and the refund terms as one line.

   The refund sentence is REFUND_TERMS (supabase/functions/_shared/
   terms.js), the same one the receipt e-mail prints, worded as
   refund.html words it: final, with the three exceptions. A flat "no
   refunds" would contradict the published policy.
   ============================================================ */
/* pdf.css is what hides the rest of the page and styles .inv-doc. Only
   eleven page entries import it, and the two pages that sell plans
   (purchase.html and the console) are not among them: without this line
   their receipts printed the whole page with the invoice unstyled at the
   end. The importer brings the sheet, wherever it is clicked. */
import '../styles/pdf.css';
import { h } from './dom.js';
import { BRAND, monogram } from './brand.js';
import { exportPDF } from './pdf.js';
import { amountInWords, coverLine } from './invoice.js';
import { fmtMinor, perDayIn } from './price-model.js';
import { REFUND_TERMS } from '../../supabase/functions/_shared/terms.js';

const dateOf = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const line = (text) => (text ? h('div', { text }) : null);
/* A label/value row; a field the invoice does not carry (one issued
   before schema §35 has no Razorpay ids) is left out, not printed empty. */
const fact = (k, v) => (v ? h('tr', {}, [h('th', { scope: 'row', text: k }), h('td', { text: v })]) : null);

export function buildInvoice(inv) {
  const gst = String(BRAND.gstin || '').trim();
  /* §56: amount_paise holds minor units of the invoice's `currency`
     (copied from the payment); an invoice without one is rupees. */
  const cur = inv.currency === 'USD' ? 'USD' : 'INR';
  const amt = fmtMinor(inv.amount_paise, cur);
  const refundUrl = `https://${BRAND.host}/refund`;
  const seller = [h('strong', { text: BRAND.name }), line(BRAND.address), line(BRAND.supportEmail),
    line(BRAND.host), gst ? line('GSTIN ' + gst) : null].filter(Boolean);
  const buyer = [h('strong', { text: inv.buyer_name }), line(inv.buyer_email),
    inv.buyer_gstin ? line('GSTIN ' + inv.buyer_gstin) : null].filter(Boolean);
  const facts = [
    fact('Invoice number', inv.number),
    fact('Date of issue', dateOf(inv.issued_at)),
    fact('Payment date', inv.paid_at ? dateOf(inv.paid_at) : ''),
    /* §57: the year this payment bought (absent on an invoice issued
       before §57 ran, or for a payment that applied no plan) */
    fact('Plan valid', inv.valid_from && inv.valid_until ? `${shortDate(inv.valid_from)} – ${shortDate(inv.valid_until)}` : ''),
    fact('Payment method', 'Paid online via Razorpay'),
    fact('Currency', cur === 'USD' ? 'US dollars (USD)' : 'Indian rupees (INR)'),
    fact('Razorpay payment ID', inv.razorpay_payment_id),
    fact('Razorpay order ID', inv.razorpay_order_id)
  ].filter(Boolean);
  const day = perDayIn(inv.amount_paise, cur);
  return h('div.inv-doc', { role: 'document' }, [
    /* the brand: the rail's monogram tile and the name, over one violet rule */
    h('div.inv-brand', {}, [
      h('span.inv-mark', { text: monogram(), 'aria-hidden': 'true' }),
      h('div', {}, [h('strong.inv-brand-name', { text: BRAND.name }), BRAND.tagline ? h('span.inv-tag', { text: BRAND.tagline }) : null].filter(Boolean))
    ]),
    h('div.inv-head', {}, [
      h('div', {}, [h('h1', { text: 'Bill of Supply' }), h('p.inv-no', { text: `${inv.number} · ${dateOf(inv.issued_at)}` })]),
      h('span.inv-paid', { text: 'PAID' })
    ]),
    h('div.inv-cols', {}, [
      h('div', {}, [h('h2', { text: 'Supplier' }), ...seller]),
      h('div', {}, [h('h2', { text: 'Billed to' }), ...buyer]),
      h('div.inv-cols-facts', {}, [h('h2', { text: 'Payment details' }), h('table.inv-facts', {}, [h('tbody', {}, facts)])])
    ]),
    h('table', {}, [
      h('thead', {}, [h('tr', {}, [h('th', { text: 'Description' }), h('th.inv-amt', { text: 'Qty' }),
        h('th.inv-amt', { text: 'Rate' }), h('th.inv-amt', { text: 'Amount' })])]),
      h('tbody', {}, [h('tr', {}, [
        h('td', {}, [h('div', { text: `${BRAND.name} — ${inv.plan_name} plan` }),
          h('div.inv-sub', { text: coverLine(inv, day) })]),
        h('td.inv-amt', { text: '1' }), h('td.inv-amt', { text: amt }), h('td.inv-amt', { text: amt })])]),
      h('tfoot', {}, [h('tr', {}, [h('th', { colspan: '3', text: 'Total paid' }), h('th.inv-amt', { text: amt })])])
    ]),
    h('p.inv-words', { text: 'Amount in words: ' + amountInWords(inv.amount_paise, cur) }),
    h('p.inv-note', { text: gst ? 'Bill of Supply.' : 'Bill of Supply — supplier not registered under GST. No tax is charged.' }),
    /* one line, not a box: the published wording (final, with the three
       exceptions — never a flat "no refunds"), and where to read it all */
    h('p.inv-terms', { text: 'Refunds: ' + REFUND_TERMS + ' Full policy: ' + refundUrl }),
    h('p.inv-note', { text: `This is a computer-generated document and needs no signature. Questions: ${BRAND.supportEmail}.` })
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
