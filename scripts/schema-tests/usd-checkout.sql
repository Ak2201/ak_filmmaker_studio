-- ============================================================
-- SECTION 55 CHECKS — charging in US dollars
-- ------------------------------------------------------------
-- Runs after §56's checks and §56's load. Own people (…55xx). Rupee
-- prices are §52's (599 / 799 / 999); the dollar prices are set here
-- through the console function, as the owner would.
--
--   closed    USD refused while usd_checkout is off; INR exactly as before
--   console   owner-only prices and switch, audited, the $1.00 floor
--   quote     dollars from plan_prices, promo codes in both currencies
--   order     currency recorded, Razorpay's currency checked, the card's origin
--   credit    an upgrade across currencies, at the plan's own price ratio
--   referral  a dollar order earns its referrer nothing
--   refund    refunds and their e-mail in the payment's currency
--   reads     overview per currency, ledger, Customer 360
-- ============================================================
\set ON_ERROR_STOP on

/* 'sqlstate:hint' of the error p_sql raises, or 'none'. */
create or replace function t.err55(p_sql text) returns text language plpgsql as $$
declare st text; hn text;
begin
  execute p_sql;
  return 'none';
exception when others then
  get stacked diagnostics st = returned_sqlstate, hn = pg_exception_hint;
  return st || ':' || coalesce(hn, '');
end $$;
grant execute on function t.err55(text) to anon, authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000005501', 'u55-buyer@example.com',    now(), '{"full_name":"Dollar Buyer"}'),
  ('00000000-0000-4000-8000-000000005502', 'u55-friend@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000005503', 'u55-rupee@example.com',    now(), '{}'),
  ('00000000-0000-4000-8000-000000005504', 'u55-old@example.com',      now(), '{}'),
  ('00000000-0000-4000-8000-000000005510', 'u55-owner@example.com',    now(), '{}'),
  ('00000000-0000-4000-8000-000000005511', 'u55-finance@example.com',  now(), '{}');
insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-000000005510', 'admin'), ('00000000-0000-4000-8000-000000005511', 'admin')
  on conflict (user_id) do update set role = 'admin', disabled_at = null;
-- no admin_roles row reads as owner (§45); the second is finance only
insert into public.admin_roles (user_id, role) values ('00000000-0000-4000-8000-000000005511', 'finance')
  on conflict (user_id) do update set role = 'finance';

-- ============================================================
-- the shape: one quote_for, one create_pending_payment, two quote_orders
-- ============================================================
select t.ok((select count(*) from pg_proc where proname = 'quote_for') = 1
            and pg_get_function_identity_arguments('public.quote_for'::regproc) = 'p_user uuid, p_plan text, p_code text, p_account uuid, p_currency text',
  'quote_for is one function, with the currency last');
select t.ok((select count(*) from pg_proc where proname = 'create_pending_payment') = 1
            and pg_get_function_identity_arguments('public.create_pending_payment'::regproc) like '%p_currency text',
  'create_pending_payment is one function, with the currency last');
select t.ok((select count(*) from pg_proc where proname = 'quote_order') = 2, 'quote_order: the 2-argument form and the 3-argument overload');
select t.ok((select usd_checkout from public.billing_settings where id) = false, 'usd_checkout starts OFF');

-- ============================================================
-- closed: nothing changes while the switch is off
-- ============================================================
begin;
set local role anon;
select t.ok(public.price_notice() ? 'plans', 'price_notice() with no argument still answers anon');
select t.ok(public.price_notice('USD') ->> 'charged_currency' = 'INR'
            and jsonb_typeof(public.price_notice('USD') -> 'usd_checkout') = 'boolean'
            and (public.price_notice('USD') ->> 'usd_checkout')::boolean = false,
  'price_notice(USD): charged in INR, and usd_checkout is a boolean false');
select t.ok((public.price_notice('USD') -> 'plans' -> 0) ? 'price_paise'
            and (public.price_notice('USD') -> 'plans' -> 0) ? 'display_minor',
  'price_notice(USD) keeps the rupee keys beside the dollar ones');
select t.ok(t.err55($$select public.quote_order('starter', null, 'USD')$$) = '22023:currency_closed',
  'quote_order(…, USD) is refused while closed (hint currency_closed)');
select t.ok(t.err55($$select public.quote_order('starter', null, 'EUR')$$) = '22023:currency',
  'a currency other than INR/USD is refused (hint currency)');
