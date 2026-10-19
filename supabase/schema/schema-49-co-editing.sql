-- ============================================================
-- 49. THE CO-EDITING SWITCH   NOT YET RUN LIVE
-- ------------------------------------------------------------
-- Two people writing the same screenplay at once used to replace each
-- other's saves: the script syncs as one blob and the newer one won.
-- The client can now MERGE the two copies line by line
-- (src/lib/script-merge.js) instead, which changes how every script save
-- from every collaborator is applied. So it ships behind a switch, OFF,
-- and the owner turns it on from the console once two real accounts have
-- tried it (docs/LIVE-STEPS-2026-10-19.md).
--
--   co_editing_enabled()                 public, anon-callable: the switch
--   admin_set_co_editing_enabled(bool)   owner only, audited
--
-- The column sits on the singleton billing_settings row beside the other
-- studio-wide switches (purchase_required, refund_requests_enabled); it is
-- not about billing, it is the one settings row the studio has.
--
-- ORDER: the client is safe before this runs. It asks
-- co_editing_enabled(); a missing function reads as OFF, and OFF is the
-- behaviour this database has always had (whole-script, newer wins, plus
-- the "a newer copy arrived" draft on the Screenplay Writer).
--
-- REQUIRES §40 (admin_audit_write) and §45 (require_role). Re-runnable.
-- ============================================================

alter table public.billing_settings add column if not exists co_editing_enabled boolean not null default false;

create or replace function public.co_editing_enabled()
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$ select coalesce((select s.co_editing_enabled from public.billing_settings s where s.id), false); $$;

create or replace function public.admin_set_co_editing_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare v_old boolean;
begin
  if not public.is_studio_admin() then raise exception 'Administrators only' using errcode = '42501'; end if;
  perform public.require_role(array['owner']);
  if p_enabled is null then raise exception 'Say on or off' using errcode = '22023'; end if;
  select s.co_editing_enabled into v_old from public.billing_settings s where s.id;
  update public.billing_settings s set co_editing_enabled = p_enabled, updated_at = now(), updated_by = auth.uid() where s.id;
  perform public.admin_audit_write('set_co_editing_enabled', 'setting', 'co_editing_enabled',
    jsonb_build_object('enabled', v_old), jsonb_build_object('enabled', p_enabled));
  return p_enabled;
end;
$fn$;

revoke execute on function public.co_editing_enabled()                 from public;
grant  execute on function public.co_editing_enabled()                 to anon, authenticated;
revoke execute on function public.admin_set_co_editing_enabled(boolean) from public, anon;
grant  execute on function public.admin_set_co_editing_enabled(boolean) to authenticated;
