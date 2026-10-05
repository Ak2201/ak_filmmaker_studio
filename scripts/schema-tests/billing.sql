-- ============================================================
-- SECTION 16 + 18 CHECKS — the list at 16.10, executed, as section 18
-- (full-time access: one price, no period, no lapse) left it
-- ------------------------------------------------------------
-- Each numbered block is one row of 16.10. Role switches use the shim's
-- t.claims() / t.service() / t.reset(); an expected refusal is caught
-- by SQLSTATE and asserted, so a check that passes for the wrong
-- reason (no error at all) fails loudly.
-- ============================================================
\set ON_ERROR_STOP on

-- People. A is the administrator (the 13.2 bootstrap), B a buyer, C a
-- stranger who gets admitted, D a disabled member, E and F for the
-- collaborator and refund checks.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', 'admin@example.com', now(), '{"full_name":"Admin"}'),
  ('00000000-0000-4000-8000-0000000000b1', 'bala@example.com',  now(), '{"full_name":"Bala"}'),
  ('00000000-0000-4000-8000-0000000000c1', 'chitra@example.com',now(), '{}'),
  ('00000000-0000-4000-8000-0000000000d1', 'dev@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-0000000000e1', 'esha@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-0000000000f1', 'faisal@example.com',now(), '{}');
insert into public.studio_members (user_id, role) values ('00000000-0000-4000-8000-00000000000a', 'admin');
insert into public.studio_members (user_id, role, disabled_at) values ('00000000-0000-4000-8000-0000000000d1', 'user', now());

-- 1. reads are open to the signed-in; writes are not
begin;
select t.claims('00000000-0000-4000-8000-0000000000b1');
select t.ok((select count(*) from public.plans) = 4, '1. a signed-in user sees four plans');
update public.plans set price_paise = 1 where id = 'starter';
select t.ok((select price_paise from public.plans where id = 'starter') = 299900, '1. a client UPDATE of plans changes nothing (no policy); the seeded one-time price stands');
do $$ begin
  perform public.admin_set_plan('starter', '{"price_paise": 1}');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. admin_set_plan as a non-admin -> 42501'; end $$;
rollback;

