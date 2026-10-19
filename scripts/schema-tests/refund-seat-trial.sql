-- ============================================================
-- SECTION 48 CHECKS — refunds follow the role matrix, seats follow the
-- plan, a decline sticks
-- ------------------------------------------------------------
-- Runs after §45–§47 and §48 have loaded. Own people (…4801 upward). The
-- base admin …000a is the owner §45's backfill made. Every check here
-- fails against the pre-§48 functions and passes against §48's.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000004801', 'rst-finance@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004802', 'rst-support@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004803', 'rst-legacy@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004804', 'rst-member@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004805', 'rst-buyer@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000004806', 'rst-buyer2@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004807', 'rst-seats@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000004808', 'rst-seats2@example.com',  now(), '{}'),
  ('00000000-0000-4000-8000-000000004811', 'rst-reask@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000004812', 'rst-fresh@example.com',   now(), '{}'),
  ('00000000-0000-4000-8000-000000004813', 'rst-waiting@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000004814', 'rst-admitted@example.com', now(), '{}');
insert into public.studio_members (user_id, role) values
  ('00000000-0000-4000-8000-000000004801', 'admin'),
  ('00000000-0000-4000-8000-000000004802', 'admin'),
  ('00000000-0000-4000-8000-000000004803', 'admin'),
  ('00000000-0000-4000-8000-000000004804', 'user');
insert into public.admin_roles (user_id, role) values
  ('00000000-0000-4000-8000-000000004801', 'finance'),
  ('00000000-0000-4000-8000-000000004802', 'support')
on conflict (user_id) do update set role = excluded.role;
-- …4803 is an admin member with no admin_roles row: reads as owner.

-- captured payments: indie for the two buyers, pro for the two seat owners
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004805', 'indie', 'lifetime')), 'order_48r1');
select public.activate_payment('order_48r1', 'pay_48r1');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004806', 'indie', 'lifetime')), 'order_48r2');
select public.activate_payment('order_48r2', 'pay_48r2');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004807', 'pro', 'lifetime')), 'order_48s1');
select public.activate_payment('order_48s1', 'pay_48s1');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004808', 'pro', 'lifetime')), 'order_48s2');
select public.activate_payment('order_48s2', 'pay_48s2');
commit;
-- the buyer's refund request, written directly (the switch is not the point here)
insert into public.refund_requests (user_id, payment_id, category, message)
values ('00000000-0000-4000-8000-000000004805', (select id from public.payments where razorpay_payment_id = 'pay_48r1'), 'duplicate_charge', 'charged twice');

-- ------------------------------------------------------------
-- 48.1 / 48.2 THE REFUND
-- ------------------------------------------------------------
-- what the edge function asks, as the caller
begin;
select t.claims('00000000-0000-4000-8000-000000004802');
do $$ begin
  perform public.require_role(array['finance']);
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 48.1 require_role(finance) as a SUPPORT admin -> 42501 (rzp-refund answers 403)'; end $$;
select t.claims('00000000-0000-4000-8000-000000004801');
select public.require_role(array['finance']);
select t.claims('00000000-0000-4000-8000-000000004803');
select public.require_role(array['finance']);
select t.reset();
select t.ok(true, '48.1 require_role(finance) passes for finance and for an admin with no role row (owner)');
rollback;

-- the database's own gate, as the service role the edge function uses
begin;
select t.service();
do $$ begin
  perform public.begin_refund((select id from public.payments where razorpay_payment_id = 'pay_48r1'), null, 'x', '00000000-0000-4000-8000-000000004802');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 48.1 begin_refund with a SUPPORT actor -> 42501'; end $$;
do $$ begin
  perform public.begin_refund((select id from public.payments where razorpay_payment_id = 'pay_48r1'), null, 'x', '00000000-0000-4000-8000-000000004804');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 48.1 begin_refund with a non-admin actor -> 42501'; end $$;
