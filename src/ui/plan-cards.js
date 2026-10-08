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

   PROMO CODES (schema section 20). "Have a code?" under the row: APPLY
   asks quote_order() for every plan the row can sell, and a card whose
   quote came back ok reprices itself — the discounted figure large,
   the list price struck beside it. A refused code prints the server's
   sentence. The code then rides on BUY; the server re-quotes it when
   it makes the order, and the client sends no price, ever. The code
   lives in this module's memory for the page and in no storage.

   No inline handlers (CSP). Everything is delegate() on
   [data-plan-action]; the host page passes `onBuy(planId, period,
   onStatus, code)`.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import Billing, { fmtPaise, priceFor, cap, planName, normalisePromo } from '../lib/billing.js';
import PlanGate, { CAPABILITIES } from '../lib/plan-gate.js';
import '../styles/plans.css';
import '../styles/growth.css';

const period = 'lifetime';     // the only period there is
let busyPlan = '';
let statusText = '';
let hooks = { onBuy: null, rerender: null };
/* The code as typed, the quotes it earned (plan id -> quote_order()
   answer), a sentence when it was refused, and whether the box is open. */
const promo = { typed: '', code: '', quotes: {}, error: '', busy: false, open: false };
const appliedQuote = (planId) => { const q = promo.quotes[planId]; return q && q.ok && q.code ? q : null; };

/* UPGRADE BY PAYING THE DIFFERENCE (schema section 21). For somebody who
   has already paid, the server prices a higher tier as its list price
   less what they paid; the cards ask quote_order() for each buyable
   tier once per (plan held, payments) state and print the answer. The
   arithmetic is the server's — this only shows it. A promo quote
   already includes the credit, so it wins when both exist. */
const upg = { key: '', quotes: {}, busy: false };
const upgradeQuote = (planId) => { const q = upg.quotes[planId]; return q && q.ok && q.credit_paise > 0 ? q : null; };
function loadUpgradeQuotes(st, ids) {
  const paid = ((st && st.payments) || []).filter((p) => p.status === 'paid').length;
  if (!st || st.plan === 'free' || !paid || !ids.length) { upg.key = ''; upg.quotes = {}; return; }
  const key = `${st.plan}:${paid}:${ids.join(',')}`;
  if (upg.key === key || upg.busy) return;
  upg.busy = true; upg.key = key;
  Promise.all(ids.map((id) => Billing.quote(id, null).then((q) => [id, q], () => [id, null])))
    .then((answers) => { upg.quotes = Object.fromEntries(answers); })
    .finally(() => { upg.busy = false; if (hooks.rerender) hooks.rerender(); });
}

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

function limitList(limits, features) {
  const ul = h('ul.pl-limits');
  for (const [key, text] of LIMIT_LINES) ul.append(h('li', { text: text(cap(limits, key)) }));
  ul.append(h('li', { text: limits && limits.extension ? 'Chrome extension included' : 'Chrome extension not included' }));
  const f = features || {};
  const items = ['Local work'];
  if (f.drive_backup !== false) items.push('Drive backup');
  if (f.ai_tools !== false) items.push('AI tools (your own key)');
  const said = items.length > 1 ? items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1] : items[0];
  ul.append(h('li', { text: said + (items.length > 1 ? ' are' : ' is') + ' included' }));
  return ul;
}

