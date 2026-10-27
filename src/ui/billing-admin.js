/* ============================================================
   BILLING ADMIN — plans & payments on the application console
   ------------------------------------------------------------
   Drawn by admin.html for an administrator (the server's role, as
   with every section there). Three things:

     the money    paid in the last 30 days and overall, who is on what,
                  grants, refunds
     the plans    every tier's name, blurb, its ONE price and five
                  limits, editable in place. Prices are typed in RUPEES
                  and sent as paise; a blank limit means unlimited.
                  Saving goes through admin_set_plan(), which validates
                  every key.
     the ledger   every payment, with a form to GRANT a plan without one
                  (a comp, a bank transfer) — recorded as a payment of
                  ₹0 so the ledger stays whole.

   A YEAR AT A TIME (schema section 52; section 18 had made plans for
   good): a bought plan runs 365 days and the ledger's Access column says
   "1 year · ends <date>". A GRANT from this console is still for good
   (no days to type), and reads "for good".

   PROMO CODES (schema section 20): a fourth block between the tiers
   and the grant — every code with its discount, its plans, uses
   against max, its window and its state, a DEACTIVATE / REACTIVATE per
   row, and a form to add one. Writes go through admin_set_promo_code()
   which re-checks the admin role; the table itself is closed to the
   browser, so the list comes from admin_list_promo_codes().

   PRICES IN US DOLLARS (docs/US-MARKET-PLAN.md §D, schema §56): at the
   top of the tiers block, the owner types each tier's DOLLAR price and,
   while the plan has a rise scheduled, the dollar figure it rises to (the
   date is the plan's own, shown read-only: one date per plan). Saved
   through admin_set_plan_price(plan, 'USD', cents, next, next_price_at),
   and the "Charge in US dollars" switch through admin_set_usd_checkout.
   Both are OWNER ONLY: an admin with another role sees the fields
   disabled and a note saying so, and the server refuses them anyway
   (42501). The current figures are read from price_notice('USD'), the
   same read the public makes; no dollar amount is typed in this file.

   No inline handlers; delegate() on [data-ba-action].
   ============================================================ */
import { errorSentence } from '../lib/gate.js';
import { h, delegate } from '../lib/dom.js';
import { fmtDate } from '../lib/admin-format.js';
import Billing, { fmtPaise, parseRupees, planName, promoLabel, normalisePromo, isPromoShaped } from '../lib/billing.js';
import { refundDialog, declineDialog, categoryText } from './refund-admin.js';
import { ask } from './dialog.js';
import { errorState } from './admin-kit.js';
import { usdCall } from '../lib/admin-api.js';
import { studioRole } from './admin-customer.js';
import { fmtMinor, parseMinor } from '../lib/price-model.js';
import { field as kField } from './kit/field.js';
import { button as kButton } from './kit/button.js';
import { check as kCheck } from './kit/field.js';
import { notice as kNotice } from './kit/notice.js';
import '../styles/plans.css';
import '../styles/refunds.css';

/* §31 / §56, OWNER ONLY (the server refuses anybody else, 42501). One
   plan's DOLLAR price and, while the plan has a rise scheduled, the
   dollar figure it rises to; cents. `at` is the plan's own next_price_at
   (one date per plan). And "Charge in US dollars", refused while any plan
   on sale lacks a dollar price. Both resolve to price_notice('USD').
   Here rather than on Billing.admin (CORE) so only the console pays for
   them in its first paint. */
const usdRpc = (name, args) => usdCall(window.StudioCloud || null, name, args);
const setUsdPrice = (planId, amountMinor, nextMinor, at) => usdRpc('admin_set_plan_price', {
  p_plan: planId, p_currency: 'USD', p_amount_minor: amountMinor, p_next_minor: nextMinor ?? null, p_at: at || null });
const setUsdCheckout = (on) => usdRpc('admin_set_usd_checkout', { p_on: !!on });

/* usd: price_notice('USD') (null: not answered), whether this admin is the
   owner, and whether §56 is on this database (the switch key present). */
const S = { usd: { notice: null, owner: false, busy: false, saved: '' }, loaded: false, busy: false, error: '', plans: [], payments: [], overview: {}, members: [], saved: '', granted: '', promos: [], promoMade: '', refunds: null, rreqs: null, rrEnabled: false, rrBusy: false };

/* A "Saved." note clears itself IN PLACE. Re-rendering for it rebuilt
   every form on the console from its defaults 2.5s after a save, under
   whatever the next form was being filled in with. */
function clearNote(text) {
  for (const n of document.querySelectorAll('.ba-saved')) if (n.textContent === text) n.remove();
}
let rerender = () => {};

const LIMIT_FIELDS = [
  ['projects', 'Cloud projects'], ['collaborators', 'Collaborators / film'], ['shares', 'Live share links'], ['seats', 'Org seats']
];
/* An amount in the ROW's currency (§56: every *_paise column holds minor
   units of that row's `currency`; a row without one is rupees). */
const money = (minor, row) => fmtMinor(minor || 0, row && row.currency === 'USD' ? 'USD' : 'INR');
/* "Intl card": Razorpay said the card was issued abroad (§56 C4). Recorded
   and shown, never blocked or re-priced. */
const intlBadge = (p) => (p && p.international === true
  ? h('span.st-badge.ba-intl', { title: p.card_country ? 'Card issued in ' + p.card_country : 'Card issued outside India', text: 'Intl card' + (p.card_country ? ' · ' + p.card_country : '') })
  : null);

