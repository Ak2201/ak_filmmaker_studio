-- ============================================================
-- SECTION 43 CHECKS — usage counters and cohorts
-- ------------------------------------------------------------
-- The list at 43.7, executed. Runs after schema-43-usage-cohorts.sql has
-- loaded on top of the whole schema, with its own people (…4301 upward).
-- Earlier files leave members, payments and sources behind, so cohort
-- figures for the seeded weeks are asserted absolutely (nobody earlier
-- was created in the past) and the by-source / by-attribution figures
-- as DELTAS against a baseline read first.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000004301', 'u-free@example.com',    now(), '{}'),
  ('00000000-0000-4000-8000-000000004302', 'u-indie@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000004303', 'u-stranger@example.com',now(), '{}'),
  ('00000000-0000-4000-8000-000000004304', 'u-disabled@example.com',now(), '{}'),
  ('00000000-0000-4000-8000-000000004305', 'u-flood@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000004306', 'u-big@example.com',     now(), '{}');
insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-000000004301', 'user'),
  ('00000000-0000-4000-8000-000000004302', 'user'),
  ('00000000-0000-4000-8000-000000004305', 'user'),
  ('00000000-0000-4000-8000-000000004306', 'user');
insert into public.studio_members (user_id, role, disabled_at) values
  ('00000000-0000-4000-8000-000000004304', 'user', now());
insert into public.accounts (owner_id, name, plan, plan_until) values
  ('00000000-0000-4000-8000-000000004302', 'Indie studio', 'indie', now() + interval '1 year');

-- 1. the table shape: counters only, no content column of any kind
select t.reset();
select t.ok((select array_agg(column_name::text order by column_name) from information_schema.columns
              where table_schema = 'public' and table_name = 'usage_daily') = array['count', 'day', 'name', 'plan'],
  '43. (1) usage_daily has exactly day, name, plan, count — no content column');
select t.ok(not exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'usage_daily'
                           and column_name in ('user_id', 'email', 'ip', 'session', 'payload', 'detail', 'text', 'body')),
  '43. (1) and none of them is an identity or a free-text column');
select t.ok((select relrowsecurity from pg_class where oid = 'public.usage_daily'::regclass)
        and (select relrowsecurity from pg_class where oid = 'public.usage_rate'::regclass),
  '43. (1) RLS is on for both tables');

-- 2. no client reaches either table; names and plans are CHECKed
begin;
select t.claims('00000000-0000-4000-8000-000000004301');
do $$ begin perform 1 from public.usage_daily; raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 43. (2) authenticated cannot select usage_daily -> 42501'; end $$;
do $$ begin insert into public.usage_daily (day, name, plan, count) values (current_date, 'script_import', 'free', 1); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 43. (2) authenticated cannot insert into usage_daily -> 42501'; end $$;
do $$ begin perform 1 from public.usage_rate; raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 43. (2) authenticated cannot read the rate rows -> 42501'; end $$;
rollback;
do $$ begin insert into public.usage_daily (day, name, plan, count) values (current_date, 'free text typed by a person', 'free', 1); raise exception 'should have refused';
exception when check_violation then raise notice 'ok - 43. (2) a name outside the list -> 23514'; end $$;
do $$ begin insert into public.usage_daily (day, name, plan, count) values (current_date, 'script_import', 'gold', 1); raise exception 'should have refused';
exception when check_violation then raise notice 'ok - 43. (2) a plan outside the four -> 23514'; end $$;
do $$ begin insert into public.usage_daily (day, name, plan, count) values (current_date, 'module_open:budget', 'free', -1); raise exception 'should have refused';
exception when check_violation then raise notice 'ok - 43. (2) a negative count -> 23514'; end $$;
select t.reset();

-- 3. the list: modules from navigation.json plus the eight fixed names
select t.ok(public.usage_names() @> array['module_open:budget', 'module_open:shoot-day', 'module_open:glossary',
                                           'script_import', 'export_pdf', 'export_docx', 'ai_call', 'drive_connect',
                                           'limit_hit', 'share_created', 'screening_pass_used'],
  '43. (3) the list carries modules from phases and from global pages, and the eight fixed names');
