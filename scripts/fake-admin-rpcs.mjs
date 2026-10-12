/* ============================================================
   FAKE ADMIN RPCs for the console v2 tabs (schema §40 and §41)
   ------------------------------------------------------------
   Registers handlers on fake-supabase.mjs's EXT_RPC / EXT_FN, so a lane
   adds its RPCs HERE (or in a file like this) instead of editing the
   switch in fake-supabase.mjs. Import it for its side effect:

     import { ADMIN } from './fake-admin-rpcs.mjs';

   `ADMIN.state` is the live state; `ADMIN.reset()` starts clean. KNOBS:

     ADMIN.state.broken            { receipts: true, ... }  a health slot that answers
                                   {error, message} instead of data (§41's "a probe that
                                   raises does not take the report down")
     ADMIN.state.missing           [36, ...]   section numbers reported as not found
     ADMIN.state.grandfathered     n           grandfathered_walled in the census;
                                   > 0 makes admin_set_billing_settings({purchase_required:true})
                                   refuse with the server's sentence
     ADMIN.state.audit             the audit rows (newest first) — push() your own
     ADMIN.state.invoices          the invoice rows
     ADMIN.state.fnStatus          { 'rzp-webhook': 401, ... }  what a function answers
                                   unauthenticated; 0 is not used (a network error cannot
                                   be faked from a route handler: abort the route instead)
     ADMIN.state.refusal           a message: every admin RPC below refuses with 42501

   admin_set_billing_settings is REPLACED here (an EXT_RPC entry wins) so it
   writes the audit row §40 writes, in the same call.
   ============================================================ */
import { F, USERS, EXT_RPC, EXT_FN } from './fake-supabase.mjs';

const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3;
const ADMIN_ID = USERS['tok-admin'].id;

export const ADMIN = { state: null, reset() { ADMIN.state = fresh(); return ADMIN.state; } };

function fresh() {
  const now = Date.now();
  const rows = [];
  const actions = [
    ['grant_trial', 'user', 'u-amy', { minutes: 0 }, { minutes: 4320, user_id: 'u-amy' }],
    ['set_plan', 'plan', 'starter', { price_paise: 59900 }, { price_paise: 99900 }],
    ['decide_request', 'invite_request', 'u-cal', { status: 'pending' }, { status: 'approved', user_id: 'u-cal' }],
    ['create_invite', 'invite_code', 'code-1', null, { max: 5, days: 7 }],
    ['revoke_invite', 'invite_code', 'code-1', { revoked: false }, { revoked: true }],
    ['set_promo_code', 'promo', 'LAUNCH10', { percent_off: 10 }, { percent_off: 15 }]
  ];
  for (let i = 0; i < 120; i++) {
    const a = actions[i % actions.length];
    rows.push({ id: 'au' + String(i).padStart(3, '0'), at: new Date(now - (i + 1) * 47 * MIN).toISOString(), actor: ADMIN_ID, actor_email: 'admin@example.com',
      action: a[0], target_kind: a[1], target_id: a[2], before: a[3], after: a[4], note: i % 7 === 0 ? 'seeded by the fake' : null });
  }
  return {
    broken: {}, missing: [], grandfathered: 0, refusal: '',
    fnStatus: { 'rzp-webhook': 401 },
    audit: rows,
    invoices: [
      { id: 'inv1', number: 'FMS/26-27/0001', issued_at: new Date(now - 2 * HOUR).toISOString(), buyer_email: 'amy@example.com', buyer_name: 'Amy', plan_name: 'Basic', amount_paise: 59900, razorpay_order_id: 'order_a', emailed_at: null },
      { id: 'inv2', number: 'FMS/26-27/0002', issued_at: new Date(now - 3 * DAY).toISOString(), buyer_email: 'ben@example.com', buyer_name: 'Ben', plan_name: 'Pro', amount_paise: 99900, razorpay_order_id: 'order_b', emailed_at: null },
      { id: 'inv3', number: 'FMS/26-27/0003', issued_at: new Date(now - 4 * DAY).toISOString(), buyer_email: 'cal@example.com', buyer_name: 'Cal', plan_name: 'Basic', amount_paise: 59900, razorpay_order_id: 'order_c', emailed_at: new Date(now - 4 * DAY).toISOString() }
    ]
  };
}
ADMIN.reset();

const refuse = () => { const e = new Error('Administrators only'); e.code = '42501'; throw e; };
const need = (ctx) => { if (!ctx.isAdmin) refuse(); if (ADMIN.state.refusal) { const e = new Error(ADMIN.state.refusal); e.code = '42501'; throw e; } };
const slot = (key, value) => (ADMIN.state.broken[key] ? { error: '42P01', message: 'relation "public.' + key + '" does not exist' } : value);
const purchaseRequired = () => F.db.settings.purchase_required === true;

