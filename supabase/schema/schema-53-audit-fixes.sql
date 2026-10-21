-- ============================================================
-- 53. BILLING AUDIT FIXES — credit per organisation, a refused payment
--     that was captured, a refund whose answer never came back
-- ------------------------------------------------------------
-- 21 Oct 2026, from the audit (bugs 5, 8, 9 and 10). Run AFTER §52: it
-- restates §52's quote_for / create_pending_payment / activate_payment /
-- paid_credit_paise / mark_payment_refunded, §51's begin_refund, §50's
-- record_refund and §33's billing_status. Then redeploy rzp-verify and
-- rzp-refund with the CLI (docs/BILLING.md §21). The deployed functions
-- keep working in between: nothing they call changes its arguments.
--
--  53.1 UPGRADE CREDIT IS THE TARGET ORGANISATION'S (bug 10). Up to §52,
--       paid_credit_paise() added up the unused year of EVERY organisation
--       the buyer owned, and quote_for() never asked which one the plan
--       would land on. So Pro bought for an empty organisation B was
--       priced as an upgrade from organisation A's Basic year, and A kept
--       Basic; B's year (paid + credit) then counted A's credit a second
--       time toward a third organisation. Now the target is resolved ONCE
--       (buyer_target_account: the one named, else the one holding the
--       buyer's best plan, else the newest), the quote reads that
--       organisation's plan and end date, the credit counts only payments
--       on it, and create_pending_payment STORES it on the row, so the
--       order is applied to the organisation it was priced for. The same
--       default fixes the renewal that was quoted against A's year and
--       then stacked onto a newer, empty B.
--
--  53.2 A PAYMENT REFUSED AFTER CAPTURE IS RECORDED (bug 8). activate_
--       payment raised 22023 for a promo code used up, or a credit gone,
--       after Razorpay had the money: the raise rolled the row back to
--       'created' with no Razorpay payment id, so request_refund() and
--       begin_refund() both refused it and a dashboard refund could not be
--       matched. Two halves:
--         * payment_can_activate(order): the same two checks, asked by
--           rzp-verify BEFORE it captures an authorised payment, so the
--           common case never collects the money at all;
--         * activate_payment no longer raises for them. The payment is
--           recorded 'paid' with its Razorpay id, plan_applied = false and
--           payments.unapplied_reason, so both refund paths accept it and
--           record_refund matches a refund made in the dashboard.
--       mark_payment_refunded takes no time off for a payment that applied
--       no plan (it would otherwise end the year another payment bought).
--
--  53.3 A REFUND WITH NO ANSWER KEEPS ITS KEY (bug 9). rzp-refund recorded
--       'failed' when the call to Razorpay threw, which allowed a retry
--       under a NEW idempotency key — a second refund if the first had in
--       fact been made. rzp-refund now leaves such a row 'initiated'; here
--       begin_refund hands that same row back to a retry made a minute or
--       more later (same id = same X-Refund-Idempotency and receipt), and
--       record_refund matches a webhook to its row by the receipt.
--
--  53.4 billing_status() keeps plan_until after a lapse (bug 5, server
--       half): a lapsed account reads plan 'free', and plan_until was only
--       returned for a paid plan, so the page said a year "ended" on
--       1 Jan 1970.
-- ============================================================

-- 53.0 why a captured payment applied no plan ---------------------------------
alter table public.payments add column if not exists unapplied_reason text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payments_unapplied_reason_check') then
    alter table public.payments add constraint payments_unapplied_reason_check
      check (unapplied_reason is null or unapplied_reason in ('exhausted', 'credit_gone'));
  end if;
end $$;

-- 53.1a the organisation an order is for ----------------------------------
/** Where a purchase lands, without creating anything (so a STABLE quote
 *  can call it): the organisation named, if the buyer owns it; else the
 *  one holding the buyer's best current plan (what user_plan() reads, so
 *  a renewal or upgrade lands on the year it extends); else the one that
 *  last held a plan; else the newest. Null when the buyer owns none —
 *  account_for_buyer() makes one at activation. */
create or replace function public.buyer_target_account(p_user uuid, p_account uuid default null)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select a.id from public.accounts a where p_account is not null and a.id = p_account and a.owner_id = p_user),
    (select a.id from public.accounts a where a.owner_id = p_user
      order by public.plan_rank(public.account_plan(a.id)) desc, (a.plan <> 'free') desc,
               a.plan_until desc nulls last, a.created_at desc
      limit 1));