async function load() {
  S.busy = true; S.error = ''; rerender();
  try {
    const [plans, payments, overview] = await Promise.all([Billing.refreshPlans(), Billing.admin.listPayments(200), Billing.admin.overview()]);
    S.plans = plans; S.payments = payments; S.overview = overview || {};
    // Section 20 may not have run yet; the rest of the console must not wait on it.
    /* Members' own referral codes (schema section 22) are listed on the
       Growth tab, by referrer; this table is the codes the owner made. */
    try { S.promos = (await Billing.admin.listPromoCodes()).filter((c) => c.kind !== 'referral'); } catch (e) { S.promos = null; }
    /* Refunds (schema section 27). null = the section has not run here: the
       REFUND buttons and the requests block simply do not draw. */
    try {
      const [refunds, rreqs, on] = await Promise.all([Billing.admin.listRefunds(), Billing.admin.listRefundRequests(), Billing.refundRequestsEnabled()]);
      S.refunds = refunds; S.rreqs = rreqs; S.rrEnabled = on;
    } catch (e) { S.refunds = null; S.rreqs = null; }
    /* The dollar prices (§31 / §56). Never holds up the rest: a database
       without §56 answers without `usd_checkout`, and the block says so. */
    try {
      const [notice, role] = await Promise.all([Billing.priceNotice('USD').catch(() => null), studioRole().catch(() => null)]);
      S.usd.notice = notice; S.usd.owner = role === 'owner';
    } catch (e) { S.usd.notice = null; }
    // The grant form needs people to pick from; the gate's console already
    // lists members, so borrow that list rather than add a fourth RPC.
    try {
      const c = window.StudioCloud;
      S.members = c && c.gate ? await c.gate.admin.listMembers() : [];
    } catch (e) { S.members = []; }
    S.loaded = true;
  } catch (e) {
    S.error = errorSentence(e, 'The billing console could not load.');
  } finally {
    S.busy = false; rerender();
  }
}

/* `part` splits the one section into three blocks of the console's Purchases tab:
   'payments' (the money, refund requests, the ledger — id #billing, so
   every selector that named it still lands), 'promos' (#promos) and
   'tiers' (the tiers and the grant form, #tiers). With no `part` it is
   the whole section as before. All three read the one shared state S. */
