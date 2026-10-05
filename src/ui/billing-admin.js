/* ============================================================
   BILLING ADMIN — plans & payments on the application console
   ------------------------------------------------------------
   Drawn by admin.html for an administrator (the server's role, as
   with every section there). Three things:

     the money    paid in the last 30 days and overall, who is on what,
                  who lapses within a fortnight, refunds
     the plans    every tier's name, blurb, both prices and five limits,
                  editable in place. Prices are typed in RUPEES and sent
                  as paise; a blank limit means unlimited. Saving goes
                  through admin_set_plan(), which validates every key.
     the ledger   every payment, with a form to GRANT a plan without one
                  (a comp, a bank transfer) — recorded as a payment of
                  ₹0 so the ledger stays whole.

   No inline handlers; delegate() on [data-ba-action].
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import Billing, { fmtPaise, parseRupees, planName } from '../lib/billing.js';
import '../styles/plans.css';

const S = { loaded: false, busy: false, error: '', plans: [], payments: [], overview: {}, members: [], saved: '', granted: '' };
let rerender = () => {};

const LIMIT_FIELDS = [
  ['projects', 'Cloud projects'], ['collaborators', 'Collaborators / film'], ['shares', 'Live share links'], ['seats', 'Org seats']
];
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');

async function load() {
  S.busy = true; S.error = ''; rerender();
  try {
    const [plans, payments, overview] = await Promise.all([Billing.refreshPlans(), Billing.admin.listPayments(200), Billing.admin.overview()]);
    S.plans = plans; S.payments = payments; S.overview = overview || {};
    // The grant form needs people to pick from; the gate's console already
    // lists members, so borrow that list rather than add a fourth RPC.
    try {
      const c = window.StudioCloud;
      S.members = c && c.gate ? await c.gate.admin.listMembers() : [];
    } catch (e) { S.members = []; }
    S.loaded = true;
  } catch (e) {
    S.error = e.message || 'The billing console could not load.';
  } finally {
    S.busy = false; rerender();
  }
}

export function billingAdminSection(section, st) {
  if (!st || !st.deployed || st.role !== 'admin') return null;
  const sec = section('billing', 'Billing', 'Plans and payments.',
    'What each tier costs and allows, who has paid for what, and a way to grant a plan by hand. Prices change on the next purchase; nobody’s running plan is touched by an edit.');
  if (!S.loaded && !S.busy && !S.error) load();
  if (S.error) sec.append(h('p.gt-error', { role: 'alert', text: S.error }));
  if (!S.loaded) { sec.append(h('p.gt-meta', { text: S.busy ? 'Loading…' : '' })); return sec; }

  // The money
  const o = S.overview;
  const by = o.active_by_plan || {};
  const grid = h('div.ba-grid');
  const stat = (v, l) => grid.append(h('div.ba-stat', {}, [h('strong', { text: v }), h('span', { text: l })]));
  stat(fmtPaise(o.paid_30d_paise || 0), 'paid, last 30 days');
  stat(fmtPaise(o.paid_total_paise || 0), 'paid, all time');
  stat(String(o.payments_30d || 0), 'payments, 30 days');
  stat(['starter', 'indie', 'pro'].map((p) => `${by[p] || 0} ${planName(p)}`).join(' · '), 'organisations on a paid plan');
  stat(String(o.lapsing_14d || 0), 'lapsing within 14 days');
  stat(String(o.refunds || 0), 'refunds');
  sec.append(grid);

  // The plans
  sec.append(h('h3.gt-h3', { text: 'Tiers' }));
  const list = h('div.ba-plans');
  for (const p of S.plans) {
    const form = h('form.ba-plan', { 'data-ba-form': 'plan', 'data-plan': p.id });
    form.append(h('div.ba-plan-head', {}, [
      h('strong', { text: p.name }), h('span.gt-meta', { text: p.id }),
      p.active ? null : h('span.st-badge', { text: 'not for sale' })
    ].filter(Boolean)));
    const fields = h('div.ba-fields');
    const field = (name, label, control) => fields.append(h('div.ba-field' + (name === 'blurb' ? '.is-wide' : ''), {}, [h('label', { for: `ba_${p.id}_${name}`, text: label }), control]));
    field('name', 'Name', h('input', { id: `ba_${p.id}_name`, name: 'name', type: 'text', maxlength: 40, value: p.name }));
    if (p.id !== 'free') {
      field('monthly', 'Monthly (₹)', h('input', { id: `ba_${p.id}_monthly`, name: 'monthly', type: 'text', inputmode: 'decimal', value: p.monthly_paise ? String(p.monthly_paise / 100) : '' , placeholder: 'not sold' }));
      field('yearly', 'Yearly (₹)', h('input', { id: `ba_${p.id}_yearly`, name: 'yearly', type: 'text', inputmode: 'decimal', value: p.yearly_paise ? String(p.yearly_paise / 100) : '', placeholder: 'not sold' }));
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
  sec.append(h('p.gt-meta', { text: 'A blank limit means unlimited. Prices are in rupees and stored to the paisa; the free tier has no price by rule.' }));

  // Grant
  sec.append(h('h3.gt-h3', { text: 'Grant a plan' }));
  const g = h('form.ba-grant', { 'data-ba-form': 'grant' });
  const who = h('select', { id: 'baGrantWho', name: 'who' }, [h('option', { value: '', text: 'Choose a member…' }),
    ...S.members.map((m) => h('option', { value: m.user_id, text: m.email + (m.disabled_at ? ' (disabled)' : '') }))]);
  const plan = h('select', { id: 'baGrantPlan', name: 'plan' }, S.plans.filter((p) => p.id !== 'free').map((p) => h('option', { value: p.id, text: p.name })));
  g.append(h('div.ba-fields', {}, [
    h('div.ba-field', {}, [h('label', { for: 'baGrantWho', text: 'Who' }), who]),
    h('div.ba-field', {}, [h('label', { for: 'baGrantPlan', text: 'Plan' }), plan]),
    h('div.ba-field', {}, [h('label', { for: 'baGrantDays', text: 'Days' }), h('input', { id: 'baGrantDays', name: 'days', type: 'number', min: 1, max: 3660, value: '30' })]),
    h('div.ba-field.is-wide', {}, [h('label', { for: 'baGrantNote', text: 'Why (bank transfer, comp…)' }), h('input', { id: 'baGrantNote', name: 'note', type: 'text', maxlength: 300 })])
  ]));
  g.append(h('div.ba-actions', {}, [h('button.btn', { type: 'submit', text: 'GRANT' }), S.granted ? h('span.ba-saved', { role: 'status', text: S.granted }) : null].filter(Boolean)));
  g.append(h('p.gt-meta', { text: 'A grant makes the member an organisation owner on that plan for the days given, extends an existing run of the same tier, and admits a non-member. It is recorded as a ₹0 payment.' }));
  sec.append(g);

  // Ledger
  sec.append(h('h3.gt-h3', { text: `Payments (${S.payments.length})` }));
  if (!S.payments.length) sec.append(h('p.gt-meta', { text: 'No payments yet.' }));
  else {
    const table = h('table.gt-table');
    table.append(h('thead', {}, [h('tr', {}, ['When', 'Who', 'Plan', 'Period', 'Amount', 'Status', 'Ends', 'Razorpay'].map((t) => h('th', { scope: 'col', text: t })))]));
    const tb = h('tbody');
    for (const p of S.payments) {
      tb.append(h('tr', {}, [
        h('td', { text: fmtDate(p.paid_at || p.created_at) }),
        h('td', {}, [h('span', { text: p.email }), p.account_name ? h('br') : null, p.account_name ? h('span.gt-meta', { text: p.account_name }) : null].filter(Boolean)),
        h('td', { text: planName(p.plan_id) }),
        h('td', { text: p.period }),
        h('td', { text: p.status === 'granted' ? '₹0 (grant)' : fmtPaise(p.amount_paise) }),
        h('td', { text: p.status + (p.note ? ' — ' + p.note : '') }),
        h('td', { text: fmtDate(p.ends_at) }),
        h('td', {}, [h('code.gt-codeval', { text: p.razorpay_payment_id || p.razorpay_order_id || '—' })])
      ]));
    }
    table.append(tb);
    sec.append(h('div.gt-scroll', {}, [table]));
  }
  sec.append(h('button.btn', { type: 'button', 'data-ba-action': 'reload', text: 'REFRESH' }));
  return sec;
}

export function wireBillingAdmin(render) { rerender = render || (() => {}); }

const toast = (msg, type) => { if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, type ? { type } : undefined); };

delegate(document, 'submit', '[data-ba-form="plan"]', async (e, form) => {
  e.preventDefault();
  const id = form.dataset.plan;
  const f = new FormData(form);
  const patch = { name: f.get('name'), blurb: f.get('blurb') };
  if (id !== 'free') {
    for (const [k, col] of [['monthly', 'monthly_paise'], ['yearly', 'yearly_paise']]) {
      const raw = String(f.get(k) || '').trim();
      if (raw === '') { patch[col] = 0; continue; }
      const paise = parseRupees(raw);
      if (paise === null) { toast(`"${raw}" is not a rupee amount.`, 'error'); return; }
      patch[col] = paise;
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
    setTimeout(() => { S.saved = ''; rerender(); }, 2500);
  } catch (err) { toast(err.message || 'The plan was not saved.', 'error'); }
});

delegate(document, 'submit', '[data-ba-form="grant"]', async (e, form) => {
  e.preventDefault();
  const f = new FormData(form);
  const who = f.get('who');
  if (!who) { toast('Choose who the grant is for.', 'error'); return; }
  try {
    const until = await Billing.admin.grantPlan(who, f.get('plan'), parseInt(f.get('days'), 10) || 30, f.get('note'));
    S.granted = 'Granted until ' + fmtDate(until) + '.';
    await load();
  } catch (err) { toast(err.message || 'The grant did not go through.', 'error'); }
});

delegate(document, 'click', '[data-ba-action="reload"]', () => load());

export default { billingAdminSection, wireBillingAdmin };
