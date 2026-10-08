/* ============================================================
   GROWTH PANELS — what a member sees under the plan cards
   ------------------------------------------------------------
   Drawn on settings.html#plan, under the cards, for a signed-in
   account (the host passes billing_status() and a rerender):

     Your referral code   (schema §22) the member's REF- code with a
                          COPY button, what it gives a friend and what
                          they earn, and their credits: owed and paid.
                          Shown only once they have paid for a plan.

   Each panel loads its own data on first draw and keeps it in this
   module's memory for the page — never in storage. A section that has
   not run on the database yet draws nothing rather than an error.

   No inline handlers (CSP): delegate() on [data-gr-action].
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { fmtPaise } from '../lib/billing.js';
import Growth, { isMissing } from '../lib/growth.js';
import '../styles/growth.css';

let rerender = () => {};
const S = { ref: { state: 'idle', data: null, error: '' } };
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');
const toast = (msg, type) => { if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, type ? { type } : undefined); };

function load(key, fn) {
  const slot = S[key];
  if (slot.state !== 'idle') return;
  slot.state = 'loading';
  fn().then((d) => { slot.data = d; slot.state = 'ready'; },
            (e) => { slot.state = isMissing(e) ? 'missing' : 'error'; slot.error = e.message || 'Could not load.'; })
    .finally(() => rerender());
}
/** Forget what was loaded, so the next draw asks again (after a purchase). */
export function refreshGrowthPanels() { for (const k of Object.keys(S)) S[k] = { state: 'idle', data: null, error: '' }; }

function referralPanel() {
  load('ref', Growth.myReferral);
  const r = S.ref;
  if (r.state !== 'ready' || !r.data || !r.data.eligible) return null;
  const d = r.data;
  const reward = Number.isInteger(d.reward_pct) ? `${d.reward_pct}% of what they pay` : Number.isInteger(d.reward_paise) ? `${fmtPaise(d.reward_paise)} per purchase` : 'a credit';
  const box = h('div.gr-panel', { 'data-gr-panel': 'referral' });
  box.append(h('h3.gt-h3', { text: 'Your referral code' }));
  box.append(h('div.gr-row', {}, [
    h('code.gr-code', { text: d.code }),
    h('button.btn', { type: 'button', 'data-gr-action': 'copy', 'data-copy': d.code, text: 'COPY' })
  ]));
  box.append(h('p.gr-meta', { text: `A friend who buys any plan with it gets ${d.percent_off}% off, and you earn ${reward} once their payment is confirmed. Credits are paid out by hand by the studio; your own purchases cannot use your code.` }));
  const credits = d.credits || [];
  box.append(h('p.gr-msg', { text: `Owed to you: ${fmtPaise(d.owed_paise || 0)} · paid out: ${fmtPaise(d.paid_paise || 0)} · used ${d.uses || 0} time${d.uses === 1 ? '' : 's'}` }));
  if (credits.length) {
    box.append(h('ul.gr-list', {}, credits.map((c) => h('li' + (c.status === 'void' ? '.is-off' : ''), {
      text: `${fmtDate(c.created_at)} — ${fmtPaise(c.amount_paise)} · ${c.status === 'owed' ? 'owed' : c.status === 'paid' ? 'paid ' + fmtDate(c.paid_at) : 'void (refunded)'}` }))));
  }
  return box;
}

/** Everything under the cards, in order. `st` is billing_status(). */
export function memberGrowthPanels(st, { rerender: rr } = {}) {
  if (rr) rerender = rr;
  if (!st) return null;
  const wrap = h('div.gr-wrap');
  for (const p of [referralPanel()]) if (p) wrap.append(p);
  return wrap.childNodes.length ? wrap : null;
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch (e) {
    /* No clipboard permission (an http preview, an old browser): a
       hidden textarea and execCommand, which still works there. */
    try {
      const ta = h('textarea', { 'aria-hidden': 'true' });
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e2) { return false; }
  }
}
delegate(document, 'click', '[data-gr-action="copy"]', async (e, el) => {
  const ok = await copyText(el.dataset.copy || '');
  toast(ok ? `Copied ${el.dataset.copy.length > 40 ? 'to the clipboard' : el.dataset.copy}.` : 'Could not copy — select the code and copy it by hand.', ok ? undefined : 'error');
});

export { copyText };
export default { memberGrowthPanels, refreshGrowthPanels };
