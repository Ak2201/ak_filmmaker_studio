-- ============================================================
-- SECTION 61 CHECKS — the launch week pass
-- ------------------------------------------------------------
-- Runs after §61 loads (twice). Own people (…61xx); A (…00a) is the owner
-- administrator, as in trial.sql. The settings this file changes are put
-- back at the end, so a later file sees what it would have seen.
--
--   off       the default: no offer, a pressed trial as before
--   console   owner and finance set it, audited; support, members, anon cannot
--   offer     the public pass block, anon-readable
--   buy       ₹49, seven days of Pro, recorded as period 'pass'
--   refusals  used (twice, and after a refund), inr_only, code, has_plan,
--             closed (deadline and cap); a paid in-flight pass still activates
--   year      a yearly plan over a running pass: full price, from now, no stacking
--   refund    the week comes off, no trial; a year bought over it is kept
--   kept out  founding seats, referral payouts
--   trial     a pressed trial refused 'pass', a code trial still works, a §30
--             grandfathered member still entitled
-- ============================================================
\set ON_ERROR_STOP on

/* 'sqlstate:hint' of the error p_sql raises, or 'none'. */
create or replace function t.err61(p_sql text) returns text language plpgsql as $$
declare st text; hn text;
begin
  execute p_sql;
  return 'none';
exception when others then
  get stacked diagnostics st = returned_sqlstate, hn = pg_exception_hint;
  return st || ':' || coalesce(hn, '');
end $$;
grant execute on function t.err61(text) to anon, authenticated, service_role;

/* As the payment service: order a pass (or a year), attach a Razorpay order
   id, and activate it with Razorpay's amount. Returns the payment row. */
create or replace function t.buy61(p_user uuid, p_order text, p_period text default 'pass', p_plan text default 'pro', p_activate boolean default true)
returns public.payments language plpgsql as $$
declare pid uuid; amt int; pay public.payments;
begin
  select c.payment_id, c.amount_paise into pid, amt from public.create_pending_payment(p_user, p_plan, p_period) c;
  perform public.attach_razorpay_order(pid, p_order);
  if p_activate then
    perform public.activate_payment(p_order, 'pay_' || p_order, jsonb_build_object('payment', jsonb_build_object('amount', amt, 'currency', 'INR')));
  end if;
  select * into pay from public.payments p where p.id = pid;
  return pay;
end $$;
grant execute on function t.buy61(uuid, text, text, text, boolean) to service_role;

select set_config('t.pr61', coalesce((select purchase_required from public.billing_settings where id), false)::text, false);
select set_config('t.te61', coalesce((select trial_enabled from public.billing_settings where id), false)::text, false);
update public.billing_settings set purchase_required = true, trial_enabled = true where id;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000006101', 'wp-buyer@example.com',    now(), '{"full_name":"Pass Buyer"}'),
  ('00000000-0000-4000-8000-000000006102', 'wp-usd@example.com',      now(), '{}'),
  ('00000000-0000-4000-8000-000000006103', 'wp-referred@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000006104', 'wp-topro@example.com',    now(), '{}'),
  ('00000000-0000-4000-8000-000000006105', 'wp-yearly@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000006106', 'wp-refund@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000006107', 'wp-inflight@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000006108', 'wp-last@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000006109', 'wp-late@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000006110', 'wp-signup@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000006111', 'wp-code@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000006112', 'wp-off@example.com',      now(), '{}'),
  ('00000000-0000-4000-8000-000000006113', 'wp-race@example.com',     now(), '{}'),
  ('00000000-0000-4000-8000-000000006114', 'wp-grandfather@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000006115', 'wp-referrer@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000006120', 'wp-finance@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000006121', 'wp-support@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000006122', 'wp-member@example.com',   now(), '{}');
insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-000000006120', 'admin'), ('00000000-0000-4000-8000-000000006121', 'admin'),
  ('00000000-0000-4000-8000-000000006122', 'user')
  on conflict (user_id) do update set role = excluded.role, disabled_at = null;
