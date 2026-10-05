/* ============================================================
   PLAN CARDS — the three tiers, a period switch, and a BUY button
   ------------------------------------------------------------
   One component, drawn on settings.html (a member choosing or
   renewing) and on invite.html (a signed-in stranger buying their way
   in — PAYING GRANTS ENTRY). The prices and limits come from the plans
   table, so what the console saves is what this shows; nothing here
   names a number.

   Limits are written as sentences, not icons, and every card says the
   same five things in the same order so the eye can compare down the
   row. A number that is null is "unlimited". The free row is shown
   too, as the baseline, with no button.

   No inline handlers (CSP). Everything is delegate() on
   [data-plan-action]; the host page passes `onBuy(planId, period)`.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import Billing, { fmtPaise, priceFor, cap, planName } from '../lib/billing.js';
import '../styles/plans.css';

let period = 'year';           // in memory only; a page preference, not a fact
let busyPlan = '';
let statusText = '';
let hooks = { onBuy: null, rerender: null };

const LIMIT_LINES = [
  ['projects',      (n) => n === null ? 'Unlimited cloud projects' : `${n} cloud project${n === 1 ? '' : 's'}`],
  ['collaborators', (n) => n === null ? 'Unlimited collaborators per film' : n === 0 ? 'No collaborators' : `${n} collaborator${n === 1 ? '' : 's'} per film`],
  ['shares',        (n) => n === null ? 'Unlimited share links' : n === 0 ? 'No share links' : `${n} live share link${n === 1 ? '' : 's'}`],
  ['seats',         (n) => n === null ? 'Unlimited organisation seats' : `${n} organisation seat${n === 1 ? '' : 's'}`]
];

function limitList(limits) {
  const ul = h('ul.pl-limits');
  for (const [key, text] of LIMIT_LINES) ul.append(h('li', { text: text(cap(limits, key)) }));
  ul.append(h('li', { text: limits && limits.extension ? 'Chrome extension included' : 'Chrome extension not included' }));
  ul.append(h('li', { text: 'Local work, Drive backup and AI tools (your own key) on every plan' }));
  return ul;
}

/** `st` is billing_status() or null (signed out / unknown). */
export function planCards(plans, st, { onBuy, rerender, compact = false } = {}) {
  hooks = { onBuy: onBuy || hooks.onBuy, rerender: rerender || hooks.rerender };
  const wrap = h('div.pl-wrap' + (compact ? '.is-compact' : ''));
  const current = st ? st.plan : null;

  const sw = h('div.pl-period', { role: 'group', 'aria-label': 'Billing period' });
  [['month', 'MONTHLY'], ['year', 'YEARLY']].forEach(([p, label]) => sw.append(h('button.btn' + (period === p ? '.is-on' : ''), {
    type: 'button', 'data-plan-action': 'period', 'data-period': p, 'aria-pressed': String(period === p), text: label })));
  wrap.append(sw);

  const row = h('div.pl-row');
  for (const p of plans.filter((x) => x.active || x.id === current)) {
    const isCurrent = p.id === current;
    const price = priceFor(p, period);
    const card = h('article.pl-card' + (isCurrent ? '.is-current' : '') + (p.id === 'free' ? '.is-free' : ''), { 'data-plan': p.id });
    card.append(h('p.bd-eyebrow', { text: isCurrent ? 'Your plan' : p.id === 'free' ? 'Baseline' : ' ' }));
    card.append(h('h3.pl-name', { text: p.name || planName(p.id) }));
    card.append(h('p.pl-blurb', { text: p.blurb || '' }));
    card.append(h('p.pl-price', {}, [
      h('strong', { text: p.id === 'free' ? '₹0' : price === null ? '—' : fmtPaise(price) }),
      h('span', { text: p.id === 'free' ? '' : price === null ? `not sold ${period}ly` : period === 'year' ? ' / year' : ' / month' })
    ]));
    if (period === 'year' && p.monthly_paise > 0 && p.yearly_paise > 0 && p.yearly_paise < p.monthly_paise * 12) {
      card.append(h('p.pl-save', { text: `Saves ${fmtPaise(p.monthly_paise * 12 - p.yearly_paise)} a year` }));
    }
    card.append(limitList(p.limits));
    if (p.id !== 'free' && price !== null) {
      const disabled = busyPlan !== '' || !Billing.paymentsConfigured() || (st && st.disabled);
      const label = busyPlan === p.id ? 'OPENING…'
        : isCurrent ? (st && st.lapsed ? 'RENEW' : 'EXTEND')
        : current && Billing.planRank(p.id) < Billing.planRank(current) ? 'SWITCH'
        : current && current !== 'free' ? 'UPGRADE' : 'BUY';
      card.append(h('button.btn' + (isCurrent || !current || current === 'free' ? '.primary' : ''), {
        type: 'button', 'data-plan-action': 'buy', 'data-plan': p.id, disabled, text: label }));
    }
    if (isCurrent && st && st.plan_until) {
      card.append(h('p.pl-until', { text: (st.lapsed ? 'Lapsed on ' : 'Until ') + new Date(st.plan_until).toLocaleDateString(undefined, { dateStyle: 'medium' }) }));
    }
    row.append(card);
  }
  wrap.append(row);
  if (!Billing.paymentsConfigured()) wrap.append(h('p.pl-note', { text: 'Payments are not switched on for this studio yet (no Razorpay key in this build).' }));
  if (st && st.disabled) wrap.append(h('p.pl-note', { text: 'This account has been disabled by an administrator, so it cannot buy a plan.' }));
  if (statusText) wrap.append(h('p.pl-status', { role: 'status', text: statusText }));
  wrap.append(h('p.pl-note', { text: 'Prepaid, no auto-renewal. A month is 30 days and a year 365; renewing early adds to the days you have. Paid through Razorpay in INR; an invoice arrives from Razorpay by e-mail.' }));
  return wrap;
}

/** Usage against the current plan, for the settings page. */
export function usageList(st) {
  if (!st) return null;
  const u = st.usage || {};
  const lim = st.limits || {};
  const ul = h('ul.pl-usage');
  const line = (label, used, key) => {
    const c = cap(lim, key);
    const full = c !== null && used >= c;
    ul.append(h('li' + (full ? '.is-full' : ''), { text: `${label}: ${used}${c === null ? '' : ' of ' + c}${full ? ' — at the limit' : ''}` }));
  };
  line('Cloud projects', u.projects || 0, 'projects');
  line('Live share links', u.shares || 0, 'shares');
  line('Most collaborators on one film', u.collaborators || 0, 'collaborators');
  line('Organisation seats used', u.seats || 0, 'seats');
  return ul;
}

delegate(document, 'click', '[data-plan-action="period"]', (e, el) => {
  period = el.dataset.period;
  if (hooks.rerender) hooks.rerender();
});
delegate(document, 'click', '[data-plan-action="buy"]', async (e, el) => {
  if (!hooks.onBuy || busyPlan) return;
  busyPlan = el.dataset.plan; statusText = '';
  if (hooks.rerender) hooks.rerender();
  try {
    await hooks.onBuy(el.dataset.plan, period, (t) => { statusText = t; if (hooks.rerender) hooks.rerender(); });
    statusText = '';
  } catch (err) {
    statusText = err && err.message ? err.message : 'The payment did not complete.';
  } finally {
    busyPlan = '';
    if (hooks.rerender) hooks.rerender();
  }
});

export default { planCards, usageList };