export function billingAdminSection(section, st, { part } = {}) {
  if (!st || !st.deployed || st.role !== 'admin') return null;
  const want = (k) => !part || part === k;
  const sec = part === 'promos'
    ? section('promos', 'Promo codes', 'Promo codes.', 'Discount and affiliate codes. A code is checked by the server on every quote and every order.')
    : part === 'tiers'
      ? section('tiers', 'Tiers & grants', 'Tiers and grants.', 'What each tier costs and allows, and a way to grant a plan by hand. Prices change on the next purchase; nobody’s running plan is touched by an edit.')
      : section('billing', 'Billing', part ? 'Payments and refunds.' : 'Plans and payments.',
        part ? 'What has been paid, by whom, and the refund requests waiting for an answer.' : 'What each tier costs and allows, who has paid for what, and a way to grant a plan by hand. Prices change on the next purchase; nobody’s running plan is touched by an edit.');
  if (!S.loaded && !S.busy && !S.error) load();
  if (S.error && !S.loaded) {
    sec.append(errorState({ title: 'Purchases could not load', why: S.error, onRetry: () => load() }));
    return sec;
  }
  if (S.error) sec.append(h('p.gt-error', { role: 'alert', text: S.error }));
  if (!S.loaded) { sec.append(h('p.gt-meta', { text: S.busy ? 'Loading…' : '' })); return sec; }

  // The money
  if (want('payments')) {
  const o = S.overview;
  const by = o.active_by_plan || {};
  /* The console's one stat tile (admin.css .ad-stat), not a second kind. */
  const grid = h('div.ad-stats.ba-grid');
  const stat = (v, l, sub) => grid.append(h('div.k-stat.ad-stat', {}, [h('span.k-stat-value.ad-stat-n', { text: v }), h('span.k-stat-label.ad-stat-l', { text: l }), sub ? h('span.k-stat-note.ad-stat-sub', { text: sub }) : null].filter(Boolean)));
  /* §56: paid_*_paise are RUPEES ONLY; dollars are in paid_by_currency
     and never added to them (no exchange rate is used anywhere). */
  const usdPaid = o.paid_by_currency && o.paid_by_currency.USD;
  stat(fmtPaise(o.paid_30d_paise || 0), 'paid, last 30 days', usdPaid && usdPaid.count ? 'rupees · plus ' + fmtMinor(usdPaid.d30_minor || 0, 'USD') : null);
  stat(fmtPaise(o.paid_total_paise || 0), 'paid, all time', usdPaid && usdPaid.count ? 'rupees · plus ' + fmtMinor(usdPaid.total_minor || 0, 'USD') + ' (' + usdPaid.count + ' in dollars)' : null);
  stat(String(o.payments_30d || 0), 'payments, 30 days');
  stat(String(['starter', 'indie', 'pro'].reduce((t, p) => t + (by[p] || 0), 0)), 'on a paid plan', ['starter', 'indie', 'pro'].map((p) => `${by[p] || 0} ${planName(p)}`).join(' · '));
  stat(String(S.payments.filter((p) => p.status === 'granted').length), 'granted by hand');
  stat(String(o.refunds || 0), 'refunds');
  if (Number.isInteger(o.intl_cards)) stat(String(o.intl_cards), 'paid with a card issued abroad');
  sec.append(grid);
  }

  // The plans
  if (want('tiers')) {
  sec.append(usdBlock());
  sec.append(h('h3.gt-h3', { text: 'Plans & prices' }));
  const list = h('div.ba-plans');
  for (const p of S.plans) {
    const form = h('form.ba-plan', { 'data-ba-form': 'plan', 'data-plan': p.id });
    form.append(h('div.ba-plan-head', {}, [
      h('strong', { text: p.name }), h('span.gt-meta', { text: p.id === 'free' ? 'free · the no-plan state: what a trial or a lapsed member has; never sold or shown as a plan' : p.id }),
      p.active ? null : h('span.st-badge', { text: 'not for sale' })
    ].filter(Boolean)));
    const fields = h('div.ba-fields');
    const field = (name, label, control) => fields.append(h('div.ba-field' + (name === 'blurb' ? '.is-wide' : ''), {}, [h('label', { for: `ba_${p.id}_${name}`, text: label }), control]));
    field('name', 'Name', h('input', { id: `ba_${p.id}_name`, name: 'name', type: 'text', maxlength: 40, value: p.name }));
    if (p.id !== 'free') {
      const price = Number.isInteger(p.price_paise) ? p.price_paise : p.yearly_paise;
      field('price', 'Price (₹, a year)', h('input', { id: `ba_${p.id}_price`, name: 'price', type: 'text', inputmode: 'decimal', value: price ? String(price / 100) : '', placeholder: 'not for sale' }));
    }
    for (const [key, label] of LIMIT_FIELDS) {
      const v = p.limits && Number.isInteger(p.limits[key]) ? String(p.limits[key]) : '';
      field(key, label, h('input', { id: `ba_${p.id}_${key}`, name: key, type: 'number', min: 0, step: 1, value: v, placeholder: 'unlimited' }));
    }
    const ext = h('select', { id: `ba_${p.id}_extension`, name: 'extension' }, [h('option', { value: 'true', text: 'Included' }), h('option', { value: 'false', text: 'Not included' })]);
    ext.value = p.limits && p.limits.extension ? 'true' : 'false';
    field('extension', 'Chrome extension', ext);
    if (p.id !== 'free') {
      const act = h('select', { id: `ba_${p.id}_active`, name: 'active' }, [h('option', { value: 'true', text: 'For sale' }), h('option', { value: 'false', text: 'Hidden' })]);
      act.value = p.active ? 'true' : 'false';
      field('active', 'Listing', act);
    }
    field('blurb', 'One line', h('input', { id: `ba_${p.id}_blurb`, name: 'blurb', type: 'text', maxlength: 200, value: p.blurb || '' }));
    form.append(fields);
    form.append(h('div.ba-actions', {}, [
      h('button.btn.primary', { type: 'submit', text: 'SAVE ' + p.name.toUpperCase() }),
      S.saved === p.id ? h('span.ba-saved', { role: 'status', text: 'Saved.' }) : null
    ].filter(Boolean)));
    list.append(form);
  }
  sec.append(list);
  sec.append(h('p.gt-meta', { text: 'Price in ₹ for a year (schema §52). A blank limit is unlimited.' }));
  }

  // Promo codes (section 20)
  if (want('promos')) {
  sec.append(h('h3.gt-h3', { text: `Promo codes${S.promos ? ` (${S.promos.length})` : ''}` }));
  if (S.promos === null) sec.append(h('p.gt-meta', { text: 'Promo codes are not available on this database yet (schema section 20 has not run).' }));
  else {
    if (!S.promos.length) sec.append(h('p.gt-meta', { text: 'No codes yet.' }));
    else {
      const table = h('table.gt-table');
      table.append(h('thead', {}, [h('tr', {}, ['Code', 'Discount', 'Plans', 'Used', 'Valid', 'State', 'Note', ''].map((t) => h('th', { scope: 'col', text: t })))]));
      const tb = h('tbody');
      for (const c of S.promos) {
        const live = c.active && !(c.valid_until && Date.parse(c.valid_until) <= Date.now()) && !(Number.isInteger(c.max_uses) && c.uses >= c.max_uses);
        tb.append(h('tr' + (live ? '' : '.is-off'), { 'data-promo': c.code }, [
          h('td', {}, [h('code.gt-codeval', { text: c.code })]),
          h('td', { text: promoLabel(c) + (c.commission_pct != null ? ` · ${Number(c.commission_pct)}% commission` : '') }),
          h('td', { text: c.plan_ids && c.plan_ids.length ? c.plan_ids.map(planName).join(', ') : 'every plan' }),
          h('td', { text: `${c.uses}${Number.isInteger(c.max_uses) ? ' of ' + c.max_uses : ''}` }),
          h('td', { text: (c.valid_from ? 'from ' + fmtDate(c.valid_from) + ' ' : '') + (c.valid_until ? 'until ' + fmtDate(c.valid_until) : c.valid_from ? '' : 'no end') }),
          h('td', { text: !c.active ? 'inactive' : c.valid_until && Date.parse(c.valid_until) <= Date.now() ? 'expired' : Number.isInteger(c.max_uses) && c.uses >= c.max_uses ? 'used up' : 'live' }),
          h('td', { text: c.note || '' }),
          h('td', {}, [h('button.btn', { type: 'button', 'data-ba-action': 'promo-toggle', 'data-code': c.code, 'data-active': c.active ? 'true' : 'false', text: c.active ? 'DEACTIVATE' : 'REACTIVATE' })])
        ]));
      }
      table.append(tb);
      sec.append(h('div.gt-scroll', {}, [table]));
    }
    /* THE DRAFT SURVIVES A REFRESH. load() calls rerender() twice —
       once when it starts and once when the three network calls come
       back — and either can land while somebody is part-way through
       typing a code. The inputs below are rebuilt on every render, so
       without this the typed values are simply gone, and the submit
       that follows sends a half-filled form.

       Exactly the bug already fixed for the refund-request form in
       settings.js ("a background billing refresh no longer wipes the
       form"), which prove:billing caught then as two failures in three
       runs. This one it caught the same way, in block (m): the
       affiliate code came out with no commission and the row the proof
       waited for never appeared. */
    const d = S.promoDraft || (S.promoDraft = {});
    const keep = (name, extra) => Object.assign(
      { name, value: d[name] != null ? d[name] : '' }, extra || {});
    const pf = h('form.ba-promo', { 'data-ba-form': 'promo', autocomplete: 'off' });
    pf.addEventListener('input', (ev) => {
      const t = ev.target;
      if (t && t.name && t.type !== 'checkbox') d[t.name] = t.value;
    });
    pf.append(h('strong', { text: 'Add a code' }));
    const kind = h('select', { id: 'baPromoKind', name: 'kind', value: d.kind || 'percent' }, [h('option', { value: 'percent', text: '% off' }), h('option', { value: 'amount', text: '₹ off' })]);
    pf.append(h('div.ba-fields', {}, [
      h('div.ba-field', {}, [h('label', { for: 'baPromoCode', text: 'Code' }), h('input', keep('code', { id: 'baPromoCode', type: 'text', maxlength: 32, autocapitalize: 'characters', spellcheck: 'false', placeholder: 'LAUNCH10', required: true }))]),
      h('div.ba-field', {}, [h('label', { for: 'baPromoKind', text: 'Discount' }), kind]),
      h('div.ba-field', {}, [h('label', { for: 'baPromoValue', text: 'Value (% or ₹)' }), h('input', keep('value', { id: 'baPromoValue', type: 'text', inputmode: 'decimal', placeholder: '10', required: true }))]),
      h('div.ba-field', {}, [h('label', { for: 'baPromoMax', text: 'Max uses' }), h('input', keep('max_uses', { id: 'baPromoMax', type: 'number', min: 1, step: 1, placeholder: 'unlimited' }))]),
      h('div.ba-field', {}, [h('label', { for: 'baPromoUntil', text: 'Valid until' }), h('input', keep('valid_until', { id: 'baPromoUntil', type: 'date' }))]),
      h('div.ba-field', {}, [h('label', { for: 'baPromoComm', text: 'Commission % (affiliate)' }), h('input', keep('commission', { id: 'baPromoComm', type: 'text', inputmode: 'decimal', placeholder: 'none' }))]),
      h('div.ba-field.is-wide', {}, [h('label', { for: 'baPromoNote', text: 'Note (who it is for, where it was printed)' }), h('input', keep('note', { id: 'baPromoNote', type: 'text', maxlength: 300 }))])
    ]));
    const paid = S.plans.filter((p) => p.id !== 'free');
    pf.append(h('div.ba-promo-plans', {}, [h('span.gt-meta', { text: 'Applies to:' }), ...paid.map((p) => h('label', {}, [
      h('input', { type: 'checkbox', name: 'plan', value: p.id, checked: true }), h('span', { text: p.name || planName(p.id) })]))]));
    pf.append(h('div.ba-actions', {}, [h('button.btn', { type: 'submit', text: 'ADD CODE' }), S.promoMade ? h('span.ba-saved', { role: 'status', text: S.promoMade }) : null].filter(Boolean)));
    pf.append(h('p.gt-meta', { text: 'Counted when a payment confirms. Never below ₹1 — to give a plan away, grant it.' }));
    sec.append(pf);
  }
  }

  // Grant
  if (want('tiers')) {
  sec.append(h('h3.gt-h3', { text: 'Grant a plan' }));
  const g = h('form.ba-grant', { 'data-ba-form': 'grant' });
  const who = h('select', { id: 'baGrantWho', name: 'who' }, [h('option', { value: '', text: 'Choose a member…' }),
    ...S.members.map((m) => h('option', { value: m.user_id, text: m.email + (m.disabled_at ? ' (disabled)' : '') }))]);
  const plan = h('select', { id: 'baGrantPlan', name: 'plan' }, S.plans.filter((p) => p.id !== 'free').map((p) => h('option', { value: p.id, text: p.name })));
  g.append(h('div.ba-fields', {}, [
    h('div.ba-field', {}, [h('label', { for: 'baGrantWho', text: 'Who' }), who]),
    h('div.ba-field', {}, [h('label', { for: 'baGrantPlan', text: 'Plan' }), plan]),
    h('div.ba-field.is-wide', {}, [h('label', { for: 'baGrantNote', text: 'Why (bank transfer, comp…)' }), h('input', { id: 'baGrantNote', name: 'note', type: 'text', maxlength: 300 })])
  ]));
  g.append(h('div.ba-actions', {}, [h('button.btn', { type: 'submit', text: 'GRANT' }), S.granted ? h('span.ba-saved', { role: 'status', text: S.granted }) : null].filter(Boolean)));
  g.append(h('p.gt-meta', { text: 'For good (a grant has no end date); admits a non-member; recorded as a ₹0 payment.' }));
  sec.append(g);
  }

  // Ledger
  if (want('payments')) {
  sec.append(h('h3.gt-h3', { text: `Payments (${S.payments.length})` }));
  if (!S.payments.length) sec.append(h('p.gt-meta', { text: 'No payments yet.' }));
  else {
    const table = h('table.gt-table.ba-ledger');
    /* A refund removes that payment's own year (mark_payment_refunded
       shortens accounts.plan_until) while the row keeps its ends_at, so
       a refunded row printing "1 year · ends …" claimed access that is
       gone. */
    const accessCell = (p) => p.status === 'refunded' ? 'year removed (refunded)'
      : p.ends_at ? (p.period === 'grant' ? 'grant' : '1 year') + ' · ends ' + fmtDate(p.ends_at) : 'for good';
    table.append(h('thead', {}, [h('tr', {}, ['When', 'Who', 'Plan', 'Access', 'Amount', 'Code', 'Status', 'Razorpay', ...(S.refunds ? [''] : [])].map((t) => h('th', { scope: 'col', text: t })))]));
    const tb = h('tbody');
    for (const p of S.payments) {
      const rf = S.refunds ? S.refunds.filter((r) => r.payment_id === p.id && r.status !== 'failed') : [];
      const inflight = rf.find((r) => r.status === 'initiated' || r.status === 'pending');
      tb.append(h('tr', {}, [
        h('td', { text: fmtDate(p.paid_at || p.created_at) }),
        h('td', {}, [h('span', { text: p.email }), p.account_name ? h('br') : null, p.account_name ? h('span.gt-meta', { text: p.account_name }) : null].filter(Boolean)),
        h('td', { text: planName(p.plan_id) }),
        h('td', { text: accessCell(p) }),
        h('td', {}, [h('span', { text: p.status === 'granted' ? '₹0 (grant)' : money(p.amount_paise, p) + (p.credit_paise > 0 ? ` (upgrade; ${money(p.credit_paise, p)} already paid)` : '') }),
          intlBadge(p)].filter(Boolean)),
        h('td', { text: p.promo_code ? `${p.promo_code} (${money(p.discount_paise || 0, p)} off)` : '—' }),
        h('td', { text: p.status + (inflight ? ' · refund ' + inflight.status : '') + (p.note ? ' — ' + p.note : '') }),
        h('td', {}, [h('code.gt-codeval', { text: p.razorpay_payment_id || p.razorpay_order_id || '—' })]),
        S.refunds ? h('td', {}, [p.status === 'paid' && p.razorpay_payment_id && p.amount_paise > 0 && !inflight
          ? h('button.btn.danger', { type: 'button', 'data-ba-action': 'refund', 'data-id': p.id, 'aria-label': `Refund ${p.email}, ${planName(p.plan_id)}, ${money(p.amount_paise, p)}`, text: 'REFUND' })
          : null].filter(Boolean)) : null
      ].filter(Boolean)));
    }
    table.append(tb);
    sec.append(h('div.gt-scroll', {}, [table]));
  }
  }
  // Refund requests (schema section 27), after the ledger they refer to
  if (want('payments') && S.rreqs) sec.append(refundBlock());
  if (want('payments')) sec.append(h('button.btn.ad-refresh', { type: 'button', 'data-ba-action': 'reload', text: 'REFRESH' }));
  return sec;
}