select t.ok(not (public.usage_names() && array['module_open:admin', 'module_open:home', 'module_open:settings']),
  '43. (3) global pages — the console among them — are not counters');
select t.ok((select count(*) from unnest(public.usage_names()) n) = (select count(distinct n) from unnest(public.usage_names()) n),
  '43. (3) no name is listed twice');

-- 4. bump_usage: who may, what is counted, what is ignored
select t.reset();
do $$ begin perform public.bump_usage(array['script_import']); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 43. (4) anon: bump_usage -> 42501'; end $$;
begin;
select t.claims('00000000-0000-4000-8000-000000004303');
select t.ok(public.bump_usage(array['module_open:budget']) = 0, '43. (4) a signed-in non-member counts nothing');
select t.reset();
select t.ok((select count(*) from public.usage_daily) = 0, '43. (4) and no row is written');
select t.claims('00000000-0000-4000-8000-000000004304');
select t.ok(public.bump_usage(array['module_open:budget']) = 0, '43. (4) a disabled member counts nothing either');
select t.reset();
select t.ok((select count(*) from public.usage_daily) = 0, '43. (4) and no row is written for them');
select t.claims('00000000-0000-4000-8000-000000004301');
select t.ok(public.bump_usage(array['module_open:budget', 'module_open:budget', 'nonsense', null, 'module_open:admin', 'export_pdf']) = 3,
  '43. (4) a member: duplicates count twice, unknown, null and the console''s name are ignored (3 counted)');
select t.ok(public.bump_usage(null) = 0 and public.bump_usage('{}') = 0, '43. (4) a null or empty list counts nothing and is no error');
select t.claims('00000000-0000-4000-8000-000000004302');
select t.ok(public.bump_usage(array['module_open:budget']) = 1, '43. (4) a second member counts');
select t.reset();
select t.ok((select count from public.usage_daily where name = 'module_open:budget' and plan = 'free') = 2
        and (select count from public.usage_daily where name = 'module_open:budget' and plan = 'indie') = 1,
  '43. (4) counters are keyed by plan: free 2, indie 1 for the same module and day');
select t.ok((select count(*) from public.usage_daily where name in ('nonsense', 'module_open:admin')) = 0,
  '43. (4) nothing the caller typed outside the list reached the table');
select t.ok((select day from public.usage_daily limit 1) = (now() at time zone 'Asia/Kolkata')::date,
  '43. (4) the day is the Asia/Kolkata day, like the funnel''s');
-- 5. the cap of 50 names a call
select t.claims('00000000-0000-4000-8000-000000004301');
select t.ok(public.bump_usage(array_fill('script_import'::text, array[51])) = 50,
  '43. (5) 51 names in one call: only the first 50 are read');
-- 6. a flood meets the rate limit, and the count stays at the cap
select t.claims('00000000-0000-4000-8000-000000004305');
do $$
declare i int; got boolean := false;
begin
  for i in 1..60 loop perform public.bump_usage(array['export_docx']); end loop;
  begin
    perform public.bump_usage(array['export_docx']);
  exception when sqlstate 'P0429' then got := true;
  end;
  if not got then raise exception 'the 61st call in an hour was not refused'; end if;
  raise notice 'ok - 43. (6) 60 calls an hour pass, the 61st -> P0429';
end $$;
select t.reset();
select t.ok((select sum(calls) from public.usage_rate where user_id = '00000000-0000-4000-8000-000000004305') = 60,
  '43. (6) the rate row stays at 60: the refused call rolled its increment back');
select t.ok((select count from public.usage_daily where name = 'export_docx') = 60,
  '43. (6) and only the 60 accepted calls were counted');
rollback;

-- 7. admin_usage: admin only
select t.reset();
do $$ begin perform public.admin_usage(7); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 43. (7) anon: admin_usage -> 42501'; end $$;
begin;
select t.claims('00000000-0000-4000-8000-000000004301');
do $$ begin perform public.admin_usage(7); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 43. (7) a member: admin_usage -> 42501'; end $$;
rollback;

