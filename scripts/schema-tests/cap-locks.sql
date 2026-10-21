-- ============================================================
-- SECTION 54 CHECKS — the plan caps take a lock before they count
-- ------------------------------------------------------------
-- Runs after §54 has loaded. Own people (…5401 upward). The truly
-- concurrent case (two sessions inserting at once) is driven from
-- scripts/test-schema.mjs, which needs two connections; this file
-- proves each body takes its lock and that every cap still refuses.
-- Every check in part 1 failed against §53 before §54 was written.
-- ============================================================
\set ON_ERROR_STOP on

-- 1. each cap trigger locks, and locks BEFORE its count -----------------------
do $$
declare f text; def text;
begin
  foreach f in array array['enforce_project_limit', 'enforce_share_limit', 'enforce_collaborator_limit', 'enforce_seat_limit'] loop
    def := pg_get_functiondef(('public.' || f || '()')::regprocedure);
    if position('pg_advisory_xact_lock(' in def) = 0 then
      raise exception 'ASSERTION FAILED: % takes no advisory lock', f;
    end if;
    if position('pg_advisory_xact_lock(' in def) > position('count(*)' in def) then
      raise exception 'ASSERTION FAILED: % counts before it locks', f;
    end if;
    raise notice 'ok - 54. % takes pg_advisory_xact_lock before its count(*)', f;
  end loop;
end $$;
select t.ok(position('fms:cap:shares:'' || coalesce(owner' in pg_get_functiondef('public.enforce_share_limit()'::regprocedure)) > 0,
  '54. the share lock is per OWNER (its cap spans every film), not per film');

-- 2. the caps still refuse, with the same codes ------------------------------
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000005401', 's54-owner@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000005402', 's54-c1@example.com',    now(), '{}'),
  ('00000000-0000-4000-8000-000000005403', 's54-c2@example.com',    now(), '{}');
insert into public.studio_members (user_id, role) values ('00000000-0000-4000-8000-000000005401', 'user');

begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_billing_settings('{"purchase_required": true}');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000005401');
insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-000000005401', 'S54 One');
do $$ begin
  insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-000000005401', 'S54 Two');
  raise exception 'should have refused';
exception when sqlstate 'P0402' then
  raise notice 'ok - 54. projects: the cap still refuses with P0402 after the lock';
end $$;
do $$
declare cap int := public.plan_cap((select x.limits from public.plans x where x.id = 'free'), 'shares');
begin
  if cap is null then raise exception 'ASSERTION FAILED: the free plan has no share cap to test'; end if;
  insert into public.shares (project_id, role, token, created_by)
    select p.id, 'view', 's54tok' || g, '00000000-0000-4000-8000-000000005401'
      from public.projects p, generate_series(1, cap) g where p.title = 'S54 One';
  begin
    insert into public.shares (project_id, role, token, created_by)
      select p.id, 'view', 's54tok-over', '00000000-0000-4000-8000-000000005401' from public.projects p where p.title = 'S54 One';
    raise exception 'should have refused';
  exception when sqlstate 'P0402' then
    raise notice 'ok - 54. shares: one past the cap (%) still refuses with P0402', cap;
  end;
end $$;
do $$
declare cap int := public.plan_cap((select x.limits from public.plans x where x.id = 'free'), 'collaborators');
begin
  if cap is null or cap > 1 then raise exception 'ASSERTION FAILED: this check expects a collaborator cap of 0 or 1, got %', cap; end if;
  if cap = 1 then
    insert into public.project_collaborators (project_id, user_id, role)
      select p.id, '00000000-0000-4000-8000-000000005402', 'view' from public.projects p where p.title = 'S54 One';
  end if;
  begin
    insert into public.project_collaborators (project_id, user_id, role)
      select p.id, '00000000-0000-4000-8000-000000005403', 'view' from public.projects p where p.title = 'S54 One';
    raise exception 'should have refused';
  exception when sqlstate 'P0402' then
    raise notice 'ok - 54. collaborators: one past the cap (%) still refuses with P0402', cap;
  end;
end $$;
rollback;

-- seats: an organisation at its ceiling (1) still refuses with 53400
begin;
select t.reset();
insert into public.accounts (owner_id, name, plan, seat_limit)
  values ('00000000-0000-4000-8000-000000005401', 'S54 Org', 'free', 1);
do $$
declare aid uuid := (select a.id from public.accounts a where a.name = 'S54 Org'); g int;
begin
  for g in 1..3 loop
    begin
      insert into public.account_members (account_id, invited_email, role, status)
        values (aid, 's54-seat' || g || '@example.com', 'member', 'pending');
    exception when sqlstate '53400' then
      if (select count(*) from public.account_members m where m.account_id = aid and m.status in ('pending','active')) <> 1 then
        raise exception 'ASSERTION FAILED: refused at the wrong count';
      end if;
      raise notice 'ok - 54. seats: one past the ceiling (1) still refuses with 53400';
      return;
    end;
  end loop;
  raise exception 'ASSERTION FAILED: three seats on a one-seat organisation were all admitted';
end $$;
rollback;
