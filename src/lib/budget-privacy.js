/* ============================================================
   KEEP THE BUDGET PRIVATE — the client's reading of schema §55
   ------------------------------------------------------------
   PURE and IMPORT-FREE: cloud.js (CORE) and the budget page both
   read it, and a Node test drives it with no browser.

   The database is the boundary (pd_select / pd_write / cm_* through
   has_scope_access, supabase/schema/schema-55-budget-private.sql).
   This file only decides what the client SAYS and what it does not
   bother sending:

     · the switch is offered to the film's owner, signed in, on a film
       the server knows, on a database where §55 has run;
     · a view or comment collaborator on a private film is told so on
       budget.html, instead of being shown a local or empty budget that
       looks real (other views of the same keys are not locked);
     · the sync engine does not push 'library' / 'costs' for that film
       (RLS would refuse every attempt and the queue would retry it).

   Everything unknown reads as "not private, nothing to show": §55 not
   run (PGRST202 / 42883 / 404), no session, a film that was never
   synced (budget_privacy() answers null), or a network failure. That
   is how the database behaved before §55, so failing that way changes
   nothing for anybody.
   ============================================================ */

/** The two project_data scopes §55 calls the budget. */
export const BUDGET_SCOPES = Object.freeze(['library', 'costs']);

export function isBudgetScope(scope) {
  return BUDGET_SCOPES.includes(String(scope || ''));
}

/** The state that means "nothing is known": no switch, no lock. */
export const UNKNOWN = Object.freeze({ known: false, private: false, visible: true, canChange: false, missing: false });

/* PostgREST's "no such function" (and Postgres's own, and a bare 404):
   the section has not run on this database. */
const MISSING = /^(PGRST202|42883|404)$/;

/** True when an RPC error means the function does not exist yet. */
export function isMissingFunction(error) {
  if (!error) return false;
  const code = String(error.code != null ? error.code : (error.status != null ? error.status : ''));
  return MISSING.test(code);
}

/* Normalise one budget_privacy() answer — `{ data, error }` as the
   SDK returns it — into the state every reader uses. A malformed
   answer is UNKNOWN rather than a guess: only a reply that carries
   all three booleans is believed (the same rule as plan-gate's
   `typeof st.entitled === 'boolean'`). */
export function readPrivacy(res) {
  if (!res || typeof res !== 'object') return UNKNOWN;
  if (res.error) return isMissingFunction(res.error) ? Object.assign({}, UNKNOWN, { missing: true }) : UNKNOWN;
  const d = res.data;
  if (!d || typeof d !== 'object') return UNKNOWN;
  if (typeof d.private !== 'boolean' || typeof d.visible !== 'boolean' || typeof d.can_change !== 'boolean') return UNKNOWN;
  return { known: true, private: d.private, visible: d.visible, canChange: d.can_change, missing: false };
}

/** Offer the owner's switch? */
export function showSwitch(state, signedIn) {
  return !!(signedIn && state && state.known && state.canChange);
}

/** Show "The owner keeps this budget private." instead of the budget? */
export function budgetLocked(state) {
  return !!(state && state.known && state.private && !state.visible);
}

/** Should the sync engine leave this scope of this film alone? */
export function skipScope(state, scope) {
  return isBudgetScope(scope) && budgetLocked(state);
}

/** The toast after a toggle: what the server answered, said plainly. */
export function toggleMessage(on, ok) {
  if (!ok) return 'Could not change who sees the budget. Nothing changed.';
  return on
    ? 'The budget is private: only you and people with an edit link can see it.'
    : 'The budget is shared again with everyone on this project.';
}

export default { BUDGET_SCOPES, UNKNOWN, isBudgetScope, isMissingFunction, readPrivacy, showSwitch, budgetLocked, skipScope, toggleMessage };
