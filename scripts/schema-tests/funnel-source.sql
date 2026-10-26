-- ============================================================
-- SECTION 58 CHECKS — funnel counts by source, and four more steps
-- A (…0a) is the administrator, B (…b1) an ordinary user (billing.sql).
-- §29's rows written before §58 carry source '' (leads.sql left none
-- committed; the seed below is written through the OLD one-argument call
-- before anything else, which is what every deployed client still sends).
-- ============================================================
\set ON_ERROR_STOP on

-- the shape: still no personal data, one more aggregate column
select t.ok((select array_agg(column_name::text order by column_name) = array['count','day','name','source']
               from information_schema.columns where table_schema = 'public' and table_name = 'events'),
  '58. events has exactly day, name, source, count');
select t.ok((select array_agg(a.attname::text order by a.attname) = array['day','name','source']
               from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
              where c.conrelid = 'public.events'::regclass and c.contype = 'p'),
  '58. the per-day key is (day, name, source), so a row stays an aggregate');
select t.ok((select count(*) = 2 from pg_proc where proname = 'bump_event' and pronamespace = 'public'::regnamespace),
  '58. bump_event has the one- and the two-argument form');

begin;
select t.claims('00000000-0000-4000-8000-00000000000a', 'anon');
-- the old signature, unchanged
select public.bump_event('landing_view');
select public.bump_event('landing_view');
-- the new one
select public.bump_event('landing_view', 'instagram');
select public.bump_event('landing_view', ' Instagram ');
select public.bump_event('trial_start', 'newsletter-oct');
select public.bump_event('sample_open', null);
select public.bump_event('signin_done', '');
select public.bump_event('plan_view_in_app', 'in_app');
do $$ begin
  perform public.bump_event('anything_else');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 58. an unknown name, one-argument form -> 22023'; end $$;
do $$ begin
  perform public.bump_event('anything_else', 'google');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 58. an unknown name, two-argument form -> 22023'; end $$;
do $$ begin
  perform public.bump_event('landing_view', 'someone@example.com');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 58. a source with @ and . (an e-mail) -> 22023'; end $$;
do $$ begin
  perform public.bump_event('landing_view', 'has space');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 58. a source with a space -> 22023'; end $$;
do $$ begin
  perform public.bump_event('landing_view', repeat('a', 33));
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 58. a 33-character source -> 22023'; end $$;
do $$ begin
  perform count(*) from public.events;
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 58. anon cannot select events -> 42501'; end $$;
do $$ begin
  insert into public.events (day, name, source, count) values (current_date, 'purchase', 'x', 99);
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 58. anon cannot write events directly -> 42501'; end $$;
do $$ begin
  perform public.admin_funnel_by_source(null, null);
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 58. anon cannot read admin_funnel_by_source -> 42501'; end $$;

-- the administrator reads the buckets
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((select total = 2 from public.admin_funnel_by_source(current_date - 1, current_date + 1) where name = 'landing_view' and source = ''),
  '58. the one-argument calls count under no source (2)');
select t.ok((select total = 2 from public.admin_funnel_by_source(current_date - 1, current_date + 1) where name = 'landing_view' and source = 'instagram'),
  '58. a source is lower-cased and trimmed into one bucket (2)');
select t.ok((select total = 1 from public.admin_funnel_by_source(current_date - 1, current_date + 1) where name = 'trial_start' and source = 'newsletter-oct'),
  '58. trial_start counts under its source');
select t.ok((select count(*) = 1 from public.admin_funnel_by_source(current_date - 1, current_date + 1) where name = 'signin_done' and source = ''),
  '58. an empty source is no source');
select t.ok((select total >= 4 from public.admin_funnel(current_date - 1, current_date + 1) where name = 'landing_view'),
  '58. admin_funnel still sums every source per step');
select t.ok((select count(*) = 10 from public.admin_funnel(current_date, current_date)),
  '58. the funnel lists all ten steps');
select t.ok((select array_agg(name order by ord) = public.funnel_event_names()
               from (select name, row_number() over () as ord from public.admin_funnel(current_date, current_date)) x),
  '58. in funnel order');
select t.claims('00000000-0000-4000-8000-0000000000b1');
do $$ begin
  perform public.admin_funnel_by_source(null, null);
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 58. admin_funnel_by_source as a user -> 42501'; end $$;
do $$ begin
  perform count(*) from public.events;
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 58. a signed-in user cannot select events -> 42501'; end $$;
rollback;

-- the bound: once a day holds 200 sources, a NEW one counts as 'other'
begin;
select t.reset();
insert into public.events (day, name, source, count)
  select (now() at time zone 'Asia/Kolkata')::date, 'landing_view', 's' || g, 1 from generate_series(1, 200) g;
select public.bump_event('landing_view', 'brand-new');
select public.bump_event('landing_view', 's7');
select t.ok((select count(*) = 0 from public.events where source = 'brand-new'), '58. the 201st source of a day is not stored as itself');
select t.ok((select count = 1 from public.events where source = 'other' and day = (now() at time zone 'Asia/Kolkata')::date), '58. it is counted as other');
select t.ok((select count = 2 from public.events where source = 's7' and day = (now() at time zone 'Asia/Kolkata')::date), '58. a source already seen that day keeps counting as itself');
rollback;
