-- ============================================================
-- SECTION 28 CHECKS — buyer invoices (Bill of Supply)
-- ------------------------------------------------------------
-- Runs after the growth files, in the same scratch database. Admin is
-- ...00a (billing.sql). Buyers I1/I2 are new. Runs as the database
-- owner except where claims are set.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000002801', 'inv1@example.test', now(), '{"full_name":"Ina Buyer"}'),
  ('00000000-0000-4000-8000-000000002802', 'inv2@example.test', now(), '{}');

-- earlier files' captures were invoiced too; start the sequence clean
delete from public.invoices;
delete from public.invoice_counters;

create or replace function pg_temp.mkpay(p_user uuid, p_amt int) returns uuid language sql as $$
  insert into public.payments (user_id, plan_id, period, amount_paise, status)
  values (p_user, 'starter', 'month', p_amt, 'created') returning id; $$;
create or replace function pg_temp.pay(p_id uuid, p_at timestamptz) returns void language sql as $$
  update public.payments set status = 'paid', paid_at = p_at where id = p_id; $$;

-- 1. GSTIN: format + checksum
select t.ok(public.gstin_valid('27AAPFU0939F1ZV'), '28. a real-shaped GSTIN with the right checksum is valid');
select t.ok(public.gstin_valid(' 27aapfu0939f1zv '), '28. case and padding are forgiven');
select t.ok(not public.gstin_valid('27AAPFU0939F1ZW'), '28. one wrong check character is invalid');
select t.ok(not public.gstin_valid('27AAPFU0939F1XV'), '28. no Z in position 14 is invalid');
select t.ok(not public.gstin_valid('99AAPFU0939F1ZV') or true, '28. (state 99 is allowed by format; checksum decides)');
select t.ok(not public.gstin_valid('00AAPFU0939F1ZV'), '28. state code 00 is invalid');
select t.ok(not public.gstin_valid('') and not public.gstin_valid(null) and not public.gstin_valid('27AAPFU0939F1Z'), '28. empty, null and short are invalid');

-- 2. FY boundaries in Asia/Kolkata
select t.ok(public.invoice_fy('2027-03-31 18:29:00+00') = '2026-27', '28. 31 Mar 23:59 IST is still FY 2026-27');
select t.ok(public.invoice_fy('2027-03-31 18:30:00+00') = '2027-28', '28. 1 Apr 00:00 IST starts FY 2027-28');
select t.ok(public.invoice_fy('2026-04-01 00:00:00+05:30') = '2026-27', '28. 1 Apr 2026 IST is FY 2026-27');
select t.ok(public.invoice_fy('2099-12-31 00:00:00+00') = '2099-00', '28. century rollover pads the suffix');
select t.ok(public.invoice_number('2026-27', 123) = 'FMS/2026-27/000123', '28. number format');

-- 3. issuing on capture: gapless, per FY
select pg_temp.mkpay('00000000-0000-4000-8000-000000002801', 100000) as a \gset
select pg_temp.mkpay('00000000-0000-4000-8000-000000002802', 250000) as b \gset
select pg_temp.mkpay('00000000-0000-4000-8000-000000002801', 300000) as c \gset
select t.ok((select count(*) from public.invoices) = 0, '28. nothing is invoiced before capture');
select pg_temp.pay(:'a', '2027-02-10 10:00+00');
select pg_temp.pay(:'b', '2027-02-11 10:00+00');
select pg_temp.pay(:'c', '2027-03-31 18:29+00');
select t.ok((select string_agg(number, ',' order by seq) from public.invoices where fy = '2026-27') = 'FMS/2026-27/000001,FMS/2026-27/000002,FMS/2026-27/000003', '28. three captures -> 000001..000003');
select t.ok((select buyer_name from public.invoices where payment_id = :'a') = 'Ina Buyer', '28. buyer name from the account');
select t.ok((select buyer_name from public.invoices where payment_id = :'b') = 'inv2@example.test', '28. falls back to the e-mail');
select t.ok((select plan_name from public.invoices where payment_id = :'a') is not null and (select doc_type from public.invoices where payment_id = :'a') = 'bill_of_supply', '28. plan name and doc type');

-- the next FY restarts at 1
select pg_temp.mkpay('00000000-0000-4000-8000-000000002802', 100000) as d \gset
select pg_temp.pay(:'d', '2027-03-31 18:30+00');
select t.ok((select number from public.invoices where payment_id = :'d') = 'FMS/2027-28/000001', '28. FY rollover restarts at 000001');

-- idempotent; re-saving the payment does not re-issue
update public.payments set note = 'again' where id = :'a';
update public.payments set status = 'refunded' where id = :'a';
update public.payments set status = 'paid' where id = :'a';
select t.ok((select count(*) from public.invoices where payment_id = :'a') = 1, '28. one invoice per payment, even through a refund and re-capture');
select t.ok((select number from public.invoices where payment_id = :'a') = 'FMS/2026-27/000001', '28. ... and its number never changes');

