-- ============================================================
-- SECTION 35 CHECKS — receipt and refund e-mails, sent once
-- ------------------------------------------------------------
-- The checks listed at 35.7, executed. Runs after §35 has loaded on top
-- of everything else, with its own people (…3501 upward). A (…00a) is
-- still the administrator. Payments are made through the service-role
-- functions, as the edge functions would.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000003501', 'mail1@example.com', now(), '{"full_name":"Mia Mail"}'),
  ('00000000-0000-4000-8000-000000003502', 'mail2@example.com', now(), '{}');

begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000003501', 'indie', 'lifetime')), 'order_m1');
select public.activate_payment('order_m1', 'pay_m1');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000003502', 'starter', 'lifetime')), 'order_m2');
select public.activate_payment('order_m2', 'pay_m2');
commit;

-- 1. the invoice carries the payment's facts ------------------------------
select t.ok((select razorpay_payment_id = 'pay_m1' and razorpay_order_id = 'order_m1' and paid_at is not null and emailed_at is null
               from public.invoices where razorpay_order_id = 'order_m1'), '35.1 a new invoice carries the Razorpay ids and paid_at, unmailed');
select t.ok(not exists (select 1 from public.invoices i join public.payments p on p.id = i.payment_id
                         where p.razorpay_order_id is not null and i.razorpay_order_id is distinct from p.razorpay_order_id),
            '35.1 every earlier invoice was backfilled');

-- 2/3. claim once, release, claim again -----------------------------------
begin;
select t.service();
select t.ok((select count(*) from public.claim_receipt_email('order_m1')) = 1, '35.2 the first claim gets the invoice');
select t.ok((select count(*) from public.claim_receipt_email('order_m1')) = 0, '35.2 a second claim gets nothing');
select t.ok((select buyer_email from public.invoices where razorpay_order_id = 'order_m1') = 'mail1@example.com', '35.2 ... and the row names the buyer');
select public.release_receipt_email((select id from public.invoices where razorpay_order_id = 'order_m1'));
select t.ok((select count(*) from public.claim_receipt_email('order_m1')) = 1, '35.3 after a release, the next claim gets it again');
select t.ok((select count(*) from public.claim_receipt_email('order_nope')) = 0, '35.2 an unknown order claims nothing');
commit;

-- 4. nobody but the service role ------------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000003501');
do $$ begin
  perform public.claim_receipt_email('order_m2');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 35.4 authenticated claim_receipt_email -> 42501'; end $$;
do $$ begin
  perform public.claim_refund_email('x', 'processed');
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 35.4 authenticated claim_refund_email -> 42501'; end $$;
rollback;
begin;
set local role anon;
do $$ begin
  perform public.release_receipt_email(gen_random_uuid());
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 35.4 anon release_receipt_email -> 42501'; end $$;
rollback;
select t.ok((select emailed_at is null from public.invoices where razorpay_order_id = 'order_m2'), '35.4 ... and the refused claim stamped nothing');

-- 5. refunds ----------------------------------------------------------------
begin;
select t.service();
select public.begin_refund((select id from public.payments where razorpay_payment_id = 'pay_m2'), null, 'duplicate charge', '00000000-0000-4000-8000-00000000000a');
select public.record_refund((select r.id from public.refunds r join public.payments p on p.id = r.payment_id where p.razorpay_payment_id = 'pay_m2'),
                            'pay_m2', 'rfnd_m2', 'failed', null, 'declined', null);
select t.ok((select count(*) from public.claim_refund_email('rfnd_m2', 'processed')) = 0, '35.5 a failed refund is not claimed as processed');
select t.ok((select count(*) from public.claim_refund_email('rfnd_m2', 'failed')) = 1, '35.5 ... it is claimed as failed, once');
select t.ok((select count(*) from public.claim_refund_email('rfnd_m2', 'failed')) = 0, '35.5 ... and not twice');
select public.record_refund(null, 'pay_m2', 'rfnd_m2', 'processed', null, null, null);
create temp table m5 on commit drop as select * from public.claim_refund_email('rfnd_m2', 'processed');
select t.ok((select count(*) from m5) = 1, '35.5 the same refund, later processed, is mailed again as processed');
select t.ok((select buyer_email = 'mail2@example.com' and invoice_number like 'FMS/%' and amount_paise > 0 and status = 'processed' from m5),
            '35.5 the row carries the buyer, the invoice number, the amount and the status');
select t.ok((select count(*) from public.claim_refund_email('rfnd_m2', 'processed')) = 0, '35.5 a redelivered refund.processed claims nothing');
select public.release_refund_email((select refund_id from m5));
select t.ok((select count(*) from public.claim_refund_email('rfnd_m2', 'processed')) = 1, '35.5 after a release it can be sent again');
do $$ begin
  perform public.claim_refund_email('rfnd_m2', 'pending');
  raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 35.5 a pending refund is not mailable -> 22023'; end $$;
commit;

-- 6. the console's resend ---------------------------------------------------
begin;
select t.claims('00000000-0000-4000-8000-000000003501');
do $$ begin
  perform public.admin_resend_receipt((select id from public.invoices where razorpay_order_id = 'order_m1'));
  raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 35.6 non-admin admin_resend_receipt -> 42501'; end $$;
rollback;
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(public.admin_resend_receipt((select id from public.invoices where razorpay_order_id = 'order_m1')) = 'order_m1', '35.6 admin resend answers the order id');
select t.service();
select t.ok((select count(*) from public.claim_receipt_email('order_m1')) = 1, '35.6 ... and the next claim gets the invoice');
commit;
