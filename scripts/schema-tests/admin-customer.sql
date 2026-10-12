-- ============================================================
-- SECTION 42 CHECKS — Customer 360 and admin notes
-- ------------------------------------------------------------
-- The checks listed at 42.6, executed. Runs after §40 and §42 have loaded
-- on top of everything else, with its own people (…4101 upward). (…00a)
-- is the administrator.
--
--   4101  the customer: a paid Intermediate plan, a project with a title and
--         script text that MUST NOT come back, a device lock, a refund
--         request and a processed refund, a referral code and one credit
--   4102  somebody else: their own plan, project, notes and e-mail — none of
--         which may appear in 4101's page — and a seat on 4101's account
--   4103  a grandfathered member (the §30 backfill's shape)
--   4104  a signup trial, with notes
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000004101', 'cust-main@example.com',  now(), '{"full_name":"Cora Customer"}'),
  ('00000000-0000-4000-8000-000000004102', 'cust-other@example.com', now(), '{"full_name":"Otto Other"}'),
  ('00000000-0000-4000-8000-000000004103', 'cust-old@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000004104', 'cust-trial@example.com', now(), '{}');
insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-000000004101', 'user'),
  ('00000000-0000-4000-8000-000000004102', 'user')
on conflict (user_id) do nothing;
insert into public.studio_members (user_id, role, trial_started_at, trial_minutes, trial_source, trial_scope) values
  ('00000000-0000-4000-8000-000000004103', 'user', now() - interval '2 years', 525600, 'admin', 'full'),
  ('00000000-0000-4000-8000-000000004104', 'user', now(), 30, 'signup', 'sample')
on conflict (user_id) do update set trial_started_at = excluded.trial_started_at, trial_minutes = excluded.trial_minutes,
  trial_source = excluded.trial_source, trial_scope = excluded.trial_scope;

begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004101', 'indie', 'lifetime')), 'order_c1');
select public.activate_payment('order_c1', 'pay_c1');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004102', 'starter', 'lifetime')), 'order_c2');
select public.activate_payment('order_c2', 'pay_c2');
commit;

select t.reset();
-- 4101's work and 4102's work, with markers that must never travel
insert into public.projects (id, owner_id, title, format) values
  ('00000000-0000-4000-8000-0000000041a1', '00000000-0000-4000-8000-000000004101', 'CUSTOMER-SECRET-TITLE', 'feature'),
  ('00000000-0000-4000-8000-0000000041a2', '00000000-0000-4000-8000-000000004102', 'OTHER-SECRET-TITLE', 'short');
insert into public.project_data (project_id, scope, data) values
  ('00000000-0000-4000-8000-0000000041a1', 'script', '{"text":"CUSTOMER-SECRET-SCRIPT: INT. A ROOM - DAY"}'),
  ('00000000-0000-4000-8000-0000000041a1', 'scenes', '{"rows":[{"slug":"CUSTOMER-SECRET-SLUG"}]}'),
  ('00000000-0000-4000-8000-0000000041a2', 'script', '{"text":"OTHER-SECRET-SCRIPT"}');
insert into public.user_active_sessions (user_id, session_id, client_ip, user_agent)
values ('00000000-0000-4000-8000-000000004101', gen_random_uuid(), '203.0.113.7', 'CustomerBrowser/1.0');
insert into public.refund_requests (id, user_id, payment_id, category, message) values
  ('00000000-0000-4000-8000-0000000041b1', '00000000-0000-4000-8000-000000004101',
   (select id from public.payments where razorpay_order_id = 'order_c1'), 'other', 'please look at this charge');
insert into public.refunds (payment_id, amount_paise, status, reason, processed_at) values
  ((select id from public.payments where razorpay_order_id = 'order_c1'), 100, 'processed', 'goodwill', now()),
  ((select id from public.payments where razorpay_order_id = 'order_c2'), 200, 'processed', 'OTHER-REFUND-REASON', now());
-- (the capture already minted 4101's referral code; read here, as postgres: the API roles cannot)
create temp table refcode as select code from public.promo_codes where kind = 'referral' and owner_user_id = '00000000-0000-4000-8000-000000004101';
grant select on refcode to authenticated;
insert into public.referral_credits (id, referrer_user_id, payment_id, code, basis_paise, amount_paise) values
  ('00000000-0000-4000-8000-0000000041c1', '00000000-0000-4000-8000-000000004101', (select id from public.payments where razorpay_order_id = 'order_c2'), 'REF-CUST41', 1000, 100);
-- 4102 sits on 4101's account as an active member
insert into public.account_members (account_id, invited_email, user_id, role, status)
select a.id, 'cust-other@example.com', '00000000-0000-4000-8000-000000004102', 'member', 'active'
  from public.accounts a where a.owner_id = '00000000-0000-4000-8000-000000004101' limit 1;

-- every key at every depth of a jsonb value, for the "no content columns" check
create or replace function t.json_keys(j jsonb) returns setof text language sql immutable as $$
  with recursive walk(v) as (
    select j
    union all
    select x.value
      from walk, lateral (
        select value from jsonb_each(case when jsonb_typeof(walk.v) = 'object' then walk.v else '{}'::jsonb end)
        union all
        select value from jsonb_array_elements(case when jsonb_typeof(walk.v) = 'array' then walk.v else '[]'::jsonb end)
      ) x
  )
  select distinct k from walk, lateral jsonb_object_keys(case when jsonb_typeof(walk.v) = 'object' then walk.v else '{}'::jsonb end) k;
$$;
grant execute on function t.json_keys(jsonb) to anon, authenticated;

-- ============================================================
-- 1. who may ask
-- ============================================================
begin;
select t.claims('00000000-0000-4000-8000-000000004101');
do $$ begin perform public.admin_customer('00000000-0000-4000-8000-000000004101'); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 42.4 a member cannot read even their OWN page through admin_customer -> 42501'; end $$;
do $$ begin perform public.admin_add_note('00000000-0000-4000-8000-000000004101', 'hello'); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 42.2 a member cannot add a note -> 42501'; end $$;
do $$ begin perform public.admin_list_notes('00000000-0000-4000-8000-000000004101'); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 42.3 a member cannot list notes -> 42501'; end $$;
do $$ begin perform * from public.admin_notes limit 1; raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 42.1 admin_notes is not readable by the API roles'; end $$;
select t.claims('00000000-0000-4000-8000-000000000000', 'anon');
do $$ begin perform public.admin_customer('00000000-0000-4000-8000-000000004101'); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 42.4 anon: admin_customer -> 42501'; end $$;
do $$ begin perform public.admin_add_note('00000000-0000-4000-8000-000000004101', 'hello'); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 42.2 anon: admin_add_note -> 42501'; end $$;
do $$ begin perform public.admin_list_notes('00000000-0000-4000-8000-000000004101'); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 42.3 anon: admin_list_notes -> 42501'; end $$;
rollback;
select t.ok((select relrowsecurity from pg_class where oid = 'public.admin_notes'::regclass)
        and not exists (select 1 from information_schema.table_privileges
                         where table_schema = 'public' and table_name = 'admin_notes' and grantee in ('anon', 'authenticated', 'PUBLIC')),
  '42.1 admin_notes: RLS on, no privileges for any API role');

-- ============================================================
-- 2. notes
-- ============================================================
begin;
select t.claims('00000000-0000-4000-8000-00000000000a', 'authenticated', '{"email":"admin@example.com"}');
create temp table n_mark as select clock_timestamp() as ts;
do $$ begin perform public.admin_add_note('00000000-0000-4000-8000-000000004101', '   '); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 42.2 an empty note -> 22023'; end $$;
do $$ begin perform public.admin_add_note('00000000-0000-4000-8000-000000004101', repeat('x', 1001)); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 42.2 a note of 1001 characters -> 22023'; end $$;
do $$ begin perform public.admin_add_note('00000000-0000-4000-8000-0000000041ff', 'hello'); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 42.2 a note about nobody -> 22023'; end $$;
select t.ok(length(public.admin_add_note('00000000-0000-4000-8000-000000004101', repeat('y', 1000)) ->> 'body') = 1000,
  '42.2 a note of exactly 1000 characters is kept');
select t.ok((public.admin_add_note('00000000-0000-4000-8000-000000004101', '  asked about GST invoice  ') ->> 'body') = 'asked about GST invoice'
        and (public.admin_add_note('00000000-0000-4000-8000-000000004102', 'OTHER-NOTE-BODY') ->> 'author_email') = 'admin@example.com',
  '42.2 the body is trimmed; the author is the admin and their e-mail');
select t.ok((select jsonb_array_length(public.admin_list_notes('00000000-0000-4000-8000-000000004101'))) = 2
        and (public.admin_list_notes('00000000-0000-4000-8000-000000004101') -> 0 ->> 'body') = 'asked about GST invoice'
        and position('OTHER-NOTE-BODY' in public.admin_list_notes('00000000-0000-4000-8000-000000004101')::text) = 0,
  '42.3 notes come back newest first, and only the person''s own');
select t.reset();
select t.ok((select count(*) from public.admin_audit where action = 'add_note' and at >= (select ts from n_mark)) = 3
        and (select bool_and(position('GST' in coalesce(after::text, '')) = 0 and (after ->> 'note_id') is not null)
               from public.admin_audit where action = 'add_note' and at >= (select ts from n_mark)),
  '42.2 each note left an audit row naming the note by id — the body is not copied into the log');
rollback;
-- atomic: the note and its audit row go together
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
do $$
begin
  begin
    perform public.admin_add_note('00000000-0000-4000-8000-000000004104', 'ATOMIC-NOTE');
    raise exception 'forced' using errcode = 'P0001';
  exception when sqlstate 'P0001' then null; end;
end $$;
select t.reset();
select t.ok((select count(*) from public.admin_notes where body = 'ATOMIC-NOTE') = 0
        and (select count(*) from public.admin_audit where action = 'add_note' and target_id = '00000000-0000-4000-8000-000000004104') = 0,
  '42.2 a failure after the note rolls back the note AND its audit row');
rollback;

-- ============================================================
-- 3. the picture
-- ============================================================
begin;
select t.claims('00000000-0000-4000-8000-00000000000a', 'authenticated', '{"email":"admin@example.com"}');
select public.admin_add_note('00000000-0000-4000-8000-000000004101', 'first call');
select public.admin_grant_trial('00000000-0000-4000-8000-000000004104', 40, null);
create temp table c1 as select public.admin_customer('00000000-0000-4000-8000-000000004101') as j;
create temp table c3 as select public.admin_customer('00000000-0000-4000-8000-000000004103') as j;
create temp table c4 as select public.admin_customer('00000000-0000-4000-8000-000000004104') as j;
grant select on c1, c3, c4 to public;

select t.ok((select j -> 'identity' ->> 'email' = 'cust-main@example.com' and j -> 'identity' ->> 'name' = 'Cora Customer'
                    and j -> 'identity' ->> 'id' = '00000000-0000-4000-8000-000000004101' from c1),
  '42.4 identity: the e-mail and name are the customer''s');
select t.ok((select j -> 'standing' ->> 'plan' = 'indie' and (j -> 'standing' ->> 'entitled')::boolean
                    and (j -> 'standing' ->> 'is_member')::boolean and not (j -> 'standing' ->> 'grandfathered')::boolean from c1)
        and (select (j -> 'standing' ->> 'grandfathered')::boolean from c3)
        and (select not (j -> 'standing' ->> 'grandfathered')::boolean and j -> 'trial' ->> 'source' = 'admin' from c4),
  '42.4 standing: a paid plan; a grandfathered member reads true; an admin-given trial does not');
select t.ok((select (j -> 'trial' ->> 'active')::boolean and (j -> 'trial' ->> 'minutes')::int = 40
                    and (j -> 'trial' ->> 'seconds_left')::bigint between 1 and 2400 and j -> 'trial' ->> 'scope' = 'full' from c4),
  '42.4 trial clock: 40 minutes, running, seconds left within them');
select t.ok((select jsonb_array_length(j -> 'payments') = 1 and j -> 'payments' -> 0 ->> 'razorpay_order_id' = 'order_c1'
                    and j -> 'payments' -> 0 ->> 'status' = 'paid' from c1)
        and (select jsonb_array_length(j -> 'invoices') = 1 and j -> 'invoices' -> 0 ->> 'number' like 'FMS/%' from c1),
  '42.4 payments and invoices: the customer''s own, and only theirs');
select t.ok((select jsonb_array_length(j -> 'refunds') = 1 and j -> 'refunds' -> 0 ->> 'reason' = 'goodwill'
                    and jsonb_array_length(j -> 'refund_requests') = 1 and j -> 'refund_requests' -> 0 ->> 'status' = 'pending' from c1),
  '42.4 refunds and refund requests: theirs, not the other buyer''s');
select t.ok((select j -> 'referral' ->> 'code' = (select code from refcode) and jsonb_array_length(j -> 'referral' -> 'credits') = 1
                    and j -> 'referral' -> 'credits' -> 0 ->> 'status' = 'owed' from c1),
  '42.4 referral: the code and the credit they are owed as referrer');
select t.ok((select j -> 'sessions' -> 'device_lock' ->> 'user_agent' = 'CustomerBrowser/1.0' from c1),
  '42.4 sessions: the device lock');
select t.ok((select (j -> 'work' ->> 'projects')::int = 1 and j -> 'work' -> 'formats' ->> 'feature' = '1'
                    and jsonb_array_length(j -> 'work' -> 'scopes') = 2
                    and (select bool_and((s ->> 'bytes')::bigint > 0 and (s ->> 'rows')::int = 1) from c1, jsonb_array_elements(j -> 'work' -> 'scopes') s)
                    and (j -> 'work' ->> 'total_bytes')::bigint = (select sum((s ->> 'bytes')::bigint) from c1, jsonb_array_elements(j -> 'work' -> 'scopes') s)
                    and j -> 'work' ->> 'last_sync' is not null from c1),
  '42.4 work: project count, formats, per-scope rows and bytes that add up, and the last sync');
select t.ok((select count(*) from c1, jsonb_array_elements(j -> 'work' -> 'scopes') s, jsonb_object_keys(s) k where k not in ('scope', 'rows', 'bytes')) = 0,
  '42.4 a scope entry holds a scope, a row count and a byte size — nothing else');
select t.ok((select jsonb_array_length(j -> 'orgs' -> 'owned') = 1 and (j -> 'orgs' -> 'owned' -> 0 ->> 'seats_used')::int >= 1 from c1),
  '42.4 orgs: the owned account, with its seats as a COUNT');
select t.ok((select jsonb_array_length(j -> 'notes') = 1 and j -> 'notes' -> 0 ->> 'body' = 'first call' from c1),
  '42.4 notes: the customer''s, newest first');
select t.ok((select jsonb_array_length(j -> 'audit') = 1
                    and exists (select 1 from jsonb_array_elements(j -> 'audit') a where a ->> 'action' = 'add_note')
               from c1)
        and (select jsonb_array_length(j -> 'audit') = 1 and j -> 'audit' -> 0 ->> 'action' = 'grant_trial' from c4),
  '42.4 audit slice: only the rows about this person');

-- NOTHING OF CONTENT, NOTHING OF ANYBODY ELSE ---------------------------------
select t.ok(position('CUSTOMER-SECRET' in (select j::text from c1)) = 0,
  '42.4 NO project title, script text or scene slug of the customer''s own appears anywhere in the response');
select t.ok(position('OTHER-' in (select j::text from c1)) = 0
        and position('cust-other@example.com' in (select j::text from c1)) = 0
        and position('00000000-0000-4000-8000-000000004102' in (select j::text from c1)) = 0
        and position('order_c2' in (select j::text from c1)) = 0,
  '42.4 NOTHING of another person''s: no title, script, refund reason, note, e-mail, id or order');
select t.ok(exists (select 1 from c1, t.json_keys(j) k where k = 'scope')
        and not exists (select 1 from c1, t.json_keys(j) k where k in ('data', 'title', 'raw', 'token', 'password', 'owner_id')),
  '42.4 the walk sees the keys (it finds "scope") and none is data, title, raw, token, password or owner_id, at any depth');
select t.ok(not exists (select 1 from c1, jsonb_array_elements(j -> 'redemptions') r, jsonb_object_keys(r) k where k = 'code'),
  '42.4 an invite redemption names the pass type and label, never the code');

-- the OTHER user's page is just as bounded, and shows the seat as theirs
select t.ok(position('CUSTOMER-' in (public.admin_customer('00000000-0000-4000-8000-000000004102'))::text) = 0
        and position('cust-main@example.com' in (public.admin_customer('00000000-0000-4000-8000-000000004102'))::text) = 0,
  '42.4 and the other direction: nothing of 4101 in 4102''s page (the account they sit on shows its name, not its owner)');
select t.ok((select jsonb_array_length(public.admin_customer('00000000-0000-4000-8000-000000004102') -> 'orgs' -> 'member_of')) = 1,
  '42.4 a seat on somebody else''s account is listed under member_of');

-- last 20, newest first
do $$ declare i int; begin
  for i in 1..25 loop perform public.admin_add_note('00000000-0000-4000-8000-000000004104', 'bulk ' || i); end loop;
end $$;
select t.ok((select jsonb_array_length(public.admin_customer('00000000-0000-4000-8000-000000004104') -> 'audit')) = 20
        and (select (a0 ->> 'at')::timestamptz >= (a1 ->> 'at')::timestamptz
               from (select public.admin_customer('00000000-0000-4000-8000-000000004104') -> 'audit' as au) x,
                    lateral (select au -> 0 as a0, au -> 1 as a1) y),
  '42.4 the audit slice is capped at 20 rows, newest first');

do $$ begin perform public.admin_customer('00000000-0000-4000-8000-0000000041ee'); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 42.4 an unknown user -> 22023'; end $$;
select t.ok((public.admin_customer('00000000-0000-4000-8000-00000000000a') -> 'standing' ->> 'role') = 'admin',
  '42.4 an administrator''s own page reads like anyone''s');
rollback;