select t.ok(public.quote_order('starter', null, 'INR') ->> 'currency' = 'INR'
            and (public.quote_order('starter', null, 'INR') ->> 'amount_minor')::int = 59900
            and (public.quote_order('starter', null) ->> 'amount_paise')::int = 59900,
  'INR quotes as before, in both forms, with _minor mirrors');
reset role;
rollback;

begin;
select t.service();
select t.ok(t.err55($$select * from public.create_pending_payment('00000000-0000-4000-8000-000000005504', 'starter', 'year', null, null, 'USD')$$) = '22023:currency_closed',
  'create_pending_payment(…, USD) is refused while closed');
-- what the deployed rzp-order sends today: five NAMED arguments
select t.ok((select currency = 'INR' and amount_paise = 59900
               from public.create_pending_payment(p_user => '00000000-0000-4000-8000-000000005504', p_plan => 'starter',
                                                  p_period => 'year', p_account => null, p_code => null)),
  'the old rzp-order''s five named arguments still resolve, and price in INR');
rollback;
select t.reset();

-- ============================================================
-- console: the owner sets dollar prices and turns the switch on
-- ============================================================
begin;
select t.claims('00000000-0000-4000-8000-000000005511');
select t.ok(t.err55($$select public.admin_set_plan_price('starter', 'USD', 2400)$$) like '42501:%',
  'a finance administrator cannot set a dollar price (owner only)');
select t.ok(t.err55($$select public.admin_set_usd_checkout(true)$$) like '42501:%',
  'nor turn on dollar checkout');
rollback;
select t.reset();

select set_config('t.aud55', (select count(*)::text from public.admin_audit where action = 'set_plan_price' and target_id = 'starter:USD'), false);
begin;
select t.claims('00000000-0000-4000-8000-000000005510');
select t.ok(t.err55($$select public.admin_set_plan_price('starter', 'USD', 50)$$) like '22023:%',
  'a dollar price of 1–99 cents is refused (the smallest charge is $1.00)');
select t.ok(t.err55($$select public.admin_set_plan_price('starter', 'INR', 49900)$$) like '22023:%',
  'INR is still refused here (rupees keep their two authors)');
select t.ok((select (x -> 'plans') @> '[{"id":"starter","display_minor":2400,"display_currency":"USD"}]'
               from public.admin_set_plan_price('starter', 'USD', 2400) x),
  'the owner sets Basic to $24.00 and price_notice(USD) shows it');
select public.admin_set_plan_price('indie', 'USD', 3200);
select public.admin_set_plan_price('pro',   'USD', 0);
select t.ok((public.price_notice('USD') -> 'plans') @> '[{"id":"pro","display_currency":"INR","display_minor":99900}]',
  'a dollar price of 0 means "not sold in dollars": the card falls back to rupees, never "$0"');
select t.ok(t.err55($$select public.admin_set_usd_checkout(true)$$) like '22023:%',
  'dollar checkout cannot go on while a plan on sale has no dollar price');
select public.admin_set_plan_price('pro', 'USD', 4400);
select t.ok((select x ->> 'charged_currency' = 'USD' and (x ->> 'usd_checkout')::boolean
               from public.admin_set_usd_checkout(true) x),
  'with every plan priced, the owner turns it on: price_notice(USD) now says charged in USD');
select t.ok(t.err55($$select public.admin_set_plan_price('pro', 'USD', 0)$$) like '22023:%',
  'while it is on, a plan on sale cannot be made "not sold in dollars"');
commit;
select t.reset();
select t.ok((select count(*) from public.admin_audit where action = 'set_plan_price' and target_id = 'starter:USD')
              = current_setting('t.aud55')::int + 1,
  'the dollar price change is in the audit log (one row; the refused ones wrote none)');
select t.ok(exists (select 1 from public.admin_audit where action = 'set_usd_checkout' and (after ->> 'usd_checkout')::boolean),
  'turning dollar checkout on is audited');

begin;
set local role anon;
select t.ok(public.price_notice('INR') ->> 'charged_currency' = 'INR', 'asked for rupees, the answer is still charged in INR');
reset role;
rollback;

