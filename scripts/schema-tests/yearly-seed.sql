-- ============================================================
-- §52 SEED — made with the functions BEFORE §52, so the backfill has
-- something to switch: Y4 bought Pro for good (a real payment), G5 was
-- GRANTED Pro for good (no payment). Loaded before §52's first run.
-- ============================================================
\set ON_ERROR_STOP on
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000005204', 'y4@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000005205', 'g5@example.com', now(), '{}');
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_set_next_price('starter', null, null);
select public.admin_set_next_price('indie',   null, null);
select public.admin_set_next_price('pro',     null, null);
select public.admin_set_plan('starter', '{"price_paise": 59900}');
select public.admin_set_plan('indie',   '{"price_paise": 79900}');
select public.admin_set_plan('pro',     '{"price_paise": 99900}');
select public.admin_grant_plan('00000000-0000-4000-8000-000000005205', 'pro', 0, 'seed: a grant for good');
commit;
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005204', 'pro', 'lifetime')), 'order_y4_seed');
select public.activate_payment('order_y4_seed', 'pay_y4_seed');
commit;
