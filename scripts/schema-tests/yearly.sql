-- ============================================================
-- SECTION 52 CHECKS — a plan is a year; renewing stacks; up is credited
-- with the unused part of the year; down waits; a refund takes back its
-- own year; the backfill gave the for-good buyer a year and left the grant.
-- Its own people (…52xx). Prices are set by yearly-seed.sql: 599/799/999.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000005201', 'y1@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000005202', 'y2@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000005203', 'y3@example.com', now(), '{}');

create or replace function t.until_of(p_user uuid) returns timestamptz language sql as $$
  select a.plan_until from public.accounts a where a.owner_id = p_user order by a.created_at limit 1 $$;
create or replace function t.days_left(p_user uuid) returns numeric language sql as $$
  select round((extract(epoch from (t.until_of(p_user) - now())) / 86400)::numeric, 2) $$;

-- 1. a purchase is a year
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005201', 'starter', 'year')), 'order_y1_1');
select public.activate_payment('order_y1_1', 'pay_y1_1');
commit;
select t.reset();
select t.ok(t.days_left('00000000-0000-4000-8000-000000005201') between 364.9 and 365.1, '1. a purchase runs 365 days (' || t.days_left('00000000-0000-4000-8000-000000005201') || ')');
select t.ok((select period = 'year' and ends_at = t.until_of('00000000-0000-4000-8000-000000005201') and starts_at < ends_at
               from public.payments where razorpay_order_id = 'order_y1_1'), '1. the payment records a year (period year, starts_at .. ends_at = plan_until)');
select t.ok((select plan_period = 'year' from public.accounts where owner_id = '00000000-0000-4000-8000-000000005201'), '1. the account says plan_period year');
select t.ok(public.user_plan('00000000-0000-4000-8000-000000005201') = 'starter', '1. and the plan is on');

-- 2. buying the same plan again is a renewal that stacks
begin;
select t.claims('00000000-0000-4000-8000-000000005201');
select t.ok((public.quote_order('starter', null) ->> 'renewal')::boolean and (public.quote_order('starter', null) ->> 'amount_paise')::int = 59900
            and (public.quote_order('starter', null) ->> 'credit_paise')::int = 0,
  '2. the same plan quotes a renewal at the full yearly price, no credit');
rollback;
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005201', 'starter', 'year')), 'order_y1_2');
select public.activate_payment('order_y1_2', 'pay_y1_2');
commit;
select t.ok(t.days_left('00000000-0000-4000-8000-000000005201') between 729.9 and 730.1, '2. renewing early adds a year to what was left (' || t.days_left('00000000-0000-4000-8000-000000005201') || ' days)');

-- 3. a month is not for sale; the old "lifetime" word is read as a year
begin;
select t.service();
do $$ begin
  perform public.create_pending_payment('00000000-0000-4000-8000-000000005203', 'starter', 'month');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 3. a month is refused (22023)'; end $$;
do $$ declare pid uuid; begin
  select payment_id into pid from public.create_pending_payment('00000000-0000-4000-8000-000000005203', 'starter', 'lifetime');
  if (select period from public.payments where id = pid) <> 'year' then raise exception 'recorded as %', (select period from public.payments where id = pid); end if;
  raise notice 'ok - 3. an order sent as lifetime (an rzp-order deployed before §52) is recorded as a year';
end $$;
rollback;

-- 4. moving up is credited with the unused part of the year
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005202', 'starter', 'year')), 'order_y2_1');
select public.activate_payment('order_y2_1', 'pay_y2_1');
commit;
-- half the year has gone
update public.payments set starts_at = now() - interval '182.5 days', ends_at = now() + interval '182.5 days' where razorpay_order_id = 'order_y2_1';
select set_config('fms.billing', 'on', false);
update public.accounts set plan_until = now() + interval '182.5 days' where owner_id = '00000000-0000-4000-8000-000000005202';
select set_config('fms.billing', '', false);
begin;
select t.claims('00000000-0000-4000-8000-000000005202');
select t.ok(abs((public.quote_order('indie', null) ->> 'credit_paise')::int - 29950) <= 5,
  '4. half a Basic year left is worth half of ₹599 toward Intermediate (' || (public.quote_order('indie', null) ->> 'credit_paise') || ')');