-- 8. admin_usage on a seeded table: every number checked
begin;
delete from public.usage_daily;
delete from public.usage_rate;
insert into public.usage_daily (day, name, plan, count) values
  ((now() at time zone 'Asia/Kolkata')::date,      'module_open:budget',   'free',  5),
  ((now() at time zone 'Asia/Kolkata')::date - 2,  'module_open:budget',   'indie', 3),
  ((now() at time zone 'Asia/Kolkata')::date - 20, 'module_open:contacts', 'free',  7),
  ((now() at time zone 'Asia/Kolkata')::date,      'script_import',        'free',  2),
  ((now() at time zone 'Asia/Kolkata')::date - 1,  'limit_hit',            'free',  4),
  ((now() at time zone 'Asia/Kolkata')::date - 1,  'limit_hit',            'pro',   1);
insert into public.usage_rate (user_id, hour, calls) values
  ('00000000-0000-4000-8000-000000004301', date_trunc('hour', now()), 3),
  ('00000000-0000-4000-8000-000000004302', date_trunc('hour', now()) - interval '30 hours', 1);
select t.claims('00000000-0000-4000-8000-00000000000a');
create temp table _u30 as select public.admin_usage(30) as u;
create temp table _u7  as select public.admin_usage(7)  as u;
select t.ok(jsonb_array_length((select u -> 'days' from _u30)) = 30 and jsonb_array_length((select u -> 'days' from _u7)) = 7,
  '43. (8) p_days sets the window: 30 and 7 days');
select t.ok(jsonb_array_length(public.admin_usage(0) -> 'days') = 1 and jsonb_array_length(public.admin_usage(100000) -> 'days') = 365,
  '43. (8) p_days is clamped to 1..365');
select t.ok(jsonb_array_length((select u -> 'modules' from _u30)) = (select count(*) from unnest(public.usage_names()) n where n like 'module_open:%'),
  '43. (8) every module in the list appears, zero-filled');
select t.ok((select m ->> 'opens' from jsonb_array_elements((select u -> 'modules' from _u30)) m where m ->> 'id' = 'budget')::int = 8
        and (select m ->> 'opens' from jsonb_array_elements((select u -> 'modules' from _u7)) m where m ->> 'id' = 'budget')::int = 8,
  '43. (8) budget: 5 free today + 3 indie two days ago = 8 in either window');
select t.ok((select m -> 'by_plan' from jsonb_array_elements((select u -> 'modules' from _u30)) m where m ->> 'id' = 'budget') = '{"free": 5, "indie": 3}'::jsonb,
  '43. (8) budget by plan: free 5, indie 3');
select t.ok((select m -> 'by_day' -> 29 from jsonb_array_elements((select u -> 'modules' from _u30)) m where m ->> 'id' = 'budget') = '5'::jsonb
        and (select m -> 'by_day' -> 27 from jsonb_array_elements((select u -> 'modules' from _u30)) m where m ->> 'id' = 'budget') = '3'::jsonb
        and (select m -> 'by_day' -> 28 from jsonb_array_elements((select u -> 'modules' from _u30)) m where m ->> 'id' = 'budget') = '0'::jsonb,
  '43. (8) by_day is aligned to days, today last: 3 two days ago, 0 yesterday, 5 today');
select t.ok((select (m ->> 'opens')::int from jsonb_array_elements((select u -> 'modules' from _u30)) m where m ->> 'id' = 'contacts') = 7
        and (select (m ->> 'opens')::int from jsonb_array_elements((select u -> 'modules' from _u7)) m where m ->> 'id' = 'contacts') = 0
        and (select (m ->> 'opens_14d')::int from jsonb_array_elements((select u -> 'modules' from _u30)) m where m ->> 'id' = 'contacts') = 0,
  '43. (8) contacts: 7 opens 20 days ago show in the 30-day window, not the 7-day one, and none in 14 days');
select t.ok((select u -> 'dead_modules' from _u30) @> '["contacts"]'::jsonb and not ((select u -> 'dead_modules' from _u30) @> '["budget"]'::jsonb),
  '43. (8) contacts is dead (no open in 14 days), budget is not');
select t.ok((select m ->> 'last_opened' from jsonb_array_elements((select u -> 'modules' from _u7)) m where m ->> 'id' = 'contacts')
              = to_char((now() at time zone 'Asia/Kolkata')::date - 20, 'YYYY-MM-DD'),
  '43. (8) last_opened is all-time, even outside the window');
