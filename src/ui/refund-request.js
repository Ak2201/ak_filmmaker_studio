/* ============================================================
   REQUEST A REFUND — the customer's side, on settings.html#plan
   ------------------------------------------------------------
   Drawn under the plan cards for a signed-in account, and ONLY when
     (1) the administrator has switched refund requests on, and
     (2) this account has a captured, unrefunded payment.
   Both are the server's answer (my_refund_status, schema section 27);
   nothing about either is remembered in this browser. Where section 27
   has not run, or the switch is off, nothing is drawn at all.

   The form files a REQUEST, never a refund: a reason category, some
   words, and the administrator decides. The block then shows the state
   of the latest request — pending, approved, declined (with the
   administrator's note) — and the form comes back only when a new
   request may be made. refund.html is the policy and is linked.

   No inline handlers (CSP): delegate() on [data-rf-action].
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import Billing, { fmtPaise, planName } from '../lib/billing.js';
import '../styles/refunds.css';
import '../styles/motion.css';

let rerender = () => {};
let faded = false;   // the panel fades in the first time it is drawn, never on a redraw
const S = { state: 'idle', data: null, busy: false, error: '', draft: { category: '', message: '' } };
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');
const toast = (msg, type) => { if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, type ? { type } : undefined); };

/** Ask the server again on the next draw (after a purchase).
 *  settings.js calls this after EVERY billing refresh, and one can land
 *  at any moment (an auth event, the gate answering). It used to clear
 *  the error and the data too, so a refresh arriving just after a
 *  submit wiped the "tell us what happened" message, and the re-render
 *  rebuilt the form empty under whatever the person had typed. The
 *  last answer stays drawn while the new one loads; the draft and the
 *  error are the person's, and only a send clears them. */
export function refreshRefundRequest() { if (S.state !== 'loading') S.state = 'idle'; }

function load() {
  if (S.state !== 'idle') return;
  S.state = 'loading';
  Billing.myRefundStatus().then((d) => { S.data = d; S.state = 'ready'; },
    () => { S.state = 'missing'; })   // section 27 not run, or the call failed: draw nothing
    .finally(() => rerender());
}

const WORDS = { pending: 'Waiting for the studio to look at it', approved: 'Approved — your refund is on its way', declined: 'Declined', refunded: 'Refunded' };

export function refundRequestPanel(opts = {}) {
  if (opts.rerender) rerender = opts.rerender;
  load();
  const d = S.data;
  if (!d || !d.enabled || !d.eligible || !d.payment) return null;
  const box = h('div.rf-block', { 'data-rf-panel': 'request' });
  if (!faded) { faded = true; box.classList.add('mo-in'); }
  box.append(h('h3.gt-h3', { text: 'Request a refund' }));
  box.append(h('p.rf-state', { text: `Your ${planName(d.payment.plan_id)} plan, ${fmtPaise(d.payment.amount_paise)}${d.payment.paid_at ? ', paid ' + fmtDate(d.payment.paid_at) : ''}. Purchases are final, except a duplicate charge, a charge where you did not receive what you paid for, or where the law requires. This sends a request; the studio decides, and a refund ends the plan.` }));
  const l = d.latest;
  if (l) {
    box.append(h('p.rf-state', { role: 'status' }, [
      `Your last request, ${fmtDate(l.created_at)}: `, h('span.rf-pill.is-' + l.status, { text: WORDS[l.status] || l.status })]));
    if (l.admin_note) box.append(h('p.rf-state', { text: `The studio wrote: ${l.admin_note}` }));
  }
  if (S.error) box.append(h('p.gt-error', { role: 'alert', text: S.error }));
  if (d.can_request) {
    const cat = h('select', { id: 'rfCategory', name: 'category', required: true }, Billing.REFUND_CATEGORIES.map(([v, t]) => h('option', { value: v, text: t })));
    const msg = h('textarea', { id: 'rfMessage', name: 'message', maxlength: 1000, placeholder: 'What happened? Include the date and anything that helps us find it.' });
    if (S.draft.category) cat.value = S.draft.category;
    msg.value = S.draft.message;
    const form = h('form.rf-form', { 'data-rf-form': 'request', novalidate: true }, [
      h('label', { for: 'rfCategory', text: 'Reason' }), cat,
      h('label', { for: 'rfMessage', text: 'Tell us more' }), msg,
      h('button.btn.primary', { type: 'submit', disabled: S.busy ? true : null, text: S.busy ? 'SENDING…' : 'SEND REQUEST' })
    ]);
    form.dataset.payment = d.payment.id;
    box.append(form);
  } else if (l && l.status === 'pending') {
    box.append(h('p.rf-state', { text: 'You do not need to do anything else. We will answer here.' }));
  }
  box.append(h('p.rf-state', {}, [h('a', { href: 'refund.html', text: 'Read the refund policy' })]));
  return box;
}

/* The draft survives a re-render (see refreshRefundRequest). */
delegate(document, 'input', '[data-rf-form="request"] textarea, [data-rf-form="request"] select', (e, el) => {
  S.draft[el.name] = el.value;
});
delegate(document, 'change', '[data-rf-form="request"] select', (e, el) => { S.draft[el.name] = el.value; });

delegate(document, 'submit', '[data-rf-form="request"]', async (e, form) => {
  e.preventDefault();
  if (S.busy) return;
  const f = new FormData(form);
  const category = String(f.get('category') || ''), message = String(f.get('message') || '').trim();
  if (category === 'other' && message.length < 5) { S.error = 'Tell us what happened, in a sentence or two.'; rerender(); return; }
  S.busy = true; S.error = ''; rerender();
  try {
    await Billing.requestRefund(form.dataset.payment, category, message);
    S.draft = { category: '', message: '' };
    // until the server's new answer lands, no second form to send twice from
    if (S.data) S.data = { ...S.data, can_request: false };
    toast('Request sent. We will answer on this page.', 'success');
  } catch (err) {
    S.error = err.message || 'The request was not sent.';
  }
  S.busy = false; S.state = 'idle';   // read the server's word again (the last answer stays drawn meanwhile)
  rerender();
});

export default { refundRequestPanel, refreshRefundRequest };
