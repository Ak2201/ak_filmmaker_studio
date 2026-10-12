-- ============================================================
-- SECTION 44 CHECKS — sync errors, the sync overview, limit pressure
-- ------------------------------------------------------------
-- The list at 44.6, executed. Runs after schema-44-sync-limits.sql has
-- loaded on top of the whole schema, with its own people (…4401 upward).
-- Earlier files leave projects and project_data behind, so the report
-- checks run inside transactions that first clear those two tables and
-- are rolled back.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000004401', 's-heavy@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004402', 's-light@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004403', 's-none@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000004404', 's-gone@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000004405', 's-flood@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004406', 's-nonmember@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004407', 'p-full@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000004408', 'p-ok@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000004409', 'p-free@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-00000000440a', 'p-pro@example.com',    now(), '{}'),
  ('00000000-0000-4000-8000-00000000440b', 'p-disk@example.com',   now(), '{}');
insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-000000004401', 'user'), ('00000000-0000-4000-8000-000000004402', 'user'),
  ('00000000-0000-4000-8000-000000004403', 'user'), ('00000000-0000-4000-8000-000000004405', 'user'),
  ('00000000-0000-4000-8000-000000004407', 'user'), ('00000000-0000-4000-8000-000000004408', 'user'),
  ('00000000-0000-4000-8000-000000004409', 'user'), ('00000000-0000-4000-8000-00000000440a', 'user'),
  ('00000000-0000-4000-8000-00000000440b', 'user');
insert into public.studio_members (user_id, role, disabled_at) values
  ('00000000-0000-4000-8000-000000004404', 'user', now());

-- 1. who may report, and what the table is
select t.reset();
do $$ begin perform public.report_sync_error('script', '23514'); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 44. (1) anon: report_sync_error -> 42501'; end $$;
begin;
select t.claims('00000000-0000-4000-8000-000000004403');
do $$ begin perform 1 from public.sync_errors; raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 44. (1) authenticated cannot select sync_errors -> 42501'; end $$;
do $$ begin insert into public.sync_errors (day, scope, code, count) values (current_date, 'script', '23514', 1); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 44. (1) authenticated cannot insert into sync_errors -> 42501'; end $$;
do $$ begin perform 1 from public.sync_error_rate; raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 44. (1) authenticated cannot read the rate rows -> 42501'; end $$;
rollback;
select t.ok((select array_agg(column_name::text order by column_name) from information_schema.columns
              where table_schema = 'public' and table_name = 'sync_errors') = array['code', 'count', 'day', 'scope'],
  '44. (1) sync_errors has exactly day, scope, code, count — no id, payload or error text');
select t.ok((select relrowsecurity from pg_class where oid = 'public.sync_errors'::regclass)
        and (select relrowsecurity from pg_class where oid = 'public.sync_error_rate'::regclass),
  '44. (1) RLS is on for both tables');

-- 2. the CHECKs, and what is counted
do $$ begin insert into public.sync_errors (day, scope, code, count) values (current_date, 'nope', '23514', 1); raise exception 'should have refused';
exception when check_violation then raise notice 'ok - 44. (2) a scope outside the list -> 23514'; end $$;
do $$ begin insert into public.sync_errors (day, scope, code, count) values (current_date, 'script', 'whatever', 1); raise exception 'should have refused';
exception when check_violation then raise notice 'ok - 44. (2) a code outside the list -> 23514'; end $$;
begin;
select t.claims('00000000-0000-4000-8000-000000004406');   -- signed in, NOT a member: still reports
select public.report_sync_error('script', '23514');
select public.report_sync_error('script', '23514');
select public.report_sync_error('write_goals', '42501');
select public.report_sync_error('typed by a person', 'free text <script>');
select public.report_sync_error(null, null);
select t.reset();
select t.ok((select count from public.sync_errors where scope = 'script' and code = '23514') = 2,
  '44. (2) two reports of the same refusal make count 2 (a non-member may report: P0401 is itself a code)');
select t.ok((select count from public.sync_errors where scope = 'write_goals' and code = '42501') = 1,
  '44. (2) a scope the database may not yet allow is a legitimate report');
select t.ok((select count from public.sync_errors where scope = 'other' and code = 'other') = 2,
  '44. (2) a free-text scope and code, and nulls, are stored as other/other and nothing typed survives');
select t.ok((select count(*) from public.sync_errors) = 3, '44. (2) three rows in all');
select t.ok(not exists (select 1 from public.sync_errors where scope like '%person%' or code like '%script%'),
  '44. (2) the typed text is nowhere in the table');