export function wall() {
  const g = ADMIN.state.grandfathered;
  return { purchase_required: purchaseRequired(), members: 12, paid: 3, in_trial: 2, walled: 7 + g, grandfathered_walled: g };
}

function health() {
  const st = ADMIN.state;
  const present = []; for (let i = 1; i <= 39; i++) if (!st.missing.includes(i)) present.push(i);
  const sections = { expected: 39, present, missing: st.missing.map((n) => ({ section: n, marker: 'marker for section ' + n })), weak_markers: [8, 9, 10, 19, 36] };
  const awaiting = st.invoices.filter((i) => !i.emailed_at && i.buyer_email).length;
  const awaitingRecent = st.invoices.filter((i) => !i.emailed_at && i.buyer_email && Date.parse(i.issued_at) > Date.now() - 7 * DAY).length;
  const w = wall();
  const checks = [];
  const lvl = (id, ok, observed, bad = 'warn') => checks.push({ id, level: ok ? 'ok' : bad, observed });
  if (st.broken.sections) checks.push({ id: 'sections', level: 'unknown', observed: 'the section probe raised 42P01' });
  else lvl('sections', !st.missing.length, `${present.length} of 39 markers found` + (st.missing.length ? '; not found: ' + st.missing.map((n) => '§' + n).join(', ') : ''));
  lvl('plan_features', true, '3 paid plan row(s); 0 with an empty features map');
  checks.push({ id: 'purchases_required', level: 'info', observed: 'purchases_required() answers ' + purchaseRequired() });
  lvl('trial_offer', true, 'trial_enabled true, 30 minutes');
  lvl('price_notice', true, '3 plan(s) listed, 0 at a zero or missing price, free plan listed: false');
  if (st.broken.receipts) checks.push({ id: 'receipts', level: 'unknown', observed: 'the invoices probe raised 42P01' });
  else lvl('receipts', awaitingRecent === 0, `${awaitingRecent} invoice(s) issued in the last 7 days with no mail recorded; ${awaiting} in all`);
  lvl('payments_created', false, '2 payment(s) still in created after an hour', 'info');
  lvl('refunds', false, '1 request(s) pending, 0 approved and not refunded, 0 in flight, 0 failed');
  lvl('invite_requests', false, '2 invite request(s) pending', 'info');
  lvl('purchase_wall', w.grandfathered_walled === 0, `${w.members} member(s): ${w.paid} paid, ${w.in_trial} in a trial, ${w.walled} walled or would be, of whom ${w.grandfathered_walled} grandfathered`);
  return {
    observed_at: new Date().toISOString(),
    sections: slot('sections', sections),
    plan_features: [
      { plan: 'starter', active: true, keys: 40, enabled: 15, empty: false },
      { plan: 'indie', active: true, keys: 40, enabled: 34, empty: false },
      { plan: 'pro', active: true, keys: 40, enabled: 40, empty: false }
    ],
    purchases_required: purchaseRequired(),
    trial_offer: { trial_enabled: true, trial_minutes: 30, trial_hours: 0.5, purchase_required: purchaseRequired() },
    price_notice: { plans_listed: 3, free_listed: false, zero_or_null_price: 0, rising: true },
    receipts: slot('receipts', { awaiting, awaiting_recent: awaitingRecent, oldest_awaiting_age_seconds: awaiting ? 3 * 86400 : null, no_buyer_email: 0, invoices: st.invoices.length, resend_configured: 'not observable from SQL' }),
    payments: { created_older_than_1h: 2, oldest_created_age_seconds: 7200, paid: 3, last_paid_at: new Date(Date.now() - 2 * HOUR).toISOString(), last_webhook_seen: 'not observable from SQL' },
    refunds: { requests_pending: 1, oldest_pending_age_seconds: 60 * 3600, requests_approved_not_refunded: 0, refunds_in_flight: 0, refunds_failed: 0, last_refund_processed_at: null },
    invite_requests: { pending: 2, oldest_age_seconds: 86400 },
    wall: slot('wall', w),
    billing_settings_last_touched: { at: new Date(Date.now() - DAY).toISOString(), by: ADMIN_ID, by_email: 'admin@example.com', scope: 'any billing setting, not only purchase_required' },
    checks
  };
}

EXT_RPC.admin_health = (a, u, ctx) => { need(ctx); return health(); };