/** `st` is billing_status() or null (signed out / unknown). */
export function planCards(plans, st, { onBuy, rerender, compact = false } = {}) {
  hooks = { onBuy: onBuy || hooks.onBuy, rerender: rerender || hooks.rerender };
  const wrap = h('div.pl-wrap' + (compact ? '.is-compact' : ''));
  const current = st ? st.plan : null;

  const row = h('div.pl-row');
  const buyable = [];
  for (const p of plans.filter((x) => x.active || x.id === current)) {
    const isCurrent = p.id === current;
    const price = priceFor(p, period);
    const pq = appliedQuote(p.id);
    const uq = upgradeQuote(p.id);
    const q = pq || uq;
    const card = h('article.pl-card' + (isCurrent ? '.is-current' : '') + (p.id === 'free' ? '.is-free' : '') + (pq ? '.has-promo' : '') + (q && q.credit_paise > 0 ? '.is-upgrade' : ''), { 'data-plan': p.id });
    card.append(h('p.bd-eyebrow', { text: isCurrent ? 'Your plan' : p.id === 'free' ? 'Baseline' : ' ' }));
    card.append(h('h3.pl-name', { text: p.name || planName(p.id) }));
    card.append(h('p.pl-blurb', { text: p.blurb || '' }));
    card.append(h('p.pl-price', {}, [
      h('strong', { text: p.id === 'free' ? '₹0' : price === null ? '—' : fmtPaise(q ? q.amount_paise : price) }),
      q ? h('s.pl-list', { text: fmtPaise(q.list_paise), 'aria-label': 'list price ' + fmtPaise(q.list_paise) }) : null,
      h('span', { text: p.id === 'free' ? '' : price === null ? ' not for sale' : ' once · yours for good' })
    ].filter(Boolean)));
    if (q && q.credit_paise > 0) card.append(h('p.pl-upgrade', { text: `Upgrade to ${p.name || planName(p.id)} — ${fmtPaise(q.amount_paise)} (you paid ${fmtPaise(q.paid_paise || q.credit_paise)} for ${q.upgrade_from_name || planName(q.upgrade_from)})` }));
    if (pq && pq.discount_paise > 0) card.append(h('p.pl-save', { text: `${fmtPaise(pq.discount_paise)} off with ${pq.code}` }));
    card.append(limitList(p.limits, p.features));
    card.append(featureBlock(p));
    /* A button only where there is something to buy: a higher tier.
       The current tier says so instead, and a lower one offers nothing
       — paying to have less is not a thing this page will sell. */
    const higher = !current || Billing.planRank(p.id) > Billing.planRank(current);
    if (p.id !== 'free' && price !== null && higher) {
      buyable.push(p.id);
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
  loadUpgradeQuotes(st, buyable);
  if (buyable.length && Billing.paymentsConfigured() && !(st && st.disabled)) wrap.append(promoBox(buyable));
  if (!Billing.paymentsConfigured()) wrap.append(h('p.pl-note', { text: 'Payments are not available yet. Please check back soon.' }));
  if (st && st.disabled) wrap.append(h('p.pl-note', { text: 'This account has been disabled by an administrator, so it cannot buy a plan.' }));
  if (statusText) wrap.append(h('p.pl-status', { role: 'status', text: statusText }));
  wrap.append(h('p.pl-note', { text: 'One payment, full access for good — nothing recurs and nothing expires. Paid through Razorpay in INR; an invoice arrives from Razorpay by e-mail.' }));
  wrap.append(h('p.pl-note.pl-legal', {}, [
    'By paying you agree to the ',
    h('a', { href: 'terms.html', text: 'Terms of Service' }),
    ' and the ',
    h('a', { href: 'refund.html', text: 'Refund & Cancellation Policy' }),
    '. See also our ',
    h('a', { href: 'privacy.html', text: 'Privacy Policy' }),
    '.'
  ]));
  return wrap;
}

/* "Have a code?" — a disclosure so the row reads as prices first and an
   offer second. `buyable` is the plan ids the row has a button for; the
   quote is asked for each, because a code may apply to some and not
   others, and the box says which. */
function promoBox(buyable) {
  const det = h('details.pl-promo', { 'data-plan-promo': '', ...(promo.open ? { open: true } : {}) });
  det.append(h('summary', { text: 'Have a code?' }));
  const form = h('form.pl-promo-form', { 'data-plan-form': 'promo', autocomplete: 'off' });
  form.append(h('label.pl-promo-label', { for: 'plPromoCode', text: 'Promo code' }));
  const input = h('input#plPromoCode.pl-promo-input', { type: 'text', name: 'code', inputmode: 'text', autocapitalize: 'characters', spellcheck: 'false',
    maxlength: 40, placeholder: 'e.g. LAUNCH10', 'aria-describedby': 'plPromoHint', value: promo.typed, disabled: promo.busy || busyPlan !== '' });
  form.append(input);
  form.append(h('button.btn', { type: 'submit', disabled: promo.busy || busyPlan !== '', text: promo.busy ? 'CHECKING…' : promo.code ? 'RE-CHECK' : 'APPLY' }));
  if (promo.code) form.append(h('button.btn', { type: 'button', 'data-plan-action': 'promo-clear', disabled: promo.busy || busyPlan !== '', text: 'REMOVE' }));
  det.append(form);
  const applied = buyable.filter((id) => appliedQuote(id));
  if (promo.error) det.append(h('p#plPromoHint.pl-promo-msg.is-error', { role: 'alert', text: promo.error }));
  else if (promo.code && applied.length) det.append(h('p#plPromoHint.pl-promo-msg', { role: 'status',
    text: `${promo.code} applied to ${applied.map((id) => planName(id)).join(', ')}. The price above is what you will pay.` }));
  else det.append(h('p#plPromoHint.pl-promo-msg', { text: 'Spaces and case do not matter. The discount shows on the card before you pay.' }));
  return det;
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
    const q = appliedQuote(el.dataset.plan);
    await hooks.onBuy(el.dataset.plan, period, (t) => { statusText = t; if (hooks.rerender) hooks.rerender(); }, q ? q.code : null);
    statusText = '';
  } catch (err) {
    statusText = err && err.message ? err.message : 'The payment did not complete.';
  } finally {
    busyPlan = '';
    if (hooks.rerender) hooks.rerender();
  }
});