do $$ begin
  perform public.begin_refund((select id from public.payments where razorpay_payment_id = 'pay_48r1'), null, 'x', null);
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 48.1 begin_refund with no actor -> 42501'; end $$;
select t.reset();
select t.ok(not exists (select 1 from public.refunds f join public.payments p on p.id = f.payment_id where p.razorpay_payment_id = 'pay_48r1'),
  '48.1 and no refunds row was written');
rollback;

-- an owner without a role row may refund (rolled back)
begin;
select t.service();
select t.ok((public.begin_refund((select id from public.payments where razorpay_payment_id = 'pay_48r2'), null, 'goodwill', '00000000-0000-4000-8000-000000004803') ->> 'refund_id') is not null,
  '48.1 begin_refund with an owner actor (no admin_roles row) -> allowed');
rollback;

-- finance refunds against the request; Razorpay says pending, then processed
begin;
select t.service();
select (public.begin_refund((select id from public.payments where razorpay_payment_id = 'pay_48r1'), null, 'duplicate charge',
        '00000000-0000-4000-8000-000000004801', (select id from public.refund_requests where payment_id = (select id from public.payments where razorpay_payment_id = 'pay_48r1'))) ->> 'refund_id') as rid \gset
select public.record_refund(:'rid'::uuid, 'pay_48r1', 'rfnd_48r1', 'pending', null);
select t.reset();
select t.ok((select status from public.refund_requests where payment_id = (select id from public.payments where razorpay_payment_id = 'pay_48r1')) = 'approved',
  '48.2 a PENDING refund leaves the request approved, not refunded');
select t.ok((select status from public.payments where razorpay_payment_id = 'pay_48r1') = 'paid'
        and public.account_plan((select account_id from public.payments where razorpay_payment_id = 'pay_48r1')) = 'indie',
  '48.2 and the payment is still paid and the plan not ended');
select t.service();
select public.record_refund(null, 'pay_48r1', 'rfnd_48r1', 'processed', null);
select t.reset();
select t.ok((select status from public.refund_requests where payment_id = (select id from public.payments where razorpay_payment_id = 'pay_48r1')) = 'refunded'
        and (select status from public.payments where razorpay_payment_id = 'pay_48r1') = 'refunded',
  '48.2 once PROCESSED the request is refunded and the payment refunded');
commit;

-- ------------------------------------------------------------
-- 48.3 SEATS FOLLOW THE CURRENT PLAN
-- ------------------------------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000004807');
insert into public.account_members (account_id, invited_email, role, status)
values ((select id from public.accounts where owner_id = '00000000-0000-4000-8000-000000004807'), 'seat-a@example.com', 'member', 'pending');
select t.reset();
select t.ok(true, '48.3 on a live Pro plan the owner invites another seat');
-- the plan lapses (as a timed grant does): plan_until passes, seat_limit stays
select set_config('fms.billing', 'on', true);
update public.accounts set plan_until = now() - interval '1 day' where owner_id = '00000000-0000-4000-8000-000000004807';
select set_config('fms.billing', '', true);
select t.ok((select seat_limit from public.accounts where owner_id = '00000000-0000-4000-8000-000000004807') > 1
        and public.account_plan((select id from public.accounts where owner_id = '00000000-0000-4000-8000-000000004807')) = 'free',
  '48.3 fixture: the plan reads free while the stored seat_limit is still the Pro cap');
select t.claims('00000000-0000-4000-8000-000000004807');
do $$ begin
  insert into public.account_members (account_id, invited_email, role, status)
  values ((select id from public.accounts where owner_id = '00000000-0000-4000-8000-000000004807'), 'seat-b@example.com', 'member', 'pending');
  raise exception 'should have refused';
exception when sqlstate '53400' then raise notice 'ok - 48.3 after the plan lapses a new seat -> 53400 (the current plan''s cap, not the stale column)'; end $$;
select t.reset();
rollback;

begin;
select t.service();
select public.mark_payment_refunded('pay_48s2');
select t.reset();
select t.ok((select seat_limit from public.accounts where owner_id = '00000000-0000-4000-8000-000000004808') = 1,
  '48.3 mark_payment_refunded brings seat_limit back to the free cap');
