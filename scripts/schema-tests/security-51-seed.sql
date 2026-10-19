-- ============================================================
-- SECTION 51 SEED — loaded BEFORE §51's first load
-- ------------------------------------------------------------
-- What the live database already holds and §51's backfills have to
-- mark, made with the PRE-§51 functions so the rows look exactly as
-- live ones do:
--   * a duplicate payment: two Basic orders opened before either was
--     paid, then both paid. The second applied no plan (activate_payment
--     applies only a HIGHER plan) and must stop counting as upgrade
--     credit once plan_applied is backfilled.
--   * an orphaned referral code still carrying a deleted member's
--     address in its note.
-- security-51.sql asserts what the backfill made of them.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000005107', 's49-dup-old@example.com', now(), '{}');

begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005107', 'starter', 'lifetime')), 'order_49d1');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005107', 'starter', 'lifetime')), 'order_49d2');
select public.activate_payment('order_49d1', 'pay_49d1');
select t.reset();
commit;
-- a later transaction, so the duplicate's paid_at is later than the first's
begin;
select t.service();
select public.activate_payment('order_49d2', 'pay_49d2');
select t.reset();
commit;

insert into public.promo_codes (code, percent_off, kind, owner_user_id, note)
values ('REF-S49OLD', 10, 'referral', null, 'Referral: s49-gone@example.com');
