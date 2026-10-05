/* ============================================================
   A FAKE SUPABASE PROJECT implementing schema sections 13 and 14
   ------------------------------------------------------------
   Shared by scripts/prove-gate.mjs and scripts/prove-extension.mjs.
   An in-memory database (codes, hashed tickets, members, the 90-second
   lock, screening passes, a project with data) behind a Playwright
   route handler for the project's origin. `F.db` is the live state;
   `F.reset()` starts a scenario clean.
   ============================================================ */
import { createHash, createHmac } from 'node:crypto';

export const SB = 'https://conhlrulxfwkhsnymakz.supabase.co';
export const REF = 'conhlrulxfwkhsnymakz';
export const F = { db: null, reset() { F.db = freshDb(); return F.db; } };

/* ---- section 16: the fake Razorpay ---------------------------------
   The key secret the fake "edge functions" verify with, and the mode
   the Checkout stub reads ('pay' | 'dismiss' | 'tamper'). signFor()
   is what Razorpay does: HMAC-SHA256(order|payment, KEY_SECRET). */
export const RZP = { keyId: 'rzp_test_fake', secret: 'fake_key_secret_123', mode: 'pay' };
export const signFor = async (order, payment) => createHmac('sha256', RZP.secret).update(`${order}|${payment}`).digest('hex');
const PLAN_RANK = { free: 0, starter: 1, indie: 2, pro: 3 };
/* Section 18: a plan is for good. applyPlan() writes plan_until null;
   accountPlan() has always read null as "no end". */
function accountPlan(a) { return !a || a.plan === 'free' ? 'free' : (!a.plan_until || Date.parse(a.plan_until) > Date.now()) ? a.plan : 'free'; }
function userPlan(uid) {
  const owned = F.db.accounts.filter((a) => a.owner_id === uid);
  return owned.map(accountPlan).sort((x, y) => PLAN_RANK[y] - PLAN_RANK[x])[0] || 'free';
}
function userLimits(uid) { return (F.db.plans.find((p) => p.id === userPlan(uid)) || {}).limits || {}; }
function cap(lim, k) { return Number.isInteger(lim[k]) ? lim[k] : null; }
function accountForBuyer(uid) {
  let a = F.db.accounts.filter((x) => x.owner_id === uid).sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at))[0];
  if (a) return a;
  const u = Object.values(USERS).find((x) => x.id === uid);
  a = { id: 'acc_' + uid.slice(-4), name: ((u && u.name) || (u && u.email.split('@')[0]) || 'My') + "'s Studio", owner_id: uid, plan: 'free', seat_limit: 1, created_at: new Date().toISOString() };
  F.db.accounts.push(a);
  F.db.accountMembers.push({ account_id: a.id, invited_email: u ? u.email : '', user_id: uid, role: 'owner', status: 'active' });
  return a;
}
function applyPlan(a, plan) {
  const lim = (F.db.plans.find((p) => p.id === plan) || {}).limits || {};
  a.plan = plan; a.plan_period = 'lifetime'; a.plan_until = null;
  a.seat_limit = Math.max(1, cap(lim, 'seats') ?? 1000);
  return null;
}
function activate(orderId, paymentId, raw) {
  const pay = F.db.payments.find((x) => x.razorpay_order_id === orderId);
  if (!pay) throw Object.assign(new Error('No payment with that order id'), { code: '22023' });
  if (pay.status === 'paid') return { already: true, pay };
  const a = accountForBuyer(pay.user_id);
  applyPlan(a, pay.plan_id);
  Object.assign(pay, { status: 'paid', razorpay_payment_id: paymentId, paid_at: new Date().toISOString(), account_id: a.id, ends_at: null, raw });
  if (!F.db.members.has(pay.user_id)) F.db.members.set(pay.user_id, { role: 'user', disabled_at: null });
  return { already: false, pay };
}

