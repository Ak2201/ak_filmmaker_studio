-- ============================================================
-- SECTION 62 CHECKS — auto-renew (Razorpay Subscriptions)
-- ------------------------------------------------------------
-- Runs after §62 loads (twice). Own people (…62xx); A (…00a) is the owner
-- administrator. Everything this file changes in billing_settings and the
-- plan prices is put back at the end.
--
--   once      the default: modes 'once', every subscription path refused renew_off
--   console   owner/finance set the modes, audited; support, members, anon cannot
--   pass      first charge 7 days, renewal stacks to 14, the same payment twice
--             is applied once, a wrong amount is refused, a refund removes only
--             its own charge's days and does not cancel
--   cancel    access to current_end, nothing applied after 'cancelled'
--   halted    nothing added
--   cap/date  a cap and a deadline close the pass to NEW subscribers only
--   year      365 + 365; founding seats count a year, never a pass
--   lock      a console price change leaves a running subscription's amount
--   refusals  subscribed, used, upgrade, downgrade
--   kept out  refund -> trial and referral payouts still skip a pass
--   RLS       a member reads only their own subscription; no client writes
-- ============================================================
\set ON_ERROR_STOP on

create or replace function t.err62(p_sql text) returns text language plpgsql as $$
declare st text; hn text;
begin
  execute p_sql;
  return 'none';
exception when others then
  get stacked diagnostics st = returned_sqlstate, hn = pg_exception_hint;
  return st || ':' || coalesce(hn, '');
end $$;
grant execute on function t.err62(text) to anon, authenticated, service_role;

/* As the payment service: sign p_user up to p_product and store Razorpay's
   subscription id. Returns the row id. */
create or replace function t.sub62(p_user uuid, p_product text, p_rzp text) returns uuid language plpgsql as $$
declare j jsonb;
begin
  j := public.create_pending_subscription(p_user, p_product);
  perform public.set_subscription_rzp_ids((j ->> 'subscription_row_id')::uuid, p_rzp, 'plan_' || p_rzp);
  return (j ->> 'subscription_row_id')::uuid;
end $$;
create or replace function t.charge62(p_rzp text, p_pay text, p_amount int) returns jsonb language plpgsql as $$
begin
  return public.apply_subscription_charge(p_rzp, p_pay, p_amount, 'INR', now(),
    jsonb_build_object('event', 'subscription.charged', 'payment', jsonb_build_object('id', p_pay, 'amount', p_amount, 'currency', 'INR')));
end $$;
create or replace function t.until62(p_user uuid) returns timestamptz language sql as $$
  select plan_until from public.accounts where owner_id = p_user order by plan_until desc nulls last limit 1;
$$;
create or replace function t.days62(p_user uuid) returns numeric language sql as $$
  select round(extract(epoch from (t.until62(p_user) - now())) / 86400);
$$;
grant execute on all functions in schema t to anon, authenticated, service_role;

select set_config('t.pr62', coalesce((select purchase_required from public.billing_settings where id), false)::text, false);
select set_config('t.pe62', coalesce((select pass_enabled from public.billing_settings where id), false)::text, false);
update public.billing_settings
   set purchase_required = true, pass_enabled = true, pass_paise = 4900, pass_days = 7, pass_plan = 'pro',
       pass_ends_at = now() + interval '7 days', pass_cap = null
 where id;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000006201', 'ar-pass@example.com',     now(), '{"full_name":"Renew Pass"}'),
  ('00000000-0000-4000-8000-000000006202', 'ar-halt@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000006203', 'ar-late@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000006204', 'ar-year@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000006205', 'ar-lock@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000006206', 'ar-new@example.com',      now(), '{}'),
  ('00000000-0000-4000-8000-000000006207', 'ar-upgrade@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000006208', 'ar-down@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000006209', 'ar-refund@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000006210', 'ar-once@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000006220', 'ar-finance@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000006221', 'ar-support@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000006222', 'ar-member@example.com',   now(), '{}');
insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-000000006220', 'admin'), ('00000000-0000-4000-8000-000000006221', 'admin'),
  ('00000000-0000-4000-8000-000000006222', 'user')
  on conflict (user_id) do update set role = excluded.role, disabled_at = null;
insert into public.admin_roles (user_id, role) values
  ('00000000-0000-4000-8000-000000006220', 'finance'), ('00000000-0000-4000-8000-000000006221', 'support')
  on conflict (user_id) do update set role = excluded.role;

