-- ============================================================
-- 49. THE SECURITY FOLLOW-UPS — money, roles, links, comments, teams
-- ------------------------------------------------------------
-- NOT YET RUN LIVE. The security audit of 18 Oct 2026 left 22 leads it
-- could not execute. Each fix below was first written as a failing check
-- against the real schema on PostgreSQL (scripts/schema-tests/
-- security-49.sql), then made to pass. Every restated function is the
-- latest earlier body byte for byte plus a block marked `§49`; the
-- require_role() lines and admin_audit_write() calls are kept.
--
--  49.1 A LIMITED CODE IS RESERVED WHEN AN ORDER OPENS. quote_for()
--       counts other buyers' open orders on the code (status 'created',
--       opened in the last hour) towards max_uses; create_pending_payment()
--       locks the code row first so two buyers cannot both see the last
--       use; activate_payment() refuses a payment on a code whose uses
--       already reached max_uses (22023, hint 'exhausted') and never
--       counts past it. Before, the cap was read only at quote time, so
--       every order opened before the first activation could be paid.
--
--  49.2 UPGRADE CREDIT FOLLOWS THE ORGANISATION. paid_credit_paise()
--       counts only payments on organisations the buyer still owns, so
--       handing a paid organisation to somebody else no longer prices a
--       re-buy at the Rs 1 floor.
--
--  49.3 A DUPLICATE IS NOT CREDIT, AND A CREDIT IS RE-CHECKED.
--       payments.plan_applied records whether activation applied the plan
--       (it is false for a second payment of a plan already held, the
--       duplicate charge refund.html promises to refund). Only payments
--       that applied a plan are credit. activate_payment() refuses an
--       order whose stored credit is larger than the credit that exists
--       when it is paid (a credited payment refunded in between).
--       begin_refund() refuses to refund a payment that a later paid
--       upgrade was credited with ("refund the upgrade first"); the
--       duplicate stays refundable because it was never credit. Backfill:
--       plan_applied for every payment already activated.
--
--  49.4 SUPPORT CANNOT LOCK AN ADMINISTRATOR OUT. admin_terminate_session()
--       with p_disable refuses an administrator target unless the caller
--       is an owner, and never disables the last enabled owner (23514).
--       Ending a session without disabling is still support-level.
--
--  49.5 NO CROSS-USER PLAN ORACLE. user_plan(uuid), user_limits(uuid),
--       is_entitled(uuid), is_studio_member(uuid) and account_plan(uuid)
--       are no longer executable by `authenticated`. No policy and no
--       invoker function uses them; the definer functions that do
--       (billing_status, studio_status, the P0402 triggers …) run as their
--       owner and are unaffected. The browser never called them.
--
--  49.6 A SCREENING PASS IS FOR A FILM THE ADMINISTRATOR OWNS.
--       admin_create_invite() refuses a target project the caller does
--       not own: a pass opens a film's synced writing to anyone holding
--       the code.
--
--  49.7 THE COLLABORATOR CAP HOLDS ON A MOVE. collaborators_plan_limit
--       fires on UPDATE OF project_id as well as INSERT.
--
--  49.8 A FILM IS NOT HANDED TO SOMEBODY WHO DID NOT ASK.
--       projects_guard_owner() refuses an owner_id change from the app (no
--       feature sends one); the service role and SQL still can. It also
--       allows anyone to DETACH a film (account_id -> null) from a team
--       its owner is no longer in, which 49.14 needs.
--
--  49.9 SHARE LINKS. claim_share() could not run: its RETURNS TABLE
--       column project_id made `on conflict (project_id, user_id)`
--       ambiguous (42702), so every claim failed. It names the primary
--       key now. And the merge keeps a grant tied to the link that
--       conferred its role: a lower or equal link never re-points or
--       un-expires a higher grant, a higher link replaces the grant with
--       its own lifetime, and a manual grant is never changed by a link.
--
--  49.10 AN OWNER MAY RESOLVE A COMMENT, NOT REWRITE IT. comments_guard()
--       refuses a body change by anyone but the author.
--
--  49.11 sh_owner_all (§8.4) is dropped; it ORed away §10.3's
--       created_by = auth.uid() check on shares.
--
--  49.12 start_trial() refuses an anonymous session, as claim_invite,
--       redeem_invite and request_invite already do.
--
--  49.13 invite_tickets(expires_at) is indexed for verify_invite's sweep.
--
--  49.14 A TEAM NEVER TAKES A MEMBER'S FILM. projects.account_id is ON
--       DELETE SET NULL (was CASCADE), so deleting an organisation
--       detaches the films in it instead of deleting other people's work;
--       and a member who leaves or is removed takes their films with them
--       (account_members trigger), so the team keeps no access to them.
--
--  49.15 A DELETED MEMBER'S ADDRESS DOES NOT OUTLIVE THEM. When a
--       referral code loses its owner (the account is deleted) its note
--       stops naming the address and the code is withdrawn. Backfill for
--       codes already orphaned.
--
-- REQUIRES §45 (studio_role, require_role, _other_owner_count), §40
-- (admin_audit_write) and §48. Re-runnable.
-- ============================================================