/* ---- prices in US dollars (§D) ------------------------------------ */
/** The dollar figures a plan has: { amount, next } in cents, each null
 *  when not set. display_minor is the dollar price only when the notice
 *  says the display currency IS dollars (a plan with no dollar row falls
 *  back to its rupees there). */
export function usdFigures(notice, planId) {
  const row = notice && Array.isArray(notice.plans) ? notice.plans.find((p) => p && p.id === planId) : null;
  if (!row || row.display_currency !== 'USD') return { amount: null, next: null };
  return {
    amount: Number.isInteger(row.display_minor) && row.display_minor > 0 ? row.display_minor : null,
    next: Number.isInteger(row.display_next_minor) && row.display_next_minor > 0 ? row.display_next_minor : null
  };
}
const dollars = (cents) => (Number.isInteger(cents) && cents > 0 ? (cents % 100 ? (cents / 100).toFixed(2) : String(cents / 100)) : '');
function usdBlock() {
  const U = S.usd;
  const n = U.notice;
  const known = !!n && typeof n.usd_checkout === 'boolean';   // §56's key, present to be believed
  const on = known && n.usd_checkout === true;
  const box = h('div.ba-usd', { id: 'usdPrices' });
  box.append(h('h3.gt-h3', { text: 'Prices in US dollars' }));
  if (!n) { box.append(h('p.gt-meta', { text: 'The dollar prices could not be read (price_notice did not answer).' })); return box; }
  if (!U.owner) box.append(kNotice({ tone: 'info', body: 'Only the owner can change dollar prices or the US dollar checkout. The fields below are shown for reference and are disabled.' }));
  if (!known) box.append(kNotice({ tone: 'warn', body: 'This database has not run schema §56, so dollar prices are display figures only and every order is charged in rupees.' }));
  const sw = kCheck({ label: 'Charge in US dollars', checked: on, attrs: { id: 'baUsdSwitch', 'data-ba-action': 'usd-switch', disabled: !U.owner || !known || U.busy ? '' : null } });
  box.append(h('div.ba-usd-switch', {}, [sw, h('p.gt-meta', { text: on
    ? 'On: a visitor shown dollars is charged the dollar price. Rupee buyers are unchanged.'
    : 'Off: visitors outside India see the dollar prices and are told they will be charged the rupee price.' })]));
  const plans = S.plans.filter((p) => p.id !== 'free' && p.active && Number(p.price_paise) > 0);
  const list = h('div.ba-plans.ba-usd-list');
  for (const p of plans) {
    const f = usdFigures(n, p.id);
    const at = p.next_price_at || null;
    const form = h('form.ba-usd-plan', { 'data-ba-form': 'usd-price', 'data-usd-plan': p.id, 'data-at': at || '' });
    form.append(h('div.ba-plan-head', {}, [h('strong', { text: p.name || planName(p.id) }),
      h('span.gt-meta', { text: f.amount ? 'now ' + fmtMinor(f.amount, 'USD') + (f.next ? ' · rises to ' + fmtMinor(f.next, 'USD') : '') : 'not sold in dollars' })]));
    const dis = !U.owner || U.busy ? '' : null;
    form.append(h('div.ba-fields', {}, [
      kField({ label: 'USD price ($, a year)', id: `ba_${p.id}_usd`, name: 'usd', value: dollars(f.amount), placeholder: 'not sold in dollars', attrs: { inputmode: 'decimal', disabled: dis } }),
      kField({ label: 'USD next price ($)', id: `ba_${p.id}_usdnext`, name: 'usdnext', value: dollars(f.next), placeholder: at ? 'no dollar rise' : 'no rise scheduled',
        attrs: { inputmode: 'decimal', disabled: !at || dis !== null ? '' : null } }),
      kField({ label: 'Rise date (the plan’s own)', id: `ba_${p.id}_usdat`, name: 'at', value: at ? fmtDate(at) : 'none scheduled', attrs: { readonly: '', disabled: '' } })
    ]));
    form.append(h('div.ba-actions', {}, [
      kButton({ label: 'Save ' + (p.name || planName(p.id)) + ' in dollars', variant: 'primary', type: 'submit', disabled: !U.owner || U.busy }),
      U.saved === p.id ? h('span.ba-saved', { role: 'status', text: 'Saved.' }) : null
    ].filter(Boolean)));
    list.append(form);
  }
  box.append(list);
  box.append(h('p.gt-meta', { text: 'Typed in US dollars for a year. Blank means not sold in dollars (only while the switch is off). The smallest dollar price is one dollar (Razorpay’s minimum charge). A next price must be a rise, on the date the rupee rise is scheduled (set it under Growth).' }));
  return box;
}

