-- ============================================================
-- 48. REFUNDS FOLLOW THE ROLE MATRIX; SEATS FOLLOW THE PLAN; A DECLINE STICKS
-- ------------------------------------------------------------
-- NOT YET RUN LIVE. Three narrow corrections, each at the last point that
-- decides, each restating ONE function body from an earlier section plus a
-- marked block (the rest is byte for byte the latest definition):
--
--  48.1 begin_refund() (§27.6) refuses an actor who is not an owner or a
--       finance administrator. It is service-only, and the rzp-refund edge
--       function passes the signed-in caller as p_admin — so the database is
--       a second gate behind the function's own require_role(['finance'])
--       call, not a replacement for it. Same rule as require_role(): an admin
--       member with no admin_roles row reads as owner.
--
--  48.2 record_refund() (§27.6) settles a linked refund request as
--       'refunded' only when Razorpay says the refund is PROCESSED. While it
--       is pending the request moves to 'approved' (the finance actor who
--       issued it approved it), so a refund that later fails leaves an open,
--       approved request to retry rather than a request that reads refunded
--       with no money moved. The plan was already ended only on 'processed';
--       that is unchanged.
--
--  48.3 enforce_seat_limit() (§v5) caps the stored accounts.seat_limit by
--       the seats limit of the plan the account is on RIGHT NOW
--       (account_plan()), so a timed grant that lapses or a refunded plan
--       stops admitting new seats without a background job. And
--       mark_payment_refunded() (§27.7) brings seat_limit back down to the
--       free plan's cap in the same update that ends the plan, so the
--       stored column agrees with what the trigger enforces.
--
--  48.4 A DECLINE IS DURABLE. invite_requests.last_declined_at is set by a
--       trigger whenever a request becomes 'declined' and cleared only when
--       it becomes 'approved' (an administrator's approval, or a membership
--       inserted by an administrator / a redeemed code, through the §14
--       close-on-membership trigger). request_invite() never touches it, so
--       a re-ask after the seven-day wait puts the account back in the queue
--       without reopening self-service admission: start_trial() (§30)
--       refuses a non-member while it is set. Ordinary trials (no request,
--       or a request never declined) and code trials (the code's membership
--       approves the request) are unaffected.
--
-- REQUIRES §45 (admin_roles, require_role). Re-runnable.
-- ============================================================