/* The box's own state: a details element is rebuilt on every rerender,
   so whether it is open is remembered here rather than read back. */
delegate(document, 'toggle', '[data-plan-promo]', (e, el) => { promo.open = el.open; }, true);

delegate(document, 'submit', '[data-plan-form="promo"]', async (e, form) => {
  e.preventDefault();
  if (promo.busy || busyPlan) return;
  const typed = String(new FormData(form).get('code') || '');
  const code = normalisePromo(typed);
  promo.typed = typed; promo.error = ''; promo.quotes = {}; promo.code = ''; promo.open = true;
  if (!code) { if (hooks.rerender) hooks.rerender(); return; }
  promo.busy = true;
  if (hooks.rerender) hooks.rerender();
  try {
    const ids = [...document.querySelectorAll('.pl-card [data-plan-action="buy"]')].map((b) => b.dataset.plan);
    const answers = await Promise.all(ids.map((id) => Billing.quote(id, code).then((q) => [id, q], (err) => [id, { ok: false, reason: 'error', sentence: err.message || 'The code could not be checked.' }])));
    const quotes = Object.fromEntries(answers);
    const okIds = ids.filter((id) => quotes[id] && quotes[id].ok && quotes[id].code);
    if (okIds.length) { promo.quotes = quotes; promo.code = code; }
    else {
      /* Every plan refused it. Prefer the reason that is about the CODE
         over "not for this plan", which only says which card. */
      const refusals = ids.map((id) => quotes[id]).filter(Boolean);
      const pick = refusals.find((q) => q.reason !== 'not_for_plan') || refusals[0];
      promo.error = pick && pick.sentence ? pick.sentence : 'That code cannot be used.';
    }
  } finally {
    promo.busy = false;
    if (hooks.rerender) hooks.rerender();
  }
});

delegate(document, 'click', '[data-plan-action="promo-clear"]', () => {
  promo.typed = ''; promo.code = ''; promo.quotes = {}; promo.error = ''; promo.open = true;
  if (hooks.rerender) hooks.rerender();
});

export default { planCards, usageList };
