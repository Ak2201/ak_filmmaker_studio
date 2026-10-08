-- ============================================================
-- SECTION 27 CHECKS — refunds and refund requests
-- ------------------------------------------------------------
-- A the administrator (billing.sql), R1 and R2 buyers made here. Every
-- payment is made through the service-role functions, as the edge
-- functions would. Expected refusals are caught by SQLSTATE.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000002701', 'rf1@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000002702', 'rf2@example.com', now(), '{}');

-- two captured payments (indie for R1, starter for R2)
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000002701', 'indie', 'lifetime')), 'order_rf1');
select public.activate_payment('order_rf1', 'pay_rf1');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000002702', 'starter', 'lifetime')), 'order_rf2');
select public.activate_payment('order_rf2', 'pay_rf2');
commit;

-- 1. closed tables, public switch, off by default
begin;
select t.claims('00000000-0000-4000-8000-000000002701');
do $$ begin
  perform count(*) from public.refunds;
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. authenticated select from refunds -> 42501'; end $$;
select t.ok(public.refund_requests_enabled() = false, '1. the switch is OFF by default');
do $$ begin
  perform public.request_refund((select id from public.payments where razorpay_payment_id = 'pay_rf1'), 'duplicate_charge', 'x');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. request_refund while the switch is off -> 42501'; end $$;
do $$ begin
  perform public.admin_set_refund_requests_enabled(true);
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. admin_set_refund_requests_enabled as a user -> 42501'; end $$;
do $$ begin
  insert into public.refund_requests (payment_id, category) values ((select id from public.payments where razorpay_payment_id = 'pay_rf1'), 'other');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. a direct INSERT while the switch is off -> RLS refusal'; end $$;
select t.ok((public.my_refund_status() ->> 'enabled')::boolean = false and (public.my_refund_status() ->> 'can_request')::boolean = false, '1. my_refund_status says disabled');
rollback;
begin;
select t.claims('00000000-0000-4000-8000-000000002701', 'anon');
select t.ok(public.refund_requests_enabled() = false, '1. anon may read the one flag');
do $$ begin
  perform count(*) from public.refund_requests;
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 1. anon select from refund_requests -> 42501'; end $$;
rollback;

-- 2. the admin switches it on
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(public.admin_set_refund_requests_enabled(true) = true, '2. admin turns the switch on');
commit;

