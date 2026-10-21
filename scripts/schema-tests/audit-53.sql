-- ============================================================
-- SECTION 53 CHECKS — the billing fixes from the 21 Oct 2026 audit
-- ------------------------------------------------------------
-- Runs after §52 and §53 have loaded. Own people (…53xx); prices are
-- §52's yearly ones (599 / 799 / 999). Every check here was run against
-- the §52 database first and failed there (bug numbers are the audit's).
--
--   bug 10  upgrade credit is the TARGET organisation's, not the user's
--   bug 8   a payment refused after capture is recorded and refundable
--   bug 9   a refund whose outcome is unknown is retried under its own key
--   bug 5   billing_status() keeps plan_until after the year has lapsed
-- ============================================================
\set ON_ERROR_STOP on

create or replace function t.raises53(p_sql text, p_state text) returns boolean language plpgsql as $$
begin
  execute p_sql;
  return false;
exception when others then
  return sqlstate = p_state;
end $$;
grant execute on function t.raises53(text, text) to anon, authenticated, service_role;

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000005301', 'a53-twoorgs@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000005302', 'a53-renew@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000005303', 'a53-code@example.com',    now(), '{}'),
  ('00000000-0000-4000-8000-000000005304', 'a53-credit@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000005305', 'a53-refund@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000005306', 'a53-lapsed@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000005310', 'a53-admin@example.com',   now(), '{}');
-- an owner administrator (no admin_roles row reads as owner, §45)
insert into public.studio_members (user_id, role) values ('00000000-0000-4000-8000-000000005310', 'admin')
  on conflict (user_id) do update set role = 'admin', disabled_at = null;

create or replace function t.acc53(p_user uuid, p_nth int) returns uuid language sql as $$
  select a.id from public.accounts a where a.owner_id = p_user order by a.created_at offset p_nth - 1 limit 1 $$;
/* Age a paid year so half of it is gone (the credit is then half its value). */
create or replace function t.half53(p_order text) returns void language plpgsql as $$
begin
  update public.payments set starts_at = now() - interval '182.5 days', ends_at = now() + interval '182.5 days'
   where razorpay_order_id = p_order;
  perform set_config('fms.billing', 'on', true);
  update public.accounts a set plan_until = now() + interval '182.5 days'
    from public.payments p where p.razorpay_order_id = p_order and a.id = p.account_id;
  perform set_config('fms.billing', '', true);
end $$;
/* Buy a plan as the service, the way rzp-order + Checkout + rzp-verify do. */
create or replace function t.buy53(p_user uuid, p_plan text, p_order text, p_account uuid default null, p_code text default null)
returns void language plpgsql as $$
begin
  perform t.service();
  perform public.attach_razorpay_order((select payment_id from public.create_pending_payment(p_user, p_plan, 'year', p_account, p_code)), p_order);
  perform public.activate_payment(p_order, 'pay' || substr(p_order, 6));
  perform t.reset();
end $$;

-- ============================================================
-- bug 10: the credit belongs to the organisation the plan lands on
-- ============================================================
begin;
select t.buy53('00000000-0000-4000-8000-000000005301', 'starter', 'order_53a1');
commit;
select t.half53('order_53a1');
-- a second organisation, newer than the first, holding nothing
insert into public.accounts (name, owner_id, created_at) values ('B', '00000000-0000-4000-8000-000000005301', now() + interval '1 second');

begin;
select t.service();
select t.ok((select credit_paise from public.create_pending_payment('00000000-0000-4000-8000-000000005301', 'pro', 'year',
               t.acc53('00000000-0000-4000-8000-000000005301', 2))) = 0,
  'bug 10: Pro for organisation B is priced with B''s credit (none), not A''s unused Basic year');
rollback;

begin;
select t.claims('00000000-0000-4000-8000-000000005301');
select t.ok(abs((public.quote_order('pro', null) ->> 'credit_paise')::int - 29950) <= 5,
  'bug 10: with no organisation named, the quote is for the one holding the plan (A), credited with A''s half year');
rollback;

begin;
select t.service();
-- (two statements: a row inserted by a function is not visible to the
-- statement that called it)
select set_config('t.pid53', (select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005301', 'pro', 'year'))::text, true);
select t.ok((select account_id from public.payments where id = current_setting('t.pid53')::uuid)
              = t.acc53('00000000-0000-4000-8000-000000005301', 1),
  'bug 10: and that order records A as where it lands, so the credit and the plan are the same organisation''s');
rollback;

-- buy Intermediate for B at full price; A keeps Basic; nothing is counted twice
begin;
select t.buy53('00000000-0000-4000-8000-000000005301', 'indie', 'order_53a2', t.acc53('00000000-0000-4000-8000-000000005301', 2));
commit;
select t.ok((select amount_paise = 79900 and credit_paise = 0 from public.payments where razorpay_order_id = 'order_53a2'),
  'bug 10: Intermediate on B costs the full ₹799');
select t.ok(public.account_plan(t.acc53('00000000-0000-4000-8000-000000005301', 1)) = 'starter'
            and public.account_plan(t.acc53('00000000-0000-4000-8000-000000005301', 2)) = 'indie',
  'bug 10: A keeps its Basic year, B has Intermediate');
insert into public.accounts (name, owner_id, created_at) values ('C', '00000000-0000-4000-8000-000000005301', now() + interval '2 seconds');
begin;
select t.service();
select t.ok((select credit_paise from public.create_pending_payment('00000000-0000-4000-8000-000000005301', 'pro', 'year',
               t.acc53('00000000-0000-4000-8000-000000005301', 3))) = 0,
  'bug 10: Pro for a third organisation C carries no credit (A''s year is not counted again through B)');
rollback;
begin;
select t.service();
select t.ok(abs((select credit_paise from public.create_pending_payment('00000000-0000-4000-8000-000000005301', 'pro', 'year',
               t.acc53('00000000-0000-4000-8000-000000005301', 2))) - 79900) <= 5,
  'bug 10: Pro for B is credited with B''s own Intermediate year, and only that');
rollback;

-- a renewal with no organisation named lands on the one holding the plan
begin;
select t.buy53('00000000-0000-4000-8000-000000005302', 'starter', 'order_53b1');
commit;
insert into public.accounts (name, owner_id, created_at) values ('B2', '00000000-0000-4000-8000-000000005302', now() + interval '1 second');
begin;
select t.buy53('00000000-0000-4000-8000-000000005302', 'starter', 'order_53b2');
commit;
select t.ok((select round((extract(epoch from (plan_until - now())) / 86400)::numeric) from public.accounts
              where id = t.acc53('00000000-0000-4000-8000-000000005302', 1)) = 730,
  'bug 10: renewing with no organisation named stacks onto the year it renews (730 days)');
select t.ok(public.account_plan(t.acc53('00000000-0000-4000-8000-000000005302', 2)) = 'free',
  'bug 10: and the newer, empty organisation is not given a fresh year');

-- ============================================================
-- bug 8: refused after capture -> recorded, plan not applied, refundable
-- ============================================================
insert into public.promo_codes (code, percent_off, max_uses, note) values ('A53-ONE', 50, 1, 'one use');
begin;
select t.service();
-- the same buyer opens two orders on a one-use code (two tabs)
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005303', 'pro', 'year', null, 'A53-ONE')), 'order_53c1');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005303', 'pro', 'year', null, 'A53-ONE')), 'order_53c2');
select public.activate_payment('order_53c1', 'pay_53c1');
select t.ok((public.payment_can_activate('order_53c2') ->> 'ok')::boolean = false
            and public.payment_can_activate('order_53c2') ->> 'reason' = 'exhausted',
  'bug 8: payment_can_activate refuses the second order BEFORE capture (reason exhausted)');