-- ============================================================
-- quote: dollars from plan_prices; codes in both currencies
-- ============================================================
insert into public.promo_codes (code, percent_off, note)      values ('U55-TWENTY', 20, 'percent');
insert into public.promo_codes (code, amount_off_paise, note) values ('U55-HUNDRED', 10000, 'rupees off');
begin;
select t.claims('00000000-0000-4000-8000-000000005504');
select t.ok((select x ->> 'currency' = 'USD' and (x ->> 'amount_minor')::int = 2400 and (x ->> 'amount_paise')::int = 2400
                    and (x ->> 'list_minor')::int = 2400 and (x ->> 'due_minor')::int = 2400
               from public.quote_order('starter', null, 'USD') x),
  'Basic quotes $24.00 in dollars, the _paise keys carrying the same minor units');
select t.ok((public.quote_order('starter', 'U55-TWENTY', 'USD') ->> 'amount_minor')::int = 1920,
  'a percentage code works in dollars ($24.00 less 20% = $19.20)');
select t.ok((select x ->> 'ok' = 'false' and x ->> 'reason' = 'currency'
                    and x ->> 'sentence' = 'This code takes a rupee amount off, so it works only when you pay in rupees.'
               from public.quote_order('starter', 'U55-HUNDRED', 'USD') x),
  'a rupee-amount code on a dollar order is refused (reason currency), never read as cents');
select t.ok((public.quote_order('starter', 'U55-HUNDRED', 'INR') ->> 'amount_minor')::int = 49900,
  'the same code still takes ₹100 off a rupee order');
select t.ok(public.quote_order('starter', null) ->> 'currency' = 'INR', 'the 2-argument quote_order stays rupees with dollars on');
rollback;
select t.reset();

-- ============================================================
-- order: recorded in USD; Razorpay's currency must match; the card's origin
-- ============================================================
begin;
select t.service();
select t.ok((select currency = 'USD' and amount_paise = 2400 and list_paise = 2400
               from public.create_pending_payment('00000000-0000-4000-8000-000000005501', 'starter', 'year', null, null, 'USD')),
  'create_pending_payment(…, USD) answers USD and the dollar amount');
commit;
select t.reset();
select t.ok((select currency = 'USD' and amount_paise = 2400 from public.payments
              where user_id = '00000000-0000-4000-8000-000000005501' and status = 'created'),
  'the payments row is in USD, 2400 cents');
begin;
select t.service();
select public.attach_razorpay_order((select id from public.payments where user_id = '00000000-0000-4000-8000-000000005501' and status = 'created'), 'order_55a1');
select t.ok(t.err55($$select public.activate_payment('order_55a1', 'pay_55a1', '{"payment":{"amount":2400,"currency":"INR"}}'::jsonb)$$) like '22023:%',
  'activate_payment refuses a payment Razorpay reports in another currency');
select t.ok(t.err55($$select public.activate_payment('order_55a1', 'pay_55a1', '{"payment":{"amount":240000,"currency":"USD"}}'::jsonb)$$) like '22023:%',
  'and one for another amount');
select public.activate_payment('order_55a1', 'pay_55a1',
  '{"source":"verify","payment":{"amount":2400,"currency":"USD","international":true,"card":{"country":"us"}}}'::jsonb);
commit;
select t.reset();
select t.ok((select status = 'paid' and international is true and card_country = 'US' and plan_applied
               from public.payments where razorpay_order_id = 'order_55a1'),
  'activated: paid, an international card from US recorded, the plan applied');
select t.ok(public.user_plan('00000000-0000-4000-8000-000000005501') = 'starter'
            and (select round((extract(epoch from (plan_until - now())) / 86400)::numeric) from public.accounts
                  where owner_id = '00000000-0000-4000-8000-000000005501') = 365,
  'access is blind to currency: a dollar Basic is a 365-day Basic');
select t.ok((select i.currency = 'USD' and i.amount_paise = 2400 from public.invoices i
               join public.payments p on p.id = i.payment_id where p.razorpay_order_id = 'order_55a1'),
  'the invoice is issued in USD, 2400 cents');
begin;
select t.service();
select public.activate_payment('order_55a1', 'pay_55a1', '{"payment":{"amount":2400,"currency":"USD","international":false}}'::jsonb);
commit;
select t.reset();
select t.ok((select international from public.payments where razorpay_order_id = 'order_55a1') is true,
  'a later activation (the webhook) never overwrites the card''s origin, it only fills a blank');

begin;
select t.claims('00000000-0000-4000-8000-000000005510');
select t.ok((select (x -> 'paid_by_currency' -> 'USD' ->> 'count')::int >= 1 and (x -> 'paid_by_currency' -> 'USD' ->> 'total_minor')::bigint >= 2400
               from public.admin_billing_overview() x),
  'admin_billing_overview counts the dollar sale under USD');