insert into public.admin_roles (user_id, role) values
  ('00000000-0000-4000-8000-000000006120', 'finance'), ('00000000-0000-4000-8000-000000006121', 'support')
  on conflict (user_id) do update set role = excluded.role;
-- a member §30's backfill covered: a year of 'admin' trial at full scope
insert into public.studio_members (user_id, role, trial_started_at, trial_minutes, trial_source, trial_scope)
values ('00000000-0000-4000-8000-000000006114', 'user', now() - interval '20 days', 525600, 'admin', 'full');

-- ============================================================
-- the shape, and OFF by default
-- ============================================================
select t.ok((select not pass_enabled and pass_paise = 4900 and pass_days = 7 and pass_plan = 'pro'
                    and pass_ends_at is null and pass_cap is null from public.billing_settings where id),
  '61. billing_settings: the pass is OFF, ₹49 (4900 paise), 7 days, Pro, no deadline, no cap');
select t.ok(t.err61($$update public.billing_settings set pass_paise = 99 where id$$) like '23514:%'
            and t.err61($$update public.billing_settings set pass_days = 32 where id$$) like '23514:%'
            and t.err61($$update public.billing_settings set pass_cap = 0 where id$$) like '23514:%'
            and t.err61($$update public.billing_settings set pass_plan = 'nope' where id$$) like '23503:%',
  '61. the checks hold: under 100 paise, over 31 days, a cap of 0 and an unknown plan are refused');
select t.ok(t.err61($$insert into public.events (day, name, count) values (current_date, 'pass_buy', 1)
                       on conflict (day, name, source) do update set count = public.events.count + 1$$) = 'none'
            and 'pass_buy' = any (public.funnel_event_names()),
  '61. events accept pass_buy, and bump_event knows it');

begin;
set local role anon;
select t.ok((select (p ->> 'open')::boolean = false and (p ->> 'amount_paise')::int = 4900 and (p ->> 'days')::int = 7
                    and p ->> 'plan' = 'pro' and p ? 'now' and p ? 'ends_at' and p ? 'cap' and p ? 'left'
               from (select public.trial_offer() -> 'pass' p) x),
  '61. off: anon reads trial_offer().pass {open false, 4900, 7 days, pro, now} (the client shows no offer)');
select t.ok(public.trial_offer() ? 'trial_scope' and public.trial_offer() ? 'trial_minutes'
            and public.price_notice('INR') ? 'plans' and public.price_notice('INR') ? 'pass',
  '61. trial_offer and price_notice(text) keep every key and gain pass');
reset role;
rollback;

begin;
select t.service();
select t.ok(t.err61($$select * from public.create_pending_payment('00000000-0000-4000-8000-000000006101', 'pro', 'pass')$$) = '22023:disabled',
  '61. off: a pass order is refused (hint disabled)');
rollback;

begin;
select t.claims('00000000-0000-4000-8000-000000006112');
select t.ok((public.start_trial() ->> 'started')::boolean, '61. off: a pressed trial starts as it did before §61');
select t.reset();
rollback;

-- ============================================================
-- console: owner and finance; support, a member and anon cannot
-- ============================================================
begin;
set local role anon;
select t.ok(t.err61($$select public.admin_set_pass(true, 4900, 7, 'pro', null, null)$$) = '42501:'
            and t.err61($$select public.admin_pass_status()$$) = '42501:',
  '61. anon cannot call admin_set_pass or admin_pass_status (42501)');
reset role;
rollback;
begin;
select t.claims('00000000-0000-4000-8000-000000006122');
select t.ok(t.err61($$select public.admin_set_pass(true, 4900, 7, 'pro', null, null)$$) like '42501:%'
            and t.err61($$select public.admin_pass_status()$$) like '42501:%',
  '61. a member who is not an administrator cannot (42501)');
