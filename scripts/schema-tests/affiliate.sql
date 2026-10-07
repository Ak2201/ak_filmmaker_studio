-- ============================================================
-- SECTION 23 CHECKS — affiliate codes and the commission report
-- ------------------------------------------------------------
-- F1 and F2 buy through FESTDESK (5% off, 20% commission); F2 is
-- refunded. F3 buys an upgrade through it, so the report's revenue is
-- net of a §21 credit as well as the discount.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000002301', 'aff1@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000002302', 'aff2@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000002303', 'aff3@example.com', now(), '{}');

-- 1. admin only
begin;
select t.claims('00000000-0000-4000-8000-000000002301');
do $$ begin
  perform public.admin_affiliate_report();
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. admin_affiliate_report as a user -> 42501'; end $$;
do $$ begin
  perform public.admin_affiliate_orders('FESTDESK');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. admin_affiliate_orders as a user -> 42501'; end $$;
rollback;

-- 2. making one
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((select kind = 'affiliate' and commission_pct = 20 from public.admin_set_promo_code('festdesk', '{"percent_off": 5, "commission_pct": 20, "note": "Chennai festival desk"}')),
  '2. a code with a commission is kind affiliate');
do $$ begin
  perform public.admin_set_promo_code('ZEROCOMM', '{"percent_off": 5, "commission_pct": 0}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 2. a 0%% commission -> 22023'; end $$;
do $$ begin
  perform public.admin_set_promo_code('BIGCOMM', '{"percent_off": 5, "commission_pct": 101}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 2. a 101%% commission -> 22023'; end $$;
do $$ begin
  perform public.admin_set_promo_code('TEXTCOMM', '{"percent_off": 5, "commission_pct": "lots"}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 2. a commission that is not a number -> 22023'; end $$;
do $$ begin
  perform public.admin_set_promo_code((select code from public.admin_list_promo_codes() where kind = 'referral' limit 1), '{"commission_pct": 10}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 2. a commission on a referral code -> 22023'; end $$;
select t.ok((select kind = 'promo' and commission_pct is null from public.admin_set_promo_code('PLAINJANE', '{"percent_off": 5}')), '2. a code without one is still a plain promo');
commit;

-- 3. orders through it: the report derives revenue and commission
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000002301', 'indie', 'lifetime', null, 'FESTDESK')), 'order_aff_1');
select public.activate_payment('order_aff_1', 'pay_aff_1');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000002302', 'starter', 'lifetime', null, 'FESTDESK')), 'order_aff_2');
select public.activate_payment('order_aff_2', 'pay_aff_2');
select public.mark_payment_refunded('pay_aff_2');
-- F3: Starter at the list, then the upgrade to Indie through the code
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000002303', 'starter', 'lifetime')), 'order_aff_3a');
select public.activate_payment('order_aff_3a', 'pay_aff_3a');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000002303', 'indie', 'lifetime', null, 'FESTDESK')), 'order_aff_3b');
select public.activate_payment('order_aff_3b', 'pay_aff_3b');
-- an order only CREATED through the code counts for nothing
select public.create_pending_payment('00000000-0000-4000-8000-000000002301', 'pro', 'lifetime', null, 'FESTDESK');
commit;

begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
-- 799900 less 5% = 759905; the upgrade: (799900 − 299900) = 500000 less 5% = 475000
select t.ok((select orders from public.admin_affiliate_report() where code = 'FESTDESK') = 2, '3. two paid orders (the refunded and the merely created do not count)');
select t.ok((select revenue_paise from public.admin_affiliate_report() where code = 'FESTDESK') = 759905 + 475000,
  '3. revenue is what was actually paid: net of the 5% and of the upgrade credit (759905 + 475000)');
select t.ok((select discount_paise from public.admin_affiliate_report() where code = 'FESTDESK') = 39995 + 25000, '3. and the discount given is reported beside it');
select t.ok((select commission_due_paise from public.admin_affiliate_report() where code = 'FESTDESK') = floor((759905 + 475000) * 0.20),
  '3. commission due = floor(revenue × 20%)');
select t.ok((select refunded from public.admin_affiliate_report() where code = 'FESTDESK') = 1, '3. the refund is counted, separately');
select t.ok(not exists (select 1 from public.admin_affiliate_report() where code = 'PLAINJANE'), '3. a code without a commission is not in the report');
select t.ok((select count(*) from public.admin_affiliate_orders('festdesk')) = 3, '3. the orders list shows the two paid and the refunded one');
select t.ok((select email from public.admin_affiliate_orders('FESTDESK') where status = 'refunded') = 'aff2@example.com', '3. with who bought');
commit;

-- 4. clearing the commission makes it a plain code again
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((select kind = 'promo' from public.admin_set_promo_code('FESTDESK', '{"commission_pct": null}')), '4. commission cleared -> kind promo');
select t.ok(not exists (select 1 from public.admin_affiliate_report() where code = 'FESTDESK'), '4. and it leaves the report');
select t.ok((select percent_off from public.admin_list_promo_codes() where code = 'FESTDESK') = 5, '4. its discount untouched');
rollback;

\echo
\echo SECTION 23 CHECKS PASSED
