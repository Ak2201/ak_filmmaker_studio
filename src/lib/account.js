/* ============================================================
   THE ACCOUNT TIER — the half that was never built
   ------------------------------------------------------------
   docs/SECURITY-RLS.md and open item 5 both say the same thing:
   claim_invite() is the RECEIVING end of an invite and nothing in
   any UI ever created one, so an invite had to be typed into the
   SQL editor by hand. This module is the sending end.

   IT ADDS NO SQL. Every policy it needs was already written:

     acc_insert   a signed-in user may create an account they own
     acc_select   owner, or anybody with a role on it, may read it
     am_select    owner/admin may read the member list
     am_write     owner/admin may insert, update and delete rows

   and account_members_guard() does what a policy cannot — compares
   OLD and NEW — so an admin cannot promote themselves to owner or
   delete the owner's row. None of that is re-implemented here. This
   file composes the calls and translates the refusals into
   sentences; the database remains the thing that decides.

   SEATS ARE BILLING, AND THIS FILE DOES NOT ARGUE WITH THAT.
   accounts.seat_limit defaults to 1, enforce_seat_limit() raises
   53400 when a new member would exceed it, and accounts_guard()
   refuses any client attempt to change seat_limit, plan or
   storage_limit_mb: "Plan and limits are set by billing, not by the
   client."

   createAccount() therefore sends ONLY a name and an owner_id and
   lets every limit default. That is deliberate and worth stating,
   because the database would accept more: acc_insert checks only
   `owner_id = auth.uid()`, and accounts_guard is a BEFORE UPDATE
   trigger, so an INSERT carrying seat_limit 999 and plan 'pro' is
   not refused by anything. The guard is enforced on update and open
   on insert. Writing that into the product would make every user
   able to mint themselves an unlimited account, so this does not do
   it — but the hole is in the schema and belongs in the audit.
   ============================================================ */

/** The one place this module reaches the network. */
async function client() {
  const c = (typeof window !== 'undefined') && window.StudioCloud;
  if (!c || !c.ensureClient) throw new Error('Cloud is not available on this page.');
  const sb = await c.ensureClient();
  if (!sb) throw new Error('This browser is not connected to a Supabase project.');
  if (!c.getSession || !c.getSession()) throw new Error('Sign in first.');
  return sb;
}

function me() {
  const c = window.StudioCloud;
  const s = c && c.getSession && c.getSession();
  return s && s.user ? { id: s.user.id, email: (c.getUserEmail && c.getUserEmail()) || '' } : null;
}

/* Postgres speaks in codes; a person needs a sentence. Only the
   refusals this UI can actually provoke are translated — anything
   else keeps the server's own words rather than being flattened into
   "something went wrong", which is the error message that helps
   nobody. */
export function explain(error) {
  if (!error) return '';
  const code = error.code || '';
  const msg  = error.message || String(error);
  if (code === '53400') return msg;                         // seat limit, already a sentence
  if (code === '23505') return 'That address has already been invited to this account.';
  if (code === '42501') return 'The database refused that: you do not have the role it needs.';
  if (code === '23514') return 'That role is not one this account allows.';
  return msg;
}

/**
 * Everything the panel needs, in one round trip each.
 *
 * @returns {Promise<null|{account, members, role, seats:{used,limit}, isOwner}>}
 *          null when this user has no account yet — the panel's
 *          create branch, not an error.
 */
export async function loadAccount() {
  const sb = await client();
  const u  = me();
  if (!u) return null;

  /* Owned OR joined. acc_select already allows both, so one query
     answers "which account am I in" without this file deciding. */
  const { data: accounts, error: accErr } = await sb
    .from('accounts')
    .select('id,name,owner_id,plan,seat_limit')
    .order('created_at', { ascending: true });
  if (accErr) throw accErr;
  if (!accounts || !accounts.length) return null;

  const account = accounts[0];

  const { data: members, error: memErr } = await sb
    .from('account_members')
    .select('invited_email,user_id,role,status,created_at,joined_at')
    .eq('account_id', account.id)
    .order('created_at', { ascending: true });
  if (memErr) throw memErr;

  const rows = members || [];
  const mine = rows.find((m) => m.user_id === u.id);
  /* The owner of the account row counts as owner even with no member
     row — a freshly created account has none, which is exactly the
     case am_write's policy was widened to admit. */
  const role = (mine && mine.role) || (account.owner_id === u.id ? 'owner' : null);

  return {
    account,
    members: rows,
    role,
    isOwner: account.owner_id === u.id,
    /* Counted the way enforce_seat_limit() counts: pending and active
       occupy a seat, revoked does not. Any other arithmetic here
       would disagree with the trigger and mislead. */
    seats: {
      used:  rows.filter((m) => m.status === 'pending' || m.status === 'active').length,
      limit: account.seat_limit
    }
  };
}

