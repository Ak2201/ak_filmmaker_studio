-- ============================================================
-- 57. THE YEAR ON THE INVOICE — valid_from / valid_until
-- ------------------------------------------------------------
-- Owner, 22 Oct 2026: the receipt PDF (src/lib/invoice-pdf.js) shows the
-- year a payment bought ("Plan valid 21 Oct 2026 – 21 Oct 2027"). Since §52
-- a plan is a year, and that year is ON THE PAYMENT (payments.starts_at /
-- ends_at, set by activate_payment in the same UPDATE that marks it paid,
-- so the invoice trigger already sees them). The invoice did not carry it.
--
-- One shape, borrowed from §35: invoices_payment_facts(), the BEFORE INSERT
-- trigger that copies the Razorpay ids and paid_at from the payment, now
-- copies the year too. issue_invoice() is NOT restated. A payment that
-- applied no plan (a duplicate, a refused activation) has no ends_at, so
-- its invoice carries no year and the PDF prints none.
--
-- my_invoices() and admin_list_invoices() are `setof invoices`, so the two
-- new columns reach the client with no restatement (§35 relied on the same).
--
-- The year printed is the one the payment BOUGHT. A later refund takes
-- that year off the account (§52 mark_payment_refunded) and does not edit
-- the invoice: an invoice is a record of what was sold.
--
-- Run AFTER §35 (it restates §35's trigger function) and after §52 (whose
-- payments carry starts_at / ends_at). Re-runnable: the backfill only fills
-- an invoice whose year is still empty.
-- ============================================================

-- 57.1 the two columns ---------------------------------------------------
alter table public.invoices add column if not exists valid_from  timestamptz;
alter table public.invoices add column if not exists valid_until timestamptz;

-- 57.2 the trigger copies the year with the other payment facts ----------
create or replace function public.invoices_payment_facts()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  select p.razorpay_payment_id, p.razorpay_order_id, p.paid_at,
         case when p.ends_at is not null then p.starts_at end, p.ends_at
    into new.razorpay_payment_id, new.razorpay_order_id, new.paid_at,
         new.valid_from, new.valid_until
    from public.payments p where p.id = new.payment_id;
  return new;
end;
$fn$;
revoke execute on function public.invoices_payment_facts() from public, anon, authenticated;
drop trigger if exists invoices_payment_facts on public.invoices;
create trigger invoices_payment_facts before insert on public.invoices
  for each row execute function public.invoices_payment_facts();

-- 57.3 once: invoices issued before this section -------------------------
update public.invoices i
   set valid_from = p.starts_at, valid_until = p.ends_at
  from public.payments p
 where p.id = i.payment_id
   and i.valid_until is null
   and p.ends_at is not null;

notify pgrst, 'reload schema';

-- 57.4 CHECKS TO RUN LIVE (read-only) -----------------------------------
-- select number, valid_from, valid_until from public.invoices order by issued_at desc limit 5;
-- select count(*) filter (where valid_until is null) as no_year, count(*) as all_invoices from public.invoices;
