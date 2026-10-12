# Admin console v2 — schema run order (stub)

The plan is `docs/ADMIN-CONSOLE-PLAN.md`. This file is only the deploy half for
the sections that exist so far. Neither section has been run live.

| Section | File | Needs | Adds |
| --- | --- | --- | --- |
| §40 | `schema-40-admin-audit.sql` | §1–§39 | `admin_audit`, `admin_audit_write()`, `admin_list_audit()`, and nineteen admin writers restated with an audit call |
| §42 | `schema-42-customer-360.sql` | **§40** | `admin_notes`, `admin_add_note()`, `admin_list_notes()`, `admin_customer()` |

(§41, health and launch, is another lane. §42 does not depend on it.)

## Order

1. **§40, then §42.** §42's `admin_add_note()` calls `admin_audit_write()` and
   `admin_customer()` reads `admin_audit`; run in the other order and the
   section loads (plpgsql binds late) and then fails at first call.
2. **Fetch before you number.** These files say 40 and 42 because 41 was
   reserved for the health lane. If another session has taken either number,
   renumber; do not collide.
3. Both files are re-runnable. `npm run test:schema` loads each twice.
4. Until the main thread folds them into `supabase-schema.sql`, the test runner
   loads the two standalone files itself, on top of the whole schema, before
   the §32-onward check files. Once `admin_audit_write` appears in
   `supabase-schema.sql` the runner stops loading them and only runs
   `admin-audit.sql` and `admin-customer.sql`.

## Pasting SQL: checksum, never the raw clipboard

`pbcopy` then paste into the dashboard editor turns every em-dash into
mojibake (UTF-8 read as MacRoman), and both files contain em-dashes and
user-facing sentences. Do not paste them.

```bash
shasum -a 256 schema-40-admin-audit.sql          # note it
base64 -i schema-40-admin-audit.sql | pbcopy      # pure ASCII crosses the clipboard
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
