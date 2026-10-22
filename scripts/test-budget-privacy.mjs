/* ============================================================
   KEEP THE BUDGET PRIVATE — the client's decisions, in Node
   ------------------------------------------------------------
   src/lib/budget-privacy.js reads schema §55's budget_privacy()
   answer and decides three things: offer the owner's switch, show a
   viewer the private state, skip pushing a budget scope. Asserted:
     · only a well-formed answer is believed; §55 absent (PGRST202,
       42883, 404), null (never synced / not visible), a network error
       or a half-answer all read as unknown = not private, no switch;
     · the switch is the owner's, and only while signed in;
     · the lock and the push skip are a private film the caller cannot
       read, and only the 'library' and 'costs' scopes.
   The sync half (no push, no queue, local copy untouched) is in
   test:cloud.

       node scripts/test-budget-privacy.mjs   (npm run test:budget-privacy)
   ============================================================ */
import P from '../src/lib/budget-privacy.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const ans = (priv, vis, can) => ({ data: { private: priv, visible: vis, can_change: can }, error: null });

// Reading the answer
const owner = P.readPrivacy(ans(true, true, true));
ok(owner.known && owner.private && owner.visible && owner.canChange, 'owner answer is read');
const viewer = P.readPrivacy(ans(true, false, false));
ok(viewer.known && viewer.private && !viewer.visible && !viewer.canChange, 'viewer answer is read');
for (const code of ['PGRST202', '42883', 404]) {
  const st = P.readPrivacy({ data: null, error: { code } });
  ok(!st.known && !st.private && st.visible && st.missing, 'missing function ' + code + ' reads as unknown, missing');
}
ok(!P.readPrivacy({ data: null, error: { status: 404 } }).known, 'a bare 404 status reads as missing');
ok(!P.readPrivacy({ data: null, error: { message: 'Failed to fetch' } }).missing, 'a network error is unknown, not "missing"');
ok(!P.readPrivacy({ data: null, error: null }).known, 'null (not visible / never synced) is unknown');
ok(!P.readPrivacy({ data: { private: true }, error: null }).known, 'a half answer is not believed');
ok(!P.readPrivacy({ data: { private: 'yes', visible: false, can_change: false }, error: null }).known, 'a non-boolean is not believed');
ok(!P.readPrivacy(null).known && !P.readPrivacy(undefined).known, 'nothing is unknown');

// The switch
ok(P.showSwitch(owner, true), 'owner, signed in: switch');
ok(P.showSwitch(P.readPrivacy(ans(false, true, true)), true), 'owner, switch off: still offered');
ok(!P.showSwitch(owner, false), 'signed out: no switch');
ok(!P.showSwitch(viewer, true), 'viewer: no switch');
ok(!P.showSwitch(P.readPrivacy(ans(true, true, false)), true), 'editor: no switch');
ok(!P.showSwitch(P.UNKNOWN, true) && !P.showSwitch(null, true), 'unknown: no switch');

// The lock
ok(P.budgetLocked(viewer), 'private + not visible: locked');
ok(!P.budgetLocked(owner), 'owner: not locked');
ok(!P.budgetLocked(P.readPrivacy(ans(true, true, false))), 'editor on a private film: not locked');
ok(!P.budgetLocked(P.readPrivacy(ans(false, true, false))), 'viewer, switch off: not locked');
ok(!P.budgetLocked(P.UNKNOWN) && !P.budgetLocked(null), 'unknown: not locked');

// The push skip
ok(P.skipScope(viewer, 'library') && P.skipScope(viewer, 'costs'), 'viewer on a private film: library and costs skipped');
for (const s of ['script', 'scenes', 'library_prefs', 'locations', 'story', '']) ok(!P.skipScope(viewer, s), 'scope ' + (s || '(none)') + ' is not skipped');
ok(!P.skipScope(owner, 'costs') && !P.skipScope(P.UNKNOWN, 'costs') && !P.skipScope(undefined, 'costs'), 'owner / unknown: nothing skipped');
ok(P.BUDGET_SCOPES.length === 2 && P.isBudgetScope('library') && P.isBudgetScope('costs'), 'exactly two budget scopes');

// The toast
ok(/private/.test(P.toggleMessage(true, true)) && /shared again/.test(P.toggleMessage(false, true)), 'toggle messages say the new state');
ok(/Nothing changed/.test(P.toggleMessage(true, false)), 'a failed toggle says nothing changed');

console.log(`test:budget-privacy — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
