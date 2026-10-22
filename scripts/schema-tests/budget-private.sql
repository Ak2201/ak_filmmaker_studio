-- ============================================================
-- SECTION 55 CHECKS — keep the budget private
-- ------------------------------------------------------------
-- Runs after §55 has loaded. Own people (…5501 upward), one film. The
-- seed is written as postgres (a privileged caller), so no plan cap or
-- membership trigger is what a check is measuring; every check then runs
-- under a real role switch with real RLS.
--   …5501 owner   …5502 edit   …5503 view   …5504 comment
--   …5505 stranger   …5506 edit, but the grant has expired
--   …5507 active owner of the organisation account the film sits in, with
--         no collaborator row (has_project_access admits them everywhere)
-- ============================================================
\set ON_ERROR_STOP on

create or replace function t.raises55(p_sql text, p_state text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return sqlstate = p_state;
end $$;
-- rows an UPDATE touched, as the caller (RLS hides a row from UPDATE silently)
create or replace function t.touched55(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
-- the scopes of the film the caller can read
create or replace function t.scopes55() returns text language sql as $$
  select coalesce(string_agg(d.scope, ',' order by d.scope), '')
    from public.project_data d where d.project_id = '00000000-0000-4000-8000-0000000055f1';
$$;
grant execute on function t.raises55(text, text), t.touched55(text), t.scopes55() to anon, authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000005501', 's55-owner@example.com',    now(), '{}'),
  ('00000000-0000-4000-8000-000000005502', 's55-edit@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000005503', 's55-view@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000005504', 's55-comment@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000005505', 's55-stranger@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000005506', 's55-expired@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000005507', 's55-orgadmin@example.com', now(), '{}');
insert into public.studio_members (user_id, role) values ('00000000-0000-4000-8000-000000005501', 'user');
-- the film sits in an organisation account: …5507 owns it, the film's own
-- owner …5501 is a plain member (a film can only be in an account its
-- owner is in, §51)
insert into public.accounts (id, name, owner_id, plan, seat_limit) values
  ('00000000-0000-4000-8000-0000000055a1', 'S55 Studio', '00000000-0000-4000-8000-000000005507', 'pro', 10);
insert into public.account_members (account_id, invited_email, user_id, role, status, joined_at) values
  ('00000000-0000-4000-8000-0000000055a1', 's55-orgadmin@example.com', '00000000-0000-4000-8000-000000005507', 'owner',  'active', now()),
  ('00000000-0000-4000-8000-0000000055a1', 's55-owner@example.com',    '00000000-0000-4000-8000-000000005501', 'member', 'active', now())
  on conflict (account_id, invited_email) do update set user_id = excluded.user_id, role = excluded.role, status = 'active';
insert into public.projects (id, owner_id, title, account_id) values
  ('00000000-0000-4000-8000-0000000055f1', '00000000-0000-4000-8000-000000005501', 'S55 Film', '00000000-0000-4000-8000-0000000055a1');
insert into public.project_collaborators (project_id, user_id, role, expires_at) values
  ('00000000-0000-4000-8000-0000000055f1', '00000000-0000-4000-8000-000000005502', 'edit',    null),
  ('00000000-0000-4000-8000-0000000055f1', '00000000-0000-4000-8000-000000005503', 'view',    null),
  ('00000000-0000-4000-8000-0000000055f1', '00000000-0000-4000-8000-000000005504', 'comment', null),
  ('00000000-0000-4000-8000-0000000055f1', '00000000-0000-4000-8000-000000005506', 'edit',    now() - interval '1 day');
insert into public.project_data (project_id, scope, data) values
  ('00000000-0000-4000-8000-0000000055f1', 'library', '{"total": 4600000}'),
  ('00000000-0000-4000-8000-0000000055f1', 'costs',   '{"petty": 1500}'),
  ('00000000-0000-4000-8000-0000000055f1', 'scenes',  '{"n": 2}'),
  -- the feature blueprint's own budget step (v2s11_*): NOT hidden by §55
  ('00000000-0000-4000-8000-0000000055f1', 'feature', '{"v2s11_total": "46000000", "v2s11_atl": "12000000"}'),
  ('00000000-0000-4000-8000-0000000055f1', 'script',  '{"els": []}');
insert into public.comments (project_id, scope, field_key, author_name, body) values
  ('00000000-0000-4000-8000-0000000055f1', 'library', 'lib_total', 'x', 'S55 budget thread'),
  ('00000000-0000-4000-8000-0000000055f1', 'scenes',  'sc_1',      'x', 'S55 scene thread');
insert into public.invite_codes (code, pass_type, target_project_id, max_redemptions, expires_at) values
  ('S55SCREEN', 'screening_pass', '00000000-0000-4000-8000-0000000055f1', 10, now() + interval '1 day');

-- 1. the column --------------------------------------------------------------
select t.ok((select column_default = 'false' and is_nullable = 'NO' from information_schema.columns
              where table_schema = 'public' and table_name = 'projects' and column_name = 'budget_private'),
  '55.1 projects.budget_private is not null default false');
select t.ok(not (select budget_private from public.projects where id = '00000000-0000-4000-8000-0000000055f1'),
  '55.2 a new film starts with the budget shared');

-- 2. OFF: nothing changes from before -------------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000005503');
select t.ok(t.scopes55() = 'costs,feature,library,scenes,script', '55.3 OFF: a viewer reads the budget and everything else');
select t.ok(t.touched55($$update public.project_data set data = '{"total": 1}' where project_id = '00000000-0000-4000-8000-0000000055f1' and scope = 'library'$$) = 0,
  '55.4 OFF: a viewer cannot change the estimate (0 rows)');
select t.ok(t.raises55($$insert into public.project_data (project_id, scope, data) values ('00000000-0000-4000-8000-0000000055f1', 'short', '{}')$$, '42501'),
  '55.5 OFF: a viewer cannot add a scope (42501)');
select t.ok(public.budget_privacy('00000000-0000-4000-8000-0000000055f1') = '{"private": false, "visible": true, "can_change": false}'::jsonb,
  '55.6 OFF: budget_privacy says shared, visible, not yours to change');
select t.ok((select count(*) from public.comments where project_id = '00000000-0000-4000-8000-0000000055f1') = 2,
  '55.7 OFF: a viewer reads the comment on a budget field');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000005504');
select t.ok(t.scopes55() = 'costs,feature,library,scenes,script', '55.8 OFF: a comment collaborator reads the budget');
select t.reset();
commit;

-- 3. only the owner changes the switch --------------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000005502');
select t.ok(t.raises55($$select public.set_budget_private('00000000-0000-4000-8000-0000000055f1', true)$$, '42501'),
  '55.9 an editor cannot call set_budget_private (42501)');
select t.ok(t.raises55($$update public.projects set budget_private = true where id = '00000000-0000-4000-8000-0000000055f1'$$, '42501'),
  '55.10 nor flip the column with a direct UPDATE, which proj_update would otherwise allow (42501)');
select t.ok(t.touched55($$update public.projects set title = 'S55 Film' where id = '00000000-0000-4000-8000-0000000055f1'$$) = 1,
  '55.11 an editor can still update the film row itself (the guard is on the switch only)');
select t.ok((public.budget_privacy('00000000-0000-4000-8000-0000000055f1') ->> 'can_change')::boolean = false,
  '55.12 budget_privacy tells an editor it is not theirs to change');
select t.reset();
commit;

do $$
declare u text;
begin
  foreach u in array array['00000000-0000-4000-8000-000000005503', '00000000-0000-4000-8000-000000005504', '00000000-0000-4000-8000-000000005505'] loop
    perform t.claims(u::uuid);
    if not t.raises55($q$select public.set_budget_private('00000000-0000-4000-8000-0000000055f1', true)$q$, '42501') then
      raise exception 'ASSERTION FAILED: % could turn the switch on', u;
    end if;
    if t.touched55($q$update public.projects set budget_private = true where id = '00000000-0000-4000-8000-0000000055f1'$q$) <> 0 then
      raise exception 'ASSERTION FAILED: % updated the film row', u;
    end if;
    perform t.reset();
  end loop;
  raise notice 'ok - 55.13 a viewer, a comment collaborator and a stranger: set_budget_private 42501, direct UPDATE 0 rows';
end $$;

begin;
select t.claims('00000000-0000-4000-8000-000000005505', 'anon');
select t.ok(t.raises55($$select public.set_budget_private('00000000-0000-4000-8000-0000000055f1', true)$$, '42501'),
  '55.14 anon cannot call set_budget_private (no execute grant)');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000005505');
select t.ok(t.raises55($$select public.set_budget_private('00000000-0000-4000-8000-0000000055ff', true)$$, '42501'),
  '55.15 a film that does not exist gets the same 42501 (no oracle)');
select t.ok(public.budget_privacy('00000000-0000-4000-8000-0000000055f1') is null,
  '55.16 budget_privacy is null for a stranger');
select t.reset();
commit;

select t.ok(not (select budget_private from public.projects where id = '00000000-0000-4000-8000-0000000055f1'),
  '55.17 after all of that the switch is still OFF');

begin;
select t.claims('00000000-0000-4000-8000-000000005501');
select t.ok(t.raises55($$select public.set_budget_private('00000000-0000-4000-8000-0000000055f1', null)$$, '22023'),
  '55.18 null is refused: say on or off (22023)');
select t.ok(public.set_budget_private('00000000-0000-4000-8000-0000000055f1', true) = true, '55.19 the owner turns it ON');
select t.ok(public.budget_privacy('00000000-0000-4000-8000-0000000055f1') = '{"private": true, "visible": true, "can_change": true}'::jsonb,
  '55.20 budget_privacy tells the owner: private, visible, yours');
select t.ok(t.scopes55() = 'costs,feature,library,scenes,script', '55.21 ON: the owner still reads everything');
select t.ok(t.touched55($$update public.project_data set data = '{"total": 4700000}' where project_id = '00000000-0000-4000-8000-0000000055f1' and scope = 'library'$$) = 1,
  '55.22 ON: the owner still writes the estimate');
select t.reset();
commit;

-- 4. ON: view and comment collaborators lose the budget, and only the budget ------
do $$
declare u text;
begin
  foreach u in array array['00000000-0000-4000-8000-000000005503', '00000000-0000-4000-8000-000000005504'] loop
    perform t.claims(u::uuid);
    if t.scopes55() <> 'feature,scenes,script' then
      raise exception 'ASSERTION FAILED: % reads %', u, t.scopes55();
    end if;
    if t.touched55($q$update public.project_data set data = '{"total": 1}' where project_id = '00000000-0000-4000-8000-0000000055f1' and scope in ('library', 'costs')$q$) <> 0 then
      raise exception 'ASSERTION FAILED: % changed the budget', u;
    end if;
    if (select count(*) from public.comments where project_id = '00000000-0000-4000-8000-0000000055f1') <> 1
       or exists (select 1 from public.comments where project_id = '00000000-0000-4000-8000-0000000055f1' and scope = 'library') then
      raise exception 'ASSERTION FAILED: % reads the budget thread', u;
    end if;
    if public.budget_privacy('00000000-0000-4000-8000-0000000055f1') <> '{"private": true, "visible": false, "can_change": false}'::jsonb then
      raise exception 'ASSERTION FAILED: budget_privacy for % is %', u, public.budget_privacy('00000000-0000-4000-8000-0000000055f1');
    end if;
    perform t.reset();
  end loop;
  raise notice 'ok - 55.23 ON: view and comment collaborators read scenes and script, zero budget rows (no error), cannot write it, do not see its comment thread, and budget_privacy says hidden';
end $$;

begin;
select t.claims('00000000-0000-4000-8000-000000005504');
select t.ok(t.raises55($$insert into public.comments (project_id, scope, field_key, author_id, author_name, body) values ('00000000-0000-4000-8000-0000000055f1', 'library', 'lib_total', '00000000-0000-4000-8000-000000005504', 'x', 'a note')$$, '42501'),
  '55.24 ON: a comment collaborator cannot open a thread on a budget field (42501)');
select t.ok(t.touched55($$insert into public.comments (project_id, scope, field_key, author_id, author_name, body) values ('00000000-0000-4000-8000-0000000055f1', 'scenes', 'sc_1', '00000000-0000-4000-8000-000000005504', 'x', 'a note')$$) = 1,
  '55.25 ON: but still comments on a scene');
select t.reset();
rollback;

begin;
select t.claims('00000000-0000-4000-8000-000000005502');
select t.ok(t.scopes55() = 'costs,feature,library,scenes,script', '55.26 ON: an editor reads the budget');
select t.ok(t.touched55($$update public.project_data set data = '{"petty": 2000}' where project_id = '00000000-0000-4000-8000-0000000055f1' and scope = 'costs'$$) = 1,
  '55.27 ON: and writes it');
select t.ok(public.budget_privacy('00000000-0000-4000-8000-0000000055f1') = '{"private": true, "visible": true, "can_change": false}'::jsonb,
  '55.28 ON: budget_privacy tells an editor: private, visible, not yours');
select t.ok(t.raises55($$update public.projects set budget_private = false where id = '00000000-0000-4000-8000-0000000055f1'$$, '42501'),
  '55.29 ON: an editor cannot turn it back off either (42501)');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000005503');
select t.ok((select d.data ->> 'v2s11_total' from public.project_data d
              where d.project_id = '00000000-0000-4000-8000-0000000055f1' and d.scope = 'feature') = '46000000',
  '55.38 ON: a viewer still reads the feature blueprint''s budget step (RLS gates rows, not keys; the copy says so)');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000005507');
select t.ok(public.has_project_access('00000000-0000-4000-8000-0000000055f1', 'edit'),
  '55.40 (precondition) the organisation account''s owner has edit access to the film');
select t.ok(t.scopes55() = 'feature,scenes,script',
  '55.41 ON: but not to a private budget: only the film''s owner and edit links read it');
select t.ok(t.touched55($$update public.project_data set data = '{"total": 1}' where project_id = '00000000-0000-4000-8000-0000000055f1' and scope = 'library'$$) = 0,
  '55.42 ON: nor write it (0 rows)');
select t.ok(public.budget_privacy('00000000-0000-4000-8000-0000000055f1') = '{"private": true, "visible": false, "can_change": false}'::jsonb,
  '55.43 ON: budget_privacy tells the organisation owner it is hidden');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000005506');
select t.ok(t.scopes55() = '', '55.30 ON: an editor whose grant has expired reads nothing at all');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000005505');
select t.ok(t.scopes55() = '', '55.31 ON: a stranger reads nothing');
select t.reset();
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000005505', 'anon');
select t.ok(t.scopes55() = '', '55.32 ON: anon reads nothing');
-- 5. the screening room never carried the budget, and still does not ---------
select t.ok((select not (s.scopes ? 'library') and not (s.scopes ? 'costs') and (s.scopes ? 'scenes')
               from public.screening_open('S55SCREEN') s),
  '55.33 a screening pass opens scenes but neither budget scope');
select t.ok((select (s.scopes ? 'feature') from public.screening_open('S55SCREEN') s),
  '55.39 a screening pass DOES carry the feature blueprint, budget step included (the copy says so)');
select t.reset();
commit;

-- 6. back OFF, and the viewer has it again -------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000005501');
select t.ok(public.set_budget_private('00000000-0000-4000-8000-0000000055f1', false) = false, '55.34 the owner turns it OFF');
select t.reset();
select t.claims('00000000-0000-4000-8000-000000005503');
select t.ok(t.scopes55() = 'costs,feature,library,scenes,script', '55.35 OFF again: the viewer reads the budget again');
select t.reset();
commit;

-- 7. the SQL editor (a privileged caller) can still set it ---------------------
select t.ok(t.touched55($$update public.projects set budget_private = true where id = '00000000-0000-4000-8000-0000000055f1'$$) = 1,
  '55.36 the service role / SQL editor may set the switch (the guard admits privileged callers)');
update public.projects set budget_private = false where id = '00000000-0000-4000-8000-0000000055f1';

-- 8. the policies name the rule -------------------------------------------------
select t.ok((select bool_and(pg_get_expr(polqual, polrelid) like '%has_scope_access(project_id, scope%')
               from pg_policy where polrelid = 'public.project_data'::regclass and polname in ('pd_select', 'pd_write'))
           and (select count(*) from pg_policy where polrelid = 'public.project_data'::regclass) = 2,
  '55.37 project_data has exactly two policies, both through has_scope_access');
select t.ok((select count(*) from pg_policy
              where polrelid = 'public.comments'::regclass and polname in ('cm_select', 'cm_insert', 'cm_update')
                and coalesce(pg_get_expr(polwithcheck, polrelid), pg_get_expr(polqual, polrelid)) like '%has_scope_access(project_id, scope%') = 3,
  '55.44 cm_select / cm_insert / cm_update all go through has_scope_access (a replayed supabase-schema.sql would fail this)');