-- ============================================================
-- once: the default, today's behaviour
-- ============================================================
select t.ok((select pass_mode = 'once' and plan_mode = 'once' from public.billing_settings where id),
  '62. billing_settings: pass_mode and plan_mode default to once');
select t.ok(t.err62($$update public.billing_settings set pass_mode = 'monthly' where id$$) like '23514:%'
            and t.err62($$update public.billing_settings set plan_mode = '' where id$$) like '23514:%',
  '62. a mode other than once / renew is refused by the CHECK');
begin;
set local role anon;
select t.ok(public.trial_offer() -> 'pass' ->> 'mode' = 'once' and public.trial_offer() ->> 'plan_mode' = 'once'
            and public.price_notice('INR') -> 'pass' ->> 'mode' = 'once' and public.price_notice('INR') ->> 'plan_mode' = 'once',
  '62. once: anon reads pass.mode once and plan_mode once in trial_offer and price_notice');
select t.ok(public.trial_offer() ? 'trial_scope' and public.trial_offer() -> 'pass' ? 'open' and public.price_notice('INR') ? 'plans',
  '62. trial_offer and price_notice keep every key they had');
reset role;
rollback;
begin;
select t.service();
select t.ok(t.err62($$select public.create_pending_subscription('00000000-0000-4000-8000-000000006201', 'pass')$$) = '22023:renew_off'
            and t.err62($$select public.create_pending_subscription('00000000-0000-4000-8000-000000006201', 'starter')$$) = '22023:renew_off',
  '62. once: a pass subscription and a yearly subscription are refused (hint renew_off)');
select t.ok((select c.amount_paise = 4900 from public.create_pending_payment('00000000-0000-4000-8000-000000006201', 'pro', 'pass') c),
  '62. once: the one-time pass order works exactly as §61');
rollback;
begin;
select t.claims('00000000-0000-4000-8000-000000006201');
select t.ok((select b ? 'autopay' and b -> 'autopay' = 'null'::jsonb and b ? 'pass_used' and b ? 'entitled' from public.billing_status() b),
  '62. billing_status keeps its keys and gains autopay (null with no subscription)');
select t.reset();
rollback;

-- ============================================================
-- console
-- ============================================================
begin;
set local role anon;
select t.ok(t.err62($$select public.admin_set_billing_modes('renew', 'renew')$$) = '42501:'
            and t.err62($$select public.admin_billing_modes()$$) = '42501:'
            and t.err62($$select public.admin_list_subscriptions()$$) = '42501:'
            and t.err62($$select public.admin_cancel_subscription(gen_random_uuid())$$) = '42501:'
            and t.err62($$select public.request_cancel_subscription()$$) = '42501:',
  '62. anon cannot call the console RPCs or request_cancel_subscription (42501)');
reset role;
rollback;
begin;
select t.claims('00000000-0000-4000-8000-000000006222');
select t.ok(t.err62($$select public.admin_set_billing_modes('renew', 'renew')$$) like '42501:%'
            and t.err62($$select public.admin_list_subscriptions()$$) like '42501:%'
            and t.err62($$select public.admin_cancel_subscription(gen_random_uuid())$$) like '42501:%',
  '62. a member cannot (42501)');
select t.claims('00000000-0000-4000-8000-000000006221');
select t.ok(t.err62($$select public.admin_set_billing_modes('renew', 'renew')$$) like '42501:%'
            and t.err62($$select public.admin_billing_modes()$$) like '42501:%',
  '62. a support administrator cannot (it needs finance or owner)');
select t.reset();
rollback;
select set_config('t.aud62', (select count(*)::text from public.admin_audit where action = 'set_billing_modes'), false);
begin;
select t.claims('00000000-0000-4000-8000-000000006220');
select t.ok(t.err62($$select public.admin_set_billing_modes('weekly', null)$$) like '22023:%', '62. console: an unknown mode is refused');
select t.ok(public.admin_set_billing_modes('renew', 'renew') = '{"pass_mode":"renew","plan_mode":"renew"}'::jsonb,
  '62. a finance administrator sets both modes to renew');
select t.ok(public.admin_set_billing_modes(null, null) = '{"pass_mode":"renew","plan_mode":"renew"}'::jsonb
            and public.admin_billing_modes() = '{"pass_mode":"renew","plan_mode":"renew"}'::jsonb,
  '62. a null mode keeps what is there; admin_billing_modes reads it');
commit;
select t.reset();
select t.ok((select count(*) from public.admin_audit where action = 'set_billing_modes') = current_setting('t.aud62')::int + 1,
  '62. the change is audited once (the no-op and the refusal wrote nothing)');
