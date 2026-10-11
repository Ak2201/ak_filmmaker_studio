/* The refund terms, worded as refund.html words them. One sentence,
   shared by the receipt e-mail (mail.js) and the invoice PDF
   (src/lib/invoice-pdf.js), so the two can never disagree with each
   other. If refund.html's exceptions change, change this too. */
export const REFUND_TERMS = 'Purchases are final and non-refundable, except for a duplicate or erroneous charge, '
  + 'a payment for a plan that was never activated, or where Indian law requires a refund.';