rollback;
select t.reset();

-- a rupee order on a foreign card: recorded, not blocked, not re-priced
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005503', 'starter', 'year')), 'order_55c1');
select public.activate_payment('order_55c1', 'pay_55c1', '{"payment":{"amount":59900,"currency":"INR","international":true,"card":{"country":"GB"}}}'::jsonb);
commit;
select t.reset();
select t.ok((select status = 'paid' and currency = 'INR' and amount_paise = 59900 and international and card_country = 'GB'
               from public.payments where razorpay_order_id = 'order_55c1'),
  'an international card paying rupees is recorded (Intl, GB) and charged the rupee price');

-- ============================================================
-- credit: an upgrade across currencies, at the plan's own price ratio
-- ============================================================
begin;
select t.claims('00000000-0000-4000-8000-000000005501');
select t.ok(abs((public.quote_order('pro', null, 'USD') ->> 'credit_minor')::int - 2400) <= 2
            and abs((public.quote_order('pro', null, 'USD') ->> 'amount_minor')::int - 2000) <= 2,
  'Pro in dollars after a fresh dollar Basic: $24.00 credited, about $20.00 due');
select t.ok(abs((public.quote_order('pro', null, 'INR') ->> 'credit_paise')::int - 59900) <= 30,
  'Pro in rupees after a dollar Basic: credited at Basic''s own ratio (≈ ₹599, the rupee Basic), no exchange rate');
rollback;
select t.reset();
begin;
select t.claims('00000000-0000-4000-8000-000000005503');
select t.ok(abs((public.quote_order('indie', null, 'USD') ->> 'credit_minor')::int - 2400) <= 2,
  'Intermediate in dollars after a rupee Basic: credited ≈ $24.00 (Basic''s dollar price), not ₹599 read as cents');
rollback;
select t.reset();

-- ============================================================
-- referral: a dollar order earns its referrer nothing; a rupee one does
-- ============================================================
begin;
select t.service();
select set_config('t.ref55', public.ensure_referral_code('00000000-0000-4000-8000-000000005501'), false);
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005502', 'starter', 'year', null, current_setting('t.ref55'), 'USD')), 'order_55b1');
select public.activate_payment('order_55b1', 'pay_55b1', '{"payment":{"amount":2160,"currency":"USD"}}'::jsonb);
commit;
select t.reset();
select t.ok((select amount_paise from public.payments where razorpay_order_id = 'order_55b1') = 2400 - (2400 * (select coalesce(referral_friend_pct, 10) from public.billing_settings where id)) / 100,
  'the friend''s percentage off works in dollars');
select t.ok(not exists (select 1 from public.referral_credits r join public.payments p on p.id = r.payment_id where p.razorpay_order_id = 'order_55b1'),
  'and the referrer is credited nothing for a dollar order');
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005504', 'starter', 'year', null, current_setting('t.ref55'))), 'order_55d1');
select public.activate_payment('order_55d1', 'pay_55d1');
commit;
select t.reset();
select t.ok(exists (select 1 from public.referral_credits r join public.payments p on p.id = r.payment_id where p.razorpay_order_id = 'order_55d1'),
  'while the same code on a rupee order still credits its referrer');

-- ============================================================
-- refund: in the payment's currency, and its e-mail says so
-- ============================================================
begin;
select t.service();
select t.ok((select x ->> 'currency' = 'USD' and (x ->> 'amount_minor')::int = 2400 and (x ->> 'amount_paise')::int = 2400
               from public.begin_refund((select id from public.payments where razorpay_order_id = 'order_55a1'), null, 'test', '00000000-0000-4000-8000-000000005510') x),
  'begin_refund on a dollar payment answers USD, the whole 2400 cents');
select public.record_refund((select r.id from public.refunds r join public.payments p on p.id = r.payment_id where p.razorpay_order_id = 'order_55a1'),
                            'pay_55a1', 'rfnd_55a1', 'processed', 2400);
commit;
select t.reset();
select t.ok((select r.currency = 'USD' from public.refunds r where r.razorpay_refund_id = 'rfnd_55a1'), 'the refunds row is in USD');
select t.ok((select status = 'refunded' from public.payments where razorpay_order_id = 'order_55a1'), 'and the payment reads refunded');
begin;
select t.service();
select t.ok((select currency = 'USD' and amount_paise = 2400 from public.claim_refund_email('rfnd_55a1', 'processed')),
  'claim_refund_email names the currency, so the mail prints dollars');
