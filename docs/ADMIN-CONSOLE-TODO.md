# Admin console v2 — what still needs fixing (13 Oct 2026)

State: §40–§46 are LIVE on `conhlrulxfwkhsnymakz` (run 13 Oct 2026, each read back over
PostgREST: new functions answer 42501, new tables refuse the anon key). The console code is on
`develop`. This file is the honest remainder — nothing here is hidden behind a green tick.
IDs: **O** owner step, **L** live check, **D** decision, **C** code gap, **Q** quality gap, **H** housekeeping.

## O — owner steps (cannot be done from code)
- **O1. Configure Resend.** Set `RESEND_API_KEY` and `MAIL_FROM` in the Supabase function secrets
  (`docs/BILLING.md` §13, §16). Until then a payment CLAIMS a receipt and the send fails — the Launch
  checklist shows "Resend delivers receipts" red (2 invoices, last 7 days, no mail recorded). After the
  secret is set, press RESEND on those two rows in the Launch & health tab. **Do not take real payments first.**
- **O2. Exercise one refund end to end.** Launch checklist item "A refund has been exercised" is red
  because it is true: no refund has ever been processed. Refund one small payment you own through the
  console (finance/owner role) and confirm the row goes green. It moves real money — a person must do it.
- **O3. Confirm the Razorpay mode.** The dev `.env` carries an `rzp_live_` key id and the console reads
  LIVE, while `CLAUDE.md` says Razorpay was wired in TEST mode. Decide which is intended; if live is
  intended, update the "what is live" notes; if not, switch the build's `VITE_RAZORPAY_KEY_ID`.
- **O4. Throw the purchases switch** only when the Launch checklist is all green (O1, O2 first). It is
  not thrown: `purchases_required()` still answers false.

## L — checks that need a signed-in admin (the anonymous probes cannot show them)
- **L1.** Open the console as an admin: Controls → Roles should list you as **owner** (the §45 backfill).
- **L2.** Launch & health should show 39 of 39 markers present and the functions step green after the
  webhook-probe fix (`ce5e8f7`) is deployed.
- **L3.** Do one harmless write (e.g. set the refund-requests switch to its current value) and confirm a row
  appears in the Audit tab with your e-mail; then try `update public.admin_audit set note='x'` in the SQL
  editor — it must raise "The audit log is append-only."
- **L4.** Set a banner in Controls, confirm it shows on another page and clears; confirm a non-admin sees
  nothing of the console.
- **L5.** Try Delete user on a throwaway account only. `admin_delete_user` ends with a delete from
  `auth.users`; whether the function owner may do that on this project is untested (if not, the whole
  delete rolls back — nothing half-done).

## D — decisions still open
- **D1.** Role calls in §46 that lean to owner: `decide_request` (invite approval grants access),
  `grant_email`/`revoke_email_grant`. `terminate_session` is **support** though disabling an account
  arguably should be owner. Move any you disagree with (restate the function in a new section).
- **D2.** Deleting a person keeps their **invoices** (statutory records). Anonymise instead?
- **D3.** Notes are readable/addable by finance as well as support/owner (`admin_add_note` /
  `admin_list_notes` only check `is_studio_admin`). Narrow them?
- **D4.** Rollback window on the purchases switch is 24 hours (default; never explicitly confirmed).

## C — code gaps
- **C1. `screening_pass_used` is never counted.** `screening.js` is an anonymous page with no app code;
  it needs a server-side count inside `screening_open()` (a schema change, restating an anon-callable
  function — do it deliberately, with a test).
- **C2. Admin command-palette group was never built** (plan §4.2): jump to a tab / find a person by e-mail,
  admin-only, via the dynamic `loadContent()` in `src/ui/palette.js`; must not run through `markLocked`.
- **C3. "Everyone signed in" and Organisations rows carry no person id.** The customer drawer finds them
  with a MutationObserver that matches the printed e-mail. Add `data-gate-user=<user_id>` + `tabindex=0`
  in `src/pages/admin.js` and delete the observer.
- **C4. Support-ticket notes are write-only** — no RPC lists them; rows show a count. Add
  `admin_list_ticket_notes` (support/owner) and show them.
- **C5. True retention triangle is impossible with today's data** (`admin_cohorts` has no per-period
  activity and counters keep no ids). The Growth tab shows a weekly conversion table instead. Decide
  whether to record anything that would allow it (it would cost privacy; the owner said counts only).
- **C6. Status bar is not sticky** (it would collide with the horizontal tab strip below 1100px).
- **C7. The launch checklist cannot tell a test payment from a live one** ("A real payment has been
  captured" is green on 4 paid rows but says so itself). Store the Razorpay mode on `payments` (or the
  order) so the check means what it says.
- **C8. Admin first paint is 740 KB.** The admin row of `scripts/budget.json` was raised on purpose
  (596562 → 756932 measured). Lazy-loading the tab modules like `controls.js` does would claw back ~50 KB;
  `access-admin.js` imports `admin-customer.js` statically, so that import must be made lazy first.
- **C9. Fold §40–§46 into `supabase/schema/supabase-schema.sql`** (they are standalone files; the runner loads them
  itself) and replace "NOT RUN LIVE" with "RUN LIVE 13 Oct 2026" in each header and in `CLAUDE.md`'s
  "what is live" paragraph. Then drop the `STANDALONE` block in `scripts/test-schema.mjs`.
- **C10. `prove-admin-health.mjs` and `prove-admin-people.mjs` are not in `package.json` / `test:all`.**
  Add `prove:admin-health` and `prove:admin-people` (and a CI step).

## Q — quality gaps (never verified)
- **Q1.** WCAG AA contrast walk signed in, both themes — only eyeballed and a partial text-contrast probe.
- **Q2.** 390px screenshots for the Audit tab and the Controls banner card were generated, not viewed.
- **Q3.** `privacy.html` (new "Counts of which tools are used" section) not read at 390px in both themes.
- **Q4.** The refused-save report from `cloud.js` (`report_sync_error` on 23514/42501/P0402) was never
  exercised in a browser; `limit_hit` and `share_created` call sites likewise.
- **Q5.** A real feature override changing what a member can open was not tested end to end (plan-gate
  exposes no global); only that `effective_features` is called and a failure is harmless.
- **Q6.** Everything admin-side was exercised against a fake Supabase; the live RPC shapes were only
  tested on plain PostgreSQL 16. First real use may surface a shape mismatch — check the browser console.
- **Q7.** `prove:growth` fails 2 screening-branding checks ("made-with" shown twice; "branding:false" no
  line). They fail identically on clean `develop` — pre-existing, unrelated, still unfixed.
- **Q8.** `prove:gate` has two intermittent failures ("a signed-in redemption opens the gate", "the code
  starts the trial it carries") — flaky on a clean build too.

## H — housekeeping
- **H1.** ~20 stale `worktree-agent-*` branches (local) and their worktrees under `.claude/worktrees/` —
  prune the ones not yours (`git worktree list`). GitHub branch deletion is blocked (403).
- **H2.** Two Vercel projects watch the repo and the daily deployment cap has been hit once — batch pushes.
- **H3.** `main` has none of this: merge only through the release gate in `docs/BRANCHING.md`.
- **H4.** The Supabase SQL editor holds an unsaved "Untitled query" tab with §46 in it; close it unsaved.
