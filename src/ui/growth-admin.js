/* ============================================================
   GROWTH ADMIN — the console's Growth tab (schema §22 onward)
   ------------------------------------------------------------
   Drawn by admin.html for an administrator, beside Billing:

     Referrals    what a friend gets and what a referrer earns (one
                  setting each), and every credit — owed, paid, void —
                  with a tick box per owed row and MARK PAID. The
                  console records the payout; the money moves outside
                  this app (bank, UPI).

   Every block is read through an admin_* RPC that re-checks the role;
   a section that has not run on the database yet says so in one line
   and the rest of the tab still draws.

   No inline handlers (CSP): delegate() on [data-gra-action] and
   [data-gra-form].
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { fmtPaise, parseRupees, planName } from '../lib/billing.js';
import Growth, { isMissing } from '../lib/growth.js';
import '../styles/plans.css';
import '../styles/growth.css';

let rerender = () => {};
const S = { state: 'idle', error: '', settings: null, credits: null, missing: {}, saved: '' };
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
const toast = (msg, type) => { if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, type ? { type } : undefined); };

/* Each read is allowed to fail on its own: one section not yet run on
   the database must not blank the others. */
async function settle(key, fn) {
  try { return await fn(); }
  catch (e) { if (isMissing(e)) { S.missing[key] = true; return null; } throw e; }
}
async function load() {
  S.state = 'loading'; S.error = ''; rerender();
  try {
    S.missing = {};
    S.settings = await settle('settings', Growth.admin.settings);
    S.credits = await settle('credits', () => Growth.admin.listReferralCredits());
    S.state = 'ready';
  } catch (e) {
    S.error = e.message || 'The growth console could not load.'; S.state = 'error';
  } finally { rerender(); }
}

function referralBlock(sec) {
  sec.append(h('h3.gt-h3', { text: 'Referrals' }));
  if (S.missing.settings || S.missing.credits) { sec.append(h('p.gt-meta', { text: 'Referral codes are not available on this database yet (schema section 22 has not run).' })); return; }
  const st = S.settings || {};
  const f = h('form.gr-panel', { 'data-gra-form': 'referral', autocomplete: 'off' });
  const kind = h('select', { id: 'graRewardKind', name: 'kind' }, [h('option', { value: 'pct', text: '% of what the friend pays' }), h('option', { value: 'paise', text: '₹ per purchase' })]);
  kind.value = Number.isInteger(st.referral_reward_paise) ? 'paise' : 'pct';
  f.append(h('div.gr-fields', {}, [
    h('div', {}, [h('label', { for: 'graFriendPct', text: 'Friend gets (% off)' }), h('input', { id: 'graFriendPct', name: 'friend', type: 'number', min: 1, max: 100, step: 1, value: String(st.referral_friend_pct ?? 10), required: true })]),
    h('div', {}, [h('label', { for: 'graRewardKind', text: 'Referrer earns' }), kind]),
    h('div', {}, [h('label', { for: 'graRewardValue', text: 'Reward (% or ₹)' }), h('input', { id: 'graRewardValue', name: 'reward', type: 'text', inputmode: 'decimal', required: true,
      value: Number.isInteger(st.referral_reward_paise) ? String(st.referral_reward_paise / 100) : String(st.referral_reward_pct ?? 10) })])
  ]));
  f.append(h('div.ba-actions', {}, [h('button.btn.primary', { type: 'submit', text: 'SAVE REFERRAL TERMS' }), S.saved === 'referral' ? h('span.ba-saved', { role: 'status', text: 'Saved.' }) : null].filter(Boolean)));
  f.append(h('p.gr-meta', { text: 'Every member who has paid for a plan gets a REF- code. A friend’s purchase with it is discounted by the first number; once that payment is confirmed the referrer is owed the second. A new friend percentage applies to every existing referral code. Self-referral is refused by the server.' }));
  sec.append(f);

  const rows = S.credits || [];
  const owed = rows.filter((r) => r.status === 'owed');
  sec.append(h('p.gt-meta', { text: `Credits: ${rows.length} · owed ${fmtPaise(owed.reduce((n, r) => n + r.amount_paise, 0))} across ${new Set(owed.map((r) => r.referrer_user_id)).size} referrer(s).` }));
  if (!rows.length) return;
  const pay = h('form', { 'data-gra-form': 'payout' });
  const table = h('table.gt-table');
  table.append(h('thead', {}, [h('tr', {}, ['', 'When', 'Referrer', 'Code', 'Friend', 'Plan', 'Friend paid', 'Owed', 'Status'].map((t) => h('th', { scope: 'col', text: t })))]));
  const tb = h('tbody');
  for (const r of rows) {
    tb.append(h('tr' + (r.status === 'owed' ? '' : '.is-off'), { 'data-credit': r.id }, [
      h('td', {}, [r.status === 'owed' ? h('input', { type: 'checkbox', name: 'credit', value: r.id, 'aria-label': `Select the credit for ${r.referrer_email}` }) : null].filter(Boolean)),
      h('td', { text: fmtDate(r.created_at) }),
      h('td', { text: r.referrer_email || '—' }),
      h('td', {}, [h('code.gt-codeval', { text: r.code })]),
      h('td', { text: r.friend_email || '—' }),
      h('td', { text: planName(r.plan_id) }),
      h('td', { text: fmtPaise(r.basis_paise) }),
      h('td', { text: fmtPaise(r.amount_paise) }),
      h('td', { text: r.status === 'paid' ? `paid ${fmtDate(r.paid_at)}${r.paid_note ? ' — ' + r.paid_note : ''}` : r.status })
    ]));
  }
  table.append(tb);
  pay.append(h('div.gt-scroll', {}, [table]));
  if (owed.length) {
    pay.append(h('div.gr-row', {}, [
      h('label.gr-check', { for: 'graPayNote', text: 'Payout note' }),
      h('input', { id: 'graPayNote', name: 'note', type: 'text', maxlength: 300, placeholder: 'UPI ref, date' }),
      h('button.btn', { type: 'submit', text: 'MARK SELECTED PAID' })
    ]));
  }
  sec.append(pay);
}