select t.claims('00000000-0000-4000-8000-000000006121');
select t.ok(t.err61($$select public.admin_set_pass(true, 4900, 7, 'pro', null, null)$$) like '42501:%'
            and t.err61($$select public.admin_pass_status()$$) like '42501:%',
  '61. a support administrator cannot (it needs finance or owner)');
select t.reset();
rollback;

select set_config('t.sold61', public.pass_sold()::text, false);
select set_config('t.aud61', (select count(*)::text from public.admin_audit where action = 'set_pass'), false);
begin;
select t.claims('00000000-0000-4000-8000-000000006120');
select t.ok(t.err61($$select public.admin_set_pass(true, 99, 7, 'pro', null, null)$$) like '22023:%'
            and t.err61($$select public.admin_set_pass(true, 4900, 0, 'pro', null, null)$$) like '22023:%'
            and t.err61($$select public.admin_set_pass(true, 4900, 7, 'free', null, null)$$) like '22023:%'
            and t.err61($$select public.admin_set_pass(true, 4900, 7, 'pro', now() - interval '1 hour', null)$$) like '22023:%'
            and t.err61($$select public.admin_set_pass(true, 4900, 7, 'pro', null, 0)$$) like '22023:%',
  '61. console refusals: under ₹1, 0 days, the free plan, a deadline already past, a cap of 0');
select t.ok((select (x ->> 'enabled')::boolean and (x ->> 'paise')::int = 4900 and (x ->> 'days')::int = 7
                    and x ->> 'plan' = 'pro' and (x ->> 'ends_at')::timestamptz > now() + interval '6 days'
                    and (x ->> 'cap') is null and (x ->> 'left') is null and (x ->> 'open')::boolean
                    and (x ->> 'sold')::int = current_setting('t.sold61')::int
               from public.admin_set_pass(true, 4900, 7, 'pro', now() + interval '7 days', null) x),
  '61. a finance administrator turns the pass on: ₹49, 7 days, Pro, a deadline in a week, no cap; open');
commit;
select t.reset();
select t.ok((select count(*) from public.admin_audit where action = 'set_pass') = current_setting('t.aud61')::int + 1,
  '61. the change is in the audit log (one row; the refused ones wrote none)');
select set_config('t.end61', (select pass_ends_at from public.billing_settings where id)::text, false);
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((select (x ->> 'enabled')::boolean and (x ->> 'open')::boolean from public.admin_pass_status() x),
  '61. the owner reads admin_pass_status: enabled and open');
select t.ok((select (x ->> 'enabled')::boolean and (x ->> 'paise')::int = 4900 and (x ->> 'days')::int = 7 and x ->> 'plan' = 'pro'
                    and (x ->> 'ends_at')::timestamptz = current_setting('t.end61')::timestamptz
               from public.admin_set_pass(null, null, null, null, current_setting('t.end61')::timestamptz, null) x),
  '61. a null enabled / price / days / plan keeps what is there');
rollback;
select t.reset();

-- ============================================================
-- offer: anon reads the open pass
-- ============================================================
begin;
set local role anon;
select t.ok((select (p ->> 'open')::boolean and (p ->> 'amount_paise')::int = 4900 and (p ->> 'days')::int = 7
                    and p ->> 'plan' = 'pro' and (p ->> 'ends_at')::timestamptz > now()
                    and p -> 'cap' = 'null'::jsonb and p -> 'left' = 'null'::jsonb
                    and abs(extract(epoch from ((p ->> 'now')::timestamptz - now()))) < 5
               from (select public.trial_offer() -> 'pass' p) x),
  '61. on: anon reads pass {open true, 4900, 7, pro, ends_at, cap null, left null, now = the server clock}');
select t.ok(public.price_notice('INR') -> 'pass' -> 'open' = 'true'::jsonb, '61. price_notice(text) carries the same pass block');
reset role;
rollback;