select t.ok((select (f ->> 'total')::int from jsonb_array_elements((select u -> 'features' from _u30)) f where f ->> 'name' = 'script_import') = 2
        and (select f -> 'by_plan' from jsonb_array_elements((select u -> 'features' from _u30)) f where f ->> 'name' = 'limit_hit') = '{"free": 4, "pro": 1}'::jsonb,
  '43. (8) features: script_import 2; limit_hit by plan free 4, pro 1');
select t.ok((select sum((e ->> 'events')::int) from jsonb_array_elements((select u -> 'daily_total' from _u30)) e) = 22,
  '43. (8) daily totals add to every counter in the window (5+3+7+2+4+1 = 22)');
select t.ok((select u #>> '{active_users,last_24h}' from _u30)::int = 1 and (select u #>> '{active_users,last_48h}' from _u30)::int = 2,
  '43. (8) active users: one in the last 24 hours, two in 48');
select t.ok((select u #>> '{active_users,weekly}' from _u30) = 'not available by design',
  '43. (8) a weekly figure is not offered: no user id is kept for a week');
select t.ok((select u ->> 'tracking_began' from _u30) = to_char((now() at time zone 'Asia/Kolkata')::date - 20, 'YYYY-MM-DD'),
  '43. (8) tracking_began is the earliest counter day');
rollback;

-- 9. cohorts: admin only
select t.reset();
do $$ begin perform public.admin_cohorts(4); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 43. (9) anon: admin_cohorts -> 42501'; end $$;
begin;
select t.claims('00000000-0000-4000-8000-000000004301');
do $$ begin perform public.admin_cohorts(4); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 43. (9) a member: admin_cohorts -> 42501'; end $$;
do $$ begin perform public.cohort_rows(current_date); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 43. (9) cohort_rows is not callable by a member -> 42501'; end $$;
rollback;

-- 10. cohorts on a seeded set. Two signup weeks nobody earlier occupies.
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
create temp table _c0 as select public.admin_cohorts(4) as c;
select t.reset();

insert into public.promo_codes (code, percent_off, kind, commission_pct) values ('COH43AFF', 10, 'affiliate', 5);
insert into public.invite_codes (id, code, pass_type, max_redemptions) values ('00000000-0000-4000-8000-0000000043c0', 'COH43STD', 'standard', 5);

-- the signup weeks: two and one weeks ago
insert into auth.users (id, email, email_confirmed_at, created_at, is_anonymous) values
  ('00000000-0000-4000-8000-0000000043a1', 'c-a1@example.com', now(), now() - interval '14 days', false),
  ('00000000-0000-4000-8000-0000000043a2', 'c-a2@example.com', now(), now() - interval '14 days', false),
  ('00000000-0000-4000-8000-0000000043a3', 'c-a3@example.com', now(), now() - interval '14 days', false),
  ('00000000-0000-4000-8000-0000000043a4', 'c-a4@example.com', now(), now() - interval '14 days', false),
  ('00000000-0000-4000-8000-0000000043a5', 'c-a5@example.com', now(), now() - interval '14 days', true),
  ('00000000-0000-4000-8000-0000000043a6', 'c-a6@example.com', now(), now() - interval '14 days', false),
  ('00000000-0000-4000-8000-0000000043b1', 'c-b1@example.com', now(), now() - interval '7 days',  false);
insert into public.studio_members (user_id, role, created_at, trial_started_at, trial_minutes, trial_source, trial_scope) values
  ('00000000-0000-4000-8000-0000000043a1', 'user', now() - interval '14 days', now() - interval '14 days', 60,     'signup', 'sample'),
  ('00000000-0000-4000-8000-0000000043a2', 'user', now() - interval '14 days', now() - interval '14 days', 60,     'signup', 'sample'),
  ('00000000-0000-4000-8000-0000000043a3', 'user', now() - interval '14 days', now() - interval '14 days', 60,     'code',   'sample'),
  ('00000000-0000-4000-8000-0000000043a6', 'user', now() - interval '14 days', now() - interval '14 days', 525600, 'admin',  'full'),
  ('00000000-0000-4000-8000-0000000043b1', 'user', now() - interval '7 days',  now() - interval '7 days',  60,     'signup', 'sample');
insert into public.invite_redemptions (code_id, user_id) values
  ('00000000-0000-4000-8000-0000000043c0', '00000000-0000-4000-8000-0000000043a3');

-- a1 and a3 wrote synced work inside their trial window; a2 did not;
-- a6 wrote work but is not a trial starter (source admin)
insert into public.projects (id, owner_id, title) values
  ('00000000-0000-4000-8000-0000000043d1', '00000000-0000-4000-8000-0000000043a1', 'A1 film'),
  ('00000000-0000-4000-8000-0000000043d2', '00000000-0000-4000-8000-0000000043a3', 'A3 film'),
  ('00000000-0000-4000-8000-0000000043d3', '00000000-0000-4000-8000-0000000043a2', 'A2 film'),
  ('00000000-0000-4000-8000-0000000043d6', '00000000-0000-4000-8000-0000000043a6', 'A6 film');
insert into public.project_data (project_id, scope, data, updated_at) values
  ('00000000-0000-4000-8000-0000000043d1', 'script', '{}', now() - interval '14 days' + interval '20 minutes'),
  ('00000000-0000-4000-8000-0000000043d2', 'script', '{}', now() - interval '14 days' + interval '30 minutes'),
  ('00000000-0000-4000-8000-0000000043d3', 'script', '{}', now() - interval '10 days'),
  ('00000000-0000-4000-8000-0000000043d6', 'script', '{}', now() - interval '14 days' + interval '10 minutes');

-- money: a1 paid and was refunded; a3 only opened a checkout; a6 paid with an
-- affiliate code; b1 paid with none
insert into public.payments (id, user_id, plan_id, period, amount_paise, status, paid_at, promo_code, created_at) values
  ('00000000-0000-4000-8000-0000000043e1', '00000000-0000-4000-8000-0000000043a1', 'indie', 'lifetime', 59900, 'refunded', now() - interval '13 days', null,       now() - interval '13 days'),
  ('00000000-0000-4000-8000-0000000043e3', '00000000-0000-4000-8000-0000000043a3', 'indie', 'lifetime', 59900, 'created',  null,                     null,       now() - interval '13 days'),
  ('00000000-0000-4000-8000-0000000043e6', '00000000-0000-4000-8000-0000000043a6', 'indie', 'lifetime', 53900, 'paid',     now() - interval '12 days', 'COH43AFF', now() - interval '12 days'),
  ('00000000-0000-4000-8000-0000000043eb', '00000000-0000-4000-8000-0000000043b1', 'indie', 'lifetime', 59900, 'paid',     now() - interval '6 days',  null,       now() - interval '6 days'),
  ('00000000-0000-4000-8000-0000000043ec', '00000000-0000-4000-8000-0000000043a2', 'indie', 'lifetime', 0,     'granted',  now() - interval '12 days', null,       now() - interval '12 days');
insert into public.refunds (payment_id, amount_paise, status, reason, processed_at) values
  ('00000000-0000-4000-8000-0000000043e1', 59900, 'processed', 'test', now() - interval '11 days');

select t.claims('00000000-0000-4000-8000-00000000000a');
create temp table _c1 as select public.admin_cohorts(4) as c;

select t.ok(jsonb_array_length((select c -> 'by_week' from _c1)) = 4, '43. (10) four weeks in the window, every week present');
select t.ok(jsonb_array_length((select c -> 'stages' from _c1)) = 7, '43. (10) seven stages named');
-- the week two weeks ago: absolute
select t.ok((select w from jsonb_array_elements((select c -> 'by_week' from _c1)) w
              where w ->> 'week_start' = to_char(date_trunc('week', (now() - interval '14 days') at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD'))
            = jsonb_build_object('week_start', to_char(date_trunc('week', (now() - interval '14 days') at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD'),
                                 'signed_up', 5, 'members', 4, 'trial_started', 3, 'active_in_trial', 2,
                                 'checkout_started', 3, 'paid', 2, 'refunded', 1),
  '43. (10) week -2: 5 signed up (the anonymous one excluded), 4 members, 3 trials (grandfathered not one), 2 active, 3 checkouts (a grant is not one), 2 paid, 1 refunded');
select t.ok((select w from jsonb_array_elements((select c -> 'by_week' from _c1)) w
              where w ->> 'week_start' = to_char(date_trunc('week', (now() - interval '7 days') at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD'))
            = jsonb_build_object('week_start', to_char(date_trunc('week', (now() - interval '7 days') at time zone 'Asia/Kolkata')::date, 'YYYY-MM-DD'),
                                 'signed_up', 1, 'members', 1, 'trial_started', 1, 'active_in_trial', 0,
                                 'checkout_started', 1, 'paid', 1, 'refunded', 0),
  '43. (10) week -1: one signup who started a trial and paid, never active in it');
-- totals are the sum of the weeks, and the grouped views are the same population
select t.ok((select (c #>> '{totals,signed_up}')::int from _c1) = (select sum((w ->> 'signed_up')::int) from jsonb_array_elements((select c -> 'by_week' from _c1)) w)
        and (select (c #>> '{totals,paid}')::int from _c1) = (select sum((w ->> 'paid')::int) from jsonb_array_elements((select c -> 'by_week' from _c1)) w),
  '43. (10) totals equal the sum of the weeks');
select t.ok((select sum((s ->> 'signed_up')::int) from jsonb_array_elements((select c -> 'by_source' from _c1)) s) = (select (c #>> '{totals,signed_up}')::int from _c1)
        and (select sum((s ->> 'signed_up')::int) from jsonb_array_elements((select c -> 'by_attribution' from _c1)) s) = (select (c #>> '{totals,signed_up}')::int from _c1),
  '43. (10) by_source and by_attribution each partition the same signups');
-- source and attribution as deltas over the baseline
select t.ok((select (s ->> 'signed_up')::int from jsonb_array_elements((select c -> 'by_source' from _c1)) s where s ->> 'source' = 'code')
          - coalesce((select (s ->> 'signed_up')::int from jsonb_array_elements((select c -> 'by_source' from _c0)) s where s ->> 'source' = 'code'), 0) = 1,
  '43. (10) source code: the redeemed-code signup (+1)');
select t.ok((select (s ->> 'signed_up')::int from jsonb_array_elements((select c -> 'by_source' from _c1)) s where s ->> 'source' = 'signup')
          - coalesce((select (s ->> 'signed_up')::int from jsonb_array_elements((select c -> 'by_source' from _c0)) s where s ->> 'source' = 'signup'), 0) = 3,
  '43. (10) source signup: a1, a2, b1 (+3)');
select t.ok((select (s ->> 'signed_up')::int from jsonb_array_elements((select c -> 'by_source' from _c1)) s where s ->> 'source' = 'admin')
          - coalesce((select (s ->> 'signed_up')::int from jsonb_array_elements((select c -> 'by_source' from _c0)) s where s ->> 'source' = 'admin'), 0) = 1,
  '43. (10) source admin: the grandfathered member (+1)');
select t.ok((select (s ->> 'signed_up')::int from jsonb_array_elements((select c -> 'by_source' from _c1)) s where s ->> 'source' = 'none')
          - coalesce((select (s ->> 'signed_up')::int from jsonb_array_elements((select c -> 'by_source' from _c0)) s where s ->> 'source' = 'none'), 0) = 1,
  '43. (10) source none: signed up, never admitted (+1)');
select t.ok((select (s ->> 'paid')::int from jsonb_array_elements((select c -> 'by_attribution' from _c1)) s where s ->> 'attribution' = 'affiliate')
          - coalesce((select (s ->> 'paid')::int from jsonb_array_elements((select c -> 'by_attribution' from _c0)) s where s ->> 'attribution' = 'affiliate'), 0) = 1,
  '43. (10) attribution affiliate: one paid signup came in on an affiliate code');
select t.ok((select (s ->> 'paid')::int from jsonb_array_elements((select c -> 'by_attribution' from _c1)) s where s ->> 'attribution' = 'none')
          - coalesce((select (s ->> 'paid')::int from jsonb_array_elements((select c -> 'by_attribution' from _c0)) s where s ->> 'attribution' = 'none'), 0) = 2,
  '43. (10) attribution none: the refunded buyer and b1 paid with no code (+2)');
select t.ok((public.admin_cohorts(0) ->> 'weeks')::int = 1 and (public.admin_cohorts(900) ->> 'weeks')::int = 52,
  '43. (10) p_weeks is clamped to 1..52');
rollback;