export const USERS = {
  'tok-admin': { id: '00000000-0000-4000-8000-00000000000a', email: 'admin@example.com' },
  'tok-amy':   { id: '00000000-0000-4000-8000-0000000000a1', email: 'amy@example.com' },
  'tok-ben':   { id: '00000000-0000-4000-8000-0000000000b1', email: 'ben@example.com' },
  // Section 14: Cal asks and is approved; Dan asks and is declined.
  'tok-cal':   { id: '00000000-0000-4000-8000-0000000000c1', email: 'cal@example.com', name: 'Cal Fernandes' },
  'tok-dan':   { id: '00000000-0000-4000-8000-0000000000d1', email: 'dan@example.com' }
};
const DAY = 86400e3;
const sha = (s) => createHash('sha256').update(s).digest('hex');
export function freshDb() {
  const now = Date.now();
  return {
    deployed: true,
    codes: [
      { id: 'c1', code: 'AMYCODE23456', pass_type: 'standard', target_project_id: null, max_redemptions: 1, redemptions_count: 0, expires_at: null, revoked_at: null, label: 'Amy', created_at: new Date(now).toISOString() },
      { id: 'c2', code: 'BENCODE23456', pass_type: 'standard', target_project_id: null, max_redemptions: 1, redemptions_count: 0, expires_at: null, revoked_at: null, label: 'Ben', created_at: new Date(now).toISOString() },
      { id: 'c4', code: 'LINKCODE2345', pass_type: 'standard', target_project_id: null, max_redemptions: 50, redemptions_count: 0, expires_at: null, revoked_at: null, label: 'Crew link', created_at: new Date(now).toISOString() },
      { id: 'c3', code: 'PASSCODE2345', pass_type: 'screening_pass', target_project_id: 'p1', max_redemptions: 50, redemptions_count: 0, expires_at: new Date(now + 2 * 3600e3).toISOString(), revoked_at: null, label: 'Investor', created_at: new Date(now).toISOString() }
    ],
    tickets: new Map(),
    members: new Map([[USERS['tok-admin'].id, { role: 'admin', disabled_at: null }]]),
    sessions: new Map(),
    requests: new Map(),   // section 14: user_id -> invite_requests row
    redemptions: [],
    projects: [{ id: 'p1', title: 'Dragon', format: 'feature', owner_id: USERS['tok-admin'].id, account_id: 'acc1', created_at: new Date(now - 5 * DAY).toISOString(), updated_at: new Date(now - DAY).toISOString() }],
    // section 15: one organisation, owned by the admin, with Amy invited
    accounts: [{ id: 'acc1', name: 'Dragon Pictures', owner_id: USERS['tok-admin'].id, plan: 'indie', seat_limit: 5, created_at: new Date(now - 10 * DAY).toISOString() }],
    accountMembers: [
      { account_id: 'acc1', invited_email: 'admin@example.com', user_id: USERS['tok-admin'].id, role: 'owner', status: 'active' },
      { account_id: 'acc1', invited_email: 'amy@example.com', user_id: null, role: 'member', status: 'pending' }
    ],
    data: { p1: {
      story: { source: 'A student is turned down for a college seat. He becomes somebody else.', framework: 'three_act',
               marks: [{ id: 'm', start: 0, end: 43, text: 'A student is turned down for a college seat', tags: { three_act: 'inciting' } }], tension: {} },
      feature: { s2_log_final: 'A young man living on a forged degree is recognised.', s4_name: 'RAGAVAN', s4_want: 'Status.' },
      scenes: { scenes: [{ id: 's1', number: '1', intExt: 'INT', dayNight: 'DAY', location: 'College', synopsis: 'The rejection.', eighths: 8, elements: {} }] },
      contacts: { contacts: [{ name: 'SECRET PHONE 98400' }] }
    } },
    // section 16
    plans: [
      { id: 'free',    name: 'Free',    blurb: 'Admitted, unpaid. One film in the cloud.', features: { sample_only: true, new_projects: false }, price_paise: 0, monthly_paise: 0, yearly_paise: 0, limits: { projects: 1, collaborators: 0, shares: 0, seats: 1, extension: false }, sort: 0, active: true },
      { id: 'starter', name: 'Starter', blurb: 'One writer, a few films, a couple of readers.', features: {}, price_paise: 299900, monthly_paise: 29900, yearly_paise: 299900, limits: { projects: 3, collaborators: 2, shares: 3, seats: 1, extension: true }, sort: 1, active: true },
      { id: 'indie',   name: 'Indie',   blurb: 'A small team taking a film through production.', features: {}, price_paise: 799900, monthly_paise: 79900, yearly_paise: 799900, limits: { projects: 10, collaborators: 5, shares: 10, seats: 3, extension: true }, sort: 2, active: true },
      { id: 'pro',     name: 'Pro',     blurb: 'A production house. No caps.', features: {}, price_paise: 1999900, monthly_paise: 199900, yearly_paise: 1999900, limits: { projects: null, collaborators: null, shares: null, seats: 10, extension: true }, sort: 3, active: true }
    ],
    payments: [],
    calls: []
  };
}