rollback;

-- 3. the per-user cap: 30 an hour, and the count stays at 30
begin;
delete from public.sync_errors;
select t.claims('00000000-0000-4000-8000-000000004405');
do $$
declare i int; got boolean := false;
begin
  for i in 1..30 loop perform public.report_sync_error('costs', '42501'); end loop;
  begin
    perform public.report_sync_error('costs', '42501');
  exception when sqlstate 'P0429' then got := true;
  end;
  if not got then raise exception 'the 31st report in an hour was not refused'; end if;
  raise notice 'ok - 44. (3) 30 reports an hour pass, the 31st -> P0429';
end $$;
select t.reset();
select t.ok((select count from public.sync_errors where scope = 'costs' and code = '42501') = 30,
  '44. (3) the refused report was not counted: 30');
rollback;

-- 4. the table's own daily ceiling drops a report silently
begin;
delete from public.sync_errors;
insert into public.sync_errors (day, scope, code, count) values ((now() at time zone 'Asia/Kolkata')::date, 'other', 'other', 20000);
select t.claims('00000000-0000-4000-8000-000000004401');
select public.report_sync_error('script', '23514');
select t.reset();
select t.ok((select sum(count) from public.sync_errors) = 20000 and not exists (select 1 from public.sync_errors where scope = 'script'),
  '44. (4) past 20,000 a day a report is dropped, with no error');
rollback;

-- 5. the overview is admin only
select t.reset();
do $$ begin perform public.admin_sync_overview(); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 44. (5) anon: admin_sync_overview -> 42501'; end $$;
do $$ begin perform public.admin_limit_pressure(); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 44. (5) anon: admin_limit_pressure -> 42501'; end $$;
begin;
select t.claims('00000000-0000-4000-8000-000000004401');
do $$ begin perform public.admin_sync_overview(); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 44. (5) a member: admin_sync_overview -> 42501'; end $$;
do $$ begin perform public.admin_limit_pressure(); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 44. (5) a member: admin_limit_pressure -> 42501'; end $$;
rollback;