export function growthAdminSection(section, st) {
  if (!st || !st.deployed || st.role !== 'admin') return null;
  const sec = section('growth', 'Growth', 'Referrals, affiliates, invoices and the funnel.',
    'Everything around a purchase: what referrers are owed, what affiliates have earned, the invoice settings, the leads from the start page and how many people reach each step. Money is computed by the database; this tab only shows it and records what you did about it.');
  if (S.state === 'idle') load();
  if (S.error) sec.append(h('p.gt-error', { role: 'alert', text: S.error }));
  if (S.state !== 'ready') { sec.append(h('p.gt-meta', { text: S.state === 'loading' ? 'Loading…' : '' })); return sec; }
  referralBlock(sec);
  sec.append(h('button.btn', { type: 'button', 'data-gra-action': 'reload', text: 'REFRESH' }));
  return sec;
}

export function wireGrowthAdmin(render) { rerender = render || (() => {}); }

delegate(document, 'submit', '[data-gra-form="referral"]', async (e, form) => {
  e.preventDefault();
  const f = new FormData(form);
  const friend = parseInt(String(f.get('friend') || ''), 10);
  const raw = String(f.get('reward') || '').trim();
  const patch = { referral_friend_pct: friend };
  if (f.get('kind') === 'paise') {
    const p = parseRupees(raw);
    if (!p) { toast(`"${raw}" is not a rupee amount.`, 'error'); return; }
    patch.referral_reward_paise = p;
  } else {
    const pct = parseInt(raw, 10);
    if (!(pct >= 1 && pct <= 100) || String(pct) !== raw) { toast(`"${raw}" is not a whole percentage from 1 to 100.`, 'error'); return; }
    patch.referral_reward_pct = pct;
  }
  try {
    S.settings = await Growth.admin.setSettings(patch);
    S.saved = 'referral'; rerender();
    setTimeout(() => { S.saved = ''; rerender(); }, 2500);
  } catch (err) { toast(err.message || 'The referral terms were not saved.', 'error'); }
});

delegate(document, 'submit', '[data-gra-form="payout"]', async (e, form) => {
  e.preventDefault();
  const f = new FormData(form);
  const ids = f.getAll('credit').map(String);
  if (!ids.length) { toast('Tick the credits you have paid out.', 'error'); return; }
  try {
    const n = await Growth.admin.markReferralPaid(ids, String(f.get('note') || '').trim());
    toast(`Marked ${n} credit${n === 1 ? '' : 's'} paid.`);
    await load();
  } catch (err) { toast(err.message || 'The credits were not marked.', 'error'); }
});

delegate(document, 'click', '[data-gra-action="reload"]', () => load());

export default { growthAdminSection, wireGrowthAdmin };