const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const pgErr = (route, code, message, status = 400) => json(route, status, { code, message, details: null, hint: null });

function rpc(name, args, user, route) {
  F.db.calls.push(name);
  if (!F.db.deployed) return pgErr(route, 'PGRST202', `Could not find the function public.${name} in the schema cache`, 404);
  const isMember = (u) => { const m = u && F.db.members.get(u.id); return !!(m && !m.disabled_at); };
  const isAdmin = (u) => !!u && F.db.members.get(u.id)?.role === 'admin' && !F.db.members.get(u.id)?.disabled_at;
  const valid = (c) => c && !c.revoked_at && (!c.expires_at || Date.parse(c.expires_at) > Date.now()) && c.redemptions_count < c.max_redemptions;
  // 14.4: membership arriving by any route closes a pending request.
  const admit = (uid, role = 'user') => {
    const cur = F.db.members.get(uid);
    F.db.members.set(uid, { role: cur ? cur.role : role, disabled_at: null });
    const r = F.db.requests.get(uid);
    if (r && r.status === 'pending') { r.status = 'approved'; r.decided_at = r.decided_at || new Date().toISOString(); }
  };
  const fmtD = (ts) => new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  switch (name) {
    case 'billing_status': {
      if (!user) return pgErr(route, '42501', 'Sign in first');
      const pl = userPlan(user.id);
      const acc = F.db.accounts.filter((a) => a.owner_id === user.id).sort((x, y) => PLAN_RANK[accountPlan(y)] - PLAN_RANK[accountPlan(x)])[0] || null;
      const lim = userLimits(user.id);
      return json(route, 200, {
        plan: pl, plan_name: (F.db.plans.find((p) => p.id === pl) || {}).name, limits: lim,
        features: (F.db.plans.find((p) => p.id === pl) || {}).features || {},
        account_id: acc ? acc.id : null, account_name: acc ? acc.name : null,
        plan_until: pl !== 'free' && acc ? acc.plan_until : null, bought_plan: acc ? acc.plan : null,
        lapsed: !!(acc && acc.plan !== 'free' && acc.plan_until && Date.parse(acc.plan_until) <= Date.now()),
        disabled: !!F.db.members.get(user.id)?.disabled_at, member: isMember(user),
        usage: { projects: F.db.projects.filter((p) => p.owner_id === user.id).length, shares: 0, collaborators: 0,
                 seats: acc ? F.db.accountMembers.filter((m) => m.account_id === acc.id).length : 0 },
        payments: F.db.payments.filter((x) => x.user_id === user.id).slice(-12).reverse()
      });
    }
    case 'admin_set_plan': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const p = F.db.plans.find((x) => x.id === args.p_id);
      if (!p) return pgErr(route, '22023', 'No such plan');
      const patch = args.p_patch || {};
      if (patch.limits) for (const k of Object.keys(patch.limits)) if (!['projects','collaborators','shares','seats','extension'].includes(k)) return pgErr(route, '22023', `Unknown limit "${k}"`);
      if (p.id === 'free' && ((patch.price_paise || 0) > 0 || (patch.monthly_paise || 0) > 0 || (patch.yearly_paise || 0) > 0)) return pgErr(route, '22023', 'The free plan cannot have a price');
      if (patch.name) p.name = String(patch.name).trim().slice(0, 40) || p.name;
      if ('blurb' in patch) p.blurb = String(patch.blurb || '').slice(0, 200);
      if (Number.isInteger(patch.price_paise)) p.price_paise = patch.price_paise;
      if (Number.isInteger(patch.monthly_paise)) p.monthly_paise = patch.monthly_paise;
      if (Number.isInteger(patch.yearly_paise)) p.yearly_paise = patch.yearly_paise;
      if (patch.limits) p.limits = { ...p.limits, ...patch.limits };
      if (patch.features) {
        if (typeof patch.features !== 'object') return pgErr(route, '22023', 'features must be an object');
        for (const k of Object.keys(patch.features)) if (typeof patch.features[k] !== 'boolean') return pgErr(route, '22023', `feature "${k}" must be true or false`);
        p.features = { ...patch.features };
      }
      if (typeof patch.active === 'boolean') p.active = patch.active;
      return json(route, 200, p);
    }
    case 'admin_list_payments': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, [...F.db.payments].reverse().map((x) => ({ ...x, email: (Object.values(USERS).find((u) => u.id === x.user_id) || {}).email,
        account_name: (F.db.accounts.find((a) => a.id === x.account_id) || {}).name })));
    }
    case 'admin_grant_plan': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const a = accountForBuyer(args.p_user);
      applyPlan(a, args.p_plan);   // p_days is ignored: for good
      F.db.payments.push({ id: 'pay' + F.db.payments.length, user_id: args.p_user, account_id: a.id, plan_id: args.p_plan, period: 'grant', amount_paise: 0,
        status: 'granted', note: args.p_note || null, created_at: new Date().toISOString(), paid_at: new Date().toISOString(), ends_at: null });
      if (!F.db.members.has(args.p_user)) F.db.members.set(args.p_user, { role: 'user', disabled_at: null });
      return json(route, 200, null);
    }
    case 'admin_billing_overview': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const paid = F.db.payments.filter((x) => x.status === 'paid');
      const by = {}; for (const a of F.db.accounts) { const k = accountPlan(a); by[k] = (by[k] || 0) + 1; }
      return json(route, 200, { paid_30d_paise: paid.reduce((n, x) => n + x.amount_paise, 0), paid_total_paise: paid.reduce((n, x) => n + x.amount_paise, 0),
        payments_30d: paid.length, active_by_plan: by, lapsing_14d: 0, refunds: F.db.payments.filter((x) => x.status === 'refunded').length });
    }
    case 'studio_status': {
      const m = user && F.db.members.get(user.id);
      const r = user && F.db.requests.get(user.id);
      const pend = isAdmin(user) ? [...F.db.requests.values()].filter((x) => x.status === 'pending').length : 0;
      return json(route, 200, [{ registered: !!m, role: m ? m.role : '', disabled: !!(m && m.disabled_at),
        request_status: r ? r.status : '', requested_at: r ? r.requested_at : null, decided_at: r ? r.decided_at : null,
        decision_note: r ? r.decision_note : null, pending_requests: pend }]);
    }
    case 'request_invite': {
      if (!user) return pgErr(route, '42501', 'Sign in with Google to request an invite');
      if (isMember(user)) return pgErr(route, '22023', 'This account is already a member');
      const now = new Date().toISOString();
      const note = String(args.p_note || '').trim().slice(0, 1000) || null;
      let r = F.db.requests.get(user.id);
      if (!r) {
        r = { user_id: user.id, email: user.email, display_name: user.name || null, note, user_agent: args.p_user_agent || null,
              status: 'pending', times_asked: 1, requested_at: now, decided_at: null, decided_by: null, decision_note: null };
      } else if (r.status === 'pending') {
        if (note) r.note = note;
      } else if (r.status === 'declined' && Date.now() - Date.parse(r.decided_at) < 7 * DAY) {
        return pgErr(route, '22023', `This request was declined on ${fmtD(r.decided_at)}. You can ask again from ${fmtD(Date.parse(r.decided_at) + 7 * DAY)}.`);
      } else {
        Object.assign(r, { status: 'pending', requested_at: now, times_asked: r.times_asked + 1, decided_at: null, decided_by: null, decision_note: null, note, user_agent: args.p_user_agent || null });
      }
      F.db.requests.set(user.id, r);
      return json(route, 200, [{ status: r.status, requested_at: r.requested_at, decided_at: r.decided_at, decision_note: r.decision_note, times_asked: r.times_asked }]);
    }
    case 'admin_list_requests': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const rows = [...F.db.requests.values()].filter((r) => !args.p_status || r.status === args.p_status)
        .sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || Date.parse(b.requested_at) - Date.parse(a.requested_at))
        .map((r) => ({ ...r, decided_by_email: r.decided_by ? (Object.values(USERS).find((x) => x.id === r.decided_by) || {}).email || null : null }));
      return json(route, 200, rows);
    }
    case 'admin_overview': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const reqs = [...F.db.requests.values()];
      const mem = [...F.db.members.values()];
      const live = [...F.db.sessions.values()].filter((s) => Date.now() - s.last < 90e3).length;
      return json(route, 200, {
        users_total: Object.keys(USERS).length, users_active_7d: Object.keys(USERS).length, users_new_30d: 2,
        members_active: mem.filter((m) => !m.disabled_at).length, members_admin: mem.filter((m) => m.role === 'admin' && !m.disabled_at).length,
        members_disabled: mem.filter((m) => m.disabled_at).length,
        requests_pending: reqs.filter((r) => r.status === 'pending').length, requests_approved: reqs.filter((r) => r.status === 'approved').length,
        requests_declined: reqs.filter((r) => r.status === 'declined').length,
        accounts: F.db.accounts.length, account_members_active: F.db.accountMembers.filter((m) => m.status === 'active').length,
        account_members_pending: F.db.accountMembers.filter((m) => m.status === 'pending').length,
        projects: F.db.projects.length, projects_new_30d: F.db.projects.length, projects_updated_7d: F.db.projects.length,
        collaborators: 0, shares_live: 0, sessions_live: live, sessions_24h: F.db.sessions.size,
        codes_active: F.db.codes.filter(valid).length, generated_at: new Date().toISOString()
      });
    }
    case 'admin_list_accounts': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, F.db.accounts.map((a) => ({
        id: a.id, name: a.name, owner_email: (Object.values(USERS).find((x) => x.id === a.owner_id) || {}).email || null,
        plan: a.plan, seat_limit: a.seat_limit,
        seats_used: F.db.accountMembers.filter((m) => m.account_id === a.id && m.status === 'active').length,
        members_pending: F.db.accountMembers.filter((m) => m.account_id === a.id && m.status === 'pending').length,
        projects: F.db.projects.filter((p) => p.account_id === a.id).length, created_at: a.created_at
      })));
    }
    case 'admin_list_users': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, Object.values(USERS).map((u) => {
        const m = F.db.members.get(u.id), r = F.db.requests.get(u.id), s = F.db.sessions.get(u.id);
        return { user_id: u.id, email: u.email, display_name: u.name || null, created_at: new Date(Date.now() - 3 * DAY).toISOString(),
                 last_sign_in_at: new Date().toISOString(), studio_role: m ? m.role : '', disabled_at: m ? m.disabled_at : null,
                 request_status: r ? r.status : '', projects: F.db.projects.filter((p) => p.owner_id === u.id).length,
                 accounts: F.db.accountMembers.filter((am) => am.user_id === u.id && am.status === 'active').length,
                 last_heartbeat: s ? new Date(s.last).toISOString() : null };
      }));
    }
    case 'admin_decide_request': {
      if (!isAdmin(user)) return pgErr(route, '42501', 'Administrators only');
      const r = F.db.requests.get(args.p_user);
      if (!r) return pgErr(route, '22023', 'No such request');
      if (args.p_approve) admit(args.p_user);
      Object.assign(r, { status: args.p_approve ? 'approved' : 'declined', decided_at: new Date().toISOString(), decided_by: user.id,
                         decision_note: String(args.p_note || '').trim().slice(0, 500) || null });
      return json(route, 200, null);
    }
    case 'verify_invite': {
      const c = F.db.codes.find((x) => x.code === args.p_code);
      if (!valid(c)) return pgErr(route, '22023', 'That code is not valid');
      if (c.pass_type !== 'standard') return pgErr(route, '22023', 'That is a screening pass — open it in the screening room');
      const raw = 'ticket-' + Math.random().toString(36).slice(2);
      F.db.tickets.set(sha(raw), { code_id: c.id, expires: Date.now() + 600e3, used: false });
      return json(route, 200, [{ ticket: raw, pass_type: 'standard', expires_at: new Date(Date.now() + 600e3).toISOString() }]);
    }
    case 'redeem_invite': {
      if (!user) return pgErr(route, '42501', 'Sign in with Google to redeem a code');
      if (isMember(user)) return json(route, 200, [{ role: F.db.members.get(user.id).role, invite_code_id: null }]);
      const t = F.db.tickets.get(sha(args.p_ticket || ''));
      if (!t || t.used || t.expires < Date.now()) return pgErr(route, '22023', 'That sign-in took too long or the code was already used — enter the code again');
      const c = F.db.codes.find((x) => x.id === t.code_id);
      if (!valid(c)) return pgErr(route, '22023', 'That code is not valid');
      c.redemptions_count++; t.used = true;
      admit(user.id);
      F.db.redemptions.push({ id: 'r' + F.db.redemptions.length, code_id: c.id, user_id: user.id, redeemed_at: new Date().toISOString() });
      return json(route, 200, [{ role: 'user', invite_code_id: c.id }]);
    }
    case 'session_acquire': case 'session_takeover': case 'session_ping': case 'session_release': {
      if (!user) return pgErr(route, '42501', 'Not signed in');
      if (name !== 'session_release' && !isMember(user)) return pgErr(route, 'P0401', 'This account has no active invite');
      const cur = F.db.sessions.get(user.id);
      const fresh = cur && Date.now() - cur.last < 90e3;
      if (name === 'session_release') { if (cur && cur.session_id === args.p_session) F.db.sessions.delete(user.id); return json(route, 200, [{ status: 'released' }]); }
      if (name === 'session_acquire' && fresh && cur.session_id !== args.p_session) return json(route, 200, [{ status: 'conflict', other_last_seen: new Date(cur.last).toISOString(), other_user_agent: cur.ua }]);
      if (name === 'session_ping' && fresh && cur.session_id !== args.p_session) return json(route, 200, [{ status: 'conflict' }]);
      F.db.sessions.set(user.id, { session_id: args.p_session, last: Date.now(), ua: args.p_user_agent || (cur && cur.ua) || '' });
      return json(route, 200, [{ status: 'ok', other_last_seen: null, other_user_agent: null }]);
    }
    case 'admin_list_members':
      if (!user || F.db.members.get(user.id)?.role !== 'admin') return pgErr(route, '42501', 'Administrators only');
      return json(route, 200, [...F.db.members.entries()].map(([id, m]) => {
        const u = Object.values(USERS).find((x) => x.id === id); const s = F.db.sessions.get(id);
        return { user_id: id, email: u ? u.email : id, role: m.role, disabled_at: m.disabled_at, created_at: new Date().toISOString(),
                 last_heartbeat: s ? new Date(s.last).toISOString() : null, client_ip: '203.0.113.9', user_agent: s ? s.ua : null };
      }));
    case 'admin_create_invite': {
      if (!user || F.db.members.get(user.id)?.role !== 'admin') return pgErr(route, '42501', 'Administrators only');
      const c = { id: 'c' + (F.db.codes.length + 1), code: 'NEWCODE' + (F.db.codes.length + 10000), pass_type: args.p_pass_type,
        target_project_id: args.p_target_project, max_redemptions: args.p_max_redemptions, redemptions_count: 0,
        expires_at: args.p_expires_at, revoked_at: null, label: args.p_label, created_at: new Date().toISOString() };
      F.db.codes.unshift(c);
      return json(route, 200, c);
    }
    case 'admin_revoke_invite': { const c = F.db.codes.find((x) => x.id === args.p_id); if (c) c.revoked_at = new Date().toISOString(); return json(route, 200, null); }
    case 'admin_terminate_session': {
      F.db.sessions.delete(args.p_user);
      if (args.p_disable) { const m = F.db.members.get(args.p_user); if (m) m.disabled_at = new Date().toISOString(); }
      return json(route, 200, null);
    }
    case 'screening_open': {
      const c = F.db.codes.find((x) => x.code === args.p_code);
      if (!c || c.pass_type !== 'screening_pass' || !valid(c)) return pgErr(route, '22023', 'That screening pass is not valid');
      c.redemptions_count++;
      const aid = Math.random().toString(16).slice(2, 10).toUpperCase();
      F.db.redemptions.push({ id: 'r' + F.db.redemptions.length, code_id: c.id, viewer_email: args.p_viewer_email, access_id: aid, redeemed_at: new Date().toISOString() });
      const p = F.db.projects.find((x) => x.id === c.target_project_id);
      const d = F.db.data[p.id] || {};
      const scopes = {}; for (const k of ['story', 'feature', 'short', 'scenes']) if (d[k]) scopes[k] = d[k];
      return json(route, 200, [{ project_id: p.id, title: p.title, format: p.format, access_id: aid, expires_at: c.expires_at, scopes }]);
    }
    default:
      return json(route, 200, []);
  }
}