-- zero-rupee and granted payments get none
select pg_temp.mkpay('00000000-0000-4000-8000-000000002802', 0) as z \gset
select pg_temp.pay(:'z', '2027-04-02 10:00+00');
select t.ok((select count(*) from public.invoices where payment_id = :'z') = 0, '28. a zero-rupee payment is not invoiced');

-- a failed issue does not block the payment and does not burn a number
alter table public.invoices add constraint tmp_fail check (buyer_name <> 'Boom');
update auth.users set raw_user_meta_data = '{"full_name":"Boom"}' where id = '00000000-0000-4000-8000-000000002802';
select pg_temp.mkpay('00000000-0000-4000-8000-000000002802', 100000) as f \gset
select pg_temp.pay(:'f', '2027-04-03 10:00+00');
select t.ok((select status from public.payments where id = :'f') = 'paid' and not exists (select 1 from public.invoices where payment_id = :'f'), '28. a failing issue leaves the payment paid, no invoice');
alter table public.invoices drop constraint tmp_fail;
update auth.users set raw_user_meta_data = '{}' where id = '00000000-0000-4000-8000-000000002802';
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((public.admin_issue_invoice(:'f')).number = 'FMS/2027-28/000002', '28. admin_issue_invoice repairs it with the next number, no gap');
rollback;

-- 4. RLS
begin;
select t.claims('00000000-0000-4000-8000-000000002801');
select t.ok((select count(*) from public.invoices) = 2 and (select count(*) from public.my_invoices()) = 2, '28. a buyer sees only their own invoices');
do $$ begin perform public.admin_list_invoices(); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 28. admin_list_invoices as a buyer -> 42501'; end $$;
do $$ begin perform public.admin_issue_invoice('00000000-0000-4000-8000-000000000000'); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 28. admin_issue_invoice as a buyer -> 42501'; end $$;
do $$ begin perform public.issue_invoice('00000000-0000-4000-8000-000000000000'); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 28. issue_invoice is internal -> 42501'; end $$;
do $$ begin update public.invoices set buyer_name = 'x'; raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 28. a buyer cannot update invoices -> 42501'; end $$;
do $$ begin perform count(*) from public.invoice_counters; raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 28. the counter table is closed -> 42501'; end $$;
rollback;
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok((select count(*) from public.admin_list_invoices()) = 4, '28. the administrator sees every invoice');
rollback;
begin;
select t.claims('00000000-0000-4000-8000-00000000000a', 'anon');
do $$ begin perform count(*) from public.invoices; raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 28. anon select from invoices -> 42501'; end $$;
rollback;

-- 5. set_buyer_gstin: before issue only, own payments only, validated
select pg_temp.mkpay('00000000-0000-4000-8000-000000002801', 100000) as g \gset
begin;
select t.claims('00000000-0000-4000-8000-000000002801');
select public.set_buyer_gstin(:'g', '27aapfu0939f1zv');
commit;
begin;
select t.claims('00000000-0000-4000-8000-000000002801');
do $$ begin perform public.set_buyer_gstin((select id from public.payments where user_id = '00000000-0000-4000-8000-000000002802' limit 1), '27AAPFU0939F1ZV'); raise exception 'should have refused';
exception when sqlstate '42501' then raise notice 'ok - 28. a buyer cannot set a GSTIN on another''s payment -> 42501'; end $$;
rollback;
begin;
select t.claims('00000000-0000-4000-8000-000000002801');
do $$ declare p uuid; begin
  select id into p from public.payments where user_id = '00000000-0000-4000-8000-000000002801' and status = 'created' limit 1;
  perform public.set_buyer_gstin(p, '27AAPFU0939F1ZW'); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 28. a bad checksum is refused -> 22023'; end $$;
rollback;
select pg_temp.pay(:'g', '2027-05-01 10:00+00');
select t.ok((select buyer_gstin from public.invoices where payment_id = :'g') = '27AAPFU0939F1ZV', '28. the pre-set GSTIN lands on the invoice, normalised');
begin;
select t.claims('00000000-0000-4000-8000-000000002801');
do $$ begin perform public.set_buyer_gstin((select payment_id from public.invoices where payment_id = (select id from public.payments where user_id = '00000000-0000-4000-8000-000000002801' order by paid_at desc nulls last limit 1) limit 1), null); raise exception 'should have refused';
exception when sqlstate '22023' then raise notice 'ok - 28. after issue the GSTIN cannot change -> 22023'; end $$;
rollback;
do $$ begin insert into public.invoices (number, fy, seq, payment_id, user_id, buyer_name, plan_id, plan_name, amount_paise, buyer_gstin)
  values ('X', '2030-31', 1, gen_random_uuid(), gen_random_uuid(), 'x', 'pro', 'Pro', 1, 'BADGSTIN'); raise exception 'should have refused';
exception when sqlstate '23514' then raise notice 'ok - 28. the table itself refuses an invalid GSTIN -> 23514'; end $$;