-- 2. the console edits a plan, within the rules
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_set_plan('indie', '{"price_paise": 59900, "name": "Indie "}')).price_paise = 59900, '2. admin_set_plan changes the one price');
select t.ok((select name from public.plans where id = 'indie') = 'Indie', '2. the name is trimmed');
do $$ begin
  perform public.admin_set_plan('indie', '{"limits": {"bogus": 1}}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 2. an unknown limit key -> 22023'; end $$;
do $$ begin
  perform public.admin_set_plan('free', '{"price_paise": 100}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 2. a price on free -> 22023'; end $$;
select public.admin_set_plan('indie', '{"limits": {"projects": 12}}');
select t.ok((select limits ->> 'projects' from public.plans where id = 'indie') = '12', '2. limits merge key by key');
select t.ok((select limits ->> 'seats' from public.plans where id = 'indie') = '3', '2. untouched limit keys survive the merge');
commit;

-- 3. only the payment service opens a payment
begin;
select t.claims('00000000-0000-4000-8000-0000000000b1');
do $$ begin
  perform public.create_pending_payment('00000000-0000-4000-8000-0000000000b1', 'indie', 'lifetime');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 3. create_pending_payment as a user -> 42501'; end $$;
rollback;
begin;
select t.service();
select t.ok((select amount_paise from public.create_pending_payment('00000000-0000-4000-8000-0000000000b1', 'indie', 'lifetime')) = 59900,
  '3. the service role gets a pending row priced by the database (the edited 59900)');
select t.ok((select count(*) from public.payments where user_id = '00000000-0000-4000-8000-0000000000b1' and status = 'created') = 1, '3. one created row');
do $$ begin
  perform public.create_pending_payment('00000000-0000-4000-8000-0000000000b1', 'free', 'lifetime');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 3. free is not for sale -> 22023'; end $$;
do $$ begin
  perform public.create_pending_payment('00000000-0000-4000-8000-0000000000b1', 'indie', 'month');
  raise exception 'should have refused';
exception when sqlstate '22023' then
  if sqlerrm not like '%once, for good%' then raise exception 'wrong message: %', sqlerrm; end if;
  raise notice 'ok - 3. a month -> 22023, "once, for good" (section 18)';
end $$;
commit;

-- 4. activation: paid, an organisation on the plan, membership, idempotent
begin;
select t.service();
select public.attach_razorpay_order((select id from public.payments where user_id = '00000000-0000-4000-8000-0000000000b1'), 'order_1');
select t.ok((select already from public.activate_payment('order_1', 'pay_1', '{"t":1}')) = false, '4. first activation is new');
select t.ok((select status from public.payments where razorpay_order_id = 'order_1') = 'paid', '4. payment is paid');
select t.ok((select plan from public.accounts where owner_id = '00000000-0000-4000-8000-0000000000b1') = 'indie', '4. the buyer owns an organisation on indie');
select t.ok((select plan_until from public.accounts where owner_id = '00000000-0000-4000-8000-0000000000b1') is null, '4. plan_until is NULL: for good (section 18)');
select t.ok((select plan_period from public.accounts where owner_id = '00000000-0000-4000-8000-0000000000b1') = 'lifetime', '4. plan_period is lifetime');
select t.ok((select ends_at from public.payments where razorpay_order_id = 'order_1') is null, '4. the payment has no end');
select t.ok((select seat_limit from public.accounts where owner_id = '00000000-0000-4000-8000-0000000000b1') = 3, '4. seat_limit follows the plan (indie: 3)');
select t.ok(exists (select 1 from public.studio_members where user_id = '00000000-0000-4000-8000-0000000000b1' and disabled_at is null), '4. PAYING GRANTS ENTRY: the buyer is a member');
select t.ok((select already from public.activate_payment('order_1', 'pay_1')) = true, '4. the second activation says already');
select t.ok((select count(*) from public.accounts where owner_id = '00000000-0000-4000-8000-0000000000b1') = 1, '4. and made no second organisation');
commit;

-- 5. the organisation made for a buyer carries their name
select t.reset();
select t.ok((select name from public.accounts where owner_id = '00000000-0000-4000-8000-0000000000b1') = 'Bala''s Studio', '5. named after the buyer');
select t.ok(exists (select 1 from public.account_members where account_id = (select id from public.accounts where owner_id = '00000000-0000-4000-8000-0000000000b1')
   and user_id = '00000000-0000-4000-8000-0000000000b1' and role = 'owner' and status = 'active'), '5. with an owner member row');

-- 6. buying again: the same tier changes nothing; a different tier replaces, still for good
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-0000000000b1', 'indie', 'lifetime')), 'order_2');
select public.activate_payment('order_2', 'pay_2');
select t.ok((select plan_until from public.accounts where owner_id = '00000000-0000-4000-8000-0000000000b1') is null, '6. same tier again: still no end');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-0000000000b1', 'starter', 'lifetime')), 'order_3');
select public.activate_payment('order_3', 'pay_3');
select t.ok((select plan from public.accounts where owner_id = '00000000-0000-4000-8000-0000000000b1') = 'starter', '6. a different tier replaces');
select t.ok((select plan_until from public.accounts where owner_id = '00000000-0000-4000-8000-0000000000b1') is null, '6. and is for good too');
commit;

-- 7. the project cap, by plan
select t.reset();
insert into public.studio_members (user_id, role) values ('00000000-0000-4000-8000-0000000000c1', 'user');
begin;
select t.claims('00000000-0000-4000-8000-0000000000c1');
insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-0000000000c1', 'Film 1');
do $$ begin
  insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-0000000000c1', 'Film 2');
  raise exception 'should have refused';
exception when sqlstate 'P0402' then
  if sqlerrm not like '%Free plan syncs up to 1 project%' then raise exception 'wrong message: %', sqlerrm; end if;
  raise notice 'ok - 7. a second project on Free -> P0402 naming the cap';
end $$;
commit;
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(public.admin_grant_plan('00000000-0000-4000-8000-0000000000c1', 'starter', 30, 'bank transfer') is null, '7. admin_grant_plan returns NULL: for good (p_days is ignored)');
select t.ok((select plan_until from public.accounts where owner_id = '00000000-0000-4000-8000-0000000000c1') is null, '7. and the organisation has no end date');
commit;
select t.reset();
select t.ok((select status from public.payments where user_id = '00000000-0000-4000-8000-0000000000c1') = 'granted', '7. recorded as a granted payment');
select t.ok((select count(*) from public.payments where user_id = '00000000-0000-4000-8000-0000000000c1') = 1, '7. exactly one ledger row for the grant');
begin;
select t.claims('00000000-0000-4000-8000-0000000000c1');
insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-0000000000c1', 'Film 2');
insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-0000000000c1', 'Film 3');
do $$ begin
  insert into public.projects (owner_id, title) values ('00000000-0000-4000-8000-0000000000c1', 'Film 4');
  raise exception 'should have refused';
exception when sqlstate 'P0402' then
  if sqlerrm not like '%Starter plan syncs up to 3 projects%' then raise exception 'wrong message: %', sqlerrm; end if;
  raise notice 'ok - 7. the fourth on Starter -> P0402 naming Starter and 3';
end $$;
commit;

-- 8. share links and collaborators, the same shape; Pro is never refused
begin;
select t.claims('00000000-0000-4000-8000-0000000000c1');
insert into public.shares (project_id, role, token, created_by)
  select p.id, 'view', 'tok' || g, '00000000-0000-4000-8000-0000000000c1' from public.projects p, generate_series(1, 3) g where p.title = 'Film 1';
do $$ begin
  insert into public.shares (project_id, role, token, created_by)
    select p.id, 'view', 'tok4', '00000000-0000-4000-8000-0000000000c1' from public.projects p where p.title = 'Film 1';
  raise exception 'should have refused';
exception when sqlstate 'P0402' then raise notice 'ok - 8. a fourth live share on Starter -> P0402'; end $$;
insert into public.project_collaborators (project_id, user_id, role)
  select p.id, '00000000-0000-4000-8000-0000000000e1', 'view' from public.projects p where p.title = 'Film 1';
insert into public.project_collaborators (project_id, user_id, role)
  select p.id, '00000000-0000-4000-8000-0000000000f1', 'view' from public.projects p where p.title = 'Film 1';
do $$ begin
  insert into public.project_collaborators (project_id, user_id, role)
    select p.id, '00000000-0000-4000-8000-0000000000d1', 'view' from public.projects p where p.title = 'Film 1';
  raise exception 'should have refused';
exception when sqlstate 'P0402' then raise notice 'ok - 8. a third collaborator on Starter -> P0402'; end $$;
commit;
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_grant_plan('00000000-0000-4000-8000-0000000000b1', 'pro', 30);
commit;
begin;
select t.claims('00000000-0000-4000-8000-0000000000b1');
insert into public.projects (owner_id, title) select '00000000-0000-4000-8000-0000000000b1', 'Pro film ' || g from generate_series(1, 15) g;
select t.ok((select count(*) from public.projects where owner_id = '00000000-0000-4000-8000-0000000000b1') = 15, '8. Pro inserts fifteen projects without a cap');
commit;

-- 9. a refund ends the plan today
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-0000000000f1', 'indie', 'lifetime')), 'order_f');
select public.activate_payment('order_f', 'pay_f');
select t.ok(public.user_plan('00000000-0000-4000-8000-0000000000f1') = 'indie', '9. F is on indie after paying');
select public.mark_payment_refunded('pay_f', '{"refund":1}');
select t.ok((select status from public.payments where razorpay_payment_id = 'pay_f') = 'refunded', '9. the payment reads refunded');
select t.ok(public.user_plan('00000000-0000-4000-8000-0000000000f1') = 'free', '9. and F is on free again');
commit;

-- 10. a disabled member cannot buy their way back in
begin;
select t.service();
do $$ begin
  perform public.create_pending_payment('00000000-0000-4000-8000-0000000000d1', 'indie', 'lifetime');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 10. a disabled member -> 42501 before any order exists'; end $$;
rollback;

-- 11. accounts_guard still refuses the client; billing gets through
begin;
select t.claims('00000000-0000-4000-8000-0000000000b1');
do $$ begin
  update public.accounts set plan = 'pro' where owner_id = '00000000-0000-4000-8000-0000000000b1';
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 11. the owner cannot set their own plan (accounts_guard)'; end $$;
rollback;

-- 12. billing_status
begin;
select t.claims('00000000-0000-4000-8000-0000000000c1');
select t.ok((public.billing_status() ->> 'plan') = 'starter', '12. billing_status: plan');
select t.ok((public.billing_status() -> 'usage' ->> 'projects')::int = 3, '12. billing_status: usage.projects = 3');
select t.ok((public.billing_status() -> 'limits' ->> 'projects')::int = 3, '12. billing_status: limits.projects = 3');
select t.ok((public.billing_status() -> 'usage' ->> 'shares')::int = 3, '12. billing_status: usage.shares = 3');
select t.ok((public.billing_status() -> 'usage' ->> 'collaborators')::int = 2, '12. billing_status: usage.collaborators = 2');
select t.ok((public.billing_status() ->> 'member')::bool, '12. billing_status: member');
select t.ok(jsonb_array_length(public.billing_status() -> 'payments') = 1, '12. billing_status: the granted payment is listed');
rollback;
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_billing_overview() ->> 'paid_total_paise')::int = 59900 * 2 + 299900, '12. admin_billing_overview sums paid payments (refunded and granted excluded)');
select t.ok((select count(*) from public.admin_list_payments(100)) = 6, '12. admin_list_payments lists all six rows (3 paid, 2 granted, 1 refunded)');
rollback;

\echo
\echo SECTION 16 + 18 CHECKS PASSED