/* The switch, and the requests customers have filed. A refund itself
   is rzp-refund; APPROVE opens the same dialog the ledger's REFUND does. */
function refundBlock() {
  const box = h('div.rf-admin', { id: 'refunds' });
  box.append(h('h3.gt-h3', { text: `Refund requests (${S.rreqs.filter((r) => r.status === 'pending').length} waiting)` }));
  box.append(h('label.rf-switch', { for: 'baRefundSwitch' }, [
    h('input', { id: 'baRefundSwitch', type: 'checkbox', 'data-ba-action': 'refund-switch', checked: S.rrEnabled, disabled: S.rrBusy }),
    h('span', { text: 'Let customers request refunds from the Purchase page' })
  ]));
  box.append(h('p.gt-meta', { text: 'A request refunds nothing until you approve it. Policy: refund.html.' }));
  if (!S.rreqs.length) { box.append(h('p.gt-meta', { text: 'No requests yet.' })); return box; }
  const table = h('table.gt-table.rf-requests');
  table.append(h('thead', {}, [h('tr', {}, ['When', 'Who', 'Payment', 'Why', 'State', ''].map((t) => h('th', { scope: 'col', text: t })))]));
  const tb = h('tbody');
  for (const r of S.rreqs) {
    const open = (r.status === 'pending' || r.status === 'approved') && r.payment_status === 'paid';
    tb.append(h('tr', { 'data-rreq': r.id }, [
      h('td', { text: fmtDate(r.created_at) }),
      h('td', { text: r.email }),
      h('td', { text: `${planName(r.plan_id)} · ${money(r.amount_paise, r.currency ? r : S.payments.find((x) => x.id === r.payment_id))}` + (r.payment_status !== 'paid' ? ` · ${r.payment_status}` : '') }),
      h('td', {}, [h('strong', { text: categoryText(r.category) }), r.message ? h('p.rf-msg', { text: r.message }) : null].filter(Boolean)),
      h('td', {}, [h('span.rf-pill.is-' + r.status, { text: r.status }), r.admin_note ? h('p.rf-msg', { text: r.admin_note }) : null].filter(Boolean)),
      h('td', {}, open ? [h('div.rf-btns', {}, [
        h('button.btn.danger', { type: 'button', 'data-ba-action': 'rreq-approve', 'data-id': r.id, 'aria-label': `Approve and refund ${r.email}`, text: 'APPROVE' }),
        r.status === 'pending' ? h('button.btn', { type: 'button', 'data-ba-action': 'rreq-decline', 'data-id': r.id, 'aria-label': `Decline the request from ${r.email}`, text: 'DECLINE' }) : null
      ].filter(Boolean))] : [])
    ]));
  }
  table.append(tb);
  box.append(h('div.gt-scroll', {}, [table]));
  return box;
}

