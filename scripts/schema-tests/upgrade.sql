-- ============================================================
-- SECTION 21 CHECKS — upgrade by paying the difference
-- ------------------------------------------------------------
-- Runs after §21 onward has loaded on top of the state billing.sql,
-- accounts.sql and promo.sql left. Its own people, so nothing they
-- bought can make a check here pass: U1 upgrades Starter -> Indie ->
-- Pro, U2 pays two orders in the wrong order, U3 is refunded and then
-- granted. A (…00a) is still the administrator.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000002101', 'upa@example.com', now(), '{"full_name":"Upa"}'),
  ('00000000-0000-4000-8000-000000002102', 'upb@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000002103', 'upc@example.com', now(), '{}');

-- the prices this file reasons about (billing.sql left indie at ₹599)
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_plan('starter', '{"price_paise": 299900}');
select public.admin_set_plan('indie',   '{"price_paise": 799900}');
select public.admin_set_plan('pro',     '{"price_paise": 1999900}');
select public.admin_set_promo_code('UPG10', '{"percent_off": 10}');
commit;

-- 1. signed out: the list price, and the internals are closed
select t.reset();
select t.ok((public.quote_order('indie', null) ->> 'amount_paise')::int = 799900 and (public.quote_order('indie', null) ->> 'credit_paise')::int = 0,
  '1. a signed-out quote is the list price with no credit (unchanged from §20)');
begin;
select t.claims('00000000-0000-4000-8000-000000002101', 'anon');
do $$ begin
  perform public.quote_for('00000000-0000-4000-8000-000000002101', 'indie', null);
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. anon calling quote_for (internal) -> 42501'; end $$;
rollback;
begin;
select t.claims('00000000-0000-4000-8000-000000002101');
do $$ begin
  perform public.paid_credit_paise('00000000-0000-4000-8000-000000002101');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. authenticated calling paid_credit_paise (internal) -> 42501'; end $$;
select t.ok((public.quote_order('indie', null) ->> 'amount_paise')::int = 799900, '1. a signed-in buyer with nothing paid quotes the list price');
rollback;

-- 2. U1 buys Starter, then the Indie card is the difference
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000002101', 'starter', 'lifetime')), 'order_up_1');
select public.activate_payment('order_up_1', 'pay_up_1');
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000002101');
select t.ok((public.quote_order('indie', null) ->> 'amount_paise')::int = 500000, '2. Starter paid ₹2,999: Indie quotes ₹5,000 (799900 − 299900)');
select t.ok((public.quote_order('indie', null) ->> 'credit_paise')::int = 299900 and (public.quote_order('indie', null) ->> 'list_paise')::int = 799900,
  '2. with credit_paise 299900 and the list price beside it');
select t.ok((public.quote_order('indie', null) ->> 'upgrade_from') = 'starter' and (public.quote_order('indie', null) ->> 'upgrade_from_name') = 'Starter',
  '2. naming what was paid for (upgrade_from starter / Starter)');
select t.ok((public.quote_order('pro', null) ->> 'amount_paise')::int = 1700000, '2. and Pro quotes ₹17,000 (1999900 − 299900)');
do $$ declare h text; begin
  perform public.quote_order('starter', null);
  raise exception 'should have refused';
exception when sqlstate '22023' then
  get stacked diagnostics h = pg_exception_hint;
  if h <> 'same_plan' then raise exception 'wrong hint: %', h; end if;
  raise notice 'ok - 2. quoting the plan already held -> 22023 hint same_plan';
end $$;
-- 3. a code applies to the difference
select t.ok((public.quote_order('indie', 'upg10') ->> 'amount_paise')::int = 450000 and (public.quote_order('indie', 'upg10') ->> 'discount_paise')::int = 50000,
  '3. UPG10 takes 10% off the ₹5,000 difference (₹500), not off the ₹7,999 list');
select t.ok((public.quote_order('indie', 'NOPE') ->> 'amount_paise')::int = 500000 and not (public.quote_order('indie', 'NOPE') ->> 'ok')::bool,
  '3. a refused code carries the difference, not the list, and ok false');
rollback;

-- 5. the order and the activation
begin;
select t.service();
select t.ok((select amount_paise = 450000 and credit_paise = 299900 and list_paise = 799900 and discount_paise = 50000
               from public.create_pending_payment('00000000-0000-4000-8000-000000002101', 'indie', 'lifetime', null, 'UPG10')),
  '5. create_pending_payment prices the upgrade at the difference less the code, and says so');
