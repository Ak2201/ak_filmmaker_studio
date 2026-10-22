# Live steps, 22 Oct 2026 — §55 (keep the budget private)

**Order: after §54 (`docs/LIVE-STEPS-2026-10-21.md`), in the SQL editor. No
edge function redeploy.** The client half is safe either way: until §55 runs,
`budget_privacy()` / `set_budget_private()` do not exist, the client reads
every film as "not private" and hides the switch. Run §55 BEFORE releasing a
client that shows the switch to `main`.

## 0. The paste rule

Never paste SQL through the clipboard as text. Paste base64, decode it in the
page, and compare the checksum before pressing Run.

```bash
shasum -a 256 supabase/schema/schema-55-budget-private.sql
# cedcdde22953a0463ce2fd9f7530bb72f55216db41dae5d4d673c443dfcb8da7
```

## 1. Run §55

Re-runnable. It adds `projects.budget_private` (default false, so every
existing film keeps today's behaviour), the owner-only trigger and RPC, and
restates `pd_select`, `pd_write`, `cm_select`, `cm_insert`, `cm_update`.
**Do not replay `supabase-schema.sql` afterwards** — it would put the
unguarded policies back without an error.

## 2. Read back

```sql
select column_default, is_nullable from information_schema.columns
 where table_schema = 'public' and table_name = 'projects' and column_name = 'budget_private';  -- false | NO
select count(*) from public.projects where budget_private;                                     -- 0
select polname, pg_get_expr(polqual, polrelid) from pg_policy
 where polrelid = 'public.project_data'::regclass order by polname;                           -- both has_scope_access(...)
select tgname from pg_trigger where tgrelid = 'public.projects'::regclass
   and tgname = 'projects_guard_budget_private';                                               -- one row
select has_function_privilege('anon', 'public.set_budget_private(uuid, boolean)', 'execute');  -- false
```

## 3. Live check (two accounts)

`docs/SECURITY-RLS.md`, "§55 KEEP THE BUDGET PRIVATE", live checks 1–4.