const refundToast = (out) => toast(out.status === 'processed'
  ? `Refunded ${money(out.amount_paise, out)} to ${out.email || 'the customer'}. Their plan has ended.`
  : `Refund of ${money(out.amount_paise, out)} sent to Razorpay for ${out.email || 'the customer'}. It is pending; their plan ends when Razorpay confirms.`, 'success');

export function wireBillingAdmin(render) { rerender = render || (() => {}); }
/** What the console's Overview reads: the money, once loaded. Null until then. */
export function billingSnapshot() {
  if (!S.loaded) return null;
  /* Refund requests still waiting for an answer (the same test the table uses), for the console's nav badge. */
  const refundRequestsPending = (S.rreqs || []).filter((r) => r.status === 'pending' && r.payment_status === 'paid').length;
  return { overview: S.overview || {}, payments: S.payments, refundRequestsPending };
}

const toast = (msg, type) => { if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, type ? { type } : undefined); };

delegate(document, 'submit', '[data-ba-form="plan"]', async (e, form) => {
  e.preventDefault();
  const id = form.dataset.plan;
  const f = new FormData(form);
  const patch = { name: f.get('name'), blurb: f.get('blurb') };
  if (id !== 'free') {
    const raw = String(f.get('price') || '').trim();
    if (raw === '') patch.price_paise = 0;
    else {
      const paise = parseRupees(raw);
      if (paise === null) { toast(`"${raw}" is not a rupee amount.`, 'error'); return; }
      patch.price_paise = paise;
    }
    patch.active = f.get('active') === 'true';
  }
  const limits = {};
  for (const [k] of LIMIT_FIELDS) { const v = String(f.get(k) || '').trim(); limits[k] = v === '' ? null : Math.max(0, parseInt(v, 10) || 0); }
  limits.extension = f.get('extension') === 'true';
  patch.limits = limits;
  try {
    await Billing.admin.setPlan(id, patch);
    S.saved = id;
    await load();
    setTimeout(() => { S.saved = ''; clearNote('Saved.'); }, 2500);
  } catch (err) { toast(errorSentence(err, 'The plan was not saved.'), 'error'); }
});

