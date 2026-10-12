-- ============================================================
-- TEST SHIM for section 40's public.admin_audit_write()
-- ------------------------------------------------------------
-- Section 40 (the audit log) is authored on another branch. Section 45
-- calls admin_audit_write() from every mutating RPC, so the scratch
-- database needs a function of EXACTLY that signature. This one records
-- each call in public.test_audit_log so admin-controls.sql can assert
-- that every RPC audits. DELETE THIS FILE, and its line in
-- scripts/test-schema.mjs, when section 40 is in supabase-schema.sql —
-- the audit checks then read the real log instead.
-- ============================================================
create table if not exists public.test_audit_log (
  n           bigserial primary key,
  actor       uuid,
  action      text,
  target_kind text,
  target_id   text,
  before      jsonb,
  after       jsonb,
  note        text
);
revoke all on public.test_audit_log from public, anon, authenticated;

create or replace function public.admin_audit_write(
  p_action text, p_target_kind text, p_target_id text,
  p_before jsonb default null, p_after jsonb default null, p_note text default null)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.test_audit_log (actor, action, target_kind, target_id, before, after, note)
  values (auth.uid(), p_action, p_target_kind, p_target_id, p_before, p_after, p_note);
$$;
revoke execute on function public.admin_audit_write(text, text, text, jsonb, jsonb, text) from public, anon;
