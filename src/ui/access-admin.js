/* ============================================================
   ACCESS ADMIN — "Purchases required", and access given by e-mail
   ------------------------------------------------------------
   Schema section 32, the console's half. Two self-contained blocks,
   each a function that returns one element, so the console's coming
   re-layout can put them wherever it likes without touching this file:

     purchasesSwitchBlock()   the one switch. Off (the default): the
                              studio is free, nothing is walled or
                              capped. On: everybody who has neither
                              paid nor a running trial meets the wall,
                              people already inside included.
     giveAccessBlock()        an address, Member or Admin, a plan from
                              the plans table, and a length ("until I
                              remove it" or N days); below it every
                              grant, with Revoke.

   The server decides everything: admin_set_billing_settings refuses a
   non-boolean switch and a non-admin, admin_grant_email refuses a bad
   address, role, plan or length. This file asks and draws.

   Every confirmation goes through dialog.js (a native confirm() fails
   test:dialogs). No inline handlers (CSP): delegate() on
   [data-acc-action] and [data-acc-form].
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import Billing, { planName } from '../lib/billing.js';
import Growth, { isMissing } from '../lib/growth.js';
import Store from '../lib/store.js';
import { ask, askDanger } from './dialog.js';
import '../styles/growth.css';

let rerender = () => {};
const S = { state: 'idle', error: '', settings: null, grants: null, plans: null, missing: {}, busy: false, note: '' };

const toast = (msg, type) => { if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, type ? { type } : undefined); };
const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '');

/* What each position MEANS, in the words the dialog and the block both
   use — the column name is not the decision being made. */
export const SWITCH_ON = 'On: everyone who has not bought a plan is blocked until they buy, including people using the studio now.';
export const SWITCH_OFF = 'Off: the studio is free; nothing is walled or capped.';

async function settle(key, fn) {
  try { return await fn(); }
  catch (e) { if (isMissing(e)) { S.missing[key] = true; return null; } throw e; }
}
async function load() {
  S.state = 'loading'; S.error = ''; S.missing = {}; rerender();
  try {
    S.settings = await settle('settings', Growth.admin.settings);
    S.grants = await settle('grants', Growth.admin.listEmailGrants);
    try { S.plans = await Billing.listPlans(); } catch (e) { S.plans = []; }
    S.state = 'ready';
  } catch (e) {
    S.error = e.message || 'The access console could not load.'; S.state = 'error';
  } finally { rerender(); }
}
const ready = () => { if (S.state === 'idle') load(); return S.state === 'ready'; };

/* ---- the switch ------------------------------------------------- */
export function purchasesSwitchBlock() {
  const box = h('div.gr-panel.acc-switch', { id: 'purchasesRequired' });
  box.append(h('h3.gt-h3', { text: 'Purchases required' }));
  if (!ready()) { box.append(h('p.gt-meta', { text: S.error || 'Loading…' })); return box; }
  const st = S.settings || {};
  /* "Has section 32 run" is the presence of the key, not the function:
     admin_get_billing_settings is older than the column. */
  if (S.missing.settings || !('purchase_required' in st)) {
    box.append(h('p.gt-meta', { text: 'This switch is not available on this database yet (schema section 32 has not run). Until it runs, the studio behaves as it always has.' }));
    return box;
  }
  const on = st.purchase_required === true;
  const sw = h('input', { id: 'accPurchasesOn', type: 'checkbox', 'data-acc-action': 'purchases-switch' });
  sw.checked = on;
  sw.disabled = S.busy;
  box.append(h('div.gr-row', {}, [h('label.gr-check', { for: 'accPurchasesOn' }, [sw, h('span', { text: 'Purchases required' })])]));
  box.append(h('p.gr-meta', { 'data-acc-state': on ? 'on' : 'off', text: on ? SWITCH_ON : SWITCH_OFF }));
  return box;
}