/**
 * Create the studio account and put the creator in it as owner.
 *
 * Two writes rather than one, and the second is not optional: the
 * owner needs a member row for account_role() to answer 'owner' on
 * later calls, and claim_invite's "already a member" guard reads the
 * same table.
 */
export async function createAccount(name) {
  const sb = await client();
  const u  = me();
  const title = String(name || '').trim() || 'My Studio';

  const { data: acc, error } = await sb
    .from('accounts')
    .insert({ name: title, owner_id: u.id })   // limits default; see the header
    .select('id,name,owner_id,plan,seat_limit')
    .single();
  if (error) throw error;

  const { error: memErr } = await sb.from('account_members').insert({
    account_id:    acc.id,
    invited_email: (u.email || '').toLowerCase(),
    user_id:       u.id,
    role:          'owner',
    status:        'active',
    invited_by:    u.id,
    joined_at:     new Date().toISOString()
  });
  /* A failure here leaves a usable account — account_owner() still
     matches — so report it rather than unwinding and losing the
     account the user just named. */
  if (memErr) return { account: acc, warning: explain(memErr) };
  return { account: acc };
}

/**
 * Invite by email address.
 *
 * The credential is the ADDRESS, never a token, and that is a
 * security decision rather than a convenience: an owner/admin row
 * grants edit on every project in the account, so a forwardable
 * bearer string conferring it would be the most dangerous credential
 * in the system. Google is the only sign-in, so the address is
 * attested by Google rather than typed by the claimant.
 *
 * 'owner' is deliberately not offered. claim_invite() refuses to
 * claim an owner row (`m.role <> 'owner'`), so an owner invite would
 * be a row nobody could ever accept. Invite as admin and promote.
 */
export async function inviteMember(accountId, email, role) {
  const sb = await client();
  const u  = me();
  const addr = String(email || '').trim().toLowerCase();
  if (!addr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
    throw new Error('That does not look like an email address.');
  }
  if (role !== 'admin' && role !== 'member') role = 'member';

  const { error } = await sb.from('account_members').insert({
    account_id:    accountId,
    invited_email: addr,
    user_id:       null,
    role,
    status:        'pending',
    invited_by:    u.id
  });
  if (error) throw error;
  return { ok: true, email: addr, role };
}

/**
 * Remove somebody, pending or active.
 *
 * DELETE rather than status='revoked'. The primary key is
 * (account_id, invited_email), so a revoked row would occupy that
 * key and the same person could never be re-invited without an
 * upsert — and a revoked row still has to be excluded from the seat
 * count by hand everywhere. Deleting is what "they are not in this
 * account" means. account_members_guard() still protects the owner's
 * row from an admin.
 */
export async function revokeMember(accountId, email) {
  const sb = await client();
  const { error } = await sb
    .from('account_members')
    .delete()
    .eq('account_id', accountId)
    .eq('invited_email', String(email || '').trim().toLowerCase());
  if (error) throw error;
  return { ok: true };
}

/** Projects this user owns, and whether each is in the account yet. */
export async function listProjects() {
  const sb = await client();
  const { data, error } = await sb
    .from('projects')
    .select('id,title,account_id')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/**
 * Put a project into the account, or take it out again.
 *
 * THIS IS AN ACCESS-CONTROL CHANGE, not filing. has_project_access()
 * grants every active owner/admin of the account edit on every
 * project whose account_id matches — so attaching a film hands it to
 * everyone in the account, and the panel says so before asking.
 */
export async function setProjectAccount(projectId, accountId) {
  const sb = await client();
  const { error } = await sb
    .from('projects')
    .update({ account_id: accountId || null })
    .eq('id', projectId);
  if (error) throw error;
  return { ok: true };
}

export default {
  loadAccount, createAccount, inviteMember, revokeMember,
  listProjects, setProjectAccount, explain
};
