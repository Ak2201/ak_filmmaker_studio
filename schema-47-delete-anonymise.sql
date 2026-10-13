-- ============================================================
-- 47. TOTAL DELETE KEEPS THE INVOICE, NOT THE PERSON   RUN LIVE 13 Oct 2026
-- ------------------------------------------------------------
-- Owner decision, 12 Oct 2026: People gets a "Delete totally" button beside
-- Clear. Clear (admin_reset_user) removes the membership and the session
-- only. Delete totally is admin_delete_user(), which §45 built and which
-- already removes films, synced work, payments, team, tickets, grant, lead
-- and the sign-in. The one thing it left alone was the invoice, intact, with
-- the buyer's name, e-mail and GSTIN on it.
--
-- This section restates admin_delete_user() with ONE addition: before the
-- sign-in goes, every invoice of that person has its buyer_name replaced by
-- 'Deleted customer' and its buyer_email and buyer_gstin cleared. The number,
-- financial year, sequence, plan, amount, currency and dates are untouched,
-- so numbering stays gapless and the bill of supply is still a complete
-- statutory record. invoice_buyer_details (the GSTIN given at checkout) goes.
-- The reply gains `invoices_anonymised`.
--
-- REQUIRES §45 (its body already begins with the owner-only require_role()
-- line, kept here). Re-runnable. The body below is §45's, byte for byte,
-- plus the marked block.
-- ============================================================

create or replace function public.admin_delete_user(p_user uuid, p_confirm_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_email    text;
  v_projects int; v_payments int; v_invoices int; v_tickets int; v_leads int;
  v_is_owner boolean;
begin
  perform public.require_role(array['owner']);
  if p_user is null then raise exception 'No user given' using errcode = '22023'; end if;
  if p_user = auth.uid() then
    raise exception 'You cannot delete your own account.' using errcode = '42501';
  end if;
  select lower(btrim(u.email)) into v_email from auth.users u where u.id = p_user;
  if not found then raise exception 'There is no such account.' using errcode = '22023'; end if;
  if v_email is null or v_email = '' then
    raise exception 'That account has no e-mail address to confirm against.' using errcode = '22023';
  end if;
  if lower(btrim(coalesce(p_confirm_email, ''))) <> v_email then
    raise exception 'The e-mail address typed does not match this account. Nothing was deleted.' using errcode = '22023';
  end if;

  v_is_owner := exists (select 1 from public.studio_members m where m.user_id = p_user and m.role = 'admin' and m.disabled_at is null)
                and coalesce((select r.role from public.admin_roles r where r.user_id = p_user), 'owner') = 'owner';
  if v_is_owner and public._other_owner_count(p_user) = 0 then
    raise exception 'That account is the last owner. Make somebody else an owner first.' using errcode = '42501';
  end if;
  if exists (select 1 from public.accounts a join public.account_members m on m.account_id = a.id
              where a.owner_id = p_user and m.status = 'active' and m.user_id is not null and m.user_id <> p_user) then
    raise exception 'That person owns a team with other active members. Transfer or close the team first.' using errcode = '22023';
  end if;

  select count(*) into v_projects from public.projects where owner_id = p_user;
  select count(*) into v_payments from public.payments where user_id = p_user;
  select count(*) into v_invoices from public.invoices where user_id = p_user;

  -- audited BEFORE the work, inside the same transaction: if the delete
  -- fails the entry rolls back with it.
  perform public.admin_audit_write('user.delete', 'user', p_user::text,
    jsonb_build_object('projects', v_projects, 'payments', v_payments, 'role', case when v_is_owner then 'owner' end), null,
    'data-subject deletion; e-mail confirmed');

  -- references that would otherwise block the delete of the sign-in
  delete from public.shares where created_by = p_user;
  -- comments_set_author pins author_id/author_name on UPDATE (an author must
  -- not be editable by anybody), so it is stood down for this one statement.
  -- ALTER TABLE is transactional: a failure below puts the trigger back.
  alter table public.comments disable trigger comments_set_author;
  update public.comments set author_id = null, author_name = 'Deleted user' where author_id = p_user;
  alter table public.comments enable trigger comments_set_author;
  update public.project_data set updated_by = null where updated_by = p_user;
  update public.account_members set invited_by = null where invited_by = p_user;
  update public.invite_redemptions set viewer_email = null where lower(viewer_email) = v_email;
  delete from public.accounts where owner_id = p_user;

  -- the reset's own clean-up (admin_reset_user), kept explicit
  delete from public.invite_requests      where user_id = p_user;
  delete from public.user_active_sessions where user_id = p_user;
  delete from public.studio_members       where user_id = p_user;

  -- what is keyed by the address rather than the account
  delete from public.support_tickets where lower(email) = v_email;
  get diagnostics v_tickets = row_count;
  delete from public.email_grants    where email = v_email;
  delete from public.leads           where lower(email) = v_email;
  get diagnostics v_leads = row_count;

  insert into public.deleted_subjects (email_hash, deleted_by)
    values (public._email_hash(v_email), auth.uid())
    on conflict (email_hash) do nothing;

  -- THE INVOICES STAY, THE PERSON DOES NOT (§47). The number, financial year,
  -- sequence, plan, amount and dates are the seller's statutory record and keep
  -- the numbering gapless; the buyer's name, e-mail and GSTIN are personal data
  -- and go. Only the invoices.buyer_* columns are written; nothing else about a
  -- row moves, so claim_receipt_email() and the PDF still work on it.
  update public.invoices
     set buyer_name = 'Deleted customer', buyer_email = null, buyer_gstin = null
   where user_id = p_user;
  delete from public.invoice_buyer_details where user_id = p_user;

  -- the sign-in last; it cascades projects, payments and the rest
  delete from auth.users where id = p_user;

  return jsonb_build_object(
    'deleted', true,
    'projects_removed', v_projects,
    'payments_removed', v_payments,
    'support_tickets_removed', v_tickets,
    'lead_removed', v_leads > 0,
    'tombstone', true,
    'invoices_retained', v_invoices,
    'invoices_anonymised', v_invoices,
    'note', 'Invoices are kept as the seller''s statutory record with the buyer''s name, e-mail and GSTIN removed. The audit entry is kept.'
  );
end;
$fn$;

revoke execute on function public.admin_delete_user(uuid, text) from public, anon;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;

-- 47.1 CHECKS TO RUN LIVE -------------------------------------------------
--  1. delete a throwaway buyer: their invoice still exists, buyer_name reads
--     "Deleted customer", buyer_email and buyer_gstin are null, number and
--     amount unchanged.
--  2. the next invoice number issued is still consecutive.
-- Test file: scripts/schema-tests/delete-anonymise.sql (npm run test:schema).
-- END OF SECTION 47
-- ============================================================