delegate(document, 'submit', '[data-ba-form="grant"]', async (e, form) => {
  e.preventDefault();
  const f = new FormData(form);
  const who = f.get('who');
  if (!who) { toast('Choose who the grant is for.', 'error'); return; }
  try {
    await Billing.admin.grantPlan(who, f.get('plan'), 0, f.get('note'));   // 0 days: a grant is for good (§52 honours days; this form offers none)
    S.granted = 'Granted — full access, for good.';
    await load();
  } catch (err) { toast(errorSentence(err, 'The grant did not go through.'), 'error'); }
});

delegate(document, 'submit', '[data-ba-form="promo"]', async (e, form) => {
  e.preventDefault();
  const f = new FormData(form);
  const code = normalisePromo(f.get('code'));
  if (!isPromoShaped(code)) { toast('A code is 3 to 32 letters, digits or dashes.', 'error'); return; }
  const patch = { note: String(f.get('note') || '').trim() || null };
  const raw = String(f.get('value') || '').trim();
  if (f.get('kind') === 'percent') {
    const pct = parseInt(raw, 10);
    if (!(pct >= 1 && pct <= 100) || String(pct) !== raw) { toast(`"${raw}" is not a whole percentage from 1 to 100.`, 'error'); return; }
    patch.percent_off = pct;
  } else {
    const paise = parseRupees(raw);
    if (!paise) { toast(`"${raw}" is not a rupee amount.`, 'error'); return; }
    patch.amount_off_paise = paise;
  }
  const max = String(f.get('max_uses') || '').trim();
  patch.max_uses = max === '' ? null : Math.max(1, parseInt(max, 10) || 1);
  const until = String(f.get('valid_until') || '').trim();
  // The date input gives a calendar day; the code is good through the END of it.
  patch.valid_until = until ? new Date(until + 'T23:59:59').toISOString() : null;
  const plans = f.getAll('plan').map(String);
  const all = [...form.querySelectorAll('input[name="plan"]')].length;
  patch.plan_ids = plans.length && plans.length < all ? plans : null;
  /* An affiliate code (schema section 23) is a promo code with a
     commission; revenue and commission due are derived on the Growth tab. */
  const comm = String(f.get('commission') || '').trim();
  if (comm) {
    const n = Number(comm);
    if (!(n > 0 && n <= 100) || !/^\d+(\.\d{1,2})?$/.test(comm)) { toast(`"${comm}" is not a commission from 0.01 to 100%.`, 'error'); return; }
    patch.commission_pct = n;
  }
  if (!plans.length) { toast('Tick at least one plan the code applies to.', 'error'); return; }
  try {
    const row = await Billing.admin.setPromoCode(code, patch);
    S.promoMade = `Added ${row && row.code ? row.code : code}.`;
    /* The draft is kept across a REFRESH, not across a SAVE: clear it
       here or the form comes back still carrying the code that was just
       added, and the next one is edited on top of the last. */
    S.promoDraft = {};
    await load();
    { const made = S.promoMade; setTimeout(() => { if (S.promoMade === made) S.promoMade = ''; clearNote(made); }, 2500); }
  } catch (err) { toast(errorSentence(err, 'The code was not saved.'), 'error'); }
});

