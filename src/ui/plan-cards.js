/* ============================================================
   PLAN CARDS — the three tiers, one price each, and a BUY button
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

   FULL-TIME ACCESS (schema section 18). A plan is bought once and kept
   for good, so there is no period switch, no "until", no renew and no
   extend: the current tier's card simply says so, and only HIGHER
   tiers offer a button. The period the host receives is always
   'lifetime'.

   No inline handlers (CSP). Everything is delegate() on
   [data-plan-action]; the host page passes `onBuy(planId, period)`.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import Billing, { fmtPaise, priceFor, cap, planName } from '../lib/billing.js';
import PlanGate, { CAPABILITIES } from '../lib/plan-gate.js';
import '../styles/plans.css';

const period = 'lifetime';     // the only period there is
let busyPlan = '';
let statusText = '';
let hooks = { onBuy: null, rerender: null };

const LIMIT_LINES = [
  ['projects',      (n) => n === null ? 'Unlimited cloud projects' : `${n} cloud project${n === 1 ? '' : 's'}`],
  ['collaborators', (n) => n === null ? 'Unlimited collaborators per film' : n === 0 ? 'No collaborators' : `${n} collaborator${n === 1 ? '' : 's'} per film`],
  ['shares',        (n) => n === null ? 'Unlimited share links' : n === 0 ? 'No share links' : `${n} live share link${n === 1 ? '' : 's'}`],
  ['seats',         (n) => n === null ? 'Unlimited organisation seats' : `${n} organisation seat${n === 1 ? '' : 's'}`]
];

/* WHAT A PLAN INCLUDES, counted from the console's Features matrix
   (plans.features, schema section 18): every built module plus the
   capabilities, except `sample_only`, which is a restriction and is
   said in words instead. A missing key is included (plan-gate.js reads
   it as allowed), so the count agrees with what the pages will do. */
function featureSummary(p) {
  const f = (p && p.features) || {};
  const incl = (key) => f[key] !== false;
  const stages = PlanGate.moduleCatalogue().map((s) => ({ label: s.label, items: s.modules.map((m) => ({ ...m, on: incl(m.id) })) }));
  const caps = CAPABILITIES.filter(([k]) => k !== 'sample_only').map(([k, label]) => ({ id: k, label, on: incl(k) }));
  const all = [...stages.flatMap((s) => s.items), ...caps];
  return { stages, caps, total: all.length, included: all.filter((x) => x.on).length, sampleOnly: f.sample_only === true };
}
function featureBlock(p) {
  const s = featureSummary(p);
  const wrap = h('div.pl-features');
  wrap.append(h('p.pl-features-n', {}, [h('strong', { text: `${s.included} of ${s.total}` }), h('span', { text: ' features' })]));
  if (s.sampleOnly) wrap.append(h('p.pl-features-note', { text: 'Sample project only' }));
  const det = h('details.pl-what', {}, [h('summary', { text: 'What’s included' })]);
  for (const st of s.stages) {
    const on = st.items.filter((i) => i.on);
    det.append(h('p.pl-what-stage', { text: `${st.label} · ${on.length} of ${st.items.length}` }));
    det.append(h('ul.pl-what-list', {}, st.items.map((i) => h('li' + (i.on ? '' : '.is-off'), { text: i.label }))));
  }
  det.append(h('p.pl-what-stage', { text: `Capabilities · ${s.caps.filter((c) => c.on).length} of ${s.caps.length}` }));
  det.append(h('ul.pl-what-list', {}, s.caps.map((c) => h('li' + (c.on ? '' : '.is-off'), { text: c.label }))));
  wrap.append(det);
  return wrap;
}

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
      h('span', { text: p.id === 'free' ? '' : price === null ? ' not for sale' : ' once · yours for good' })
    ]));
    card.append(limitList(p.limits));
    card.append(featureBlock(p));
    /* A button only where there is something to buy: a higher tier.
       The current tier says so instead, and a lower one offers nothing
       — paying to have less is not a thing this page will sell. */
    const higher = !current || Billing.planRank(p.id) > Billing.planRank(current);
    if (p.id !== 'free' && price !== null && higher) {
      const disabled = busyPlan !== '' || !Billing.paymentsConfigured() || (st && st.disabled);
      const label = busyPlan === p.id ? 'OPENING…' : current && current !== 'free' ? 'UPGRADE' : 'BUY';
      card.append(h('button.btn' + (!current || current === 'free' ? '.primary' : ''), {
        type: 'button', 'data-plan-action': 'buy', 'data-plan': p.id, disabled, text: label }));
    }
    if (isCurrent && p.id !== 'free') {
      card.append(h('p.pl-until', { text: 'Yours, for good. Nothing to renew.' }));
    }
    row.append(card);
  }
  wrap.append(row);
  if (!Billing.paymentsConfigured()) wrap.append(h('p.pl-note', { text: 'Payments are not switched on for this studio yet (no Razorpay key in this build).' }));
  if (st && st.disabled) wrap.append(h('p.pl-note', { text: 'This account has been disabled by an administrator, so it cannot buy a plan.' }));
  if (statusText) wrap.append(h('p.pl-status', { role: 'status', text: statusText }));
  wrap.append(h('p.pl-note', { text: 'One payment, full access for good — nothing recurs and nothing expires. Paid through Razorpay in INR; an invoice arrives from Razorpay by e-mail.' }));
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
