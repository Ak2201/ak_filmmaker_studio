-- ============================================================
-- SECTION 22 CHECKS — referral codes and the credits ledger
-- ------------------------------------------------------------
-- R1 pays and gets a code, R2 is the friend who uses it, R3 has paid
-- nothing, R4 is a second friend whose payment is refunded. Prices as
-- upgrade.sql left them: starter 299900, indie 799900, pro 1999900.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000002201', 'ref1@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000002202', 'ref2@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000002203', 'ref3@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000002204', 'ref4@example.com', now(), '{}');

-- 1. closed to the client
begin;
select t.claims('00000000-0000-4000-8000-000000002201');
do $$ begin
  perform count(*) from public.referral_credits;
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. authenticated select from referral_credits -> 42501'; end $$;
do $$ begin
  perform count(*) from public.billing_settings;
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. authenticated select from billing_settings -> 42501'; end $$;
do $$ begin
  perform public.admin_list_referral_credits();
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. admin_list_referral_credits as a user -> 42501'; end $$;
do $$ begin
  perform public.admin_set_billing_settings('{"referral_reward_pct": 100}');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. admin_set_billing_settings as a user -> 42501'; end $$;
do $$ begin
  perform public.admin_mark_referral_paid(array[gen_random_uuid()], null);
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. admin_mark_referral_paid as a user -> 42501'; end $$;
do $$ begin
  perform public.ensure_referral_code('00000000-0000-4000-8000-000000002201');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. ensure_referral_code (internal) as a user -> 42501'; end $$;
rollback;
begin;
select t.claims('00000000-0000-4000-8000-000000002201', 'anon');
do $$ begin
  perform public.my_referral();
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. anon calling my_referral -> 42501'; end $$;
do $$ begin
  perform count(*) from public.referral_credits;
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. anon select from referral_credits -> 42501'; end $$;
rollback;

-- 2. no payment, no code; a payment mints one, once
begin;
select t.claims('00000000-0000-4000-8000-000000002203');
select t.ok(not (public.my_referral() ->> 'eligible')::bool, '2. a member who has paid nothing has no code (eligible false)');
rollback;
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000002201', 'starter', 'lifetime')), 'order_ref_1');
select public.activate_payment('order_ref_1', 'pay_ref_1');
select t.ok((select count(*) from public.promo_codes where kind = 'referral' and owner_user_id = '00000000-0000-4000-8000-000000002201') = 1,
  '2. the activation minted R1 a referral code (the trigger)');
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000002201');
select t.ok((public.my_referral() ->> 'eligible')::bool and (public.my_referral() ->> 'code') ~ '^REF-[A-HJ-KM-NP-Z2-9]{6}$',
  '2. my_referral: eligible, a code shaped REF-XXXXXX from the unambiguous alphabet');
select t.ok((public.my_referral() ->> 'code') = (public.my_referral() ->> 'code'), '2. asking again returns the same code');
select t.ok((public.my_referral() ->> 'percent_off')::int = 10, '2. it gives a friend 10% off (the default)');
-- 3. self-referral
select t.ok((public.quote_order('indie', public.my_referral() ->> 'code') ->> 'reason') = 'own_code',
  '3. R1 quoting their own code -> ok false, reason own_code');
select t.ok((public.quote_order('indie', public.my_referral() ->> 'code') ->> 'sentence') like 'That is your own referral code%', '3. with the sentence');
rollback;
-- carry the code through the next blocks
create temp table ref_code as select code from public.promo_codes where kind = 'referral' and owner_user_id = '00000000-0000-4000-8000-000000002201';
grant select on ref_code to service_role, authenticated, anon;
begin;
select t.service();
do $$ begin
  perform public.create_pending_payment('00000000-0000-4000-8000-000000002201', 'indie', 'lifetime', null, (select code from ref_code));
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 3. an order with one''s own referral code -> 22023'; end $$;
rollback;
select t.reset();
select t.ok((public.quote_order('indie', (select code from ref_code)) ->> 'ok')::bool, '3. signed out, the same code quotes ok (no buyer to compare)');

-- 4. a friend uses it: discounted, credited at activation, once
begin;
select t.service();
select t.ok((select amount_paise from public.create_pending_payment('00000000-0000-4000-8000-000000002202', 'indie', 'lifetime', null, (select code from ref_code))) = 719910,
  '4. the friend pays Indie less 10% (799900 -> 719910)');
