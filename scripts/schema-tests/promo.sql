-- ============================================================
-- SECTION 20 CHECKS — promo codes
-- ------------------------------------------------------------
-- Runs after billing.sql and accounts.sql in the same scratch
-- database. Prices as billing.sql left them: starter 299900, indie
-- 59900 (check 2 edited it), pro 1999900. A the administrator, B a
-- buyer, C a member, F a buyer whose plan was refunded.
-- ============================================================
\set ON_ERROR_STOP on

-- 1. nobody reads the table from the client; the console RPCs are admin-only
begin;
select t.claims('00000000-0000-4000-8000-0000000000b1');
do $$ begin
  perform count(*) from public.promo_codes;
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. authenticated select from promo_codes -> 42501'; end $$;
do $$ begin
  perform public.admin_list_promo_codes();
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. admin_list_promo_codes as a user -> 42501'; end $$;
do $$ begin
  perform public.admin_set_promo_code('HACK', '{"percent_off": 100}');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. admin_set_promo_code as a user -> 42501'; end $$;
rollback;
begin;
select t.claims('00000000-0000-4000-8000-00000000000a', 'anon');
do $$ begin
  perform count(*) from public.promo_codes;
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. anon select from promo_codes -> 42501'; end $$;
rollback;

-- 2. the console makes codes, within the rules
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_set_promo_code('launch 10', '{"percent_off": 10, "note": "launch week"}')).code = 'LAUNCH10', '2. the code is stored upper-cased with no spaces');
select t.ok((select active and uses = 0 and plan_ids is null and percent_off = 10 from public.admin_list_promo_codes() where code = 'LAUNCH10'), '2. active, unused, every plan, 10% (read through the console RPC; the table itself is closed)');
select public.admin_set_promo_code('FLAT500', '{"amount_off_paise": 50000, "plan_ids": ["indie"], "max_uses": 1}');
select public.admin_set_promo_code('OLD', format('{"percent_off": 50, "valid_until": "%s"}', (now() - interval '1 day')::text)::jsonb);
select public.admin_set_promo_code('SOON', format('{"percent_off": 50, "valid_from": "%s"}', (now() + interval '1 day')::text)::jsonb);
select public.admin_set_promo_code('OFF', '{"percent_off": 50, "active": false}');
select public.admin_set_promo_code('FREEBIE', '{"percent_off": 100}');
select public.admin_set_promo_code('BIGFLAT', '{"amount_off_paise": 100000}');
select t.ok((select count(*) from public.admin_list_promo_codes()) = 7, '2. admin_list_promo_codes lists all seven');
do $$ begin
  perform public.admin_set_promo_code('BOTH', '{"percent_off": 10, "amount_off_paise": 100}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 2. both discounts -> 22023'; end $$;
do $$ begin
  perform public.admin_set_promo_code('NEITHER', '{"note": "x"}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 2. neither discount -> 22023'; end $$;
do $$ begin
  perform public.admin_set_promo_code('a!', '{"percent_off": 10}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 2. a bad code name -> 22023'; end $$;
do $$ begin
  perform public.admin_set_promo_code('FREEPLAN', '{"percent_off": 10, "plan_ids": ["free"]}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 2. a code for the free plan -> 22023'; end $$;
do $$ begin
  perform public.admin_set_promo_code('PCT', '{"percent_off": 101}');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 2. 101%% -> 22023'; end $$;
commit;

-- 3. the quote: the maths
select t.reset();
select t.ok((public.quote_order('indie', null) ->> 'ok')::bool and (public.quote_order('indie', null) ->> 'amount_paise')::int = 59900, '3. no code: ok, the list price');
select t.ok((public.quote_order('indie', '') ->> 'amount_paise')::int = 59900 and (public.quote_order('indie', '') ->> 'code') is null, '3. an empty code is no code');
select t.ok((public.quote_order('indie', 'launch10') ->> 'amount_paise')::int = 53910, '3. LAUNCH10 on indie: 59900 less 10% = 53910');
select t.ok((public.quote_order('indie', ' Launch 10 ') ->> 'discount_paise')::int = 5990, '3. typed with spaces and lower case: discount 5990');
select t.ok((public.quote_order('indie', 'launch10') ->> 'list_paise')::int = 59900, '3. list_paise is the table price');
select t.ok((public.quote_order('pro', 'launch10') ->> 'amount_paise')::int = 1799910, '3. LAUNCH10 on pro: 1999900 less 10% = 1799910');
select t.ok((public.quote_order('indie', 'FLAT500') ->> 'amount_paise')::int = 9900, '3. ₹500 off indie: 59900 - 50000 = 9900');
select t.ok((public.quote_order('indie', 'BIGFLAT') ->> 'amount_paise')::int = 100, '3. ₹1000 off a ₹599 plan floors at 100 paise (₹1)');
select t.ok((public.quote_order('indie', 'BIGFLAT') ->> 'discount_paise')::int = 59800, '3. and the discount is the list price less ₹1');
select t.ok((public.quote_order('starter', 'FREEBIE') ->> 'amount_paise')::int = 100, '3. a 100% code costs ₹1, never ₹0');
select t.ok(public.promo_price(100, 50, null) = 100, '3. promo_price never goes below 100');
select t.ok(public.promo_price(50, null, 10) = 50, '3. promo_price never goes above the list price (a sub-₹1 list stays as it is)');
select t.ok(public.promo_price(999, 10, null) = 900, '3. a percentage floors the paise: 999 less 99.9 -> 900');
do $$ begin
  perform public.quote_order('free', 'LAUNCH10');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 3. quoting the free plan -> 22023 (not for sale)'; end $$;

-- 4. the reasons
select t.ok((public.quote_order('indie', 'NOPE') ->> 'reason') = 'unknown' and not (public.quote_order('indie', 'NOPE') ->> 'ok')::bool, '4. unknown');
select t.ok((public.quote_order('indie', 'NOPE') ->> 'amount_paise')::int = 59900, '4. a refused quote carries the list price');
select t.ok((public.quote_order('indie', 'NOPE') ->> 'sentence') like 'That code is not one we know%', '4. and a sentence');
select t.ok((public.quote_order('indie', 'OLD') ->> 'reason') = 'expired', '4. expired');
select t.ok((public.quote_order('indie', 'SOON') ->> 'reason') = 'inactive', '4. not yet valid -> inactive');
select t.ok((public.quote_order('indie', 'OFF') ->> 'reason') = 'inactive', '4. deactivated -> inactive');
select t.ok((public.quote_order('starter', 'FLAT500') ->> 'reason') = 'not_for_plan', '4. FLAT500 is for indie only: not_for_plan on starter');
select t.ok((public.quote_order('indie', 'FLAT500') ->> 'ok')::bool, '4. and ok on indie');

-- 5. the order carries the code; uses is untouched until activation
begin;
select t.service();
select t.ok((select amount_paise from public.create_pending_payment('00000000-0000-4000-8000-0000000000b1', 'indie', 'lifetime', null, 'launch10')) = 53910,
  '5. create_pending_payment with LAUNCH10 prices the row at 53910');
select t.ok((select promo_code = 'LAUNCH10' and list_paise = 59900 and discount_paise = 5990 from public.payments
              where user_id = '00000000-0000-4000-8000-0000000000b1' and status = 'created' and promo_code is not null), '5. the row records the code, the list price and the discount');
select t.ok((select uses from public.promo_codes where code = 'LAUNCH10') = 0, '5. uses is still 0 after the order');
do $$ begin
  perform public.create_pending_payment('00000000-0000-4000-8000-0000000000b1', 'indie', 'lifetime', null, 'NOPE');
  raise exception 'should have refused';
exception when sqlstate '22023' then
  if sqlerrm not like 'That code is not one we know%' then raise exception 'wrong message: %', sqlerrm; end if;
  raise notice 'ok - 5. a refused code -> 22023 with the sentence as the message';
end $$;
do $$ begin
  perform public.create_pending_payment('00000000-0000-4000-8000-0000000000b1', 'starter', 'lifetime', null, 'FLAT500');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 5. a code for another plan -> 22023'; end $$;
select t.ok((select amount_paise from public.create_pending_payment('00000000-0000-4000-8000-0000000000c1', 'starter', 'lifetime')) = 299900,
  '5. without a code the three-argument call still prices at the list');
commit;

-- 6. activation spends the code, once
begin;
select t.service();
select public.attach_razorpay_order((select id from public.payments where promo_code = 'LAUNCH10' and status = 'created'), 'order_promo1');
select t.ok((select already from public.activate_payment('order_promo1', 'pay_promo1')) = false, '6. activation is new');
select t.ok((select uses from public.promo_codes where code = 'LAUNCH10') = 1, '6. uses is 1 after activation');
select t.ok((select status = 'paid' and amount_paise = 53910 from public.payments where razorpay_order_id = 'order_promo1'), '6. paid at the discounted amount');
select t.ok((select plan from public.accounts where owner_id = '00000000-0000-4000-8000-0000000000b1' order by created_at desc limit 1) = 'indie', '6. and the plan landed');
select t.ok((select already from public.activate_payment('order_promo1', 'pay_promo1')) = true, '6. the second activation says already');
select t.ok((select uses from public.promo_codes where code = 'LAUNCH10') = 1, '6. and spends nothing more');
-- the one-use code
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-0000000000c1', 'indie', 'lifetime', null, 'FLAT500')), 'order_flat1');
select t.ok((public.quote_order('indie', 'FLAT500') ->> 'ok')::bool, '6. FLAT500 still quotes ok while its order is only created');
select public.activate_payment('order_flat1', 'pay_flat1');
select t.ok((select uses from public.promo_codes where code = 'FLAT500') = 1, '6. FLAT500 uses = 1 = max_uses');
select t.ok((public.quote_order('indie', 'FLAT500') ->> 'reason') = 'exhausted', '6. and it now quotes exhausted');
do $$ begin
  perform public.create_pending_payment('00000000-0000-4000-8000-0000000000b1', 'indie', 'lifetime', null, 'FLAT500');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 6. an exhausted code cannot open an order'; end $$;
commit;

-- 7. the webhook's amount must be the row's
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-0000000000b1', 'pro', 'lifetime', null, 'LAUNCH10')), 'order_promo2');
do $$ begin
  perform public.activate_payment('order_promo2', 'pay_promo2', '{"source":"webhook","payment":{"amount": 1999900}}');
  raise exception 'should have refused';
exception when sqlstate '22023' then
  if sqlerrm not like 'Razorpay reports 1999900 paise%' then raise exception 'wrong message: %', sqlerrm; end if;
  raise notice 'ok - 7. a webhook reporting the LIST amount for a discounted order -> 22023';
end $$;
select t.ok((select status from public.payments where razorpay_order_id = 'order_promo2') = 'created', '7. the row is still created');
select t.ok((select uses from public.promo_codes where code = 'LAUNCH10') = 1, '7. and the code was not spent');
select public.activate_payment('order_promo2', 'pay_promo2', '{"source":"webhook","payment":{"amount": 1799910}}');
select t.ok((select status from public.payments where razorpay_order_id = 'order_promo2') = 'paid', '7. the right amount activates');
select t.ok((select uses from public.promo_codes where code = 'LAUNCH10') = 2, '7. and spends the code');
commit;

-- 8. the ledger shows the code
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((select promo_code = 'LAUNCH10' and discount_paise = 5990 and list_paise = 59900 from public.admin_list_payments(100) where razorpay_order_id = 'order_promo1'), '8. admin_list_payments carries promo_code, discount_paise and list_paise');
select t.ok((select promo_code is null and discount_paise = 0 from public.admin_list_payments(100) where razorpay_order_id = 'order_1'), '8. an undiscounted row reads null / 0');
select t.ok((select uses from public.admin_list_promo_codes() where code = 'LAUNCH10') = 2, '8. admin_list_promo_codes shows uses 2');
rollback;

-- 9. deactivate and reactivate from the console
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_promo_code('LAUNCH10', '{"active": false}');
select t.ok((public.quote_order('indie', 'LAUNCH10') ->> 'reason') = 'inactive', '9. deactivated -> inactive');
select public.admin_set_promo_code('LAUNCH10', '{"active": true, "max_uses": 2}');
select t.ok((public.quote_order('indie', 'LAUNCH10') ->> 'reason') = 'exhausted', '9. reactivated with max_uses 2 and uses 2 -> exhausted');
select public.admin_set_promo_code('LAUNCH10', '{"max_uses": null}');
select t.ok((public.quote_order('indie', 'LAUNCH10') ->> 'ok')::bool, '9. max_uses cleared to null -> ok again');
select t.ok((select percent_off from public.admin_list_promo_codes() where code = 'LAUNCH10') = 10, '9. a patch leaves the keys it does not name alone');
rollback;

\echo
\echo SECTION 20 CHECKS PASSED