-- ============================================================
-- buy: ₹49 for seven days of Pro
-- ============================================================
select set_config('t.pb61', public.paid_buyers()::text, false);
begin;
select t.service();
select t.ok((select c.amount_paise = 4900 and c.currency = 'INR' and c.plan_name = (select name from public.plans where id = 'pro')
                    and c.discount_paise = 0 and c.credit_paise = 0 and c.promo_code is null
               from public.create_pending_payment('00000000-0000-4000-8000-000000006101', 'starter', 'pass') c),
  '61. a pass order is priced by the server: 4900 paise INR, Pro (the plan argument is ignored), no credit, no code');
rollback;
begin;
select t.service();
select (t.buy61('00000000-0000-4000-8000-000000006101', 'order_61a1')).id;
commit;
select t.reset();
select t.ok((select status = 'paid' and period = 'pass' and plan_id = 'pro' and amount_paise = 4900 and plan_applied
                    and round(extract(epoch from (ends_at - starts_at)) / 86400) = 7
               from public.payments where razorpay_order_id = 'order_61a1'),
  '61. activated: paid, period pass, Pro, 4900, starts_at to ends_at is 7 days');
select t.ok(public.user_plan('00000000-0000-4000-8000-000000006101') = 'pro'
            and (select plan_period = 'pass' and round(extract(epoch from (plan_until - now())) / 86400) = 7
                   from public.accounts where owner_id = '00000000-0000-4000-8000-000000006101'),
  '61. the account is on Pro for 7 days, plan_period pass');
select t.ok(exists (select 1 from public.studio_members where user_id = '00000000-0000-4000-8000-000000006101' and disabled_at is null),
  '61. the buyer is a member (the site gate admits them)');
select t.ok((select period = 'pass' and valid_until is not null and round(extract(epoch from (valid_until - valid_from)) / 86400) = 7
               from public.invoices i where i.payment_id = (select id from public.payments where razorpay_order_id = 'order_61a1')),
  '61. the invoice says period pass and carries the 7 days');
begin;
select t.claims('00000000-0000-4000-8000-000000006101');
select t.ok((select (b ->> 'entitled')::boolean and (b ->> 'pass_active')::boolean and (b ->> 'pass_used')::boolean
                    and b ->> 'plan_period' = 'pass' and b ->> 'plan' = 'pro'
                    and b -> 'features' = (select features from public.plans where id = 'pro')
               from public.billing_status() b),
  '61. billing_status: entitled, pass_active, pass_used, plan_period pass, Pro''s features');
select t.reset();
rollback;
select t.ok(public.paid_buyers() = current_setting('t.pb61')::int, '61. paid_buyers() (the founding seats) is unchanged by a pass');

-- ============================================================
-- refusals
-- ============================================================
begin;
select t.service();
select t.ok(t.err61($$select * from public.create_pending_payment('00000000-0000-4000-8000-000000006101', 'pro', 'pass')$$) = '22023:used',
  '61. a second pass for the same person is refused (hint used)');
select t.ok(t.err61($$select * from public.create_pending_payment('00000000-0000-4000-8000-000000006102', 'pro', 'pass', null, null, 'USD')$$) = '22023:inr_only',
  '61. a pass in US dollars is refused (hint inr_only)');
select t.ok(t.err61($$select * from public.create_pending_payment('00000000-0000-4000-8000-000000006102', 'pro', 'pass', null, 'SOMECODE')$$) = '22023:code',
  '61. a promo code on a pass is refused (hint code)');
rollback;

-- has_plan: a yearly Basic buyer gets nothing from a pass
begin;
select t.service();
select (t.buy61('00000000-0000-4000-8000-000000006105', 'order_61y1', 'year', 'starter')).id;
select t.ok(t.err61($$select * from public.create_pending_payment('00000000-0000-4000-8000-000000006105', 'pro', 'pass')$$) = '22023:has_plan',
  '61. a person with a current yearly plan is refused a pass (hint has_plan)');
commit;
select t.reset();