select public.attach_razorpay_order((select id from public.payments where user_id = '00000000-0000-4000-8000-000000002202' and status = 'created'), 'order_ref_2');
select t.ok((select count(*) from public.referral_credits where referrer_user_id = '00000000-0000-4000-8000-000000002201') = 0, '4. no credit while the order is only created');
select public.activate_payment('order_ref_2', 'pay_ref_2');
select t.ok((select amount_paise = 71991 and basis_paise = 719910 and status = 'owed' from public.referral_credits
              where referrer_user_id = '00000000-0000-4000-8000-000000002201'), '4. activation credits R1 10% of what the friend paid (71991), owed');
select public.activate_payment('order_ref_2', 'pay_ref_2');
select t.ok((select count(*) from public.referral_credits where referrer_user_id = '00000000-0000-4000-8000-000000002201') = 1, '4. a second activation (already) credits nothing more');
select t.ok((select uses from public.promo_codes where code = (select code from ref_code)) = 1, '4. the code''s uses moved once');
select t.ok((select count(*) from public.promo_codes where kind = 'referral' and owner_user_id = '00000000-0000-4000-8000-000000002202') = 1, '4. and the friend, having paid, has a code of their own now');
commit;

-- 5. a fixed reward, never more than the friend paid
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_set_billing_settings('{"referral_reward_paise": 50000}') ->> 'referral_reward_pct') is null, '5. setting a fixed reward clears the percentage');
do $$ begin
  perform public.admin_set_billing_settings('{"referral_friend_pct": 0}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 5. a 0%% friend discount -> 22023'; end $$;
do $$ begin
  perform public.admin_set_billing_settings('{"bogus": 1}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 5. an unknown setting -> 22023'; end $$;
commit;
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000002204', 'starter', 'lifetime', null, (select code from ref_code))), 'order_ref_4');
select public.activate_payment('order_ref_4', 'pay_ref_4');
select t.ok((select r.amount_paise from public.referral_credits r join public.payments p on p.id = r.payment_id where p.razorpay_order_id = 'order_ref_4') = 50000,
  '5. the next referred payment credits the fixed ₹500');
-- 6. a refund voids an unpaid credit
select public.mark_payment_refunded('pay_ref_4');
select t.ok((select r.status from public.referral_credits r join public.payments p on p.id = r.payment_id where p.razorpay_order_id = 'order_ref_4') = 'void',
  '6. the friend''s refund voids the credit');
commit;

-- 7. the console: list, pay out, and the member's view follows
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((select count(*) from public.admin_list_referral_credits()) = 2, '7. the console lists both credits');
select t.ok((select referrer_email = 'ref1@example.com' and friend_email = 'ref2@example.com' and plan_id = 'indie'
               from public.admin_list_referral_credits('owed')), '7. with who referred whom and for what');
select t.ok(public.admin_mark_referral_paid((select array_agg(id) from public.admin_list_referral_credits()), 'UPI 7 Oct') = 1,
  '7. marking both paid moves only the owed one (the void stays void)');
select t.ok(public.admin_mark_referral_paid((select array_agg(id) from public.admin_list_referral_credits()), 'again') = 0, '7. and marking again moves nothing');
select t.ok((select paid_note = 'UPI 7 Oct' and paid_at is not null from public.admin_list_referral_credits('paid')), '7. the paid row keeps its note and date');
select t.claims('00000000-0000-4000-8000-000000002201');
select t.ok((public.my_referral() ->> 'paid_paise')::int = 71991 and (public.my_referral() ->> 'owed_paise')::int = 0, '7. R1 sees ₹719.91 paid out and nothing owed');
select t.ok(jsonb_array_length(public.my_referral() -> 'credits') = 2 and not ((public.my_referral() -> 'credits') -> 0 ? 'friend_email'),
  '7. and both credits, without the friend''s address');
commit;

-- 8. the friend discount is one number: changing it reprices every referral code
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_billing_settings('{"referral_friend_pct": 15, "referral_reward_pct": 10}');
select t.ok((select bool_and(percent_off = 15) from public.admin_list_promo_codes() where kind = 'referral'), '8. a new friend percentage applies to every existing referral code');
select t.ok((public.admin_get_billing_settings() ->> 'referral_reward_paise') is null, '8. and a percentage reward clears the fixed one');
rollback;

drop table ref_code;
\echo
\echo SECTION 22 CHECKS PASSED