/* A JWT-shaped token for `tok`, because supabase-js's setSession()
   decodes the access token locally and refuses anything else. The
   signature is not checked by the fake (nor by the client). */
export function jwtFor(tok) {
  const u = USERS[tok];
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return [b64({ alg: 'HS256', typ: 'JWT' }),
          b64({ sub: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', tok, exp: Math.floor(Date.now() / 1000) + 3600 }),
          'sig'].join('.');
}
function userFromBearer(auth) {
  if (USERS[auth]) return USERS[auth];
  const parts = String(auth).split('.');
  if (parts.length !== 3) return null;
  try { return USERS[JSON.parse(Buffer.from(parts[1], 'base64url').toString()).tok] || null; } catch (e) { return null; }
}

export async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  const auth = (req.headers()['authorization'] || '').replace(/^Bearer\s+/i, '');
  const user = userFromBearer(auth);
  const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)/);
  if (m) {
    let args = {}; try { args = JSON.parse(req.postData() || '{}'); } catch (e) {}
    return rpc(m[1], args, user, route);
  }
  if (url.pathname.startsWith('/rest/v1/plans')) return json(route, 200, user ? [...F.db.plans].sort((a, b) => a.sort - b.sort) : []);
  if (url.pathname.startsWith('/rest/v1/payments')) return json(route, 200, user ? F.db.payments.filter((x) => x.user_id === user.id) : []);

  /* ---- the two edge functions, as the browser reaches them ---- */
  if (url.pathname === '/functions/v1/rzp-order' && req.method() === 'POST') {
    if (!user) return json(route, 401, { error: 'Sign in first.' });
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    const plan = F.db.plans.find((p) => p.id === body.plan && p.active);
    F.db.calls.push(`fn:rzp-order ${body.plan} ${body.period}`);
    if (F.db.members.get(user.id)?.disabled_at) return json(route, 403, { error: 'This account has been disabled by an administrator' });
    if (!plan) return json(route, 400, { error: 'That plan is not for sale' });
    if (body.period === 'month' || body.period === 'year') return json(route, 400, { error: 'Plans are bought once, for good — not by the month or the year' });
    const amount = plan.price_paise;
    if (!amount) return json(route, 400, { error: 'That plan is not for sale' });
    const id = 'pay' + F.db.payments.length;
    const order_id = 'order_' + Math.random().toString(36).slice(2, 10);
    F.db.payments.push({ id, user_id: user.id, account_id: body.account_id || null, plan_id: plan.id, period: body.period, amount_paise: amount, currency: 'INR',
      razorpay_order_id: order_id, razorpay_payment_id: null, status: 'created', created_at: new Date().toISOString() });
    return json(route, 200, { order_id, amount, currency: 'INR', key_id: RZP.keyId, plan: plan.id, period: body.period, plan_name: plan.name, payment_id: id, prefill: { email: user.email } });
  }
  if (url.pathname === '/functions/v1/rzp-verify' && req.method() === 'POST') {
    if (!user) return json(route, 401, { error: 'Sign in first.' });
    let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
    const expected = await signFor(body.razorpay_order_id || '', body.razorpay_payment_id || '');
    if (!body.razorpay_signature || expected !== String(body.razorpay_signature).toLowerCase()) {
      F.db.calls.push('fn:rzp-verify bad');
      return json(route, 400, { error: 'The payment could not be verified. If money left your account, it will be matched within a few minutes or refunded by Razorpay.' });
    }
    const pay = F.db.payments.find((x) => x.razorpay_order_id === body.razorpay_order_id);
    if (!pay) return json(route, 404, { error: 'No such order.' });
    if (pay.user_id !== user.id) return json(route, 403, { error: 'That order belongs to another account.' });
    const r = activate(body.razorpay_order_id, body.razorpay_payment_id, body);
    F.db.calls.push('fn:rzp-verify ok');
    return json(route, 200, { ok: true, plan: r.pay.plan_id, ends_at: r.pay.ends_at, account_id: r.pay.account_id, already: r.already });
  }

  if (url.pathname.startsWith('/rest/v1/invite_codes')) {
    if (!user || F.db.members.get(user.id)?.role !== 'admin') return json(route, 200, []);
    return json(route, 200, F.db.codes);
  }
  if (url.pathname.startsWith('/rest/v1/invite_redemptions')) return json(route, 200, user && F.db.members.get(user.id)?.role === 'admin' ? F.db.redemptions : []);
  if (url.pathname.startsWith('/rest/v1/projects')) {
    if (req.method() === 'GET') return json(route, 200, user ? F.db.projects.filter((p) => p.owner_id === user.id).map(({ id, title, format }) => ({ id, title, format })) : []);
    if (req.method() === 'PATCH' && user) {
      // cloud.js updates first and inserts only on an empty answer, so
      // the fake must answer a PATCH with the matching row or every
      // pulled project would be re-inserted and hit the cap.
      const id = (url.searchParams.get('id') || '').replace(/^eq\./, '');
      const hit = F.db.projects.filter((p) => p.id === id && p.owner_id === user.id);
      F.db.calls.push('write:projects'); return json(route, 200, hit.map(({ id }) => ({ id })));
    }
    if (req.method() === 'POST' && user) {
      // 16.8: enforce_project_limit, as the trigger would.
      const lim = userLimits(user.id), c = cap(lim, 'projects');
      const n = F.db.projects.filter((p) => p.owner_id === user.id).length;
      if (c !== null && n >= c) {
        F.db.calls.push('write:projects:P0402');
        const pl = userPlan(user.id);
        return pgErr(route, 'P0402', `Your ${pl[0].toUpperCase() + pl.slice(1)} plan syncs up to ${c} project${c === 1 ? '' : 's'}. Upgrade to add another to the cloud; it is still saved on this device.`);
      }
      let body = {}; try { body = JSON.parse(req.postData() || '{}'); } catch (e) {}
      F.db.projects.push({ id: body.id || 'p' + F.db.projects.length, title: body.title || '', format: body.format || 'feature', owner_id: user.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    F.db.calls.push('write:projects'); return json(route, 201, []);
  }
  if (url.pathname.startsWith('/rest/v1/')) {
    if (req.method() !== 'GET') F.db.calls.push('write:' + url.pathname.split('/')[3]);
    return json(route, req.method() === 'GET' ? 200 : 201, []);
  }
  if (url.pathname.startsWith('/auth/v1/user')) return user ? json(route, 200, { id: user.id, email: user.email, aud: 'authenticated' }) : json(route, 401, {});
  return json(route, 200, {});
}

export function sessionFor(tok) {
  const u = USERS[tok];
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return JSON.stringify({ access_token: tok, refresh_token: 'r-' + tok, token_type: 'bearer', expires_in: 3600, expires_at: exp,
    user: { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: new Date().toISOString(),
            app_metadata: { provider: 'google' }, user_metadata: u.name ? { full_name: u.name } : {}, created_at: new Date().toISOString() } });
}


F.reset();
