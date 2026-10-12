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
import { pill, emptyState, errorState, skeleton } from './admin-kit.js';
import { rpc, studioRole, can } from './admin-customer.js';
import { formatCode, errorSentence as sentence } from '../lib/gate.js';
import { addRequestsBlock } from './gate-ui.js';
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
  f.append(h('p.gr-meta', { text: 'Applies now, or at the first Google sign-in. No invite code needed.' }));
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
/** The switch's position for the console's Overview: true / false, or
 *  null while unknown or where section 32 has not run. */
export function purchasesRequiredNow() {
  if (S.state !== 'ready' || S.missing.settings || !S.settings || !('purchase_required' in S.settings)) return null;
  return S.settings.purchase_required === true;
}
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

/* ---- screening passes and share links (schema §45.5) -----------------
   Two more lists in the Access & sharing tab. METADATA ONLY: the server
   sends no share token and no redeemer address. gate-ui.js draws the
   requests tab and does not import this file (it also serves the invite
   and settings pages, which must not pull the console in), so these blocks
   are REGISTERED: importing this module adds them to the tab through
   addRequestsBlock(). The roles hide the buttons; the server's refusal
   sentence is shown as it came. */
const LISTS = { passes: { phase: 'idle', rows: [], error: '' }, shares: { phase: 'idle', rows: [], error: '' } };
const LIST_RPC = { passes: 'admin_list_passes', shares: 'admin_list_shares' };

async function loadList(key) {
  const L = LISTS[key];
  L.phase = 'loading'; L.error = '';
  try { L.rows = (await rpc(LIST_RPC[key])) || []; L.phase = 'ready'; }
  catch (e) { L.error = sentence(e, 'This list could not load.'); L.phase = 'error'; }
  rerender();
}
function listBody(key, title, intro, draw) {
  const L = LISTS[key];
  if (L.phase === 'idle') { studioRole().then(() => rerender()); loadList(key); }
  const box = h('div.ad-block.acc-' + key, { id: key === 'passes' ? 'screening-passes' : 'share-links' }, [h('h3.gt-h3', { text: title }), h('p.gt-meta', { text: intro })]);
  if (L.phase === 'loading' || L.phase === 'idle') { box.append(skeleton({ kind: 'rows', count: 3 })); return box; }
  if (L.phase === 'error') { box.append(errorState({ title: title + ' could not load', why: L.error, onRetry: () => { L.phase = 'idle'; rerender(); } })); return box; }
  return draw(box, L.rows);
}
const pillFor = (status) => pill(String(status).replace(/^./, (c) => c.toUpperCase()), status === 'active' ? 'ok' : status === 'revoked' ? 'danger' : 'neutral', { dot: true });
const mayManage = () => can('passes');

