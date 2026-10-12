/* ============================================================
   A FAKE for the people half of admin console v2
   ------------------------------------------------------------
   Sits in front of scripts/fake-supabase.mjs and answers the RPCs the
   Customer 360 drawer, the Support tab and the Access & sharing lists
   call (schema §42 and §45): studio_role, admin_customer, admin_list_notes,
   admin_add_note, admin_issue_invoice, admin_reset_user, admin_list_support,
   admin_log_ticket, admin_update_ticket, admin_list_passes,
   admin_revoke_pass, admin_extend_pass, admin_list_shares,
   admin_revoke_share. Everything else falls through to fake-supabase.

   Own filename on purpose (another harness, fake-admin-rpcs.mjs, belongs to
   a different part of the console). `P` is the live state a proof reaches
   into: P.role is the caller's studio_role(), the rest is data.

   The fake never sends a project title or stored work, like the real RPC;
   prove-admin-people asserts the drawer prints none either.
   ============================================================ */
import { F, USERS, handle as baseHandle } from './fake-supabase.mjs';

const DAY = 86400e3;
const iso = (ms) => new Date(ms).toISOString();
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
const pgErr = (route, code, message, status = 400) => json(route, status, { code, message, details: null, hint: null });

export const P = {
  role: 'owner',
  tickets: [], notes: new Map(), invoices: [], audit: [], shares: [], extraPayments: new Map(), users: null,
  reset() {
    const now = Date.now();
    P.role = 'owner';
    P.tickets = [
      { id: 't1', email: 'amy@example.com', subject: 'Cannot export my script', body: 'The export button does nothing on Safari.', status: 'open', assignee: null, notes: 0, created_at: iso(now - 3 * 3600e3) },
      { id: 't2', email: 'zed@nowhere.test', subject: 'Invoice for last month', body: 'Please send a copy.', status: 'waiting', assignee: USERS['tok-admin'].id, notes: 2, created_at: iso(now - 2 * DAY) },
      { id: 't3', email: 'ben@example.com', subject: 'Thanks, fixed', body: '', status: 'closed', assignee: null, notes: 1, created_at: iso(now - 9 * DAY) }
    ];
    P.notes = new Map([[USERS['tok-amy'].id, [
      { id: 'n1', at: iso(now - DAY), author: USERS['tok-admin'].id, author_email: 'admin@example.com', body: 'Asked for a longer trial; fine to give 7 days.' }
    ]]]);
    P.invoices = [];
    P.audit = [{ id: 'a1', at: iso(now - 2 * DAY), actor_email: 'admin@example.com', action: 'grant_trial', target_kind: 'user', target_id: USERS['tok-amy'].id, note: 'launch week' }];
    P.shares = [
      { id: 's1', project_id: 'p1', project_title: 'Dragon', owner_email: 'admin@example.com', role: 'viewer', created_by_email: 'admin@example.com', created_at: iso(now - 3 * DAY), expires_at: null, active: true },
      { id: 's2', project_id: 'p1', project_title: 'Dragon', owner_email: 'admin@example.com', role: 'editor', created_by_email: 'admin@example.com', created_at: iso(now - 20 * DAY), expires_at: iso(now - DAY), active: false }
    ];
    P.extraPayments = new Map();
    F.db.rreqs = [{ id: 'rq1', payment_id: 'pay0', user_id: USERS['tok-amy'].id, category: 'duplicate', message: 'I paid twice by mistake.', status: 'pending', created_at: iso(now - DAY), decided_at: null }];
    F.db.requests.set(USERS['tok-dan'].id, { user_id: USERS['tok-dan'].id, email: 'dan@example.com', display_name: 'Dan', note: 'Film student', status: 'pending', times_asked: 1, requested_at: iso(now - 5 * 3600e3), decided_at: null });
    F.db.members.set(USERS['tok-amy'].id, { role: 'user', disabled_at: null });
    F.db.sessions.set(USERS['tok-amy'].id, { session_id: 'sess-amy', last: Date.now(), ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0 Safari/537.36' });
  }
};
P.reset();

const userById = (id) => Object.values(USERS).find((u) => u.id === id);
const needs = (route, roles) => {
  if (P.role === 'owner' || roles.includes(P.role)) return null;
  return pgErr(route, '42501', `Your role (${P.role}) cannot do this. It needs the ${roles.join(' or ')} role.`);
};

function customer(id) {
  const u = userById(id);
  if (!u) return null;
  const now = Date.now();
  const m = F.db.members.get(id);
  const live = F.db.sessions.get(id);
  const isAmy = u === USERS['tok-amy'];
  const pays = isAmy ? [
    { id: 'pay0', plan_id: 'starter', period: 'once', status: 'paid', amount_paise: 299900, currency: 'INR', discount_paise: 0, credit_paise: 0, promo_code: 'LAUNCH10', razorpay_order_id: 'order_x', razorpay_payment_id: 'pay_AmyTest0001', note: null, created_at: iso(now - 6 * DAY), paid_at: iso(now - 6 * DAY) },
    { id: 'pay1', plan_id: 'indie', period: 'grant', status: 'granted', amount_paise: 0, currency: 'INR', discount_paise: 0, credit_paise: 0, promo_code: null, razorpay_order_id: null, razorpay_payment_id: null, note: null, created_at: iso(now - 2 * DAY), paid_at: iso(now - 2 * DAY) }
  ].concat(P.extraPayments.get(id) || []) : [];
  const invs = P.invoices.filter((i) => i.user_id === id);
  const trialRow = F.db.trials && F.db.trials.get(id);
  return {
    generated_at: iso(now),
    identity: { id, email: u.email, name: u.name || null, created_at: iso(now - 20 * DAY), email_confirmed_at: iso(now - 20 * DAY), last_sign_in_at: iso(now - 3600e3) },
    standing: { is_member: !!m, role: m ? m.role : null, disabled_at: m ? m.disabled_at : null, member_since: m ? iso(now - 19 * DAY) : null,
      plan: isAmy ? 'starter' : 'free', entitled: !!m, purchases_required: false, grandfathered: false,
      admitted_by: m && isAmy ? { pass_type: 'standard', label: 'Amy' } : null, email_grant: null },
    trial: { started_at: m ? iso(now - 3 * 3600e3) : null, minutes: trialRow ? trialRow.minutes : 10080, source: 'admin', scope: 'full',
      ends_at: m ? iso(now + 6.9 * DAY) : null, active: !!m, seconds_left: m ? 6 * 86400 + 3600 * 20 : null },
    payments: pays.map((p) => ({ ...p })),
    invoices: invs.map((i) => ({ id: i.id, number: i.number, payment_id: i.payment_id, plan_name: 'Basic', amount_paise: i.amount_paise, currency: 'INR', issued_at: i.issued_at, emailed_at: null })),
    refunds: [],
    refund_requests: isAmy ? F.db.rreqs.filter((q) => q.user_id === id) : [],
    referral: { code: isAmy ? 'AMY-REF' : null, credits: isAmy ? [{ id: 'rc1', payment_id: 'pay0', amount_paise: 29900, status: 'owed', created_at: iso(now - DAY), paid_at: null }] : [] },
    sessions: {
      device_lock: live ? { last_heartbeat: iso(live.last), client_ip: '203.0.113.9', user_agent: live.ua } : null,
      auth: { count: 2, last_active: iso(now - 3600e3), recent: [{ created_at: iso(now - 3600e3), user_agent: 'Mozilla/5.0 (Macintosh) Chrome/126.0 Safari/537.36', ip: '203.0.113.9' }] }
    },
    redemptions: isAmy ? [{ pass_type: 'standard', label: 'Amy', redeemed_at: iso(now - 19 * DAY) }] : [],
    work: { projects: 3, formats: { feature: 2, short: 1 }, total_bytes: 482113, last_sync: iso(now - 4 * 3600e3), collaborating_on: 1, shares_created: 2,
      scopes: [{ scope: 'script', rows: 3, bytes: 301220 }, { scope: 'scenes', rows: 3, bytes: 120400 }, { scope: 'story', rows: 2, bytes: 60493 }] },
    orgs: { owned: isAmy ? [{ id: 'acc9', name: 'Amy Films', plan: 'starter', plan_until: null, seat_limit: 3, storage_limit_mb: 500, seats_used: 1 }] : [],
            member_of: isAmy ? [{ account_id: 'acc1', name: 'Dragon Pictures', role: 'member', status: 'pending', joined_at: null }] : [] },
    notes: (P.notes.get(id) || []).slice().reverse(),
    audit: P.audit.filter((a) => a.target_id === id).reverse()
  };
}

export async function handle(route) {
  const req = route.request();
  const url = new URL(req.url());
  const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)/);
  if (!m) return baseHandle(route);
  const name = m[1];
  const mine = ['studio_role', 'admin_customer', 'admin_list_notes', 'admin_add_note', 'admin_issue_invoice', 'admin_reset_user', 'admin_delete_user', 'admin_list_support',
    'admin_log_ticket', 'admin_update_ticket', 'admin_list_passes', 'admin_revoke_pass', 'admin_extend_pass', 'admin_list_shares', 'admin_revoke_share',
    'admin_grant_trial'];
  if (!mine.includes(name)) return baseHandle(route);
  let args = {}; try { args = JSON.parse(req.postData() || '{}'); } catch (e) { /* none */ }
  F.db.calls.push(name);
  const auth = (req.headers()['authorization'] || '').replace(/^Bearer\s+/i, '');
  const isAdmin = auth === 'tok-admin' || /tok":"tok-admin/.test(Buffer.from(auth.split('.')[1] || '', 'base64url').toString());
  if (!isAdmin) return pgErr(route, '42501', 'Administrators only');
  const now = Date.now();
  let r;
  switch (name) {
    case 'studio_role': return json(route, 200, P.role);
    case 'admin_customer': { const c = customer(args.p_user); return c ? json(route, 200, c) : pgErr(route, '22023', 'No such user'); }
    case 'admin_list_notes': return json(route, 200, (P.notes.get(args.p_user) || []).slice().reverse());
    case 'admin_add_note': {
      const body = String(args.p_body || '').trim();
      if (!body || body.length > 1000) return pgErr(route, '22023', 'A note is 1 to 1000 characters.');
      const n = { id: 'n' + Math.random().toString(36).slice(2, 7), at: iso(now), author: USERS['tok-admin'].id, author_email: 'admin@example.com', body };
      P.notes.set(args.p_user, (P.notes.get(args.p_user) || []).concat(n));
      P.audit.push({ id: 'a' + P.audit.length + 10, at: iso(now), actor_email: 'admin@example.com', action: 'add_note', target_kind: 'user', target_id: args.p_user, note: null });
      return json(route, 200, n);
    }
    case 'admin_grant_trial': {
      if ((r = needs(route, ['support']))) return r;
      F.db.members.set(args.p_user, { role: 'user', disabled_at: null });
      F.db.trials = F.db.trials || new Map(); F.db.trials.set(args.p_user, { minutes: args.p_minutes });
      P.audit.push({ id: 'a' + P.audit.length + 10, at: iso(now), actor_email: 'admin@example.com', action: 'grant_trial', target_kind: 'user', target_id: args.p_user, note: args.p_note || null });
      return json(route, 200, iso(now + args.p_minutes * 60e3));
    }
    case 'admin_issue_invoice': {
      if ((r = needs(route, ['finance']))) return r;
      const pay = (customer(USERS['tok-amy'].id).payments).find((p) => p.id === args.p_payment);
      if (!pay) return pgErr(route, '22023', 'No such payment');
      const inv = { id: 'inv' + P.invoices.length, user_id: USERS['tok-amy'].id, payment_id: pay.id, number: 'FMS/26-27/' + String(P.invoices.length + 1).padStart(4, '0'), amount_paise: pay.amount_paise, issued_at: iso(now) };
      P.invoices.push(inv);
      return json(route, 200, inv);
    }
    case 'admin_reset_user': {
      if ((r = needs(route, ['support']))) return r;
      F.db.members.delete(args.p_user); F.db.sessions.delete(args.p_user);
      return json(route, 200, { membership_removed: true, request_removed: false, redemptions_freed: 1, device_lock_cleared: true, signed_out: true });
    }
    case 'admin_delete_user': {
      if ((r = needs(route, ['owner']))) return r;
      const u = userById(args.p_user);
      if (!u || String(args.p_confirm_email || '').toLowerCase() !== String(u.email || '').toLowerCase()) return pgErr(route, '22023', 'The e-mail address typed does not match this account. Nothing was deleted.');
      P.deleted = (P.deleted || []).concat(args.p_user);
      F.db.members.delete(args.p_user); F.db.sessions.delete(args.p_user);
      return json(route, 200, { deleted: true, invoices_retained: 1, invoices_anonymised: 1, tombstone: true });
    }
    case 'admin_list_support': {
      if ((r = needs(route, ['support', 'finance']))) return r;
      const rows = P.tickets.map((t) => ({ source: 'ticket', id: t.id, email: t.email, subject: t.subject, status: t.status, assignee: t.assignee,
        assignee_email: t.assignee ? (userById(t.assignee) || {}).email : null, created_at: t.created_at, detail: t.body, notes: t.notes }));
      for (const q of F.db.rreqs.filter((x) => ['pending', 'approved'].includes(x.status))) {
        rows.push({ source: 'refund', id: q.id, email: (userById(q.user_id) || {}).email, subject: 'Refund request: ' + q.category, status: q.status === 'pending' ? 'open' : 'waiting', assignee: null, assignee_email: null, created_at: q.created_at, detail: q.message, notes: 0 });
      }
      for (const q of F.db.requests.values()) if (q.status === 'pending') rows.push({ source: 'invite', id: q.user_id, email: q.email, subject: 'Invite request: ' + q.display_name, status: 'open', assignee: null, assignee_email: null, created_at: q.requested_at, detail: q.note, notes: 0 });
      rows.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
      return json(route, 200, rows);
    }
    case 'admin_log_ticket': {
      if ((r = needs(route, ['support']))) return r;
      const email = String(args.p_email || '').toLowerCase().trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return pgErr(route, '22023', 'That does not look like an e-mail address.');
      if (!String(args.p_subject || '').trim()) return pgErr(route, '22023', 'The subject is 1 to 200 characters.');
      const id = 't' + (P.tickets.length + 1);
      P.tickets.push({ id, email, subject: args.p_subject, body: args.p_body || '', status: 'open', assignee: null, notes: 0, created_at: iso(now) });
      return json(route, 200, id);
    }
    case 'admin_update_ticket': {
      if ((r = needs(route, ['support']))) return r;
      const t = P.tickets.find((x) => x.id === args.p_id);
      if (!t) return pgErr(route, '22023', 'There is no such ticket.');
      if (args.p_status) t.status = args.p_status;
      if (args.p_unassign) t.assignee = null; else if (args.p_assignee) t.assignee = args.p_assignee;
      if (args.p_note) t.notes += 1;
      return json(route, 200, { id: t.id, status: t.status, assignee: t.assignee, note_added: !!args.p_note });
    }
    case 'admin_list_passes': {
      if ((r = needs(route, ['support']))) return r;
      return json(route, 200, F.db.codes.map((c) => ({ code: c.code, pass_type: c.pass_type, label: c.label, project_id: c.target_project_id, project_title: c.target_project_id ? 'Dragon' : null,
        created_by: USERS['tok-admin'].id, created_by_email: 'admin@example.com', created_at: c.created_at, uses: c.redemptions_count, max_uses: c.max_redemptions,
        expires_at: c.expires_at, revoked_at: c.revoked_at,
        status: c.revoked_at ? 'revoked' : (c.expires_at && Date.parse(c.expires_at) <= now) ? 'expired' : c.redemptions_count >= c.max_redemptions ? 'used up' : 'active' })));
    }
    case 'admin_revoke_pass': {
      if ((r = needs(route, ['support']))) return r;
      const c = F.db.codes.find((x) => x.code === args.p_code);
      if (!c) return pgErr(route, '22023', 'There is no such code.');
      c.revoked_at = c.revoked_at || iso(now);
      return json(route, 200, { code: c.code, revoked_at: c.revoked_at });
    }
    case 'admin_extend_pass': {
      if ((r = needs(route, ['support']))) return r;
      const c = F.db.codes.find((x) => x.code === args.p_code);
      if (!c) return pgErr(route, '22023', 'There is no such code.');
      if (c.revoked_at) return pgErr(route, '22023', 'That code has been revoked. A revoked code is not extended.');
      if (!c.expires_at) return pgErr(route, '22023', 'That code never expires.');
      c.expires_at = iso(Math.max(Date.parse(c.expires_at), now) + args.p_days * DAY);
      return json(route, 200, { code: c.code, expires_at: c.expires_at });
    }
    case 'admin_list_shares': {
      if ((r = needs(route, ['support']))) return r;
      return json(route, 200, P.shares);
    }
    case 'admin_revoke_share': {
      if ((r = needs(route, ['support']))) return r;
      const s = P.shares.find((x) => x.id === args.p_share);
      if (!s) return pgErr(route, '22023', 'There is no such share link.');
      s.expires_at = iso(now); s.active = false;
      return json(route, 200, { id: s.id, expires_at: s.expires_at });
    }
    default: return baseHandle(route);
  }
}