begin;
set local role anon;
select t.ok(public.trial_offer() -> 'pass' ->> 'mode' = 'renew' and public.price_notice('INR') ->> 'plan_mode' = 'renew',
  '62. renew: the public reads say so');
reset role;
rollback;

-- ============================================================
-- a renewing pass
-- ============================================================
select set_config('t.sold62', public.pass_sold()::text, false);
select set_config('t.pb62', public.paid_buyers()::text, false);
begin;
select t.service();
select t.ok((select j ->> 'product' = 'pass' and j ->> 'period' = 'pass' and (j ->> 'days')::int = 7
                    and (j ->> 'amount_minor')::int = 4900 and j ->> 'currency' = 'INR' and j ->> 'plan_key' = 'pass:pass:7:4900:INR'
                    and j ? 'subscription_row_id'
               from public.create_pending_subscription('00000000-0000-4000-8000-000000006201', 'pass') j),
  '62. a pass subscription is priced by the server: 4900 INR every 7 days (plan_key pass:pass:7:4900:INR)');
rollback;
begin;
select t.service();
select t.sub62('00000000-0000-4000-8000-000000006201', 'pass', 'sub_62a');
select t.ok(t.err62($$select public.create_pending_subscription('00000000-0000-4000-8000-000000006201', 'pass')$$) = '22023:subscribed'
            and t.err62($$select public.create_pending_subscription('00000000-0000-4000-8000-000000006201', 'pro')$$) = '22023:subscribed',
  '62. a second live subscription is refused (hint subscribed), whatever the product');
select t.ok(t.err62($$select public.set_subscription_rzp_ids((select id from public.subscriptions where rzp_subscription_id = 'sub_62a'), 'sub_other', null)$$) like '22023:%',
  '62. a row that has a Razorpay id cannot be repointed');
commit;
select t.reset();
begin;
select t.claims('00000000-0000-4000-8000-000000006201');
select t.ok((public.billing_status() -> 'autopay') = 'null'::jsonb, '62. a checkout not yet completed shows no autopay');
select t.reset();
rollback;

begin;
select t.service();
select t.ok((select (j ->> 'applied')::boolean and not (j ->> 'already')::boolean and not (j ->> 'renewal')::boolean
               from t.charge62('sub_62a', 'pay_62a1', 4900) j),
  '62. the first charge is applied (not a renewal)');
commit;
select t.reset();
select t.ok(public.user_plan('00000000-0000-4000-8000-000000006201') = 'pro' and t.days62('00000000-0000-4000-8000-000000006201') = 7
            and (select plan_period = 'pass' from public.accounts where owner_id = '00000000-0000-4000-8000-000000006201'),
  '62. first pass charge: Pro for 7 days, plan_period pass');
select t.ok((select status = 'paid' and period = 'pass' and plan_applied and razorpay_order_id is null and subscription_id is not null
                    and razorpay_subscription_id = 'sub_62a' and not is_renewal
                    and round(extract(epoch from (ends_at - starts_at)) / 86400) = 7
               from public.payments where razorpay_payment_id = 'pay_62a1'),
  '62. the charge is its own paid payments row: period pass, no order id, the subscription named, 7 days');
select t.ok((select period = 'pass' and round(extract(epoch from (valid_until - valid_from)) / 86400) = 7
               from public.invoices where razorpay_payment_id = 'pay_62a1'),
  '62. the existing trigger issued its invoice (period pass, 7 days)');
select t.ok((select status = 'active' and round(extract(epoch from (current_end - now())) / 86400) = 7
               from public.subscriptions where rzp_subscription_id = 'sub_62a'),
  '62. the subscription is active and its current_end is the end of the paid week');
select t.ok(exists (select 1 from public.studio_members where user_id = '00000000-0000-4000-8000-000000006201' and disabled_at is null),
  '62. the subscriber is a member');
select t.ok(public.pass_sold() = current_setting('t.sold62')::int + 1, '62. the first charge counts toward pass_sold() (the cap)');
begin;
select t.claims('00000000-0000-4000-8000-000000006201');
select t.ok((select a ->> 'status' = 'active' and a ->> 'product' = 'pass' and a ->> 'period' = 'pass'
                    and (a ->> 'amount_minor')::int = 4900 and a ->> 'currency' = 'INR'
                    and (a ->> 'next_charge_at')::timestamptz = (a ->> 'current_end')::timestamptz
                    and not (a ->> 'cancel_at_period_end')::boolean
               from (select public.billing_status() -> 'autopay' a) x),
  '62. billing_status.autopay: active, pass, 4900 INR, next_charge_at = current_end, not cancelling');
