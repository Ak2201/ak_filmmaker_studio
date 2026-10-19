# Admin console v2 — schema run order

Last reviewed: 2026-10-19

The plan is `docs/archive/ADMIN-CONSOLE-PLAN.md` (archived). This file is the deploy half for
§40–§47. **All of §40–§47 are LIVE on the production project (run 13 Oct 2026):**
§46 and §47 were run checksummed and read back with `pg_get_functiondef`; §40–§45 were
confirmed by PostgREST probe (42501 = exists and refuses). Source: `docs/HANDOFF.md` §4.
Live admin-session checks are still open — see `docs/ADMIN-CONSOLE-TODO.md` (L1–L5).
None of §40–§47 is folded into `supabase/schema/supabase-schema.sql` (that file is §1–§39);
each is its own file in `supabase/schema/`, run order in `supabase/schema/README.md`.
The console's tabs are in `src/lib/admin-model.js` (`TAB_DEFS`): Overview, Launch & health,
Audit log, People, Support, Access & sharing, Purchases, Growth, Usage, Sync & storage, Controls.

| Section | File | Needs | Adds |
| --- | --- | --- | --- |
| §40 | `supabase/schema/schema-40-admin-audit.sql` | §1–§39 | `admin_audit`, `admin_audit_write()`, `admin_list_audit()`, and nineteen admin writers restated with an audit call |
| §42 | `supabase/schema/schema-42-customer-360.sql` | **§40** | `admin_notes`, `admin_add_note()`, `admin_list_notes()`, `admin_customer()` |
| §47 | `supabase/schema/schema-47-delete-anonymise.sql` | **§45** | `admin_delete_user()` restated: the retained invoices lose the buyer's name, e-mail and GSTIN (People → Delete totally) |
| §48 | `supabase/schema/schema-48-refund-seat-trial.sql` | **§45** | NOT YET RUN LIVE. `begin_refund()` refuses an actor who is not owner/finance; `record_refund()` settles a request as refunded only once the payment is refunded (also when the webhook recorded the refund first), and `admin_decide_refund_request()` refuses a decline while a refund on that payment is in flight; `enforce_seat_limit()` uses the current plan's seats; `invite_requests.last_declined_at` keeps a decline in force for `start_trial()` across a re-ask. Goes with an `rzp-refund` redeploy. |

(§41, health and launch, is another lane. §42 does not depend on it.)

## Order

1. **§40, then §42.** §42's `admin_add_note()` calls `admin_audit_write()` and
   `admin_customer()` reads `admin_audit`; run in the other order and the
   section loads (plpgsql binds late) and then fails at first call.
2. **Fetch before you number.** These files say 40 and 42 because 41 was
   reserved for the health lane. If another session has taken either number,
   renumber; do not collide.
3. Both files are re-runnable. `npm run test:schema` loads each twice.
4. They are not folded into `supabase/schema/supabase-schema.sql`, so the test runner
   (`scripts/test-schema.mjs`, `ADMIN_FILES`) loads the two files itself, on top of the whole
   schema, before the §32-onward check files, and then runs `admin-audit.sql` and
   `admin-customer.sql`. (Its comments still say "at the repo root"; the files are in
   `supabase/schema/`.)

## Pasting SQL: checksum, never the raw clipboard

`pbcopy` then paste into the dashboard editor turns every em-dash into
mojibake (UTF-8 read as MacRoman), and both files contain em-dashes and
user-facing sentences. Do not paste them.

```bash
shasum -a 256 supabase/schema/schema-40-admin-audit.sql          # note it
base64 -i supabase/schema/schema-40-admin-audit.sql | pbcopy      # pure ASCII crosses the clipboard
```

In the editor page, decode the base64, set the Monaco model to the result, then
SHA-256 the editor's contents and compare with the number above **before
pressing Run**. Repeat for §42.

## Read back over PostgREST, after each section

Ask the server, not the file. Anon key, `POST /rest/v1/rpc/<name>` with `{}`
(or the arguments below). The distinction that matters is **42501**
(`permission denied for function` — the function exists and refuses) versus
**PGRST202** (not found — the section did not run, or the signature differs).

### §40