delegate(document, 'click', '[data-ba-action="promo-toggle"]', async (e, el) => {
  try {
    await Billing.admin.setPromoCode(el.dataset.code, { active: el.dataset.active !== 'true' });
    await load();
  } catch (err) { toast(errorSentence(err, 'The code was not changed.'), 'error'); }
});

delegate(document, 'click', '[data-ba-action="refund"]', async (e, el) => {
  const payment = S.payments.find((p) => p.id === el.dataset.id);
  if (!payment) return;
  el.disabled = true;
  try {
    const out = await refundDialog({ payment });
    if (out) { refundToast(out); await load(); }
  } finally { el.disabled = false; }
});
delegate(document, 'click', '[data-ba-action="rreq-approve"]', async (e, el) => {
  const request = (S.rreqs || []).find((r) => r.id === el.dataset.id);
  const payment = request && S.payments.find((p) => p.id === request.payment_id);
  if (!request || !payment) { toast('That payment is not in the ledger’s latest 200 rows. Refund it from the ledger once it is.', 'error'); return; }
  el.disabled = true;
  try {
    const out = await refundDialog({ payment, request });
    if (out) { refundToast(out); await load(); }
  } finally { el.disabled = false; }
});
delegate(document, 'click', '[data-ba-action="rreq-decline"]', async (e, el) => {
  const request = (S.rreqs || []).find((r) => r.id === el.dataset.id);
  if (!request) return;
  el.disabled = true;
  try {
    const out = await declineDialog({ request, email: request.email });
    if (out) { toast('Declined. The customer will see your note.', 'success'); await load(); }
  } finally { el.disabled = false; }
});
delegate(document, 'change', '[data-ba-action="refund-switch"]', async (e, el) => {
  S.rrBusy = true; el.disabled = true;
  try {
    S.rrEnabled = await Billing.admin.setRefundRequestsEnabled(el.checked);
    toast(S.rrEnabled ? 'Customers can now request refunds from Settings.' : 'Refund requests are off. Customers no longer see the form.', 'success');
  } catch (err) { S.rrEnabled = !el.checked; toast(errorSentence(err, 'The switch was not changed.'), 'error'); }
  S.rrBusy = false; rerender();
});

delegate(document, 'submit', '[data-ba-form="usd-price"]', async (e, form) => {
  e.preventDefault();
  if (!S.usd.owner || S.usd.busy) return;
  const id = form.dataset.usdPlan;
  const f = new FormData(form);
  const raw = String(f.get('usd') || '').trim();
  const rawNext = String(f.get('usdnext') || '').trim();
  const amount = raw === '' ? 0 : parseMinor(raw, 'USD');
  if (amount === null) { toast(`"${raw}" is not a dollar amount.`, 'error'); return; }
  const next = rawNext === '' ? null : parseMinor(rawNext, 'USD');
  if (next === null && rawNext !== '') { toast(`"${rawNext}" is not a dollar amount.`, 'error'); return; }
  const at = next === null ? null : (form.dataset.at || null);
  const name = planName(id);
  const go = await ask({ title: `Change ${name}’s dollar price?`,
    body: amount ? `${name} will be ${fmtMinor(amount, 'USD')} a year in dollars` + (next ? `, rising to ${fmtMinor(next, 'USD')} on the plan’s rise date.` : '.') + ' It is charged in dollars only while “Charge in US dollars” is on.'
      : `${name} will not be sold in dollars.`,
    confirm: 'Save price' });
  if (!go) return;
  S.usd.busy = true; rerender();
  try {
    S.usd.notice = await setUsdPrice(id, amount, next, at) || S.usd.notice;
    S.usd.saved = id;
    setTimeout(() => { S.usd.saved = ''; clearNote('Saved.'); }, 2500);
  } catch (err) { toast(errorSentence(err, 'The dollar price was not saved.'), 'error'); }
  S.usd.busy = false; rerender();
});
delegate(document, 'change', '[data-ba-action="usd-switch"]', async (e, el) => {
  const want = el.checked;
  el.checked = !want;                     // nothing moves until the owner says yes
  if (!S.usd.owner || S.usd.busy) return;
  const go = await ask(want
    ? { title: 'Charge in US dollars?', body: 'Visitors shown dollar prices will be charged in US dollars. Razorpay must have International payments enabled on the account first, or those payments will fail.', confirm: 'Turn on' }
    : { title: 'Stop charging in US dollars?', body: 'Visitors outside India will still see dollar prices, and will be charged the rupee price at checkout.', confirm: 'Turn off' });
  if (!go) return;
  S.usd.busy = true; rerender();
  try {
    S.usd.notice = await setUsdCheckout(want) || S.usd.notice;
    toast(want ? 'Dollar checkout is on.' : 'Dollar checkout is off. Every order is in rupees.', 'success');
  } catch (err) { toast(errorSentence(err, 'The switch was not changed.'), 'error'); }
  S.usd.busy = false; rerender();
});

delegate(document, 'click', '[data-ba-action="reload"]', () => load());

export default { billingAdminSection, wireBillingAdmin };