$$;
revoke execute on function public.buyer_target_account(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.buyer_target_account(uuid, uuid) to service_role;

-- 53.1b paid_credit_paise: one organisation's unused year ---------------------
drop function if exists public.paid_credit_paise(uuid);
/** §52's sum, for ONE organisation: each paid year of the plan that
 *  organisation is on now, its value (paid + the credit it was priced
 *  with) times the share not yet used. Credit only ever moves within an
 *  organisation, so a year's value never counts toward a second one. */
create or replace function public.paid_credit_paise(p_user uuid, p_account uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(floor(sum(
           (p.amount_paise + coalesce(p.credit_paise, 0))::numeric
           * greatest(0, least(1,
               extract(epoch from (p.ends_at - greatest(now(), p.starts_at)))
               / nullif(extract(epoch from (p.ends_at - p.starts_at)), 0)))
         )), 0)::int
    from public.payments p
    join public.accounts a on a.id = p.account_id and a.owner_id = p_user
   where p_account is not null and p.account_id = p_account
     and p.user_id = p_user and p.status = 'paid' and p.period = 'year'
     and p.plan_applied is not false
     and p.plan_id = a.plan
     and p.starts_at is not null and p.ends_at is not null and p.ends_at > now();
$$;
revoke execute on function public.paid_credit_paise(uuid, uuid) from public, anon, authenticated;

-- 53.1c quote_for: priced for the organisation it lands on -----------------
-- A fourth argument with a default cannot sit beside the three-argument
-- form (every three-argument call would be ambiguous), so that one goes.
drop function if exists public.quote_for(uuid, text, text);
create or replace function public.quote_for(p_user uuid, p_plan text, p_code text default null, p_account uuid default null)
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
  renew  boolean := false;
  cur_until timestamptz;
  tgt    uuid;
begin
  select * into pl from public.plans p where p.id = p_plan and p.active;
  price := public.effective_price(p_plan);
  if pl.id is null or coalesce(price, 0) <= 0 then
    raise exception 'That plan is not for sale' using errcode = '22023';
  end if;
  if p_user is not null then
    -- §53: the target organisation's plan, not the best across all of them
    tgt := public.buyer_target_account(p_user, p_account);
    if tgt is not null then
      cur := coalesce(public.account_plan(tgt), 'free');
      select a.plan_until into cur_until from public.accounts a where a.id = tgt;
    end if;
    if cur <> 'free' then
      if cur = pl.id then
        if cur_until is null then
          raise exception 'You have % for good. There is nothing to renew.', pl.name using errcode = '22023', hint = 'same_plan';
        end if;
        renew := true;
      elsif public.plan_rank(pl.id) < public.plan_rank(cur) then
        raise exception 'Your % year runs until %. A lower plan can be bought when it ends.',
          coalesce((select x.name from public.plans x where x.id = cur), initcap(cur)),
          coalesce(to_char(cur_until, 'FMDD Mon YYYY'), 'its end') using errcode = '22023', hint = 'downgrade';
      else
        credit := public.paid_credit_paise(p_user, tgt);   -- §53: that organisation's year only
      end if;
    end if;
  end if;
  due := price - credit;
  if due < 100 then due := least(price, 100); end if;
  base := jsonb_build_object('plan_id', pl.id, 'list_paise', price, 'credit_paise', price - due,
                             'due_paise', due, 'amount_paise', due, 'discount_paise', 0, 'code', v_code,
                             'ok', true, 'reason', null, 'sentence', null,
                             'period', 'year', 'days', 365,
                             'renewal', renew,
                             'current_until', cur_until,
                             'account_id', tgt,
                             'upgrade_from', case when credit > 0 then cur end,
                             'upgrade_from_name', case when credit > 0 then (select x.name from public.plans x where x.id = cur) end,
                             'paid_paise', credit,
                             'next_price_paise', case when price = pl.price_paise then pl.next_price_paise end,
                             'next_price_at',    case when price = pl.price_paise then pl.next_price_at end);
  if v_code is null then return base; end if;
  select * into pc from public.promo_codes c where c.code = v_code;
  if pc.code is not null and pc.max_uses is not null then
    select count(distinct x.user_id)::int into held
      from public.payments x
     where x.promo_code = pc.code and x.status = 'created'
       and x.created_at > now() - interval '60 minutes'
       and x.user_id is distinct from p_user;
  end if;
  reason := case
    when pc.code is null                                                   then 'unknown'
    when pc.kind = 'gift'                                                  then 'gift'
    when not pc.active                                                     then 'inactive'
    when pc.valid_from is not null and pc.valid_from > now()               then 'inactive'
    when pc.valid_until is not null and pc.valid_until <= now()            then 'expired'
    when pc.max_uses is not null and pc.uses + held >= pc.max_uses         then 'exhausted'
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
revoke execute on function public.quote_for(uuid, text, text, uuid) from public, anon, authenticated;

/** The cards' quote (§21), unchanged, re-made so it binds to the new
 *  quote_for: no organisation named = the one holding the plan. */
create or replace function public.quote_order(p_plan text, p_code text default null)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.quote_for(auth.uid(), p_plan, p_code, null);
$$;
revoke execute on function public.quote_order(text, text) from public;
grant  execute on function public.quote_order(text, text) to anon, authenticated;

-- 53.1d create_pending_payment: the target is decided here, and kept ---------
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
  tgt uuid;
begin
  perform public.billing_require_service();
  if exists (select 1 from public.studio_members m where m.user_id = p_user and m.disabled_at is not null) then
    raise exception 'This account has been disabled by an administrator' using errcode = '42501';
  end if;
  if coalesce(p_period, 'year') not in ('year', 'lifetime') then
    raise exception 'Plans are bought a year at a time' using errcode = '22023';
  end if;
  select * into pl from public.plans p where p.id = p_plan and p.active;
  if pl.id is null or coalesce(pl.price_paise, 0) <= 0 then raise exception 'That plan is not for sale' using errcode = '22023'; end if;
  if p_account is not null and not exists (select 1 from public.accounts a where a.id = p_account and a.owner_id = p_user) then
    raise exception 'Not the owner of that organisation' using errcode = '42501';
  end if;
  perform 1 from public.promo_codes c
   where c.code = nullif(upper(regexp_replace(coalesce(p_code, ''), '\s+', '', 'g')), '')
     for update;
  -- §53: priced for, and recorded against, one organisation
  tgt := public.buyer_target_account(p_user, p_account);
  q := public.quote_for(p_user, p_plan, p_code, tgt);
  if not (q ->> 'ok')::boolean then
    raise exception '%', q ->> 'sentence' using errcode = '22023', hint = q ->> 'reason';
  end if;
  insert into public.payments (user_id, account_id, plan_id, period, amount_paise, list_paise, discount_paise, promo_code, credit_paise)
  values (p_user, tgt, p_plan, 'year', (q ->> 'amount_paise')::int, (q ->> 'list_paise')::int,
          (q ->> 'discount_paise')::int, q ->> 'code', (q ->> 'credit_paise')::int)
  returning id into pid;
  return query select pid, (q ->> 'amount_paise')::int, 'INR'::text, pl.name, (q ->> 'list_paise')::int,
                      (q ->> 'discount_paise')::int, q ->> 'code', (q ->> 'credit_paise')::int;
end;
$fn$;
revoke execute on function public.create_pending_payment(uuid, text, text, uuid, text) from public, anon, authenticated;

-- 53.2a the two refusals, asked before the money and at activation -------------
/** Why this order can no longer be applied as priced, or null. The
 *  promo code's row should already be locked by the caller when it acts
 *  on the answer (activate_payment does). */
create or replace function public.activation_refusal(p_pay public.payments, p_account uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare pc public.promo_codes;
begin
  if p_pay.promo_code is not null then
    select * into pc from public.promo_codes c where c.code = p_pay.promo_code;
    if pc.max_uses is not null and pc.uses >= pc.max_uses then return 'exhausted'; end if;
  end if;
  -- §52's slack: the credit shrinks by the minute; an order is good for an hour
  if coalesce(p_pay.credit_paise, 0) > 0
     and p_pay.credit_paise > public.paid_credit_paise(p_pay.user_id, p_account) + greatest(100, p_pay.credit_paise / 50) then
    return 'credit_gone';
  end if;
  return null;
end;
$fn$;
revoke execute on function public.activation_refusal(public.payments, uuid) from public, anon, authenticated;

/** The buyer's sentence for a refusal (rzp-verify adds whether money moved). */
create or replace function public.unapplied_sentence(p_reason text, p_code text default null)
returns text
language sql
immutable
as $$
  select case p_reason
    when 'exhausted'   then format('The code %s was used up before this payment was confirmed, so the plan was not applied.', coalesce(p_code, 'on this order'))
    when 'credit_gone' then 'This order was priced with credit for a payment that no longer counts, so the plan was not applied.'
    else 'This order can no longer be applied.'
  end;
$$;
revoke execute on function public.unapplied_sentence(text, text) from public, anon, authenticated;
grant  execute on function public.unapplied_sentence(text, text) to service_role;

/** rzp-verify, BEFORE it captures an authorised payment: would activation
 *  apply this order? { ok, reason, sentence, already }. Not capturing is
 *  the whole refund: Razorpay releases an uncaptured authorisation. */
create or replace function public.payment_can_activate(p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare pay public.payments; why text;
begin
  perform public.billing_require_service();
  select * into pay from public.payments p where p.razorpay_order_id = p_order_id;
  if pay.id is null then return jsonb_build_object('ok', false, 'reason', 'unknown_order', 'sentence', 'No such order.'); end if;
  if pay.status = 'paid' then return jsonb_build_object('ok', true, 'already', true); end if;
  if pay.status not in ('created', 'failed') then
    return jsonb_build_object('ok', false, 'reason', pay.status, 'sentence', format('This order is %s.', pay.status));
  end if;
  why := public.activation_refusal(pay, public.buyer_target_account(pay.user_id, pay.account_id));
  return jsonb_build_object('ok', why is null, 'reason', why,
                            'sentence', case when why is not null then public.unapplied_sentence(why, pay.promo_code) end);
end;
$fn$;
revoke execute on function public.payment_can_activate(text) from public, anon, authenticated;
grant  execute on function public.payment_can_activate(text) to service_role;

-- 53.2b activate_payment: a refusal after capture is RECORDED, not rolled back ----
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
  why   text;
  applied boolean;
  until timestamptz;
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
  if pay.promo_code is not null then
    perform 1 from public.promo_codes c where c.code = pay.promo_code for update;
  end if;
  -- §53: the organisation the order was priced for (stored since §53;
  -- an order from before it resolves the same way the quote did)
  acc := coalesce(public.buyer_target_account(pay.user_id, pay.account_id), public.account_for_buyer(pay.user_id, null));
  why := public.activation_refusal(pay, acc);
  -- §52: the same plan (a renewal) or a higher one applies; a lower one
  -- (bought in a race with an upgrade) does not. §53: nor one refused above.
  applied := why is null and public.plan_rank(pay.plan_id) >= public.plan_rank(public.account_plan(acc));
  if applied then
    until := public.apply_plan(acc, pay.plan_id, 'year', 365);
  end if;
  update public.payments p
     set status = 'paid', razorpay_payment_id = p_payment_id, paid_at = now(),
         account_id = acc,
         starts_at = case when applied then until - interval '365 days' else now() end,
         ends_at   = case when applied then until end,
         period = 'year',
         raw = coalesce(p_raw, p.raw),
         plan_applied = applied,
         unapplied_reason = why
   where p.id = pay.id;
  -- a code is spent only by a payment that honoured it
  if pay.promo_code is not null and why is null then
    update public.promo_codes c set uses = c.uses + 1, updated_at = now() where c.code = pay.promo_code;
  end if;
  insert into public.studio_members (user_id, role) values (pay.user_id, 'user') on conflict (user_id) do nothing;
  return query select pay.id, acc, pay.plan_id, until, false;
end;
$fn$;
revoke execute on function public.activate_payment(text, text, jsonb) from public, anon, authenticated;

-- 53.2c mark_payment_refunded: a payment that applied no plan takes none away ----
create or replace function public.mark_payment_refunded(p_payment_id text, p_raw jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  pay  public.payments;
  free_seats int := greatest(1, coalesce(public.plan_cap((select p.limits from public.plans p where p.id = 'free'), 'seats'), 1000));
begin
  perform public.billing_require_service();
  select * into pay from public.payments p where p.razorpay_payment_id = p_payment_id for update;
  if pay.id is null or pay.status = 'refunded' then return; end if;
  update public.payments p set status = 'refunded', raw = coalesce(p_raw, p.raw) where p.id = pay.id;
  if pay.account_id is null then return; end if;
  -- §53: it bought no time (a code used up, a credit gone, a lower plan in
  -- a race), so refunding it must not shorten the year another payment bought
  if pay.plan_applied is false then return; end if;
  perform set_config('fms.billing', 'on', true);
  if pay.starts_at is not null and pay.ends_at is not null and pay.ends_at > pay.starts_at then
    update public.accounts a
       set plan_until = greatest(now(), a.plan_until - (pay.ends_at - pay.starts_at)),
           updated_at = now()
     where a.id = pay.account_id and a.plan = pay.plan_id and a.plan_until is not null;
  else
    update public.accounts a set plan_until = least(a.plan_until, now()), updated_at = now()
     where a.id = pay.account_id and a.plan = pay.plan_id;
  end if;
  update public.accounts a set seat_limit = least(a.seat_limit, free_seats)
   where a.id = pay.account_id and a.plan = pay.plan_id and a.plan_until is not null and a.plan_until <= now();
end;
$fn$;
revoke execute on function public.mark_payment_refunded(text, jsonb) from public, anon, authenticated;

-- 53.3a begin_refund: §51's body; an unanswered refund is handed back ----------
create or replace function public.begin_refund(p_payment uuid, p_amount int, p_reason text, p_admin uuid, p_request uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare pay public.payments; amt int; f public.refunds; q public.refund_requests; em text; later public.payments; stuck public.refunds;
begin
  perform public.billing_require_service();
  if p_admin is null
     or not exists (select 1 from public.studio_members m
                     where m.user_id = p_admin and m.role = 'admin' and m.disabled_at is null)
     or coalesce((select r.role from public.admin_roles r where r.user_id = p_admin), 'owner') not in ('owner','finance') then
    raise exception 'Only an owner or a finance administrator can refund a payment.' using errcode = '42501';
  end if;
  select * into pay from public.payments p where p.id = p_payment for update;
  if pay.id is null then raise exception 'No such payment' using errcode = '22023'; end if;
  if pay.status = 'refunded' then raise exception 'That payment has already been refunded' using errcode = '22023'; end if;
  if pay.status <> 'paid' or pay.razorpay_payment_id is null or pay.amount_paise <= 0 then
    raise exception 'Only a captured payment can be refunded (this one is %)', pay.status using errcode = '22023';
  end if;
  -- §53: a refund sent and never answered (rzp-refund leaves it
  -- 'initiated' rather than guessing 'failed'). A retry a minute or more
  -- later gets the SAME row back: its id is the X-Refund-Idempotency key
  -- and the receipt, so Razorpay answers with the refund it already made
  -- or makes it now, and never makes a second one.
  select * into stuck from public.refunds r
   where r.payment_id = pay.id and r.status = 'initiated' and r.razorpay_refund_id is null
   order by r.created_at limit 1;
  if stuck.id is not null then
    if stuck.created_at > now() - interval '1 minute' then
      raise exception 'A refund for that payment is already in progress' using errcode = '22023', hint = 'in_flight';
    end if;
    if p_amount is not null and p_amount <> stuck.amount_paise then
      raise exception 'An earlier refund of % paise has had no answer from Razorpay. Retry that amount, or check the Razorpay dashboard first.', stuck.amount_paise
        using errcode = '22023', hint = 'unresolved';
    end if;
    select u.email::text into em from auth.users u where u.id = pay.user_id;
    return jsonb_build_object('refund_id', stuck.id, 'razorpay_payment_id', pay.razorpay_payment_id, 'amount_paise', stuck.amount_paise,
                              'email', em, 'plan_id', pay.plan_id, 'reused', true);
  end if;
  -- end §53
  if exists (select 1 from public.refunds r where r.payment_id = pay.id and r.status in ('initiated','pending','processed')) then
    raise exception 'A refund for that payment is already in progress' using errcode = '22023';
  end if;
  -- §51: refund a later upgrade first. §53: only an upgrade that applied
  -- (an unapplied one took no credit from anything).
  if pay.plan_applied is not false then
    select * into later from public.payments x
     where x.user_id = pay.user_id and x.id <> pay.id and x.status = 'paid'
       and x.credit_paise > 0 and x.plan_applied is not false and x.paid_at >= pay.paid_at
     order by x.paid_at limit 1;
    if later.id is not null then
      raise exception 'This payment was credited toward a later upgrade (%, paid %). Refund that payment first.',
        later.plan_id, to_char(later.paid_at, 'YYYY-MM-DD') using errcode = '22023', hint = 'credited';
    end if;
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
revoke execute on function public.begin_refund(uuid, int, text, uuid, uuid) from public, anon, authenticated;

-- 53.3b record_refund: §50's body; a webhook finds its row by the receipt -------
create or replace function public.record_refund(p_refund uuid, p_payment_rzp text, p_rzp_refund text, p_status text, p_amount int, p_error text default null, p_raw jsonb default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare f public.refunds; pay public.payments; rcpt text;
begin
  perform public.billing_require_service();
  if p_status not in ('pending','processed','failed') then raise exception 'Unknown refund status' using errcode = '22023'; end if;
  select * into f from public.refunds r where (p_refund is not null and r.id = p_refund) or (p_rzp_refund is not null and r.razorpay_refund_id = p_rzp_refund)
   order by (r.id = p_refund) desc nulls last limit 1 for update;
  -- §53: the webhook knows the refund only by Razorpay's id; the receipt
  -- it carries is the console's own refunds row id (rzp-refund sends it).
  -- That row has no Razorpay id yet when rzp-refund never heard back.
  if f.id is null then
    rcpt := coalesce(p_raw -> 'refund' ->> 'receipt', p_raw ->> 'receipt');
    if rcpt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select r.* into f from public.refunds r join public.payments p on p.id = r.payment_id
       where r.id = rcpt::uuid and p.razorpay_payment_id = p_payment_rzp and r.razorpay_refund_id is null
       for update of r;
    end if;
  end if;
  -- end §53
  if f.id is null then
    select * into pay from public.payments p where p.razorpay_payment_id = p_payment_rzp;
    if pay.id is null or p_rzp_refund is null or coalesce(p_amount, 0) < 1 then return; end if;
    insert into public.refunds (payment_id, razorpay_refund_id, amount_paise, status, reason, processed_at, raw)
    values (pay.id, p_rzp_refund, p_amount, p_status, 'Made in the Razorpay dashboard', case when p_status = 'processed' then now() end, p_raw)
    returning * into f;
  else
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
  select * into pay from public.payments p where p.id = f.payment_id;
  if pay.status = 'refunded' then
    update public.refund_requests q set status = 'refunded', decided_at = coalesce(q.decided_at, now()),
           decided_by = coalesce(q.decided_by, f.refunded_by)
     where (q.id = f.request_id or q.payment_id = pay.id) and q.status in ('pending','approved');
  elsif p_status = 'pending' and f.request_id is not null then
    update public.refund_requests q set status = 'approved', decided_at = coalesce(q.decided_at, now()),
           decided_by = coalesce(q.decided_by, f.refunded_by)
     where q.id = f.request_id and q.status = 'pending';
  end if;
end;
$fn$;
revoke execute on function public.record_refund(uuid, text, text, text, int, text, jsonb) from public, anon, authenticated;

-- 53.4 billing_status(): §33's body; plan_until survives a lapse ----------------
create or replace function public.billing_status()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $fn$
declare
  uid    uuid := auth.uid();
  pl     text;
  acc    public.accounts;
  lim    jsonb;
  s      public.billing_settings;
  m      public.studio_members;
  t_ends timestamptz;
  t_on   boolean;
  feat   jsonb;
  req    boolean;
  g_on   boolean;
  lapsed boolean;
begin
  if uid is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  pl := public.user_plan(uid);
  select * into acc from public.accounts a where a.owner_id = uid
   order by public.plan_rank(public.account_plan(a.id)) desc, a.plan_until desc nulls last limit 1;
  lim := public.user_limits(uid);
  select * into s from public.billing_settings x where x.id;
  select * into m from public.studio_members x where x.user_id = uid;
  t_ends := public.trial_ends_at(uid);
  t_on   := public.trial_active(uid);
  req    := coalesce(s.purchase_required, false);
  g_on   := pl = 'free' and public.email_grant_active(uid);
  lapsed := acc.plan is not null and acc.plan <> 'free' and acc.plan_until is not null and acc.plan_until <= now();

  feat := coalesce((select p.features from public.plans p where p.id = pl), '{}'::jsonb);
  if t_on and m.trial_scope = 'full' and pl = 'free' then
    feat := coalesce((select p.features from public.plans p
                       where p.id = coalesce(s.trial_plan, 'indie')), '{}'::jsonb);
  end if;
  if not req or g_on then
    feat := public.open_features();
  end if;

  return jsonb_build_object(
    'plan',        pl,
    'plan_name',   (select name from public.plans where id = pl),
    'limits',      lim,
    'features',    feat,
    'account_id',  acc.id,
    'account_name', acc.name,
    -- §53: a lapsed year still says when it ended (it read null, and the
    -- page printed the epoch)
    'plan_until',  case when pl <> 'free' or lapsed then acc.plan_until end,
    'bought_plan', acc.plan,
    'lapsed',      lapsed,
    'disabled',    exists (select 1 from public.studio_members x where x.user_id = uid and x.disabled_at is not null),
    'member',      exists (select 1 from public.studio_members x where x.user_id = uid and x.disabled_at is null),
    'trial_enabled', coalesce(s.trial_enabled, false),
    'trial_active',  t_on,
    'trial_ends_at', t_ends,
    'trial_minutes', coalesce(s.trial_minutes, 30),
    'trial_used',    m.trial_started_at is not null,
    'trial_source',  m.trial_source,
    'trial_scope',   case when t_on then m.trial_scope end,
    'entitled',      (not req) or (pl <> 'free') or t_on or g_on,
    'purchase_required', req,
    'trial_hours',   round(coalesce(s.trial_minutes, 30) / 60.0, 2),
    'server_now',    now(),
    'granted',       g_on,
    'usage', jsonb_build_object(
      'projects',      (select count(*) from public.projects p where p.owner_id = uid),
      'shares',        (select count(*) from public.shares sh join public.projects p on p.id = sh.project_id
                         where p.owner_id = uid and (sh.expires_at is null or sh.expires_at > now())),
      'collaborators', (select coalesce(max(c), 0) from (select count(*) c from public.project_collaborators pc
                         join public.projects p on p.id = pc.project_id where p.owner_id = uid group by pc.project_id) t),
      'seats',         (select count(*) from public.account_members am where am.account_id = acc.id and am.status in ('pending','active'))
    ),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'plan_id', x.plan_id, 'period', x.period,
                   'amount_paise', x.amount_paise, 'status', x.status, 'created_at', x.created_at, 'ends_at', x.ends_at)
                   order by x.created_at desc)
                  from (select * from public.payments q where q.user_id = uid order by q.created_at desc limit 12) x), '[]'::jsonb)
  );
end;
$fn$;
revoke execute on function public.billing_status() from public, anon;
grant  execute on function public.billing_status() to authenticated;

notify pgrst, 'reload schema';

-- 53.5 CHECKS TO RUN LIVE (read-only) ------------------------------------------
-- select pg_get_function_identity_arguments('public.quote_for'::regproc);            -> p_user uuid, p_plan text, p_code text, p_account uuid
-- select count(*) from pg_proc where proname = 'paid_credit_paise';                  -> 1 (the two-argument form)
-- select public.unapplied_sentence('credit_gone');                                    -> the sentence
-- select conname from pg_constraint where conname = 'payments_unapplied_reason_check'; -> one row