EXT_RPC.admin_launch_preview = (a, u, ctx) => {
  need(ctx);
  const w = wall();
  const members = [];
  for (let i = 0; i < w.walled; i++) members.push({ user_id: 'w' + i, email: `walled${i}@example.com`, member_since: new Date(Date.now() - (30 + i) * DAY).toISOString(), trial_source: i < w.grandfathered_walled ? 'admin' : 'self',
    trial_started_at: new Date(Date.now() - 20 * DAY).toISOString(), trial_ends_at: new Date(Date.now() - 19 * DAY).toISOString(), grandfathered: i < w.grandfathered_walled, email_grant: i === w.walled - 1 });
  return { observed_at: new Date().toISOString(), switch_on: purchaseRequired(), census: w, would_wall_count: w.walled, would_wall_after_grants: Math.max(0, w.walled - 1),
    blocked_by_grandfathered: w.grandfathered_walled, can_throw: w.grandfathered_walled === 0, members, truncated: false,
    rollback: { call: 'admin_set_billing_settings', patch: { purchase_required: false }, needs_new_object: false } };
};

EXT_RPC.admin_purchase_wall = (a, u, ctx) => { need(ctx); return wall(); };

EXT_RPC.admin_list_invoices = (a, u, ctx) => { need(ctx); return ADMIN.state.invoices; };

EXT_RPC.admin_resend_receipt = (a, u, ctx) => {
  need(ctx);
  const inv = ADMIN.state.invoices.find((i) => i.id === a.p_invoice);
  if (!inv || !inv.razorpay_order_id) { const e = new Error('No such invoice, or it has no Razorpay order'); e.code = '22023'; throw e; }
  inv.emailed_at = new Date().toISOString();   // the fake "mails" it at once
  audit('resend_receipt', 'invoice', inv.id, null, { razorpay_order_id: inv.razorpay_order_id });
  return inv.razorpay_order_id;
};

/** Write an audit row the way admin_audit_write() does. */
export function audit(action, kind, id, before, after, note) {
  ADMIN.state.audit.unshift({ id: 'au-' + Math.random().toString(36).slice(2, 8), at: new Date().toISOString(), actor: ADMIN_ID, actor_email: 'admin@example.com', action, target_kind: kind, target_id: String(id), before, after, note: note || null });
}

EXT_RPC.admin_set_billing_settings = (a, u, ctx) => {
  need(ctx);
  const p = a.p_patch || {};
  if ('purchase_required' in p && typeof p.purchase_required !== 'boolean') { const e = new Error('Purchases required is on (true) or off (false).'); e.code = '22023'; throw e; }
  if (p.purchase_required === true && ADMIN.state.grandfathered > 0) {
    const e = new Error(`Requiring a plan would wall ${ADMIN.state.grandfathered} member(s) who were admitted before purchases existed and whose grandfathered access has run out. Give them a plan, a longer trial or an e-mail grant first.`);
    e.code = '22023'; throw e;
  }
  const before = { ...F.db.settings };
  Object.assign(F.db.settings, p);
  audit('set_billing_settings', 'billing_settings', 'global', before, { ...F.db.settings }, 'patch: ' + Object.keys(p).join(','));
  return { ...F.db.settings };
};

EXT_RPC.admin_list_audit = (a, u, ctx) => {
  need(ctx);
  const lim = Math.min(Math.max(a.p_limit || 50, 1), 200);
  const has = (s, q) => String(s || '').toLowerCase().includes(String(q).toLowerCase());
  let rows = ADMIN.state.audit.filter((r) =>
    (!a.p_actor || r.actor === a.p_actor || has(r.actor_email, a.p_actor)) &&
    (!a.p_action || String(r.action).toLowerCase().startsWith(String(a.p_action).toLowerCase())) &&
    (!a.p_target || r.target_id === a.p_target || r.target_kind + ':' + r.target_id === a.p_target || (r.after && r.after.user_id === a.p_target) || (r.before && r.before.user_id === a.p_target)) &&
    (!a.p_from || Date.parse(r.at) >= Date.parse(a.p_from)) && (!a.p_to || Date.parse(r.at) <= Date.parse(a.p_to)) &&
    (!a.p_before || Date.parse(r.at) < Date.parse(a.p_before)))
    .sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
  const page = rows.slice(0, lim);
  return { rows: page, has_more: rows.length > lim, next_before: page.length ? page[page.length - 1].at : null };
};

/* the webhook: unauthenticated, so a bad signature (or a missing secret) */
EXT_FN['rzp-webhook'] = () => {
  const s = ADMIN.state.fnStatus['rzp-webhook'];
  return [s, s === 503 ? { error: 'webhook secret not configured' } : s === 401 ? { error: 'bad signature' } : {}];
};