-- 49.3a THE COLUMN, AND ITS BACKFILL ---------------------------------------
alter table public.payments add column if not exists plan_applied boolean;
-- Already activated: the plan applied unless an EARLIER paid payment on the
-- same organisation was for the same or a higher plan (activate_payment's
-- own rule since §21). Only nulls are filled, so a second run changes
-- nothing.
update public.payments p
   set plan_applied = not exists (
         select 1 from public.payments e
          where e.account_id = p.account_id and e.id <> p.id and e.paid_at is not null
            and (e.paid_at, e.created_at) < (p.paid_at, p.created_at)
            and public.plan_rank(e.plan_id) >= public.plan_rank(p.plan_id))
 where p.plan_applied is null and p.paid_at is not null and p.period = 'lifetime';
create index if not exists payments_promo_open_idx on public.payments(promo_code, status) where promo_code is not null;

-- 49.2 / 49.3b paid_credit_paise -------------------------------------------
/** What a user has already paid for full-time access. */
create or replace function public.paid_credit_paise(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(sum(p.amount_paise), 0)::int
    from public.payments p
    -- §49: only organisations the buyer still owns, and only payments that
    -- applied a plan (a duplicate is a refund, not credit)
    join public.accounts a on a.id = p.account_id and a.owner_id = p_user
   where p.user_id = p_user and p.status = 'paid' and p.period = 'lifetime'
     and p.plan_applied is not false;
$$;
revoke execute on function public.paid_credit_paise(uuid) from public, anon, authenticated;

-- 49.1a quote_for: other buyers' open orders hold a limited code ------------
create or replace function public.quote_for(p_user uuid, p_plan text, p_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl     public.plans;
  pc     public.promo_codes;
  v_code text := nullif(upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g')), '');
  cur    text := 'free';
  credit int  := 0;
  price  int;
  due    int;
  amt    int;
  reason text;
  base   jsonb;
  held   int  := 0;
begin
  select * into pl from public.plans p where p.id = p_plan and p.active;
  price := public.effective_price(p_plan);
  if pl.id is null or coalesce(price, 0) <= 0 then
    raise exception 'That plan is not for sale' using errcode = '22023';
  end if;
  if p_user is not null then
    cur := public.user_plan(p_user);
    if cur <> 'free' and public.plan_rank(pl.id) <= public.plan_rank(cur) then
      if cur = pl.id then
        raise exception 'You already have % — for good. There is nothing to pay.', pl.name using errcode = '22023', hint = 'same_plan';
      end if;
      raise exception 'You are on % already; % is a lower plan, and paying to have less is not something we sell.',
        coalesce((select x.name from public.plans x where x.id = cur), initcap(cur)), pl.name using errcode = '22023', hint = 'downgrade';
    end if;
    credit := public.paid_credit_paise(p_user);
  end if;
  due := price - credit;
  if due < 100 then due := least(price, 100); end if;
  base := jsonb_build_object('plan_id', pl.id, 'list_paise', price, 'credit_paise', price - due,
                             'due_paise', due, 'amount_paise', due, 'discount_paise', 0, 'code', v_code,
                             'ok', true, 'reason', null, 'sentence', null,
                             'upgrade_from', case when credit > 0 then cur end,
                             'upgrade_from_name', case when credit > 0 then (select x.name from public.plans x where x.id = cur) end,
                             'paid_paise', credit,
                             -- section 30: what the card may say about a rise.
                             -- Null once the rise has fired (price = the new
                             -- one), so a card can never advertise a change
                             -- that has already happened.
                             'next_price_paise', case when price = pl.price_paise then pl.next_price_paise end,
                             'next_price_at',    case when price = pl.price_paise then pl.next_price_at end);
  if v_code is null then return base; end if;
  select * into pc from public.promo_codes c where c.code = v_code;
  -- §49: an order opened in the last hour by ANOTHER buyer holds one use
  -- until it is paid or lapses (one per buyer, however many tabs).
  if pc.code is not null and pc.max_uses is not null then
    select count(distinct x.user_id)::int into held
      from public.payments x
     where x.promo_code = pc.code and x.status = 'created'
       and x.created_at > now() - interval '60 minutes'
       and x.user_id is distinct from p_user;
  end if;
  -- end §49
  reason := case
    when pc.code is null                                                   then 'unknown'
    when pc.kind = 'gift'                                                  then 'gift'
    when not pc.active                                                     then 'inactive'
    when pc.valid_from is not null and pc.valid_from > now()               then 'inactive'
    when pc.valid_until is not null and pc.valid_until <= now()            then 'expired'
    when pc.max_uses is not null and pc.uses + held >= pc.max_uses         then 'exhausted'   -- §49: + held
    when pc.plan_ids is not null and not (pl.id = any (pc.plan_ids))       then 'not_for_plan'
    when p_user is not null and pc.owner_user_id = p_user                  then 'own_code'
  end;
  if reason is not null then
    return base || jsonb_build_object('ok', false, 'reason', reason, 'sentence', public.promo_reason_sentence(reason));
  end if;
  amt := public.promo_price(due, pc.percent_off, pc.amount_off_paise);
  return base || jsonb_build_object('amount_paise', amt, 'discount_paise', due - amt, 'kind', pc.kind,
                                    'percent_off', pc.percent_off, 'amount_off_paise', pc.amount_off_paise);
end;
$fn$;

-- 49.1b create_pending_payment: the code row is locked while it is priced --
create or replace function public.create_pending_payment(p_user uuid, p_plan text, p_period text, p_account uuid default null, p_code text default null)
returns table (payment_id uuid, amount_paise int, currency text, plan_name text, list_paise int, discount_paise int, promo_code text, credit_paise int)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pl  public.plans;
  q   jsonb;
  pid uuid;
begin
  perform public.billing_require_service();
  if exists (select 1 from public.studio_members m where m.user_id = p_user and m.disabled_at is not null) then
    raise exception 'This account has been disabled by an administrator' using errcode = '42501';
  end if;
  if p_period in ('month', 'year') then
    raise exception 'Plans are bought once, for good — not by the month or the year' using errcode = '22023';
  end if;
  select * into pl from public.plans p where p.id = p_plan and p.active;
  if pl.id is null or coalesce(pl.price_paise, 0) <= 0 then raise exception 'That plan is not for sale' using errcode = '22023'; end if;
  if p_account is not null and not exists (select 1 from public.accounts a where a.id = p_account and a.owner_id = p_user) then
    raise exception 'Not the owner of that organisation' using errcode = '42501';
  end if;
  -- §49: serialise every order on a limited code, so two buyers cannot both
  -- be quoted the last use. Held until this transaction commits, by which
  -- time this order's 'created' row is visible to the next quote.
  perform 1 from public.promo_codes c
   where c.code = nullif(upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g')), '')
     for update;
  -- end §49
  q := public.quote_for(p_user, p_plan, p_code);
  if not (q ->> 'ok')::boolean then
    raise exception '%', q ->> 'sentence' using errcode = '22023', hint = q ->> 'reason';
  end if;
  insert into public.payments (user_id, account_id, plan_id, period, amount_paise, list_paise, discount_paise, promo_code, credit_paise)
  values (p_user, p_account, p_plan, 'lifetime', (q ->> 'amount_paise')::int, (q ->> 'list_paise')::int,
          (q ->> 'discount_paise')::int, q ->> 'code', (q ->> 'credit_paise')::int)
  returning id into pid;
  return query select pid, (q ->> 'amount_paise')::int, 'INR'::text, pl.name, (q ->> 'list_paise')::int,
                      (q ->> 'discount_paise')::int, q ->> 'code', (q ->> 'credit_paise')::int;
end;
$fn$;
revoke execute on function public.create_pending_payment(uuid, text, text, uuid, text) from public, anon, authenticated;

-- 49.1c / 49.3c activate_payment ---------------------------------------------
create or replace function public.activate_payment(p_order_id text, p_payment_id text, p_raw jsonb default null)
returns table (payment_id uuid, account_id uuid, plan_id text, ends_at timestamptz, already boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pay   public.payments;
  acc   uuid;
  rep   bigint := nullif(p_raw -> 'payment' ->> 'amount', '')::bigint;
  pc    public.promo_codes;
  applied boolean;
begin
  perform public.billing_require_service();
  select * into pay from public.payments p where p.razorpay_order_id = p_order_id for update;
  if pay.id is null then raise exception 'No payment with that order id' using errcode = '22023'; end if;
  if pay.status = 'paid' then
    return query select pay.id, pay.account_id, pay.plan_id, pay.ends_at, true;
    return;
  end if;
  if pay.status <> 'created' and pay.status <> 'failed' then
    raise exception 'Payment is %', pay.status using errcode = '22023';
  end if;
  if rep is not null and rep <> pay.amount_paise then
    raise exception 'Razorpay reports % paise for an order recorded at %', rep, pay.amount_paise using errcode = '22023';
  end if;
  -- §49: a limited code never counts past its cap, and a credit that has
  -- gone (refunded, or its organisation given away) is not honoured.
  if pay.promo_code is not null then
    select * into pc from public.promo_codes c where c.code = pay.promo_code for update;
    if pc.max_uses is not null and pc.uses >= pc.max_uses then
      raise exception 'The code % was used up before this payment was confirmed, so the plan was not applied. Ask for a refund from Settings.', pay.promo_code
        using errcode = '22023', hint = 'exhausted';
    end if;
  end if;
  if pay.credit_paise > 0 and pay.credit_paise > public.paid_credit_paise(pay.user_id) then
    raise exception 'This order was priced with credit for a payment that no longer counts, so the plan was not applied. Ask for a refund from Settings.'
      using errcode = '22023', hint = 'credit_gone';
  end if;
  -- end §49
  acc := public.account_for_buyer(pay.user_id, pay.account_id);
  applied := public.plan_rank(pay.plan_id) > public.plan_rank(public.account_plan(acc));   -- §49: remembered
  if applied then
    perform public.apply_plan(acc, pay.plan_id, 'lifetime', 0);
  end if;
  update public.payments p
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(),
         account_id = acc, starts_at = now(), ends_at = null,
         raw = coalesce(p_raw, p.raw),
         plan_applied = applied   -- §49
   where p.id = pay.id;
  if pay.promo_code is not null then
    update public.promo_codes c set uses = c.uses + 1, updated_at = now() where c.code = pay.promo_code;
  end if;
  insert into public.studio_members (user_id, role) values (pay.user_id, 'user') on conflict (user_id) do nothing;
  return query select pay.id, acc, pay.plan_id, null::timestamptz, false;
end;
$fn$;
revoke execute on function public.activate_payment(text, text, jsonb) from public, anon, authenticated;

-- 49.3d begin_refund: §48's body, plus the marked block --------------------
create or replace function public.begin_refund(p_payment uuid, p_amount int, p_reason text, p_admin uuid, p_request uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare pay public.payments; amt int; f public.refunds; q public.refund_requests; em text; later public.payments;
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
  -- §49: a payment that applied a plan was credit toward any later paid
  -- upgrade; refunding it under that upgrade would leave the higher plan
  -- bought at a discount nobody paid for. Refund the upgrade first.
  if pay.plan_applied is not false then
    select * into later from public.payments x
     where x.user_id = pay.user_id and x.id <> pay.id and x.status = 'paid'
       and x.credit_paise > 0 and x.paid_at >= pay.paid_at
     order by x.paid_at limit 1;
    if later.id is not null then
      raise exception 'This payment was credited toward a later upgrade (%, paid %). Refund that payment first.',
        later.plan_id, to_char(later.paid_at, 'YYYY-MM-DD') using errcode = '22023', hint = 'credited';
    end if;
  end if;
  -- end §49
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
revoke execute on function public.begin_refund(uuid, int, text, uuid, uuid) from public, anon, authenticated;

-- 49.4 admin_terminate_session: §46's body, plus the marked block ----------
create or replace function public.admin_terminate_session(p_user uuid, p_disable boolean default false)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare n int;
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  perform public.require_role(array['support']);
  if p_user = auth.uid() and p_disable then
    raise exception 'You cannot disable your own account' using errcode = '22023';
  end if;
  -- §49: disabling an ADMINISTRATOR is an owner's act (it is a demotion
  -- the role matrix gives only to owners), and never the last owner.
  if p_disable and exists (select 1 from public.studio_members m where m.user_id = p_user and m.role = 'admin') then
    if public.studio_role() is distinct from 'owner' then
      raise exception 'Only an owner can disable another administrator.' using errcode = '42501';
    end if;
    if public._other_owner_count(p_user) = 0 then
      raise exception 'There must always be at least one owner.' using errcode = '23514';
    end if;
  end if;
  -- end §49
  delete from public.user_active_sessions s where s.user_id = p_user;
  get diagnostics n = row_count;
  if p_disable then
    update public.studio_members m set disabled_at = now() where m.user_id = p_user;
  end if;
  perform public.admin_audit_write('terminate_session', 'user', p_user::text,
    jsonb_build_object('held_session', n > 0), jsonb_build_object('disabled', coalesce(p_disable, false)));
end;
$fn$;
revoke execute on function public.admin_terminate_session(uuid, boolean) from public, anon;
grant  execute on function public.admin_terminate_session(uuid, boolean) to authenticated;

-- 49.5 NO CROSS-USER ORACLE --------------------------------------------------
revoke execute on function public.user_plan(uuid)        from public, anon, authenticated;
revoke execute on function public.user_limits(uuid)      from public, anon, authenticated;
revoke execute on function public.is_entitled(uuid)      from public, anon, authenticated;
revoke execute on function public.is_studio_member(uuid) from public, anon, authenticated;
revoke execute on function public.account_plan(uuid)     from public, anon, authenticated;

-- 49.6 admin_create_invite: §46's body, plus the marked block --------------
create or replace function public.admin_create_invite(
  p_pass_type text default 'standard',
  p_max_redemptions int default 1,
  p_expires_at timestamptz default null,
  p_target_project uuid default null,
  p_label text default null
)
returns public.invite_codes
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $fn$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  v text;
  row public.invite_codes;
  i int;
begin
  if not public.is_studio_admin() then
    raise exception 'Administrators only' using errcode = '42501';
  end if;
  perform public.require_role(array['owner']);
  if p_pass_type = 'screening_pass' and p_expires_at is null then
    -- FR-103: a screening pass is time-limited by definition.
    raise exception 'A screening pass needs an expiry' using errcode = '22023';
  end if;
  -- §49: a screening pass shows a film's synced writing to whoever holds
  -- the code, so it is the film owner's decision, not the console's.
  if p_target_project is not null
     and not exists (select 1 from public.projects p where p.id = p_target_project and p.owner_id = auth.uid()) then
    raise exception 'A screening pass can only be made for a film you own.' using errcode = '42501';
  end if;
  -- end §49
  loop
    bytes := gen_random_bytes(12);
    v := '';
    for i in 0..11 loop
      v := v || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.invite_codes ic where ic.code = v);
  end loop;
  insert into public.invite_codes (code, pass_type, target_project_id, max_redemptions, expires_at, label, created_by)
  values (v, p_pass_type, p_target_project, greatest(1, p_max_redemptions), p_expires_at, left(p_label, 120), auth.uid())
  returning * into row;
  perform public.admin_audit_write('create_invite', 'invite', row.id::text, null,
    jsonb_build_object('pass_type', row.pass_type, 'max_redemptions', row.max_redemptions,
                       'expires_at', row.expires_at, 'target_project', row.target_project_id, 'label', row.label));
  return row;
end;
$fn$;
revoke execute on function public.admin_create_invite(text, int, timestamptz, uuid, text) from public, anon;
grant  execute on function public.admin_create_invite(text, int, timestamptz, uuid, text) to authenticated;

-- 49.7 enforce_collaborator_limit: on a move too -----------------------------
create or replace function public.enforce_collaborator_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare owner uuid; cap int; n int; pl text;
begin
  if public.is_privileged_caller() then return new; end if;
  -- §49: an UPDATE that keeps the film is not a new seat
  if tg_op = 'UPDATE' and new.project_id is not distinct from old.project_id then return new; end if;
  select p.owner_id into owner from public.projects p where p.id = new.project_id;
  pl  := public.user_plan(owner);
  cap := public.plan_cap(public.user_limits(owner), 'collaborators');
  if cap is null then return new; end if;
  select count(*) into n from public.project_collaborators pc where pc.project_id = new.project_id;
  if n >= cap then
    raise exception 'This film''s owner is on the % plan, which allows % collaborator% per film.',
      coalesce((select x.name from public.plans x where x.id = pl), initcap(pl)), cap, case when cap = 1 then '' else 's' end using errcode = 'P0402';
  end if;
  return new;
end;
$fn$;
drop trigger if exists collaborators_plan_limit on public.project_collaborators;
create trigger collaborators_plan_limit before insert or update of project_id on public.project_collaborators
  for each row execute function public.enforce_collaborator_limit();

-- 49.8 projects_guard_owner -----------------------------------------------
create or replace function public.projects_guard_owner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- §49: no feature hands a film to somebody else, and a hand-made request
  -- doing it planted the film on a stranger's count while the sender kept
  -- access through their team. The service role and SQL still can.
  if new.owner_id is distinct from old.owner_id and not public.is_privileged_caller() then
    raise exception 'A film cannot be handed to another account holder' using errcode = '42501';
  end if;
  if new.account_id is distinct from old.account_id then
    -- §49: detaching a film from a team its owner is no longer in (removed,
    -- left, or the team was deleted) is always allowed; it is how 49.14
    -- returns the film to its owner.
    if new.account_id is null
       and not exists (select 1 from public.account_members m
                        where m.account_id = old.account_id and m.user_id = old.owner_id and m.status = 'active')
       and not exists (select 1 from public.accounts a where a.id = old.account_id and a.owner_id = old.owner_id) then
      return new;
    end if;
    -- end §49
    if old.owner_id <> auth.uid() then
      raise exception 'Only the owner can move a project between accounts' using errcode = '42501';
    end if;
    -- and only into an account they are actually in
    if new.account_id is not null and public.account_role(new.account_id) is null then
      raise exception 'You are not a member of that account' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists projects_guard_owner on public.projects;
create trigger projects_guard_owner
  before update on public.projects
  for each row execute function public.projects_guard_owner();

-- 49.9 claim_share -----------------------------------------------------------
create or replace function public.share_role_rank(p_role text)
returns int language sql immutable set search_path = public, pg_temp as $$
  select case p_role when 'view' then 1 when 'comment' then 2 when 'edit' then 3 else 0 end;
$$;
revoke execute on function public.share_role_rank(text) from public, anon;
grant  execute on function public.share_role_rank(text) to authenticated;

create or replace function public.claim_share(p_token text)
returns table (project_id uuid, role text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s_record record;
begin
  if auth.uid() is null then
    raise exception 'Sign in required to claim share' using errcode = '42501';
  end if;
  select * into s_record from public.shares
  where token = p_token
    and (expires_at is null or expires_at > now())
  limit 1;
  if not found then
    raise exception 'Share is invalid or expired' using errcode = '22023';
  end if;

  -- §49: `on conflict (project_id, user_id)` was ambiguous with the
  -- RETURNS TABLE column project_id (42702 on every call); name the key.
  -- And the grant stays the property of the link that conferred its role:
  --   * a manual grant (via_share null) is the owner's and is never changed;
  --   * a lapsed link grant is replaced outright;
  --   * a HIGHER link replaces the grant with its own role, link and expiry;
  --   * an EQUAL link takes over only if it lasts longer;
  --   * a LOWER link changes nothing.
  insert into public.project_collaborators as pc (project_id, user_id, role, via_share, expires_at)
  values (s_record.project_id, auth.uid(), s_record.role, s_record.id, s_record.expires_at)
  on conflict on constraint project_collaborators_pkey do update set
    role       = case when pc.via_share is not null and (
                        (pc.expires_at is not null and pc.expires_at <= now())
                        or public.share_role_rank(excluded.role) > public.share_role_rank(pc.role)
                        or (public.share_role_rank(excluded.role) = public.share_role_rank(pc.role)
                            and pc.expires_at is not null
                            and (excluded.expires_at is null or excluded.expires_at > pc.expires_at)))
                      then excluded.role else pc.role end,
    via_share  = case when pc.via_share is not null and (
                        (pc.expires_at is not null and pc.expires_at <= now())
                        or public.share_role_rank(excluded.role) > public.share_role_rank(pc.role)
                        or (public.share_role_rank(excluded.role) = public.share_role_rank(pc.role)
                            and pc.expires_at is not null
                            and (excluded.expires_at is null or excluded.expires_at > pc.expires_at)))
                      then excluded.via_share else pc.via_share end,
    expires_at = case when pc.via_share is not null and (
                        (pc.expires_at is not null and pc.expires_at <= now())
                        or public.share_role_rank(excluded.role) > public.share_role_rank(pc.role)
                        or (public.share_role_rank(excluded.role) = public.share_role_rank(pc.role)
                            and pc.expires_at is not null
                            and (excluded.expires_at is null or excluded.expires_at > pc.expires_at)))
                      then excluded.expires_at else pc.expires_at end;
  -- end §49

  return query
    select s_record.project_id, c.role
    from public.project_collaborators c
    where c.project_id = s_record.project_id and c.user_id = auth.uid();
end;
$$;
grant execute on function public.claim_share(text) to authenticated;

-- 49.10 comments_guard ------------------------------------------------------
create or replace function public.comments_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  par record;
begin
  if tg_op = 'INSERT' then
    if new.parent_id is not null then
      select * into par from public.comments where id = new.parent_id;
      if not found
         or par.project_id is distinct from new.project_id
         or par.scope      is distinct from new.scope
         or par.field_key  is distinct from new.field_key then
        raise exception 'A reply must belong to the same field thread as the comment it answers'
          using errcode = '23514';
      end if;
      if par.parent_id is not null then
        raise exception 'Replies are one level deep' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE. What a thread is ABOUT never moves.
  new.project_id   := old.project_id;
  new.scope        := old.scope;
  new.field_key    := old.field_key;
  new.parent_id    := old.parent_id;
  new.created_at   := old.created_at;
  new.type         := old.type;
  new.suggest_from := old.suggest_from;
  new.suggest_to   := old.suggest_to;

  -- §49: the words are the author's. comments_set_author keeps the
  -- author's name on the row, so anybody else changing the body would be
  -- putting words in their mouth.
  if new.body is distinct from old.body
     and old.author_id is distinct from auth.uid()
     and not public.is_privileged_caller() then
    raise exception 'Only the author can change what a comment says' using errcode = '42501';
  end if;
  -- end §49

  if new.status is distinct from old.status
     and not public.has_project_access(new.project_id, 'edit') then
    raise exception 'Only someone who can edit this project may resolve a comment'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists comments_guard on public.comments;
create trigger comments_guard
  before insert or update on public.comments
  for each row execute function public.comments_guard();

-- 49.11 the orphaned policy -----------------------------------------------
drop policy if exists sh_owner_all on public.shares;

-- 49.12 start_trial: §48's body, plus the marked block ----------------------
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
  -- §49: an anonymous session has a uid but is not an account
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Sign in with Google to start a trial' using errcode = '42501';
  end if;
  -- end §49

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
revoke execute on function public.start_trial(text) from public, anon;
grant  execute on function public.start_trial(text) to authenticated;

-- 49.13 the sweep's index -------------------------------------------------
create index if not exists invite_tickets_expires_idx on public.invite_tickets(expires_at);

-- 49.14 A TEAM NEVER TAKES A MEMBER'S FILM ----------------------------------
alter table public.projects drop constraint if exists projects_account_id_fkey;
alter table public.projects add constraint projects_account_id_fkey
  foreign key (account_id) references public.accounts(id) on delete set null;

create or replace function public.account_members_release_films()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- a seat that stops being active (removed, revoked, left) takes its
  -- holder's films out of the team; projects_guard_owner allows exactly
  -- this detach (the owner is no longer in the account)
  if old.user_id is not null and old.status = 'active'
     and (tg_op = 'DELETE' or new.status is distinct from 'active') then
    update public.projects p set account_id = null
     where p.account_id = old.account_id and p.owner_id = old.user_id
       and not exists (select 1 from public.accounts a where a.id = old.account_id and a.owner_id = old.user_id);
  end if;
  return null;
end;
$$;
revoke execute on function public.account_members_release_films() from public, anon, authenticated;
drop trigger if exists account_members_release_films on public.account_members;
create trigger account_members_release_films
  after delete or update of status on public.account_members
  for each row execute function public.account_members_release_films();

-- 49.15 A REFERRAL CODE FORGETS A DELETED OWNER ------------------------------
create or replace function public.promo_codes_forget_owner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.owner_user_id is not null and new.owner_user_id is null and new.kind = 'referral' then
    new.note := 'Referral: deleted account';
    new.active := false;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke execute on function public.promo_codes_forget_owner() from public, anon, authenticated;
drop trigger if exists promo_codes_forget_owner on public.promo_codes;
create trigger promo_codes_forget_owner
  before update of owner_user_id on public.promo_codes
  for each row execute function public.promo_codes_forget_owner();
update public.promo_codes c
   set note = 'Referral: deleted account', active = false, updated_at = now()
 where c.kind = 'referral' and c.owner_user_id is null
   and c.note is distinct from 'Referral: deleted account';

notify pgrst, 'reload schema';

-- 49.16 CHECKS TO RUN LIVE (read-only) --------------------------------------
--  1. select count(*) from public.payments where paid_at is not null and period = 'lifetime' and plan_applied is null;  -> 0
--  2. select has_function_privilege('authenticated', 'public.user_plan(uuid)', 'execute');  -> false
--     (and the same for user_limits, is_entitled, is_studio_member, account_plan)
--  3. select tgtype from pg_trigger where tgname = 'collaborators_plan_limit';  -> 23 (insert or update)
--  4. select confdeltype from pg_constraint where conname = 'projects_account_id_fkey';  -> 'n' (set null)
--  5. select count(*) from pg_policies where tablename = 'shares' and policyname = 'sh_owner_all';  -> 0
--  6. select count(*) from public.promo_codes where kind = 'referral' and owner_user_id is null and note like '%@%';  -> 0
--  7. Open a share link signed in as a second test account: it is claimed
--     (before §49 every claim answered 42702 "column reference is ambiguous").
-- Test files: scripts/schema-tests/security-49-seed.sql (before the first
-- load) and security-49.sql (npm run test:schema).
-- END OF SECTION 49
-- ============================================================