select t.ok((public.payment_can_activate('order_53c1') ->> 'ok')::boolean, 'bug 8: and answers ok for the order already paid');
select t.ok(not t.raises53($$select public.activate_payment('order_53c2', 'pay_53c2')$$, '22023'),
  'bug 8: a payment already captured on the used-up code is no longer rolled back by a raise');
commit;
select t.reset();
select t.ok((select status = 'paid' and razorpay_payment_id = 'pay_53c2' and plan_applied = false and unapplied_reason = 'exhausted'
               from public.payments where razorpay_order_id = 'order_53c2'),
  'bug 8: it is recorded paid, with its Razorpay id, plan not applied, reason exhausted');
select t.ok((select uses from public.promo_codes where code = 'A53-ONE') = 1, 'bug 8: the code is not counted past its one use');
select t.ok(public.user_plan('00000000-0000-4000-8000-000000005303') = 'pro'
            and (select round((extract(epoch from (plan_until - now())) / 86400)::numeric) from public.accounts
                  where owner_id = '00000000-0000-4000-8000-000000005303') = 365,
  'bug 8: the unapplied payment added no year (Pro runs 365 days from the first order)');
-- the buyer can ask for the refund the sentence promises
update public.billing_settings set refund_requests_enabled = true where id;
begin;
select t.claims('00000000-0000-4000-8000-000000005303');
select t.ok((public.request_refund((select id from public.payments where razorpay_order_id = 'order_53c2'), 'duplicate_charge', '')).id is not null,
  'bug 8: request_refund accepts the unapplied payment');
commit;
select t.reset();
begin;
select t.service();
select t.ok((public.begin_refund((select id from public.payments where razorpay_order_id = 'order_53c2'), null, 'code used up', '00000000-0000-4000-8000-000000005310') ->> 'refund_id') is not null,
  'bug 8: and the console''s begin_refund accepts it');