rollback;
select t.reset();
-- a refund made in the Razorpay dashboard on the friend's dollar payment
begin;
select t.service();
select public.record_refund(null, 'pay_55b1', 'rfnd_55b1', 'processed', 500);
commit;
select t.reset();
select t.ok((select currency = 'USD' and reason = 'Made in the Razorpay dashboard' from public.refunds where razorpay_refund_id = 'rfnd_55b1'),
  'a dashboard refund is stamped with its payment''s currency');
insert into public.refunds (payment_id, amount_paise, currency, reason)
values ((select id from public.payments where razorpay_order_id = 'order_55b1'), 1, 'INR', 'stamp test');
select t.ok((select currency from public.refunds where reason = 'stamp test') = 'USD',
  'no writer can file a refund in a currency other than its payment''s');
delete from public.refunds where reason = 'stamp test';

-- ============================================================
-- reads: the console never adds cents to paise
-- ============================================================
-- (the expected sums are read as the database owner: RLS shows an admin only their own payments)
select set_config('t.usd55', (select coalesce(sum(amount_paise), 0)::text from public.payments where status = 'paid' and currency = 'USD'), false);
select set_config('t.inr55', (select coalesce(sum(amount_paise), 0)::text from public.payments where status = 'paid' and currency = 'INR'), false);
begin;
select t.claims('00000000-0000-4000-8000-000000005510');
select t.ok((select (x -> 'paid_by_currency' -> 'USD' ->> 'total_minor')::bigint = current_setting('t.usd55')::bigint
                    and (x ->> 'paid_total_paise')::bigint = current_setting('t.inr55')::bigint
                    and (x -> 'paid_by_currency' -> 'INR' ->> 'total_minor')::bigint = (x ->> 'paid_total_paise')::bigint
               from public.admin_billing_overview() x),
  'admin_billing_overview: paid_total_paise is rupees only; dollars are counted in paid_by_currency');
select t.ok((select currency = 'INR' and international and card_country = 'GB' from public.admin_list_payments(1000) where razorpay_order_id = 'order_55c1'),
  'admin_list_payments carries currency, international and card_country');
select t.ok((public.admin_customer('00000000-0000-4000-8000-000000005503') -> 'payments' -> 0 ->> 'international')::boolean
            and (public.admin_customer('00000000-0000-4000-8000-000000005501') -> 'refunds' -> 0 ->> 'currency') = 'USD',
  'Customer 360: each payment says whether the card was international, each refund its currency');
rollback;
select t.reset();

-- ============================================================
-- and off again
-- ============================================================
begin;
select t.claims('00000000-0000-4000-8000-000000005510');
select t.ok((public.admin_set_usd_checkout(false) ->> 'charged_currency') = 'INR', 'turned off: charged in INR again');
select t.ok(t.err55($$select public.quote_order('starter', null, 'USD')$$) = '22023:currency_closed', 'and a dollar quote is refused again');
commit;
select t.reset();

-- ============================================================
-- review fixes: the money reads that still mixed currencies
-- ============================================================
select t.ok(pg_get_function_result('public.admin_affiliate_report'::regproc) like '%usd_revenue_minor bigint%usd_commission_due_minor bigint%',
  'admin_affiliate_report has a dollar side of its own');
select t.ok(pg_get_function_result('public.admin_affiliate_orders'::regproc) like '%currency text%',
  'admin_affiliate_orders names each order''s currency');
select t.ok(pg_get_function_result('public.admin_list_refund_requests'::regproc) like '%currency text%',
  'admin_list_refund_requests names each payment''s currency');
begin;
select t.claims('00000000-0000-4000-8000-000000005503');
select t.ok((public.my_refund_status() -> 'payment' ->> 'currency') = 'INR',
  'my_refund_status: the payment carries its currency');
rollback;
select t.reset();
-- a dollar year still running keeps its plan's dollar price (the credit ratio needs it)
begin;
insert into public.payments (user_id, plan_id, period, amount_paise, currency, status, paid_at, starts_at, ends_at)
values ('00000000-0000-4000-8000-000000005504', 'pro', 'year', 3900, 'USD', 'paid', now(), now(), now() + interval '1 year');
select t.claims('00000000-0000-4000-8000-000000005510');
select t.ok(t.err55($$select public.admin_set_plan_price('pro', 'USD', 0)$$) = '22023:usd_years',
  'a plan with dollar years running cannot be withdrawn from dollars');
rollback;
select t.reset();