select t.ok((select amount_paise = list_paise - credit_paise - discount_paise from public.payments
              where user_id = '00000000-0000-4000-8000-000000002101' and plan_id = 'indie' and status = 'created'),
  '5. the row reads amount = list − credit − discount');
select public.attach_razorpay_order((select id from public.payments where user_id = '00000000-0000-4000-8000-000000002101' and plan_id = 'indie' and status = 'created'), 'order_up_2');
select public.activate_payment('order_up_2', 'pay_up_2', '{"source":"webhook","payment":{"amount":450000}}');
select t.ok(public.user_plan('00000000-0000-4000-8000-000000002101') = 'indie', '5. activated: U1 is on Indie');
select t.ok(public.paid_credit_paise('00000000-0000-4000-8000-000000002101') = 749900, '5. the credit is now everything paid: 299900 + 450000');
do $$ begin
  perform public.create_pending_payment('00000000-0000-4000-8000-000000002101', 'starter', 'lifetime');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 6. an order for a LOWER plan -> 22023 (downgrade)'; end $$;
do $$ begin
  perform public.create_pending_payment('00000000-0000-4000-8000-000000002101', 'indie', 'lifetime');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 6. an order for the SAME plan -> 22023'; end $$;
commit;

begin;
select t.claims('00000000-0000-4000-8000-000000002101');
select t.ok((public.quote_order('pro', null) ->> 'amount_paise')::int = 1250000, '5. Pro now quotes 1999900 − 749900 = ₹12,500');
do $$ declare h text; begin
  perform public.quote_order('starter', null);
  raise exception 'should have refused';
exception when sqlstate '22023' then
  get stacked diagnostics h = pg_exception_hint;
  if h <> 'downgrade' then raise exception 'wrong hint: %', h; end if;
  raise notice 'ok - 6. an Indie holder quoting Starter -> 22023 hint downgrade';
end $$;
rollback;

-- 4. the ₹1 floor: a credit at or above the target price
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_plan('pro', '{"price_paise": 700000}');
select t.claims('00000000-0000-4000-8000-000000002101');
select t.ok((public.quote_order('pro', null) ->> 'amount_paise')::int = 100, '4. paid ₹7,499 toward a ₹7,000 Pro: the difference floors at ₹1, never ₹0 or less');
select t.ok((public.quote_order('pro', null) ->> 'credit_paise')::int = 699900, '4. and the credit shown is what was actually taken off (list − ₹1)');
select t.ok((public.quote_order('pro', 'UPG10') ->> 'amount_paise')::int = 100, '4. a code cannot take the floor below ₹1 either');
rollback;

-- 7. two orders paid in the wrong order: the higher plan stands
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000002102', 'indie', 'lifetime')), 'order_up_b1');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000002102', 'pro', 'lifetime')), 'order_up_b2');
select public.activate_payment('order_up_b2', 'pay_up_b2');
select public.activate_payment('order_up_b1', 'pay_up_b1');
select t.ok(public.user_plan('00000000-0000-4000-8000-000000002102') = 'pro', '7. Pro activated first, Indie second: U2 stays on Pro');
select t.ok((select count(*) from public.payments where user_id = '00000000-0000-4000-8000-000000002102' and status = 'paid') = 2, '7. and both payments read paid in the ledger');
commit;

-- 8. a refund credits nothing; a grant credits ₹0
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000002103', 'starter', 'lifetime')), 'order_up_c1');
select public.activate_payment('order_up_c1', 'pay_up_c1');
select public.mark_payment_refunded('pay_up_c1');
select t.ok(public.paid_credit_paise('00000000-0000-4000-8000-000000002103') = 0, '8. a refunded payment credits nothing');
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_grant_plan('00000000-0000-4000-8000-000000002103', 'starter', 0, 'comp');
select t.claims('00000000-0000-4000-8000-000000002103');
select t.ok((public.quote_order('indie', null) ->> 'amount_paise')::int = 799900 and (public.quote_order('indie', null) ->> 'upgrade_from') is null,
  '8. granted Starter (₹0): Indie is the full price and names no credit');
commit;

-- 9. the console's ledger carries the credit
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((select credit_paise = 299900 and amount_paise = 450000 from public.admin_list_payments(1000) where razorpay_order_id = 'order_up_2'),
  '9. admin_list_payments shows credit_paise on the upgrade row');
select t.ok((select credit_paise = 0 from public.admin_list_payments(1000) where razorpay_order_id = 'order_up_1'), '9. and 0 on a first purchase');
rollback;

\echo
\echo SECTION 21 CHECKS PASSED