export function passesBlock() {
  return listBody('passes', 'Screening passes', 'Read-only links to one film. Revoke ends a pass now; extend moves its expiry out.', (box, all) => {
    const rows = all.filter((p) => p.pass_type === 'screening_pass');
    if (!rows.length) { box.append(emptyState({ title: 'No screening passes', body: 'Issue one under Issue a code above; it will be listed here.', icon: '◇' })); return box; }
    const table = h('table.gt-table.acc-table');
    table.append(h('thead', {}, [h('tr', {}, ['Code', 'Film', 'Made by', 'Used', 'Expires', 'State', ''].map((t) => h('th', { scope: 'col', text: t })))]));
    const tb = h('tbody');
    for (const p of rows) {
      const live = p.status === 'active';
      const can_ = mayManage();
      tb.append(h('tr', { 'data-pass': p.code }, [
        h('td', {}, [h('code.gt-codeval', { text: formatCode(p.code) }), p.label ? h('span.ad-sub', { text: p.label }) : null]),
        h('td', { text: p.project_title || '—' }),
        h('td', { text: p.created_by_email || '—' }),
        h('td', { text: `${p.uses} / ${p.max_uses}` }),
        h('td', { text: p.expires_at ? new Date(p.expires_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Never' }),
        h('td', {}, [pillFor(p.status)]),
        h('td.gt-row-actions', {}, can_ && p.status !== 'revoked' ? [
          p.expires_at ? h('button.btn', { type: 'button', 'data-acc-action': 'extend-pass', 'data-code': p.code, 'data-days': '7', 'aria-label': 'Extend ' + formatCode(p.code) + ' by 7 days', text: '+7 DAYS' }) : null,
          p.expires_at ? h('button.btn', { type: 'button', 'data-acc-action': 'extend-pass', 'data-code': p.code, 'data-days': '30', 'aria-label': 'Extend ' + formatCode(p.code) + ' by 30 days', text: '+30 DAYS' }) : null,
          live ? h('button.btn.danger', { type: 'button', 'data-acc-action': 'revoke-pass', 'data-code': p.code, 'aria-label': 'Revoke ' + formatCode(p.code), text: 'REVOKE' }) : null
        ].filter(Boolean) : [])
      ]));
    }
    table.append(tb);
    box.append(h('div.gt-scroll', {}, [table]));
    return box;
  });
}

export function sharesBlock() {
  return listBody('shares', 'Share links', 'Links people made to share a film. No link address is shown here. Revoke ends the link; anybody who already joined through it keeps their access.', (box, rows) => {
    if (!rows.length) { box.append(emptyState({ title: 'No share links', body: 'Nobody has shared a film by link yet.', icon: '◇' })); return box; }
    const table = h('table.gt-table.acc-table');
    table.append(h('thead', {}, [h('tr', {}, ['Film', 'Owner', 'Gives', 'Made by', 'Made', 'Expires', 'State', ''].map((t) => h('th', { scope: 'col', text: t })))]));
    const tb = h('tbody');
    for (const s of rows) {
      tb.append(h('tr', { 'data-share': s.id }, [
        h('td', { text: s.project_title || '—' }),
        h('td', { text: s.owner_email || '—' }),
        h('td', { text: s.role ? String(s.role).replace(/^./, (c) => c.toUpperCase()) : '—' }),
        h('td', { text: s.created_by_email || '—' }),
        h('td', { text: fmtDate(s.created_at) }),
        h('td', { text: s.expires_at ? fmtDate(s.expires_at) : 'Never' }),
        h('td', {}, [pillFor(s.active ? 'active' : 'ended')]),
        h('td.gt-row-actions', {}, mayManage() && s.active ? [
          h('button.btn.danger', { type: 'button', 'data-acc-action': 'revoke-share', 'data-id': s.id, 'aria-label': 'Revoke the share link for ' + (s.project_title || 'this film'), text: 'REVOKE' })
        ] : [])
      ]));
    }
    table.append(tb);
    box.append(h('div.gt-scroll', {}, [table]));
    return box;
  });
}

/** Both, under one wrapper, for the Access & sharing tab. */
export function sharingBlocks() {
  return h('div.ad-block.acc-sharing', { id: 'sharing' }, [passesBlock(), sharesBlock()]);
}
addRequestsBlock(sharingBlocks);

const ackWrote = (msg) => toast(msg);
delegate(document, 'click', '[data-acc-action="revoke-pass"]', async (e, el) => {
  const code = el.dataset.code;
  if (!await askDanger({ title: 'Revoke screening pass ' + formatCode(code) + '?', body: 'Nobody can open the screening room with it again, including people who hold the link now. The row stays in this list.', confirm: 'Revoke pass' })) return;
  try { await rpc('admin_revoke_pass', { p_code: code }); ackWrote('Pass ' + formatCode(code) + ' revoked.'); await loadList('passes'); }
  catch (err) { toast(sentence(err, 'The pass was not revoked.'), 'error'); }
});
delegate(document, 'click', '[data-acc-action="extend-pass"]', async (e, el) => {
  const code = el.dataset.code, days = parseInt(el.dataset.days, 10);
  const p = LISTS.passes.rows.find((x) => x.code === code);
  const from = Math.max(Date.now(), p && p.expires_at ? Date.parse(p.expires_at) : Date.now());
  const to = new Date(from + days * 86400000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  if (!await ask({ title: 'Extend pass ' + formatCode(code) + ' by ' + days + ' days?', body: 'It will expire on ' + to + '. If it has already expired it counts from now, and it opens again.', confirm: 'Extend ' + days + ' days' })) return;
  try { await rpc('admin_extend_pass', { p_code: code, p_days: days }); ackWrote('Pass ' + formatCode(code) + ' extended by ' + days + ' days.'); await loadList('passes'); }
  catch (err) { toast(sentence(err, 'The pass was not extended.'), 'error'); }
});
delegate(document, 'click', '[data-acc-action="revoke-share"]', async (e, el) => {
  const id = el.dataset.id;
  const s = LISTS.shares.rows.find((x) => x.id === id);
  if (!await askDanger({ title: 'Revoke the share link for ' + ((s && s.project_title) || 'this film') + '?', body: 'The link stops working now. People who already joined through it keep the access they were given; that is not touched here.', confirm: 'Revoke link' })) return;
  try { await rpc('admin_revoke_share', { p_share: id }); ackWrote('Share link revoked.'); await loadList('shares'); }
  catch (err) { toast(sentence(err, 'The link was not revoked.'), 'error'); }
});

export default { purchasesSwitchBlock, giveAccessBlock, accessAdminSection, wireAccessAdmin, passesBlock, sharesBlock, sharingBlocks };
