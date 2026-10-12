-- ============================================================
-- AUDIT SHIM — a stand-in for section 40's admin_audit_write()
-- ------------------------------------------------------------
-- Section 40 (the audit log) is authored by another lane and does not
-- exist in this tree. Sections 41, 43 and 44 are written so that any
-- admin RPC of theirs that MUTATES can call
--     admin_audit_write(action, target_kind, target_id, before, after, note)
-- in the same transaction as the change. None of them does today (every
-- admin_* RPC here is a read), so nothing calls it; the stub is loaded
-- only so that adding the first writer does not need the test setup
-- changed, and so a call in a future draft fails on logic, not on a
-- missing function.
--
-- It is CREATED ONLY IF ABSENT: once section 40 is merged into the
-- schema and loaded first, its real function is kept and this file is a
-- no-op. It records nothing.
-- ============================================================
do $$
begin
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'admin_audit_write') then
    create function public.admin_audit_write(
      p_action text, p_target_kind text, p_target_id text,
      p_before jsonb default null, p_after jsonb default null, p_note text default null)
    returns void
    language plpgsql
    security definer
    set search_path = public, pg_temp
    as $f$
    begin
      null;   -- SHIM: the real function appends to admin_audit (section 40)
    end;
    $f$;
    revoke execute on function public.admin_audit_write(text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
  end if;
end $$;