select t.claims('00000000-0000-4000-8000-000000004808');
do $$ begin
  insert into public.account_members (account_id, invited_email, role, status)
  values ((select id from public.accounts where owner_id = '00000000-0000-4000-8000-000000004808'), 'seat-c@example.com', 'member', 'pending');
  raise exception 'should have refused';
exception when sqlstate '53400' then raise notice 'ok - 48.3 after a refund a new seat -> 53400'; end $$;
select t.reset();
rollback;

-- ------------------------------------------------------------
-- 48.4 A DECLINE SURVIVES A RE-ASK
-- ------------------------------------------------------------
begin;
update public.billing_settings set trial_enabled = true where id;
select t.claims('00000000-0000-4000-8000-000000004811');
select 1 from public.request_invite('let me in');
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_decide_request('00000000-0000-4000-8000-000000004811', false, 'no');
select t.reset();
update public.invite_requests set decided_at = now() - interval '8 days' where user_id = '00000000-0000-4000-8000-000000004811';
select t.claims('00000000-0000-4000-8000-000000004811');
select t.ok((select status from public.request_invite(null)) = 'pending', '48.4 fixture: after seven days the declined account may ask again (pending)');
select t.reset();
select t.ok((select last_declined_at is not null from public.invite_requests where user_id = '00000000-0000-4000-8000-000000004811'),
  '48.4 the re-ask did not erase last_declined_at');
select t.claims('00000000-0000-4000-8000-000000004811');
do $$ begin
  perform public.start_trial();
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 48.4 a re-asked decline cannot start_trial() -> 42501'; end $$;
select t.reset();
select t.ok(not exists (select 1 from public.studio_members where user_id = '00000000-0000-4000-8000-000000004811')
        and (select status from public.invite_requests where user_id = '00000000-0000-4000-8000-000000004811') = 'pending',
  '48.4 no membership was made and the request is still waiting for an administrator');
-- an administrator approves: the decline is cleared and a trial may begin
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_decide_request('00000000-0000-4000-8000-000000004811', true, null);
select t.claims('00000000-0000-4000-8000-000000004811');
select t.ok((public.start_trial() ->> 'started')::boolean, '48.4 after an approval the same account may start a trial');
select t.reset();
rollback;

begin;
update public.billing_settings set trial_enabled = true where id;
select t.claims('00000000-0000-4000-8000-000000004812');
select t.ok((public.start_trial() ->> 'started')::boolean, '48.4 an ordinary sign-up (no request) still starts a trial');
select t.claims('00000000-0000-4000-8000-000000004813');
select 1 from public.request_invite('please');
select t.ok((public.start_trial() ->> 'started')::boolean, '48.4 a requester never declined still starts a trial');
select t.reset();
rollback;

-- a re-asked decline admitted by a membership (a redeemed code, a grant):
-- the close-on-membership trigger approves the request and clears the mark
begin;
update public.billing_settings set trial_enabled = true where id;
select t.claims('00000000-0000-4000-8000-000000004814');
select 1 from public.request_invite('let me in');
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_decide_request('00000000-0000-4000-8000-000000004814', false, 'no');
select t.reset();
update public.invite_requests set decided_at = now() - interval '8 days' where user_id = '00000000-0000-4000-8000-000000004814';
select t.claims('00000000-0000-4000-8000-000000004814');
select 1 from public.request_invite(null);
select t.reset();
insert into public.studio_members (user_id, role) values ('00000000-0000-4000-8000-000000004814', 'user');
select t.ok((select status = 'approved' and last_declined_at is null from public.invite_requests where user_id = '00000000-0000-4000-8000-000000004814'),
  '48.4 a membership made by an admitted route approves the request and clears the decline');
select t.claims('00000000-0000-4000-8000-000000004814');
select t.ok((public.start_trial() ->> 'started')::boolean, '48.4 and that member may start the trial the membership was for');
select t.reset();
rollback;