select t.ok(abs((public.quote_order('indie', null) ->> 'amount_paise')::int - 49950) <= 5, '4. so Intermediate costs ₹799 − ₹299.50');
rollback;
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005202', 'indie', 'year')), 'order_y2_2');
select public.activate_payment('order_y2_2', 'pay_y2_2');
commit;
select t.ok(public.user_plan('00000000-0000-4000-8000-000000005202') = 'indie' and t.days_left('00000000-0000-4000-8000-000000005202') between 364.9 and 365.1,
  '4. the upgrade starts Intermediate''s own year today');

-- 5. moving down waits for the year to end
begin;
select t.claims('00000000-0000-4000-8000-000000005202');
do $$ declare h text; begin
  perform public.quote_order('starter', null);
  raise exception 'should have refused';
exception when sqlstate '22023' then
  get stacked diagnostics h = pg_exception_hint;
  if h <> 'downgrade' then raise exception 'hint was %', h; end if;
  raise notice 'ok - 5. a lower plan is refused while the year runs (hint downgrade)';
end $$;
rollback;

-- 6. a year that has ended: the plan is off, and anything can be bought
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005203', 'pro', 'year')), 'order_y3_1');
select public.activate_payment('order_y3_1', 'pay_y3_1');
commit;
update public.payments set starts_at = now() - interval '366 days', ends_at = now() - interval '1 day' where razorpay_order_id = 'order_y3_1';
select set_config('fms.billing', 'on', false);
update public.accounts set plan_until = now() - interval '1 day' where owner_id = '00000000-0000-4000-8000-000000005203';
select set_config('fms.billing', '', false);
select t.ok(public.user_plan('00000000-0000-4000-8000-000000005203') = 'free', '6. after its year Pro is off (user_plan free)');
begin;
select t.claims('00000000-0000-4000-8000-000000005203');
select t.ok((public.quote_order('starter', null) ->> 'amount_paise')::int = 59900 and (public.quote_order('starter', null) ->> 'credit_paise')::int = 0,
  '6. and Basic can be bought, at the full price — an ended year is no credit');
select t.ok((public.billing_status() ->> 'lapsed')::boolean, '6. billing_status says lapsed');
rollback;

-- 7. a refund takes back that payment's own year
begin;
select t.service();
select public.mark_payment_refunded('pay_y1_2');
commit;
select t.ok(t.days_left('00000000-0000-4000-8000-000000005201') between 364.9 and 365.1, '7. refunding the renewal leaves the first year (' || t.days_left('00000000-0000-4000-8000-000000005201') || ' days)');
begin;
select t.service();
select public.mark_payment_refunded('pay_y1_1');
commit;
select t.ok(t.until_of('00000000-0000-4000-8000-000000005201') <= now() + interval '1 minute' and public.user_plan('00000000-0000-4000-8000-000000005201') = 'free',
  '7. refunding the other year too ends the plan');

-- 8. the backfill (yearly-seed.sql made these before §52 ran)
select t.ok((select yearly_switch_at is not null from public.billing_settings), '8. the switch instant is recorded');
select t.ok(t.until_of('00000000-0000-4000-8000-000000005204') = (select yearly_switch_at + interval '365 days' from public.billing_settings),
  '8. the buyer who had Pro for good has a year from the switch — once, though §52 loaded twice');
select t.ok((select period = 'year' and ends_at = t.until_of('00000000-0000-4000-8000-000000005204') from public.payments where razorpay_order_id = 'order_y4_seed'),
  '8. and their payment records that year');
select t.ok(t.until_of('00000000-0000-4000-8000-000000005205') is null and public.user_plan('00000000-0000-4000-8000-000000005205') = 'pro',
  '8. a plan GRANTED for good stays for good');
begin;
select t.claims('00000000-0000-4000-8000-000000005205');
do $$ declare h text; begin
  perform public.quote_order('pro', null);
  raise exception 'should have refused';
exception when sqlstate '22023' then
  get stacked diagnostics h = pg_exception_hint;
  if h <> 'same_plan' then raise exception 'hint was %', h; end if;
  raise notice 'ok - 8. a plan held for good has nothing to renew (hint same_plan)';
end $$;
rollback;

-- 9. a timed grant is honoured; 0 days is still for good
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
-- (called once, in a subquery: BETWEEN would evaluate it twice, and the
-- second grant of the same plan stacks, which is the point of 52.1)
select t.ok(g between now() + interval '29.9 days' and now() + interval '30.1 days', '9. a 30-day grant ends in 30 days')
  from (select public.admin_grant_plan('00000000-0000-4000-8000-000000005203', 'indie', 30, 'a month to try') g) s;
rollback;