-- ============================================================
-- a yearly plan over a running pass
-- ============================================================
select set_config('t.basic61', public.effective_price('starter')::text, false);
begin;
select t.claims('00000000-0000-4000-8000-000000006101');
select t.ok((select q ->> 'ok' = 'true' and (q ->> 'amount_paise')::int = current_setting('t.basic61')::int
                    and (q ->> 'credit_paise')::int = 0 and q ->> 'upgrade_from' is null and not (q ->> 'renewal')::boolean
               from public.quote_order('starter') q),
  '61. on a running Pro pass, yearly Basic quotes at its full price: no downgrade refusal, no credit, not a renewal');
select t.reset();
rollback;
begin;
select t.service();
select (t.buy61('00000000-0000-4000-8000-000000006101', 'order_61a2', 'year', 'starter')).id;
commit;
select t.reset();
select t.ok(public.user_plan('00000000-0000-4000-8000-000000006101') = 'starter'
            and (select plan_period = 'year' and round(extract(epoch from (plan_until - now())) / 86400) = 365
                   from public.accounts where owner_id = '00000000-0000-4000-8000-000000006101')
            and (select plan_applied and credit_paise = 0 from public.payments where razorpay_order_id = 'order_61a2'),
  '61. the yearly Basic replaces the pass: Basic from now for 365 days, applied, no credit');

-- pass, then yearly Pro: the year does not stack on the week
begin;
select t.service();
select (t.buy61('00000000-0000-4000-8000-000000006104', 'order_61p1')).id;
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000006104');
select t.ok((select (q ->> 'credit_paise')::int = 0 and not (q ->> 'renewal')::boolean from public.quote_order('pro') q),
  '61. on a running Pro pass, yearly Pro is not a renewal and carries no credit');
select t.reset();
rollback;
begin;
select t.service();
select (t.buy61('00000000-0000-4000-8000-000000006104', 'order_61p2', 'year', 'pro')).id;
commit;
select t.reset();
select t.ok((select plan = 'pro' and plan_period = 'year' and round(extract(epoch from (plan_until - now())) / 86400) = 365
               from public.accounts where owner_id = '00000000-0000-4000-8000-000000006104'),
  '61. yearly Pro bought on a Pro pass starts now: 365 days, not 372');
-- and refunding that pass afterwards does not shorten the year
begin;
select t.service();
select public.mark_payment_refunded('pay_order_61p1');
commit;
select t.reset();
select t.ok((select plan = 'pro' and plan_period = 'year' and round(extract(epoch from (plan_until - now())) / 86400) = 365
               from public.accounts where owner_id = '00000000-0000-4000-8000-000000006104'),
  '61. refunding the pass after a year replaced it leaves the year whole');

-- ============================================================
-- refund: the week comes off, no trial, and no second pass
-- ============================================================
begin;
select t.service();
select (t.buy61('00000000-0000-4000-8000-000000006106', 'order_61r1')).id;
commit;
begin;
select t.service();
select public.mark_payment_refunded('pay_order_61r1');
commit;   -- §34's trigger is deferred to commit
select t.reset();
select t.ok(public.user_plan('00000000-0000-4000-8000-000000006106') = 'free'
            and (select plan_until <= now() from public.accounts where owner_id = '00000000-0000-4000-8000-000000006106'),
  '61. a refunded pass: the 7 days are taken off (the plan is free now)');
select t.ok((select trial_started_at is null from public.studio_members where user_id = '00000000-0000-4000-8000-000000006106'),
  '61. a refunded pass gives NO free trial (§34 stands down for a pass)');
begin;
select t.service();
select t.ok(t.err61($$select * from public.create_pending_payment('00000000-0000-4000-8000-000000006106', 'pro', 'pass')$$) = '22023:used',
  '61. after a refund a pass is still refused (hint used): once per person');
rollback;
select t.reset();
select t.ok(public.pass_sold() = (select count(*) from public.payments where period = 'pass' and status = 'paid')
            and not exists (select 1 from public.payments where razorpay_order_id = 'order_61r1' and status = 'paid'),
  '61. pass_sold() counts paid passes, a refunded one not among them');