select t.ok((select count(*) = 1 from public.subscriptions), '62. RLS: a member reads exactly their own subscription');
select t.reset();
rollback;

-- the same payment twice
begin;
select t.service();
select t.ok((select (j ->> 'already')::boolean from t.charge62('sub_62a', 'pay_62a1', 4900) j),
  '62. the same payment delivered again answers already');
commit;
select t.reset();
select t.ok((select count(*) = 1 from public.payments where razorpay_payment_id = 'pay_62a1') and t.days62('00000000-0000-4000-8000-000000006201') = 7,
  '62. ... and is applied once (one row, still 7 days)');

-- the receipt claim
begin;
select t.service();
select t.ok((select (j ->> 'renews')::boolean and (j ->> 'renew_minor')::int = 4900 and j ->> 'renew_currency' = 'INR'
                    and (j ->> 'every_days')::int = 7 and j ->> 'sub_period' = 'pass' and j ? 'number' and j ? 'buyer_email'
                    and (j ->> 'renews_at')::timestamptz > now()
               from public.claim_charge_receipt_email('pay_62a1') j),
  '62. claim_charge_receipt_email: the invoice plus renews, renews_at, 4900 INR every 7 days');
select t.ok(public.claim_charge_receipt_email('pay_62a1') is null, '62. ... claimed once');
rollback;

-- the wrong amount
begin;
select t.service();
select t.ok(t.err62($$select t.charge62('sub_62a', 'pay_62ax', 9900)$$) = '22023:amount'
            and t.err62($$select public.apply_subscription_charge('sub_62a', 'pay_62ay', 4900, 'USD', now(), null)$$) = '22023:amount',
  '62. a charge for another amount or currency is refused (hint amount)');
select t.ok(t.err62($$select t.charge62('sub_nope', 'pay_62az', 4900)$$) like '22023:%', '62. an unknown subscription is refused');
rollback;

-- the renewal stacks
begin;
select t.service();
select t.ok((select (j ->> 'applied')::boolean and (j ->> 'renewal')::boolean from t.charge62('sub_62a', 'pay_62a2', 4900) j),
  '62. the renewal is applied, as a renewal');
commit;
select t.reset();
select t.ok(t.days62('00000000-0000-4000-8000-000000006201') = 14
            and (select round(extract(epoch from (current_end - now())) / 86400) = 14 from public.subscriptions where rzp_subscription_id = 'sub_62a'),
  '62. a renewing pass stacks: 7 + 7 = 14 days, current_end with it');
select t.ok((select is_renewal and round(extract(epoch from (ends_at - starts_at)) / 86400) = 7 from public.payments where razorpay_payment_id = 'pay_62a2'),
  '62. the renewal row carries its own 7 days');
select t.ok(public.pass_sold() = current_setting('t.sold62')::int + 1, '62. a renewal does not count toward pass_sold()');
select t.ok(public.paid_buyers() = current_setting('t.pb62')::int, '62. pass charges take no founding seat');

-- refund one charge
begin;
select t.service();
select public.mark_payment_refunded('pay_62a2');
commit;
select t.reset();
select t.ok(t.days62('00000000-0000-4000-8000-000000006201') = 7
            and (select status = 'active' and not cancel_at_period_end from public.subscriptions where rzp_subscription_id = 'sub_62a'),
  '62. refunding the renewal removes only its 7 days, and the subscription keeps running');
select t.ok(not exists (select 1 from public.referral_credits r join public.payments p on p.id = r.payment_id where p.subscription_id is not null),
  '62. no subscription charge earned a referral payout');

-- cancel
begin;
select t.claims('00000000-0000-4000-8000-000000006201');
select t.ok((select j ->> 'rzp_subscription_id' = 'sub_62a' and (j ->> 'current_end')::timestamptz > now() and not (j ->> 'already')::boolean
               from public.request_cancel_subscription() j),
  '62. request_cancel_subscription: the own live subscription, its current_end');
select t.ok((public.request_cancel_subscription() ->> 'already')::boolean, '62. ... and a second request is idempotent (already)');
select t.ok((select (a ->> 'cancel_at_period_end')::boolean and a -> 'next_charge_at' = 'null'::jsonb
               from (select public.billing_status() -> 'autopay' a) x),
  '62. after a cancel: autopay says cancel_at_period_end, no next charge');