| Probe | Expect |
| --- | --- |
| anon `rpc/admin_list_audit` `{}` | 42501 |
| anon `rpc/admin_audit_write` `{"p_action":"x","p_target_kind":"y","p_target_id":"z"}` | 42501 (NOT callable by any API role, an admin included) |
| anon `GET /rest/v1/admin_audit` | 401 / 42501 `permission denied for table` |
| anon `rpc/admin_grant_trial` `{"p_user":"<uuid>","p_minutes":1}` (and the other writers) | 42501, as before |

In the SQL editor:

```sql
-- two triggers, row and truncate
select tgname from pg_trigger where tgrelid = 'public.admin_audit'::regclass and not tgisinternal;
-- 19 writers now call the helper (20 once §42 has run: admin_add_note)
select count(*) from pg_proc where pronamespace = 'public'::regnamespace
   and proname like 'admin\_%' and prosrc like '%admin_audit_write(%';
-- RLS on, no API privileges
select relrowsecurity from pg_class where oid = 'public.admin_audit'::regclass;
select grantee, privilege_type from information_schema.table_privileges
 where table_name = 'admin_audit' and grantee in ('anon', 'authenticated');   -- no rows
```

With an admin session: do one harmless write (`admin_set_refund_requests_enabled`
to its current value) and `rpc/admin_list_audit` `{"p_limit":1}` returns it
with your id and e-mail. Then try `update public.admin_audit set note = 'x'` in
the SQL editor: it must raise `The audit log is append-only.`

### §42

| Probe | Expect |
| --- | --- |
| anon `rpc/admin_customer` `{"p_user":"<uuid>"}` | 42501 |
| anon `rpc/admin_add_note` `{"p_user":"<uuid>","p_body":"x"}` | 42501 |
| anon `rpc/admin_list_notes` `{"p_user":"<uuid>"}` | 42501 |
| anon `GET /rest/v1/admin_notes` | 401 / 42501 |

With an admin session: `admin_customer` for yourself returns `identity.email`
equal to yours, a `work.scopes` list of `{scope, rows, bytes}` and no project
title or data anywhere; `admin_customer` for a random uuid raises 22023
`No such user`.

## What the audit log is and is not

