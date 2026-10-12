-- ============================================================
-- SECTION 47 CHECKS — total delete keeps the invoice, not the person
-- ------------------------------------------------------------
-- Runs after §45, §46 and §47 have loaded. Own people (…4701 upward). The
-- base admin …000a is the owner §45's backfill made.
-- ============================================================
\set ON_ERROR_STOP on

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000004701', 'del-buyer@example.com', now(), '{"full_name":"Dee Buyer"}'),
  ('00000000-0000-4000-8000-000000004702', 'del-keep@example.com', now(), '{"full_name":"Kay Keeper"}');

begin;
select t.service();
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004701', 'indie', 'lifetime')), 'order_d1');
select public.activate_payment('order_d1', 'pay_d1');
select public.attach_razorpay_order((select payment_id from public.create_pending_payment('00000000-0000-4000-8000-000000004702', 'starter', 'lifetime')), 'order_d2');
select public.activate_payment('order_d2', 'pay_d2');
commit;

select t.ok((select buyer_name = 'Dee Buyer' and buyer_email = 'del-buyer@example.com' from public.invoices where razorpay_order_id = 'order_d1'),
  '47.0 before the delete the invoice names the buyer');
select number as inv_no, amount_paise as inv_amt, fy as inv_fy, seq as inv_seq from public.invoices where razorpay_order_id = 'order_d1' \gset

begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select public.admin_delete_user('00000000-0000-4000-8000-000000004701', 'del-buyer@example.com') as del \gset
select t.reset();
commit;

select t.ok(not exists (select 1 from auth.users where id = '00000000-0000-4000-8000-000000004701')
        and not exists (select 1 from public.payments where user_id = '00000000-0000-4000-8000-000000004701'),
  '47.1 the person and their payments are gone');
select t.ok(exists (select 1 from public.invoices where number = :'inv_no' and amount_paise = :inv_amt and fy = :'inv_fy' and seq = :inv_seq),
  '47.2 the invoice survives with its number, financial year, sequence and amount');
select t.ok((select buyer_name = 'Deleted customer' and buyer_email is null and buyer_gstin is null from public.invoices where number = :'inv_no'),
  '47.3 the invoice no longer names the buyer: name replaced, e-mail and GSTIN cleared');
select t.ok((:'del'::jsonb ->> 'invoices_anonymised')::int = 1 and (:'del'::jsonb ->> 'invoices_retained')::int = 1,
  '47.4 the reply says how many invoices were kept and anonymised');
select t.ok((select buyer_name = 'Kay Keeper' and buyer_email = 'del-keep@example.com' from public.invoices where razorpay_order_id = 'order_d2'),
  '47.5 another buyer''s invoice is untouched');
select t.ok(not exists (select 1 from public.invoice_buyer_details where user_id = '00000000-0000-4000-8000-000000004701'),
  '47.6 the GSTIN given at checkout is gone');
begin;
select t.claims('00000000-0000-4000-8000-00000000000a');
select t.ok(t.raises($$select public.admin_delete_user('00000000-0000-4000-8000-000000004702', 'wrong@example.com')$$, '22023'),
  '47.7 the typed e-mail is still required');
select t.reset();
commit;