select t.ok(t.err62($$update public.subscriptions set cancel_at_period_end = false$$) like '42501:%',
  '62. RLS: a member cannot write their subscription');
commit;
select t.reset();
select t.ok(t.days62('00000000-0000-4000-8000-000000006201') = 7 and public.user_plan('00000000-0000-4000-8000-000000006201') = 'pro',
  '62. a cancel takes away nothing: still Pro, 7 days left');
begin;
select t.service();
select t.ok((select j ->> 'status' = 'cancelled' from public.mark_subscription_status('sub_62a', 'cancelled', '{"event":"subscription.cancelled"}') j),
  '62. Razorpay''s cancelled is recorded');
select t.ok((select j ->> 'status' = 'cancelled' from public.mark_subscription_status('sub_62a', 'activated', null) j),
  '62. a late activated after cancelled does not revive it');
select t.ok((select not (j ->> 'applied')::boolean and j ->> 'unapplied_reason' = 'cancelled' from t.charge62('sub_62a', 'pay_62a3', 4900) j),
  '62. a charge that arrives after cancelled is not applied');
commit;
select t.reset();
select t.ok(t.days62('00000000-0000-4000-8000-000000006201') = 7
            and (select status = 'paid' and plan_applied is false and unapplied_reason = 'cancelled' from public.payments where razorpay_payment_id = 'pay_62a3'),
  '62. ... it is recorded paid and unapplied (refundable), and access still runs to current_end');
begin;
select t.claims('00000000-0000-4000-8000-000000006201');
select t.ok((select a ->> 'status' = 'cancelled' and (a ->> 'cancel_at_period_end')::boolean from (select public.billing_status() -> 'autopay' a) x),
  '62. a cancelled subscription with paid time left still shows, cancelled');
select t.ok(t.err62($$select public.request_cancel_subscription()$$) = '22023:none', '62. nothing left to cancel (hint none)');
select t.reset();
rollback;
begin;
select t.service();
select t.ok(t.err62($$select public.create_pending_subscription('00000000-0000-4000-8000-000000006201', 'pass')$$) = '22023:used',
  '62. after a pass subscription ends, a second pass is refused (hint used): one pass sign-up per person');
rollback;

-- ============================================================
-- halted, then the cap and the deadline
-- ============================================================
begin;
select t.service();
select t.sub62('00000000-0000-4000-8000-000000006202', 'pass', 'sub_62b');
select t.charge62('sub_62b', 'pay_62b1', 4900);
commit;
select t.reset();
select set_config('t.u62b', t.until62('00000000-0000-4000-8000-000000006202')::text, false);
begin;
select t.service();
select t.ok((select j ->> 'status' = 'halted' from public.mark_subscription_status('sub_62b', 'halted', null) j)
            and (select j ->> 'status' = 'pending' from public.mark_subscription_status('sub_62b', 'pending', null) j),
  '62. pending and halted are recorded');
commit;
select t.reset();
select t.ok(t.until62('00000000-0000-4000-8000-000000006202') = current_setting('t.u62b')::timestamptz,
  '62. halted adds nothing and takes nothing');
update public.billing_settings set pass_cap = public.pass_sold() where id;
begin;
select t.service();
select t.ok(t.err62($$select public.create_pending_subscription('00000000-0000-4000-8000-000000006203', 'pass')$$) = '22023:closed',
  '62. the cap reached: a NEW pass subscription is refused (hint closed)');
select t.ok((select (j ->> 'applied')::boolean from t.charge62('sub_62b', 'pay_62b2', 4900) j),
  '62. ... and an existing one still renews');
commit;
select t.reset();
select t.ok(t.days62('00000000-0000-4000-8000-000000006202') = 14
            and (select status = 'active' from public.subscriptions where rzp_subscription_id = 'sub_62b'),
  '62. the renewal after a halt stacks and the subscription is active again');
update public.billing_settings set pass_cap = null, pass_ends_at = now() - interval '1 minute' where id;
begin;
select t.service();
select t.ok(t.err62($$select public.create_pending_subscription('00000000-0000-4000-8000-000000006203', 'pass')$$) = '22023:closed',
  '62. after the deadline a NEW pass subscription is refused (hint closed)');
select t.ok((select (j ->> 'applied')::boolean from t.charge62('sub_62b', 'pay_62b3', 4900) j),
  '62. ... and an existing one still renews');