-- ============================================================
-- referral: a pass earns its referrer nothing
-- ============================================================
-- the referrer is the yearly Basic buyer above (a code is made for somebody who has paid)
select set_config('t.ref61', public.ensure_referral_code('00000000-0000-4000-8000-000000006105'), false);
select t.ok(current_setting('t.ref61') <> '', '61. (setup) the referrer has a referral code');
begin;
select t.service();
select (t.buy61('00000000-0000-4000-8000-000000006103', 'order_61f1', 'pass', 'pro', false)).id;
commit;
select t.reset();
-- the code cannot be put on a pass order through the API; set it by hand to
-- prove the payout trigger is the second guard
update public.payments set promo_code = current_setting('t.ref61') where razorpay_order_id = 'order_61f1';
begin;
select t.service();
select public.activate_payment('order_61f1', 'pay_61f1', '{"payment":{"amount":4900,"currency":"INR"}}'::jsonb);
commit;
select t.reset();
select t.ok((select status = 'paid' from public.payments where razorpay_order_id = 'order_61f1')
            and not exists (select 1 from public.referral_credits r join public.payments p on p.id = r.payment_id where p.razorpay_order_id = 'order_61f1'),
  '61. a pass carrying a referral code earns the referrer nothing');

-- ============================================================
-- a yearly plan bought between a pass order and its payment
-- ============================================================
begin;
select t.service();
select (t.buy61('00000000-0000-4000-8000-000000006113', 'order_61x1', 'pass', 'pro', false)).id;
select (t.buy61('00000000-0000-4000-8000-000000006113', 'order_61x2', 'year', 'starter')).id;
select t.ok((select x ->> 'ok' = 'false' and x ->> 'reason' = 'has_plan' from public.payment_can_activate('order_61x1') x),
  '61. payment_can_activate: a pass ordered before a yearly plan is refused (has_plan), so rzp-verify does not capture it');
select public.activate_payment('order_61x1', 'pay_61x1', '{"payment":{"amount":4900,"currency":"INR"}}'::jsonb);
commit;
select t.reset();
select t.ok((select status = 'paid' and plan_applied is false and unapplied_reason = 'has_plan' from public.payments where razorpay_order_id = 'order_61x1')
            and (select plan = 'starter' and plan_period = 'year' from public.accounts where owner_id = '00000000-0000-4000-8000-000000006113'),
  '61. a captured one is recorded unapplied (has_plan) and the Basic year is untouched');

-- ============================================================
-- closed: the deadline, then the cap
-- ============================================================
begin;
update public.billing_settings set pass_ends_at = now() - interval '1 minute' where id;
select t.service();
select t.ok(t.err61($$select * from public.create_pending_payment('00000000-0000-4000-8000-000000006109', 'pro', 'pass')$$) = '22023:closed',
  '61. after the deadline a pass is refused (hint closed)');
select t.reset();
set local role anon;
select t.ok(public.trial_offer() -> 'pass' -> 'open' = 'false'::jsonb, '61. after the deadline trial_offer().pass.open is false');
reset role;
rollback;

-- the cap: one pass left; two orders in flight; the second paid still activates
update public.billing_settings set pass_cap = public.pass_sold() + 1 where id;
select set_config('t.cap61', (select pass_cap from public.billing_settings where id)::text, false);
begin;
set local role anon;
select t.ok((select (p ->> 'open')::boolean and (p ->> 'left')::int = 1 and (p ->> 'cap')::int = current_setting('t.cap61')::int
               from (select public.trial_offer() -> 'pass' p) x),
  '61. with a cap, trial_offer().pass says the real number left (1)');
reset role;
rollback;
begin;
select t.service();
select (t.buy61('00000000-0000-4000-8000-000000006107', 'order_61c1', 'pass', 'pro', false)).id;   -- in flight
select (t.buy61('00000000-0000-4000-8000-000000006108', 'order_61c2')).id;                         -- the last one, paid
select t.ok(t.err61($$select * from public.create_pending_payment('00000000-0000-4000-8000-000000006109', 'pro', 'pass')$$) = '22023:closed',
  '61. the cap reached: a new pass order is refused (hint closed)');