-- 48.1 begin_refund: the actor must be owner or finance --------------------
create or replace function public.begin_refund(p_payment uuid, p_amount int, p_reason text, p_admin uuid, p_request uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare pay public.payments; amt int; f public.refunds; q public.refund_requests; em text;
begin
  perform public.billing_require_service();
  -- §48: the same matrix as require_role(array['finance']), asked of the
  -- actor the edge function names (it runs as the service role, so
  -- auth.uid() is not the caller here).
  if p_admin is null
     or not exists (select 1 from public.studio_members m
                     where m.user_id = p_admin and m.role = 'admin' and m.disabled_at is null)
     or coalesce((select r.role from public.admin_roles r where r.user_id = p_admin), 'owner') not in ('owner','finance') then
    raise exception 'Only an owner or a finance administrator can refund a payment.' using errcode = '42501';
  end if;
  -- end §48
  select * into pay from public.payments p where p.id = p_payment for update;
  if pay.id is null then raise exception 'No such payment' using errcode = '22023'; end if;
  if pay.status = 'refunded' then raise exception 'That payment has already been refunded' using errcode = '22023'; end if;
  if pay.status <> 'paid' or pay.razorpay_payment_id is null or pay.amount_paise <= 0 then
    raise exception 'Only a captured payment can be refunded (this one is %)', pay.status using errcode = '22023';
  end if;
  if exists (select 1 from public.refunds r where r.payment_id = pay.id and r.status in ('initiated','pending','processed')) then
    raise exception 'A refund for that payment is already in progress' using errcode = '22023';
  end if;
  amt := coalesce(p_amount, pay.amount_paise);
  if amt < 1 or amt > pay.amount_paise then
    raise exception 'The amount must be between 1 paisa and the % paise that was paid', pay.amount_paise using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'A reason is required' using errcode = '22023'; end if;
  if p_request is not null then
    select * into q from public.refund_requests r where r.id = p_request for update;
    if q.id is null or q.payment_id <> pay.id then raise exception 'That request is not about this payment' using errcode = '22023'; end if;
    if q.status not in ('pending','approved') then raise exception 'That request was already %', q.status using errcode = '22023'; end if;
  end if;
  insert into public.refunds (payment_id, request_id, amount_paise, reason, refunded_by)
  values (pay.id, p_request, amt, left(btrim(p_reason), 500), p_admin) returning * into f;
  select u.email::text into em from auth.users u where u.id = pay.user_id;
  return jsonb_build_object('refund_id', f.id, 'razorpay_payment_id', pay.razorpay_payment_id, 'amount_paise', amt, 'email', em, 'plan_id', pay.plan_id);
end;
$fn$;

-- 48.2 record_refund: a request is 'refunded' only when the money moved ----
create or replace function public.record_refund(p_refund uuid, p_payment_rzp text, p_rzp_refund text, p_status text, p_amount int, p_error text default null, p_raw jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare f public.refunds; pay public.payments;
begin
  perform public.billing_require_service();
  if p_status not in ('pending','processed','failed') then raise exception 'Unknown refund status' using errcode = '22023'; end if;
  select * into f from public.refunds r where (p_refund is not null and r.id = p_refund) or (p_rzp_refund is not null and r.razorpay_refund_id = p_rzp_refund)
   order by (r.id = p_refund) desc nulls last limit 1 for update;
  if f.id is null then
    -- A refund made outside the console (the Razorpay dashboard): record it.
    select * into pay from public.payments p where p.razorpay_payment_id = p_payment_rzp;
    if pay.id is null or p_rzp_refund is null or coalesce(p_amount, 0) < 1 then return; end if;
    insert into public.refunds (payment_id, razorpay_refund_id, amount_paise, status, reason, processed_at, raw)
    values (pay.id, p_rzp_refund, p_amount, p_status, 'Made in the Razorpay dashboard', case when p_status = 'processed' then now() end, p_raw)
    returning * into f;
  else
    -- never walk a settled row backwards (a late 'pending' after 'processed')
    if f.status = 'processed' and p_status <> 'processed' then return; end if;
    update public.refunds r set status = p_status, razorpay_refund_id = coalesce(r.razorpay_refund_id, p_rzp_refund), error = p_error,
           processed_at = case when p_status = 'processed' then coalesce(r.processed_at, now()) else r.processed_at end,
           raw = coalesce(p_raw, r.raw)
     where r.id = f.id returning * into f;
  end if;
  if p_status = 'processed' then
    select * into pay from public.payments p where p.id = f.payment_id;
    perform public.mark_payment_refunded(pay.razorpay_payment_id, p_raw);
  end if;
  -- §48: 'refunded' only once processed; pending means approved, in flight.
  if p_status = 'processed' and f.request_id is not null then
    update public.refund_requests q set status = 'refunded', decided_at = coalesce(q.decided_at, now()),
           decided_by = coalesce(q.decided_by, f.refunded_by)
     where q.id = f.request_id and q.status in ('pending','approved');
  elsif p_status = 'pending' and f.request_id is not null then
    update public.refund_requests q set status = 'approved', decided_at = coalesce(q.decided_at, now()),
           decided_by = coalesce(q.decided_by, f.refunded_by)
     where q.id = f.request_id and q.status = 'pending';
  end if;
  -- end §48
end;
$fn$;

-- 48.3a mark_payment_refunded: the seat ceiling comes down with the plan ---
create or replace function public.mark_payment_refunded(p_payment_id text, p_raw jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare pay public.payments;
begin
  perform public.billing_require_service();
  select * into pay from public.payments p where p.razorpay_payment_id = p_payment_id for update;
  if pay.id is null or pay.status = 'refunded' then return; end if;
  update public.payments p set status = 'refunded', raw = coalesce(p_raw, p.raw) where p.id = pay.id;
  if pay.account_id is not null then
    perform set_config('fms.billing', 'on', true);
    update public.accounts a set plan_until = least(a.plan_until, now()), updated_at = now(),
           -- §48: back to the free plan's seat cap (never raised)
           seat_limit = least(a.seat_limit, greatest(1, coalesce(public.plan_cap(
                          (select p.limits from public.plans p where p.id = 'free'), 'seats'), 1000)))
     where a.id = pay.account_id and a.plan = pay.plan_id;
  end if;
end;
$fn$;

-- 48.3b enforce_seat_limit: the ceiling is the CURRENT plan's -------------
create or replace function public.enforce_seat_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  used int;
  lim  int;
  cur  jsonb;
begin
  if tg_op = 'UPDATE'
     and not (old.status = 'revoked' and new.status in ('pending','active')) then
    return new;
  end if;
  -- §48: a lapsed grant or a refunded plan reads as 'free' here, whatever
  -- the stored column still says.
  select p.limits into cur from public.plans p where p.id = public.account_plan(new.account_id);
  select least(a.seat_limit, greatest(1, coalesce(public.plan_cap(cur, 'seats'), 1000)))
    into lim from public.accounts a where a.id = new.account_id;
  -- end §48
  select count(*) into used
    from public.account_members
   where account_id = new.account_id
     and status in ('pending','active')
     and (tg_op = 'INSERT' or (account_id, invited_email) <> (new.account_id, new.invited_email));
  if used >= lim then
    raise exception 'Seat limit reached for this account (% of %). Add seats to invite more people.', used, lim
      using errcode = '53400';
  end if;
  return new;
end;
$$;
drop trigger if exists account_members_seat_limit on public.account_members;
create trigger account_members_seat_limit
  before insert or update on public.account_members
  for each row execute function public.enforce_seat_limit();

-- 48.4 a decline that a re-ask cannot erase -------------------------------
alter table public.invite_requests add column if not exists last_declined_at timestamptz;

create or replace function public.invite_requests_remember_decline()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if new.status = 'declined' then
    new.last_declined_at := coalesce(new.decided_at, now());
  elsif new.status = 'approved' then
    new.last_declined_at := null;
  elsif tg_op = 'UPDATE' then
    -- 'pending' (a re-ask): keep whatever was recorded, whatever the
    -- statement tried to write.
    new.last_declined_at := old.last_declined_at;
  end if;
  return new;
end;
$fn$;
revoke execute on function public.invite_requests_remember_decline() from public, anon, authenticated;
drop trigger if exists invite_requests_remember_decline on public.invite_requests;
create trigger invite_requests_remember_decline
  before insert or update on public.invite_requests
  for each row execute function public.invite_requests_remember_decline();

-- Backfill, once: today's declines, and a pending re-ask by somebody who
-- is not a member (the re-ask erased the decline it followed; a request
-- that was approved always left a membership behind). Only fills nulls,
-- so a re-run changes nothing.
update public.invite_requests r set last_declined_at = coalesce(r.decided_at, r.requested_at)
 where r.last_declined_at is null and r.status = 'declined';
update public.invite_requests r set last_declined_at = r.requested_at
 where r.last_declined_at is null and r.status = 'pending' and r.times_asked > 1
   and not exists (select 1 from public.studio_members m where m.user_id = r.user_id);

-- start_trial: §30's body, plus the marked block
create or replace function public.start_trial(p_source text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  uid  uuid := auth.uid();
  s    public.billing_settings;
  m    public.studio_members;
  src  text;
  mins int;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;

  select * into s from public.billing_settings x where x.id;
  select * into m from public.studio_members x where x.user_id = uid for update;

  if m.user_id is not null and m.disabled_at is not null then
    raise exception 'This account has been disabled.' using errcode = '42501';
  end if;
  -- A declined request is an administrator's "no". There is no other row
  -- that records it for somebody who was never a member.
  if exists (select 1 from public.invite_requests r where r.user_id = uid and r.status = 'declined') then
    raise exception 'This account was not approved.' using errcode = '42501';
  end if;
  -- §48: and a re-ask does not erase it. Only an approval clears
  -- last_declined_at. Non-members only, so a member's landing call still
  -- gets its 'used' verdict rather than an error.
  if m.user_id is null
     and exists (select 1 from public.invite_requests r where r.user_id = uid and r.last_declined_at is not null) then
    raise exception 'This account was not approved.' using errcode = '42501';
  end if;
  -- end §48

  if not coalesce(s.trial_enabled, false) then
    return jsonb_build_object('started', false, 'reason', 'disabled');
  end if;
  if m.trial_started_at is not null then
    return jsonb_build_object('started', false, 'reason', 'used');
  end if;
  -- paid_at, not status='paid': it catches a grant and a refunded buyer
  -- too, so a refund is not a way back to a fresh trial. (Do NOT use
  -- paid_credit_paise here — it filters period='lifetime' and misses
  -- grants.)
  if exists (select 1 from public.payments p where p.user_id = uid and p.paid_at is not null) then
    return jsonb_build_object('started', false, 'reason', 'paid');
  end if;

  src := case
           when p_source is not null and public.is_studio_admin() then p_source
           when m.invite_code_id is not null                      then 'code'
           else 'signup'
         end;
  mins := case when src = 'code' then coalesce(s.code_trial_days, 7) * 1440
               else coalesce(s.trial_minutes, 30) end;

  insert into public.studio_members (user_id, role, trial_started_at, trial_minutes, trial_source, trial_scope)
  values (uid, 'user', now(), mins, src,
          case when src = 'signup' then 'sample' else coalesce(s.trial_scope, 'sample') end)
  on conflict (user_id) do update
     set trial_started_at = now(),
         trial_minutes    = excluded.trial_minutes,
         trial_source     = excluded.trial_source,
         trial_scope      = excluded.trial_scope
   -- the WHERE closes the two-concurrent-calls race: the second finds
   -- trial_started_at already set and does nothing
   where public.studio_members.trial_started_at is null;

  -- Parity with the two other paths that admit somebody
  -- (activate_payment, admin_grant_plan). Inserts (name, owner_id) only,
  -- which is how it passes accounts_guard's INSERT branch; see section 19.
  perform public.account_for_buyer(uid, null);

  return jsonb_build_object('started', true, 'status', public.billing_status());
end;
$fn$;

revoke execute on function public.begin_refund(uuid, int, text, uuid, uuid)               from public, anon, authenticated;
revoke execute on function public.record_refund(uuid, text, text, text, int, text, jsonb) from public, anon, authenticated;
revoke execute on function public.mark_payment_refunded(text, jsonb)                      from public, anon, authenticated;
revoke execute on function public.start_trial(text)                                       from public, anon;
grant  execute on function public.start_trial(text)                                       to authenticated;

notify pgrst, 'reload schema';

-- 48.5 CHECKS TO RUN LIVE -------------------------------------------------
--  1. as a support-role admin, REFUND in the console -> 403, no refunds row.
--  2. select pg_get_functiondef('public.begin_refund(uuid,int,text,uuid,uuid)'::regprocedure)
--     mentions 'finance'.
--  3. select count(*) from information_schema.columns
--      where table_name = 'invite_requests' and column_name = 'last_declined_at';  -> 1
-- Test file: scripts/schema-tests/refund-seat-trial.sql (npm run test:schema).
-- END OF SECTION 48
-- ============================================================