commit;
select t.reset();
select t.ok(t.days62('00000000-0000-4000-8000-000000006202') = 21, '62. 7 + 7 + 7 = 21 days');
update public.billing_settings set pass_ends_at = now() + interval '7 days' where id;

-- ============================================================
-- yearly
-- ============================================================
select set_config('t.pb62', public.paid_buyers()::text, false);
select set_config('t.basic62', public.effective_price('starter')::text, false);
begin;
select t.service();
select t.sub62('00000000-0000-4000-8000-000000006204', 'starter', 'sub_62c');
select t.ok((select amount_minor = current_setting('t.basic62')::int and period = 'year' and days = 365 and plan_id = 'starter'
               from public.subscriptions where rzp_subscription_id = 'sub_62c'),
  '62. a yearly subscription is locked at the plan''s full price, 365 days');
select t.charge62('sub_62c', 'pay_62c1', current_setting('t.basic62')::int);
commit;
select t.reset();
select t.ok(public.user_plan('00000000-0000-4000-8000-000000006204') = 'starter' and t.days62('00000000-0000-4000-8000-000000006204') = 365
            and (select plan_period = 'year' from public.accounts where owner_id = '00000000-0000-4000-8000-000000006204'),
  '62. first yearly charge: Basic for 365 days');
select t.ok(public.paid_buyers() = current_setting('t.pb62')::int + 1, '62. a yearly subscriber takes a founding seat (a year, not a pass)');
-- the modes go back to once: a running subscription keeps renewing
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_billing_modes('once', 'once');
commit;
select t.reset();
begin;
select t.service();
select t.ok((select (j ->> 'applied')::boolean and (j ->> 'renewal')::boolean from t.charge62('sub_62c', 'pay_62c2', current_setting('t.basic62')::int) j),
  '62. with the modes back at once, the running yearly subscription still renews');
select t.ok(t.err62($$select public.create_pending_subscription('00000000-0000-4000-8000-000000006206', 'starter')$$) = '22023:renew_off',
  '62. ... while a new one is refused (renew_off)');
commit;
select t.reset();
select t.ok(t.days62('00000000-0000-4000-8000-000000006204') = 730, '62. a yearly renewal stacks: 365 + 365 = 730 days');
select t.ok((select count(*) = 2 from public.invoices i join public.payments p on p.id = i.payment_id where p.subscription_id =
              (select id from public.subscriptions where rzp_subscription_id = 'sub_62c')),
  '62. one invoice per charge');
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_billing_modes('renew', 'renew');
commit;
select t.reset();

-- ============================================================
-- the price lock
-- ============================================================
select set_config('t.indie62', (select price_paise from public.plans where id = 'indie')::text, false);
select set_config('t.indieN62', coalesce((select next_price_paise from public.plans where id = 'indie'), -1)::text, false);
select set_config('t.indieE62', public.effective_price('indie')::text, false);
begin;
select t.service();
select t.sub62('00000000-0000-4000-8000-000000006205', 'indie', 'sub_62d');
select t.charge62('sub_62d', 'pay_62d1', current_setting('t.indieE62')::int);
commit;
select t.reset();
update public.plans set price_paise = price_paise + 10000, next_price_paise = null where id = 'indie';
select t.ok(public.effective_price('indie') = current_setting('t.indie62')::int + 10000, '62. (setup) the console raised Intermediate by ₹100');
begin;
select t.service();
select t.ok((select (j ->> 'applied')::boolean from t.charge62('sub_62d', 'pay_62d2', current_setting('t.indieE62')::int) j),
  '62. price lock: the running subscription renews at the amount it signed up at');
select t.ok(t.err62($$select t.charge62('sub_62d', 'pay_62d3', public.effective_price('indie'))$$) = '22023:amount',
  '62. ... and is never charged the new price');
select t.ok((select (j ->> 'amount_minor')::int = current_setting('t.indie62')::int + 10000
               from public.create_pending_subscription('00000000-0000-4000-8000-000000006206', 'indie') j),
  '62. a new subscriber gets the new price');
rollback;
update public.plans set price_paise = current_setting('t.indie62')::int,
                        next_price_paise = nullif(current_setting('t.indieN62')::int, -1) where id = 'indie';
select t.ok(public.effective_price('indie') = current_setting('t.indieE62')::int, '62. (teardown) Intermediate''s price is back');