commit;
select t.reset();
begin;
set local role anon;
select t.ok((select (p ->> 'open')::boolean = false and (p ->> 'left')::int = 0 from (select public.trial_offer() -> 'pass' p) x),
  '61. the cap reached: trial_offer().pass {open false, left 0}');
reset role;
rollback;
begin;
select t.service();
select t.ok((select x ->> 'ok' = 'true' from public.payment_can_activate('order_61c1') x),
  '61. the order already in flight may still be captured');
select public.activate_payment('order_61c1', 'pay_61c1', '{"payment":{"amount":4900,"currency":"INR"}}'::jsonb);
commit;
select t.reset();
select t.ok((select status = 'paid' and plan_applied from public.payments where razorpay_order_id = 'order_61c1')
            and public.user_plan('00000000-0000-4000-8000-000000006107') = 'pro',
  '61. a pass paid after the cap filled is still activated (a buyer who paid is never refused)');
begin;
set local role anon;
select t.ok((public.trial_offer() -> 'pass' ->> 'left')::int = 0, '61. left never goes below 0');
reset role;
rollback;
update public.billing_settings set pass_cap = null where id;

-- ============================================================
-- the trial while the pass is on
-- ============================================================
begin;
select t.claims('00000000-0000-4000-8000-000000006110');
select t.ok((select r ->> 'started' = 'false' and r ->> 'reason' = 'pass' from public.start_trial() r),
  '61. on: a pressed trial is refused {started false, reason pass}');
select t.reset();
select t.ok(not exists (select 1 from public.studio_members where user_id = '00000000-0000-4000-8000-000000006110' and trial_started_at is not null),
  '61. ... and no trial was written');
rollback;

begin;
update public.billing_settings set code_trial_days = 7 where id;
do $$
declare v_code text; v_ticket text; v_src text; v_mins int;
begin
  perform t.claims('00000000-0000-4000-8000-00000000000a');
  select code into v_code from public.admin_create_invite('standard', 5, null, null, 'section 61 test');
  perform t.claims('00000000-0000-4000-8000-000000006111');
  select ticket into v_ticket from public.verify_invite(v_code);
  perform * from public.redeem_invite(v_ticket);
  perform t.ok((public.start_trial() ->> 'started')::boolean, '61. on: a code trial still starts');
  perform t.reset();
  select trial_source, trial_minutes into v_src, v_mins from public.studio_members where user_id = '00000000-0000-4000-8000-000000006111';
  perform t.ok(v_src = 'code' and v_mins = 7 * 1440, '61. ... as a seven-day code trial');
end $$;
rollback;

begin;
select t.claims('00000000-0000-4000-8000-000000006114');
select t.ok((select (b ->> 'entitled')::boolean and (b ->> 'trial_active')::boolean and not (b ->> 'pass_used')::boolean
                    and not (b ->> 'pass_active')::boolean
               from public.billing_status() b),
  '61. on: a §30 grandfathered member is still entitled (trial_enabled untouched), pass_used and pass_active false');
select t.reset();
rollback;
select t.ok((select trial_enabled from public.billing_settings where id), '61. trial_enabled is still true');

-- ============================================================
-- off again: today's behaviour
-- ============================================================
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_pass(false, null, null, null, null, null);
select t.reset();
set local role anon;
select t.ok(public.trial_offer() -> 'pass' -> 'open' = 'false'::jsonb, '61. off again: trial_offer().pass.open is false');
reset role;
select t.claims('00000000-0000-4000-8000-000000006110');
select t.ok((public.start_trial() ->> 'started')::boolean, '61. off again: a pressed trial starts');
select t.reset();
rollback;

-- put back what this file changed
update public.billing_settings
   set pass_enabled = false, pass_ends_at = null, pass_cap = null,
       purchase_required = current_setting('t.pr61')::boolean,
       trial_enabled = current_setting('t.te61')::boolean
 where id;
