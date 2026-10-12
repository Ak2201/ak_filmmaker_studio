/* ============================================================
   GROWTH PANELS — what a member sees under the plan cards
   ------------------------------------------------------------
   Drawn on purchase.html#plan, under the cards, for a signed-in
   account (the host passes billing_status() and a rerender):

     Your referral code   (schema §22) the member's REF- code with a
                          COPY button, what it gives a friend and what
                          they earn, and their credits: owed and paid.
                          The code and the credits exist only once they
                          have paid for a plan; before that the same
                          spot carries one short "Refer a friend" line
                          saying so. COPY LINK hands a friend
                          /purchase?ref=<code>, which purchase.js reads.

   Each panel loads its own data on first draw and keeps it in this
   module's memory for the page — never in storage. A section that has
   not run on the database yet draws nothing rather than an error.

   No inline handlers (CSP): delegate() on [data-gr-action].
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { fmtPaise } from '../lib/billing.js';
import { BRAND_HOST } from '../lib/brand.js';
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

/* The link a member hands a friend. It opens the Purchase page with the
   code in the address; purchase.js reads it and puts it in the "Have a
   code?" box. `/purchase` rather than `/purchase.html`: the host answers
   the .html spelling with a 308 (CLAUDE.md, the cleanUrls trap), and a
   shared link should not depend on a redirect keeping its query. */
export function referralLink(code) {
  return 'https://' + BRAND_HOST + '/purchase?ref=' + encodeURIComponent(code);
}

const stat = (label, value) => h('div.gr-stat', {}, [
  h('span.gr-stat-label', { text: label }),
  h('span.gr-stat-figure', { text: value })
]);

/* NOT YET PAID: my_referral() answers { eligible: false, friend_pct }.
   One short explanation, so the code is not a surprise after the first
   purchase. Nothing here is a control, and no number is invented: the
   friend's discount is the one the server reports, or it is not named. */
function referralIntro(d) {
  const off = Number.isInteger(d.friend_pct) ? `${d.friend_pct}% off` : 'a discount';
  const box = h('div.gr-panel.gr-intro', { 'data-gr-panel': 'referral-intro', id: 'referral' });
  box.append(h('h3.gt-h3', { text: 'Refer a friend' }));
  box.append(h('p.gr-meta', { text: `Once you have bought a plan you get a referral code of your own. A friend who buys with it gets ${off}, and you earn a credit when their payment is confirmed.` }));
  return box;
}

function referralPanel() {
  load('ref', Growth.myReferral);
  const r = S.ref;
  if (r.state !== 'ready' || !r.data) return null;
  if (!r.data.eligible) return referralIntro(r.data);
  const d = r.data;
  const reward = Number.isInteger(d.reward_pct) ? `${d.reward_pct}% of what they pay` : Number.isInteger(d.reward_paise) ? `${fmtPaise(d.reward_paise)} per purchase` : 'a credit';
  const link = referralLink(d.code);
  const box = h('div.gr-panel.gr-referral', { 'data-gr-panel': 'referral', id: 'referral' });
  box.append(h('h3.gt-h3', { text: 'Your referral code' }));
  box.append(h('p.gr-lead', { text: `Share it with a friend. They get ${d.percent_off}% off any plan, and you earn ${reward} once their payment is confirmed.` }));
  box.append(h('div.gr-row', {}, [
    h('code.gr-code', { text: d.code }),
    h('button.btn', { type: 'button', 'data-gr-action': 'copy', 'data-copy': d.code, text: 'COPY' }),
    h('button.btn', { type: 'button', 'data-gr-action': 'copy', 'data-copy': link, 'aria-label': 'Copy a link that carries your code', text: 'COPY LINK' })
  ]));
  if (d.active === false) box.append(h('p.gr-msg.is-error', { role: 'status', text: 'This code is switched off at the moment, so a friend cannot use it.' }));
  box.append(h('p.gr-meta', { text: 'The link opens this page with your code already in the “Have a code?” box. Credits are paid out by hand by the studio; your own purchases cannot use your code.' }));
  const credits = d.credits || [];
  box.append(h('div.gr-stats', {}, [
    stat('Owed to you', fmtPaise(d.owed_paise || 0)),
    stat('Paid out', fmtPaise(d.paid_paise || 0)),
    stat('Used by friends', `${d.uses || 0} time${d.uses === 1 ? '' : 's'}`)
  ]));
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