-- 6. the overview on a seeded set
begin;
delete from public.project_data;
delete from public.projects;
delete from public.sync_errors;
insert into public.projects (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000044a1', '00000000-0000-4000-8000-000000004401', 'Heavy 1'),
  ('00000000-0000-4000-8000-0000000044a2', '00000000-0000-4000-8000-000000004401', 'Heavy 2'),
  ('00000000-0000-4000-8000-0000000044a3', '00000000-0000-4000-8000-000000004402', 'Light 1');
insert into public.project_data (project_id, scope, data, updated_at) values
  ('00000000-0000-4000-8000-0000000044a1', 'script', jsonb_build_object('a', repeat('x', 1000)), now() - interval '2 hours'),
  ('00000000-0000-4000-8000-0000000044a2', 'script', jsonb_build_object('a', repeat('x', 1000)), now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000044a2', 'scenes', jsonb_build_object('a', repeat('x', 500)),  now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000044a3', 'script', jsonb_build_object('a', repeat('x', 100)),  now() - interval '10 days');
select t.claims('00000000-0000-4000-8000-000000004401');
select public.report_sync_error('script', '23514');
select t.reset();
select t.claims('00000000-0000-4000-8000-00000000000a');
create temp table _s as select public.admin_sync_overview() as o;
select t.ok((select (o ->> 'members')::int from _s) = (select count(*) from public.studio_members where disabled_at is null),
  '44. (6) members counts the enabled studio members, the disabled one not');
select t.ok((select o #> '{last_sync_buckets}' ->> 'under_1d' from _s)::int = 1
        and (select o #> '{last_sync_buckets}' ->> 'd1_to_7' from _s)::int = 0
        and (select o #> '{last_sync_buckets}' ->> 'd7_to_30' from _s)::int = 1
        and (select o #> '{last_sync_buckets}' ->> 'over_30d' from _s)::int = 0,
  '44. (6) last-sync buckets: heavy (latest write 2h ago) under 1 day, the light one (10 days) in 7-30, none in between or beyond');
select t.ok((select o #>> '{last_sync_buckets,never}' from _s)::int = (select o ->> 'members' from _s)::int - 2,
  '44. (6) everybody else is "never": no film, no sync');
select t.ok((select (o #>> '{last_sync_buckets,under_1d}')::int + (o #>> '{last_sync_buckets,d1_to_7}')::int + (o #>> '{last_sync_buckets,d7_to_30}')::int
                   + (o #>> '{last_sync_buckets,over_30d}')::int + (o #>> '{last_sync_buckets,never}')::int from _s) = (select (o ->> 'members')::int from _s),
  '44. (6) the five buckets partition the members');
select t.ok((select (o #>> '{project_data,rows}')::int from _s) = 4
        and (select (o #>> '{project_data,bytes}')::int from _s) = 1009 + 1009 + 509 + 109
        and (select (o #>> '{project_data,accounts_with_data}')::int from _s) = 2,
  '44. (6) four rows, their logical size to the byte, two accounts holding data');
select t.ok((select o #>> '{top_accounts,0,email}' from _s) = 's-heavy@example.com'
        and (select (o #>> '{top_accounts,0,bytes}')::int from _s) = 2527
        and (select (o #>> '{top_accounts,0,films}')::int from _s) = 2
        and (select (o #>> '{top_accounts,0,rows}')::int from _s) = 3
        and (select o #>> '{top_accounts,1,email}' from _s) = 's-light@example.com',
  '44. (6) top accounts: heaviest first, by account e-mail, with bytes, films and rows');
select t.ok((select o #> '{per_scope,0}' ->> 'scope' from _s) = 'script'
        and (select (o #>> '{per_scope,0,rows}')::int from _s) = 3
        and (select (o #>> '{per_scope,1,rows}')::int from _s) = 1,
  '44. (6) rows per scope: script 3, scenes 1');
select t.ok((select o -> 'allowed_scopes' from _s)
              = (select jsonb_agg(s order by s) from (select unnest(public.sync_error_scopes()) s) q where s <> 'other'),
  '44. (6) allowed_scopes (read from the CHECK) equals the client-reportable list, write_goals included');
select t.ok((select o -> 'allowed_scopes' from _s) @> '"write_goals"'::jsonb,
  '44. (6) the CHECK names write_goals — section 37 is in the database');
select t.ok((select o -> 'reportable_not_allowed' from _s) = '[]'::jsonb and (select o -> 'in_use_not_allowed' from _s) = '[]'::jsonb,
  '44. (6) no scope is reportable-but-refused or stored-but-refused on the whole schema');
select t.ok((select (o #>> '{errors,total}')::int from _s) = 1
        and (select o #>> '{errors,by_scope_code,0,scope}' from _s) = 'script',
  '44. (6) the error counters appear: one script 23514');
rollback;

-- 7. code ahead of the database: the diff the console exists for
begin;
delete from public.project_data where scope = 'write_goals';
alter table public.project_data drop constraint project_data_scope_check;
alter table public.project_data add constraint project_data_scope_check check (scope in (
  'feature','short','library','feature_prefs','short_prefs','library_prefs','activity','scenes','contacts','shots','script',
  'locations','workbench','dissect','festivals','scriptgen','songs','story','idea_vault','edit','deliverables','characters','costs'));
select t.claims('00000000-0000-4000-8000-000000004401');
select public.report_sync_error('write_goals', '23514');
select t.reset();
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(public.admin_sync_overview() -> 'reportable_not_allowed' = '["write_goals"]'::jsonb,
  '44. (7) with write_goals missing from the CHECK, the client-reportable list shows it as refused');
select t.ok(not (public.admin_sync_overview() -> 'allowed_scopes' @> '"write_goals"'::jsonb),
  '44. (7) and allowed_scopes (read live from pg_constraint) no longer names it');
select t.ok(public.admin_sync_overview() #>> '{errors,on_scopes_not_allowed,0,scope}' = 'write_goals',
  '44. (7) the 23514 reports against that scope are surfaced as errors on a scope the database does not allow');
rollback;

-- 8. limit pressure
begin;
delete from public.project_data;
delete from public.projects;
update public.plans set limits = limits || '{"projects": 3}'::jsonb where id = 'indie';
update public.plans set limits = limits || '{"projects": 1}'::jsonb where id = 'free';
insert into public.accounts (id, owner_id, name, plan, plan_until) values
  ('00000000-0000-4000-8000-0000000044b7', '00000000-0000-4000-8000-000000004407', 'Full',  'indie', now() + interval '1 year'),
  ('00000000-0000-4000-8000-0000000044b8', '00000000-0000-4000-8000-000000004408', 'Ok',    'indie', now() + interval '1 year'),
  ('00000000-0000-4000-8000-0000000044ba', '00000000-0000-4000-8000-00000000440a', 'Pro',   'pro',   now() + interval '1 year'),
  ('00000000-0000-4000-8000-0000000044bb', '00000000-0000-4000-8000-00000000440b', 'Disk',  'free',  null);
update public.accounts set storage_limit_mb = 1 where id = '00000000-0000-4000-8000-0000000044bb';
insert into public.projects (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000044c1', '00000000-0000-4000-8000-000000004407', 'F1'),
  ('00000000-0000-4000-8000-0000000044c2', '00000000-0000-4000-8000-000000004407', 'F2'),
  ('00000000-0000-4000-8000-0000000044c3', '00000000-0000-4000-8000-000000004407', 'F3'),
  ('00000000-0000-4000-8000-0000000044c4', '00000000-0000-4000-8000-000000004408', 'O1'),
  ('00000000-0000-4000-8000-0000000044c5', '00000000-0000-4000-8000-000000004408', 'O2'),
  ('00000000-0000-4000-8000-0000000044c6', '00000000-0000-4000-8000-000000004409', 'Free1'),
  ('00000000-0000-4000-8000-0000000044c7', '00000000-0000-4000-8000-00000000440a', 'P1'),
  ('00000000-0000-4000-8000-0000000044c8', '00000000-0000-4000-8000-00000000440a', 'P2'),
  ('00000000-0000-4000-8000-0000000044c9', '00000000-0000-4000-8000-00000000440a', 'P3'),
  ('00000000-0000-4000-8000-0000000044ca', '00000000-0000-4000-8000-00000000440a', 'P4'),
  ('00000000-0000-4000-8000-0000000044cb', '00000000-0000-4000-8000-00000000440b', 'D1');
insert into public.project_data (project_id, scope, data) values
  ('00000000-0000-4000-8000-0000000044cb', 'script', jsonb_build_object('a', repeat('x', 900000)));
select t.claims('00000000-0000-4000-8000-00000000000a');
create temp table _p as select public.admin_limit_pressure() as p;
select t.ok((select (p ->> 'threshold_pct')::int from _p) = 80
        and (select (p ->> 'enforced')::bool from _p) = public.purchases_required(),
  '44. (8) the threshold is 80 and `enforced` is whatever purchases_required() says');
select t.ok((select e from jsonb_array_elements((select p -> 'accounts' from _p)) e where e ->> 'email' = 'p-full@example.com') #> '{metrics,0}'
              = '{"key": "projects", "used": 3, "cap": 3, "pct": 100.0}'::jsonb,
  '44. (8) 3 of 3 films on a plan capped at 3 is 100');
select t.ok(not exists (select 1 from jsonb_array_elements((select p -> 'accounts' from _p)) e where e ->> 'email' = 'p-ok@example.com'),
  '44. (8) 2 of 3 (66.7%) is not pressure');
select t.ok((select e ->> 'plan' from jsonb_array_elements((select p -> 'accounts' from _p)) e where e ->> 'email' = 'p-free@example.com') = 'free',
  '44. (8) a member on no plan is judged against the no-plan limits (1 of 1) — they are what the switch will enforce');
select t.ok(not exists (select 1 from jsonb_array_elements((select p -> 'accounts' from _p)) e where e ->> 'email' = 'p-pro@example.com'),
  '44. (8) an unlimited (null) cap never counts: four films on Pro is no pressure');
select t.ok((select (m ->> 'pct')::numeric from jsonb_array_elements((select e -> 'metrics' from jsonb_array_elements((select p -> 'accounts' from _p)) e
                                                                      where e ->> 'email' = 'p-disk@example.com')) m where m ->> 'key' = 'storage_bytes') between 80 and 100,
  '44. (8) storage: ~900 KB of a 1 MB account cap is reported (the cap is the account''s storage_limit_mb)');
select t.ok((select (p ->> 'count')::int from _p) = jsonb_array_length((select p -> 'accounts' from _p)),
  '44. (8) count equals the list length');
select t.ok((select (p #>> '{accounts,0,max_pct}')::numeric from _p) >= (select (p #>> '{accounts,-1,max_pct}')::numeric from _p),
  '44. (8) heaviest first');
select t.ok(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and p.proname ~* '(nudge|send|mail)' and p.proname ~* '(limit|pressure|sync|usage|cohort|health)'),
  '44. (8) there is no send-nudge function (owner decision): the report is read-only');
rollback;