-- 3. requests: ownership, validation, one open, RLS
begin;
select t.claims('00000000-0000-4000-8000-000000002701');
select t.ok(public.refund_requests_enabled(), '3. the switch reads on');
select t.ok((public.my_refund_status() ->> 'can_request')::boolean and (public.my_refund_status() #>> '{payment,plan_id}') = 'indie', '3. my_refund_status offers the captured indie payment');
do $$ begin
  perform public.request_refund((select id from public.payments where razorpay_payment_id = 'pay_rf2'), 'duplicate_charge', '');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 3. a request about somebody else''s payment -> 42501'; end $$;
do $$ begin
  perform public.request_refund((select id from public.payments where razorpay_payment_id = 'pay_rf1'), 'bogus', '');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 3. an unknown category -> 22023'; end $$;
do $$ begin
  perform public.request_refund((select id from public.payments where razorpay_payment_id = 'pay_rf1'), 'other', '');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 3. "other" with no words -> 22023'; end $$;
select t.ok((public.request_refund((select id from public.payments where razorpay_payment_id = 'pay_rf1'), 'duplicate_charge', 'charged twice')).status = 'pending', '3. a request lands pending');
do $$ begin
  perform public.request_refund((select id from public.payments where razorpay_payment_id = 'pay_rf1'), 'duplicate_charge', 'again');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 3. a second open request for the payment -> 22023'; end $$;
select t.ok((select count(*) from public.refund_requests) = 1, '3. the customer reads their own request');
select t.ok((public.my_refund_status() #>> '{latest,status}') = 'pending' and not (public.my_refund_status() ->> 'can_request')::boolean, '3. status shows pending and no new request');
do $$ begin
  update public.refund_requests set status = 'approved', admin_note = 'self-approved';
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 3. a client UPDATE of a request -> 42501 (no grant, no policy)'; end $$;
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000002702');
select t.ok((select count(*) from public.refund_requests) = 0, '3. another customer reads none of it');
rollback;
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((select count(*) from public.refund_requests) = 1, '3. an admin reads all requests');
select t.ok((select count(*) from public.admin_list_refund_requests('pending')) = 1 and (select email from public.admin_list_refund_requests()) = 'rf1@example.com', '3. admin_list_refund_requests names the customer');
rollback;
begin;
select t.claims('00000000-0000-4000-8000-000000002701');
do $$ begin
  perform public.admin_list_refund_requests();
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 3. admin_list_refund_requests as a user -> 42501'; end $$;
do $$ begin
  perform public.admin_decide_refund_request((select id from public.refund_requests), 'declined', 'no');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 3. admin_decide_refund_request as a user -> 42501'; end $$;
rollback;

-- 4. declining needs a note, and is final for that request
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
do $$ begin
  perform public.admin_decide_refund_request((select id from public.refund_requests), 'declined', '  ');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 4. declining without a note -> 22023'; end $$;
select t.ok((public.admin_decide_refund_request((select id from public.refund_requests), 'declined', 'Outside the policy.')).status = 'declined', '4. declined, with the note');
do $$ begin
  perform public.admin_decide_refund_request((select id from public.refund_requests), 'approved', null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 4. deciding a decided request -> 22023'; end $$;
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000002701');
select t.ok((public.my_refund_status() #>> '{latest,admin_note}') = 'Outside the policy.' and (public.my_refund_status() ->> 'can_request')::boolean, '4. the customer reads the note and may ask again');
commit;

-- 5. the refund itself: service role only, under a lock
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
do $$ begin
  perform public.begin_refund((select id from public.payments where razorpay_payment_id = 'pay_rf1'), null, 'x', '00000000-0000-4000-8000-00000000000a');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 5. begin_refund even as an admin through the API -> 42501 (the function runs it as the service role)'; end $$;
rollback;
begin;
select t.service();
do $$ begin
  perform public.begin_refund((select id from public.payments where razorpay_payment_id = 'pay_rf1'), 99999999, 'too much', null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 5. more than was paid -> 22023'; end $$;
do $$ begin
  perform public.begin_refund((select id from public.payments where razorpay_payment_id = 'pay_rf1'), null, '  ', null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 5. no reason -> 22023'; end $$;
do $$ begin
  perform public.begin_refund((select id from public.payments where razorpay_payment_id = 'pay_rf1'), null, 'x', null, (select id from public.refund_requests));
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 5. a request that was already declined -> 22023'; end $$;
select t.ok(((public.begin_refund((select id from public.payments where razorpay_payment_id = 'pay_rf1'), null, 'duplicate charge', '00000000-0000-4000-8000-00000000000a')) ->> 'amount_paise')::int = (select amount_paise from public.payments where razorpay_payment_id = 'pay_rf1'), '5. begin_refund defaults to the full amount paid');
do $$ begin
  perform public.begin_refund((select id from public.payments where razorpay_payment_id = 'pay_rf1'), null, 'again', null);
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 5. a second refund while one is in flight -> 22023'; end $$;
commit;

-- 6. Razorpay answers 'pending'; then the webhook says 'processed'; no double processing
begin;
select t.service();
select public.record_refund((select id from public.refunds), 'pay_rf1', 'rfnd_1', 'pending', 100);
select t.ok((select status from public.payments where razorpay_payment_id = 'pay_rf1') = 'paid', '6. a pending refund leaves the payment paid');
select public.record_refund(null, 'pay_rf1', 'rfnd_1', 'processed', 100, null, '{"event":"refund.processed"}');
select t.ok((select status from public.payments where razorpay_payment_id = 'pay_rf1') = 'refunded', '6. processed: the payment is refunded');
select t.ok((select count(*) from public.refunds) = 1 and (select status from public.refunds) = 'processed' and (select razorpay_refund_id from public.refunds) = 'rfnd_1', '6. one refund row, processed, with its Razorpay id');
select t.ok((select plan_until from public.accounts where owner_id = '00000000-0000-4000-8000-000000002701') <= now(), '6. the plan it bought has ended');
-- redelivery, and a late "pending", change nothing
select public.record_refund(null, 'pay_rf1', 'rfnd_1', 'processed', 100);
select public.record_refund((select id from public.refunds), 'pay_rf1', 'rfnd_1', 'pending', 100);
select t.ok((select count(*) from public.refunds) = 1 and (select status from public.refunds) = 'processed', '6. a redelivered webhook and a late pending change nothing');
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000002701');
select t.ok(not (public.my_refund_status() ->> 'eligible')::boolean, '6. a refunded payment is no longer eligible: the block disappears');
rollback;

-- 7. the approve path: begin with the request, record, request becomes refunded; a failure leaves it open
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000002702', 'indie', 'lifetime')), 'order_rf3');
select public.activate_payment('order_rf3', 'pay_rf3');
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000002702');
select public.request_refund((select id from public.payments where razorpay_payment_id = 'pay_rf3'), 'not_delivered', 'plan never showed');
commit;
begin;
select t.service();
select public.begin_refund((select id from public.payments where razorpay_payment_id = 'pay_rf3'), 10000, 'partial goodwill', null, (select id from public.refund_requests where status = 'pending'));
select public.record_refund((select id from public.refunds where status = 'initiated'), 'pay_rf3', null, 'failed', 10000, 'Razorpay said no');
select t.ok((select status from public.refund_requests where payment_id = (select id from public.payments where razorpay_payment_id = 'pay_rf3')) = 'pending', '7. a failed refund leaves the request pending');
select t.ok((select status from public.payments where razorpay_payment_id = 'pay_rf3') = 'paid', '7. and the payment paid');
select public.begin_refund((select id from public.payments where razorpay_payment_id = 'pay_rf3'), null, 'retry', null, (select id from public.refund_requests where status = 'pending'));
select t.ok((select count(*) from public.refunds where payment_id = (select id from public.payments where razorpay_payment_id = 'pay_rf3')) = 2, '7. a failed attempt does not block a retry');
select public.record_refund((select id from public.refunds where status = 'initiated'), 'pay_rf3', 'rfnd_3', 'processed', (select amount_paise from public.payments where razorpay_payment_id = 'pay_rf3'));
select t.ok((select status from public.refund_requests where payment_id = (select id from public.payments where razorpay_payment_id = 'pay_rf3')) = 'refunded', '7. the request becomes refunded');
-- a refund made in the Razorpay dashboard is recorded too
select public.record_refund(null, 'pay_rf2', 'rfnd_dash', 'processed', 100);
select t.ok((select status from public.payments where razorpay_payment_id = 'pay_rf2') = 'refunded' and exists (select 1 from public.refunds where razorpay_refund_id = 'rfnd_dash'), '7. a dashboard refund heard by the webhook is recorded and ends the plan');
commit;
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((select count(*) from public.admin_list_refunds()) = 4, '7. admin_list_refunds shows every attempt (4)');
select t.ok(public.admin_set_refund_requests_enabled(false) = false, '7. the admin turns the switch back off');
select t.ok(not public.refund_requests_enabled(), '7. and it reads off');
rollback;