-- ============================================================
-- refusals: used, upgrade, downgrade
-- ============================================================
begin;
select t.service();
select c.payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000006210', 'pro', 'pass') c;
update public.payments set razorpay_order_id = 'order_62o1' where user_id = '00000000-0000-4000-8000-000000006210' and status = 'created';
select public.activate_payment('order_62o1', 'pay_62o1', '{"payment":{"amount":4900,"currency":"INR"}}'::jsonb);
select t.ok(t.err62($$select public.create_pending_subscription('00000000-0000-4000-8000-000000006210', 'pass')$$) = '22023:used',
  '62. somebody who had the one-time pass cannot subscribe to it (hint used)');
rollback;
begin;
select t.service();
select c.payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000006207', 'starter', 'year') c;
update public.payments set razorpay_order_id = 'order_62u1' where user_id = '00000000-0000-4000-8000-000000006207' and status = 'created';
select public.activate_payment('order_62u1', 'pay_62u1', jsonb_build_object('payment', jsonb_build_object('amount', public.effective_price('starter'), 'currency', 'INR')));
select t.ok(t.err62($$select public.create_pending_subscription('00000000-0000-4000-8000-000000006207', 'pro')$$) = '22023:upgrade',
  '62. a running Basic year: a Pro subscription is refused (hint upgrade; the credited one-time upgrade stays)');
select t.ok(t.err62($$select public.create_pending_subscription('00000000-0000-4000-8000-000000006207', 'pass')$$) = '22023:has_plan',
  '62. ... and a pass subscription (hint has_plan)');
select t.ok((select (j ->> 'amount_minor')::int = public.effective_price('starter') from public.create_pending_subscription('00000000-0000-4000-8000-000000006207', 'starter') j),
  '62. ... but auto-pay on the SAME plan is allowed, at full price (its first charge stacks onto the year)');
rollback;
begin;
select t.service();
select c.payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000006208', 'pro', 'year') c;
update public.payments set razorpay_order_id = 'order_62w1' where user_id = '00000000-0000-4000-8000-000000006208' and status = 'created';
select public.activate_payment('order_62w1', 'pay_62w1', jsonb_build_object('payment', jsonb_build_object('amount', public.effective_price('pro'), 'currency', 'INR')));
select t.ok(t.err62($$select public.create_pending_subscription('00000000-0000-4000-8000-000000006208', 'starter')$$) = '22023:downgrade',
  '62. a running Pro year: a Basic subscription is refused (hint downgrade)');
rollback;

-- ============================================================
-- kept out: a refunded pass charge gives no trial
-- ============================================================
begin;
select t.service();
select t.sub62('00000000-0000-4000-8000-000000006209', 'pass', 'sub_62e');
select t.charge62('sub_62e', 'pay_62e1', 4900);
commit;
begin;
select t.service();
select public.mark_payment_refunded('pay_62e1');
commit;   -- §34's trigger is deferred to commit
select t.reset();
select t.ok(public.user_plan('00000000-0000-4000-8000-000000006209') = 'free'
            and (select trial_started_at is null from public.studio_members where user_id = '00000000-0000-4000-8000-000000006209'),
  '62. a refunded (only) pass charge: the days come off and NO trial follows');

-- ============================================================
-- RLS and the service-only functions
-- ============================================================
begin;
select t.claims('00000000-0000-4000-8000-000000006202');
select t.ok((select count(*) = 1 and bool_and(user_id = '00000000-0000-4000-8000-000000006202') from public.subscriptions),
  '62. RLS: another member reads only their own');
select t.ok(t.err62($$insert into public.subscriptions (user_id, product, plan_id, period, days, amount_minor, currency)
                       values (auth.uid(), 'pass', 'pro', 'pass', 7, 100, 'INR')$$) like '42501:%',
  '62. RLS: a member cannot insert a subscription');
select t.ok(t.err62($$select count(*) from public.rzp_plans$$) like '42501:%', '62. rzp_plans is not readable by a member');
select t.ok(t.err62($$select public.apply_subscription_charge('sub_62b', 'pay_x', 4900, 'INR', now(), null)$$) like '42501:%'
            and t.err62($$select public.create_pending_subscription(auth.uid(), 'pass')$$) like '42501:%'
            and t.err62($$select public.mark_subscription_status('sub_62b', 'cancelled', null)$$) like '42501:%'
            and t.err62($$select public.set_subscription_rzp_ids(gen_random_uuid(), 'x', 'y')$$) like '42501:%'
            and t.err62($$select public.remember_rzp_plan('pass', 'pass', 7, 4900, 'INR', 'plan_x')$$) like '42501:%'
            and t.err62($$select public.claim_charge_receipt_email('pay_62b1')$$) like '42501:%'
            and t.err62($$select public.undo_cancel_subscription(gen_random_uuid())$$) like '42501:%',
  '62. a member cannot call any service-only subscription function (42501)');
