/* ============================================================
   REFUND DIALOGS — what the console asks before money leaves
   ------------------------------------------------------------
   Two dialogs, both on the shared .cm-overlay / .cm-card:

     refundDialog({ payment, request })   REFUND on a ledger row, or
                  APPROVE on a customer's request. Amount (rupees, full
                  by default), a reason that is REQUIRED, and the plain
                  warning that a refund ends the plan it bought. The
                  button is disabled while the call is in flight and the
                  error stays in the dialog, so a refused refund can be
                  corrected without retyping. Resolves to the edge
                  function's answer, or null when cancelled.
     declineDialog({ request })           DECLINE: a note the customer
                  will read. Resolves to the updated request or null.

   The server is the authority — rzp-refund re-checks the role, the
   payment and the amount — so nothing here is a gate, only a courtesy.
   No inline handlers; Escape cancels; focus is held by modal-focus.js.
   ============================================================ */
import { h } from '../lib/dom.js';
import Billing, { fmtPaise, parseRupees, planName } from '../lib/billing.js';
import { holdFocus, releaseFocus } from './modal-focus.js';
import '../styles/refunds.css';

const CATEGORY_TEXT = Object.fromEntries(Billing.REFUND_CATEGORIES);
export const categoryText = (c) => CATEGORY_TEXT[c] || c;

function open(card, labelId) {
  const m = h('div.cm-overlay.show.gt-overlay.rf-dialog', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': labelId }, [card]);
  document.body.append(m);
  holdFocus(m);
  return m;
}

export function refundDialog({ payment, request = null }) {
  return new Promise((resolve) => {
    const paid = payment.amount_paise;
    const who = payment.email || 'this customer';
    const reasonDefault = request ? `${categoryText(request.category)}${request.message ? ': ' + request.message : ''}`.slice(0, 500) : '';
    const err = h('p.gt-error', { role: 'alert', hidden: true });
    const amount = h('input.rf-amount', { id: 'rfAmount', name: 'amount', type: 'text', inputmode: 'decimal', value: String(paid / 100), 'aria-describedby': 'rfAmountHint' });
    const reason = h('textarea', { id: 'rfReason', name: 'reason', maxlength: 500, required: true, 'aria-required': 'true', placeholder: 'Duplicate charge, not delivered, …' });
    reason.value = reasonDefault;
    const go = h('button.btn.danger', { type: 'submit', text: 'REFUND' });
    const cancel = h('button.btn', { type: 'button', 'data-rf': 'cancel', text: 'CANCEL' });
    const form = h('form', { novalidate: true }, [
      h('label', { for: 'rfAmount', text: 'Amount to refund (₹)' }), amount,
      h('p#rfAmountHint.gt-meta', { text: `Up to ${fmtPaise(paid)}, which is what was paid. Leave it as it is to refund in full.` }),
      h('label', { for: 'rfReason', text: 'Reason (required, kept with the refund)' }), reason,
      h('p.rf-warn', { text: `This ends ${who}’s ${planName(payment.plan_id)} plan today, even for a partial amount, and it cannot be undone from here. Razorpay returns the money to the customer’s original payment method.` }),
      err,
      h('div.gt-actions', {}, [go, cancel])
    ]);
    const card = h('div.cm-card.gt-card', {}, [
      h('h2#rfHeading', { text: request ? 'Approve and refund?' : 'Refund this payment?' }),
      h('p.rf-facts', { text: `${who} · ${planName(payment.plan_id)} · paid ${fmtPaise(paid)}${payment.razorpay_payment_id ? ' · ' + payment.razorpay_payment_id : ''}` }),
      request ? h('p.rf-facts', { text: `They asked: ${categoryText(request.category)}${request.message ? ' — “' + request.message + '”' : ''}` }) : null,
      form
    ].filter(Boolean));
    let busy = false;
    const m = open(card, 'rfHeading');
    const done = (v) => { document.removeEventListener('keydown', onKey, true); releaseFocus(m); m.remove(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape' && !busy) { e.preventDefault(); done(null); } };
    document.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', () => { if (!busy) done(null); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      const fail = (t) => { err.textContent = t; err.hidden = false; };
      const raw = amount.value.trim();
      const paise = parseRupees(raw);
      if (paise === null || paise < 1 || paise > paid) { fail(`The amount is between ₹0.01 and ${fmtPaise(paid)}.`); amount.focus(); return; }
      const why = reason.value.trim();
      if (!why) { fail('Write the reason. It is kept with the refund.'); reason.focus(); return; }
      busy = true; err.hidden = true;
      go.disabled = true; cancel.disabled = true; amount.disabled = true; reason.disabled = true;
      go.textContent = 'REFUNDING…';
      try {
        const out = await Billing.admin.refund(payment.id, { amountPaise: paise === paid ? null : paise, reason: why, requestId: request ? request.id : null });
        busy = false; done(out);
      } catch (ex) {
        busy = false;
        go.disabled = false; cancel.disabled = false; amount.disabled = false; reason.disabled = false;
        go.textContent = 'REFUND';
        fail(ex.message || 'The refund did not go through. Nothing was refunded.');
      }
    });
    amount.focus();
  });
}

export function declineDialog({ request, email }) {
  return new Promise((resolve) => {
    const err = h('p.gt-error', { role: 'alert', hidden: true });
    const note = h('textarea', { id: 'rfNote', name: 'note', maxlength: 500, required: true, 'aria-required': 'true', placeholder: 'For example: this is outside the refund policy because …' });
    const go = h('button.btn.danger', { type: 'submit', text: 'DECLINE' });
    const cancel = h('button.btn', { type: 'button', text: 'CANCEL' });
    const form = h('form', { novalidate: true }, [
      h('label', { for: 'rfNote', text: 'Note to the customer (required)' }), note,
      err, h('div.gt-actions', {}, [go, cancel])
    ]);
    const card = h('div.cm-card.gt-card', {}, [
      h('h2#rfHeading', { text: 'Decline this request?' }),
      h('p.rf-facts', { text: `${email || 'The customer'} asked: ${categoryText(request.category)}${request.message ? ' — “' + request.message + '”' : ''}` }),
      h('p.rf-facts', { text: 'They will read your note on their Settings page. Nothing is refunded.' }),
      form
    ]);
    let busy = false;
    const m = open(card, 'rfHeading');
    const done = (v) => { document.removeEventListener('keydown', onKey, true); releaseFocus(m); m.remove(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape' && !busy) { e.preventDefault(); done(null); } };
    document.addEventListener('keydown', onKey, true);
    cancel.addEventListener('click', () => { if (!busy) done(null); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      const text = note.value.trim();
      if (!text) { err.textContent = 'Say why, in a sentence. The customer will read it.'; err.hidden = false; note.focus(); return; }
      busy = true; err.hidden = true; go.disabled = true; cancel.disabled = true; note.disabled = true; go.textContent = 'DECLINING…';
      try { const out = await Billing.admin.decideRefundRequest(request.id, 'declined', text); busy = false; done(out); }
      catch (ex) {
        busy = false; go.disabled = false; cancel.disabled = false; note.disabled = false; go.textContent = 'DECLINE';
        err.textContent = ex.message || 'The request was not declined.'; err.hidden = false;
      }
    });
    note.focus();
  });
}

export default { refundDialog, declineDialog, categoryText };