select public.record_refund(null, 'pay_53c2', 'rfnd_53c2', 'processed', (select amount_paise from public.payments where razorpay_order_id = 'order_53c2'));
commit;
select t.reset();
select t.ok(public.user_plan('00000000-0000-4000-8000-000000005303') = 'pro'
            and (select round((extract(epoch from (plan_until - now())) / 86400)::numeric) from public.accounts
                  where owner_id = '00000000-0000-4000-8000-000000005303') = 365,
  'bug 8: refunding the unapplied payment takes nothing off the plan the other payment bought');

-- credit that went away between the order and the money
begin;
select t.buy53('00000000-0000-4000-8000-000000005304', 'starter', 'order_53d1');
commit;
select t.half53('order_53d1');
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005304', 'indie', 'year')), 'order_53d2');
select public.mark_payment_refunded('pay_53d1');
select t.ok(public.payment_can_activate('order_53d2') ->> 'reason' = 'credit_gone', 'bug 8: a credit that has gone is refused before capture (credit_gone)');
select public.activate_payment('order_53d2', 'pay_53d2');
commit;
select t.reset();
select t.ok((select status = 'paid' and plan_applied = false and unapplied_reason = 'credit_gone' and razorpay_payment_id = 'pay_53d2'
               from public.payments where razorpay_order_id = 'order_53d2')
            and public.user_plan('00000000-0000-4000-8000-000000005304') = 'free',
  'bug 8: captured anyway, it is recorded paid and unapplied (credit_gone), and no plan is given');

-- ============================================================
-- bug 9: an unknown outcome keeps its key; the retry reuses it
-- ============================================================
begin;
select t.buy53('00000000-0000-4000-8000-000000005305', 'pro', 'order_53e1');
commit;
begin;
select t.service();
select set_config('t.rid', public.begin_refund((select id from public.payments where razorpay_order_id = 'order_53e1'), 10000, 'partial', '00000000-0000-4000-8000-000000005310') ->> 'refund_id', false);
select t.ok(t.raises53($$select public.begin_refund((select id from public.payments where razorpay_order_id = 'order_53e1'), 10000, 'again', '00000000-0000-4000-8000-000000005310')$$, '22023'),
  'bug 9: a second press while the first is in flight is refused');
commit;
select t.reset();
-- the first call's answer never came back: the row stays 'initiated'
update public.refunds set created_at = now() - interval '5 minutes' where id = current_setting('t.rid')::uuid;
begin;
select t.service();
select t.ok(public.begin_refund((select id from public.payments where razorpay_order_id = 'order_53e1'), 10000, 'retry', '00000000-0000-4000-8000-000000005310') ->> 'refund_id'
              = current_setting('t.rid'),
  'bug 9: the retry reuses the unanswered refund''s id, so Razorpay''s idempotency key and receipt match');
select t.ok(t.raises53($$select public.begin_refund((select id from public.payments where razorpay_order_id = 'order_53e1'), 20000, 'other amount', '00000000-0000-4000-8000-000000005310')$$, '22023'),
  'bug 9: a retry for a different amount is refused while the first is unresolved');
commit;
select t.reset();
select t.ok((select count(*) from public.refunds r join public.payments p on p.id = r.payment_id where p.razorpay_order_id = 'order_53e1') = 1,
  'bug 9: still one refund row for that payment');
-- the webhook arrives first, naming the refund only by Razorpay id and receipt
begin;
select t.service();
select public.record_refund(null, 'pay_53e1', 'rfnd_53e1', 'processed', 10000, null,
  jsonb_build_object('event', 'refund.processed', 'refund', jsonb_build_object('id', 'rfnd_53e1', 'receipt', current_setting('t.rid'))));
commit;
select t.reset();
select t.ok((select status = 'processed' and razorpay_refund_id = 'rfnd_53e1' from public.refunds where id = current_setting('t.rid')::uuid)
            and not exists (select 1 from public.refunds r join public.payments p on p.id = r.payment_id
                             where p.razorpay_order_id = 'order_53e1' and r.reason = 'Made in the Razorpay dashboard'),
  'bug 9: the webhook settles the console''s own row by its receipt; no second "dashboard" row is made');

-- ============================================================
-- bug 5 (server half): a lapsed year still says when it ended
-- ============================================================
begin;
select t.buy53('00000000-0000-4000-8000-000000005306', 'starter', 'order_53f1');
commit;
select set_config('fms.billing', 'on', false);
update public.accounts set plan_until = now() - interval '3 days' where owner_id = '00000000-0000-4000-8000-000000005306';
select set_config('fms.billing', '', false);
begin;
select t.claims('00000000-0000-4000-8000-000000005306');
select t.ok((public.billing_status() ->> 'lapsed')::boolean
            and (public.billing_status() ->> 'plan_until') is not null
            and (public.billing_status() ->> 'plan_until')::timestamptz < now(),
  'bug 5: billing_status() keeps plan_until (in the past) when lapsed is true');
select t.ok((public.billing_status() ->> 'plan') = 'free', 'bug 5: and the plan still reads free');
rollback;