select t.ok(t.err62($$select public.admin_cancel_subscription((select id from public.subscriptions limit 1))$$) like '42501:%',
  '62. a member cannot cancel through the console RPC');
select t.reset();
set local role anon;
select t.ok(t.err62($$select count(*) from public.subscriptions$$) like '42501:%', '62. anon cannot read subscriptions');
reset role;
rollback;

-- ============================================================
-- the plan cache, and the console list / cancel
-- ============================================================
begin;
select t.service();
select t.ok(public.rzp_plan_for('pass', 'pass', 7, 4900, 'INR') is null, '62. rzp_plan_for: nothing cached yet');
select t.ok(public.remember_rzp_plan('pass', 'pass', 7, 4900, 'INR', 'plan_A') = 'plan_A'
            and public.remember_rzp_plan('pass', 'pass', 7, 4900, 'INR', 'plan_B') = 'plan_A',
  '62. remember_rzp_plan: the first stored wins and is returned to a racing second');
select t.ok(public.rzp_plan_for('pass', 'pass', 7, 4900, 'inr') = 'plan_A', '62. rzp_plan_for then finds it');
select t.ok(public.remember_rzp_plan('starter', 'year', 365, 59900, 'INR', 'plan_Y') = 'plan_Y'
            and public.remember_rzp_plan('starter', 'year', null, 59900, 'INR', 'plan_Z') = 'plan_Y',
  '62. a year''s plan is keyed without days (one per price)');
select t.ok(public.rzp_plan_for('starter', 'year', null, 59900, 'INR') = 'plan_Y', '62. ... and found without days');
select t.ok(public.remember_rzp_plan('pass', 'pass', 7, 9900, 'INR', 'plan_C') = 'plan_C',
  '62. a new price is a new plan (the lock)');
rollback;
select set_config('t.sidb62', (select id::text from public.subscriptions where rzp_subscription_id = 'sub_62b'), false);
select set_config('t.sida62', (select id::text from public.subscriptions where rzp_subscription_id = 'sub_62a'), false);
select set_config('t.audc62', (select count(*)::text from public.admin_audit where action = 'cancel_subscription'), false);
begin;
select t.claims('00000000-0000-4000-8000-000000006220');
select t.ok((select jsonb_array_length(public.admin_list_subscriptions()) >= 4
               and jsonb_array_length(public.admin_list_subscriptions('cancelled')) >= 1
               and (public.admin_list_subscriptions('active') -> 0) ? 'user_email'
               and (public.admin_list_subscriptions('active') -> 0) ? 'cancel_at_period_end'),
  '62. admin_list_subscriptions: every row, filterable by status, with the subscriber''s e-mail');
select t.ok((select (j ->> 'rzp_subscription_id') = 'sub_62b' and not (j ->> 'already')::boolean
               from public.admin_cancel_subscription(current_setting('t.sidb62')::uuid) j),
  '62. a finance administrator cancels a member''s subscription');
select t.ok(t.err62($$select public.admin_cancel_subscription(current_setting('t.sida62')::uuid)$$) = '22023:none',
  '62. an ended subscription cannot be cancelled again (hint none)');
commit;
select t.reset();
select t.ok((select count(*) from public.admin_audit where action = 'cancel_subscription') = current_setting('t.audc62')::int + 1
            and (select cancel_at_period_end from public.subscriptions where rzp_subscription_id = 'sub_62b'),
  '62. the console''s cancel is audited and marks cancel_at_period_end');
begin;
select t.service();
select public.undo_cancel_subscription((select id from public.subscriptions where rzp_subscription_id = 'sub_62b'));
select t.ok((select not cancel_at_period_end and cancelled_at is null from public.subscriptions where rzp_subscription_id = 'sub_62b'),
  '62. undo_cancel_subscription (rzp-cancel, when Razorpay refused) puts the flag back');
rollback;

-- ============================================================
-- put back what this file changed
-- ============================================================
update public.billing_settings
   set pass_mode = 'once', plan_mode = 'once',
       pass_enabled = current_setting('t.pe62')::boolean, pass_ends_at = null, pass_cap = null,
       purchase_required = current_setting('t.pr62')::boolean
 where id;
select t.ok((select pass_mode = 'once' and plan_mode = 'once' from public.billing_settings where id), '62. (teardown) both modes are once again');
