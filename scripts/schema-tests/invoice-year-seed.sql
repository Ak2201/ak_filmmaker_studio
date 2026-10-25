-- ============================================================
-- §57 SEED — made BEFORE §57, so the backfill has an invoice with no
-- year to fill: I1 buys Basic for a year (an invoice is issued by the
-- §28 trigger, with valid_from / valid_until absent). Loaded before §57.
-- ============================================================
\set ON_ERROR_STOP on
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000005701', 'i1@example.com', now(), '{}');
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005701', 'starter', 'year')), 'order_i1_1');
select public.activate_payment('order_i1_1', 'pay_i1_1');
commit;
select t.reset();
