/* ============================================================
   A FAKE SUPABASE PROJECT implementing schema sections 13 and 14
   ------------------------------------------------------------
   Shared by scripts/prove-gate.mjs and scripts/prove-extension.mjs.
   An in-memory database (codes, hashed tickets, members, the 90-second
   lock, screening passes, a project with data) behind a Playwright
   route handler for the project's origin. `F.db` is the live state;
   `F.reset()` starts a scenario clean.
   ============================================================ */
import { createHash } from 'node:crypto';

export const SB = 'https://conhlrulxfwkhsnymakz.supabase.co';
export const REF = 'conhlrulxfwkhsnymakz';
export const F = { db: null, reset() { F.db = freshDb(); return F.db; } };

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
  if (url.pathname.startsWith('/rest/v1/invite_codes')) {
    if (!user || F.db.members.get(user.id)?.role !== 'admin') return json(route, 200, []);
    return json(route, 200, F.db.codes);
  }
  if (url.pathname.startsWith('/rest/v1/invite_redemptions')) return json(route, 200, user && F.db.members.get(user.id)?.role === 'admin' ? F.db.redemptions : []);
  if (url.pathname.startsWith('/rest/v1/projects')) {
    if (req.method() === 'GET') return json(route, 200, user ? F.db.projects.filter((p) => p.owner_id === user.id).map(({ id, title, format }) => ({ id, title, format })) : []);
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