- Append-only against the API, the console and the table owner's ordinary
  statements. A superuser (the dashboard's SQL editor) can drop the trigger;
  nothing in SQL can stop that. It is tamper-evident, not tamper-proof.
- Rows carry snapshots of the settings an admin changed and the ids of what
  they acted on. Never an invite code, a project title, project data or a
  payment's `raw`.
- Convention for "everything about this person": `target_kind = 'user'` puts
  them in `target_id`; any other row about one person carries `user_id` inside
  `after` (or `before` for a revoke). `admin_list_audit(p_target => <uuid>)`
  and `admin_customer()` both match on it. Later admin writers must follow it.
- `at` defaults to `clock_timestamp()`, not `now()`, so the keyset cursor
  (`p_before`) cannot straddle rows written in one transaction.
- The helper is `admin_audit_write(p_action, p_target_kind, p_target_id,
  p_before, p_after, p_note)`; any new admin writer calls it as its last
  statement before returning.

---

## Lane: §41 launch & health, §43 usage & cohorts, §44 sync & limits

Standalone files in `supabase/schema/`, **not folded into `supabase-schema.sql`**
and **run live 13 Oct 2026** (confirmed by PostgREST probe: each section's functions exist and refuse anon with 42501):

| File | Contents |
| --- | --- |
| `supabase/schema/schema-41-admin-health.sql` | `admin_health()`, `admin_launch_preview()`, three internal probes |
| `supabase/schema/schema-43-usage-cohorts.sql` | `usage_daily`, `usage_rate`, `usage_names()` (GENERATED block), `bump_usage()`, `admin_usage()`, `admin_cohorts()` |
| `supabase/schema/schema-44-sync-limits.sql` | `sync_errors`, `sync_error_rate`, the two allow-lists, `report_sync_error()`, `admin_sync_overview()`, `admin_limit_pressure()` |
| `scripts/make-usage-names-sql.mjs` | regenerates / checks the §43 name list from `navigation.json`; `npm run test:usage-names` (in `test:all`) |
| `scripts/schema-tests/{admin-health,usage-cohorts,sync-limits}.sql` | the checks; run by `npm run test:schema` |
| `scripts/schema-tests/audit-shim.sql` | a no-op stand-in for §40's `admin_audit_write()`, created only if absent |

### Deploy order

1. §40 (audit) is independent: none of the three sections calls
   `admin_audit_write()` today, because every `admin_*` function here is
   read-only. They can run before or after it.
2. `node scripts/make-usage-names-sql.mjs --write` if `navigation.json` moved
   since the file was authored (`npm run test:usage-names` says so).
3. Run **§41, then §43, then §44** in the SQL editor, each with the base64 +
   SHA-256 method (never paste SQL through the clipboard). They do not depend
   on each other, and each is re-runnable.
4. Read each back over PostgREST (queries below), as an admin session.
5. Only then ship client code that calls `bump_usage` / `report_sync_error`.
   Until the sections run, those calls answer PGRST202; the client wraps both
   in try/catch and must never surface the failure.

**Owner sign-off before §43 runs** (plan §7): counts only, a fixed name list,
opt-out in Settings, `privacy.html` updated in the same commit as the client.
`usage_rate` keeps a user id for 48 hours to rate-limit; privacy.html should say
so, and say that no weekly active-user figure exists by design.

### What each function does, and does not

- `admin_health()` — every figure OBSERVED, never a guessed cause. Each probe
  that raises puts `{error, message}` in its own slot and its check becomes
  `unknown`, never `ok`. Section markers (one object per section, §1–§39) are
  listed in the function; §8, §9, §10, §19 and §36 are weak markers (repairs or
  data) and are named in `sections.weak_markers`. **Not observable from SQL:**
  edge-function reachability and Razorpay mode (the client probes those),
  whether Resend is configured, and when a webhook last arrived (no table
  records one; `payments.last_paid_at` and `refunds.last_refund_processed_at`
  are what a working webhook leaves behind). Receipts "awaiting" means an
  invoice with a buyer e-mail and no `emailed_at`: a failed send releases its
  claim (§35), and invoices issued before §35 were left unclaimed on purpose, so
  read `awaiting_recent` (last 7 days) for the live signal.
- `admin_launch_preview()` — who the purchases switch walls (or is walling),
  reusing `admin_purchase_wall()`. Per person it adds `grandfathered` and
  `email_grant` (a plan-less e-mail grant makes `billing_status()` entitled even
  though the census counts them as walled). **Rollback needs nothing new:**
  `admin_set_billing_settings('{"purchase_required": false}')` is never refused.
- **No `admin_switch_state()`.** `billing_settings.updated_at/updated_by` move on
  ANY setting, so they cannot say when the switch was thrown. `admin_health()`
  returns them as `billing_settings_last_touched` labelled "any billing
  setting". The switch's own history is an audit row (§40) read through
  `admin_list_audit()`.
- `bump_usage(text[])` — authenticated, enabled studio members only (anyone else
  counts nothing, silently); first 50 names of a call; unknown names ignored;
  60 calls per user per hour then `P0429`; day is Asia/Kolkata.
- `admin_usage(p_days)` — per-module opens zero-filled, `by_plan`, `by_day`,
  `dead_modules` (no open in 14 days), feature adoption, `active_users` over
  24h/48h from the rate rows (weekly: not available by design).
- `admin_cohorts(p_weeks)` — stages are counts of people who REACHED each stage,
  independently. `trial_started` excludes `trial_source = 'admin'` (the §30
  grandfather backfill and console grants). `active_in_trial` uses synced
  `project_data` written inside the trial window, so it undercounts anyone
  without cloud sync (local-first). Source = `code | signup | admin | refund |
  none`; attribution = kind of promo code on the first paid payment.
- `report_sync_error(scope, code)` — authenticated (members or not); anything
  outside the allow-lists is stored as `other`; 30 per user per hour (`P0429`);
  the table drops reports silently past 20,000 a day. The scope list
  (`sync_error_scopes()`) is hand-maintained beside the `project_data` CHECK.
- `admin_sync_overview()` — `allowed_scopes` is parsed from the live CHECK in
  `pg_constraint`; the console diffs it against the client's list.
  `reportable_not_allowed` is that diff for the SQL-side list.
- `admin_limit_pressure()` — **reads each member's plan limits, not
  `user_limits()`**, because `user_limits()` is `'{}'` while purchases are not
  required and the report would be empty before launch. `enforced` says whether
  the caps bite now. Storage uses `accounts.storage_limit_mb`, which nothing
  enforces today. **No send-nudge function exists** (owner decision, 12 Oct).

### Read-back queries (after the owner runs each section)

Run as the owner in the SQL editor unless marked admin session.

```sql
-- §41
select proname from pg_proc where proname in ('admin_health','admin_launch_preview','health_has_fn','health_has_col','health_scope_check_has') order by 1;  -- 5 rows
-- admin session, over PostgREST: POST /rest/v1/rpc/admin_health
--   sections.expected = 39; sections.missing lists exactly what is genuinely absent
--   jsonb_array_length(checks) = 10
-- anon / non-admin: both RPCs -> 42501 (permission denied), NOT PGRST202

-- §43
select cardinality(public.usage_names());                                       -- 42 today (34 modules + 8)
select pg_get_constraintdef(oid) from pg_constraint where conname = 'usage_daily_name_check';
select column_name from information_schema.columns where table_name = 'usage_daily' order by 1;  -- count, day, name, plan only
select has_table_privilege('authenticated', 'public.usage_daily', 'select');    -- false
select relrowsecurity from pg_class where oid = 'public.usage_daily'::regclass; -- true

-- §44
select pg_get_constraintdef(oid) from pg_constraint where conname = 'sync_errors_scope_check';
select has_table_privilege('authenticated', 'public.sync_errors', 'insert');    -- false
-- admin session: select admin_sync_overview() -> 'allowed_scopes';  -- includes write_goals
-- admin session: select admin_limit_pressure() ->> 'enforced';      -- false until the switch is thrown
```

Tests: `npm run test:schema` loads the three files on top of the whole schema
twice (re-runnability), compares the live `usage_names()` to `navigation.json`,
then runs the three check files. When a section is merged into
`supabase/schema/supabase-schema.sql`, remove it from `STANDALONE` in `scripts/test-schema.mjs`.

---

## §45 — Admin controls (schema)

File: `supabase/schema/schema-45-admin-controls.sql` (standalone, **RUN LIVE 13 Oct 2026**; requires
§40's `admin_audit_write`, and refuses to load without it). Checks:
`scripts/schema-tests/admin-controls.sql`. Until §40 is folded into
`supabase/schema/supabase-schema.sql`, `npm run test:schema` loads
`scripts/schema-tests/audit-shim.sql` (a stand-in `admin_audit_write` that logs to
`public.test_audit_log`) and then the section, twice; delete the shim and its
line in `scripts/test-schema.mjs` when §40 lands and point the audit assertions
(`t.audits(...)`) at the real log.

Owner decisions applied (plan §11): no public contact form, no anon submit,
no outbound mail, no digest. The only anon-callable function is the read-only
`site_announcement_now()`.

### Roles

| Role | Intended reach |
| --- | --- |
| owner | everything; the switch, prices, flags/overrides, roles, banner, export/delete of a person |
| finance | refunds, invoices, payments, promo codes (+ read the support queue) |
| support | notes, trial grants, sessions, the support queue, passes and shares |

`require_role(array['finance'])` is the one line an RPC adds; owner always passes;
42501 with a sentence otherwise. **Existing RPCs are not retrofitted by §45** —
that is a separate pass. `is_studio_admin()` is unchanged and true for all three
roles (a role makes the person an admin member). A studio admin with no
`admin_roles` row reads as `owner`. The last owner cannot be removed or demoted
(trigger, 23514).

### RPCs

| RPC | Who | Notes |
| --- | --- | --- |
| `studio_role() -> text` | authenticated | null for non-admins |
| `require_role(text[])` | authenticated | raises 42501 |
| `admin_list_roles() -> jsonb` | owner | |
| `admin_set_role(p_user uuid, p_role text) -> jsonb` | owner | `p_role` null removes the role and demotes the membership |
| `effective_features() -> jsonb` | authenticated | fails open to the plan's own map |
| `admin_set_feature_override(p_key, p_scope, p_scope_id, p_enabled bool) -> jsonb` | owner | `p_enabled` null deletes the override |
| `admin_list_feature_overrides() -> jsonb` | owner | `{overrides, known_keys}` |
| `site_announcement_now() -> jsonb` | anon, authenticated | one object or null |
| `admin_set_announcement(p_text, p_level='info', p_starts_at=null, p_ends_at=null) -> uuid` | owner | retires the previous banner |
| `admin_clear_announcement() -> int` | owner | |
| `admin_log_ticket(p_email, p_subject, p_body='') -> uuid` | owner, support | |
| `admin_update_ticket(p_id, p_status=null, p_assignee=null, p_note=null, p_unassign=false) -> jsonb` | owner, support | |
| `admin_list_support(p_status=null, p_limit=200) -> jsonb` | owner, support, finance | tickets + pending refunds + pending invites |
| `admin_list_passes() -> jsonb`, `admin_revoke_pass(p_code)`, `admin_extend_pass(p_code, p_days)` | owner, support | metadata only |
| `admin_list_shares() -> jsonb`, `admin_revoke_share(p_share uuid)` | owner, support | no token in the reply |
| `admin_export_user(p_user uuid) -> jsonb` | owner | server-side data only; `note` says so |
| `admin_delete_user(p_user uuid, p_confirm_email text) -> jsonb` | owner | tombstone; refuses self and the last owner |

Every mutating RPC (and the export) calls `admin_audit_write`.

### Feature overrides: the one client change

`billing_status()` is deliberately **not** restated (it has been restated five
times; its shape is the client's contract). Overrides are served by
`effective_features()`, which starts from `billing_status() -> 'features'` and
applies `feature_overrides`: account > plan > global > the plan matrix (within a
scope the restrictive row wins). In `plan-gate.js`, read features as
`(await rpc('effective_features')) ?? billing.features`. Keys must exist as
booleans in some plan's `plans.features` (`sample_only` is refused). A plan-scope
override only touches users of that plan; `plans.features` is never edited, so
`npm run test:plans` is unaffected.

### Support queue status vocabulary

ticket: stored `open|waiting|closed`. refund request: pending -> open,
approved -> waiting; declined/refunded are done and not listed. invite request:
pending -> open; decided ones are not listed. So the `closed` filter lists
tickets only.

### Data-subject tools — decisions worth the owner's eye

- **Invoices are retained** on deletion (Bills of Supply are the seller's
  statutory record; `invoices` has no FK to the person). `payments` and refund
  rows cascade away with the sign-in. The reply says `invoices_retained: n`.
- The tombstone is `sha256(lower(email))` + date. A `BEFORE INSERT` trigger on
  `leads` skips a tombstoned address **silently** (like a repeat sign-up);
  `add_lead()` is not restated. A person can still sign in again with Google;
  only the leads list refuses them.
- Comments the person left on other people's films are kept and anonymised
  (`Deleted user`); share links they made are deleted; a team with other active
  members blocks the deletion until it is transferred or closed.
- The "last owner" refusal in `admin_delete_user` is defensive: the caller must
  be an owner and cannot target themselves, so another owner always exists.

### Banner and verify

`site_announcement_now()` is meant to be read once per session by `chrome.js`.
The banner is text in a row and is **not** in `baseline.json`: `npm run verify`
must run with `site_announcement` empty (it does; the table is new and empty).

---

## §46 — The role matrix (schema) and the Controls tab

File: `supabase/schema/schema-46-role-matrix.sql` (standalone, **RUN LIVE 13 Oct 2026**, run checksummed and read back; refuses to
load without §40 `admin_audit_write`, §42 `admin_add_note` and §45
`require_role`). Checks: `scripts/schema-tests/role-matrix.sql`; `npm run
test:schema` loads it twice, after the §45 checks. Fixture ids `…046xx`.

§45 deliberately did not retrofit the writers that already existed. §46 does:
each of the twenty restates its **latest** definition (§40 for the nineteen
audited writers, §42 for `admin_add_note`) with one line added straight after the
`is_studio_admin()` check, and nothing else changed (audit calls, sentences,
errcodes, return types and grants are byte-identical):

```
perform public.require_role(array['<role>']);
```

Owner always passes, as does a studio admin with no `admin_roles` row (reads as
owner), and §45 backfilled every existing admin as owner — so nobody who could do
something yesterday is refused today. Reads (`admin_list_*`, `admin_customer`,
`admin_funnel`, …) are **not** narrowed; they show what an admin already sees.

| Role | Writers |
| --- | --- |
| finance | `admin_decide_refund_request`, `admin_issue_invoice`, `admin_resend_receipt`, `admin_set_promo_code`, `admin_mark_referral_paid`, **the REFUND itself** (`rzp-refund` calls `require_role(['finance'])` as the caller, and §48's `begin_refund()` checks the actor again) |
| support | `admin_grant_trial`, `admin_terminate_session`, `admin_add_note` |
| owner | `admin_grant_plan`, `admin_set_plan`, `admin_set_plan_price`, `admin_set_next_price`, `admin_set_billing_settings`, `admin_set_refund_requests_enabled`, `admin_grant_email`, `admin_revoke_email_grant`, `admin_decide_request`, `admin_reset_user`, `admin_create_invite`, `admin_revoke_invite` (+ every §45 owner RPC) |

Judgement calls, all conservative toward owner — change one by editing its
`array['…']` and the matrix in `scripts/schema-tests/role-matrix.sql`:

- `admin_decide_request` (approve/decline an invite request) is **owner**: approving
  one grants access. Support can read the queue (§45) but an owner decides.
- `admin_grant_email` / `admin_revoke_email_grant` are **owner**: an e-mail grant
  is a plan or role grant.
- `admin_grant_plan` is **owner** (it gives a paid plan for good); `admin_grant_trial`
  is **support** (the brief names trial grants).
- `admin_set_refund_requests_enabled` is **owner**: it is a switch, like the
  purchases switch.
- `admin_set_plan` is **owner**: it edits what a plan is.
- **Issuing a refund** (`rzp-refund` → `begin_refund()`) is **finance**: money out.
  Until §48 and the redeploy, the edge function checked only `is_studio_admin()`,
  so any console role could issue one; it now asks `require_role(['finance'])`
  as the caller and the database asks the same of `p_admin`.
- `admin_mark_referral_paid` is **finance**: money out. `admin_resend_receipt` is
  **finance**: the invoice's other half.
- `admin_terminate_session` is **support** (the brief names sessions) even though
  `disable := true` locks the account; revisit if that should be owner.
- `admin_reset_user` is **owner**; `admin_create_invite` / `admin_revoke_invite`
  are **owner**.

### The Controls tab and the banner (client)

- `src/pages/admin-tabs/controls.js` is a shell; `controls-body.js` loads on first
  open (its own chunk, so admin's first-paint budget does not carry it) and draws
  Roles, Feature overrides, Announcement banner and Data tools. Owner-only: any
  other role sees a sentence and **no owner RPC is called**. Every refusal the
  server makes (the last-owner sentence, a mismatched e-mail) is shown verbatim.
- `src/ui/site-banner.js` (in CORE, one import in `chrome.js`) asks
  `site_announcement_now()` **once per session**, with a plain `fetch` and the
  public key (no Supabase SDK, so a signed-out first load still fetches no
  `supabase-*` chunk), deferred to idle after `load`. The answer is cached in
  `sessionStorage`, written on `pagehide` (not when the answer arrives) so verify's
  idle-writes check cannot see it; dismissal is per-id in `sessionStorage`.
  **No banner row means no element in the DOM**, which is why `npm run verify`
  needs `site_announcement` empty (a live banner adds words to every page).
  The bar is static at the top of `<body>`, never changes by itself, and is hidden
  in print.
- `plan-gate.js` reads `effective_features()` after `billing_status()`: an object
  replaces `features`; an error, a missing function, or anything that is not an
  object keeps `billing_status()`'s map. It fails **open**.
- `scripts/fake-admin-rpcs-controls.mjs` is a self-checking browser harness for all
  of the above against the shared fake Supabase (see its header).