/* ---- give access by e-mail -------------------------------------- */
export function giveAccessBlock() {
  const wrap = h('div.acc-grants', { id: 'giveAccess' });
  wrap.append(h('h3.gt-h3', { text: 'Give access' }));
  if (!ready()) { wrap.append(h('p.gt-meta', { text: S.error || 'Loading…' })); return wrap; }
  if (S.missing.grants) {
    wrap.append(h('p.gt-meta', { text: 'Access by e-mail is not available on this database yet (schema section 32 has not run).' }));
    return wrap;
  }
  const f = h('form.gr-panel', { 'data-acc-form': 'grant', autocomplete: 'off' });
  const role = h('select', { id: 'accRole', name: 'role' }, [
    h('option', { value: 'member', text: 'Member' }), h('option', { value: 'admin', text: 'Admin' })
  ]);
  /* The plans table, never a typed list. "No plan" is membership only. */
  const plan = h('select', { id: 'accPlan', name: 'plan' },
    [h('option', { value: '', text: 'No plan (membership only)' })].concat((S.plans || []).filter((p) => p.id !== 'free')
      .map((p) => h('option', { value: p.id, text: p.name || planName(p.id) }))));
  const len = h('select', { id: 'accLength', name: 'length' }, [
    h('option', { value: 'forever', text: 'Until I remove it' }), h('option', { value: 'days', text: 'For a number of days' })
  ]);
  f.append(h('div.gr-fields', {}, [
    h('div', {}, [h('label', { for: 'accEmail', text: 'E-mail' }), h('input', { id: 'accEmail', name: 'email', type: 'email', required: true, maxlength: 320, placeholder: 'name@example.com' })]),
    h('div', {}, [h('label', { for: 'accRole', text: 'As' }), role]),
    h('div', {}, [h('label', { for: 'accPlan', text: 'Plan' }), plan]),
    h('div', {}, [h('label', { for: 'accLength', text: 'For how long' }), len]),
    h('div', {}, [h('label', { for: 'accDays', text: 'Days' }), h('input', { id: 'accDays', name: 'days', type: 'number', min: 1, max: 3650, step: 1, value: '30' })])
  ]));
  f.append(h('div.ba-actions', {}, [h('button.btn.primary', { type: 'submit', text: 'GIVE ACCESS', disabled: S.busy ? true : null }),
    S.note ? h('span.ba-saved', { role: 'status', text: S.note }) : null].filter(Boolean)));
  f.append(h('p.gr-meta', { text: 'If the address already has an account the access applies now; otherwise the first time it signs in with Google. It passes the invite gate without a code. The length bounds the plan; membership and the admin role last until you revoke.' }));
  wrap.append(f);

  const rows = S.grants || [];
  if (!rows.length) { wrap.append(h('p.gt-meta', { 'data-acc-empty': '', text: 'No access has been given by e-mail.' })); return wrap; }
  const table = h('table.gt-table.acc-table');
  table.append(h('thead', {}, [h('tr', {}, ['E-mail', 'As', 'Plan', 'Until', 'Applied', ''].map((t) => h('th', { scope: 'col', text: t })))]));
  const tb = h('tbody');
  for (const g of rows) {
    tb.append(h('tr', { 'data-grant': g.email }, [
      h('td', { text: g.email }),
      h('td', { text: g.role === 'admin' ? 'Admin' : 'Member' }),
      h('td', { text: g.plan ? (g.plan_name || planName(g.plan)) : '—' }),
      h('td', { text: g.until ? fmtDate(g.until) : 'Until removed' }),
      h('td', { text: g.applied ? 'Yes, ' + fmtDate(g.applied_at) : (g.account_exists ? 'Not yet' : 'At first sign-in') }),
      h('td', {}, [h('button.btn', { type: 'button', 'data-acc-action': 'revoke', 'data-email': g.email, text: 'REVOKE' })])
    ]));
  }
  table.append(tb);
  wrap.append(h('div.gt-scroll', {}, [table]));
  return wrap;
}

export function wireAccessAdmin(render) { rerender = render || (() => {}); }
/** For a page that wants both blocks under one heading. */
export function accessAdminSection(section, st) {
  if (!st || !st.deployed || st.role !== 'admin') return null;
  const sec = section('give-access', 'Access', 'Give access by e-mail.', '');
  sec.append(giveAccessBlock());
  return sec;
}

/* ---- the handlers ----------------------------------------------- */
delegate(document, 'change', '[data-acc-action="purchases-switch"]', async (e, el) => {
  const want = el.checked;
  el.checked = !want;   // nothing changes until the owner has said yes
  const ok = await ask({
    title: want ? 'Turn purchases ON?' : 'Turn purchases OFF?',
    body: (want ? SWITCH_ON + '\n\n' + SWITCH_OFF : SWITCH_OFF + '\n\n' + SWITCH_ON)
      + '\n\nIt applies to everyone at once — an open tab follows within a few minutes, or as soon as it is focused.',
    confirm: want ? 'Require purchases' : 'Make it free',
    danger: want
  });
  if (!ok) return;
  S.busy = true; rerender();
  try {
    S.settings = await Growth.admin.setSettings({ purchase_required: want });
    toast(want ? 'Purchases are required now.' : 'The studio is free to use now.');
    /* The admin's own tab: billing_status() changed under it. */
    Store.notify('billing:changed', {});
  } catch (err) { toast(err.message || 'The switch was not saved.', 'error'); }
  finally { S.busy = false; rerender(); }
});

delegate(document, 'submit', '[data-acc-form="grant"]', async (e, form) => {
  e.preventDefault();
  const f = new FormData(form);
  const email = String(f.get('email') || '').trim();
  const role = String(f.get('role') || 'member');
  const plan = String(f.get('plan') || '') || null;
  const forever = String(f.get('length') || 'forever') !== 'days';
  const days = forever ? null : parseInt(String(f.get('days') || ''), 10);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('That does not look like an e-mail address.', 'error'); return; }
  if (!forever && !(days >= 1 && days <= 3650)) { toast('A grant lasts 1 to 3650 days, or until you remove it.', 'error'); return; }
  S.busy = true; rerender();
  try {
    const r = await Growth.admin.grantEmail({ email, role, plan, days });
    S.note = r && r.applied ? 'Given — applied now.' : 'Given — it applies when ' + email + ' first signs in.';
    S.grants = await Growth.admin.listEmailGrants();
    const note = S.note;
    setTimeout(() => { if (S.note === note) { S.note = ''; for (const n of document.querySelectorAll('.ba-saved')) if (n.textContent === note) n.remove(); } }, 4000);
  } catch (err) { toast(err.message || 'Access was not given.', 'error'); }
  finally { S.busy = false; rerender(); }
});

delegate(document, 'click', '[data-acc-action="revoke"]', async (e, el) => {
  const email = el.dataset.email;
  const ok = await askDanger({
    title: 'Revoke access for ' + email + '?',
    body: 'The plan this grant gave is taken back (a plan they bought is not), an admin role it gave goes back to member, and if this grant is what let them in, they are let out.',
    confirm: 'Revoke'
  });
  if (!ok) return;
  try {
    await Growth.admin.revokeEmailGrant(email);
    S.grants = await Growth.admin.listEmailGrants();
    toast('Access revoked for ' + email + '.');
  } catch (err) { toast(err.message || 'Access was not revoked.', 'error'); }
  rerender();
});

export default { purchasesSwitchBlock, giveAccessBlock, accessAdminSection, wireAccessAdmin };
