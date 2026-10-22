-- ============================================================
-- SECTION 57 CHECKS — the invoice carries the year its payment bought.
-- Its own people (…57xx). I1 was seeded before §57 (invoice-year-seed.sql).
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000005702', 'i2@example.com', now(), '{}'),
  ('00000000-0000-4000-8000-000000005703', 'i3@example.com', now(), '{}');

create or replace function t.inv_of(p_order text) returns public.invoices language sql as $$
  select i.* from public.invoices i join public.payments p on p.id = i.payment_id where p.razorpay_order_id = p_order $$;
create or replace function t.pay_of(p_order text) returns public.payments language sql as $$
  select p.* from public.payments p where p.razorpay_order_id = p_order $$;

-- 1. the backfill filled the invoice issued before §57, from its payment
select t.ok((t.inv_of('order_i1_1')).valid_until = (t.pay_of('order_i1_1')).ends_at
            and (t.inv_of('order_i1_1')).valid_from = (t.pay_of('order_i1_1')).starts_at,
  '1. an invoice issued before §57 now carries its payment''s year');

-- 2. a new purchase: the trigger copies the year at issue
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005702', 'starter', 'year')), 'order_i2_1');
select public.activate_payment('order_i2_1', 'pay_i2_1');
commit;
select t.reset();
select t.ok((t.inv_of('order_i2_1')).valid_until = (t.pay_of('order_i2_1')).ends_at
            and round(extract(epoch from ((t.inv_of('order_i2_1')).valid_until - (t.inv_of('order_i2_1')).valid_from)) / 86400) = 365,
  '2. a new invoice carries the 365-day year its payment bought');

-- 3. a renewal bought early: its invoice's year starts where the first ends
begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000005702', 'starter', 'year')), 'order_i2_2');
select public.activate_payment('order_i2_2', 'pay_i2_2');
commit;
select t.reset();
select t.ok((t.inv_of('order_i2_2')).valid_from = (t.inv_of('order_i2_1')).valid_until,
  '3. a renewal''s invoice starts where the first year ends');

-- 4. a paid payment that bought no year (no ends_at) carries no year
begin;
select t.service();
insert into public.payments (user_id, plan_id, period, amount_paise, currency, status, razorpay_order_id)
  values ('00000000-0000-4000-8000-000000005703', 'starter', 'year', 59900, 'INR', 'created', 'order_i3_1');
update public.payments set status = 'paid', razorpay_payment_id = 'pay_i3_1', paid_at = now() where razorpay_order_id = 'order_i3_1';
commit;
select t.reset();
select t.ok((t.inv_of('order_i3_1')).id is not null and (t.inv_of('order_i3_1')).valid_from is null and (t.inv_of('order_i3_1')).valid_until is null,
  '4. an invoice for a payment with no year carries none (the PDF prints none)');

-- 5. the buyer reads the year through my_invoices()
begin;
select t.claims('00000000-0000-4000-8000-000000005702');
select t.ok((select count(*) from public.my_invoices() m where m.valid_until is not null) = 2,
  '5. my_invoices() carries valid_until to the buyer');
commit;
select t.reset();
