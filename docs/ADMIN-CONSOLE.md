# Admin console v2 — build and deploy notes

The plan is `docs/ADMIN-CONSOLE-PLAN.md` (it lives in the main checkout until
that lane merges it). This file is the operational record, written one section
per lane so merges stay mechanical. Each lane owns the heading block below that
carries its section numbers; do not edit another lane's block.

---

## Lane: §41 launch & health, §43 usage & cohorts, §44 sync & limits

Standalone files at the repo root, **not yet folded into `supabase-schema.sql`**
and **not run live** (no `RUN LIVE` marker is set on any of them):

| File | Contents |
| --- | --- |
| `schema-41-admin-health.sql` | `admin_health()`, `admin_launch_preview()`, three internal probes |
| `schema-43-usage-cohorts.sql` | `usage_daily`, `usage_rate`, `usage_names()` (GENERATED block), `bump_usage()`, `admin_usage()`, `admin_cohorts()` |
| `schema-44-sync-limits.sql` | `sync_errors`, `sync_error_rate`, the two allow-lists, `report_sync_error()`, `admin_sync_overview()`, `admin_limit_pressure()` |
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
`supabase-schema.sql`, remove it from `STANDALONE` in `scripts/test-schema.mjs`.
