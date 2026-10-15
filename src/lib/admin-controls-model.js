/* ============================================================
   ADMIN CONTROLS MODEL — roles, overrides, the banner, exports
   ------------------------------------------------------------
   The pure half of the Controls tab (src/pages/admin-tabs/controls-body.js):
   what each role may reach, who a typed e-mail or id names, how an
   override and a scope are worded, and the export's file name. Nothing
   here draws, stores or fetches; the server (require_role) is the
   boundary, not this file.
   ============================================================ */

export const ROLES = ['owner', 'finance', 'support'];
export const ROLE_REACH = {
  owner: 'Everything: the purchases switch, prices, feature switches, roles, the banner, export and erase of a person.',
  finance: 'Refunds, invoices and receipts, payments, promo codes and referral payouts.',
  support: 'Notes, trial grants, ending sessions, the support queue, passes and shares.'
};
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SCOPE_WORDS = { global: 'everybody', plan: 'one plan', account: 'one account' };

/** Throws the sentence for an empty box, before anything is fetched. */
export function personText(text) {
  const t = String(text || '').trim();
  if (!t) throw new Error('Type the person’s e-mail address or user id first.');
  return t;
}

/** A typed e-mail or user id (already trimmed) against admin_list_users():
    { id, email }, or a thrown sentence when no account has that e-mail. */
export function matchPerson(users, t) {
  if (UUID.test(t)) {
    const u = users.find((x) => x.user_id === t.toLowerCase());
    return { id: t.toLowerCase(), email: (u && u.email) || '' };
  }
  const u = users.find((x) => String(x.email || '').toLowerCase() === t.toLowerCase());
  if (!u) throw new Error('No account has the e-mail address “' + t + '”. Check the spelling, or paste the user id.');
  return { id: u.user_id, email: u.email };
}

/** An administrator's e-mail from the roles list, else a short id. */
export function emailOf(roleRows, id) {
  const r = roleRows.find((x) => x.user_id === id);
  return (r && r.email) || (id ? String(id).slice(0, 8) + '…' : 'unknown');
}

/** "Make x an owner?" / "Make x a finance admin?" */
export const roleQuestion = (who, role) => 'Make ' + who + ' ' + (role === 'owner' ? 'an owner' : 'a ' + role + ' admin') + '?';

/** An override row's "Applies to" cell. */
export const scopeCell = (r) => (r.scope === 'global' ? 'everybody' : r.scope + ' ' + (r.scope_id.length > 12 ? r.scope_id.slice(0, 8) + '…' : r.scope_id));

/** The question before an override is saved. */
export function overrideQuestion(key, on, scope, scopeId) {
  return {
    title: (on ? 'Force ' : 'Switch off ') + key + (on ? ' ON' : '') + ' for ' + (scope === 'global' ? 'everybody' : scope + ' ' + scopeId) + '?',
    body: on ? 'People in that scope get the feature even if their plan does not include it.' : 'People in that scope lose the feature even if their plan includes it. It takes effect the next time their page reads its plan.'
  };
}

/** A datetime-local value -> ISO, or null when empty or unreadable. */
export const toIso = (local) => { if (!local) return null; const t = new Date(local); return Number.isNaN(t.getTime()) ? null : t.toISOString(); };

/** "studio-export-<slug>-<day>.json" for one person's export. */
export function exportFileName(p, now = new Date()) {
  const slug = (p.email || p.id).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return 'studio-export-' + slug + '-' + now.toISOString().slice(0, 10) + '.json';
}

export default { ROLES, ROLE_REACH, UUID, SCOPE_WORDS, personText, matchPerson, emailOf, roleQuestion, scopeCell, overrideQuestion, toIso, exportFileName };
