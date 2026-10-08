-- ============================================================
-- SECTION 29 CHECKS — leads and funnel counts
-- Runs after the whole schema; A (…0a) is the administrator and B (…b1)
-- an ordinary user, both left by billing.sql.
-- ============================================================
\set ON_ERROR_STOP on

begin;
select t.claims('00000000-0000-4000-8000-00000000000a', 'anon');
select public.add_lead('Fan@Example.test ', 'I agree to receive launch offers by e-mail.', 'start');
select public.add_lead('fan@example.test', 'I agree to receive launch offers by e-mail.', 'start');
do $$ begin
  perform count(*) from public.leads;
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 29. anon cannot select leads -> 42501'; end $$;
do $$ begin
  perform count(*) from public.events;
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 29. anon cannot select events -> 42501'; end $$;
do $$ begin
  insert into public.leads (email, consent_text) values ('x@y.test', 'direct insert should fail');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 29. anon cannot insert leads directly -> 42501'; end $$;
do $$ begin
  perform public.add_lead('not-an-email', 'I agree to receive launch offers by e-mail.');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 29. a malformed e-mail -> 22023'; end $$;
do $$ begin
  perform public.add_lead('a@b.test', '');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 29. no consent text -> 22023'; end $$;
do $$ begin
  perform public.bump_event('anything_else');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 29. an event outside the allowlist -> 22023'; end $$;
select public.bump_event('landing_view');
select public.bump_event('landing_view');
select public.bump_event('pricing_view');
rollback;

-- as the owner: lower-cased, one row, the duplicate was a no-op
begin;
select public.add_lead('Dup@Example.test', 'I agree to receive launch offers by e-mail.');
select public.add_lead('dup@EXAMPLE.test', 'I agree to receive launch offers by e-mail.');
select t.ok((select count(*) = 1 and min(email) = 'dup@example.test' from public.leads where lower(email) = 'dup@example.test'), '29. the address is stored lower-cased, once');
-- the throttle: 30 a minute
do $$ begin
  for i in 1..40 loop perform public.add_lead('bulk' || i || '@example.test', 'I agree to receive launch offers by e-mail.'); end loop;
  raise exception 'should have refused';
exception when sqlstate 'P0429' then raise notice 'ok - 29. the 31st lead inside a minute -> P0429'; end $$;
rollback;

-- no personal data in events
select t.ok((select array_agg(column_name::text order by column_name) = array['count','day','name'] from information_schema.columns where table_schema = 'public' and table_name = 'events'), '29. events has exactly day, name, count');

-- admin reads, a user does not
begin;
select public.bump_event('purchase');
select public.add_lead('seen@example.test', 'I agree to receive launch offers by e-mail.');
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((select total >= 1 from public.admin_funnel(null, null) where name = 'purchase'), '29. the administrator reads the funnel');
select t.ok((select count(*) = 6 from public.admin_funnel(current_date, current_date)), '29. the funnel always lists all six steps');
select t.ok((select count(*) >= 1 from public.admin_list_leads() where email = 'seen@example.test'), '29. the administrator lists leads');
select t.claims('00000000-0000-4000-8000-0000000000b1');
do $$ begin
  perform public.admin_list_leads();
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 29. admin_list_leads as a user -> 42501'; end $$;
do $$ begin
  perform public.admin_funnel(null, null);
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 29. admin_funnel as a user -> 42501'; end $$;
rollback;
